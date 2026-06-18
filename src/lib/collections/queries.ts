import { prisma, isUniqueViolation } from '@/lib/db';
import { generatePublicSlug } from '@/lib/tree/public-slug';

/**
 * A Prisma client OR an interactive-transaction client (`tx`). The cycle guard
 * and item insert accept this so the items POST route can thread a single `tx`
 * through both — making the check and the insert atomic (TOCTOU-safe).
 */
type PrismaLike = typeof prisma | Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** DB `TreeVisibility` enum values (mirrors prisma/schema.prisma). */
export type TreeVisibility = 'private' | 'public_link' | 'public_listed';

// ===========================================================================
// Collections — data-access helpers + the pure recursion guards (Lane A).
//
// SECURITY rule 4: EVERY recursive walk over nesting MUST enforce three caps —
// a cycle guard, a max-nesting-depth cap, and a max-item (node) cap. Both
// `detectCollectionCycle` (write-path guard) and any traversal added later go
// through the same bounded walk below.
// ===========================================================================

/** Hard cap on how deep collection-in-collection nesting may go. */
export const MAX_NESTING_DEPTH = 5;

/** Hard cap on total nodes any single recursive walk may visit. */
export const MAX_ITEMS = 500;

// ---------------------------------------------------------------------------
// Pure recursion guards (unit-tested without a DB)
// ---------------------------------------------------------------------------

/**
 * Adjacency lookup: given a collection id, return the child-collection ids it
 * directly nests (the `childCollectionId` of its `kind:'collection'` items).
 * Synchronous so the cycle check is a pure, fully-testable function; the
 * DB-backed wrapper pre-loads the edge map before calling.
 */
export type CollectionChildEdges = (collectionId: string) => string[];

/**
 * Returns true when nesting `candidateChildId` under `parentId` WOULD be
 * unsafe — i.e. it creates a cycle, or the candidate's subtree breaches
 * MAX_NESTING_DEPTH or MAX_ITEMS. Returns false when the nesting is safe.
 *
 * Unsafe cases:
 *  - self-nesting (candidate === parent)
 *  - the candidate's descendant set already contains the parent (back-edge)
 *  - the candidate subtree is deeper than MAX_NESTING_DEPTH
 *  - the candidate subtree visits more than MAX_ITEMS nodes
 *
 * The walk is bounded twice over (visited-set + MAX_ITEMS) so a pre-existing
 * cycle in the stored data can never spin forever.
 */
export function detectCollectionCycle(
  parentId: string,
  candidateChildId: string,
  getChildIds: CollectionChildEdges,
): boolean {
  // Self-nesting is always a cycle.
  if (parentId === candidateChildId) return true;

  const visited = new Set<string>();
  // BFS over the candidate's descendant subtree, tracking depth.
  let frontier: string[] = [candidateChildId];
  let depth = 1;

  while (frontier.length > 0) {
    // Nesting the candidate under the parent adds one level above this depth.
    if (depth + 1 > MAX_NESTING_DEPTH) return true;

    const next: string[] = [];
    for (const id of frontier) {
      if (visited.has(id)) continue;
      visited.add(id);
      if (visited.size > MAX_ITEMS) return true;

      // If the candidate subtree reaches the parent, nesting closes a loop.
      if (id === parentId) return true;

      for (const child of getChildIds(id)) {
        next.push(child);
      }
    }
    frontier = next;
    depth += 1;
  }

  return false;
}

/** Where an item's effective visibility is computed FROM (live, never stored). */
export type EffectiveVisibilitySource =
  | { kind: 'tree'; treeVisibility: TreeVisibility | null }
  | { kind: 'branchPointer'; sourceVisibility: TreeVisibility | null }
  | { kind: 'collection'; childVisibility: TreeVisibility | null };

/**
 * Effective visibility of a collection item, computed LIVE from its single
 * source. Deny-by-default: a null/unknown source resolves to `private` so a
 * broken link can never leak into a public collection (SECURITY: private wins).
 */
export function resolveEffectiveVisibility(
  source: EffectiveVisibilitySource,
): TreeVisibility {
  switch (source.kind) {
    case 'tree':
      return source.treeVisibility ?? 'private';
    case 'branchPointer':
      return source.sourceVisibility ?? 'private';
    case 'collection':
      return source.childVisibility ?? 'private';
    default:
      return 'private';
  }
}

/**
 * Top-level filter: keep only collections that are NOT nested under any other
 * collection (i.e. not referenced by any `CollectionItem.childCollectionId`).
 */
export function filterTopLevelCollections<T extends { id: string }>(
  collections: T[],
  referencedChildIds: Set<string>,
): T[] {
  return collections.filter((c) => !referencedChildIds.has(c.id));
}

// ---------------------------------------------------------------------------
// Collection CRUD (DB-backed)
// ---------------------------------------------------------------------------

export async function createCollection(input: {
  workspaceId: string;
  titleAr: string;
  descriptionAr?: string | null;
  createdById: string;
}) {
  return prisma.collection.create({
    data: {
      workspaceId: input.workspaceId,
      titleAr: input.titleAr,
      descriptionAr: input.descriptionAr ?? null,
      createdById: input.createdById,
    },
  });
}

export async function getCollection(workspaceId: string, collectionId: string) {
  return prisma.collection.findFirst({
    where: { id: collectionId, workspaceId },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  });
}

export async function updateCollection(
  workspaceId: string,
  collectionId: string,
  data: { titleAr?: string; descriptionAr?: string | null },
) {
  // Scope the update by workspaceId via updateMany so a foreign id can't be hit.
  const result = await prisma.collection.updateMany({
    where: { id: collectionId, workspaceId },
    data,
  });
  if (result.count === 0) return null;
  return prisma.collection.findUnique({ where: { id: collectionId } });
}

export async function deleteCollection(workspaceId: string, collectionId: string) {
  const result = await prisma.collection.deleteMany({
    where: { id: collectionId, workspaceId },
  });
  return result.count > 0;
}

// ---------------------------------------------------------------------------
// Extra tree CRUD (DB-backed) — REUSES FamilyTree(kind='extra').
// ---------------------------------------------------------------------------

export async function createExtraTree(input: {
  workspaceId: string;
  nameAr: string;
}) {
  return prisma.familyTree.create({
    data: {
      workspaceId: input.workspaceId,
      kind: 'extra',
      nameAr: input.nameAr,
    },
  });
}

/**
 * Per-tree people counts for a set of tree ids, in one query.
 *
 * Prisma v7 + driver adapters do NOT support `_count` with a `where` inside an
 * `include`, so this `groupBy` over Individual is the shared workaround — call
 * it instead of re-rolling the groupBy at each call site (keeps the v7 quirk in
 * one place). Returns an empty map for an empty input (no query issued).
 */
export async function peopleCountByTree(
  treeIds: string[],
  client: PrismaLike = prisma,
): Promise<Map<string, number>> {
  if (treeIds.length === 0) return new Map();
  const counts = await client.individual.groupBy({
    by: ['treeId'],
    where: { treeId: { in: treeIds } },
    _count: { _all: true },
  });
  return new Map(counts.map((c) => [c.treeId, c._count._all]));
}

/** List a workspace's extra trees with a people count per tree. */
export async function listExtraTrees(workspaceId: string) {
  const trees = await prisma.familyTree.findMany({
    where: { workspaceId, kind: 'extra' },
    orderBy: { lastModifiedAt: 'desc' },
  });

  const countByTree = await peopleCountByTree(trees.map((t) => t.id));
  return trees.map((t) => ({ ...t, peopleCount: countByTree.get(t.id) ?? 0 }));
}

export async function renameExtraTree(
  workspaceId: string,
  treeId: string,
  nameAr: string,
) {
  const result = await prisma.familyTree.updateMany({
    where: { id: treeId, workspaceId, kind: 'extra' },
    data: { nameAr },
  });
  if (result.count === 0) return null;
  return prisma.familyTree.findUnique({ where: { id: treeId } });
}

export async function deleteExtraTree(workspaceId: string, treeId: string) {
  const result = await prisma.familyTree.deleteMany({
    where: { id: treeId, workspaceId, kind: 'extra' },
  });
  return result.count > 0;
}

// ---------------------------------------------------------------------------
// Item CRUD (DB-backed)
// ---------------------------------------------------------------------------

export interface AddItemData {
  collectionId: string;
  kind: 'tree' | 'collection';
  titleAr: string;
  descriptionAr?: string | null;
  linkMode?: 'linked' | 'copied' | null;
  treeId?: string | null;
  rootIndividualId?: string | null;
  branchPointerId?: string | null;
  childCollectionId?: string | null;
}

export async function addItem(data: AddItemData, client: PrismaLike = prisma) {
  // Place new items at the end of the current order.
  const last = await client.collectionItem.findFirst({
    where: { collectionId: data.collectionId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  return client.collectionItem.create({
    data: {
      collectionId: data.collectionId,
      kind: data.kind,
      titleAr: data.titleAr,
      descriptionAr: data.descriptionAr ?? null,
      linkMode: data.linkMode ?? null,
      treeId: data.treeId ?? null,
      rootIndividualId: data.rootIndividualId ?? null,
      branchPointerId: data.branchPointerId ?? null,
      childCollectionId: data.childCollectionId ?? null,
      sortOrder,
    },
  });
}

/**
 * Result of {@link addOwnTreeLinked}: the created item, or a `duplicate` flag the
 * caller maps to a 409. Keeps the DB call free of `NextResponse` so it's reusable
 * from BOTH the direct picker path and the add-by-link self-source short-circuit.
 */
export type AddOwnTreeLinkedResult =
  | { ok: true; item: Awaited<ReturnType<typeof addItem>> }
  | { ok: false; reason: 'duplicate' };

/**
 * Add an OWN tree (main or extra, in this workspace) to a collection as a LIVE
 * linked item. The dedupe re-check + insert run in ONE `$transaction` so a
 * concurrent identical add can't both pass the check and both insert (TOCTOU-
 * safe); the DB `@@unique([collectionId, treeId])` index is the race backstop —
 * a P2002 collapses to the SAME `duplicate` result the pre-check returns.
 *
 * Shared by the direct picker (`kind:'tree'`, `linkMode:'linked'`, own `treeId`)
 * AND the self-source add-by-link path (pasting a link to your OWN published
 * tree just adds it — own-tree adds are always live links, `linkMode` ignored).
 */
export async function addOwnTreeLinked(
  collectionId: string,
  treeId: string,
  titleAr: string,
  descriptionAr: string | null = null,
): Promise<AddOwnTreeLinkedResult> {
  try {
    const item = await prisma.$transaction(async (tx) => {
      if (await itemExistsInCollection(collectionId, { treeId }, tx)) return null;
      return addItem(
        { collectionId, kind: 'tree', titleAr, descriptionAr, linkMode: 'linked', treeId },
        tx,
      );
    });
    if (!item) return { ok: false, reason: 'duplicate' };
    return { ok: true, item };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: 'duplicate' };
    throw err;
  }
}

/**
 * Returns true when a collection already contains an item pointing at the same
 * source — a tree (by `treeId`) OR a nested collection (by `childCollectionId`).
 * Used by the items POST route to reject adding the SAME source twice. Accepts a
 * `client` so the check runs in the SAME `$transaction` as the insert (TOCTOU-
 * safe), exactly like `detectCollectionCycleInWorkspace`.
 */
export async function itemExistsInCollection(
  collectionId: string,
  source:
    | { treeId: string }
    | { childCollectionId: string }
    | { borrowedSource: { sourceWorkspaceId: string; rootIndividualId: string } },
  client: PrismaLike = prisma,
): Promise<boolean> {
  let where;
  if ('treeId' in source) {
    where = { collectionId, kind: 'tree' as const, treeId: source.treeId };
  } else if ('childCollectionId' in source) {
    where = {
      collectionId,
      kind: 'collection' as const,
      childCollectionId: source.childCollectionId,
    };
  } else {
    // Borrowed-linked items have no unique index (each add mints a distinct
    // pointer), so dedupe by the SOURCE the pointer points at: the same source
    // workspace + branch root can only be borrowed-linked into a collection
    // once. Matched through the linked branchPointer relation.
    where = {
      collectionId,
      kind: 'tree' as const,
      branchPointer: {
        sourceWorkspaceId: source.borrowedSource.sourceWorkspaceId,
        rootIndividualId: source.borrowedSource.rootIndividualId,
      },
    };
  }
  const count = await client.collectionItem.count({ where });
  return count > 0;
}

export async function updateItem(
  collectionId: string,
  itemId: string,
  data: { titleAr?: string; descriptionAr?: string | null; sortOrder?: number },
) {
  const result = await prisma.collectionItem.updateMany({
    where: { id: itemId, collectionId },
    data,
  });
  if (result.count === 0) return null;
  return prisma.collectionItem.findUnique({ where: { id: itemId } });
}

export async function removeItem(collectionId: string, itemId: string) {
  const result = await prisma.collectionItem.deleteMany({
    where: { id: itemId, collectionId },
  });
  return result.count > 0;
}

// ---------------------------------------------------------------------------
// DB-backed cycle guard — loads the workspace's nesting edge map once, then
// delegates to the pure `detectCollectionCycle`.
// ---------------------------------------------------------------------------

export async function detectCollectionCycleInWorkspace(
  workspaceId: string,
  parentId: string,
  candidateChildId: string,
  client: PrismaLike = prisma,
): Promise<boolean> {
  const items = await client.collectionItem.findMany({
    where: {
      kind: 'collection',
      childCollectionId: { not: null },
      collection: { workspaceId },
    },
    select: { collectionId: true, childCollectionId: true },
  });

  const map = new Map<string, string[]>();
  for (const it of items) {
    if (!it.childCollectionId) continue;
    const arr = map.get(it.collectionId) ?? [];
    arr.push(it.childCollectionId);
    map.set(it.collectionId, arr);
  }

  return detectCollectionCycle(parentId, candidateChildId, (id) => map.get(id) ?? []);
}

// ---------------------------------------------------------------------------
// Item shaping (detail view)
// ---------------------------------------------------------------------------

/** Where a collection item's tree/branch came from — drives the source chip. */
export type CollectionItemSourceLabel =
  | 'own-main'
  | 'extra'
  | 'public-borrowed'
  | 'private-shared'
  | 'nested';

/** The minimal item shape the shaper needs (a CollectionItem row). */
export interface ShapeableItem {
  id: string;
  kind: 'tree' | 'collection';
  titleAr: string;
  descriptionAr: string | null;
  linkMode: 'linked' | 'copied' | null;
  treeId: string | null;
  branchPointerId: string | null;
  childCollectionId: string | null;
}

/** A referenced tree's live facts, keyed lookup for the shaper. */
export interface ReferencedTree {
  kind: 'main' | 'extra';
  nameAr: string | null;
  visibility: TreeVisibility;
  peopleCount: number;
}

/** A referenced branch pointer's live source visibility + name. */
export interface ReferencedPointer {
  sourceNameAr: string | null;
  sourceVisibility: TreeVisibility | null;
  isPublic: boolean;
  peopleCount: number;
}

/** A referenced child collection's live visibility + title. */
export interface ReferencedCollection {
  titleAr: string;
  visibility: TreeVisibility;
}

export interface ShapeItemLookups {
  trees: Map<string, ReferencedTree>;
  pointers: Map<string, ReferencedPointer>;
  collections: Map<string, ReferencedCollection>;
}

/** A fully shaped collection item, ready for the detail response. */
export interface ShapedCollectionItem {
  id: string;
  kind: 'tree' | 'collection';
  titleAr: string;
  descriptionAr: string | null;
  linkMode: 'linked' | 'copied' | null;
  sourceLabel: CollectionItemSourceLabel;
  sourceNameAr: string | null;
  peopleCount: number;
  treeVisibility: TreeVisibility;
  /** The referenced tree's id — lets the add-item picker block re-adds (§dedupe). */
  treeId: string | null;
  childCollectionId: string | null;
  withheldWhenPublic: boolean;
}

/**
 * Shape one stored CollectionItem into the detail-view contract — deriving the
 * source label and computing effective visibility LIVE from the referenced
 * tree / pointer / child collection (never trusting a stored copy).
 *
 * Deny-by-default: a missing/dangling reference resolves to `private` so a
 * broken link can never imply a public source. `withheldWhenPublic` flags an
 * item whose effective visibility is private — it would be hidden if the
 * collection were published.
 */
export function shapeCollectionItem(
  item: ShapeableItem,
  lookups: ShapeItemLookups,
): ShapedCollectionItem {
  let sourceLabel: CollectionItemSourceLabel = 'private-shared';
  let sourceNameAr: string | null = null;
  let peopleCount = 0;
  let treeVisibility: TreeVisibility = 'private';

  if (item.kind === 'collection' && item.childCollectionId) {
    const child = lookups.collections.get(item.childCollectionId);
    sourceLabel = 'nested';
    sourceNameAr = child?.titleAr ?? null;
    treeVisibility = resolveEffectiveVisibility({
      kind: 'collection',
      childVisibility: child?.visibility ?? null,
    });
  } else if (item.treeId) {
    const tree = lookups.trees.get(item.treeId);
    sourceLabel = tree?.kind === 'extra' ? 'extra' : 'own-main';
    sourceNameAr = tree?.nameAr ?? null;
    peopleCount = tree?.peopleCount ?? 0;
    treeVisibility = resolveEffectiveVisibility({
      kind: 'tree',
      treeVisibility: tree?.visibility ?? null,
    });
  } else if (item.branchPointerId) {
    const ptr = lookups.pointers.get(item.branchPointerId);
    sourceLabel = ptr?.isPublic ? 'public-borrowed' : 'private-shared';
    sourceNameAr = ptr?.sourceNameAr ?? null;
    peopleCount = ptr?.peopleCount ?? 0;
    treeVisibility = resolveEffectiveVisibility({
      kind: 'branchPointer',
      sourceVisibility: ptr?.sourceVisibility ?? null,
    });
  }

  return {
    id: item.id,
    kind: item.kind,
    titleAr: item.titleAr,
    descriptionAr: item.descriptionAr,
    linkMode: item.linkMode,
    sourceLabel,
    sourceNameAr,
    peopleCount,
    treeVisibility,
    treeId: item.treeId,
    childCollectionId: item.childCollectionId,
    withheldWhenPublic: treeVisibility === 'private',
  };
}

/** Reserve an unguessable public slug, retrying on the unique-index collision. */
export async function generateUniqueCollectionSlug(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const candidate = generatePublicSlug();
    const existing = await prisma.collection.findUnique({
      where: { publicSlug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new Error('Failed to generate a unique collection slug after retries');
}

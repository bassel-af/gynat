/**
 * Collections — PUBLIC serving layer (PRD §2.x, Chunk 4 Slice A).
 *
 * The ONE place that turns a published Collection into the anonymous public
 * dataset. This is the public-exposure boundary of the whole feature, so every
 * rule is fail-closed.
 *
 * IMPORTANT — separation of concerns (architect rule 1):
 *  - Withholding + composition live HERE, not in `tree/public-serve.ts` (the
 *    member-tree separation). Per-item LIVE effective visibility uses
 *    `resolveEffectiveVisibility` (collections/queries.ts) — never a stored copy.
 *  - The public collection PAGE is a CARD GRID that links OUT to each surviving
 *    tree's own `/family/[slug]` page (which does the redact-ONCE serving). So
 *    the payload is lightweight cards (slug + title + people count), NOT each
 *    tree's full redacted data — the full withholding walk still DECIDES which
 *    trees become cards, it just doesn't inline their data.
 *
 * The recursive walk reuses the bounded-walk discipline of
 * `detectCollectionCycle` (MAX_NESTING_DEPTH + MAX_ITEMS + a visited-set).
 */

import { prisma } from '@/lib/db';
import { cache } from 'react';
import {
  MAX_NESTING_DEPTH,
  MAX_ITEMS,
  resolveEffectiveVisibility,
  peopleCountByTree,
  type TreeVisibility,
} from '@/lib/collections/queries';

// ===========================================================================
// PURE bounded walk — withholding rules (unit-tested without a DB).
// ===========================================================================

/** A leaf tree reference the walk collects after it passes every gate. */
export interface PublicTreeRef {
  /** The referenced FamilyTree id (the leaf to serve). */
  treeId: string;
  /** Curation label for the item (the collection item's title). */
  titleAr: string;
  /** LIVE effective visibility of the surviving leaf — public_link vs
   * public_listed drives the fully-listable predicate (listing readiness). */
  effectiveVisibility: TreeVisibility;
  /** True when the leaf's source workspace differs from the publishing one. */
  isCrossWorkspace: boolean;
  /** The leaf's own display name (own tree → its nameAr). */
  treeNameAr: string | null;
  /** For a cross-workspace borrow: the source workspace's display name. */
  sourceWorkspaceNameAr: string | null;
}

/** One item inside a collection node, as the pure walk sees it. */
export type CollectionWalkItem =
  | {
      kind: 'tree';
      treeRef: { treeId: string };
      titleAr: string;
      /** LIVE effective visibility of the referenced tree (deny-by-default). */
      effectiveVisibility: TreeVisibility;
      /** LIVE source allowReuse (only enforced for cross-workspace borrows). */
      allowReuse: boolean;
      /** True when the source workspace differs from the publishing workspace. */
      isCrossWorkspace: boolean;
      /** The leaf tree's own display name (own tree → its nameAr). Optional so
       * existing walk fixtures stay valid; the readiness reader defaults null. */
      treeNameAr?: string | null;
      /** Cross-workspace borrow: the source workspace's display name. */
      sourceWorkspaceNameAr?: string | null;
    }
  | {
      kind: 'collection';
      childCollectionId: string;
      /** LIVE effective visibility of the child collection (deny-by-default). */
      effectiveVisibility: TreeVisibility;
      titleAr: string;
    };

/** A collection as the pure walk sees it: its own visibility + its items. */
export interface CollectionWalkNode {
  id: string;
  visibility: TreeVisibility;
  items: CollectionWalkItem[];
}

export interface CollectionWalkDeps {
  /** Resolve a collection id to its node, or null when missing/dangling. */
  getCollectionNode: (collectionId: string) => CollectionWalkNode | null;
}

function isPublic(v: TreeVisibility): boolean {
  return v === 'public_link' || v === 'public_listed';
}

/**
 * Walk a published collection and collect the leaf tree refs that may be served
 * publicly. Bounded twice over (visited-set + MAX_ITEMS) and depth-capped at
 * MAX_NESTING_DEPTH — a pre-existing cycle can never spin forever.
 *
 * Withholding rules (each fail-closed):
 *  - drop any item whose LIVE effective visibility is not public
 *  - a cross-workspace borrowed tree ALSO requires live source allowReuse
 *  - recurse into a child collection ONLY when it is itself public — a public
 *    parent never widens a non-public child at any depth
 *  - a dangling (null) child node is withheld
 */
export function collectPublicTreeRefs(
  rootCollectionId: string,
  deps: CollectionWalkDeps,
): PublicTreeRef[] {
  const refs: PublicTreeRef[] = [];
  const visited = new Set<string>();
  let nodeBudget = 0;

  // BFS with explicit depth, mirroring detectCollectionCycle's bounded walk.
  let frontier: string[] = [rootCollectionId];
  let depth = 1;

  while (frontier.length > 0) {
    if (depth > MAX_NESTING_DEPTH) break;

    const next: string[] = [];
    for (const collectionId of frontier) {
      if (visited.has(collectionId)) continue;
      visited.add(collectionId);
      if (++nodeBudget > MAX_ITEMS) return refs;

      const node = deps.getCollectionNode(collectionId);
      // Fail-closed: a missing node, or a node that is not itself public, is a
      // dead end — a public parent never widens a non-public child.
      if (!node || !isPublic(node.visibility)) continue;

      for (const item of node.items) {
        if (item.kind === 'tree') {
          if (!isPublic(item.effectiveVisibility)) continue;
          // Cross-workspace borrows additionally require live source reuse.
          if (item.isCrossWorkspace && !item.allowReuse) continue;
          refs.push({
            treeId: item.treeRef.treeId,
            titleAr: item.titleAr,
            effectiveVisibility: item.effectiveVisibility,
            isCrossWorkspace: item.isCrossWorkspace,
            treeNameAr: item.treeNameAr ?? null,
            sourceWorkspaceNameAr: item.sourceWorkspaceNameAr ?? null,
          });
        } else {
          // Recurse only into a public child collection.
          if (!isPublic(item.effectiveVisibility)) continue;
          next.push(item.childCollectionId);
        }
      }
    }
    frontier = next;
    depth += 1;
  }

  return refs;
}

// ===========================================================================
// DB-backed loaders + composed public payload (the route consumes these).
// ===========================================================================

/** A published collection resolved by its own unguessable public slug. */
export interface PublicCollectionRecord {
  collectionId: string;
  workspaceId: string;
  titleAr: string;
  descriptionAr: string | null;
  visibility: 'public_link' | 'public_listed';
  publicSlug: string;
  /** Last edit timestamp — the sitemap `lastModified` for this collection. */
  updatedAt: Date;
}

/**
 * Resolve a published collection by its public slug. Returns null when the slug
 * is unknown, the collection is private, OR the owning workspace has Collections
 * disabled (deny-by-default — indistinguishable from non-existent to a stranger).
 */
export async function loadPublicCollectionBySlug(
  slug: string,
): Promise<PublicCollectionRecord | null> {
  const collection = await prisma.collection.findUnique({
    where: { publicSlug: slug },
    select: {
      id: true,
      workspaceId: true,
      titleAr: true,
      descriptionAr: true,
      visibility: true,
      publicSlug: true,
      updatedAt: true,
      workspace: { select: { enableCollections: true } },
    },
  });

  if (!collection) return null;
  if (!collection.workspace.enableCollections) return null;
  if (
    collection.visibility !== 'public_link' &&
    collection.visibility !== 'public_listed'
  ) {
    return null;
  }

  return {
    collectionId: collection.id,
    workspaceId: collection.workspaceId,
    titleAr: collection.titleAr,
    descriptionAr: collection.descriptionAr,
    visibility: collection.visibility,
    publicSlug: collection.publicSlug as string,
    updatedAt: collection.updatedAt,
  };
}

/**
 * Per-request memoized `loadPublicCollectionBySlug` for the SSR page:
 * `generateMetadata` and the page body both call this, so the slug → collection
 * query runs ONCE per request (React `cache`). Mirrors `getPublicTreeForRequest`
 * in tree/public-serve.ts. Unit tests call the raw function to avoid memo bleed.
 */
export const getPublicCollectionForRequest = cache(loadPublicCollectionBySlug);

/** One CARD in a public collection — links out to its own /family/[slug] page. */
export interface PublicCollectionTreeCard {
  /** The leaf tree's own public slug (the address /family/[slug] serves). */
  slug: string;
  /** The collection item's curation title. */
  titleAr: string;
  /** People in the leaf tree (display only; via peopleCountByTree). */
  peopleCount: number;
}

/** The full anonymous collection serve payload (a card grid). */
export interface PublicCollectionPayload {
  titleAr: string;
  descriptionAr: string | null;
  trees: PublicCollectionTreeCard[];
}

/**
 * Load the full collection graph for the publishing workspace and shape it into
 * pure walk nodes — one DB pass for the collections + one for the referenced
 * trees/pointers (the single batched visibility resolver, architect DRY rule).
 *
 * Effective visibility is recomputed LIVE FROM THE SOURCE for every item; the
 * stored item `linkMode`/visibility is never read.
 */
async function loadWalkNodes(
  workspaceId: string,
): Promise<Map<string, CollectionWalkNode>> {
  // All collections in the workspace + their items, plus the live source facts
  // we need to recompute effective visibility deny-by-default.
  const collections = await prisma.collection.findMany({
    where: { workspaceId },
    select: {
      id: true,
      visibility: true,
      items: {
        orderBy: { sortOrder: 'asc' },
        select: {
          kind: true,
          titleAr: true,
          treeId: true,
          childCollectionId: true,
          branchPointerId: true,
          // LIVE source facts — never trust a stored copy.
          tree: {
            select: { id: true, workspaceId: true, visibility: true, nameAr: true },
          },
          // A collection-link pointer has no `sourceTreeId` column; the leaf
          // tree it borrows is the tree that OWNS its root individual in the
          // source workspace. Resolve the leaf (and its LIVE visibility +
          // allowReuse) through `rootIndividual.tree`.
          branchPointer: {
            select: {
              status: true,
              rootIndividual: {
                select: {
                  tree: {
                    select: {
                      id: true,
                      workspaceId: true,
                      visibility: true,
                      allowReuse: true,
                      nameAr: true,
                      workspace: { select: { nameAr: true } },
                    },
                  },
                },
              },
            },
          },
          childCollection: { select: { id: true, visibility: true } },
        },
      },
    },
  });

  const nodes = new Map<string, CollectionWalkNode>();
  for (const c of collections) {
    const items: CollectionWalkItem[] = [];
    for (const it of c.items) {
      if (it.kind === 'collection' && it.childCollectionId) {
        items.push({
          kind: 'collection',
          childCollectionId: it.childCollectionId,
          effectiveVisibility: resolveEffectiveVisibility({
            kind: 'collection',
            childVisibility: it.childCollection?.visibility ?? null,
          }),
          titleAr: it.titleAr,
        });
      } else if (it.treeId && it.tree) {
        // An OWN tree (linked or copied snapshot) — its visibility IS the leaf's.
        items.push({
          kind: 'tree',
          treeRef: { treeId: it.tree.id },
          titleAr: it.titleAr,
          effectiveVisibility: resolveEffectiveVisibility({
            kind: 'tree',
            treeVisibility: it.tree.visibility,
          }),
          // Own tree: same workspace → not cross-workspace, allowReuse ignored.
          allowReuse: true,
          isCrossWorkspace: it.tree.workspaceId !== workspaceId,
          treeNameAr: it.tree.nameAr,
          sourceWorkspaceNameAr: null,
        });
      } else if (it.branchPointerId && it.branchPointer) {
        // A cross-workspace borrowed (linked) branch — the leaf is the SOURCE
        // tree that owns the pointer's root individual, gated by that tree's
        // LIVE visibility AND allowReuse. Deny-by-default on a broken/dangling
        // pointer (no leaf tree → effectiveVisibility private, withheld).
        const ptr = it.branchPointer;
        const leaf = ptr.rootIndividual?.tree ?? null;
        const active = ptr.status === 'active' && leaf != null;
        items.push({
          kind: 'tree',
          treeRef: { treeId: active ? leaf!.id : '' },
          titleAr: it.titleAr,
          effectiveVisibility: active
            ? resolveEffectiveVisibility({
                kind: 'branchPointer',
                sourceVisibility: leaf!.visibility,
              })
            : 'private',
          allowReuse: active ? leaf!.allowReuse : false,
          isCrossWorkspace: true,
          treeNameAr: active ? leaf!.nameAr : null,
          sourceWorkspaceNameAr: active ? (leaf!.workspace?.nameAr ?? null) : null,
        });
      }
      // Any other shape (dangling tree/pointer reference) is dropped — the leaf
      // simply isn't added, which is the same as withholding it.
    }
    nodes.set(c.id, {
      id: c.id,
      visibility: c.visibility,
      items,
    });
  }
  return nodes;
}

/**
 * Build the complete anonymous payload for a published collection: walk the
 * graph (withholding non-public items, fail-closed) to DECIDE which leaf trees
 * become cards, then resolve each surviving leaf's own public slug + people
 * count. The cards link OUT to /family/[slug] — the per-tree page does the
 * redact-ONCE serving, so no tree data is inlined here.
 *
 * De-duplicates leaves by tree id (a tree referenced twice appears once). A leaf
 * with no current public slug (race with an unpublish) is dropped — the final
 * fail-closed gate after the walk's LIVE visibility check.
 */
export async function buildPublicCollectionPayload(
  record: PublicCollectionRecord,
): Promise<PublicCollectionPayload> {
  const nodes = await loadWalkNodes(record.workspaceId);
  const refs = collectPublicTreeRefs(record.collectionId, {
    getCollectionNode: (id) => nodes.get(id) ?? null,
  });

  // De-dupe by leaf tree id; preserve first-seen order (titleAr keyed by id).
  const orderedTreeIds: string[] = [];
  const titleByTreeId = new Map<string, string>();
  for (const r of refs) {
    if (!r.treeId || titleByTreeId.has(r.treeId)) continue;
    orderedTreeIds.push(r.treeId);
    titleByTreeId.set(r.treeId, r.titleAr);
  }
  if (orderedTreeIds.length === 0) {
    return { titleAr: record.titleAr, descriptionAr: record.descriptionAr, trees: [] };
  }

  // Resolve each leaf's CURRENT public slug (final fail-closed gate: a leaf with
  // no slug is no longer publicly servable and is dropped) + people count, both
  // in one batched query each.
  const [slugRows, countByTree] = await Promise.all([
    prisma.familyTree.findMany({
      where: { id: { in: orderedTreeIds } },
      select: { id: true, publicSlug: true },
    }),
    peopleCountByTree(orderedTreeIds),
  ]);
  const slugByTree = new Map(slugRows.map((t) => [t.id, t.publicSlug]));

  const trees: PublicCollectionTreeCard[] = [];
  for (const treeId of orderedTreeIds) {
    const slug = slugByTree.get(treeId);
    if (!slug) continue; // no current public slug → drop (fail-closed)
    trees.push({
      slug,
      titleAr: titleByTreeId.get(treeId) ?? '',
      peopleCount: countByTree.get(treeId) ?? 0,
    });
  }

  return {
    titleAr: record.titleAr,
    descriptionAr: record.descriptionAr,
    trees,
  };
}

// ===========================================================================
// Publish preview — what WOULD appear vs be withheld if published (PRD §1.8).
// ===========================================================================

export interface CollectionPublishCounts {
  /** Direct items that would be WITHHELD (non-public source / reuse off). */
  withheldTrees: { titleAr: string }[];
  /** Count of direct items that WOULD be served publicly. */
  publishableCount: number;
}

/**
 * Classify a collection's DIRECT items into publishable vs withheld, computing
 * each item's effective visibility LIVE (same loader the serve path uses). This
 * is the publish-preview warning surface — it inspects the collection the admin
 * is about to publish, not the whole transitive graph.
 *
 * A tree item is publishable when its LIVE effective visibility is public AND
 * (for a cross-workspace borrow) the source still permits reuse. A nested
 * collection item is publishable when the child collection is itself public.
 * Everything else is withheld and listed by title.
 */
export async function countPublishableTrees(
  collectionId: string,
  workspaceId: string,
): Promise<CollectionPublishCounts> {
  const nodes = await loadWalkNodes(workspaceId);
  const root = nodes.get(collectionId);
  if (!root) return { withheldTrees: [], publishableCount: 0 };

  const withheldTrees: { titleAr: string }[] = [];
  let publishableCount = 0;

  for (const item of root.items) {
    let publishable: boolean;
    if (item.kind === 'tree') {
      publishable =
        isPublic(item.effectiveVisibility) &&
        (!item.isCrossWorkspace || item.allowReuse);
    } else {
      publishable = isPublic(item.effectiveVisibility);
    }

    if (publishable) publishableCount++;
    else withheldTrees.push({ titleAr: item.titleAr });
  }

  return { withheldTrees, publishableCount };
}

// ===========================================================================
// Listing readiness — the ONE "is a collection fully-listable" predicate.
// ===========================================================================

export interface CollectionListingReadiness {
  /** True iff EVERY servable leaf (across nested collections) is public_listed. */
  fullyListable: boolean;
  /** Servable own-workspace leaves that are public_link (not listed). */
  notListedOwnTrees: { treeId: string; titleAr: string }[];
  /** Servable cross-workspace borrows that are public_link (not listed). */
  notListedBorrowedTrees: { titleAr: string; sourceWorkspaceNameAr: string }[];
}

function isListed(v: TreeVisibility): boolean {
  return v === 'public_listed';
}

/**
 * Compute whether a published collection is fully search-listable: every leaf
 * tree that SURVIVES the public withholding walk (recursing nested collections
 * via the bounded `collectPublicTreeRefs`) must itself be `public_listed`. A
 * surviving leaf that is merely `public_link` is what blocks listing — split
 * into own-workspace trees (the publisher can fix directly) vs cross-workspace
 * borrows (the other family must change). This is the single source of the
 * "fully-listable" predicate; sitemap + publish-preview consume it.
 *
 * Returns null when the slug is unknown / private / Collections-off — same
 * deny-by-default posture as the serve path (no enumeration oracle).
 */
export const getCollectionListingReadiness = cache(
  async (slug: string): Promise<CollectionListingReadiness | null> => {
    // Cached loader (shared with the SSR page) so generateMetadata + the page
    // body don't each re-walk the collection graph for the same request.
    const record = await getPublicCollectionForRequest(slug);
    if (!record) return null;
    return computeListingReadiness(record.collectionId, record.workspaceId);
  },
);

/**
 * Id-keyed readiness for the ADMIN pre-publish surface (publish-preview +
 * visibility PATCH). A still-private collection has no public slug yet, so the
 * slug-keyed path can't reach it — this entry resolves the collection by id and
 * computes readiness REGARDLESS of the collection's own visibility (the admin
 * is evaluating "if I publish this"). Returns null only when the collection
 * doesn't exist. Shares the exact same core as the public slug-keyed path.
 */
export async function getCollectionListingReadinessById(
  collectionId: string,
): Promise<CollectionListingReadiness | null> {
  const row = await prisma.collection.findUnique({
    where: { id: collectionId },
    select: { workspaceId: true },
  });
  if (!row) return null;
  return computeListingReadiness(collectionId, row.workspaceId);
}

/**
 * The shared listing-readiness core: walk the collection graph (recursing
 * nested collections via the bounded `collectPublicTreeRefs`) and classify the
 * surviving public leaves into already-listed vs public-but-not-listed, the
 * latter split own-workspace vs cross-workspace borrow.
 *
 * The root node is treated as public for the walk so the pre-publish admin path
 * (a still-private root collection) evaluates the SAME way the public path does
 * once published — matching `countPublishableTrees`, which iterates the root's
 * items directly and never gates on the root's own visibility. Nested child
 * collections are still gated on THEIR live visibility (a public parent never
 * widens a non-public child).
 */
async function computeListingReadiness(
  collectionId: string,
  workspaceId: string,
): Promise<CollectionListingReadiness> {
  const nodes = await loadWalkNodes(workspaceId);

  // Treat the root as public for the walk (pre-publish parity). Child nodes keep
  // their own live visibility — only the entrypoint is forced open.
  const rootNode = nodes.get(collectionId);
  if (rootNode && !isPublic(rootNode.visibility)) {
    nodes.set(collectionId, { ...rootNode, visibility: 'public_listed' });
  }

  const refs = collectPublicTreeRefs(collectionId, {
    getCollectionNode: (id) => nodes.get(id) ?? null,
  });

  const notListedOwnTrees: { treeId: string; titleAr: string }[] = [];
  const notListedBorrowedTrees: { titleAr: string; sourceWorkspaceNameAr: string }[] = [];
  const seenOwn = new Set<string>();

  for (const ref of refs) {
    if (isListed(ref.effectiveVisibility)) continue; // already listed → fine
    // Surviving the walk means it is public; not-listed means public_link.
    if (ref.isCrossWorkspace) {
      notListedBorrowedTrees.push({
        titleAr: ref.treeNameAr ?? ref.titleAr,
        sourceWorkspaceNameAr: ref.sourceWorkspaceNameAr ?? 'غير معروف',
      });
    } else {
      if (ref.treeId && seenOwn.has(ref.treeId)) continue;
      if (ref.treeId) seenOwn.add(ref.treeId);
      notListedOwnTrees.push({
        treeId: ref.treeId,
        titleAr: ref.treeNameAr ?? ref.titleAr,
      });
    }
  }

  const fullyListable =
    notListedOwnTrees.length === 0 && notListedBorrowedTrees.length === 0;
  return { fullyListable, notListedOwnTrees, notListedBorrowedTrees };
}

/**
 * The sitemap data source for published collections. A collection is indexable
 * iff it is `public_listed`, its workspace has Collections enabled, AND it is
 * fully-listable (every servable leaf is `public_listed`). Re-queried LIVE per
 * sitemap build — a collection flipped private/by-link, or one whose leaf turns
 * by-link, vanishes on the next build (fail-closed: no entry).
 */
export async function listIndexableCollectionSlugs(): Promise<
  { slug: string; lastModified: Date }[]
> {
  const collections = await prisma.collection.findMany({
    where: {
      visibility: 'public_listed',
      workspace: { enableCollections: true },
    },
    select: { id: true, workspaceId: true, publicSlug: true, updatedAt: true },
  });

  // Compute readiness straight from the id-keyed core (the rows are already
  // loaded — no per-slug reload) and in parallel rather than one-by-one.
  const entries = await Promise.all(
    collections.map(async (c) => {
      const slug = c.publicSlug as string | null;
      if (!slug) return null;
      const readiness = await computeListingReadiness(c.id, c.workspaceId);
      return readiness.fullyListable ? { slug, lastModified: c.updatedAt } : null;
    }),
  );
  return entries.filter((e): e is { slug: string; lastModified: Date } => e !== null);
}

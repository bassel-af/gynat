/**
 * Collections — the live data layer (replaces the static `mock.ts`).
 *
 * Holds the wire types the Chunk-1 endpoints return, an `apiFetch`-backed
 * client, the DB↔UI visibility mapping, and the small pure display helpers the
 * screens share. The screens import from here; nothing here talks to Prisma.
 *
 * API CONTRACT — Chunk 1 (workspace id = UUID, resolved via by-slug):
 *  - PATCH /api/workspaces/[id]                  { enableCollections }
 *  - GET/POST /api/workspaces/[id]/extra-trees
 *  - PATCH/DELETE .../extra-trees/[treeId]
 *  - GET/POST /api/workspaces/[id]/collections
 *  - GET/PATCH/DELETE .../collections/[collectionId]
 *  - POST/PATCH/DELETE .../collections/[collectionId]/items[/itemId]
 */

import { apiFetch } from '@/lib/api/client';

// ---------------------------------------------------------------------------
// Types — the three-level UI ladder + the wire shapes the routes return.
// ---------------------------------------------------------------------------

/** The UI's three-level visibility ladder (same as trees, §2.2). */
export type Visibility = 'private' | 'link' | 'search';

/** How an item relates to its source (§2.3). */
export type ItemLinkMode = 'linked' | 'copied';

/** The source-kind code the detail route emits for each item. */
export type ItemSourceLabel =
  | 'own-main'
  | 'extra'
  | 'public-borrowed'
  | 'private-shared'
  | 'nested';

/** A tree row inside a workspace — the main tree plus optional extra trees. */
export interface WorkspaceTree {
  id: string;
  nameAr: string;
  /** 'main' | 'extra' from the FamilyTree.kind enum. */
  kind: 'main' | 'extra';
  visibility: Visibility;
  peopleCount: number;
}

/** A single entry in a collection — a tree/branch, or a nested collection. */
export interface CollectionItem {
  id: string;
  /** Item's own title (independent of the source's name). */
  titleAr: string;
  descriptionAr?: string | null;
  kind: 'tree' | 'collection';
  // --- tree/branch items ---
  /** The referenced tree's id — used to block re-adding the same tree (§dedupe). */
  treeId?: string | null;
  linkMode?: ItemLinkMode | null;
  /** Source-kind code (own tree / extra / borrowed / nested …). */
  sourceLabel?: ItemSourceLabel | null;
  /** The source tree/branch name. */
  sourceNameAr?: string | null;
  peopleCount?: number | null;
  /** Effective visibility of the underlying tree — drives withholding (§2.10). */
  treeVisibility?: Visibility | null;
  /** Whether this item would be withheld when the collection is public (§3). */
  withheldWhenPublic?: boolean;
  // --- nested-collection items ---
  childCollectionId?: string | null;
}

export interface Collection {
  id: string;
  titleAr: string;
  descriptionAr?: string | null;
  visibility: Visibility;
  /** Auto-generated unguessable public code (present once published). */
  publicCode?: string | null;
  /** List rows carry an itemCount; the detail object carries `items`. */
  itemCount?: number;
  items?: CollectionItem[];
}

/** The detail response: the collection plus its resolved items. */
export interface CollectionDetailResponse {
  collection: Collection;
  items: CollectionItem[];
}

// ---------------------------------------------------------------------------
// Visibility mapping — the SINGLE place the DB enum becomes the UI ladder.
// ---------------------------------------------------------------------------

/**
 * Map any incoming visibility string to the UI ladder. Accepts both the DB
 * `TreeVisibility` enum (private | public_link | public_listed) and the UI
 * values themselves (so the UI never double-maps if a route already mapped).
 * Deny-by-default: anything unknown/missing resolves to `private`.
 */
export function toUiVisibility(value: string | null | undefined): Visibility {
  switch (value) {
    case 'link':
    case 'public_link':
      return 'link';
    case 'search':
    case 'public_listed':
      return 'search';
    default:
      return 'private';
  }
}

// ---------------------------------------------------------------------------
// Pure display helpers (shared across screens)
// ---------------------------------------------------------------------------

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  private: 'خاصة',
  link: 'عامة عبر الرابط',
  search: 'عامة وتظهر في البحث',
};

export const VISIBILITY_SHORT: Record<Visibility, string> = {
  private: 'خاصة',
  link: 'عبر الرابط',
  search: 'في البحث',
};

export const LINK_MODE_LABEL: Record<ItemLinkMode, string> = {
  linked: 'مرتبط مباشرة',
  copied: 'نسخة مثبّتة',
};

export const SOURCE_LABEL: Record<ItemSourceLabel, string> = {
  'own-main': 'من الشجرة الرئيسية',
  extra: 'شجرة إضافية',
  'public-borrowed': 'مستعارة من عائلة عامة',
  'private-shared': 'فرع مُشارَك بشكل خاص',
  nested: 'مجموعة متداخلة',
};

/** Count items, reading the list-row `itemCount` or the detail `items` array. */
export function itemCount(collection: Collection): number {
  if (typeof collection.itemCount === 'number') return collection.itemCount;
  return collection.items?.length ?? 0;
}

/**
 * The set of source ids ALREADY present in a collection — a tree item's
 * `treeId` or a nested item's `childCollectionId`. The add-item picker uses this
 * to block re-adding the same source (the server is still the authority via a
 * 409). Items without a source id (legacy/dangling) contribute nothing.
 */
export function collectionUsedSourceIds(items: CollectionItem[]): Set<string> {
  const used = new Set<string>();
  for (const item of items) {
    const sourceId =
      item.kind === 'collection' ? item.childCollectionId : item.treeId;
    if (sourceId) used.add(sourceId);
  }
  return used;
}

/**
 * Whether a tree item would be WITHHELD when the collection is published — the
 * §3 safety principle. Prefers the server's `withheldWhenPublic` flag when the
 * route computes it; otherwise falls back to the private-tree rule.
 */
export function isWithheldWhenPublic(item: CollectionItem): boolean {
  if (item.kind !== 'tree') return false;
  if (typeof item.withheldWhenPublic === 'boolean') return item.withheldWhenPublic;
  return item.treeVisibility === 'private';
}

// ---------------------------------------------------------------------------
// Normalisers — coerce a raw wire row into a UI-shaped object, mapping the
// visibility field through `toUiVisibility` exactly once.
// ---------------------------------------------------------------------------

export function normalizeTree(raw: Record<string, unknown>): WorkspaceTree {
  return {
    id: String(raw.id),
    nameAr: String(raw.nameAr ?? ''),
    kind: raw.kind === 'main' ? 'main' : 'extra',
    visibility: toUiVisibility(raw.visibility as string | undefined),
    peopleCount: Number(raw.peopleCount ?? 0),
  };
}

export function normalizeCollectionRow(raw: Record<string, unknown>): Collection {
  return {
    id: String(raw.id),
    titleAr: String(raw.titleAr ?? ''),
    descriptionAr: (raw.descriptionAr as string | null) ?? null,
    visibility: toUiVisibility(raw.visibility as string | undefined),
    publicCode: (raw.publicCode as string | null) ?? null,
    itemCount: typeof raw.itemCount === 'number' ? raw.itemCount : undefined,
  };
}

export function normalizeItem(raw: Record<string, unknown>): CollectionItem {
  return {
    id: String(raw.id),
    titleAr: String(raw.titleAr ?? ''),
    descriptionAr: (raw.descriptionAr as string | null) ?? null,
    kind: raw.kind === 'collection' ? 'collection' : 'tree',
    treeId: (raw.treeId as string | null) ?? null,
    linkMode: (raw.linkMode as ItemLinkMode | null) ?? null,
    sourceLabel: (raw.sourceLabel as ItemSourceLabel | null) ?? null,
    sourceNameAr: (raw.sourceNameAr as string | null) ?? null,
    peopleCount: raw.peopleCount == null ? null : Number(raw.peopleCount),
    treeVisibility:
      raw.treeVisibility == null
        ? null
        : toUiVisibility(raw.treeVisibility as string),
    withheldWhenPublic:
      typeof raw.withheldWhenPublic === 'boolean'
        ? raw.withheldWhenPublic
        : undefined,
    childCollectionId: (raw.childCollectionId as string | null) ?? null,
  };
}

// ---------------------------------------------------------------------------
// API client — thin apiFetch wrappers. Each unwraps `{ data }` and throws on a
// non-ok response so callers can surface a single error/empty state.
// ---------------------------------------------------------------------------

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = 'حدث خطأ غير متوقع';
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON error body — keep the generic message */
    }
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  return (body?.data ?? body) as T;
}

// --- enable toggle ---------------------------------------------------------

export async function setCollectionsEnabled(
  workspaceId: string,
  enabled: boolean,
): Promise<void> {
  await unwrap(
    await apiFetch(`/api/workspaces/${workspaceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enableCollections: enabled }),
    }),
  );
}

// --- extra trees -----------------------------------------------------------

export async function listExtraTrees(
  workspaceId: string,
): Promise<WorkspaceTree[]> {
  const rows = await unwrap<Record<string, unknown>[]>(
    await apiFetch(`/api/workspaces/${workspaceId}/extra-trees`),
  );
  return rows.map(normalizeTree);
}

export async function createExtraTree(
  workspaceId: string,
  nameAr: string,
): Promise<WorkspaceTree> {
  const row = await unwrap<Record<string, unknown>>(
    await apiFetch(`/api/workspaces/${workspaceId}/extra-trees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nameAr }),
    }),
  );
  return normalizeTree(row);
}

export async function renameExtraTree(
  workspaceId: string,
  treeId: string,
  nameAr: string,
): Promise<void> {
  await unwrap(
    await apiFetch(`/api/workspaces/${workspaceId}/extra-trees/${treeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nameAr }),
    }),
  );
}

export async function deleteExtraTree(
  workspaceId: string,
  treeId: string,
): Promise<void> {
  await unwrap(
    await apiFetch(`/api/workspaces/${workspaceId}/extra-trees/${treeId}`, {
      method: 'DELETE',
    }),
  );
}

/**
 * Duplicate any tree in the workspace (main OR extra) into a new frozen extra
 * tree. Returns the freshly created tree row so the caller can prepend it.
 */
export async function duplicateTree(
  workspaceId: string,
  treeId: string,
): Promise<WorkspaceTree> {
  const row = await unwrap<Record<string, unknown>>(
    await apiFetch(
      `/api/workspaces/${workspaceId}/extra-trees/${treeId}/duplicate`,
      { method: 'POST' },
    ),
  );
  return normalizeTree(row);
}

// --- collections -----------------------------------------------------------

export async function listCollections(
  workspaceId: string,
): Promise<Collection[]> {
  const rows = await unwrap<Record<string, unknown>[]>(
    await apiFetch(`/api/workspaces/${workspaceId}/collections`),
  );
  return rows.map(normalizeCollectionRow);
}

export async function createCollection(
  workspaceId: string,
  input: { titleAr: string; descriptionAr?: string },
): Promise<Collection> {
  const row = await unwrap<Record<string, unknown>>(
    await apiFetch(`/api/workspaces/${workspaceId}/collections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
  return normalizeCollectionRow(row);
}

export async function getCollection(
  workspaceId: string,
  collectionId: string,
): Promise<{ collection: Collection; items: CollectionItem[] }> {
  const data = await unwrap<{
    collection: Record<string, unknown>;
    items: Record<string, unknown>[];
  }>(
    await apiFetch(
      `/api/workspaces/${workspaceId}/collections/${collectionId}`,
    ),
  );
  return {
    collection: normalizeCollectionRow(data.collection),
    items: (data.items ?? []).map(normalizeItem),
  };
}

export async function updateCollection(
  workspaceId: string,
  collectionId: string,
  input: { titleAr?: string; descriptionAr?: string | null },
): Promise<void> {
  await unwrap(
    await apiFetch(
      `/api/workspaces/${workspaceId}/collections/${collectionId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
    ),
  );
}

export async function deleteCollection(
  workspaceId: string,
  collectionId: string,
): Promise<void> {
  await unwrap(
    await apiFetch(
      `/api/workspaces/${workspaceId}/collections/${collectionId}`,
      { method: 'DELETE' },
    ),
  );
}

// --- items -----------------------------------------------------------------

/**
 * Add-item bodies: an own/extra tree, a nested collection, or — Slice B (Chunk
 * 3) — a tree/branch brought in "via link" (a public slug or share token). The
 * by-link variant carries the pasted `linkInput` instead of a local `treeId`;
 * the server resolves it (400 `INVALID_TOKEN_ERROR` when it can't).
 */
export type AddItemBody =
  | {
      kind: 'tree';
      treeId: string;
      linkMode: ItemLinkMode;
      titleAr: string;
      descriptionAr?: string;
    }
  | {
      kind: 'tree';
      linkInput: string;
      linkMode: ItemLinkMode;
      titleAr: string;
      descriptionAr?: string;
    }
  | {
      kind: 'collection';
      childCollectionId: string;
      titleAr: string;
      descriptionAr?: string;
    };

export async function addItem(
  workspaceId: string,
  collectionId: string,
  body: AddItemBody,
): Promise<CollectionItem> {
  const row = await unwrap<Record<string, unknown>>(
    await apiFetch(
      `/api/workspaces/${workspaceId}/collections/${collectionId}/items`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    ),
  );
  return normalizeItem(row);
}

export async function updateItem(
  workspaceId: string,
  collectionId: string,
  itemId: string,
  input: { titleAr?: string; descriptionAr?: string | null; sortOrder?: number },
): Promise<void> {
  await unwrap(
    await apiFetch(
      `/api/workspaces/${workspaceId}/collections/${collectionId}/items/${itemId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
    ),
  );
}

export async function removeItem(
  workspaceId: string,
  collectionId: string,
  itemId: string,
): Promise<void> {
  await unwrap(
    await apiFetch(
      `/api/workspaces/${workspaceId}/collections/${collectionId}/items/${itemId}`,
      { method: 'DELETE' },
    ),
  );
}

// --- collection publish (Chunk 4) ------------------------------------------

/**
 * The wire enum the visibility route expects — the same `TreeVisibility` enum
 * the rest of the platform uses. The UI ladder (`Visibility`) maps onto it here
 * so the route never sees the UI shorthand.
 */
export type WireVisibility = 'private' | 'public_link' | 'public_listed';

/** UI ladder level → the DB `TreeVisibility` enum the route stores. */
export function toWireVisibility(level: Visibility): WireVisibility {
  switch (level) {
    case 'link':
      return 'public_link';
    case 'search':
      return 'public_listed';
    default:
      return 'private';
  }
}

/** A borrowed (foreign-workspace) tree that is not yet search-listed (Slice C). */
export interface NotListedBorrowedTree {
  titleAr: string;
  sourceWorkspaceNameAr: string;
}

/** Response of `PATCH .../collections/[collectionId]/visibility`. */
export interface CollectionVisibilityResult {
  publicSlug: string;
  visibility: string;
  /**
   * True when a search-listed publish was DOWNGRADED to public_link because a
   * borrowed tree is still not listed (we can never change another workspace's
   * tree). The collection is published by-link only.
   */
  listedBlocked?: boolean;
  /** The borrowed families that blocked listing (shown so the owner can act). */
  blockingBorrowed?: NotListedBorrowedTree[];
}

/**
 * Response of `GET .../collections/[collectionId]/publish-preview` — the §3
 * withhold preview shown before publishing: which member-private trees will be
 * hidden from visitors, how many remain publishable, and the current state.
 * Slice C adds the listing-readiness breakdown (own not-listed trees the owner
 * may promote, borrowed not-listed trees that block listing).
 */
export interface CollectionPublishPreview {
  /** Trees that will be WITHHELD when the collection goes public (§3). */
  withheldTrees: { titleAr: string }[];
  /** How many trees would actually be shown to visitors. */
  publishableCount: number;
  /** Present once published; null while private. */
  publicSlug: string | null;
  currentVisibility: string;
  /** True when every servable leaf tree is already public_listed. */
  fullyListable: boolean;
  /** The caller's OWN public_link trees — promotable to listed in one click. */
  notListedOwnTrees: { treeId: string; titleAr: string }[];
  /** Borrowed trees that are not listed — block listing (ask source or remove). */
  notListedBorrowedTrees: NotListedBorrowedTree[];
}

/**
 * Publish / re-level / unpublish a collection. Maps the UI ladder level to the
 * DB enum, PATCHes the visibility route, and returns the new slug + level. When
 * listing (`search`), `promoteOwnTreesToListed` opts to flip the caller's own
 * public_link leaf trees to listed in the same call (Slice C).
 */
export async function setCollectionVisibility(
  workspaceId: string,
  collectionId: string,
  level: Visibility,
  promoteOwnTreesToListed?: boolean,
): Promise<CollectionVisibilityResult> {
  return unwrap<CollectionVisibilityResult>(
    await apiFetch(
      `/api/workspaces/${workspaceId}/collections/${collectionId}/visibility`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visibility: toWireVisibility(level),
          ...(promoteOwnTreesToListed ? { promoteOwnTreesToListed: true } : {}),
        }),
      },
    ),
  );
}

/** Fetch the §3 withhold preview for a collection before publishing it. */
export async function getCollectionPublishPreview(
  workspaceId: string,
  collectionId: string,
): Promise<CollectionPublishPreview> {
  return unwrap<CollectionPublishPreview>(
    await apiFetch(
      `/api/workspaces/${workspaceId}/collections/${collectionId}/publish-preview`,
    ),
  );
}


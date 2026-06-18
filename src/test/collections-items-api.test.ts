import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

const mockMembershipFindUnique = vi.fn();
const mockWorkspaceFindUnique = vi.fn();
const mockCollectionFindFirst = vi.fn();
const mockTreeFindFirst = vi.fn();
const mockTreeCreate = vi.fn();
const mockItemCreate = vi.fn();
const mockItemFindFirst = vi.fn();
const mockItemFindMany = vi.fn();
const mockItemUpdateMany = vi.fn();
const mockItemFindUnique = vi.fn();
const mockItemDeleteMany = vi.fn();
const mockItemCount = vi.fn();
const mockPointerCreate = vi.fn();
// $transaction runs its callback inline (no real tx in unit tests). The tx
// client proxies to the same module-level mocks a real interactive tx exposes,
// so functions that thread `tx` (cycle guard + addItem + dedupe count) still
// hit the spies.
const txClient = {
  collectionItem: {
    create: (...a: unknown[]) => mockItemCreate(...a),
    findFirst: (...a: unknown[]) => mockItemFindFirst(...a),
    findMany: (...a: unknown[]) => mockItemFindMany(...a),
    count: (...a: unknown[]) => mockItemCount(...a),
  },
  branchPointer: {
    create: (...a: unknown[]) => mockPointerCreate(...a),
  },
};
const mockTransaction = vi.fn((fn: (tx: unknown) => unknown) => fn(txClient));

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: { findUnique: (...a: unknown[]) => mockMembershipFindUnique(...a) },
    workspace: { findUnique: (...a: unknown[]) => mockWorkspaceFindUnique(...a) },
    collection: { findFirst: (...a: unknown[]) => mockCollectionFindFirst(...a) },
    familyTree: {
      findFirst: (...a: unknown[]) => mockTreeFindFirst(...a),
      create: (...a: unknown[]) => mockTreeCreate(...a),
    },
    collectionItem: {
      create: (...a: unknown[]) => mockItemCreate(...a),
      findFirst: (...a: unknown[]) => mockItemFindFirst(...a),
      findMany: (...a: unknown[]) => mockItemFindMany(...a),
      updateMany: (...a: unknown[]) => mockItemUpdateMany(...a),
      findUnique: (...a: unknown[]) => mockItemFindUnique(...a),
      deleteMany: (...a: unknown[]) => mockItemDeleteMany(...a),
      count: (...a: unknown[]) => mockItemCount(...a),
    },
    branchPointer: { create: (...a: unknown[]) => mockPointerCreate(...a) },
    $transaction: (fn: (tx: unknown) => unknown) => mockTransaction(fn),
  },
  isUniqueViolation: (err: unknown) =>
    !!err && typeof err === 'object' && 'code' in err && err.code === 'P2002',
}));

// Add-by-link resolution + cross-workspace deep-copy are unit-tested on their
// own (collections-resolve-link / collections-copy-borrowed); the route tests
// mock them to focus on route wiring (gate → resolve → bind).
const mockResolveLink = vi.fn();
const mockResolveWholeRoot = vi.fn();
vi.mock('@/lib/collections/resolve-link', () => ({
  resolveLinkSource: (...a: unknown[]) => mockResolveLink(...a),
  resolvePublicTreeRoot: (...a: unknown[]) => mockResolveWholeRoot(...a),
  WHOLE_TREE_ROOT: '__whole_tree__',
}));
const mockCopyBorrowed = vi.fn();
vi.mock('@/lib/collections/copy-borrowed', () => ({
  copyBorrowedBranchIntoNewExtraTree: (...a: unknown[]) => mockCopyBorrowed(...a),
}));

// The cycle guard is exercised against a stubbed DB edge map.
const mockDetectCycle = vi.fn();
vi.mock('@/lib/collections/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/collections/queries')>();
  return {
    ...actual,
    detectCollectionCycleInWorkspace: (...a: unknown[]) => mockDetectCycle(...a),
  };
});

// Deep-copy: keep the pure prepare; stub persist (DB writes) + the source read.
const mockPersistDeepCopy = vi.fn();
vi.mock('@/lib/tree/branch-pointer-deep-copy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tree/branch-pointer-deep-copy')>();
  return { ...actual, persistDeepCopy: (...a: unknown[]) => mockPersistDeepCopy(...a) };
});

// The copied case reads the source tree + key + maps to GedcomData.
const mockGetTreeForCopy = vi.fn();
vi.mock('@/lib/collections/copy', () => ({
  copyTreeIntoNewExtraTree: (...a: unknown[]) => mockGetTreeForCopy(...a),
}));

import { NextRequest } from 'next/server';

const wsId = 'ws-uuid-collections';
const fakeUser = { id: 'user-uuid-1', email: 'a@b.com' };
const COLL_ID = 'c0000000-0000-4000-a000-000000000001';
const ITEM_ID = 'i0000000-0000-4000-a000-000000000001';
const TREE_ID = 'a0000000-0000-4000-a000-0000000000aa';
const CHILD_COLL_ID = 'c0000000-0000-4000-a000-000000000002';

function mockAuth() { mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null }); }
function mockMember() { mockMembershipFindUnique.mockResolvedValue({ userId: fakeUser.id, workspaceId: wsId, role: 'workspace_member', permissions: [] }); }
function mockEditor() { mockMembershipFindUnique.mockResolvedValue({ userId: fakeUser.id, workspaceId: wsId, role: 'workspace_member', permissions: ['collection_editor'] }); }
function collectionsOn() { mockWorkspaceFindUnique.mockResolvedValue({ enableCollections: true }); }
function collectionsOff() { mockWorkspaceFindUnique.mockResolvedValue({ enableCollections: false }); }
function collectionExists() { mockCollectionFindFirst.mockResolvedValue({ id: COLL_ID, workspaceId: wsId }); }

const itemsUrl = `http://localhost:3000/api/workspaces/${wsId}/collections/${COLL_ID}/items`;
function postReq(body: object) {
  return new NextRequest(itemsUrl, { method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
function patchReq(body: object) {
  return new NextRequest(`${itemsUrl}/${ITEM_ID}`, { method: 'PATCH', headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
function deleteReq() {
  return new NextRequest(`${itemsUrl}/${ITEM_ID}`, { method: 'DELETE', headers: { authorization: 'Bearer t' } });
}

const collParams = { params: Promise.resolve({ id: wsId, collectionId: COLL_ID }) };
const itemParams = { params: Promise.resolve({ id: wsId, collectionId: COLL_ID, itemId: ITEM_ID }) };

// ===========================================================================
// POST items — gates
// ===========================================================================
describe('POST items — gates', () => {
  beforeEach(() => vi.clearAllMocks());

  test('404 when collections off', async () => {
    mockAuth();
    collectionsOff();
    const { POST } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/route');
    const res = await POST(postReq({ kind: 'tree', treeId: TREE_ID, linkMode: 'linked', titleAr: 'ت' }), collParams);
    expect(res.status).toBe(404);
  });

  test('403 for plain member', async () => {
    collectionsOn();
    mockAuth();
    mockMember();
    const { POST } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/route');
    const res = await POST(postReq({ kind: 'tree', treeId: TREE_ID, linkMode: 'linked', titleAr: 'ت' }), collParams);
    expect(res.status).toBe(403);
  });

  test('404 when parent collection not in workspace', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    mockCollectionFindFirst.mockResolvedValue(null);
    const { POST } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/route');
    const res = await POST(postReq({ kind: 'tree', treeId: TREE_ID, linkMode: 'linked', titleAr: 'ت' }), collParams);
    expect(res.status).toBe(404);
  });

  test('400 for invalid body', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    collectionExists();
    const { POST } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/route');
    // tree branch requires exactly one of treeId/linkInput; neither here.
    const res = await POST(postReq({ kind: 'tree', linkMode: 'linked', titleAr: 'ت' }), collParams);
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// POST items — own tree (linked)
// ===========================================================================
describe('POST items — own tree linked', () => {
  beforeEach(() => vi.clearAllMocks());

  test('201 references the existing tree directly (no copy)', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    collectionExists();
    mockTreeFindFirst.mockResolvedValue({ id: TREE_ID, workspaceId: wsId, kind: 'extra' });
    mockItemCreate.mockResolvedValue({ id: ITEM_ID, kind: 'tree', treeId: TREE_ID, linkMode: 'linked', sortOrder: 0 });
    mockItemFindFirst.mockResolvedValue(null); // no existing items → sortOrder 0
    mockItemCount.mockResolvedValue(0); // tree not already in collection
    const { POST } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/route');
    const res = await POST(postReq({ kind: 'tree', treeId: TREE_ID, linkMode: 'linked', titleAr: 'فرع' }), collParams);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.treeId).toBe(TREE_ID);
    expect(mockTreeCreate).not.toHaveBeenCalled();
  });

  test('404 when treeId is not a tree in this workspace', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    collectionExists();
    mockTreeFindFirst.mockResolvedValue(null);
    const { POST } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/route');
    const res = await POST(postReq({ kind: 'tree', treeId: TREE_ID, linkMode: 'linked', titleAr: 'فرع' }), collParams);
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// POST items — duplicate-add guard (the same tree/collection only once)
// ===========================================================================
describe('POST items — duplicate guard', () => {
  beforeEach(() => vi.clearAllMocks());

  test('409 when the same treeId is already an item in this collection', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    collectionExists();
    mockTreeFindFirst.mockResolvedValue({ id: TREE_ID, workspaceId: wsId, kind: 'extra' });
    mockItemCount.mockResolvedValue(1); // tree already present
    const { POST } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/route');
    const res = await POST(postReq({ kind: 'tree', treeId: TREE_ID, linkMode: 'linked', titleAr: 'فرع' }), collParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('هذه الشجرة مضافة بالفعل إلى المجموعة');
    expect(mockItemCreate).not.toHaveBeenCalled();
  });

  test('409 when the same childCollectionId is already nested in this collection', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    mockCollectionFindFirst
      .mockResolvedValueOnce({ id: COLL_ID, workspaceId: wsId }) // parent existence
      .mockResolvedValueOnce({ id: CHILD_COLL_ID, workspaceId: wsId }); // child existence
    mockDetectCycle.mockResolvedValue(false);
    mockItemCount.mockResolvedValue(1); // child already nested
    const { POST } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/route');
    const res = await POST(postReq({ kind: 'collection', childCollectionId: CHILD_COLL_ID, titleAr: 'فرعية' }), collParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('هذه المجموعة مضافة بالفعل');
    expect(mockItemCreate).not.toHaveBeenCalled();
  });

  test('201 when a DIFFERENT tree is added (dedupe is per-source, not blanket)', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    collectionExists();
    const OTHER_TREE = 'a0000000-0000-4000-a000-0000000000bb';
    mockTreeFindFirst.mockResolvedValue({ id: OTHER_TREE, workspaceId: wsId, kind: 'extra' });
    mockItemCount.mockResolvedValue(0); // this tree not present yet
    mockItemFindFirst.mockResolvedValue(null);
    mockItemCreate.mockResolvedValue({ id: ITEM_ID, kind: 'tree', treeId: OTHER_TREE, linkMode: 'linked', sortOrder: 1 });
    const { POST } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/route');
    const res = await POST(postReq({ kind: 'tree', treeId: OTHER_TREE, linkMode: 'linked', titleAr: 'فرع آخر' }), collParams);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.treeId).toBe(OTHER_TREE);
    expect(mockItemCreate).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// POST items — DB unique constraint race backstop (P2002 → 409)
//
// The in-transaction pre-check (mockItemCount → 0) lets the insert through, but
// a concurrent identical add wins the race so the INSERT trips the DB unique
// index. Prisma surfaces that as P2002 — the route must map it to the SAME 409
// + Arabic message the friendly pre-check returns.
// ===========================================================================
describe('POST items — P2002 unique-constraint race backstop', () => {
  beforeEach(() => vi.clearAllMocks());

  function p2002() {
    return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
  }

  test('409 with the tree message when the tree-path insert trips P2002', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    collectionExists();
    mockTreeFindFirst.mockResolvedValue({ id: TREE_ID, workspaceId: wsId, kind: 'extra' });
    mockItemCount.mockResolvedValue(0); // pre-check passes (the race window)
    mockItemFindFirst.mockResolvedValue(null);
    mockItemCreate.mockRejectedValue(p2002()); // concurrent add won the race
    const { POST } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/route');
    const res = await POST(postReq({ kind: 'tree', treeId: TREE_ID, linkMode: 'linked', titleAr: 'فرع' }), collParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('هذه الشجرة مضافة بالفعل إلى المجموعة');
  });

  test('409 with the nested message when the nested-path insert trips P2002', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    mockCollectionFindFirst
      .mockResolvedValueOnce({ id: COLL_ID, workspaceId: wsId }) // parent existence
      .mockResolvedValueOnce({ id: CHILD_COLL_ID, workspaceId: wsId }); // child existence
    mockDetectCycle.mockResolvedValue(false);
    mockItemCount.mockResolvedValue(0); // pre-check passes (the race window)
    mockItemFindFirst.mockResolvedValue(null);
    mockItemCreate.mockRejectedValue(p2002()); // concurrent nest won the race
    const { POST } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/route');
    const res = await POST(postReq({ kind: 'collection', childCollectionId: CHILD_COLL_ID, titleAr: 'فرعية' }), collParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('هذه المجموعة مضافة بالفعل');
  });
});

// ===========================================================================
// POST items — own tree (copied → new extra tree + provenance)
// ===========================================================================
describe('POST items — own tree copied', () => {
  beforeEach(() => vi.clearAllMocks());

  test('201 deep-copies the tree into a NEW extra tree and points the item at the copy', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    collectionExists();
    mockTreeFindFirst.mockResolvedValue({ id: TREE_ID, workspaceId: wsId, kind: 'main' });
    const NEW_TREE = 't0000000-0000-4000-a000-0000000000ff';
    // The copy helper provisions the new extra tree + writes provenance, returns its id.
    mockGetTreeForCopy.mockResolvedValue({ newTreeId: NEW_TREE });
    mockItemFindFirst.mockResolvedValue({ sortOrder: 2 }); // existing max
    mockItemCount.mockResolvedValue(0); // copy target not already in collection
    mockItemCreate.mockResolvedValue({ id: ITEM_ID, kind: 'tree', treeId: NEW_TREE, linkMode: 'copied', sortOrder: 3 });

    const { POST } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/route');
    const res = await POST(postReq({ kind: 'tree', treeId: TREE_ID, linkMode: 'copied', titleAr: 'نسخة' }), collParams);
    expect(res.status).toBe(201);
    const body = await res.json();
    // Item points at the NEW copied tree, not the original.
    expect(body.data.treeId).toBe(NEW_TREE);
    expect(mockGetTreeForCopy).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// POST items — nested collection
// ===========================================================================
describe('POST items — nested collection', () => {
  beforeEach(() => vi.clearAllMocks());

  test('201 nests a cycle-free child collection', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    collectionExists();
    // child collection exists in this workspace
    mockCollectionFindFirst
      .mockResolvedValueOnce({ id: COLL_ID, workspaceId: wsId }) // parent existence
      .mockResolvedValueOnce({ id: CHILD_COLL_ID, workspaceId: wsId }); // child existence
    mockDetectCycle.mockResolvedValue(false);
    mockItemFindFirst.mockResolvedValue(null);
    mockItemCount.mockResolvedValue(0); // child not already nested here
    mockItemCreate.mockResolvedValue({ id: ITEM_ID, kind: 'collection', childCollectionId: CHILD_COLL_ID, sortOrder: 0 });
    const { POST } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/route');
    const res = await POST(postReq({ kind: 'collection', childCollectionId: CHILD_COLL_ID, titleAr: 'فرعية' }), collParams);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.childCollectionId).toBe(CHILD_COLL_ID);
  });

  test('409 when nesting would create a cycle', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    mockCollectionFindFirst
      .mockResolvedValueOnce({ id: COLL_ID, workspaceId: wsId })
      .mockResolvedValueOnce({ id: CHILD_COLL_ID, workspaceId: wsId });
    mockDetectCycle.mockResolvedValue(true);
    const { POST } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/route');
    const res = await POST(postReq({ kind: 'collection', childCollectionId: CHILD_COLL_ID, titleAr: 'فرعية' }), collParams);
    expect(res.status).toBe(409);
    expect(mockItemCreate).not.toHaveBeenCalled();
  });

  test('404 when child collection not in workspace', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    mockCollectionFindFirst
      .mockResolvedValueOnce({ id: COLL_ID, workspaceId: wsId })
      .mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/route');
    const res = await POST(postReq({ kind: 'collection', childCollectionId: CHILD_COLL_ID, titleAr: 'فرعية' }), collParams);
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// POST items — add-by-link (Chunk 3 / Slice A)
//
// linkInput resolves a pasted public-tree URL/slug or a private share code.
// `linked` → a self-anchored branchPointer bound to the item; `copied` →
// cross-workspace deep-copy into a new extra tree bound to the item. One
// generic 400 on an unresolvable/forbidden link (no enumeration oracle).
// ===========================================================================
describe('POST items — add-by-link (linkInput)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // The IP-keyed link-resolve limiter is module-level in-memory state; reset it
    // so an earlier add-by-link test in this block can't exhaust it for a later
    // one (all NextRequests share the same localhost IP key).
    const { collectionLinkResolveLimiter } = await import('@/lib/api/rate-limit');
    collectionLinkResolveLimiter.reset();
  });

  const SOURCE_WS = 'ws-source-9999';
  const BORROW_ROOT = 'ind-borrow-root';
  const linkedSource = {
    type: 'private-token' as const,
    sourceWorkspaceId: SOURCE_WS,
    sourceTreeId: 'tree-src-0000',
    rootIndividualId: BORROW_ROOT,
    depthLimit: 3,
    includeGrafts: true,
    isPublic: false,
    shareTokenId: 'tok-9',
    allowReuse: true,
  };

  test('404 (one generic error) when the link does not resolve', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    collectionExists();
    mockResolveLink.mockResolvedValue(null); // unknown / revoked / reuse-off — all the same
    const { POST } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/route');
    const res = await POST(postReq({ kind: 'tree', linkInput: 'brsh_bad', linkMode: 'linked', titleAr: 'مجلوب' }), collParams);
    // ONE generic 404 — no exists-but-forbidden oracle (S9).
    expect(res.status).toBe(404);
    expect(mockItemCreate).not.toHaveBeenCalled();
    expect(mockPointerCreate).not.toHaveBeenCalled();
  });

  // The owner pasted a link to their OWN published tree. The link already
  // identifies the tree, so this just ADDS it as a live-linked own-tree item —
  // no 404, no pointer, no copy. (Even if the source has allowReuse=false: the
  // cross-workspace reuse gate doesn't apply to your own workspace.)
  test('self-source public-slug paste → 201 linked own-tree item bound to that treeId (allowReuse ignored)', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    collectionExists();
    const OWN_TREE = 'a0000000-0000-4000-a000-0000000000ee';
    mockResolveLink.mockResolvedValue({
      type: 'public-slug', sourceWorkspaceId: wsId, sourceTreeId: OWN_TREE,
      rootIndividualId: '__whole_tree__', depthLimit: null, includeGrafts: false,
      isPublic: true, shareTokenId: null, allowReuse: false, // reuse off, but it's our own tree
    });
    mockItemCount.mockResolvedValue(0); // tree not already in collection
    mockItemFindFirst.mockResolvedValue(null);
    mockItemCreate.mockResolvedValue({ id: ITEM_ID, kind: 'tree', treeId: OWN_TREE, linkMode: 'linked', sortOrder: 0 });
    const { POST } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/route');
    const res = await POST(postReq({ kind: 'tree', linkInput: `https://x/family/own-slug`, linkMode: 'linked', titleAr: 'شجرتي' }), collParams);
    expect(res.status).toBe(201);
    const body = await res.json();
    // Bound directly to the own tree id — a LINKED item, no pointer, no copy.
    expect(body.data.treeId).toBe(OWN_TREE);
    expect(mockPointerCreate).not.toHaveBeenCalled();
    expect(mockCopyBorrowed).not.toHaveBeenCalled();
    expect(mockTreeCreate).not.toHaveBeenCalled();
    // The created item is a linked own-tree row pointing at the resolved treeId.
    const itemData = mockItemCreate.mock.calls[0][0].data;
    expect(itemData.linkMode).toBe('linked');
    expect(itemData.treeId).toBe(OWN_TREE);
  });

  test('self-source re-add of the same own tree → 409 tree-dup (NOT the link error)', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    collectionExists();
    const OWN_TREE = 'a0000000-0000-4000-a000-0000000000ee';
    mockResolveLink.mockResolvedValue({
      type: 'public-slug', sourceWorkspaceId: wsId, sourceTreeId: OWN_TREE,
      rootIndividualId: '__whole_tree__', depthLimit: null, includeGrafts: false,
      isPublic: true, shareTokenId: null, allowReuse: true,
    });
    mockItemCount.mockResolvedValue(1); // own tree already an item in this collection
    const { POST } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/route');
    const res = await POST(postReq({ kind: 'tree', linkInput: `https://x/family/own-slug`, linkMode: 'linked', titleAr: 'شجرتي' }), collParams);
    expect(res.status).toBe(409);
    const body = await res.json();
    // Same tree-dup message the direct picker returns — NOT the generic link error.
    expect(body.error).toBe('هذه الشجرة مضافة بالفعل إلى المجموعة');
    expect(mockItemCreate).not.toHaveBeenCalled();
  });

  test('self-source with linkMode copied → still a LINKED add (linkMode ignored for own tree)', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    collectionExists();
    const OWN_TREE = 'a0000000-0000-4000-a000-0000000000ee';
    mockResolveLink.mockResolvedValue({
      type: 'public-slug', sourceWorkspaceId: wsId, sourceTreeId: OWN_TREE,
      rootIndividualId: '__whole_tree__', depthLimit: null, includeGrafts: false,
      isPublic: true, shareTokenId: null, allowReuse: true,
    });
    mockItemCount.mockResolvedValue(0);
    mockItemFindFirst.mockResolvedValue(null);
    mockItemCreate.mockResolvedValue({ id: ITEM_ID, kind: 'tree', treeId: OWN_TREE, linkMode: 'linked', sortOrder: 0 });
    const { POST } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/route');
    const res = await POST(postReq({ kind: 'tree', linkInput: `https://x/family/own-slug`, linkMode: 'copied', titleAr: 'شجرتي' }), collParams);
    expect(res.status).toBe(201);
    // No cross-workspace copy for an own-tree paste, even with linkMode:'copied'.
    expect(mockCopyBorrowed).not.toHaveBeenCalled();
    expect(mockTreeCreate).not.toHaveBeenCalled();
    const itemData = mockItemCreate.mock.calls[0][0].data;
    expect(itemData.linkMode).toBe('linked');
    expect(itemData.treeId).toBe(OWN_TREE);
  });

  test('cross-workspace non-reusable source → generic 404 (reuse gate now in addByLink)', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    collectionExists();
    // Resolved a real cross-workspace source, but reuse is OFF → generic 404.
    mockResolveLink.mockResolvedValue({
      type: 'public-slug', sourceWorkspaceId: SOURCE_WS, sourceTreeId: 'tree-src-0000',
      rootIndividualId: '__whole_tree__', depthLimit: null, includeGrafts: false,
      isPublic: true, shareTokenId: null, allowReuse: false,
    });
    const { POST } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/route');
    const res = await POST(postReq({ kind: 'tree', linkInput: 'https://x/family/slug', linkMode: 'linked', titleAr: 'مجلوب' }), collParams);
    expect(res.status).toBe(404);
    expect(mockPointerCreate).not.toHaveBeenCalled();
    expect(mockItemCreate).not.toHaveBeenCalled();
  });

  test('201 linked: creates an ANCHOR-LESS branchPointer and binds the item to it (zero bytes copied)', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    collectionExists();
    mockResolveLink.mockResolvedValue(linkedSource);
    mockPointerCreate.mockResolvedValue({ id: 'ptr-new-0001' });
    mockItemCount.mockResolvedValue(0); // not already borrowed here
    mockItemFindFirst.mockResolvedValue(null);
    mockItemCreate.mockResolvedValue({ id: ITEM_ID, kind: 'tree', branchPointerId: 'ptr-new-0001', linkMode: 'linked', sortOrder: 0 });
    const { POST } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/route');
    const res = await POST(postReq({ kind: 'tree', linkInput: 'brsh_ok', linkMode: 'linked', titleAr: 'مجلوب' }), collParams);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.branchPointerId).toBe('ptr-new-0001');
    // No deep copy occurred for a linked borrow.
    expect(mockCopyBorrowed).not.toHaveBeenCalled();
    // The pointer is a COLLECTION-LINK pointer: isCollectionLink=true is the
    // discriminator that keeps it out of the member-tree merge; anchor/selected/
    // relationship are null (no stitch); target = adding workspace, root = the
    // real borrowed root.
    const ptrData = mockPointerCreate.mock.calls[0][0].data;
    expect(ptrData.sourceWorkspaceId).toBe(SOURCE_WS);
    expect(ptrData.targetWorkspaceId).toBe(wsId);
    expect(ptrData.rootIndividualId).toBe(BORROW_ROOT);
    expect(ptrData.isCollectionLink).toBe(true);
    expect(ptrData.anchorIndividualId).toBeNull();
    expect(ptrData.selectedIndividualId).toBeNull();
    expect(ptrData.relationship).toBeNull();
    expect(ptrData.shareTokenId).toBe('tok-9');
  });

  test('201 copied: deep-copies the borrowed branch into a new extra tree and binds treeId', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    collectionExists();
    mockResolveLink.mockResolvedValue(linkedSource);
    const NEW_TREE = 't0000000-0000-4000-a000-00000000cccc';
    mockCopyBorrowed.mockResolvedValue({ newTreeId: NEW_TREE, peopleCount: 4 });
    mockItemCount.mockResolvedValue(0);
    mockItemFindFirst.mockResolvedValue(null);
    mockItemCreate.mockResolvedValue({ id: ITEM_ID, kind: 'tree', treeId: NEW_TREE, linkMode: 'copied', sortOrder: 0 });
    const { POST } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/route');
    const res = await POST(postReq({ kind: 'tree', linkInput: 'brsh_ok', linkMode: 'copied', titleAr: 'نسخة مجلوبة' }), collParams);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.treeId).toBe(NEW_TREE);
    expect(mockCopyBorrowed).toHaveBeenCalledOnce();
    // No live pointer for a copied borrow.
    expect(mockPointerCreate).not.toHaveBeenCalled();
  });

  test('linked from a public-slug source resolves a REAL root id for the pointer (never the whole-tree sentinel)', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    collectionExists();
    const REAL_ROOT = 'ind-real-root-1';
    // Public-slug source → the resolver hands back the whole-tree sentinel root.
    mockResolveLink.mockResolvedValue({
      type: 'public-slug', sourceWorkspaceId: SOURCE_WS, sourceTreeId: 'tree-src-0000',
      rootIndividualId: '__whole_tree__', depthLimit: null, includeGrafts: false,
      isPublic: true, shareTokenId: null, allowReuse: true,
    });
    // The route must resolve the real topmost-ancestor id before binding the FK.
    mockResolveWholeRoot.mockResolvedValue(REAL_ROOT);
    mockPointerCreate.mockResolvedValue({ id: 'ptr-pub-0001' });
    mockItemCount.mockResolvedValue(0);
    mockItemFindFirst.mockResolvedValue(null);
    mockItemCreate.mockResolvedValue({ id: ITEM_ID, kind: 'tree', branchPointerId: 'ptr-pub-0001', linkMode: 'linked', sortOrder: 0 });
    const { POST } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/route');
    const res = await POST(postReq({ kind: 'tree', linkInput: 'https://x/family/slug', linkMode: 'linked', titleAr: 'شجرة عامة' }), collParams);
    expect(res.status).toBe(201);
    const ptrData = mockPointerCreate.mock.calls[0][0].data;
    // rootIndividualId is the REAL topmost ancestor (never the sentinel) so the
    // root FK holds; anchor stays NULL (anchor-less).
    expect(ptrData.rootIndividualId).toBe(REAL_ROOT);
    expect(ptrData.rootIndividualId).not.toBe('__whole_tree__');
    expect(ptrData.anchorIndividualId).toBeNull();
  });

  // Scenario 4: a PUBLISHED EXTRA tree in another workspace, reuse on, linked.
  // The root must be resolved from THAT extra tree (by id), and the pointer must
  // record the extra tree's source workspace — proving extra trees are borrowable.
  test('cross-workspace published+reusable EXTRA tree (linked) borrows THAT extra tree', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    collectionExists();
    const EXTRA_TREE_ID = 'tree-extra-src-1';
    const REAL_ROOT = 'ind-extra-root-1';
    mockResolveLink.mockResolvedValue({
      type: 'public-slug', sourceWorkspaceId: SOURCE_WS, sourceTreeId: EXTRA_TREE_ID,
      rootIndividualId: '__whole_tree__', depthLimit: null, includeGrafts: false,
      isPublic: true, shareTokenId: null, allowReuse: true,
    });
    mockResolveWholeRoot.mockResolvedValue(REAL_ROOT);
    mockPointerCreate.mockResolvedValue({ id: 'ptr-extra-0001' });
    mockItemCount.mockResolvedValue(0);
    mockItemFindFirst.mockResolvedValue(null);
    mockItemCreate.mockResolvedValue({ id: ITEM_ID, kind: 'tree', branchPointerId: 'ptr-extra-0001', linkMode: 'linked', sortOrder: 0 });
    const { POST } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/route');
    const res = await POST(postReq({ kind: 'tree', linkInput: 'https://x/family/extra-slug', linkMode: 'linked', titleAr: 'شجرة إضافية عامة' }), collParams);
    expect(res.status).toBe(201);
    // The root was resolved from the SPECIFIC extra tree (workspace + tree id).
    expect(mockResolveWholeRoot).toHaveBeenCalledWith(SOURCE_WS, EXTRA_TREE_ID);
    const ptrData = mockPointerCreate.mock.calls[0][0].data;
    expect(ptrData.sourceWorkspaceId).toBe(SOURCE_WS);
    expect(ptrData.rootIndividualId).toBe(REAL_ROOT);
  });

  test('404 when a public-slug source has no resolvable root (empty source tree)', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    collectionExists();
    mockResolveLink.mockResolvedValue({
      type: 'public-slug', sourceWorkspaceId: SOURCE_WS, sourceTreeId: 'tree-src-0000',
      rootIndividualId: '__whole_tree__', depthLimit: null, includeGrafts: false,
      isPublic: true, shareTokenId: null, allowReuse: true,
    });
    mockResolveWholeRoot.mockResolvedValue(null); // empty / unresolvable source tree
    const { POST } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/route');
    const res = await POST(postReq({ kind: 'tree', linkInput: 'https://x/family/slug', linkMode: 'linked', titleAr: 'شجرة عامة' }), collParams);
    expect(res.status).toBe(404);
    expect(mockPointerCreate).not.toHaveBeenCalled();
  });

  test('409 when the same borrowed source is already linked in this collection', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    collectionExists();
    mockResolveLink.mockResolvedValue(linkedSource);
    mockItemCount.mockResolvedValue(1); // already borrowed here (same source root + workspace)
    const { POST } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/route');
    const res = await POST(postReq({ kind: 'tree', linkInput: 'brsh_ok', linkMode: 'linked', titleAr: 'مجلوب' }), collParams);
    expect(res.status).toBe(409);
    expect(mockItemCreate).not.toHaveBeenCalled();
    expect(mockPointerCreate).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// PATCH item
// ===========================================================================
describe('PATCH item', () => {
  beforeEach(() => vi.clearAllMocks());

  test('200 updates item title/sortOrder', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    mockItemUpdateMany.mockResolvedValue({ count: 1 });
    mockItemFindUnique.mockResolvedValue({ id: ITEM_ID, titleAr: 'محدث', sortOrder: 5 });
    const { PATCH } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/[itemId]/route');
    const res = await PATCH(patchReq({ titleAr: 'محدث', sortOrder: 5 }), itemParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.titleAr).toBe('محدث');
  });

  test('404 when item not in collection', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    collectionExists();
    mockItemUpdateMany.mockResolvedValue({ count: 0 });
    const { PATCH } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/[itemId]/route');
    const res = await PATCH(patchReq({ titleAr: 'محدث' }), itemParams);
    expect(res.status).toBe(404);
  });

  test('404 when collection belongs to another workspace (cross-tenant IDOR)', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    // Collection lives in workspace B, not the URL's workspace A → not found.
    mockCollectionFindFirst.mockResolvedValue(null);
    const { PATCH } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/[itemId]/route');
    const res = await PATCH(patchReq({ titleAr: 'محدث' }), itemParams);
    expect(res.status).toBe(404);
    // The cross-tenant item must NOT be touched.
    expect(mockItemUpdateMany).not.toHaveBeenCalled();
  });

  test('403 for plain member', async () => {
    collectionsOn();
    mockAuth();
    mockMember();
    const { PATCH } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/[itemId]/route');
    const res = await PATCH(patchReq({ titleAr: 'محدث' }), itemParams);
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// DELETE item
// ===========================================================================
describe('DELETE item', () => {
  beforeEach(() => vi.clearAllMocks());

  test('200 removes the item', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    collectionExists();
    mockItemDeleteMany.mockResolvedValue({ count: 1 });
    const { DELETE } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/[itemId]/route');
    const res = await DELETE(deleteReq(), itemParams);
    expect(res.status).toBe(200);
  });

  test('404 when item not found', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    collectionExists();
    mockItemDeleteMany.mockResolvedValue({ count: 0 });
    const { DELETE } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/[itemId]/route');
    const res = await DELETE(deleteReq(), itemParams);
    expect(res.status).toBe(404);
  });

  test('404 when collection belongs to another workspace (cross-tenant IDOR)', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    // Collection lives in workspace B, not the URL's workspace A → not found.
    mockCollectionFindFirst.mockResolvedValue(null);
    const { DELETE } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/[itemId]/route');
    const res = await DELETE(deleteReq(), itemParams);
    expect(res.status).toBe(404);
    // The cross-tenant item must NOT be deleted.
    expect(mockItemDeleteMany).not.toHaveBeenCalled();
  });

  test('403 for plain member', async () => {
    collectionsOn();
    mockAuth();
    mockMember();
    const { DELETE } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/[itemId]/route');
    const res = await DELETE(deleteReq(), itemParams);
    expect(res.status).toBe(403);
  });
});

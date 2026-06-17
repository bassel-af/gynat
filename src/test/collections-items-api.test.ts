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
    $transaction: (fn: (tx: unknown) => unknown) => mockTransaction(fn),
  },
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
// POST items — linkInput is Chunk 2 → 501
// ===========================================================================
describe('POST items — linkInput deferred', () => {
  beforeEach(() => vi.clearAllMocks());

  test('501 when linkInput is present', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    collectionExists();
    const { POST } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/items/route');
    const res = await POST(postReq({ kind: 'tree', linkInput: 'https://x/family/abc', linkMode: 'linked', titleAr: 'مجلوب' }), collParams);
    expect(res.status).toBe(501);
    expect(mockItemCreate).not.toHaveBeenCalled();
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

import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}));

const mockMembershipFindUnique = vi.fn();
const mockWorkspaceFindUnique = vi.fn();

const mockCollectionCreate = vi.fn();
const mockCollectionFindMany = vi.fn();
const mockCollectionFindFirst = vi.fn();
const mockCollectionUpdateMany = vi.fn();
const mockCollectionFindUnique = vi.fn();
const mockCollectionDeleteMany = vi.fn();

const mockCollectionItemFindMany = vi.fn();

const mockTreeFindMany = vi.fn();
const mockSourceTreeFindFirst = vi.fn();
const mockIndividualGroupBy = vi.fn();
const mockPointerFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: { findUnique: (...a: unknown[]) => mockMembershipFindUnique(...a) },
    workspace: { findUnique: (...a: unknown[]) => mockWorkspaceFindUnique(...a) },
    collection: {
      create: (...a: unknown[]) => mockCollectionCreate(...a),
      findMany: (...a: unknown[]) => mockCollectionFindMany(...a),
      findFirst: (...a: unknown[]) => mockCollectionFindFirst(...a),
      updateMany: (...a: unknown[]) => mockCollectionUpdateMany(...a),
      findUnique: (...a: unknown[]) => mockCollectionFindUnique(...a),
      deleteMany: (...a: unknown[]) => mockCollectionDeleteMany(...a),
    },
    collectionItem: {
      findMany: (...a: unknown[]) => mockCollectionItemFindMany(...a),
    },
    familyTree: {
      findMany: (...a: unknown[]) => mockTreeFindMany(...a),
      findFirst: (...a: unknown[]) => mockSourceTreeFindFirst(...a),
    },
    individual: { groupBy: (...a: unknown[]) => mockIndividualGroupBy(...a) },
    branchPointer: { findMany: (...a: unknown[]) => mockPointerFindMany(...a) },
  },
}));

import { NextRequest } from 'next/server';

const wsId = 'ws-uuid-collections';
const fakeUser = { id: 'user-uuid-1', email: 'a@b.com' };
const COLL_ID = 'c0000000-0000-4000-a000-000000000001';

function mockAuth() {
  mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
}
function mockMember() {
  mockMembershipFindUnique.mockResolvedValue({ userId: fakeUser.id, workspaceId: wsId, role: 'workspace_member', permissions: [] });
}
function mockEditor() {
  mockMembershipFindUnique.mockResolvedValue({ userId: fakeUser.id, workspaceId: wsId, role: 'workspace_member', permissions: ['collection_editor'] });
}
function collectionsOn() { mockWorkspaceFindUnique.mockResolvedValue({ enableCollections: true }); }
function collectionsOff() { mockWorkspaceFindUnique.mockResolvedValue({ enableCollections: false }); }

const base = `http://localhost:3000/api/workspaces/${wsId}/collections`;
function postReq(body: object) {
  return new NextRequest(base, { method: 'POST', headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
function getReq(qs = '') {
  return new NextRequest(`${base}${qs}`, { method: 'GET', headers: { authorization: 'Bearer t' } });
}
function getDetailReq() {
  return new NextRequest(`${base}/${COLL_ID}`, { method: 'GET', headers: { authorization: 'Bearer t' } });
}
function patchReq(body: object) {
  return new NextRequest(`${base}/${COLL_ID}`, { method: 'PATCH', headers: { authorization: 'Bearer t', 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
function deleteReq() {
  return new NextRequest(`${base}/${COLL_ID}`, { method: 'DELETE', headers: { authorization: 'Bearer t' } });
}

const listParams = { params: Promise.resolve({ id: wsId }) };
const detailParams = { params: Promise.resolve({ id: wsId, collectionId: COLL_ID }) };

// ===========================================================================
// POST /collections
// ===========================================================================
describe('POST /api/workspaces/[id]/collections', () => {
  beforeEach(() => vi.clearAllMocks());

  test('404 when collections feature is off', async () => {
    mockAuth();
    collectionsOff();
    const { POST } = await import('@/app/api/workspaces/[id]/collections/route');
    const res = await POST(postReq({ titleAr: 'دورة' }), listParams);
    expect(res.status).toBe(404);
  });

  test('403 for plain member', async () => {
    collectionsOn();
    mockAuth();
    mockMember();
    const { POST } = await import('@/app/api/workspaces/[id]/collections/route');
    const res = await POST(postReq({ titleAr: 'دورة' }), listParams);
    expect(res.status).toBe(403);
  });

  test('201 creates a private collection for editor', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    mockCollectionCreate.mockResolvedValue({ id: COLL_ID, titleAr: 'دورة', descriptionAr: null, visibility: 'private', publicSlug: null });
    const { POST } = await import('@/app/api/workspaces/[id]/collections/route');
    const res = await POST(postReq({ titleAr: 'دورة' }), listParams);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe(COLL_ID);
    expect(body.data.visibility).toBe('private');
  });

  test('400 for empty titleAr', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    const { POST } = await import('@/app/api/workspaces/[id]/collections/route');
    const res = await POST(postReq({ titleAr: '   ' }), listParams);
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// GET /collections
// ===========================================================================
describe('GET /api/workspaces/[id]/collections', () => {
  beforeEach(() => vi.clearAllMocks());

  test('member can list top-level collections with itemCount', async () => {
    collectionsOn();
    mockAuth();
    mockMember();
    // collection.findMany → all collections
    mockCollectionFindMany.mockResolvedValue([
      { id: COLL_ID, titleAr: 'دورة', descriptionAr: 'وصف', visibility: 'private', publicSlug: 'abc123' },
    ]);
    // collectionItem.findMany — one call returns all items (drives both the
    // referenced-child set and the per-collection count). 2 items, neither nests.
    mockCollectionItemFindMany.mockResolvedValue([
      { collectionId: COLL_ID, childCollectionId: null },
      { collectionId: COLL_ID, childCollectionId: null },
    ]);
    const { GET } = await import('@/app/api/workspaces/[id]/collections/route');
    const res = await GET(getReq(), listParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(COLL_ID);
    expect(body.data[0].publicCode).toBe('abc123');
    expect(body.data[0].itemCount).toBe(2);
  });

  test('top scope excludes collections nested under another collection', async () => {
    collectionsOn();
    mockAuth();
    mockMember();
    const nestedId = 'c0000000-0000-4000-a000-000000000002';
    mockCollectionFindMany.mockResolvedValue([
      { id: COLL_ID, titleAr: 'الأب', descriptionAr: null, visibility: 'private', publicSlug: null },
      { id: nestedId, titleAr: 'الابن', descriptionAr: null, visibility: 'private', publicSlug: null },
    ]);
    // One findMany returns all items: COLL_ID nests nestedId, so nestedId is
    // referenced (and thus excluded from the top scope).
    mockCollectionItemFindMany.mockResolvedValue([
      { collectionId: COLL_ID, childCollectionId: nestedId },
    ]);
    const { GET } = await import('@/app/api/workspaces/[id]/collections/route');
    const res = await GET(getReq('?scope=top'), listParams);
    const body = await res.json();
    expect(body.data.map((c: { id: string }) => c.id)).toEqual([COLL_ID]);
  });

  test('all scope returns every collection (including nested)', async () => {
    collectionsOn();
    mockAuth();
    mockMember();
    const nestedId = 'c0000000-0000-4000-a000-000000000002';
    mockCollectionFindMany.mockResolvedValue([
      { id: COLL_ID, titleAr: 'الأب', descriptionAr: null, visibility: 'private', publicSlug: null },
      { id: nestedId, titleAr: 'الابن', descriptionAr: null, visibility: 'private', publicSlug: null },
    ]);
    mockCollectionItemFindMany.mockResolvedValue([]); // item counts only
    const { GET } = await import('@/app/api/workspaces/[id]/collections/route');
    const res = await GET(getReq('?scope=all'), listParams);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
  });
});

// ===========================================================================
// GET /collections/[collectionId] — detail with shaped items
// ===========================================================================
describe('GET /api/workspaces/[id]/collections/[collectionId]', () => {
  beforeEach(() => vi.clearAllMocks());

  test('404 when collection not in this workspace', async () => {
    collectionsOn();
    mockAuth();
    mockMember();
    mockCollectionFindFirst.mockResolvedValue(null);
    const { GET } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/route');
    const res = await GET(getDetailReq(), detailParams);
    expect(res.status).toBe(404);
  });

  test('returns collection + items ordered by sortOrder with derived sourceLabel & live treeVisibility', async () => {
    collectionsOn();
    mockAuth();
    mockMember();
    const mainTreeId = 't0000000-0000-4000-a000-0000000000aa';
    const extraTreeId = 't0000000-0000-4000-a000-0000000000bb';
    const childCollId = 'c0000000-0000-4000-a000-000000000099';

    mockCollectionFindFirst.mockResolvedValue({
      id: COLL_ID, titleAr: 'دورة', descriptionAr: null, visibility: 'private', publicSlug: null,
      items: [
        { id: 'i1', kind: 'tree', titleAr: 'الرئيسية', descriptionAr: null, linkMode: 'linked', sortOrder: 0, treeId: mainTreeId, branchPointerId: null, childCollectionId: null, rootIndividualId: null },
        { id: 'i2', kind: 'tree', titleAr: 'فرع', descriptionAr: null, linkMode: 'copied', sortOrder: 1, treeId: extraTreeId, branchPointerId: null, childCollectionId: null, rootIndividualId: null },
        { id: 'i3', kind: 'collection', titleAr: 'مجموعة فرعية', descriptionAr: null, linkMode: null, sortOrder: 2, treeId: null, branchPointerId: null, childCollectionId: childCollId, rootIndividualId: null },
      ],
    });
    // Trees referenced by items (for peopleCount + kind + visibility + nameAr)
    mockTreeFindMany.mockResolvedValue([
      { id: mainTreeId, kind: 'main', nameAr: null, visibility: 'private' },
      { id: extraTreeId, kind: 'extra', nameAr: 'فرع', visibility: 'public_link' },
    ]);
    mockIndividualGroupBy.mockResolvedValue([
      { treeId: mainTreeId, _count: { _all: 5 } },
      { treeId: extraTreeId, _count: { _all: 2 } },
    ]);
    // Child collection lookup (for nested item's nameAr + effective visibility)
    mockCollectionFindMany.mockResolvedValue([
      { id: childCollId, titleAr: 'مجموعة فرعية', visibility: 'private' },
    ]);

    const { GET } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/route');
    const res = await GET(getDetailReq(), detailParams);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.collection.id).toBe(COLL_ID);
    expect(body.items).toHaveLength(3);

    const [main, extra, nested] = body.items;
    expect(main.sourceLabel).toBe('own-main');
    expect(main.peopleCount).toBe(5);
    expect(main.treeVisibility).toBe('private');

    expect(extra.sourceLabel).toBe('extra');
    expect(extra.peopleCount).toBe(2);
    // Effective visibility is read LIVE from the tree, not stored on the item.
    expect(extra.treeVisibility).toBe('public_link');
    expect(extra.sourceNameAr).toBe('فرع');

    expect(nested.sourceLabel).toBe('nested');
    expect(nested.childCollectionId).toBe(childCollId);
    // Child collection is private → effective visibility private.
    expect(nested.treeVisibility).toBe('private');
  });

  test('shapes a borrowed (pointer-backed) item with LIVE source visibility', async () => {
    collectionsOn();
    mockAuth();
    mockMember();
    const PTR_ID = 'p0000000-0000-4000-a000-000000000001';
    const SOURCE_WS = 'ws-source-7777';

    mockCollectionFindFirst.mockResolvedValue({
      id: COLL_ID, titleAr: 'دورة', descriptionAr: null, visibility: 'private', publicSlug: null,
      items: [
        { id: 'b1', kind: 'tree', titleAr: 'فرع مجلوب', descriptionAr: null, linkMode: 'linked', sortOrder: 0, treeId: null, branchPointerId: PTR_ID, childCollectionId: null, rootIndividualId: 'ind-borrow' },
      ],
    });
    mockTreeFindMany.mockResolvedValue([]);
    mockIndividualGroupBy.mockResolvedValue([]);
    mockCollectionFindMany.mockResolvedValue([]);

    // The pointer resolves to its source workspace; the SOURCE main tree's LIVE
    // visibility decides whether the borrowed item would be withheld when public.
    mockPointerFindMany.mockResolvedValue([
      {
        id: PTR_ID,
        sourceWorkspaceId: SOURCE_WS,
        rootIndividualId: 'ind-borrow',
        sourceWorkspace: { nameAr: 'عائلة المصدر' },
        rootIndividual: { givenName: null, surname: null },
      },
    ]);
    // Source workspace's main tree is public → borrowed item is public-borrowed.
    mockSourceTreeFindFirst.mockResolvedValue({ visibility: 'public_listed' });

    const { GET } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/route');
    const res = await GET(getDetailReq(), detailParams);
    expect(res.status).toBe(200);
    const body = await res.json();

    const borrowed = body.items[0];
    expect(borrowed.sourceLabel).toBe('public-borrowed');
    expect(borrowed.treeVisibility).toBe('public_listed');
    // A public source → the item is NOT withheld when the collection publishes.
    expect(borrowed.withheldWhenPublic).toBe(false);
  });

  test('a borrowed item from a PRIVATE source is withheld when public (deny-by-default)', async () => {
    collectionsOn();
    mockAuth();
    mockMember();
    const PTR_ID = 'p0000000-0000-4000-a000-000000000002';
    const SOURCE_WS = 'ws-source-8888';

    mockCollectionFindFirst.mockResolvedValue({
      id: COLL_ID, titleAr: 'دورة', descriptionAr: null, visibility: 'private', publicSlug: null,
      items: [
        { id: 'b2', kind: 'tree', titleAr: 'فرع خاص', descriptionAr: null, linkMode: 'linked', sortOrder: 0, treeId: null, branchPointerId: PTR_ID, childCollectionId: null, rootIndividualId: 'ind-x' },
      ],
    });
    mockTreeFindMany.mockResolvedValue([]);
    mockIndividualGroupBy.mockResolvedValue([]);
    mockCollectionFindMany.mockResolvedValue([]);
    mockPointerFindMany.mockResolvedValue([
      { id: PTR_ID, sourceWorkspaceId: SOURCE_WS, rootIndividualId: 'ind-x', sourceWorkspace: { nameAr: 'عائلة' }, rootIndividual: { givenName: null, surname: null } },
    ]);
    // Source main tree is private (or missing) → fail-closed withhold.
    mockSourceTreeFindFirst.mockResolvedValue({ visibility: 'private' });

    const { GET } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/route');
    const res = await GET(getDetailReq(), detailParams);
    const body = await res.json();
    const borrowed = body.items[0];
    expect(borrowed.sourceLabel).toBe('private-shared');
    expect(borrowed.treeVisibility).toBe('private');
    expect(borrowed.withheldWhenPublic).toBe(true);
  });
});

// ===========================================================================
// PATCH /collections/[collectionId]
// ===========================================================================
describe('PATCH /api/workspaces/[id]/collections/[collectionId]', () => {
  beforeEach(() => vi.clearAllMocks());

  test('200 updates title for editor', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    mockCollectionUpdateMany.mockResolvedValue({ count: 1 });
    mockCollectionFindUnique.mockResolvedValue({ id: COLL_ID, titleAr: 'جديد', descriptionAr: null, visibility: 'private', publicSlug: null });
    const { PATCH } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/route');
    const res = await PATCH(patchReq({ titleAr: 'جديد' }), detailParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.titleAr).toBe('جديد');
  });

  test('404 when collection not found', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    mockCollectionUpdateMany.mockResolvedValue({ count: 0 });
    const { PATCH } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/route');
    const res = await PATCH(patchReq({ titleAr: 'جديد' }), detailParams);
    expect(res.status).toBe(404);
  });

  test('403 for plain member', async () => {
    collectionsOn();
    mockAuth();
    mockMember();
    const { PATCH } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/route');
    const res = await PATCH(patchReq({ titleAr: 'جديد' }), detailParams);
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// DELETE /collections/[collectionId]
// ===========================================================================
describe('DELETE /api/workspaces/[id]/collections/[collectionId]', () => {
  beforeEach(() => vi.clearAllMocks());

  test('200 deletes for editor', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    mockCollectionDeleteMany.mockResolvedValue({ count: 1 });
    const { DELETE } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/route');
    const res = await DELETE(deleteReq(), detailParams);
    expect(res.status).toBe(200);
  });

  test('404 when collection not found', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    mockCollectionDeleteMany.mockResolvedValue({ count: 0 });
    const { DELETE } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/route');
    const res = await DELETE(deleteReq(), detailParams);
    expect(res.status).toBe(404);
  });

  test('403 for plain member', async () => {
    collectionsOn();
    mockAuth();
    mockMember();
    const { DELETE } = await import('@/app/api/workspaces/[id]/collections/[collectionId]/route');
    const res = await DELETE(deleteReq(), detailParams);
    expect(res.status).toBe(403);
  });
});

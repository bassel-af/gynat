import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — integration-style route test. We mock the auth layer (Supabase) and
// the DB (Prisma) the same way the existing tree-route tests do, then call the
// real route handlers.
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}));

const mockMembershipFindUnique = vi.fn();
const mockWorkspaceFindUnique = vi.fn();
const mockTreeCreate = vi.fn();
const mockTreeFindMany = vi.fn();
const mockTreeFindFirst = vi.fn();
const mockTreeCount = vi.fn();
const mockTreeUpdateMany = vi.fn();
const mockTreeFindUnique = vi.fn();
const mockTreeDeleteMany = vi.fn();
const mockIndividualGroupBy = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: {
      findUnique: (...a: unknown[]) => mockMembershipFindUnique(...a),
    },
    workspace: {
      findUnique: (...a: unknown[]) => mockWorkspaceFindUnique(...a),
    },
    familyTree: {
      create: (...a: unknown[]) => mockTreeCreate(...a),
      findMany: (...a: unknown[]) => mockTreeFindMany(...a),
      findFirst: (...a: unknown[]) => mockTreeFindFirst(...a),
      count: (...a: unknown[]) => mockTreeCount(...a),
      updateMany: (...a: unknown[]) => mockTreeUpdateMany(...a),
      findUnique: (...a: unknown[]) => mockTreeFindUnique(...a),
      deleteMany: (...a: unknown[]) => mockTreeDeleteMany(...a),
    },
    individual: {
      groupBy: (...a: unknown[]) => mockIndividualGroupBy(...a),
    },
  },
}));

import { NextRequest } from 'next/server';

const wsId = 'ws-uuid-collections';
const fakeUser = { id: 'user-uuid-1', email: 'a@b.com' };
const TREE_ID = 'a0000000-0000-4000-a000-000000000010';

function mockAuth() {
  mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
}
function mockNoAuth() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'x' } });
}
function mockMember() {
  mockMembershipFindUnique.mockResolvedValue({
    userId: fakeUser.id, workspaceId: wsId, role: 'workspace_member', permissions: [],
  });
}
function mockEditor() {
  mockMembershipFindUnique.mockResolvedValue({
    userId: fakeUser.id, workspaceId: wsId, role: 'workspace_member', permissions: ['collection_editor'],
  });
}
function collectionsOn() {
  mockWorkspaceFindUnique.mockResolvedValue({ enableCollections: true });
}
function collectionsOff() {
  mockWorkspaceFindUnique.mockResolvedValue({ enableCollections: false });
}

function postReq(body: object) {
  return new NextRequest(`http://localhost:3000/api/workspaces/${wsId}/extra-trees`, {
    method: 'POST',
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function getReq() {
  return new NextRequest(`http://localhost:3000/api/workspaces/${wsId}/extra-trees`, {
    method: 'GET',
    headers: { authorization: 'Bearer t' },
  });
}
function patchReq(body: object) {
  return new NextRequest(`http://localhost:3000/api/workspaces/${wsId}/extra-trees/${TREE_ID}`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function deleteReq() {
  return new NextRequest(`http://localhost:3000/api/workspaces/${wsId}/extra-trees/${TREE_ID}`, {
    method: 'DELETE',
    headers: { authorization: 'Bearer t' },
  });
}

const listParams = { params: Promise.resolve({ id: wsId }) };
const itemParams = { params: Promise.resolve({ id: wsId, treeId: TREE_ID }) };

// ===========================================================================
// POST /extra-trees
// ===========================================================================
describe('POST /api/workspaces/[id]/extra-trees', () => {
  beforeEach(() => vi.clearAllMocks());

  test('404 when collections feature is off', async () => {
    mockAuth();
    collectionsOff();
    const { POST } = await import('@/app/api/workspaces/[id]/extra-trees/route');
    const res = await POST(postReq({ nameAr: 'فرع' }), listParams);
    expect(res.status).toBe(404);
  });

  test('401 when unauthenticated', async () => {
    collectionsOn();
    mockNoAuth();
    const { POST } = await import('@/app/api/workspaces/[id]/extra-trees/route');
    const res = await POST(postReq({ nameAr: 'فرع' }), listParams);
    expect(res.status).toBe(401);
  });

  test('403 for plain member without collection_editor', async () => {
    collectionsOn();
    mockAuth();
    mockMember();
    const { POST } = await import('@/app/api/workspaces/[id]/extra-trees/route');
    const res = await POST(postReq({ nameAr: 'فرع' }), listParams);
    expect(res.status).toBe(403);
  });

  test('201 with new extra tree for collection_editor', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    mockTreeCount.mockResolvedValue(2);
    mockTreeCreate.mockResolvedValue({ id: TREE_ID, nameAr: 'فرع', kind: 'extra', visibility: 'private' });
    const { POST } = await import('@/app/api/workspaces/[id]/extra-trees/route');
    const res = await POST(postReq({ nameAr: 'فرع' }), listParams);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe(TREE_ID);
    expect(body.data.kind).toBe('extra');
    expect(body.data.peopleCount).toBe(0);
  });

  test('400 for invalid body (empty nameAr)', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    const { POST } = await import('@/app/api/workspaces/[id]/extra-trees/route');
    const res = await POST(postReq({ nameAr: '' }), listParams);
    expect(res.status).toBe(400);
  });

  test('429 when extra-tree cap is reached', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    mockTreeCount.mockResolvedValue(50);
    const { POST } = await import('@/app/api/workspaces/[id]/extra-trees/route');
    const res = await POST(postReq({ nameAr: 'فرع' }), listParams);
    expect(res.status).toBe(429);
    expect(mockTreeCreate).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// GET /extra-trees
// ===========================================================================
describe('GET /api/workspaces/[id]/extra-trees', () => {
  beforeEach(() => vi.clearAllMocks());

  test('member can list; returns extra trees + main tree with peopleCount', async () => {
    collectionsOn();
    mockAuth();
    mockMember();
    const mainId = 'a0000000-0000-4000-a000-0000000000ff';
    mockTreeFindMany.mockResolvedValue([
      { id: TREE_ID, nameAr: 'فرع', kind: 'extra', visibility: 'private' },
      { id: mainId, nameAr: null, kind: 'main', visibility: 'private' },
    ]);
    mockIndividualGroupBy.mockResolvedValue([
      { treeId: TREE_ID, _count: { _all: 3 } },
      { treeId: mainId, _count: { _all: 7 } },
    ]);
    const { GET } = await import('@/app/api/workspaces/[id]/extra-trees/route');
    const res = await GET(getReq(), listParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    const extra = body.data.find((t: { id: string }) => t.id === TREE_ID);
    expect(extra.peopleCount).toBe(3);
    const main = body.data.find((t: { id: string }) => t.id === mainId);
    expect(main.peopleCount).toBe(7);
    expect(main.kind).toBe('main');
  });

  test('404 when collections feature is off', async () => {
    mockAuth();
    collectionsOff();
    const { GET } = await import('@/app/api/workspaces/[id]/extra-trees/route');
    const res = await GET(getReq(), listParams);
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// PATCH /extra-trees/[treeId]
// ===========================================================================
describe('PATCH /api/workspaces/[id]/extra-trees/[treeId]', () => {
  beforeEach(() => vi.clearAllMocks());

  test('200 renames an extra tree', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    mockTreeUpdateMany.mockResolvedValue({ count: 1 });
    mockTreeFindUnique.mockResolvedValue({ id: TREE_ID, nameAr: 'جديد', kind: 'extra', visibility: 'private' });
    const { PATCH } = await import('@/app/api/workspaces/[id]/extra-trees/[treeId]/route');
    const res = await PATCH(patchReq({ nameAr: 'جديد' }), itemParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.nameAr).toBe('جديد');
  });

  test('404 when tree is not an extra tree in this workspace', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    mockTreeUpdateMany.mockResolvedValue({ count: 0 });
    const { PATCH } = await import('@/app/api/workspaces/[id]/extra-trees/[treeId]/route');
    const res = await PATCH(patchReq({ nameAr: 'جديد' }), itemParams);
    expect(res.status).toBe(404);
  });

  test('403 for plain member', async () => {
    collectionsOn();
    mockAuth();
    mockMember();
    const { PATCH } = await import('@/app/api/workspaces/[id]/extra-trees/[treeId]/route');
    const res = await PATCH(patchReq({ nameAr: 'جديد' }), itemParams);
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// DELETE /extra-trees/[treeId]
// ===========================================================================
describe('DELETE /api/workspaces/[id]/extra-trees/[treeId]', () => {
  beforeEach(() => vi.clearAllMocks());

  test('200 deletes an extra tree', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    mockTreeFindFirst.mockResolvedValue({ id: TREE_ID, kind: 'extra' });
    mockTreeDeleteMany.mockResolvedValue({ count: 1 });
    const { DELETE } = await import('@/app/api/workspaces/[id]/extra-trees/[treeId]/route');
    const res = await DELETE(deleteReq(), itemParams);
    expect(res.status).toBe(200);
  });

  test('409 when target is the main tree', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    mockTreeFindFirst.mockResolvedValue({ id: TREE_ID, kind: 'main' });
    const { DELETE } = await import('@/app/api/workspaces/[id]/extra-trees/[treeId]/route');
    const res = await DELETE(deleteReq(), itemParams);
    expect(res.status).toBe(409);
    expect(mockTreeDeleteMany).not.toHaveBeenCalled();
  });

  test('404 when tree not found', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    mockTreeFindFirst.mockResolvedValue(null);
    const { DELETE } = await import('@/app/api/workspaces/[id]/extra-trees/[treeId]/route');
    const res = await DELETE(deleteReq(), itemParams);
    expect(res.status).toBe(404);
  });
});

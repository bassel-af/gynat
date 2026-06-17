import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Integration-style route test for the duplicate-tree endpoint. We mock the
// auth layer (Supabase) + the DB (Prisma) + the copy helper, then call the
// real route handler. The deep-copy mechanics are exercised by copy.ts's own
// tests; here we assert the route's gate / authz / lookup / cap / shaping.
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}));

const mockMembershipFindUnique = vi.fn();
const mockWorkspaceFindUnique = vi.fn();
const mockTreeFindFirst = vi.fn();
const mockTreeCount = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: {
      findUnique: (...a: unknown[]) => mockMembershipFindUnique(...a),
    },
    workspace: {
      findUnique: (...a: unknown[]) => mockWorkspaceFindUnique(...a),
    },
    familyTree: {
      findFirst: (...a: unknown[]) => mockTreeFindFirst(...a),
      count: (...a: unknown[]) => mockTreeCount(...a),
    },
  },
}));

const mockCopyTree = vi.fn();
vi.mock('@/lib/collections/copy', () => ({
  copyTreeIntoNewExtraTree: (...a: unknown[]) => mockCopyTree(...a),
}));

import { NextRequest } from 'next/server';

const wsId = 'ws-uuid-collections';
const fakeUser = { id: 'user-uuid-1', email: 'a@b.com' };
const SOURCE_TREE_ID = 'a0000000-0000-4000-a000-000000000010';
const NEW_TREE_ID = 'b0000000-0000-4000-b000-000000000020';

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

function dupReq() {
  return new NextRequest(
    `http://localhost:3000/api/workspaces/${wsId}/extra-trees/${SOURCE_TREE_ID}/duplicate`,
    { method: 'POST', headers: { authorization: 'Bearer t' } },
  );
}

const params = { params: Promise.resolve({ id: wsId, treeId: SOURCE_TREE_ID }) };

describe('POST /api/workspaces/[id]/extra-trees/[treeId]/duplicate', () => {
  beforeEach(() => vi.clearAllMocks());

  test('404 when collections feature is off', async () => {
    mockAuth();
    collectionsOff();
    const { POST } = await import(
      '@/app/api/workspaces/[id]/extra-trees/[treeId]/duplicate/route'
    );
    const res = await POST(dupReq(), params);
    expect(res.status).toBe(404);
  });

  test('401 when unauthenticated', async () => {
    collectionsOn();
    mockNoAuth();
    const { POST } = await import(
      '@/app/api/workspaces/[id]/extra-trees/[treeId]/duplicate/route'
    );
    const res = await POST(dupReq(), params);
    expect(res.status).toBe(401);
  });

  test('403 for plain member without collection_editor', async () => {
    collectionsOn();
    mockAuth();
    mockMember();
    const { POST } = await import(
      '@/app/api/workspaces/[id]/extra-trees/[treeId]/duplicate/route'
    );
    const res = await POST(dupReq(), params);
    expect(res.status).toBe(403);
    expect(mockCopyTree).not.toHaveBeenCalled();
  });

  test('404 when source tree is not in this workspace', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    mockTreeFindFirst.mockResolvedValue(null);
    const { POST } = await import(
      '@/app/api/workspaces/[id]/extra-trees/[treeId]/duplicate/route'
    );
    const res = await POST(dupReq(), params);
    expect(res.status).toBe(404);
    expect(mockCopyTree).not.toHaveBeenCalled();
  });

  test('429 when extra-tree cap is reached', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    mockTreeFindFirst.mockResolvedValue({ id: SOURCE_TREE_ID, kind: 'extra', nameAr: 'فرع' });
    mockTreeCount.mockResolvedValue(50);
    const { POST } = await import(
      '@/app/api/workspaces/[id]/extra-trees/[treeId]/duplicate/route'
    );
    const res = await POST(dupReq(), params);
    expect(res.status).toBe(429);
    expect(mockCopyTree).not.toHaveBeenCalled();
  });

  test('201 duplicates an extra tree as "{name} (نسخة)" with copied shape', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    mockTreeFindFirst.mockResolvedValue({ id: SOURCE_TREE_ID, kind: 'extra', nameAr: 'فرع' });
    mockTreeCount.mockResolvedValue(2);
    mockCopyTree.mockResolvedValue({ newTreeId: NEW_TREE_ID, nameAr: 'فرع (نسخة)', peopleCount: 5 });
    const { POST } = await import(
      '@/app/api/workspaces/[id]/extra-trees/[treeId]/duplicate/route'
    );
    const res = await POST(dupReq(), params);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe(NEW_TREE_ID);
    expect(body.data.kind).toBe('extra');
    expect(body.data.nameAr).toBe('فرع (نسخة)');
    expect(body.data.peopleCount).toBe(5);
    expect(mockCopyTree).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: wsId,
        sourceTreeId: SOURCE_TREE_ID,
        nameAr: 'فرع (نسخة)',
      }),
    );
  });

  test('main tree (null name) is named after the workspace with a (نسخة) suffix', async () => {
    collectionsOn();
    mockAuth();
    mockEditor();
    mockWorkspaceFindUnique
      .mockResolvedValueOnce({ enableCollections: true }) // gate
      .mockResolvedValueOnce({ nameAr: 'عائلة سعيد' }); // name lookup
    mockTreeFindFirst.mockResolvedValue({ id: SOURCE_TREE_ID, kind: 'main', nameAr: null });
    mockTreeCount.mockResolvedValue(0);
    mockCopyTree.mockResolvedValue({ newTreeId: NEW_TREE_ID, nameAr: 'عائلة سعيد (نسخة)', peopleCount: 12 });
    const { POST } = await import(
      '@/app/api/workspaces/[id]/extra-trees/[treeId]/duplicate/route'
    );
    const res = await POST(dupReq(), params);
    expect(res.status).toBe(201);
    expect(mockCopyTree).toHaveBeenCalledWith(
      expect.objectContaining({ nameAr: 'عائلة سعيد (نسخة)' }),
    );
  });
});

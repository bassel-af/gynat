import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}));

const mockMembershipFindUnique = vi.fn();
const mockFamilyTreeFindUnique = vi.fn();
const mockFamilyTreeCreate = vi.fn();
const mockIndividualFindFirst = vi.fn();
const mockFamilyCreate = vi.fn();
const mockFamilyFindFirst = vi.fn();
const mockFamilyUpdate = vi.fn();
const mockFamilyDelete = vi.fn();
const mockFamilyChildCreate = vi.fn();
const mockFamilyChildDelete = vi.fn();
const mockFamilyChildDeleteMany = vi.fn();
const mockFamilyChildFindUnique = vi.fn();
const mockTreeEditLogCreate = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: {
      findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
    },
    familyTree: {
      findUnique: (...args: unknown[]) => mockFamilyTreeFindUnique(...args),
      create: (...args: unknown[]) => mockFamilyTreeCreate(...args),
    },
    individual: {
      findFirst: (...args: unknown[]) => mockIndividualFindFirst(...args),
    },
    family: {
      create: (...args: unknown[]) => mockFamilyCreate(...args),
      findFirst: (...args: unknown[]) => mockFamilyFindFirst(...args),
      update: (...args: unknown[]) => mockFamilyUpdate(...args),
      delete: (...args: unknown[]) => mockFamilyDelete(...args),
    },
    familyChild: {
      create: (...args: unknown[]) => mockFamilyChildCreate(...args),
      delete: (...args: unknown[]) => mockFamilyChildDelete(...args),
      deleteMany: (...args: unknown[]) => mockFamilyChildDeleteMany(...args),
      findUnique: (...args: unknown[]) => mockFamilyChildFindUnique(...args),
    },
    treeEditLog: {
      create: (...args: unknown[]) => mockTreeEditLogCreate(...args),
    },
  },
}));

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const wsId = 'ws-uuid-fam-crud-1';
const treeId = 'tree-uuid-fam-1';
const famId = 'fam-uuid-1';
const husbandId = 'a0000000-0000-4000-a000-000000000001';
const wifeId = 'a0000000-0000-4000-a000-000000000002';
const childId = 'a0000000-0000-4000-a000-000000000003';

const familiesParams = { params: Promise.resolve({ id: wsId }) };
const familyParams = { params: Promise.resolve({ id: wsId, familyId: famId }) };
const childrenParams = { params: Promise.resolve({ id: wsId, familyId: famId }) };
const childParams = { params: Promise.resolve({ id: wsId, familyId: famId, individualId: childId }) };

const fakeUser = {
  id: 'user-uuid-222',
  email: 'editor@example.com',
  user_metadata: { display_name: 'Editor' },
};

function makeRequest(url: string, options: { method?: string; body?: unknown } = {}) {
  const { method = 'GET', body } = options;
  return new NextRequest(url, {
    method,
    headers: {
      authorization: 'Bearer valid-token',
      'content-type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function mockAuth() {
  mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
}

function mockNoAuth() {
  mockGetUser.mockResolvedValue({
    data: { user: null },
    error: { message: 'Invalid token' },
  });
}

function mockTreeEditor() {
  mockMembershipFindUnique.mockResolvedValue({
    userId: fakeUser.id,
    workspaceId: wsId,
    role: 'workspace_admin',
    permissions: [],
  });
}

function mockMemberNoTreeEdit() {
  mockMembershipFindUnique.mockResolvedValue({
    userId: fakeUser.id,
    workspaceId: wsId,
    role: 'workspace_member',
    permissions: [],
  });
}

function mockExistingTree() {
  mockFamilyTreeFindUnique.mockResolvedValue({
    id: treeId,
    workspaceId: wsId,
    individuals: [],
    families: [],
  });
}

function mockNoTree() {
  mockFamilyTreeFindUnique.mockResolvedValue(null);
  mockFamilyTreeCreate.mockResolvedValue({
    id: treeId,
    workspaceId: wsId,
    individuals: [],
    families: [],
  });
}

/** Make mockIndividualFindFirst return a valid individual for any of the given IDs */
function mockIndividualsExist(ids: string[]) {
  mockIndividualFindFirst.mockImplementation((args: { where: { id: string; treeId: string } }) => {
    if (ids.includes(args.where.id)) {
      return Promise.resolve({ id: args.where.id, treeId });
    }
    return Promise.resolve(null);
  });
}

function mockFamilyExists() {
  mockFamilyFindFirst.mockResolvedValue({
    id: famId,
    treeId,
    husbandId,
    wifeId,
    children: [{ familyId: famId, individualId: childId }],
  });
}

function mockFamilyNotFound() {
  mockFamilyFindFirst.mockResolvedValue(null);
}

// ============================================================================
// POST /api/workspaces/[id]/tree/families — Create family
// ============================================================================
describe('POST /api/workspaces/[id]/tree/families', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns 401 for unauthenticated user', async () => {
    mockNoAuth();
    const { POST } = await import('@/app/api/workspaces/[id]/tree/families/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree/families`, {
      method: 'POST',
      body: { husbandId },
    });
    const res = await POST(req, familiesParams);
    expect(res.status).toBe(401);
  });

  test('returns 403 for member without tree_editor permission', async () => {
    mockAuth();
    mockMemberNoTreeEdit();
    const { POST } = await import('@/app/api/workspaces/[id]/tree/families/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree/families`, {
      method: 'POST',
      body: { husbandId },
    });
    const res = await POST(req, familiesParams);
    expect(res.status).toBe(403);
  });

  test('returns 400 if husbandId is not a valid UUID', async () => {
    mockAuth();
    mockTreeEditor();
    const { POST } = await import('@/app/api/workspaces/[id]/tree/families/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree/families`, {
      method: 'POST',
      body: { husbandId: 'not-a-uuid' },
    });
    const res = await POST(req, familiesParams);
    expect(res.status).toBe(400);
  });

  test('returns 400 if husbandId individual not found in tree', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockIndividualFindFirst.mockResolvedValue(null);

    const { POST } = await import('@/app/api/workspaces/[id]/tree/families/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree/families`, {
      method: 'POST',
      body: { husbandId: 'a0000000-0000-4000-a000-000000000001' },
    });
    const res = await POST(req, familiesParams);
    expect(res.status).toBe(400);
  });

  test('creates family with husband and wife, returns 201', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockIndividualsExist([husbandId, wifeId]);
    mockTreeEditLogCreate.mockResolvedValue({});

    const createdFamily = {
      id: famId,
      treeId,
      gedcomId: null,
      husbandId,
      wifeId,
      children: [],
    };
    mockFamilyCreate.mockResolvedValue(createdFamily);

    const { POST } = await import('@/app/api/workspaces/[id]/tree/families/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree/families`, {
      method: 'POST',
      body: { husbandId, wifeId },
    });
    const res = await POST(req, familiesParams);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.husbandId).toBe(husbandId);
    expect(body.data.wifeId).toBe(wifeId);
  });

  test('creates family with children', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockIndividualsExist([husbandId, wifeId, childId]);
    mockTreeEditLogCreate.mockResolvedValue({});

    const createdFamily = {
      id: famId,
      treeId,
      gedcomId: null,
      husbandId,
      wifeId,
      children: [{ familyId: famId, individualId: childId }],
    };
    mockFamilyCreate.mockResolvedValue(createdFamily);

    const { POST } = await import('@/app/api/workspaces/[id]/tree/families/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree/families`, {
      method: 'POST',
      body: { husbandId, wifeId, childrenIds: [childId] },
    });
    const res = await POST(req, familiesParams);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.children).toHaveLength(1);
  });

  test('auto-creates tree if none exists', async () => {
    mockAuth();
    mockTreeEditor();
    mockNoTree();
    mockIndividualsExist([husbandId]);
    mockTreeEditLogCreate.mockResolvedValue({});
    mockFamilyCreate.mockResolvedValue({
      id: famId,
      treeId,
      husbandId,
      wifeId: null,
      children: [],
    });

    const { POST } = await import('@/app/api/workspaces/[id]/tree/families/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree/families`, {
      method: 'POST',
      body: { husbandId },
    });
    const res = await POST(req, familiesParams);

    expect(res.status).toBe(201);
    expect(mockFamilyTreeCreate).toHaveBeenCalled();
  });

  test('logs creation to TreeEditLog', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockIndividualsExist([husbandId]);
    mockTreeEditLogCreate.mockResolvedValue({});
    mockFamilyCreate.mockResolvedValue({
      id: famId,
      treeId,
      husbandId,
      wifeId: null,
      children: [],
    });

    const { POST } = await import('@/app/api/workspaces/[id]/tree/families/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree/families`, {
      method: 'POST',
      body: { husbandId },
    });
    await POST(req, familiesParams);

    expect(mockTreeEditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        treeId,
        userId: fakeUser.id,
        action: 'create',
        entityType: 'family',
        entityId: famId,
      }),
    });
  });
});

// ============================================================================
// PATCH /api/workspaces/[id]/tree/families/[familyId] — Update family
// ============================================================================
describe('PATCH /api/workspaces/[id]/tree/families/[familyId]', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns 401 for unauthenticated user', async () => {
    mockNoAuth();
    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${famId}`,
      { method: 'PATCH', body: { husbandId: null } },
    );
    const res = await PATCH(req, familyParams);
    expect(res.status).toBe(401);
  });

  test('returns 404 if family not found in tree', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockFamilyNotFound();
    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${famId}`,
      { method: 'PATCH', body: { husbandId: null } },
    );
    const res = await PATCH(req, familyParams);
    expect(res.status).toBe(404);
  });

  test('updates family husband/wife and returns 200', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    // Family has husband but no wife — setting wifeId should work
    mockFamilyFindFirst.mockResolvedValue({
      id: famId,
      treeId,
      husbandId,
      wifeId: null,
      children: [],
    });
    mockIndividualsExist([husbandId, 'a0000000-0000-4000-a000-000000000004']);
    mockTreeEditLogCreate.mockResolvedValue({});

    const updatedFamily = {
      id: famId,
      treeId,
      husbandId,
      wifeId: 'a0000000-0000-4000-a000-000000000004',
      children: [],
    };
    mockFamilyUpdate.mockResolvedValue(updatedFamily);

    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${famId}`,
      { method: 'PATCH', body: { wifeId: 'a0000000-0000-4000-a000-000000000004' } },
    );
    const res = await PATCH(req, familyParams);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.wifeId).toBe('a0000000-0000-4000-a000-000000000004');
  });

  test('allows setting husbandId or wifeId to null', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockFamilyExists();
    mockTreeEditLogCreate.mockResolvedValue({});

    const updatedFamily = {
      id: famId,
      treeId,
      husbandId: null,
      wifeId,
      children: [],
    };
    mockFamilyUpdate.mockResolvedValue(updatedFamily);

    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${famId}`,
      { method: 'PATCH', body: { husbandId: null } },
    );
    const res = await PATCH(req, familyParams);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.husbandId).toBeNull();
  });

  test('returns 400 if new husbandId not found in tree', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    // Family has no husband — so the 409 check won't fire
    mockFamilyFindFirst.mockResolvedValue({
      id: famId,
      treeId,
      husbandId: null,
      wifeId: null,
      children: [],
    });
    mockIndividualFindFirst.mockResolvedValue(null);

    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${famId}`,
      { method: 'PATCH', body: { husbandId: 'a0000000-0000-4000-a000-000000000099' } },
    );
    const res = await PATCH(req, familyParams);
    expect(res.status).toBe(400);
  });

  test('logs update to TreeEditLog', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockFamilyExists();
    mockTreeEditLogCreate.mockResolvedValue({});
    mockFamilyUpdate.mockResolvedValue({
      id: famId,
      treeId,
      husbandId: null,
      wifeId,
      children: [],
    });

    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${famId}`,
      { method: 'PATCH', body: { husbandId: null } },
    );
    await PATCH(req, familyParams);

    expect(mockTreeEditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        treeId,
        userId: fakeUser.id,
        action: 'update',
        entityType: 'family',
        entityId: famId,
      }),
    });
  });
});

// ============================================================================
// DELETE /api/workspaces/[id]/tree/families/[familyId] — Delete family
// ============================================================================
describe('DELETE /api/workspaces/[id]/tree/families/[familyId]', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns 401 for unauthenticated user', async () => {
    mockNoAuth();
    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${famId}`,
      { method: 'DELETE' },
    );
    const res = await DELETE(req, familyParams);
    expect(res.status).toBe(401);
  });

  test('returns 404 if family not found in tree', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockFamilyNotFound();
    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${famId}`,
      { method: 'DELETE' },
    );
    const res = await DELETE(req, familyParams);
    expect(res.status).toBe(404);
  });

  test('deletes family and returns 204', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockFamilyExists();
    mockFamilyChildDeleteMany.mockResolvedValue({ count: 1 });
    mockFamilyDelete.mockResolvedValue({});
    mockTreeEditLogCreate.mockResolvedValue({});

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${famId}`,
      { method: 'DELETE' },
    );
    const res = await DELETE(req, familyParams);

    expect(res.status).toBe(204);
  });

  test('deletes FamilyChild records before deleting family', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockFamilyExists();
    mockFamilyChildDeleteMany.mockResolvedValue({ count: 2 });
    mockFamilyDelete.mockResolvedValue({});
    mockTreeEditLogCreate.mockResolvedValue({});

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${famId}`,
      { method: 'DELETE' },
    );
    await DELETE(req, familyParams);

    expect(mockFamilyChildDeleteMany).toHaveBeenCalledWith({
      where: { familyId: famId },
    });
  });

  test('logs deletion to TreeEditLog', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockFamilyExists();
    mockFamilyChildDeleteMany.mockResolvedValue({ count: 0 });
    mockFamilyDelete.mockResolvedValue({});
    mockTreeEditLogCreate.mockResolvedValue({});

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${famId}`,
      { method: 'DELETE' },
    );
    await DELETE(req, familyParams);

    expect(mockTreeEditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        treeId,
        userId: fakeUser.id,
        action: 'delete',
        entityType: 'family',
        entityId: famId,
      }),
    });
  });
});

// ============================================================================
// POST /api/workspaces/[id]/tree/families/[familyId]/children — Add child
// ============================================================================
describe('POST /api/workspaces/[id]/tree/families/[familyId]/children', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns 401 for unauthenticated user', async () => {
    mockNoAuth();
    const { POST } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/children/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${famId}/children`,
      { method: 'POST', body: { individualId: childId } },
    );
    const res = await POST(req, childrenParams);
    expect(res.status).toBe(401);
  });

  test('returns 403 for member without tree_editor permission', async () => {
    mockAuth();
    mockMemberNoTreeEdit();
    const { POST } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/children/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${famId}/children`,
      { method: 'POST', body: { individualId: childId } },
    );
    const res = await POST(req, childrenParams);
    expect(res.status).toBe(403);
  });

  test('returns 404 if family not found in tree', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockFamilyNotFound();
    const { POST } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/children/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${famId}/children`,
      { method: 'POST', body: { individualId: childId } },
    );
    const res = await POST(req, childrenParams);
    expect(res.status).toBe(404);
  });

  test('returns 400 if individual not found in tree', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockFamilyExists();
    mockIndividualFindFirst.mockResolvedValue(null);

    const { POST } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/children/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${famId}/children`,
      { method: 'POST', body: { individualId: 'a0000000-0000-4000-a000-000000000099' } },
    );
    const res = await POST(req, childrenParams);
    expect(res.status).toBe(400);
  });

  test('returns 409 if child already exists in family', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockFamilyExists();
    mockIndividualsExist([childId]);
    // Child already exists
    mockFamilyChildFindUnique.mockResolvedValue({
      familyId: famId,
      individualId: childId,
    });

    const { POST } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/children/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${famId}/children`,
      { method: 'POST', body: { individualId: childId } },
    );
    const res = await POST(req, childrenParams);
    expect(res.status).toBe(409);
  });

  test('adds child to family and returns 201', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockFamilyExists();
    mockIndividualsExist([childId]);
    mockFamilyChildFindUnique.mockResolvedValue(null);
    mockTreeEditLogCreate.mockResolvedValue({});

    const createdChild = { familyId: famId, individualId: childId };
    mockFamilyChildCreate.mockResolvedValue(createdChild);

    const { POST } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/children/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${famId}/children`,
      { method: 'POST', body: { individualId: childId } },
    );
    const res = await POST(req, childrenParams);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.familyId).toBe(famId);
    expect(body.data.individualId).toBe(childId);
  });

  test('logs add-child to TreeEditLog', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockFamilyExists();
    mockIndividualsExist([childId]);
    mockFamilyChildFindUnique.mockResolvedValue(null);
    mockTreeEditLogCreate.mockResolvedValue({});
    mockFamilyChildCreate.mockResolvedValue({ familyId: famId, individualId: childId });

    const { POST } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/children/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${famId}/children`,
      { method: 'POST', body: { individualId: childId } },
    );
    await POST(req, childrenParams);

    expect(mockTreeEditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        treeId,
        userId: fakeUser.id,
        action: 'create',
        entityType: 'family_child',
        entityId: famId,
      }),
    });
  });
});

// ============================================================================
// DELETE /api/workspaces/[id]/tree/families/[familyId]/children/[individualId]
// ============================================================================
describe('DELETE /api/workspaces/[id]/tree/families/[familyId]/children/[individualId]', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns 401 for unauthenticated user', async () => {
    mockNoAuth();
    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/children/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${famId}/children/${childId}`,
      { method: 'DELETE' },
    );
    const res = await DELETE(req, childParams);
    expect(res.status).toBe(401);
  });

  test('returns 404 if family not found in tree', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockFamilyNotFound();
    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/children/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${famId}/children/${childId}`,
      { method: 'DELETE' },
    );
    const res = await DELETE(req, childParams);
    expect(res.status).toBe(404);
  });

  test('deletes child from family and returns 204', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockFamilyExists();
    mockFamilyChildFindUnique.mockResolvedValue({ familyId: famId, individualId: childId });
    mockFamilyChildDelete.mockResolvedValue({});
    mockTreeEditLogCreate.mockResolvedValue({});

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/children/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${famId}/children/${childId}`,
      { method: 'DELETE' },
    );
    const res = await DELETE(req, childParams);

    expect(res.status).toBe(204);
  });

  test('logs child removal to TreeEditLog', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockFamilyExists();
    mockFamilyChildFindUnique.mockResolvedValue({ familyId: famId, individualId: childId });
    mockFamilyChildDelete.mockResolvedValue({});
    mockTreeEditLogCreate.mockResolvedValue({});

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/children/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${famId}/children/${childId}`,
      { method: 'DELETE' },
    );
    await DELETE(req, childParams);

    expect(mockTreeEditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        treeId,
        userId: fakeUser.id,
        action: 'delete',
        entityType: 'family_child',
        entityId: famId,
      }),
    });
  });

  test('returns 404 if child-family link does not exist', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockFamilyExists();
    // The child link does not exist in the database
    mockFamilyChildFindUnique.mockResolvedValue(null);

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/children/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${famId}/children/${childId}`,
      { method: 'DELETE' },
    );
    const res = await DELETE(req, childParams);
    expect(res.status).toBe(404);
  });
});

// ============================================================================
// PATCH family — parent-slot validation (Security finding 2A)
// ============================================================================
describe('PATCH family — parent-slot conflict validation', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns 409 when setting husbandId on family that already has a different husband', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    // Family already has husbandId set
    mockFamilyFindFirst.mockResolvedValue({
      id: famId,
      treeId,
      husbandId,
      wifeId: null,
      children: [],
    });
    const newHusbandId = 'a0000000-0000-4000-a000-000000000009';
    mockIndividualsExist([newHusbandId]);

    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${famId}`,
      { method: 'PATCH', body: { husbandId: newHusbandId } },
    );
    const res = await PATCH(req, familyParams);
    expect(res.status).toBe(409);
  });

  test('returns 409 when setting wifeId on family that already has a different wife', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    // Family already has wifeId set
    mockFamilyFindFirst.mockResolvedValue({
      id: famId,
      treeId,
      husbandId: null,
      wifeId,
      children: [],
    });
    const newWifeId = 'a0000000-0000-4000-a000-000000000009';
    mockIndividualsExist([newWifeId]);

    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${famId}`,
      { method: 'PATCH', body: { wifeId: newWifeId } },
    );
    const res = await PATCH(req, familyParams);
    expect(res.status).toBe(409);
  });

  test('allows setting husbandId to same value as existing (no-op)', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockFamilyFindFirst.mockResolvedValue({
      id: famId,
      treeId,
      husbandId,
      wifeId: null,
      children: [],
    });
    mockIndividualsExist([husbandId]);
    mockTreeEditLogCreate.mockResolvedValue({});
    mockFamilyUpdate.mockResolvedValue({
      id: famId,
      treeId,
      husbandId,
      wifeId: null,
      children: [],
    });

    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${famId}`,
      { method: 'PATCH', body: { husbandId } },
    );
    const res = await PATCH(req, familyParams);
    expect(res.status).toBe(200);
  });

  test('allows setting husbandId when slot is currently null', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockFamilyFindFirst.mockResolvedValue({
      id: famId,
      treeId,
      husbandId: null,
      wifeId: null,
      children: [],
    });
    mockIndividualsExist([husbandId]);
    mockTreeEditLogCreate.mockResolvedValue({});
    mockFamilyUpdate.mockResolvedValue({
      id: famId,
      treeId,
      husbandId,
      wifeId: null,
      children: [],
    });

    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${famId}`,
      { method: 'PATCH', body: { husbandId } },
    );
    const res = await PATCH(req, familyParams);
    expect(res.status).toBe(200);
  });

  test('allows setting slot to null (removing parent)', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockFamilyFindFirst.mockResolvedValue({
      id: famId,
      treeId,
      husbandId,
      wifeId,
      children: [],
    });
    mockTreeEditLogCreate.mockResolvedValue({});
    mockFamilyUpdate.mockResolvedValue({
      id: famId,
      treeId,
      husbandId: null,
      wifeId,
      children: [],
    });

    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${famId}`,
      { method: 'PATCH', body: { husbandId: null } },
    );
    const res = await PATCH(req, familyParams);
    expect(res.status).toBe(200);
  });
});

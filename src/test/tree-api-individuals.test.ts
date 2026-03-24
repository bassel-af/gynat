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
const mockIndividualCreate = vi.fn();
const mockIndividualUpdate = vi.fn();
const mockIndividualDelete = vi.fn();
const mockIndividualFindFirst = vi.fn();
const mockFamilyUpdateMany = vi.fn();
const mockFamilyChildDeleteMany = vi.fn();
const mockTreeEditLogCreate = vi.fn();
const mockTransaction = vi.fn();

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
      create: (...args: unknown[]) => mockIndividualCreate(...args),
      update: (...args: unknown[]) => mockIndividualUpdate(...args),
      delete: (...args: unknown[]) => mockIndividualDelete(...args),
      findFirst: (...args: unknown[]) => mockIndividualFindFirst(...args),
    },
    family: {
      updateMany: (...args: unknown[]) => mockFamilyUpdateMany(...args),
    },
    familyChild: {
      deleteMany: (...args: unknown[]) => mockFamilyChildDeleteMany(...args),
    },
    treeEditLog: {
      create: (...args: unknown[]) => mockTreeEditLogCreate(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const wsId = 'ws-uuid-tree-crud-1';
const treeId = 'tree-uuid-1';
const indId = 'ind-uuid-1';
const now = new Date();

const individualsParams = { params: Promise.resolve({ id: wsId }) };
const individualParams = { params: Promise.resolve({ id: wsId, individualId: indId }) };

const fakeUser = {
  id: 'user-uuid-111',
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

function mockIndividualExists() {
  mockIndividualFindFirst.mockResolvedValue({
    id: indId,
    treeId,
    givenName: 'محمد',
    surname: 'السعيد',
    fullName: null,
    sex: 'M',
    birthDate: '1950',
    birthPlace: null,
    deathDate: null,
    deathPlace: null,
    isPrivate: false,
    createdById: fakeUser.id,
    updatedAt: now,
    createdAt: now,
  });
}

function mockIndividualNotFound() {
  mockIndividualFindFirst.mockResolvedValue(null);
}

function mockDefaultTransaction() {
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const txProxy = {
      familyChild: { deleteMany: mockFamilyChildDeleteMany },
      family: { updateMany: mockFamilyUpdateMany },
      individual: { delete: mockIndividualDelete },
    };
    return fn(txProxy);
  });
}

// ============================================================================
// POST /api/workspaces/[id]/tree/individuals — Create individual
// ============================================================================
describe('POST /api/workspaces/[id]/tree/individuals', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns 401 for unauthenticated user', async () => {
    mockNoAuth();
    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree/individuals`, {
      method: 'POST',
      body: { givenName: 'محمد' },
    });
    const res = await POST(req, individualsParams);
    expect(res.status).toBe(401);
  });

  test('returns 403 for member without tree_editor permission', async () => {
    mockAuth();
    mockMemberNoTreeEdit();
    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree/individuals`, {
      method: 'POST',
      body: { givenName: 'محمد' },
    });
    const res = await POST(req, individualsParams);
    expect(res.status).toBe(403);
  });

  test('returns 400 if neither givenName nor fullName provided', async () => {
    mockAuth();
    mockTreeEditor();
    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree/individuals`, {
      method: 'POST',
      body: { sex: 'M' },
    });
    const res = await POST(req, individualsParams);
    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid sex value', async () => {
    mockAuth();
    mockTreeEditor();
    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree/individuals`, {
      method: 'POST',
      body: { givenName: 'محمد', sex: 'X' },
    });
    const res = await POST(req, individualsParams);
    expect(res.status).toBe(400);
  });

  test('creates individual with givenName and returns 201', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockTreeEditLogCreate.mockResolvedValue({});

    const createdIndividual = {
      id: indId,
      treeId,
      gedcomId: null,
      givenName: 'محمد',
      surname: 'السعيد',
      fullName: null,
      sex: 'M',
      birthDate: '1950',
      birthPlace: null,
      deathDate: null,
      deathPlace: null,
      isPrivate: false,
      createdById: fakeUser.id,
      updatedAt: now,
      createdAt: now,
    };
    mockIndividualCreate.mockResolvedValue(createdIndividual);

    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree/individuals`, {
      method: 'POST',
      body: { givenName: 'محمد', surname: 'السعيد', sex: 'M', birthDate: '1950' },
    });
    const res = await POST(req, individualsParams);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.givenName).toBe('محمد');
    expect(body.data.sex).toBe('M');
  });

  test('creates individual with fullName only', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockTreeEditLogCreate.mockResolvedValue({});

    const createdIndividual = {
      id: indId,
      treeId,
      gedcomId: null,
      givenName: null,
      surname: null,
      fullName: 'محمد بن عبدالله السعيد',
      sex: null,
      birthDate: null,
      birthPlace: null,
      deathDate: null,
      deathPlace: null,
      isPrivate: false,
      createdById: fakeUser.id,
      updatedAt: now,
      createdAt: now,
    };
    mockIndividualCreate.mockResolvedValue(createdIndividual);

    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree/individuals`, {
      method: 'POST',
      body: { fullName: 'محمد بن عبدالله السعيد' },
    });
    const res = await POST(req, individualsParams);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.fullName).toBe('محمد بن عبدالله السعيد');
  });

  test('auto-creates tree if none exists', async () => {
    mockAuth();
    mockTreeEditor();
    mockNoTree();
    mockTreeEditLogCreate.mockResolvedValue({});

    mockIndividualCreate.mockResolvedValue({
      id: indId,
      treeId,
      givenName: 'فاطمة',
      surname: null,
      fullName: null,
      sex: 'F',
      birthDate: null,
      birthPlace: null,
      deathDate: null,
      deathPlace: null,
      isPrivate: false,
      createdById: fakeUser.id,
      updatedAt: now,
      createdAt: now,
    });

    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree/individuals`, {
      method: 'POST',
      body: { givenName: 'فاطمة', sex: 'F' },
    });
    const res = await POST(req, individualsParams);

    expect(res.status).toBe(201);
    // Tree was created because there was none
    expect(mockFamilyTreeCreate).toHaveBeenCalled();
  });

  test('logs creation to TreeEditLog', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockTreeEditLogCreate.mockResolvedValue({});

    mockIndividualCreate.mockResolvedValue({
      id: indId,
      treeId,
      givenName: 'أحمد',
      surname: null,
      fullName: null,
      sex: 'M',
      birthDate: null,
      birthPlace: null,
      deathDate: null,
      deathPlace: null,
      isPrivate: false,
      createdById: fakeUser.id,
      updatedAt: now,
      createdAt: now,
    });

    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree/individuals`, {
      method: 'POST',
      body: { givenName: 'أحمد', sex: 'M' },
    });
    await POST(req, individualsParams);

    expect(mockTreeEditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        treeId,
        userId: fakeUser.id,
        action: 'create',
        entityType: 'individual',
        entityId: indId,
      }),
    });
  });

  test('defaults isPrivate to false', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockTreeEditLogCreate.mockResolvedValue({});

    mockIndividualCreate.mockResolvedValue({
      id: indId,
      treeId,
      givenName: 'سعيد',
      isPrivate: false,
      createdById: fakeUser.id,
      updatedAt: now,
      createdAt: now,
    });

    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree/individuals`, {
      method: 'POST',
      body: { givenName: 'سعيد' },
    });
    await POST(req, individualsParams);

    const createCall = mockIndividualCreate.mock.calls[0][0];
    expect(createCall.data.isPrivate).toBe(false);
  });

  test('returns 400 for invalid JSON body', async () => {
    mockAuth();
    mockTreeEditor();
    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');
    const req = new NextRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/individuals`,
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        body: 'not valid json{{{',
      },
    );
    const res = await POST(req, individualsParams);
    expect(res.status).toBe(400);
  });
});

// ============================================================================
// PATCH /api/workspaces/[id]/tree/individuals/[individualId] — Update individual
// ============================================================================
describe('PATCH /api/workspaces/[id]/tree/individuals/[individualId]', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns 401 for unauthenticated user', async () => {
    mockNoAuth();
    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/individuals/${indId}`,
      { method: 'PATCH', body: { givenName: 'عبدالله' } },
    );
    const res = await PATCH(req, individualParams);
    expect(res.status).toBe(401);
  });

  test('returns 403 for member without tree_editor permission', async () => {
    mockAuth();
    mockMemberNoTreeEdit();
    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/individuals/${indId}`,
      { method: 'PATCH', body: { givenName: 'عبدالله' } },
    );
    const res = await PATCH(req, individualParams);
    expect(res.status).toBe(403);
  });

  test('returns 404 if individual not found in tree', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockIndividualNotFound();
    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/individuals/${indId}`,
      { method: 'PATCH', body: { givenName: 'عبدالله' } },
    );
    const res = await PATCH(req, individualParams);
    expect(res.status).toBe(404);
  });

  test('updates individual fields and returns 200', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockIndividualExists();
    mockTreeEditLogCreate.mockResolvedValue({});

    const updatedIndividual = {
      id: indId,
      treeId,
      givenName: 'عبدالله',
      surname: 'السعيد',
      fullName: null,
      sex: 'M',
      birthDate: '1960',
      birthPlace: 'الرياض',
      deathDate: null,
      deathPlace: null,
      isPrivate: false,
      createdById: fakeUser.id,
      updatedAt: now,
      createdAt: now,
    };
    mockIndividualUpdate.mockResolvedValue(updatedIndividual);

    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/individuals/${indId}`,
      { method: 'PATCH', body: { givenName: 'عبدالله', birthDate: '1960', birthPlace: 'الرياض' } },
    );
    const res = await PATCH(req, individualParams);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.givenName).toBe('عبدالله');
    expect(body.data.birthDate).toBe('1960');
  });

  test('logs update to TreeEditLog with changes payload', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockIndividualExists();
    mockTreeEditLogCreate.mockResolvedValue({});

    mockIndividualUpdate.mockResolvedValue({
      id: indId,
      treeId,
      givenName: 'عبدالله',
      surname: 'السعيد',
      updatedAt: now,
      createdAt: now,
    });

    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/individuals/${indId}`,
      { method: 'PATCH', body: { givenName: 'عبدالله' } },
    );
    await PATCH(req, individualParams);

    expect(mockTreeEditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        treeId,
        userId: fakeUser.id,
        action: 'update',
        entityType: 'individual',
        entityId: indId,
        payload: { givenName: 'عبدالله' },
      }),
    });
  });

  test('returns 400 for invalid sex value in update', async () => {
    mockAuth();
    mockTreeEditor();
    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/individuals/${indId}`,
      { method: 'PATCH', body: { sex: 'X' } },
    );
    const res = await PATCH(req, individualParams);
    expect(res.status).toBe(400);
  });
});

// ============================================================================
// DELETE /api/workspaces/[id]/tree/individuals/[individualId] — Delete individual
// ============================================================================
describe('DELETE /api/workspaces/[id]/tree/individuals/[individualId]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDefaultTransaction();
  });

  test('returns 401 for unauthenticated user', async () => {
    mockNoAuth();
    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/individuals/${indId}`,
      { method: 'DELETE' },
    );
    const res = await DELETE(req, individualParams);
    expect(res.status).toBe(401);
  });

  test('returns 403 for member without tree_editor permission', async () => {
    mockAuth();
    mockMemberNoTreeEdit();
    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/individuals/${indId}`,
      { method: 'DELETE' },
    );
    const res = await DELETE(req, individualParams);
    expect(res.status).toBe(403);
  });

  test('returns 404 if individual not found in tree', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockIndividualNotFound();
    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/individuals/${indId}`,
      { method: 'DELETE' },
    );
    const res = await DELETE(req, individualParams);
    expect(res.status).toBe(404);
  });

  test('deletes individual and cleans up references, returns 204', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockIndividualExists();
    mockFamilyChildDeleteMany.mockResolvedValue({ count: 1 });
    mockFamilyUpdateMany.mockResolvedValue({ count: 0 });
    mockIndividualDelete.mockResolvedValue({});
    mockTreeEditLogCreate.mockResolvedValue({});

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/individuals/${indId}`,
      { method: 'DELETE' },
    );
    const res = await DELETE(req, individualParams);

    expect(res.status).toBe(204);
  });

  test('removes FamilyChild records referencing deleted individual', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockIndividualExists();
    mockFamilyChildDeleteMany.mockResolvedValue({ count: 2 });
    mockFamilyUpdateMany.mockResolvedValue({ count: 0 });
    mockIndividualDelete.mockResolvedValue({});
    mockTreeEditLogCreate.mockResolvedValue({});

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/individuals/${indId}`,
      { method: 'DELETE' },
    );
    await DELETE(req, individualParams);

    expect(mockFamilyChildDeleteMany).toHaveBeenCalledWith({
      where: { individualId: indId },
    });
  });

  test('nullifies husbandId/wifeId on families referencing deleted individual', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockIndividualExists();
    mockFamilyChildDeleteMany.mockResolvedValue({ count: 0 });
    mockFamilyUpdateMany.mockResolvedValue({ count: 1 });
    mockIndividualDelete.mockResolvedValue({});
    mockTreeEditLogCreate.mockResolvedValue({});

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/individuals/${indId}`,
      { method: 'DELETE' },
    );
    await DELETE(req, individualParams);

    // Should set husbandId to null where it matches
    expect(mockFamilyUpdateMany).toHaveBeenCalledWith({
      where: { husbandId: indId },
      data: { husbandId: null },
    });
    // Should set wifeId to null where it matches
    expect(mockFamilyUpdateMany).toHaveBeenCalledWith({
      where: { wifeId: indId },
      data: { wifeId: null },
    });
  });

  test('logs deletion to TreeEditLog', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockIndividualExists();
    mockFamilyChildDeleteMany.mockResolvedValue({ count: 0 });
    mockFamilyUpdateMany.mockResolvedValue({ count: 0 });
    mockIndividualDelete.mockResolvedValue({});
    mockTreeEditLogCreate.mockResolvedValue({});

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/individuals/${indId}`,
      { method: 'DELETE' },
    );
    await DELETE(req, individualParams);

    expect(mockTreeEditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        treeId,
        userId: fakeUser.id,
        action: 'delete',
        entityType: 'individual',
        entityId: indId,
      }),
    });
  });

  test('wraps delete operations in a transaction', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockIndividualExists();
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        familyChild: { deleteMany: mockFamilyChildDeleteMany },
        family: { updateMany: mockFamilyUpdateMany },
        individual: { delete: mockIndividualDelete },
      });
    });
    mockFamilyChildDeleteMany.mockResolvedValue({ count: 0 });
    mockFamilyUpdateMany.mockResolvedValue({ count: 0 });
    mockIndividualDelete.mockResolvedValue({});
    mockTreeEditLogCreate.mockResolvedValue({});

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/individuals/${indId}`,
      { method: 'DELETE' },
    );
    const res = await DELETE(req, individualParams);

    expect(res.status).toBe(204);
    expect(mockTransaction).toHaveBeenCalled();
  });
});

// ============================================================================
// PATCH — isDeceased and notes fields
// ============================================================================
describe('PATCH individual — isDeceased and notes fields', () => {
  beforeEach(() => vi.clearAllMocks());

  test('accepts isDeceased boolean in update', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockIndividualExists();
    mockTreeEditLogCreate.mockResolvedValue({});

    const updatedIndividual = {
      id: indId,
      treeId,
      givenName: 'محمد',
      isDeceased: true,
      updatedAt: now,
      createdAt: now,
    };
    mockIndividualUpdate.mockResolvedValue(updatedIndividual);

    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/individuals/${indId}`,
      { method: 'PATCH', body: { isDeceased: true } },
    );
    const res = await PATCH(req, individualParams);

    expect(res.status).toBe(200);
    expect(mockIndividualUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isDeceased: true }),
      }),
    );
  });

  test('accepts notes string in update', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockIndividualExists();
    mockTreeEditLogCreate.mockResolvedValue({});

    const updatedIndividual = {
      id: indId,
      treeId,
      givenName: 'محمد',
      notes: 'ملاحظات',
      updatedAt: now,
      createdAt: now,
    };
    mockIndividualUpdate.mockResolvedValue(updatedIndividual);

    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/individuals/${indId}`,
      { method: 'PATCH', body: { notes: 'ملاحظات' } },
    );
    const res = await PATCH(req, individualParams);

    expect(res.status).toBe(200);
    expect(mockIndividualUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ notes: 'ملاحظات' }),
      }),
    );
  });

  test('rejects notes exceeding 5000 characters in update', async () => {
    mockAuth();
    mockTreeEditor();
    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/individuals/${indId}`,
      { method: 'PATCH', body: { notes: 'a'.repeat(5001) } },
    );
    const res = await PATCH(req, individualParams);
    expect(res.status).toBe(400);
  });
});

// ============================================================================
// POST — notes field
// ============================================================================
describe('POST individual — notes field', () => {
  beforeEach(() => vi.clearAllMocks());

  test('accepts notes string in create', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockTreeEditLogCreate.mockResolvedValue({});

    const createdIndividual = {
      id: indId,
      treeId,
      givenName: 'محمد',
      notes: 'ملاحظات جديدة',
      isPrivate: false,
      createdById: fakeUser.id,
      updatedAt: now,
      createdAt: now,
    };
    mockIndividualCreate.mockResolvedValue(createdIndividual);

    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree/individuals`, {
      method: 'POST',
      body: { givenName: 'محمد', notes: 'ملاحظات جديدة' },
    });
    const res = await POST(req, individualsParams);

    expect(res.status).toBe(201);
    const createCall = mockIndividualCreate.mock.calls[0][0];
    expect(createCall.data.notes).toBe('ملاحظات جديدة');
  });

  test('rejects notes exceeding 5000 characters in create', async () => {
    mockAuth();
    mockTreeEditor();
    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree/individuals`, {
      method: 'POST',
      body: { givenName: 'محمد', notes: 'a'.repeat(5001) },
    });
    const res = await POST(req, individualsParams);
    expect(res.status).toBe(400);
  });
});

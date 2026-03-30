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
const mockFamilyTreeUpdate = vi.fn();
const mockFamilyFindFirst = vi.fn();
const mockFamilyChildFindUnique = vi.fn();
const mockFamilyChildCreate = vi.fn();
const mockFamilyChildDelete = vi.fn();
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
      update: (...args: unknown[]) => mockFamilyTreeUpdate(...args),
    },
    family: {
      findFirst: (...args: unknown[]) => mockFamilyFindFirst(...args),
    },
    familyChild: {
      findUnique: (...args: unknown[]) => mockFamilyChildFindUnique(...args),
      create: (...args: unknown[]) => mockFamilyChildCreate(...args),
      delete: (...args: unknown[]) => mockFamilyChildDelete(...args),
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

const wsId = 'ws-uuid-move-child-1';
const treeId = 'tree-uuid-move-1';
const sourceFamId = 'a0000000-0000-4000-a000-000000000010';
const targetFamId = 'a0000000-0000-4000-a000-000000000020';
const childId = 'a0000000-0000-4000-a000-000000000030';

const moveParams = {
  params: Promise.resolve({
    id: wsId,
    familyId: sourceFamId,
    individualId: childId,
  }),
};

const fakeUser = {
  id: 'user-uuid-move-1',
  email: 'editor@example.com',
  user_metadata: { display_name: 'Editor' },
};

function makeRequest(url: string, options: { method?: string; body?: unknown } = {}) {
  const { method = 'POST', body } = options;
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

/** Mock getTreeFamily — returns family for matching IDs, null otherwise */
function mockFamiliesExist(ids: string[]) {
  mockFamilyFindFirst.mockImplementation((args: { where: { id: string; treeId: string } }) => {
    if (ids.includes(args.where.id)) {
      return Promise.resolve({
        id: args.where.id,
        treeId,
        husbandId: null,
        wifeId: null,
        children: args.where.id === sourceFamId
          ? [{ familyId: sourceFamId, individualId: childId }]
          : [],
      });
    }
    return Promise.resolve(null);
  });
}

function baseUrl() {
  return `http://localhost:3000/api/workspaces/${wsId}/tree/families/${sourceFamId}/children/${childId}/move`;
}

function importRoute() {
  return import(
    '@/app/api/workspaces/[id]/tree/families/[familyId]/children/[individualId]/move/route'
  );
}

// ============================================================================
// POST /api/workspaces/[id]/tree/families/[familyId]/children/[individualId]/move
// ============================================================================
describe('POST /api/workspaces/[id]/tree/families/[familyId]/children/[individualId]/move', () => {
  beforeEach(() => vi.clearAllMocks());

  // --------------------------------------------------------------------------
  // 1. Auth: 401 without auth
  // --------------------------------------------------------------------------
  test('returns 401 without auth', async () => {
    mockNoAuth();
    const { POST } = await importRoute();
    const req = makeRequest(baseUrl(), { body: { targetFamilyId: targetFamId } });
    const res = await POST(req, moveParams);
    expect(res.status).toBe(401);
  });

  // --------------------------------------------------------------------------
  // 2. Auth: 403 without tree_editor permission
  // --------------------------------------------------------------------------
  test('returns 403 without tree_editor permission', async () => {
    mockAuth();
    mockMemberNoTreeEdit();
    const { POST } = await importRoute();
    const req = makeRequest(baseUrl(), { body: { targetFamilyId: targetFamId } });
    const res = await POST(req, moveParams);
    expect(res.status).toBe(403);
  });

  // --------------------------------------------------------------------------
  // 3. Validation: 400 if targetFamilyId is not a UUID
  // --------------------------------------------------------------------------
  test('returns 400 if targetFamilyId is not a UUID', async () => {
    mockAuth();
    mockTreeEditor();
    const { POST } = await importRoute();
    const req = makeRequest(baseUrl(), { body: { targetFamilyId: 'not-a-uuid' } });
    const res = await POST(req, moveParams);
    expect(res.status).toBe(400);
  });

  // --------------------------------------------------------------------------
  // 4. Validation: 400 if source == target family
  // --------------------------------------------------------------------------
  test('returns 400 if source == target family', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    const { POST } = await importRoute();
    const req = makeRequest(baseUrl(), { body: { targetFamilyId: sourceFamId } });
    const res = await POST(req, moveParams);
    expect(res.status).toBe(400);
  });

  // --------------------------------------------------------------------------
  // 5. Validation: 400 if source familyId param is not a valid UUID
  // --------------------------------------------------------------------------
  test('returns 400 if source familyId param is not a valid UUID', async () => {
    mockAuth();
    mockTreeEditor();
    const { POST } = await importRoute();
    const badParams = {
      params: Promise.resolve({
        id: wsId,
        familyId: 'not-a-uuid',
        individualId: childId,
      }),
    };
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/not-a-uuid/children/${childId}/move`,
      { body: { targetFamilyId: targetFamId } },
    );
    const res = await POST(req, badParams);
    expect(res.status).toBe(400);
  });

  // --------------------------------------------------------------------------
  // 6. Validation: 400 if individualId param is not a valid UUID
  // --------------------------------------------------------------------------
  test('returns 400 if individualId param is not a valid UUID', async () => {
    mockAuth();
    mockTreeEditor();
    const { POST } = await importRoute();
    const badParams = {
      params: Promise.resolve({
        id: wsId,
        familyId: sourceFamId,
        individualId: 'not-a-uuid',
      }),
    };
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/${sourceFamId}/children/not-a-uuid/move`,
      { body: { targetFamilyId: targetFamId } },
    );
    const res = await POST(req, badParams);
    expect(res.status).toBe(400);
  });

  // --------------------------------------------------------------------------
  // 7. 404 if source family not found in tree
  // --------------------------------------------------------------------------
  test('returns 404 if source family not found in tree', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    // Only target exists, source does not
    mockFamiliesExist([targetFamId]);

    const { POST } = await importRoute();
    const req = makeRequest(baseUrl(), { body: { targetFamilyId: targetFamId } });
    const res = await POST(req, moveParams);
    expect(res.status).toBe(404);
  });

  // --------------------------------------------------------------------------
  // 8. 404 if target family not found in tree
  // --------------------------------------------------------------------------
  test('returns 404 if target family not found in tree', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    // Only source exists, target does not
    mockFamiliesExist([sourceFamId]);

    const { POST } = await importRoute();
    const req = makeRequest(baseUrl(), { body: { targetFamilyId: targetFamId } });
    const res = await POST(req, moveParams);
    expect(res.status).toBe(404);
  });

  // --------------------------------------------------------------------------
  // 9. 404 if child not in source family
  // --------------------------------------------------------------------------
  test('returns 404 if child not in source family', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockFamiliesExist([sourceFamId, targetFamId]);
    // Child NOT found in source family
    mockFamilyChildFindUnique.mockResolvedValue(null);

    const { POST } = await importRoute();
    const req = makeRequest(baseUrl(), { body: { targetFamilyId: targetFamId } });
    const res = await POST(req, moveParams);
    expect(res.status).toBe(404);
  });

  // --------------------------------------------------------------------------
  // 10. 409 if child already in target family
  // --------------------------------------------------------------------------
  test('returns 409 if child already in target family', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockFamiliesExist([sourceFamId, targetFamId]);
    // First call: child in source (found), second call: child in target (found = duplicate)
    mockFamilyChildFindUnique
      .mockResolvedValueOnce({ familyId: sourceFamId, individualId: childId })
      .mockResolvedValueOnce({ familyId: targetFamId, individualId: childId });

    const { POST } = await importRoute();
    const req = makeRequest(baseUrl(), { body: { targetFamilyId: targetFamId } });
    const res = await POST(req, moveParams);
    expect(res.status).toBe(409);
  });

  // --------------------------------------------------------------------------
  // 11. 200 on successful move
  // --------------------------------------------------------------------------
  test('returns 200 on successful move', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockFamiliesExist([sourceFamId, targetFamId]);
    // Child in source: found. Child in target: not found.
    mockFamilyChildFindUnique
      .mockResolvedValueOnce({ familyId: sourceFamId, individualId: childId })
      .mockResolvedValueOnce(null);
    // Transaction executes the callback
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        familyChild: {
          delete: mockFamilyChildDelete.mockResolvedValue({}),
          create: mockFamilyChildCreate.mockResolvedValue({
            familyId: targetFamId,
            individualId: childId,
          }),
        },
        treeEditLog: {
          create: mockTreeEditLogCreate.mockResolvedValue({}),
        },
      });
    });

    const { POST } = await importRoute();
    const req = makeRequest(baseUrl(), { body: { targetFamilyId: targetFamId } });
    const res = await POST(req, moveParams);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 12. Verify audit log entry created with correct payload
  // --------------------------------------------------------------------------
  test('creates audit log with MOVE_CHILD action and correct payload', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockFamiliesExist([sourceFamId, targetFamId]);
    mockFamilyChildFindUnique
      .mockResolvedValueOnce({ familyId: sourceFamId, individualId: childId })
      .mockResolvedValueOnce(null);
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        familyChild: {
          delete: mockFamilyChildDelete.mockResolvedValue({}),
          create: mockFamilyChildCreate.mockResolvedValue({
            familyId: targetFamId,
            individualId: childId,
          }),
        },
        treeEditLog: {
          create: mockTreeEditLogCreate.mockResolvedValue({}),
        },
      });
    });

    const { POST } = await importRoute();
    const req = makeRequest(baseUrl(), { body: { targetFamilyId: targetFamId } });
    await POST(req, moveParams);

    expect(mockTreeEditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        treeId,
        userId: fakeUser.id,
        action: 'MOVE_CHILD',
        entityType: 'family_child',
        entityId: childId,
        payload: {
          sourceFamilyId: sourceFamId,
          targetFamilyId: targetFamId,
          individualId: childId,
        },
      }),
    });
  });

  // --------------------------------------------------------------------------
  // 13. Verify transaction deletes from source and creates in target
  // --------------------------------------------------------------------------
  test('transaction deletes from source and creates in target', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockFamiliesExist([sourceFamId, targetFamId]);
    mockFamilyChildFindUnique
      .mockResolvedValueOnce({ familyId: sourceFamId, individualId: childId })
      .mockResolvedValueOnce(null);
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        familyChild: {
          delete: mockFamilyChildDelete.mockResolvedValue({}),
          create: mockFamilyChildCreate.mockResolvedValue({
            familyId: targetFamId,
            individualId: childId,
          }),
        },
        treeEditLog: {
          create: mockTreeEditLogCreate.mockResolvedValue({}),
        },
      });
    });

    const { POST } = await importRoute();
    const req = makeRequest(baseUrl(), { body: { targetFamilyId: targetFamId } });
    await POST(req, moveParams);

    // Verify delete was called with source family
    expect(mockFamilyChildDelete).toHaveBeenCalledWith({
      where: {
        familyId_individualId: {
          familyId: sourceFamId,
          individualId: childId,
        },
      },
    });

    // Verify create was called with target family
    expect(mockFamilyChildCreate).toHaveBeenCalledWith({
      data: {
        familyId: targetFamId,
        individualId: childId,
      },
    });
  });
});

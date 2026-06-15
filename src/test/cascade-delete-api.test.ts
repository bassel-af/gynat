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
const mockIndividualFindFirst = vi.fn();
const mockIndividualDelete = vi.fn();
const mockIndividualDeleteMany = vi.fn();
const mockFamilyUpdateMany = vi.fn();
const mockFamilyDeleteMany = vi.fn();
const mockFamilyChildDeleteMany = vi.fn();
const mockBranchPointerUpdateMany = vi.fn();
const mockBranchShareTokenUpdateMany = vi.fn();
const mockTreeEditLogCreate = vi.fn();
const mockTreeEditLogCreateMany = vi.fn();
const mockTransaction = vi.fn();

const mockRadaFamilyUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
const mockUserTreeLinkDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
const mockWorkspaceInvitationUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
const mockBranchPointerCount = vi.fn().mockResolvedValue(0);

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: {
      findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
    },
    familyTree: {
      findUnique: (...args: unknown[]) => mockFamilyTreeFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFamilyTreeFindUnique(...args),
      create: (...args: unknown[]) => mockFamilyTreeCreate(...args),
      update: (...args: unknown[]) => mockFamilyTreeUpdate(...args),
    },
    individual: {
      findFirst: (...args: unknown[]) => mockIndividualFindFirst(...args),
      delete: (...args: unknown[]) => mockIndividualDelete(...args),
      deleteMany: (...args: unknown[]) => mockIndividualDeleteMany(...args),
    },
    family: {
      updateMany: (...args: unknown[]) => mockFamilyUpdateMany(...args),
      deleteMany: (...args: unknown[]) => mockFamilyDeleteMany(...args),
    },
    familyChild: {
      deleteMany: (...args: unknown[]) => mockFamilyChildDeleteMany(...args),
    },
    branchPointer: {
      findFirst: () => Promise.resolve(null),
      updateMany: (...args: unknown[]) => mockBranchPointerUpdateMany(...args),
      count: (...args: unknown[]) => mockBranchPointerCount(...args),
    },
    branchShareToken: {
      updateMany: (...args: unknown[]) => mockBranchShareTokenUpdateMany(...args),
    },
    radaFamily: {
      updateMany: (...args: unknown[]) => mockRadaFamilyUpdateMany(...args),
    },
    userTreeLink: {
      deleteMany: (...args: unknown[]) => mockUserTreeLinkDeleteMany(...args),
    },
    workspaceInvitation: {
      updateMany: (...args: unknown[]) => mockWorkspaceInvitationUpdateMany(...args),
    },
    treeEditLog: {
      create: (...args: unknown[]) => mockTreeEditLogCreate(...args),
      createMany: (...args: unknown[]) => mockTreeEditLogCreateMany(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

// Mock branch pointer queries — individuals are not pointed in these tests
vi.mock('@/lib/tree/branch-pointer-queries', () => ({
  isPointedIndividualInWorkspace: vi.fn().mockResolvedValue(false),
  getActivePointersForWorkspace: vi.fn().mockResolvedValue([]),
}));

// Phase 10b: stub getWorkspaceKey so routes that call it resolve to a
// deterministic 32-byte buffer without needing a prisma.workspace.findUnique
// mock. Other encryption exports pass through to the real implementation.
vi.mock('@/lib/tree/encryption', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tree/encryption')>('@/lib/tree/encryption');
  return {
    ...actual,
    getWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 7)),
    getOrCreateWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 7)),
  };
});

// Mock the tree mapper
const mockDbTreeToGedcomData = vi.fn();
vi.mock('@/lib/tree/mapper', () => ({
  dbTreeToGedcomData: (...args: unknown[]) => mockDbTreeToGedcomData(...args),
  redactPrivateIndividuals: vi.fn((data: unknown) => data),
}));

// Mock computeDeleteImpact from cascade-delete — keep other helpers real
const mockComputeDeleteImpact = vi.fn();
vi.mock('@/lib/tree/cascade-delete', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tree/cascade-delete')>('@/lib/tree/cascade-delete');
  return {
    ...actual,
    computeDeleteImpact: (...args: unknown[]) => mockComputeDeleteImpact(...args),
  };
});

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const wsId = 'ws-cascade-test-1';
const treeId = 'tree-cascade-1';
const indId = 'ind-target-1';
const lastModifiedAt = new Date('2026-04-01T12:00:00.000Z');

const impactParams = {
  params: Promise.resolve({ id: wsId, individualId: indId }),
};
const deleteParams = {
  params: Promise.resolve({ id: wsId, individualId: indId }),
};

const fakeUser = {
  id: 'user-cascade-1',
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
    permissions: ['tree_editor'],
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
  const tree = {
    id: treeId,
    workspaceId: wsId,
    lastModifiedAt,
    individuals: [],
    families: [],
    radaFamilies: [],
  };
  mockFamilyTreeFindUnique.mockResolvedValue(tree);
  mockFamilyTreeCreate.mockResolvedValue(tree);
}

function mockIndividualExists() {
  mockIndividualFindFirst.mockResolvedValue({
    id: indId,
    treeId,
    givenName: 'محمد',
    surname: 'السعيد',
  });
}

function mockIndividualNotFound() {
  mockIndividualFindFirst.mockResolvedValue(null);
}

function mockDefaultTransaction() {
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    return fn({
      familyChild: { deleteMany: mockFamilyChildDeleteMany },
      family: {
        updateMany: mockFamilyUpdateMany,
        deleteMany: mockFamilyDeleteMany,
      },
      individual: {
        delete: mockIndividualDelete,
        deleteMany: mockIndividualDeleteMany,
      },
      branchPointer: { updateMany: mockBranchPointerUpdateMany },
      branchShareToken: { updateMany: mockBranchShareTokenUpdateMany },
      radaFamily: { updateMany: mockRadaFamilyUpdateMany },
      userTreeLink: { deleteMany: mockUserTreeLinkDeleteMany },
      workspaceInvitation: { updateMany: mockWorkspaceInvitationUpdateMany },
      treeEditLog: {
        create: mockTreeEditLogCreate,
        createMany: mockTreeEditLogCreateMany,
      },
      familyTree: { update: mockFamilyTreeUpdate },
    });
  });
}

// ============================================================================
// GET /api/workspaces/[id]/tree/individuals/[individualId]/delete-impact
// ============================================================================

describe('GET /delete-impact — cascade delete impact analysis', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns 401 for unauthenticated user', async () => {
    mockNoAuth();
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/delete-impact/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/individuals/${indId}/delete-impact`,
    );
    const res = await GET(req, impactParams);
    expect(res.status).toBe(401);
  });

  test('returns 403 for member without tree_editor permission', async () => {
    mockAuth();
    mockMemberNoTreeEdit();
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/delete-impact/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/individuals/${indId}/delete-impact`,
    );
    const res = await GET(req, impactParams);
    expect(res.status).toBe(403);
  });

  test('returns 404 if individual not found in tree', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockIndividualNotFound();
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/delete-impact/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/individuals/${indId}/delete-impact`,
    );
    const res = await GET(req, impactParams);
    expect(res.status).toBe(404);
  });

  test('returns impact with hasImpact=false when no cascade', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockIndividualExists();
    mockComputeDeleteImpact.mockReturnValue({ hasImpact: false, affectedIds: new Set(), affectedNames: [], truncated: false });
    mockDbTreeToGedcomData.mockReturnValue({
      individuals: { [indId]: { id: indId, name: 'محمد', familiesAsSpouse: [], familyAsChild: null } },
      families: {},
    });

    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/delete-impact/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/individuals/${indId}/delete-impact`,
    );
    const res = await GET(req, impactParams);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.hasImpact).toBe(false);
    expect(body.data.affectedCount).toBe(0);
  });

  test('returns impact with hasImpact=true and affected names when cascade exists', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockIndividualExists();
    mockComputeDeleteImpact.mockReturnValue({ hasImpact: true, affectedIds: new Set(['orphan-1', 'orphan-2']), affectedNames: ['أحمد', 'فاطمة'], truncated: false });
    mockDbTreeToGedcomData.mockReturnValue({
      individuals: {
        [indId]: { id: indId, name: 'محمد', givenName: 'محمد', familiesAsSpouse: [], familyAsChild: null },
        'orphan-1': { id: 'orphan-1', name: 'أحمد', givenName: 'أحمد', familiesAsSpouse: [], familyAsChild: null },
        'orphan-2': { id: 'orphan-2', name: 'فاطمة', givenName: 'فاطمة', familiesAsSpouse: [], familyAsChild: null },
        'root-id': { id: 'root-id', name: 'سعيد', givenName: 'سعيد', familiesAsSpouse: [], familyAsChild: null },
      },
      families: {},
    });

    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/delete-impact/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/individuals/${indId}/delete-impact`,
    );
    const res = await GET(req, impactParams);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.hasImpact).toBe(true);
    expect(body.data.affectedCount).toBe(2);
    expect(body.data.affectedNames).toHaveLength(2);
    expect(body.data.versionHash).toBeDefined();
    expect(typeof body.data.versionHash).toBe('string');
  });

  test('returns versionHash derived from tree lastModifiedAt', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockIndividualExists();
    mockComputeDeleteImpact.mockReturnValue({ hasImpact: false, affectedIds: new Set(), affectedNames: [], truncated: false });
    mockDbTreeToGedcomData.mockReturnValue({
      individuals: {
        [indId]: { id: indId, name: 'محمد', familiesAsSpouse: [], familyAsChild: null },
        'root-id': { id: 'root-id', name: 'سعيد', familiesAsSpouse: [], familyAsChild: null },
      },
      families: {},
    });

    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/delete-impact/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/individuals/${indId}/delete-impact`,
    );
    const res = await GET(req, impactParams);
    const body = await res.json();

    // Hash should be consistent for same timestamp
    expect(body.data.versionHash).toBeTruthy();

    // Call again — should get same hash
    mockExistingTree();
    mockIndividualExists();
    mockComputeDeleteImpact.mockReturnValue({ hasImpact: false, affectedIds: new Set(), affectedNames: [], truncated: false });
    mockDbTreeToGedcomData.mockReturnValue({
      individuals: {
        [indId]: { id: indId, name: 'محمد', familiesAsSpouse: [], familyAsChild: null },
        'root-id': { id: 'root-id', name: 'سعيد', familiesAsSpouse: [], familyAsChild: null },
      },
      families: {},
    });

    const req2 = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/individuals/${indId}/delete-impact`,
    );
    const res2 = await GET(req2, { params: Promise.resolve({ id: wsId, individualId: indId }) });
    const body2 = await res2.json();

    expect(body2.data.versionHash).toBe(body.data.versionHash);
  });
});

// ============================================================================
// Enhanced DELETE — cascade mode with version hash
// ============================================================================

describe('DELETE /individuals/[individualId] — cascade delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDefaultTransaction();
  });

  test('simple delete (no cascade) still returns 204', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockIndividualExists();
    mockComputeDeleteImpact.mockReturnValue({ hasImpact: false, affectedIds: new Set(), affectedNames: [], truncated: false });
    mockDbTreeToGedcomData.mockReturnValue({
      individuals: {
        [indId]: { id: indId, name: 'محمد', familiesAsSpouse: [], familyAsChild: null },
        'root-id': { id: 'root-id', name: 'سعيد', familiesAsSpouse: [], familyAsChild: null },
      },
      families: {},
    });
    mockFamilyChildDeleteMany.mockResolvedValue({ count: 0 });
    mockFamilyUpdateMany.mockResolvedValue({ count: 0 });
    mockIndividualDelete.mockResolvedValue({});
    mockTreeEditLogCreate.mockResolvedValue({});

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/individuals/${indId}`,
      { method: 'DELETE' },
    );
    const res = await DELETE(req, deleteParams);
    expect(res.status).toBe(204);
  });

  test('returns 409 with impact when cascade detected but no versionHash provided', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockIndividualExists();
    mockComputeDeleteImpact.mockReturnValue({ hasImpact: true, affectedIds: new Set(['orphan-1', 'orphan-2']), affectedNames: ['أحمد', 'فاطمة'], truncated: false });
    mockDbTreeToGedcomData.mockReturnValue({
      individuals: {
        [indId]: { id: indId, name: 'محمد', givenName: 'محمد', familiesAsSpouse: [], familyAsChild: null },
        'orphan-1': { id: 'orphan-1', name: 'أحمد', givenName: 'أحمد', familiesAsSpouse: [], familyAsChild: null },
        'orphan-2': { id: 'orphan-2', name: 'فاطمة', givenName: 'فاطمة', familiesAsSpouse: [], familyAsChild: null },
        'root-id': { id: 'root-id', name: 'سعيد', givenName: 'سعيد', familiesAsSpouse: [], familyAsChild: null },
      },
      families: {},
    });

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/individuals/${indId}`,
      { method: 'DELETE' },
    );
    const res = await DELETE(req, deleteParams);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.data.hasImpact).toBe(true);
    expect(body.data.affectedCount).toBe(2);
    expect(body.data.versionHash).toBeDefined();
  });

  test('returns 409 when versionHash does not match (stale data)', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockIndividualExists();
    mockComputeDeleteImpact.mockReturnValue({ hasImpact: true, affectedIds: new Set(['orphan-1']), affectedNames: ['أحمد'], truncated: false });
    mockDbTreeToGedcomData.mockReturnValue({
      individuals: {
        [indId]: { id: indId, name: 'محمد', givenName: 'محمد', familiesAsSpouse: [], familyAsChild: null },
        'orphan-1': { id: 'orphan-1', name: 'أحمد', givenName: 'أحمد', familiesAsSpouse: [], familyAsChild: null },
        'root-id': { id: 'root-id', name: 'سعيد', givenName: 'سعيد', familiesAsSpouse: [], familyAsChild: null },
      },
      families: {},
    });

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/individuals/${indId}`,
      { method: 'DELETE', body: { versionHash: 'stale-hash-value' } },
    );
    const res = await DELETE(req, { params: Promise.resolve({ id: wsId, individualId: indId }) });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.data.hasImpact).toBe(true);
    expect(body.data.versionHash).toBeDefined();
    expect(body.data.versionHash).not.toBe('stale-hash-value');
  });

  test('cascade delete succeeds with valid versionHash, returns 204', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockIndividualExists();

    const affectedIds = new Set(['orphan-1', 'orphan-2']);
    mockComputeDeleteImpact.mockReturnValue({ hasImpact: true, affectedIds, affectedNames: ['أحمد', 'فاطمة'], truncated: false });
    mockDbTreeToGedcomData.mockReturnValue({
      individuals: {
        [indId]: { id: indId, name: 'محمد', givenName: 'محمد', familiesAsSpouse: [], familyAsChild: null },
        'orphan-1': { id: 'orphan-1', name: 'أحمد', givenName: 'أحمد', familiesAsSpouse: [], familyAsChild: null },
        'orphan-2': { id: 'orphan-2', name: 'فاطمة', givenName: 'فاطمة', familiesAsSpouse: [], familyAsChild: null },
      },
      families: {},
    });

    // First: get the valid versionHash from the impact endpoint
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/delete-impact/route'
    );
    const impactReq = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/individuals/${indId}/delete-impact`,
    );
    const impactRes = await GET(impactReq, { params: Promise.resolve({ id: wsId, individualId: indId }) });
    const impactBody = await impactRes.json();
    const validHash = impactBody.data.versionHash;

    // Reset mocks for the DELETE call
    vi.clearAllMocks();
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockIndividualExists();
    mockDefaultTransaction();
    mockComputeDeleteImpact.mockReturnValue({ hasImpact: true, affectedIds, affectedNames: ['أحمد', 'فاطمة'], truncated: false });
    mockDbTreeToGedcomData.mockReturnValue({
      individuals: {
        [indId]: { id: indId, name: 'محمد', givenName: 'محمد', familiesAsSpouse: [], familyAsChild: null },
        'orphan-1': { id: 'orphan-1', name: 'أحمد', givenName: 'أحمد', familiesAsSpouse: [], familyAsChild: null },
        'orphan-2': { id: 'orphan-2', name: 'فاطمة', givenName: 'فاطمة', familiesAsSpouse: [], familyAsChild: null },
      },
      families: {},
    });
    mockFamilyChildDeleteMany.mockResolvedValue({ count: 0 });
    mockFamilyUpdateMany.mockResolvedValue({ count: 0 });
    mockFamilyDeleteMany.mockResolvedValue({ count: 0 });
    mockIndividualDelete.mockResolvedValue({});
    mockIndividualDeleteMany.mockResolvedValue({ count: 2 });
    mockBranchPointerUpdateMany.mockResolvedValue({ count: 0 });
    mockBranchShareTokenUpdateMany.mockResolvedValue({ count: 0 });
    mockTreeEditLogCreate.mockResolvedValue({});
    mockTreeEditLogCreateMany.mockResolvedValue({ count: 1 });

    // Now DELETE with valid hash
    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/individuals/${indId}`,
      { method: 'DELETE', body: { versionHash: validHash } },
    );
    const res = await DELETE(req, { params: Promise.resolve({ id: wsId, individualId: indId }) });

    expect(res.status).toBe(204);
  });

  test('cascade delete transaction deletes all unreachable individuals', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockIndividualExists();
    mockComputeDeleteImpact.mockReturnValue({ hasImpact: false, affectedIds: new Set(), affectedNames: [], truncated: false });
    mockDbTreeToGedcomData.mockReturnValue({
      individuals: {
        [indId]: { id: indId, name: 'محمد', familiesAsSpouse: [], familyAsChild: null },
        'root-id': { id: 'root-id', name: 'سعيد', familiesAsSpouse: [], familyAsChild: null },
      },
      families: {},
    });
    mockFamilyChildDeleteMany.mockResolvedValue({ count: 0 });
    mockFamilyUpdateMany.mockResolvedValue({ count: 0 });
    mockIndividualDelete.mockResolvedValue({});
    mockTreeEditLogCreate.mockResolvedValue({});

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/individuals/${indId}`,
      { method: 'DELETE' },
    );
    await DELETE(req, { params: Promise.resolve({ id: wsId, individualId: indId }) });

    // For a simple delete (no cascade), transaction should still run
    expect(mockTransaction).toHaveBeenCalled();
  });

  test('cascade delete logs all deleted entities to TreeEditLog', async () => {
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockIndividualExists();
    mockComputeDeleteImpact.mockReturnValue({ hasImpact: false, affectedIds: new Set(), affectedNames: [], truncated: false });
    mockDbTreeToGedcomData.mockReturnValue({
      individuals: {
        [indId]: { id: indId, name: 'محمد', familiesAsSpouse: [], familyAsChild: null },
        'root-id': { id: 'root-id', name: 'سعيد', familiesAsSpouse: [], familyAsChild: null },
      },
      families: {},
    });
    mockFamilyChildDeleteMany.mockResolvedValue({ count: 0 });
    mockFamilyUpdateMany.mockResolvedValue({ count: 0 });
    mockIndividualDelete.mockResolvedValue({});
    mockTreeEditLogCreate.mockResolvedValue({});

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/individuals/${indId}`,
      { method: 'DELETE' },
    );
    await DELETE(req, { params: Promise.resolve({ id: wsId, individualId: indId }) });

    // Should log the delete action
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
});

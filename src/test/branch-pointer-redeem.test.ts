import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
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
const mockShareTokenFindFirst = vi.fn();
const mockShareTokenUpdate = vi.fn();
const mockBranchPointerCreate = vi.fn();
const mockBranchPointerCount = vi.fn();
const mockBranchPointerFindFirst = vi.fn();
const mockIndividualFindFirst = vi.fn();
const mockFamilyTreeFindUnique = vi.fn();
const mockTransaction = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: {
      findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
    },
    branchShareToken: {
      findFirst: (...args: unknown[]) => mockShareTokenFindFirst(...args),
      update: (...args: unknown[]) => mockShareTokenUpdate(...args),
    },
    branchPointer: {
      create: (...args: unknown[]) => mockBranchPointerCreate(...args),
      count: (...args: unknown[]) => mockBranchPointerCount(...args),
      findFirst: (...args: unknown[]) => mockBranchPointerFindFirst(...args),
    },
    individual: {
      findFirst: (...args: unknown[]) => mockIndividualFindFirst(...args),
    },
    familyTree: {
      findUnique: (...args: unknown[]) => mockFamilyTreeFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFamilyTreeFindUnique(...args),
    },
    familyChild: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock('@/lib/tree/branch-share-token', () => ({
  hashToken: (token: string) => `hashed_${token}`,
  TOKEN_PREFIX: 'brsh_',
}));

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const wsId = 'ws-target-uuid';
const fakeUser = {
  id: 'user-uuid-editor',
  email: 'editor@example.com',
  user_metadata: { display_name: 'Editor' },
};

function makePostRequest(url: string, body: object) {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      authorization: 'Bearer valid-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function mockAuth() {
  mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
}

function mockEditor() {
  mockMembershipFindUnique.mockResolvedValue({
    userId: fakeUser.id,
    workspaceId: wsId,
    role: 'workspace_admin',
    permissions: ['tree_editor'],
  });
}

const anchorId = '123e4567-e89b-12d3-a456-426614174000';
const routeParams = { params: Promise.resolve({ id: wsId }) };

function mockValidToken() {
  mockShareTokenFindFirst.mockResolvedValue({
    id: 'token-uuid-1',
    tokenHash: 'hashed_brsh_valid-token',
    sourceWorkspaceId: 'ws-source-uuid',
    rootIndividualId: 'src-root-uuid',
    depthLimit: null,
    includeGrafts: false,
    targetWorkspaceId: wsId, // scoped to this workspace
    isPublic: false,
    maxUses: 1,
    useCount: 0,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 86400000), // 1 day from now
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/workspaces/[id]/branch-pointers — redeem token', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns 401 for unauthenticated user', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token' },
    });

    const { POST } = await import(
      '@/app/api/workspaces/[id]/branch-pointers/route'
    );
    const req = makePostRequest(
      `http://localhost:3000/api/workspaces/${wsId}/branch-pointers`,
      { token: 'brsh_valid-token', anchorIndividualId: anchorId, selectedPersonId: 'src-root-uuid', relationship: 'child' },
    );
    const res = await POST(req, routeParams);
    expect(res.status).toBe(401);
  });

  test('returns 403 for non-tree-editor member', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_member',
      permissions: [],
    });

    const { POST } = await import(
      '@/app/api/workspaces/[id]/branch-pointers/route'
    );
    const req = makePostRequest(
      `http://localhost:3000/api/workspaces/${wsId}/branch-pointers`,
      { token: 'brsh_valid-token', anchorIndividualId: anchorId, selectedPersonId: 'src-root-uuid', relationship: 'child' },
    );
    const res = await POST(req, routeParams);
    expect(res.status).toBe(403);
  });

  test('returns generic error for invalid/expired/revoked token', async () => {
    mockAuth();
    mockEditor();
    // Token not found (invalid hash)
    mockShareTokenFindFirst.mockResolvedValue(null);

    const { POST } = await import(
      '@/app/api/workspaces/[id]/branch-pointers/route'
    );
    const req = makePostRequest(
      `http://localhost:3000/api/workspaces/${wsId}/branch-pointers`,
      { token: 'brsh_invalid-token', anchorIndividualId: anchorId, selectedPersonId: 'src-root-uuid', relationship: 'child' },
    );
    const res = await POST(req, routeParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    // Security: generic error message, no info about why
    expect(body.error).toBeDefined();
  });

  test('returns 201 for valid redemption', async () => {
    mockAuth();
    mockEditor();
    mockValidToken();
    mockBranchPointerCount.mockResolvedValue(0);
    mockIndividualFindFirst.mockResolvedValue({ id: anchorId });
    mockBranchPointerFindFirst.mockResolvedValue(null); // No existing pointer on anchor
    mockFamilyTreeFindUnique.mockResolvedValue({
      id: 'tree-target',
      workspaceId: wsId,
    });
    mockShareTokenUpdate.mockResolvedValue({});
    mockBranchPointerCreate.mockResolvedValue({
      id: 'bp-uuid-1',
      sourceWorkspaceId: 'ws-source-uuid',
      rootIndividualId: 'src-root-uuid',
      targetWorkspaceId: wsId,
      anchorIndividualId: anchorId,
      relationship: 'child',
      status: 'active',
    });
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const txProxy = {
        branchShareToken: {
          update: (...args: unknown[]) => mockShareTokenUpdate(...args),
          findUnique: vi.fn().mockResolvedValue({ id: 'token-uuid-1', isRevoked: false }),
        },
        branchPointer: {
          create: (...args: unknown[]) => mockBranchPointerCreate(...args),
          findFirst: (...args: unknown[]) => mockBranchPointerFindFirst(...args),
        },
      };
      return fn(txProxy);
    });

    const { POST } = await import(
      '@/app/api/workspaces/[id]/branch-pointers/route'
    );
    const req = makePostRequest(
      `http://localhost:3000/api/workspaces/${wsId}/branch-pointers`,
      { token: 'brsh_valid-token', anchorIndividualId: anchorId, selectedPersonId: 'src-root-uuid', relationship: 'child' },
    );
    const res = await POST(req, routeParams);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe('bp-uuid-1');
    expect(body.data.status).toBe('active');
  });

  test('returns 400 for invalid relationship type', async () => {
    mockAuth();
    mockEditor();

    const { POST } = await import(
      '@/app/api/workspaces/[id]/branch-pointers/route'
    );
    const req = makePostRequest(
      `http://localhost:3000/api/workspaces/${wsId}/branch-pointers`,
      { token: 'brsh_valid-token', anchorIndividualId: anchorId, selectedPersonId: 'src-root-uuid', relationship: 'cousin' },
    );
    const res = await POST(req, routeParams);
    expect(res.status).toBe(400);
  });

  test('rejects token revoked between validation and transaction (race condition)', async () => {
    mockAuth();
    mockEditor();
    mockValidToken(); // Token appears valid during initial check
    mockBranchPointerCount.mockResolvedValue(0);
    mockIndividualFindFirst.mockResolvedValue({ id: anchorId });
    mockBranchPointerFindFirst.mockResolvedValue(null);
    mockFamilyTreeFindUnique.mockResolvedValue({
      id: 'tree-target',
      workspaceId: wsId,
    });

    // Inside the transaction, the token has been revoked by another request
    const mockShareTokenFindUniqueTx = vi.fn().mockResolvedValue({
      id: 'token-uuid-1',
      isRevoked: true, // revoked between validation and transaction!
    });

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const txProxy = {
        branchShareToken: {
          update: (...args: unknown[]) => mockShareTokenUpdate(...args),
          findUnique: (...args: unknown[]) => mockShareTokenFindUniqueTx(...args),
        },
        branchPointer: {
          create: (...args: unknown[]) => mockBranchPointerCreate(...args),
          findFirst: (...args: unknown[]) => mockBranchPointerFindFirst(...args),
        },
      };
      return fn(txProxy);
    });

    const { POST } = await import(
      '@/app/api/workspaces/[id]/branch-pointers/route'
    );
    const req = makePostRequest(
      `http://localhost:3000/api/workspaces/${wsId}/branch-pointers`,
      { token: 'brsh_valid-token', anchorIndividualId: anchorId, selectedPersonId: 'src-root-uuid', relationship: 'child' },
    );
    const res = await POST(req, routeParams);

    // Should reject because the token was revoked
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();

    // Pointer should NOT have been created
    expect(mockBranchPointerCreate).not.toHaveBeenCalled();
  });

  test('rejects token scoped to a different workspace', async () => {
    mockAuth();
    mockEditor();
    // Token is scoped to a different workspace
    mockShareTokenFindFirst.mockResolvedValue({
      id: 'token-uuid-1',
      tokenHash: 'hashed_brsh_valid-token',
      sourceWorkspaceId: 'ws-source-uuid',
      rootIndividualId: 'src-root-uuid',
      depthLimit: null,
      includeGrafts: false,
      targetWorkspaceId: 'ws-other-uuid', // NOT our workspace
      isPublic: false,
      maxUses: 1,
      useCount: 0,
      isRevoked: false,
      expiresAt: new Date(Date.now() + 86400000),
    });

    const { POST } = await import(
      '@/app/api/workspaces/[id]/branch-pointers/route'
    );
    const req = makePostRequest(
      `http://localhost:3000/api/workspaces/${wsId}/branch-pointers`,
      { token: 'brsh_valid-token', anchorIndividualId: anchorId, selectedPersonId: 'src-root-uuid', relationship: 'child' },
    );
    const res = await POST(req, routeParams);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/workspaces/[id]/branch-pointers/[pointerId] — disconnect
// ---------------------------------------------------------------------------

const mockBranchPointerFindUnique = vi.fn();
const mockBranchPointerUpdate = vi.fn();
const mockNotificationCreate = vi.fn();

vi.mock('@/lib/db', async () => {
  // Re-use the same mock shape but add findUnique + update
  return {
    prisma: {
      workspaceMembership: {
        findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
      },
      branchShareToken: {
        findFirst: (...args: unknown[]) => mockShareTokenFindFirst(...args),
        update: (...args: unknown[]) => mockShareTokenUpdate(...args),
      },
      branchPointer: {
        create: (...args: unknown[]) => mockBranchPointerCreate(...args),
        count: (...args: unknown[]) => mockBranchPointerCount(...args),
        findFirst: (...args: unknown[]) => mockBranchPointerFindFirst(...args),
        findUnique: (...args: unknown[]) => mockBranchPointerFindUnique(...args),
        update: (...args: unknown[]) => mockBranchPointerUpdate(...args),
      },
      individual: {
        findFirst: (...args: unknown[]) => mockIndividualFindFirst(...args),
      },
      familyTree: {
        findUnique: (...args: unknown[]) => mockFamilyTreeFindUnique(...args),
        findFirst: (...args: unknown[]) => mockFamilyTreeFindUnique(...args),
      },
      familyChild: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      notification: {
        create: (...args: unknown[]) => mockNotificationCreate(...args),
      },
      $transaction: (...args: unknown[]) => mockTransaction(...args),
    },
  };
});

const pointerId = 'bp-uuid-1';
const deleteRouteParams = {
  params: Promise.resolve({ id: wsId, pointerId }),
};

function makeDeleteRequest(url: string) {
  return new NextRequest(url, {
    method: 'DELETE',
    headers: {
      authorization: 'Bearer valid-token',
    },
  });
}

describe('DELETE /api/workspaces/[id]/branch-pointers/[pointerId] — disconnect', () => {
  beforeEach(() => vi.clearAllMocks());

  test('marks pointer as broken and creates disconnect notification (no deep copy)', async () => {
    mockAuth();
    mockEditor();
    mockBranchPointerFindUnique.mockResolvedValue({
      id: pointerId,
      targetWorkspaceId: wsId,
      sourceWorkspaceId: 'ws-source-uuid',
      rootIndividualId: 'src-root-uuid',
      anchorIndividualId: anchorId,
      relationship: 'child',
      depthLimit: null,
      includeGrafts: false,
      status: 'active',
    });
    mockBranchPointerUpdate.mockResolvedValue({
      id: pointerId,
      status: 'broken',
    });
    mockNotificationCreate.mockResolvedValue({});

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/branch-pointers/[pointerId]/route'
    );
    const req = makeDeleteRequest(
      `http://localhost:3000/api/workspaces/${wsId}/branch-pointers/${pointerId}`,
    );
    const res = await DELETE(req, deleteRouteParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('broken');

    // Verify pointer was updated to broken
    expect(mockBranchPointerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: pointerId },
        data: { status: 'broken' },
      }),
    );

    // Verify notification was created with action: 'disconnect'
    expect(mockNotificationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'branch_pointer_broken',
          payload: expect.objectContaining({
            action: 'disconnect',
          }),
        }),
      }),
    );
  });

  test('returns 404 for pointer not belonging to workspace', async () => {
    mockAuth();
    mockEditor();
    mockBranchPointerFindUnique.mockResolvedValue({
      id: pointerId,
      targetWorkspaceId: 'ws-other-uuid', // different workspace
      status: 'active',
    });

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/branch-pointers/[pointerId]/route'
    );
    const req = makeDeleteRequest(
      `http://localhost:3000/api/workspaces/${wsId}/branch-pointers/${pointerId}`,
    );
    const res = await DELETE(req, deleteRouteParams);
    expect(res.status).toBe(404);
  });

  test('returns 400 for non-active pointer', async () => {
    mockAuth();
    mockEditor();
    mockBranchPointerFindUnique.mockResolvedValue({
      id: pointerId,
      targetWorkspaceId: wsId,
      status: 'broken',
    });

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/branch-pointers/[pointerId]/route'
    );
    const req = makeDeleteRequest(
      `http://localhost:3000/api/workspaces/${wsId}/branch-pointers/${pointerId}`,
    );
    const res = await DELETE(req, deleteRouteParams);
    expect(res.status).toBe(400);
  });
});

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
const mockMembershipFindMany = vi.fn();
const mockShareTokenFindUnique = vi.fn();
const mockShareTokenUpdate = vi.fn();
const mockBranchPointerUpdateMany = vi.fn();
const mockBranchPointerUpdate = vi.fn();
const mockBranchPointerFindMany = vi.fn();
const mockBranchPointerCount = vi.fn();
const mockNotificationCreateMany = vi.fn();
const mockTreeEditLogCreate = vi.fn();
const mockTransaction = vi.fn();
const mockIndividualCreateMany = vi.fn();
const mockFamilyCreateMany = vi.fn();
const mockFamilyCreate = vi.fn();
const mockFamilyChildCreate = vi.fn();

const mockPrisma = {
  workspaceMembership: {
    findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
    findMany: (...args: unknown[]) => mockMembershipFindMany(...args),
  },
  branchShareToken: {
    findUnique: (...args: unknown[]) => mockShareTokenFindUnique(...args),
    update: (...args: unknown[]) => mockShareTokenUpdate(...args),
  },
  branchPointer: {
    updateMany: (...args: unknown[]) => mockBranchPointerUpdateMany(...args),
    update: (...args: unknown[]) => mockBranchPointerUpdate(...args),
    findMany: (...args: unknown[]) => mockBranchPointerFindMany(...args),
    count: (...args: unknown[]) => mockBranchPointerCount(...args),
  },
  notification: {
    createMany: (...args: unknown[]) => mockNotificationCreateMany(...args),
  },
  treeEditLog: {
    create: (...args: unknown[]) => mockTreeEditLogCreate(...args),
  },
  individual: {
    createMany: (...args: unknown[]) => mockIndividualCreateMany(...args),
  },
  family: {
    createMany: (...args: unknown[]) => mockFamilyCreateMany(...args),
    create: (...args: unknown[]) => mockFamilyCreate(...args),
  },
  familyChild: {
    create: (...args: unknown[]) => mockFamilyChildCreate(...args),
  },
  $transaction: (...args: unknown[]) => mockTransaction(...args),
};

vi.mock('@/lib/db', () => ({
  prisma: mockPrisma,
}));

// Mock tree queries
const mockGetTreeByWorkspaceId = vi.fn();
const mockGetOrCreateTree = vi.fn();
vi.mock('@/lib/tree/queries', () => ({
  getTreeByWorkspaceId: (...args: unknown[]) => mockGetTreeByWorkspaceId(...args),
  getOrCreateTree: (...args: unknown[]) => mockGetOrCreateTree(...args),
}));

// Mock mapper
const mockDbTreeToGedcomData = vi.fn();
vi.mock('@/lib/tree/mapper', () => ({
  dbTreeToGedcomData: (...args: unknown[]) => mockDbTreeToGedcomData(...args),
}));

// Mock merge
const mockExtractPointedSubtree = vi.fn();
vi.mock('@/lib/tree/branch-pointer-merge', () => ({
  extractPointedSubtree: (...args: unknown[]) => mockExtractPointedSubtree(...args),
}));

// Mock deep copy
const mockPrepareDeepCopy = vi.fn();
const mockPersistDeepCopy = vi.fn();
vi.mock('@/lib/tree/branch-pointer-deep-copy', () => ({
  prepareDeepCopy: (...args: unknown[]) => mockPrepareDeepCopy(...args),
  persistDeepCopy: (...args: unknown[]) => mockPersistDeepCopy(...args),
}));

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const wsId = 'ws-source-uuid';
const tokenId = 'token-uuid-1';
const fakeUser = {
  id: 'user-uuid-admin',
  email: 'admin@example.com',
  user_metadata: { display_name: 'Admin User' },
};

function makeDeleteRequest(url: string) {
  return new NextRequest(url, {
    method: 'DELETE',
    headers: { authorization: 'Bearer valid-token' },
  });
}

function mockAuth() {
  mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
}

function mockAdmin() {
  mockMembershipFindUnique.mockResolvedValue({
    userId: fakeUser.id,
    workspaceId: wsId,
    role: 'workspace_admin',
    permissions: [],
  });
}

const routeParams = { params: Promise.resolve({ id: wsId, tokenId }) };

function setupTransactionPassthrough() {
  mockTransaction.mockImplementation((fn: (tx: typeof mockPrisma) => Promise<unknown>) =>
    fn(mockPrisma),
  );
}

function makeActivePointer(id: string, targetWsId: string) {
  return {
    id,
    sourceWorkspaceId: wsId,
    rootIndividualId: 'src-root',
    selectedIndividualId: 'src-root',
    depthLimit: null,
    includeGrafts: false,
    targetWorkspaceId: targetWsId,
    anchorIndividualId: 'anchor-id',
    relationship: 'child',
    status: 'active',
    shareTokenId: tokenId,
  };
}

// ---------------------------------------------------------------------------
// Tests — DELETE /api/workspaces/[id]/share-tokens/[tokenId] (revoke)
// ---------------------------------------------------------------------------

describe('DELETE /api/workspaces/[id]/share-tokens/[tokenId] — revoke with auto deep-copy', () => {
  beforeEach(() => vi.clearAllMocks());

  test('token is revoked FIRST, before any deep-copy attempt', async () => {
    mockAuth();
    mockAdmin();

    mockShareTokenFindUnique.mockResolvedValue({
      id: tokenId,
      sourceWorkspaceId: wsId,
      isRevoked: false,
    });

    mockShareTokenUpdate.mockResolvedValue({ id: tokenId, isRevoked: true });

    // No active pointers
    mockBranchPointerFindMany.mockResolvedValue([]);
    mockMembershipFindMany.mockResolvedValue([]);
    mockNotificationCreateMany.mockResolvedValue({ count: 0 });

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/share-tokens/[tokenId]/route'
    );
    const req = makeDeleteRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens/${tokenId}`,
    );
    const res = await DELETE(req, routeParams);
    expect(res.status).toBe(200);

    // Token must be revoked unconditionally
    expect(mockShareTokenUpdate).toHaveBeenCalledWith({
      where: { id: tokenId },
      data: { isRevoked: true },
    });
  });

  test('active pointers are deep-copied before being marked revoked', async () => {
    mockAuth();
    mockAdmin();
    setupTransactionPassthrough();

    mockShareTokenFindUnique.mockResolvedValue({
      id: tokenId,
      sourceWorkspaceId: wsId,
      isRevoked: false,
    });
    mockShareTokenUpdate.mockResolvedValue({ id: tokenId, isRevoked: true });

    const ptr1 = makeActivePointer('ptr-1', 'ws-target-1');
    const ptr2 = makeActivePointer('ptr-2', 'ws-target-2');
    mockBranchPointerFindMany.mockResolvedValue([ptr1, ptr2]);

    // Source tree
    const sourceTree = { id: 'tree-source', workspaceId: wsId, individuals: [], families: [] };
    mockGetTreeByWorkspaceId.mockResolvedValue(sourceTree);
    mockDbTreeToGedcomData.mockReturnValue({ individuals: {}, families: {} });

    // Extract subtree
    mockExtractPointedSubtree.mockReturnValue({ individuals: {}, families: {} });

    // Prepare deep copy
    mockPrepareDeepCopy.mockReturnValue({
      individuals: { 'new-ind': {} },
      families: {},
      idMap: new Map(),
      stitchFamily: null,
    });

    // Target trees
    mockGetOrCreateTree.mockResolvedValue({ id: 'target-tree' });

    // persistDeepCopy succeeds
    mockPersistDeepCopy.mockResolvedValue(undefined);
    mockBranchPointerUpdate.mockResolvedValue({});
    mockTreeEditLogCreate.mockResolvedValue({});

    // Notifications
    mockMembershipFindMany.mockResolvedValue([{ userId: 'target-admin-1' }]);
    mockNotificationCreateMany.mockResolvedValue({ count: 1 });

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/share-tokens/[tokenId]/route'
    );
    const req = makeDeleteRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens/${tokenId}`,
    );
    const res = await DELETE(req, routeParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.copiedPointers).toBe(2);
    expect(body.disconnectedPointers).toBe(2);

    // persistDeepCopy should have been called for each pointer
    expect(mockPersistDeepCopy).toHaveBeenCalledTimes(2);

    // Each pointer should be marked revoked individually
    expect(mockBranchPointerUpdate).toHaveBeenCalledTimes(2);
    expect(mockBranchPointerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ptr-1' },
        data: { status: 'revoked' },
      }),
    );
    expect(mockBranchPointerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ptr-2' },
        data: { status: 'revoked' },
      }),
    );
  });

  test('source tree is fetched only ONCE for all pointers', async () => {
    mockAuth();
    mockAdmin();
    setupTransactionPassthrough();

    mockShareTokenFindUnique.mockResolvedValue({
      id: tokenId,
      sourceWorkspaceId: wsId,
      isRevoked: false,
    });
    mockShareTokenUpdate.mockResolvedValue({ id: tokenId, isRevoked: true });

    // Three pointers from this token
    mockBranchPointerFindMany.mockResolvedValue([
      makeActivePointer('ptr-1', 'ws-target-1'),
      makeActivePointer('ptr-2', 'ws-target-2'),
      makeActivePointer('ptr-3', 'ws-target-3'),
    ]);

    const sourceTree = { id: 'tree-source', workspaceId: wsId, individuals: [], families: [] };
    mockGetTreeByWorkspaceId.mockResolvedValue(sourceTree);
    mockDbTreeToGedcomData.mockReturnValue({ individuals: {}, families: {} });
    mockExtractPointedSubtree.mockReturnValue({ individuals: {}, families: {} });
    mockPrepareDeepCopy.mockReturnValue({
      individuals: {},
      families: {},
      idMap: new Map(),
      stitchFamily: null,
    });
    mockGetOrCreateTree.mockResolvedValue({ id: 'target-tree' });
    mockPersistDeepCopy.mockResolvedValue(undefined);
    mockBranchPointerUpdate.mockResolvedValue({});
    mockTreeEditLogCreate.mockResolvedValue({});
    mockMembershipFindMany.mockResolvedValue([]);
    mockNotificationCreateMany.mockResolvedValue({ count: 0 });

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/share-tokens/[tokenId]/route'
    );
    const req = makeDeleteRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens/${tokenId}`,
    );
    await DELETE(req, routeParams);

    // Source tree fetched exactly once
    expect(mockGetTreeByWorkspaceId).toHaveBeenCalledTimes(1);
    expect(mockDbTreeToGedcomData).toHaveBeenCalledTimes(1);
  });

  test('deep-copy failure does not prevent token revocation', async () => {
    mockAuth();
    mockAdmin();
    setupTransactionPassthrough();

    mockShareTokenFindUnique.mockResolvedValue({
      id: tokenId,
      sourceWorkspaceId: wsId,
      isRevoked: false,
    });
    mockShareTokenUpdate.mockResolvedValue({ id: tokenId, isRevoked: true });

    mockBranchPointerFindMany.mockResolvedValue([
      makeActivePointer('ptr-1', 'ws-target-1'),
    ]);

    // Source tree exists
    const sourceTree = { id: 'tree-source', workspaceId: wsId, individuals: [], families: [] };
    mockGetTreeByWorkspaceId.mockResolvedValue(sourceTree);
    mockDbTreeToGedcomData.mockReturnValue({ individuals: {}, families: {} });
    mockExtractPointedSubtree.mockReturnValue({ individuals: {}, families: {} });
    mockPrepareDeepCopy.mockReturnValue({
      individuals: { 'new-ind': {} },
      families: {},
      idMap: new Map(),
      stitchFamily: null,
    });
    mockGetOrCreateTree.mockResolvedValue({ id: 'target-tree' });

    // Deep copy throws an error
    mockPersistDeepCopy.mockRejectedValue(new Error('DB constraint violation'));

    // Pointer should still be revoked even if copy fails
    mockBranchPointerUpdate.mockResolvedValue({});
    mockMembershipFindMany.mockResolvedValue([]);
    mockNotificationCreateMany.mockResolvedValue({ count: 0 });

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/share-tokens/[tokenId]/route'
    );
    const req = makeDeleteRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens/${tokenId}`,
    );
    const res = await DELETE(req, routeParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    // Token was still revoked
    expect(mockShareTokenUpdate).toHaveBeenCalledWith({
      where: { id: tokenId },
      data: { isRevoked: true },
    });
    // Pointer was revoked without copy
    expect(body.disconnectedPointers).toBe(1);
    expect(body.copiedPointers).toBe(0);
  });

  test('source tree deleted — skip copy but still revoke pointers', async () => {
    mockAuth();
    mockAdmin();
    setupTransactionPassthrough();

    mockShareTokenFindUnique.mockResolvedValue({
      id: tokenId,
      sourceWorkspaceId: wsId,
      isRevoked: false,
    });
    mockShareTokenUpdate.mockResolvedValue({ id: tokenId, isRevoked: true });

    mockBranchPointerFindMany.mockResolvedValue([
      makeActivePointer('ptr-1', 'ws-target-1'),
    ]);

    // Source tree is null (deleted)
    mockGetTreeByWorkspaceId.mockResolvedValue(null);

    // Pointer should still be revoked
    mockBranchPointerUpdate.mockResolvedValue({});
    mockMembershipFindMany.mockResolvedValue([]);
    mockNotificationCreateMany.mockResolvedValue({ count: 0 });

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/share-tokens/[tokenId]/route'
    );
    const req = makeDeleteRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens/${tokenId}`,
    );
    const res = await DELETE(req, routeParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.disconnectedPointers).toBe(1);
    expect(body.copiedPointers).toBe(0);

    // No deep-copy attempted
    expect(mockPrepareDeepCopy).not.toHaveBeenCalled();
    expect(mockPersistDeepCopy).not.toHaveBeenCalled();
  });

  test('no active pointers — just revoke token', async () => {
    mockAuth();
    mockAdmin();

    mockShareTokenFindUnique.mockResolvedValue({
      id: tokenId,
      sourceWorkspaceId: wsId,
      isRevoked: false,
    });
    mockShareTokenUpdate.mockResolvedValue({ id: tokenId, isRevoked: true });

    mockBranchPointerFindMany.mockResolvedValue([]);
    mockMembershipFindMany.mockResolvedValue([]);
    mockNotificationCreateMany.mockResolvedValue({ count: 0 });

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/share-tokens/[tokenId]/route'
    );
    const req = makeDeleteRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens/${tokenId}`,
    );
    const res = await DELETE(req, routeParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.disconnectedPointers).toBe(0);
    expect(body.copiedPointers).toBe(0);

    // No tree lookup needed
    expect(mockGetTreeByWorkspaceId).not.toHaveBeenCalled();
  });

  test('fully-revoked token (no active pointers) returns 400', async () => {
    mockAuth();
    mockAdmin();

    mockShareTokenFindUnique.mockResolvedValue({
      id: tokenId,
      sourceWorkspaceId: wsId,
      isRevoked: true,
    });
    // No active pointers — fully revoked
    mockBranchPointerCount.mockResolvedValue(0);

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/share-tokens/[tokenId]/route'
    );
    const req = makeDeleteRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens/${tokenId}`,
    );
    const res = await DELETE(req, routeParams);
    expect(res.status).toBe(400);
  });

  test('disabled token (isRevoked but has active pointers) allows DELETE for nuclear revoke', async () => {
    mockAuth();
    mockAdmin();
    setupTransactionPassthrough();

    mockShareTokenFindUnique.mockResolvedValue({
      id: tokenId,
      sourceWorkspaceId: wsId,
      isRevoked: true, // Already disabled via PATCH
    });
    // Has active pointers — this is a disabled token, not fully revoked
    mockBranchPointerCount.mockResolvedValue(2);

    const ptr1 = makeActivePointer('ptr-1', 'ws-target-1');
    const ptr2 = makeActivePointer('ptr-2', 'ws-target-2');
    mockBranchPointerFindMany.mockResolvedValue([ptr1, ptr2]);

    // Source tree
    const sourceTree = { id: 'tree-source', workspaceId: wsId, individuals: [], families: [] };
    mockGetTreeByWorkspaceId.mockResolvedValue(sourceTree);
    mockDbTreeToGedcomData.mockReturnValue({ individuals: {}, families: {} });
    mockExtractPointedSubtree.mockReturnValue({ individuals: {}, families: {} });
    mockPrepareDeepCopy.mockReturnValue({
      individuals: { 'new-ind': {} },
      families: {},
      idMap: new Map(),
      stitchFamily: null,
    });
    mockGetOrCreateTree.mockResolvedValue({ id: 'target-tree' });
    mockPersistDeepCopy.mockResolvedValue(undefined);
    mockBranchPointerUpdate.mockResolvedValue({});
    mockTreeEditLogCreate.mockResolvedValue({});
    mockMembershipFindMany.mockResolvedValue([]);
    mockNotificationCreateMany.mockResolvedValue({ count: 0 });

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/share-tokens/[tokenId]/route'
    );
    const req = makeDeleteRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens/${tokenId}`,
    );
    const res = await DELETE(req, routeParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.copiedPointers).toBe(2);
    // Should NOT re-update the token since it's already isRevoked
    expect(mockShareTokenUpdate).not.toHaveBeenCalled();
  });

  test('notifications are created for target workspace admins', async () => {
    mockAuth();
    mockAdmin();
    setupTransactionPassthrough();

    mockShareTokenFindUnique.mockResolvedValue({
      id: tokenId,
      sourceWorkspaceId: wsId,
      isRevoked: false,
    });
    mockShareTokenUpdate.mockResolvedValue({ id: tokenId, isRevoked: true });

    mockBranchPointerFindMany.mockResolvedValue([
      makeActivePointer('ptr-1', 'ws-target-1'),
      makeActivePointer('ptr-2', 'ws-target-2'),
    ]);

    // Source tree not available — skip copy, but still notify
    mockGetTreeByWorkspaceId.mockResolvedValue(null);
    mockBranchPointerUpdate.mockResolvedValue({});

    mockMembershipFindMany.mockResolvedValue([
      { userId: 'target-admin-1' },
      { userId: 'target-admin-2' },
    ]);
    mockNotificationCreateMany.mockResolvedValue({ count: 2 });

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/share-tokens/[tokenId]/route'
    );
    const req = makeDeleteRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens/${tokenId}`,
    );
    await DELETE(req, routeParams);

    expect(mockNotificationCreateMany).toHaveBeenCalled();
    const createCall = mockNotificationCreateMany.mock.calls[0][0];
    expect(createCall.data.length).toBeGreaterThan(0);
    for (const notification of createCall.data) {
      expect(notification.type).toBe('branch_pointer_revoked');
      expect(notification.payload).toHaveProperty('action', 'token_revoked');
    }
  });

  test('response includes copiedPointers count', async () => {
    mockAuth();
    mockAdmin();
    setupTransactionPassthrough();

    mockShareTokenFindUnique.mockResolvedValue({
      id: tokenId,
      sourceWorkspaceId: wsId,
      isRevoked: false,
    });
    mockShareTokenUpdate.mockResolvedValue({ id: tokenId, isRevoked: true });

    // 2 pointers: one succeeds copy, one fails
    const ptr1 = makeActivePointer('ptr-1', 'ws-target-1');
    const ptr2 = makeActivePointer('ptr-2', 'ws-target-2');
    mockBranchPointerFindMany.mockResolvedValue([ptr1, ptr2]);

    const sourceTree = { id: 'tree-source', workspaceId: wsId, individuals: [], families: [] };
    mockGetTreeByWorkspaceId.mockResolvedValue(sourceTree);
    mockDbTreeToGedcomData.mockReturnValue({ individuals: {}, families: {} });
    mockExtractPointedSubtree.mockReturnValue({ individuals: {}, families: {} });
    mockPrepareDeepCopy.mockReturnValue({
      individuals: { 'new-ind': {} },
      families: {},
      idMap: new Map(),
      stitchFamily: null,
    });
    mockGetOrCreateTree.mockResolvedValue({ id: 'target-tree' });

    // First pointer copy succeeds, second fails
    mockPersistDeepCopy
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('fail'));
    mockBranchPointerUpdate.mockResolvedValue({});
    mockTreeEditLogCreate.mockResolvedValue({});
    mockMembershipFindMany.mockResolvedValue([]);
    mockNotificationCreateMany.mockResolvedValue({ count: 0 });

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/share-tokens/[tokenId]/route'
    );
    const req = makeDeleteRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens/${tokenId}`,
    );
    const res = await DELETE(req, routeParams);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.copiedPointers).toBe(1);
    expect(body.disconnectedPointers).toBe(2);
  });
});

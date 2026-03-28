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
const mockShareTokenFindUnique = vi.fn();
const mockShareTokenUpdate = vi.fn();
const mockBranchPointerFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: {
      findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
    },
    branchShareToken: {
      findUnique: (...args: unknown[]) => mockShareTokenFindUnique(...args),
      update: (...args: unknown[]) => mockShareTokenUpdate(...args),
    },
    branchPointer: {
      findMany: (...args: unknown[]) => mockBranchPointerFindMany(...args),
    },
  },
}));

// Mock deep-copy imports (needed for the module to load, but PATCH should never call them)
vi.mock('@/lib/tree/queries', () => ({
  getTreeByWorkspaceId: vi.fn(),
  getOrCreateTree: vi.fn(),
}));
vi.mock('@/lib/tree/mapper', () => ({
  dbTreeToGedcomData: vi.fn(),
}));
vi.mock('@/lib/tree/branch-pointer-merge', () => ({
  extractPointedSubtree: vi.fn(),
}));
vi.mock('@/lib/tree/branch-pointer-deep-copy', () => ({
  prepareDeepCopy: vi.fn(),
  persistDeepCopy: vi.fn(),
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

function makePatchRequest(url: string, body: object) {
  return new NextRequest(url, {
    method: 'PATCH',
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

function mockAdmin() {
  mockMembershipFindUnique.mockResolvedValue({
    userId: fakeUser.id,
    workspaceId: wsId,
    role: 'workspace_admin',
    permissions: [],
  });
}

const routeParams = { params: Promise.resolve({ id: wsId, tokenId }) };

// ---------------------------------------------------------------------------
// Tests — PATCH /api/workspaces/[id]/share-tokens/[tokenId] (disable/enable)
// ---------------------------------------------------------------------------

describe('PATCH /api/workspaces/[id]/share-tokens/[tokenId] — disable/enable', () => {
  beforeEach(() => vi.clearAllMocks());

  test('disables an active token (sets isRevoked to true)', async () => {
    mockAuth();
    mockAdmin();

    mockShareTokenFindUnique.mockResolvedValue({
      id: tokenId,
      sourceWorkspaceId: wsId,
      isRevoked: false,
    });
    mockShareTokenUpdate.mockResolvedValue({ id: tokenId, isRevoked: true });

    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/share-tokens/[tokenId]/route'
    );
    const req = makePatchRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens/${tokenId}`,
      { isRevoked: true },
    );
    const res = await PATCH(req, routeParams);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);

    // Token should be updated
    expect(mockShareTokenUpdate).toHaveBeenCalledWith({
      where: { id: tokenId },
      data: { isRevoked: true },
    });
  });

  test('re-enables a disabled token (sets isRevoked to false)', async () => {
    mockAuth();
    mockAdmin();

    mockShareTokenFindUnique.mockResolvedValue({
      id: tokenId,
      sourceWorkspaceId: wsId,
      isRevoked: true,
    });
    mockShareTokenUpdate.mockResolvedValue({ id: tokenId, isRevoked: false });

    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/share-tokens/[tokenId]/route'
    );
    const req = makePatchRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens/${tokenId}`,
      { isRevoked: false },
    );
    const res = await PATCH(req, routeParams);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);

    expect(mockShareTokenUpdate).toHaveBeenCalledWith({
      where: { id: tokenId },
      data: { isRevoked: false },
    });
  });

  test('does NOT touch pointers when disabling', async () => {
    mockAuth();
    mockAdmin();

    mockShareTokenFindUnique.mockResolvedValue({
      id: tokenId,
      sourceWorkspaceId: wsId,
      isRevoked: false,
    });
    mockShareTokenUpdate.mockResolvedValue({ id: tokenId, isRevoked: true });

    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/share-tokens/[tokenId]/route'
    );
    const req = makePatchRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens/${tokenId}`,
      { isRevoked: true },
    );
    await PATCH(req, routeParams);

    // Pointers should NOT be queried or modified
    expect(mockBranchPointerFindMany).not.toHaveBeenCalled();
  });

  test('returns 404 for non-existent token', async () => {
    mockAuth();
    mockAdmin();

    mockShareTokenFindUnique.mockResolvedValue(null);

    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/share-tokens/[tokenId]/route'
    );
    const req = makePatchRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens/${tokenId}`,
      { isRevoked: true },
    );
    const res = await PATCH(req, routeParams);
    expect(res.status).toBe(404);
  });

  test('returns 404 for token from different workspace', async () => {
    mockAuth();
    mockAdmin();

    mockShareTokenFindUnique.mockResolvedValue({
      id: tokenId,
      sourceWorkspaceId: 'other-workspace-id',
      isRevoked: false,
    });

    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/share-tokens/[tokenId]/route'
    );
    const req = makePatchRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens/${tokenId}`,
      { isRevoked: true },
    );
    const res = await PATCH(req, routeParams);
    expect(res.status).toBe(404);
  });

  test('returns 400 for invalid body (missing isRevoked)', async () => {
    mockAuth();
    mockAdmin();

    mockShareTokenFindUnique.mockResolvedValue({
      id: tokenId,
      sourceWorkspaceId: wsId,
      isRevoked: false,
    });

    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/share-tokens/[tokenId]/route'
    );
    const req = makePatchRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens/${tokenId}`,
      { someOtherField: true },
    );
    const res = await PATCH(req, routeParams);
    expect(res.status).toBe(400);
  });

  test('returns 400 for non-boolean isRevoked', async () => {
    mockAuth();
    mockAdmin();

    mockShareTokenFindUnique.mockResolvedValue({
      id: tokenId,
      sourceWorkspaceId: wsId,
      isRevoked: false,
    });

    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/share-tokens/[tokenId]/route'
    );
    const req = makePatchRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens/${tokenId}`,
      { isRevoked: 'yes' },
    );
    const res = await PATCH(req, routeParams);
    expect(res.status).toBe(400);
  });

  test('returns 403 for non-admin member', async () => {
    mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_member',
      permissions: [],
    });

    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/share-tokens/[tokenId]/route'
    );
    const req = makePatchRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens/${tokenId}`,
      { isRevoked: true },
    );
    const res = await PATCH(req, routeParams);
    expect(res.status).toBe(403);
  });
});

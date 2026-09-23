/**
 * «قفزة نسب» per-workspace opt-in (`enableAncestryJumps`, OFF by default).
 *
 * Covers `PATCH /api/workspaces/[id]` accepting the flag and auditing a flip
 * (the create-route gate itself is covered in ancestry-jump-api.test.ts).
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

const mockMembershipFindUnique = vi.fn();
const mockWorkspaceFindUnique = vi.fn();
const mockWorkspaceUpdate = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: {
      findUnique: (...a: unknown[]) => mockMembershipFindUnique(...a),
    },
    workspace: {
      findUnique: (...a: unknown[]) => mockWorkspaceFindUnique(...a),
      update: (...a: unknown[]) => mockWorkspaceUpdate(...a),
    },
  },
}));

const mockLogAdminAccess = vi.fn();
vi.mock('@/lib/audit/admin-access', () => ({
  logAdminAccess: (...a: unknown[]) => mockLogAdminAccess(...a),
}));

import { NextRequest } from 'next/server';

const wsId = 'ws-jump-toggle-1';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PATCH /api/workspaces/[id] — enableAncestryJumps', () => {
  const routeParams = { params: Promise.resolve({ id: wsId }) };
  const admin = { id: 'user-admin-jump-1', email: 'a@example.com', user_metadata: {} };

  function patch(body: unknown) {
    return new NextRequest(`http://localhost:4000/api/workspaces/${wsId}`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: admin }, error: null });
    mockMembershipFindUnique.mockResolvedValue({
      userId: admin.id,
      workspaceId: wsId,
      role: 'workspace_admin',
      permissions: [],
    });
  });

  test('admin can turn the flag on — it reaches the update payload', async () => {
    mockWorkspaceFindUnique.mockResolvedValue({ enableAncestryJumps: false });
    mockWorkspaceUpdate.mockResolvedValue({ id: wsId, enableAncestryJumps: true });
    const { PATCH } = await import('@/app/api/workspaces/[id]/route');
    const res = await PATCH(patch({ enableAncestryJumps: true }), routeParams);
    expect(res.status).toBe(200);
    expect(mockWorkspaceUpdate.mock.calls[0][0].data).toEqual({ enableAncestryJumps: true });
  });

  test('a flip is written to the admin access log', async () => {
    mockWorkspaceFindUnique.mockResolvedValue({ enableAncestryJumps: false });
    mockWorkspaceUpdate.mockResolvedValue({ id: wsId, enableAncestryJumps: true });
    const { PATCH } = await import('@/app/api/workspaces/[id]/route');
    await PATCH(patch({ enableAncestryJumps: true }), routeParams);
    expect(mockLogAdminAccess).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'enableAncestryJumps: false -> true' }),
    );
  });

  test('a non-admin member gets 403', async () => {
    mockMembershipFindUnique.mockResolvedValue({
      userId: admin.id,
      workspaceId: wsId,
      role: 'workspace_member',
      permissions: ['tree_editor'],
    });
    const { PATCH } = await import('@/app/api/workspaces/[id]/route');
    const res = await PATCH(patch({ enableAncestryJumps: true }), routeParams);
    expect(res.status).toBe(403);
    expect(mockWorkspaceUpdate).not.toHaveBeenCalled();
  });
});

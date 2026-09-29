/**
 * «اسم الشهرة» per-workspace opt-in (`enableFamousName`) + the stale-tree fix.
 *
 * `PATCH /api/workspaces/[id]`:
 *   - accepts `enableFamousName` (admin-only, like enableKunya);
 *   - audits a flip of enableKunya / enableFamousName (one row per flipped field);
 *   - when enableKunya or enableFamousName actually flips, bumps
 *     `lastModifiedAt` on EVERY tree of the workspace (main + extras) so the
 *     tree ETag changes and clients stop seeing a stale payload.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

const mockMembershipFindUnique = vi.fn();
const mockWorkspaceFindUnique = vi.fn();
const mockWorkspaceUpdate = vi.fn();
const mockFamilyTreeUpdateMany = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: {
      findUnique: (...a: unknown[]) => mockMembershipFindUnique(...a),
    },
    workspace: {
      findUnique: (...a: unknown[]) => mockWorkspaceFindUnique(...a),
      update: (...a: unknown[]) => mockWorkspaceUpdate(...a),
    },
    familyTree: {
      updateMany: (...a: unknown[]) => mockFamilyTreeUpdateMany(...a),
    },
  },
}));

const mockLogAdminAccess = vi.fn();
vi.mock('@/lib/audit/admin-access', () => ({
  logAdminAccess: (...a: unknown[]) => mockLogAdminAccess(...a),
}));

import { NextRequest } from 'next/server';

const wsId = 'ws-famous-toggle-1';
const routeParams = { params: Promise.resolve({ id: wsId }) };
const admin = { id: 'user-admin-famous-1', email: 'a@example.com', user_metadata: {} };

function patch(body: unknown) {
  return new NextRequest(`http://localhost:4000/api/workspaces/${wsId}`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function asRole(role: string) {
  mockMembershipFindUnique.mockResolvedValue({
    userId: admin.id,
    workspaceId: wsId,
    role,
    permissions: [],
  });
}

const baseline = {
  enableTreeExport: true,
  allowMemberExport: false,
  enableAncestryJumps: false,
  enableKunya: false,
  enableFamousName: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: admin }, error: null });
  asRole('workspace_admin');
  mockFamilyTreeUpdateMany.mockResolvedValue({ count: 3 });
});

describe('PATCH /api/workspaces/[id] — enableFamousName', () => {
  test('admin can turn enableFamousName on — it reaches the update payload', async () => {
    mockWorkspaceFindUnique.mockResolvedValue(baseline);
    mockWorkspaceUpdate.mockResolvedValue({ id: wsId, ...baseline, enableFamousName: true });
    const { PATCH } = await import('@/app/api/workspaces/[id]/route');
    const res = await PATCH(patch({ enableFamousName: true }), routeParams);
    expect(res.status).toBe(200);
    expect(mockWorkspaceUpdate.mock.calls[0][0].data).toEqual({ enableFamousName: true });
  });

  test('a non-admin member is rejected and nothing is written', async () => {
    asRole('workspace_member');
    const { PATCH } = await import('@/app/api/workspaces/[id]/route');
    const res = await PATCH(patch({ enableFamousName: true }), routeParams);
    expect(res.status).toBe(403);
    expect(mockWorkspaceUpdate).not.toHaveBeenCalled();
    expect(mockFamilyTreeUpdateMany).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/workspaces/[id] — tree timestamps bump on display-toggle flips', () => {
  test('flipping enableFamousName bumps lastModifiedAt on every tree of the workspace', async () => {
    mockWorkspaceFindUnique.mockResolvedValue(baseline);
    mockWorkspaceUpdate.mockResolvedValue({ id: wsId, ...baseline, enableFamousName: true });
    const { PATCH } = await import('@/app/api/workspaces/[id]/route');
    await PATCH(patch({ enableFamousName: true }), routeParams);
    expect(mockFamilyTreeUpdateMany).toHaveBeenCalledTimes(1);
    const arg = mockFamilyTreeUpdateMany.mock.calls[0][0];
    // Scoped by workspace only — no `kind` filter, so main AND every extra tree.
    expect(arg.where).toEqual({ workspaceId: wsId });
    expect(arg.data.lastModifiedAt).toBeInstanceOf(Date);
  });

  test('flipping enableKunya bumps lastModifiedAt on every tree of the workspace', async () => {
    mockWorkspaceFindUnique.mockResolvedValue(baseline);
    mockWorkspaceUpdate.mockResolvedValue({ id: wsId, ...baseline, enableKunya: true });
    const { PATCH } = await import('@/app/api/workspaces/[id]/route');
    await PATCH(patch({ enableKunya: true }), routeParams);
    expect(mockFamilyTreeUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockFamilyTreeUpdateMany.mock.calls[0][0].where).toEqual({ workspaceId: wsId });
  });

  test('re-sending an unchanged enableFamousName value bumps nothing', async () => {
    mockWorkspaceFindUnique.mockResolvedValue({ ...baseline, enableFamousName: true });
    mockWorkspaceUpdate.mockResolvedValue({ id: wsId, ...baseline, enableFamousName: true });
    const { PATCH } = await import('@/app/api/workspaces/[id]/route');
    await PATCH(patch({ enableFamousName: true }), routeParams);
    expect(mockFamilyTreeUpdateMany).not.toHaveBeenCalled();
  });

  test('flipping an unrelated setting bumps nothing', async () => {
    mockWorkspaceFindUnique.mockResolvedValue(baseline);
    mockWorkspaceUpdate.mockResolvedValue({ id: wsId, ...baseline, nameAr: 'جديد' });
    const { PATCH } = await import('@/app/api/workspaces/[id]/route');
    await PATCH(patch({ nameAr: 'جديد' }), routeParams);
    expect(mockFamilyTreeUpdateMany).not.toHaveBeenCalled();
  });

  test('flipping both toggles in one request bumps the trees once', async () => {
    mockWorkspaceFindUnique.mockResolvedValue(baseline);
    mockWorkspaceUpdate.mockResolvedValue({
      id: wsId, ...baseline, enableKunya: true, enableFamousName: true,
    });
    const { PATCH } = await import('@/app/api/workspaces/[id]/route');
    await PATCH(patch({ enableKunya: true, enableFamousName: true }), routeParams);
    expect(mockFamilyTreeUpdateMany).toHaveBeenCalledTimes(1);
  });
});

describe('PATCH /api/workspaces/[id] — auditing enableKunya / enableFamousName', () => {
  test('one audit row per flipped field', async () => {
    mockWorkspaceFindUnique.mockResolvedValue(baseline);
    mockWorkspaceUpdate.mockResolvedValue({
      id: wsId, ...baseline, enableKunya: true, enableFamousName: true,
    });
    const { PATCH } = await import('@/app/api/workspaces/[id]/route');
    await PATCH(patch({ enableKunya: true, enableFamousName: true }), routeParams);
    const reasons = mockLogAdminAccess.mock.calls.map((c) => c[0].reason);
    expect(reasons.sort()).toEqual([
      'enableFamousName: false -> true',
      'enableKunya: false -> true',
    ]);
  });

  test('an unchanged value writes no audit row', async () => {
    mockWorkspaceFindUnique.mockResolvedValue({ ...baseline, enableFamousName: true });
    mockWorkspaceUpdate.mockResolvedValue({ id: wsId, ...baseline, enableFamousName: true });
    const { PATCH } = await import('@/app/api/workspaces/[id]/route');
    await PATCH(patch({ enableFamousName: true }), routeParams);
    expect(mockLogAdminAccess).not.toHaveBeenCalled();
  });
});

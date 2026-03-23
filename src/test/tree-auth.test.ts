import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}));

const mockMembershipFindUnique = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: {
      findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
    },
  },
}));

import { NextRequest } from 'next/server';

const fakeUser = {
  id: 'user-uuid-111',
  email: 'user@example.com',
  user_metadata: { display_name: 'Test User' },
};

const wsId = 'ws-uuid-123';

function mockAuth() {
  mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
}

function mockNoAuth() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid' } });
}

function makeRequest() {
  return new NextRequest(`http://localhost:3000/api/workspaces/${wsId}/tree`, {
    method: 'GET',
    headers: {
      authorization: 'Bearer valid-token',
      'content-type': 'application/json',
    },
  });
}

describe('requireTreeEditor', () => {
  beforeEach(() => vi.clearAllMocks());

  test('workspace_admin passes without tree_editor permission', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_admin',
      permissions: [],
    });

    const { requireTreeEditor } = await import('@/lib/api/workspace-auth');
    const result = await requireTreeEditor(makeRequest(), wsId);

    // Should NOT be an error response
    expect(result).not.toBeInstanceOf(Response);
    expect((result as { user: unknown; membership: unknown }).membership.role).toBe('workspace_admin');
  });

  test('workspace_member with tree_editor permission passes', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_member',
      permissions: ['tree_editor'],
    });

    const { requireTreeEditor } = await import('@/lib/api/workspace-auth');
    const result = await requireTreeEditor(makeRequest(), wsId);

    expect(result).not.toBeInstanceOf(Response);
    expect((result as { user: unknown; membership: unknown }).membership.role).toBe('workspace_member');
  });

  test('workspace_member without tree_editor permission gets 403', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_member',
      permissions: [],
    });

    const { requireTreeEditor } = await import('@/lib/api/workspace-auth');
    const result = await requireTreeEditor(makeRequest(), wsId);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  test('non-member gets 403', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue(null);

    const { requireTreeEditor } = await import('@/lib/api/workspace-auth');
    const result = await requireTreeEditor(makeRequest(), wsId);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  test('unauthenticated user gets 401', async () => {
    mockNoAuth();

    const { requireTreeEditor } = await import('@/lib/api/workspace-auth');
    const result = await requireTreeEditor(makeRequest(), wsId);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });
});

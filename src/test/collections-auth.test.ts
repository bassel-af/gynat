import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}));

const mockMembershipFindUnique = vi.fn();
const mockWorkspaceFindUnique = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: {
      findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
    },
    workspace: {
      findUnique: (...args: unknown[]) => mockWorkspaceFindUnique(...args),
    },
  },
}));

import { NextRequest } from 'next/server';

const fakeUser = { id: 'user-uuid-111', email: 'user@example.com' };
const wsId = 'ws-uuid-123';

function mockAuth() {
  mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
}
function mockNoAuth() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid' } });
}
function makeRequest() {
  return new NextRequest(`http://localhost:3000/api/workspaces/${wsId}/collections`, {
    method: 'POST',
    headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
  });
}

describe('requireCollectionEditor', () => {
  beforeEach(() => vi.clearAllMocks());

  test('workspace_admin passes without collection_editor permission', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id, workspaceId: wsId, role: 'workspace_admin', permissions: [],
    });
    const { requireCollectionEditor } = await import('@/lib/api/workspace-auth');
    const result = await requireCollectionEditor(makeRequest(), wsId);
    expect(result).not.toBeInstanceOf(Response);
  });

  test('member with collection_editor permission passes', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id, workspaceId: wsId, role: 'workspace_member', permissions: ['collection_editor'],
    });
    const { requireCollectionEditor } = await import('@/lib/api/workspace-auth');
    const result = await requireCollectionEditor(makeRequest(), wsId);
    expect(result).not.toBeInstanceOf(Response);
  });

  test('plain member without permission gets 403', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id, workspaceId: wsId, role: 'workspace_member', permissions: [],
    });
    const { requireCollectionEditor } = await import('@/lib/api/workspace-auth');
    const result = await requireCollectionEditor(makeRequest(), wsId);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  test('member with only tree_editor (not collection_editor) gets 403', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id, workspaceId: wsId, role: 'workspace_member', permissions: ['tree_editor'],
    });
    const { requireCollectionEditor } = await import('@/lib/api/workspace-auth');
    const result = await requireCollectionEditor(makeRequest(), wsId);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });

  test('unauthenticated user gets 401', async () => {
    mockNoAuth();
    const { requireCollectionEditor } = await import('@/lib/api/workspace-auth');
    const result = await requireCollectionEditor(makeRequest(), wsId);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });
});

describe('requireCollectionsEnabled', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns null (proceed) when enableCollections is true', async () => {
    mockWorkspaceFindUnique.mockResolvedValue({ enableCollections: true });
    const { requireCollectionsEnabled } = await import('@/lib/api/workspace-auth');
    const result = await requireCollectionsEnabled(wsId);
    expect(result).toBeNull();
  });

  test('returns a 404 response when enableCollections is false', async () => {
    mockWorkspaceFindUnique.mockResolvedValue({ enableCollections: false });
    const { requireCollectionsEnabled } = await import('@/lib/api/workspace-auth');
    const result = await requireCollectionsEnabled(wsId);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(404);
  });

  test('returns a 404 response when workspace not found', async () => {
    mockWorkspaceFindUnique.mockResolvedValue(null);
    const { requireCollectionsEnabled } = await import('@/lib/api/workspace-auth');
    const result = await requireCollectionsEnabled(wsId);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(404);
  });
});

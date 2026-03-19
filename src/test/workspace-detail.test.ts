import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}));

const mockWorkspaceFindUnique = vi.fn();
const mockWorkspaceUpdate = vi.fn();
const mockMembershipFindUnique = vi.fn();
const mockMembershipCount = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspace: {
      findUnique: (...args: unknown[]) => mockWorkspaceFindUnique(...args),
      update: (...args: unknown[]) => mockWorkspaceUpdate(...args),
    },
    workspaceMembership: {
      findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
      count: (...args: unknown[]) => mockMembershipCount(...args),
    },
  },
}));

import { NextRequest } from 'next/server';

const fakeUser = {
  id: 'user-uuid-111',
  email: 'test@example.com',
  user_metadata: { display_name: 'Test User' },
};

function mockAuth() {
  mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
}

function mockNoAuth() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid' } });
}

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

const wsId = 'ws-uuid-123';
const routeParams = { params: Promise.resolve({ id: wsId }) };

// ============================================================================
// GET /api/workspaces/[id]
// ============================================================================
describe('GET /api/workspaces/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns 401 if not authenticated', async () => {
    mockNoAuth();
    const { GET } = await import('@/app/api/workspaces/[id]/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}`);
    const res = await GET(req, routeParams);
    expect(res.status).toBe(401);
  });

  test('returns 403 if user is not a member', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue(null);
    const { GET } = await import('@/app/api/workspaces/[id]/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}`);
    const res = await GET(req, routeParams);
    expect(res.status).toBe(403);
  });

  test('returns workspace with member count for members', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_member',
    });
    mockWorkspaceFindUnique.mockResolvedValue({
      id: wsId,
      slug: 'test-ws',
      nameAr: 'اختبار',
      description: null,
      logoUrl: null,
    });
    mockMembershipCount.mockResolvedValue(5);

    const { GET } = await import('@/app/api/workspaces/[id]/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}`);
    const res = await GET(req, routeParams);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.slug).toBe('test-ws');
    expect(body.data.memberCount).toBe(5);
  });
});

// ============================================================================
// PATCH /api/workspaces/[id]
// ============================================================================
describe('PATCH /api/workspaces/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns 401 if not authenticated', async () => {
    mockNoAuth();
    const { PATCH } = await import('@/app/api/workspaces/[id]/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}`, {
      method: 'PATCH',
      body: { nameAr: 'updated' },
    });
    const res = await PATCH(req, routeParams);
    expect(res.status).toBe(401);
  });

  test('returns 403 if user is not admin', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_member',
    });
    const { PATCH } = await import('@/app/api/workspaces/[id]/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}`, {
      method: 'PATCH',
      body: { nameAr: 'updated' },
    });
    const res = await PATCH(req, routeParams);
    expect(res.status).toBe(403);
  });

  test('updates workspace settings when admin', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_admin',
    });
    const updatedWs = {
      id: wsId,
      slug: 'test-ws',
      nameAr: 'اسم محدث',
      description: 'desc',
      logoUrl: null,
    };
    mockWorkspaceUpdate.mockResolvedValue(updatedWs);

    const { PATCH } = await import('@/app/api/workspaces/[id]/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}`, {
      method: 'PATCH',
      body: { nameAr: 'اسم محدث', description: 'desc' },
    });
    const res = await PATCH(req, routeParams);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.nameAr).toBe('اسم محدث');
  });
});

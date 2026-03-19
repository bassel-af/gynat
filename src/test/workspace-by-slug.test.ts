import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock @supabase/supabase-js before importing routes
const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}));

// Mock Prisma
const mockWorkspaceFindUnique = vi.fn();
const mockMembershipFindUnique = vi.fn();
const mockMembershipCount = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspace: {
      findUnique: (...args: unknown[]) => mockWorkspaceFindUnique(...args),
    },
    workspaceMembership: {
      findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
      count: (...args: unknown[]) => mockMembershipCount(...args),
    },
  },
}));

import { NextRequest } from 'next/server';

function makeRequest(
  url: string,
  headers: Record<string, string> = {},
) {
  return new NextRequest(url, {
    method: 'GET',
    headers: {
      authorization: 'Bearer valid-token',
      ...headers,
    },
  });
}

const fakeUser = {
  id: 'user-uuid-111',
  email: 'test@example.com',
  user_metadata: { display_name: 'Test User' },
};

function mockAuthenticatedUser() {
  mockGetUser.mockResolvedValue({
    data: { user: fakeUser },
    error: null,
  });
}

function mockUnauthenticated() {
  mockGetUser.mockResolvedValue({
    data: { user: null },
    error: { message: 'Invalid token' },
  });
}

const fakeWorkspace = {
  id: 'ws-uuid-1',
  slug: 'al-saeed',
  nameAr: 'عائلة السعيد',
  description: 'A family workspace',
  logoUrl: null,
  createdById: fakeUser.id,
  createdAt: new Date(),
};

// ============================================================================
// GET /api/workspaces/by-slug/[slug] — Resolve workspace by slug
// ============================================================================
describe('GET /api/workspaces/by-slug/[slug]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns 401 if not authenticated', async () => {
    mockUnauthenticated();
    const { GET } = await import('@/app/api/workspaces/by-slug/[slug]/route');

    const request = makeRequest('http://localhost:3000/api/workspaces/by-slug/al-saeed');
    const response = await GET(request, { params: Promise.resolve({ slug: 'al-saeed' }) });

    expect(response.status).toBe(401);
  });

  test('returns 404 if workspace with slug does not exist', async () => {
    mockAuthenticatedUser();
    mockWorkspaceFindUnique.mockResolvedValue(null);
    const { GET } = await import('@/app/api/workspaces/by-slug/[slug]/route');

    const request = makeRequest('http://localhost:3000/api/workspaces/by-slug/nonexistent');
    const response = await GET(request, { params: Promise.resolve({ slug: 'nonexistent' }) });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  test('returns 403 if user is not a member of the workspace', async () => {
    mockAuthenticatedUser();
    mockWorkspaceFindUnique.mockResolvedValue(fakeWorkspace);
    mockMembershipFindUnique.mockResolvedValue(null);
    const { GET } = await import('@/app/api/workspaces/by-slug/[slug]/route');

    const request = makeRequest('http://localhost:3000/api/workspaces/by-slug/al-saeed');
    const response = await GET(request, { params: Promise.resolve({ slug: 'al-saeed' }) });

    expect(response.status).toBe(403);
  });

  test('returns workspace data with member count when user is a member', async () => {
    mockAuthenticatedUser();
    mockWorkspaceFindUnique.mockResolvedValue(fakeWorkspace);
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: fakeWorkspace.id,
      role: 'workspace_admin',
    });
    mockMembershipCount.mockResolvedValue(5);
    const { GET } = await import('@/app/api/workspaces/by-slug/[slug]/route');

    const request = makeRequest('http://localhost:3000/api/workspaces/by-slug/al-saeed');
    const response = await GET(request, { params: Promise.resolve({ slug: 'al-saeed' }) });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.slug).toBe('al-saeed');
    expect(body.data.nameAr).toBe('عائلة السعيد');
    expect(body.data.memberCount).toBe(5);
  });
});

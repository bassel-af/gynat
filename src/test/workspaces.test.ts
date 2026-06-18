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
const mockWorkspaceCreate = vi.fn();
const mockWorkspaceUpdate = vi.fn();
const mockWorkspaceFindUnique = vi.fn();
const mockWorkspaceFindMany = vi.fn();
const mockMembershipFindMany = vi.fn();
const mockMembershipFindUnique = vi.fn();
const mockMembershipCount = vi.fn();
const mockTransaction = vi.fn();

// Mock rate limiter to always allow requests (rate-limit logic tested separately)
vi.mock('@/lib/api/rate-limit', () => ({
  workspaceCreateLimiter: { check: () => ({ allowed: true, retryAfterSeconds: 0 }) },
  rateLimitResponse: () => new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 }),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    workspace: {
      create: (...args: unknown[]) => mockWorkspaceCreate(...args),
      update: (...args: unknown[]) => mockWorkspaceUpdate(...args),
      findUnique: (...args: unknown[]) => mockWorkspaceFindUnique(...args),
      findMany: (...args: unknown[]) => mockWorkspaceFindMany(...args),
    },
    workspaceMembership: {
      findMany: (...args: unknown[]) => mockMembershipFindMany(...args),
      findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
      count: (...args: unknown[]) => mockMembershipCount(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

import { NextRequest } from 'next/server';

function makeRequest(
  url: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
) {
  const { method = 'GET', body, headers = {} } = options;
  return new NextRequest(url, {
    method,
    headers: {
      authorization: 'Bearer valid-token',
      'content-type': 'application/json',
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
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

// ============================================================================
// POST /api/workspaces — Create workspace
// ============================================================================
describe('POST /api/workspaces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns 401 if not authenticated', async () => {
    mockUnauthenticated();
    const { POST } = await import('@/app/api/workspaces/route');

    const request = makeRequest('http://localhost:3000/api/workspaces', {
      method: 'POST',
      body: { slug: 'test-ws', nameAr: 'اختبار' },
    });
    const response = await POST(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBeDefined();
  });

  test('returns 400 if slug is missing', async () => {
    mockAuthenticatedUser();
    const { POST } = await import('@/app/api/workspaces/route');

    const request = makeRequest('http://localhost:3000/api/workspaces', {
      method: 'POST',
      body: { nameAr: 'اختبار' },
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  test('returns 400 if slug has invalid characters', async () => {
    mockAuthenticatedUser();
    const { POST } = await import('@/app/api/workspaces/route');

    const request = makeRequest('http://localhost:3000/api/workspaces', {
      method: 'POST',
      body: { slug: 'INVALID SLUG!', nameAr: 'اختبار' },
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  test('returns 400 if nameAr is missing', async () => {
    mockAuthenticatedUser();
    const { POST } = await import('@/app/api/workspaces/route');

    const request = makeRequest('http://localhost:3000/api/workspaces', {
      method: 'POST',
      body: { slug: 'test-ws' },
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  test('returns 409 if slug already exists', async () => {
    mockAuthenticatedUser();
    const { POST } = await import('@/app/api/workspaces/route');

    // Simulate Prisma unique constraint violation
    mockTransaction.mockRejectedValue(
      Object.assign(new Error('Unique constraint'), { code: 'P2002' }),
    );

    const request = makeRequest('http://localhost:3000/api/workspaces', {
      method: 'POST',
      body: { slug: 'existing-ws', nameAr: 'اختبار' },
    });
    const response = await POST(request);

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toContain('slug');
  });

  test('creates workspace and adds creator as workspace_admin', async () => {
    mockAuthenticatedUser();
    const { POST } = await import('@/app/api/workspaces/route');

    mockMembershipCount.mockResolvedValue(0);
    const createdWorkspace = {
      id: 'ws-uuid-1',
      slug: 'test-ws',
      nameAr: 'اختبار',
      description: null,
      logoUrl: null,
      createdById: fakeUser.id,
    };
    mockTransaction.mockResolvedValue(createdWorkspace);

    const request = makeRequest('http://localhost:3000/api/workspaces', {
      method: 'POST',
      body: { slug: 'test-ws', nameAr: 'اختبار' },
    });
    const response = await POST(request);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.slug).toBe('test-ws');
    expect(body.data.nameAr).toBe('اختبار');
    expect(mockTransaction).toHaveBeenCalled();

    // Verify workspace count checks only owned workspaces (workspace_admin), not all memberships
    expect(mockMembershipCount).toHaveBeenCalledWith({
      where: { userId: fakeUser.id, role: 'workspace_admin' },
    });
  });

  test('returns 403 when user already has 10 workspaces', async () => {
    mockAuthenticatedUser();
    const { POST } = await import('@/app/api/workspaces/route');

    mockMembershipCount.mockResolvedValue(10);

    const request = makeRequest('http://localhost:3000/api/workspaces', {
      method: 'POST',
      body: { slug: 'eleventh-ws', nameAr: 'حادية عشرة' },
    });
    const response = await POST(request);

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain('الحد الأقصى');

    // Verify the count query filters by workspace_admin role (owned workspaces, not memberships)
    expect(mockMembershipCount).toHaveBeenCalledWith({
      where: { userId: fakeUser.id, role: 'workspace_admin' },
    });
  });

  test('allows workspace creation when user has fewer than 5 workspaces', async () => {
    mockAuthenticatedUser();
    const { POST } = await import('@/app/api/workspaces/route');

    mockMembershipCount.mockResolvedValue(4);
    const createdWorkspace = {
      id: 'ws-uuid-5',
      slug: 'fifth-ws',
      nameAr: 'خامسة',
      description: null,
      logoUrl: null,
      createdById: fakeUser.id,
    };
    mockTransaction.mockResolvedValue(createdWorkspace);

    const request = makeRequest('http://localhost:3000/api/workspaces', {
      method: 'POST',
      body: { slug: 'fifth-ws', nameAr: 'خامسة' },
    });
    const response = await POST(request);

    expect(response.status).toBe(201);
  });
});

// ============================================================================
// GET /api/workspaces — List user's workspaces
// ============================================================================
describe('GET /api/workspaces', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns 401 if not authenticated', async () => {
    mockUnauthenticated();
    const { GET } = await import('@/app/api/workspaces/route');

    const request = makeRequest('http://localhost:3000/api/workspaces');
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  test('returns list of workspaces with user role', async () => {
    mockAuthenticatedUser();
    const { GET } = await import('@/app/api/workspaces/route');

    const memberships = [
      {
        role: 'workspace_admin',
        workspace: {
          id: 'ws-1',
          slug: 'family-a',
          nameAr: 'عائلة أ',
          description: null,
          logoUrl: null,
        },
      },
      {
        role: 'workspace_member',
        workspace: {
          id: 'ws-2',
          slug: 'family-b',
          nameAr: 'عائلة ب',
          description: null,
          logoUrl: null,
        },
      },
    ];
    mockMembershipFindMany.mockResolvedValue(memberships);

    const request = makeRequest('http://localhost:3000/api/workspaces');
    const response = await GET(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0].role).toBe('workspace_admin');
    expect(body.data[0].workspace.slug).toBe('family-a');
  });
});

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

// Mock rate limiters
vi.mock('@/lib/api/rate-limit', () => ({
  workspaceCreateLimiter: { check: () => ({ allowed: true, retryAfterSeconds: 0 }) },
  treeMutateLimiter: { check: () => ({ allowed: true, retryAfterSeconds: 0 }) },
  rateLimitResponse: () => new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 }),
}));

// Mock Prisma
const mockTransaction = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: {
    workspace: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    workspaceMembership: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

// Mock workspace-auth for tree routes
vi.mock('@/lib/api/workspace-auth', () => ({
  requireTreeEditor: () => ({ user: { id: 'user-uuid-111' } }),
  isErrorResponse: () => false,
}));

// Mock tree queries
vi.mock('@/lib/tree/queries', () => ({
  getOrCreateTree: () => ({ id: 'tree-uuid-1' }),
}));

import { NextRequest } from 'next/server';

function makeRequest(
  url: string,
  options: { method?: string; body?: unknown } = {},
) {
  const { method = 'POST', body } = options;
  return new NextRequest(url, {
    method,
    headers: {
      authorization: 'Bearer valid-token',
      'content-type': 'application/json',
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

// ============================================================================
// Finding 11: Unbounded String Fields in Zod Schemas
// ============================================================================

describe('Workspace creation input length limits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticatedUser();
  });

  test('rejects slug longer than 64 characters', async () => {
    const { POST } = await import('@/app/api/workspaces/route');

    const longSlug = 'a'.repeat(65);
    const request = makeRequest('http://localhost:3000/api/workspaces', {
      body: { slug: longSlug, nameAr: 'اختبار' },
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  test('rejects nameAr longer than 200 characters', async () => {
    const { POST } = await import('@/app/api/workspaces/route');

    const longName = 'ا'.repeat(201);
    const request = makeRequest('http://localhost:3000/api/workspaces', {
      body: { slug: 'valid-slug', nameAr: longName },
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  test('rejects description longer than 2000 characters', async () => {
    const { POST } = await import('@/app/api/workspaces/route');

    const longDesc = 'x'.repeat(2001);
    const request = makeRequest('http://localhost:3000/api/workspaces', {
      body: { slug: 'valid-slug', nameAr: 'اختبار', description: longDesc },
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });
});

describe('Individual creation input length limits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticatedUser();
  });

  test('rejects givenName longer than 200 characters', async () => {
    const { POST } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/route'
    );

    const longName = 'a'.repeat(201);
    const request = makeRequest(
      'http://localhost:3000/api/workspaces/ws-1/tree/individuals',
      {
        body: { givenName: longName },
      },
    );
    const response = await POST(request, {
      params: Promise.resolve({ id: 'ws-1' }),
    });

    expect(response.status).toBe(400);
  });
});

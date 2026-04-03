import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared before any imports that reference them
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}));

const mockUserFindUnique = vi.fn();
const mockUserUpdate = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
  },
}));

// Mock rate limiter — allow by default; individual tests can override
const mockProfileLimiterCheck = vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 }));
vi.mock('@/lib/api/rate-limit', () => ({
  profileUpdateLimiter: { check: () => mockProfileLimiterCheck() },
  rateLimitResponse: (retryAfter: number) => {
    const { NextResponse } = require('next/server');
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  },
}));

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fakeUser = {
  id: 'user-uuid-profile-1',
  email: 'user@example.com',
  user_metadata: { display_name: 'باسل' },
};

function makeRequest(url: string, options: { method?: string; body?: unknown } = {}) {
  const { method = 'PATCH', body } = options;
  return new NextRequest(url, {
    method,
    headers: {
      authorization: 'Bearer valid-token',
      'content-type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function mockAuth() {
  mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
}

function mockNoAuth() {
  mockGetUser.mockResolvedValue({
    data: { user: null },
    error: { message: 'Invalid token' },
  });
}

// ============================================================================
// GET /api/users/me — get profile
// ============================================================================
describe('GET /api/users/me', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns 401 for unauthenticated request', async () => {
    mockNoAuth();
    const { GET } = await import('@/app/api/users/me/route');
    const req = makeRequest('http://localhost:3000/api/users/me', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  test('returns user profile for authenticated request', async () => {
    mockAuth();
    mockUserFindUnique.mockResolvedValue({
      id: fakeUser.id,
      email: fakeUser.email,
      displayName: 'باسل',
      avatarUrl: null,
    });

    const { GET } = await import('@/app/api/users/me/route');
    const req = makeRequest('http://localhost:3000/api/users/me', { method: 'GET' });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.displayName).toBe('باسل');
    expect(body.data.email).toBe(fakeUser.email);
  });

  test('returns 404 when user record not in database', async () => {
    mockAuth();
    mockUserFindUnique.mockResolvedValue(null);

    const { GET } = await import('@/app/api/users/me/route');
    const req = makeRequest('http://localhost:3000/api/users/me', { method: 'GET' });
    const res = await GET(req);

    expect(res.status).toBe(404);
  });
});

// ============================================================================
// PATCH /api/users/me — update profile (display name)
// ============================================================================
describe('PATCH /api/users/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfileLimiterCheck.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
  });

  test('returns 401 for unauthenticated request', async () => {
    mockNoAuth();
    const { PATCH } = await import('@/app/api/users/me/route');
    const req = makeRequest('http://localhost:3000/api/users/me', {
      body: { displayName: 'New Name' },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  test('updates display name successfully', async () => {
    mockAuth();
    mockUserUpdate.mockResolvedValue({
      id: fakeUser.id,
      email: fakeUser.email,
      displayName: 'اسم جديد',
      avatarUrl: null,
    });

    const { PATCH } = await import('@/app/api/users/me/route');
    const req = makeRequest('http://localhost:3000/api/users/me', {
      body: { displayName: 'اسم جديد' },
    });
    const res = await PATCH(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.displayName).toBe('اسم جديد');
  });

  test('rejects empty display name', async () => {
    mockAuth();
    const { PATCH } = await import('@/app/api/users/me/route');
    const req = makeRequest('http://localhost:3000/api/users/me', {
      body: { displayName: '' },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  test('rejects display name that is too long', async () => {
    mockAuth();
    const { PATCH } = await import('@/app/api/users/me/route');
    const req = makeRequest('http://localhost:3000/api/users/me', {
      body: { displayName: 'ا'.repeat(101) },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  test('rejects display name with HTML tags', async () => {
    mockAuth();
    const { PATCH } = await import('@/app/api/users/me/route');
    const req = makeRequest('http://localhost:3000/api/users/me', {
      body: { displayName: '<script>alert("xss")</script>' },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  test('returns 429 when rate limited', async () => {
    mockAuth();
    mockProfileLimiterCheck.mockReturnValue({ allowed: false, retryAfterSeconds: 30 });

    const { PATCH } = await import('@/app/api/users/me/route');
    const req = makeRequest('http://localhost:3000/api/users/me', {
      body: { displayName: 'New Name' },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(429);
  });

  test('returns updated user data in response', async () => {
    mockAuth();
    mockUserUpdate.mockResolvedValue({
      id: fakeUser.id,
      email: fakeUser.email,
      displayName: 'Updated Name',
      avatarUrl: 'https://example.com/avatar.jpg',
    });

    const { PATCH } = await import('@/app/api/users/me/route');
    const req = makeRequest('http://localhost:3000/api/users/me', {
      body: { displayName: 'Updated Name' },
    });
    const res = await PATCH(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({
      id: fakeUser.id,
      email: fakeUser.email,
      displayName: 'Updated Name',
      avatarUrl: 'https://example.com/avatar.jpg',
    });
  });

  test('rejects invalid JSON body', async () => {
    mockAuth();
    const { PATCH } = await import('@/app/api/users/me/route');
    const req = new NextRequest('http://localhost:3000/api/users/me', {
      method: 'PATCH',
      headers: {
        authorization: 'Bearer valid-token',
        'content-type': 'application/json',
      },
      body: 'not json {{{',
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });
});

import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that use them
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

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fakeUser = {
  id: 'user-uuid-pref-1',
  email: 'user@example.com',
  user_metadata: { display_name: 'User' },
};

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
// GET /api/users/me/preferences
// ============================================================================
describe('GET /api/users/me/preferences', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns 401 for unauthenticated user', async () => {
    mockNoAuth();
    const { GET } = await import('@/app/api/users/me/preferences/route');
    const req = makeRequest('http://localhost:3000/api/users/me/preferences');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  test('returns calendarPreference for authenticated user', async () => {
    mockAuth();
    mockUserFindUnique.mockResolvedValue({
      id: fakeUser.id,
      calendarPreference: 'hijri',
    });

    const { GET } = await import('@/app/api/users/me/preferences/route');
    const req = makeRequest('http://localhost:3000/api/users/me/preferences');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.calendarPreference).toBe('hijri');
  });

  test('returns 404 if user record not found', async () => {
    mockAuth();
    mockUserFindUnique.mockResolvedValue(null);

    const { GET } = await import('@/app/api/users/me/preferences/route');
    const req = makeRequest('http://localhost:3000/api/users/me/preferences');
    const res = await GET(req);

    expect(res.status).toBe(404);
  });
});

// ============================================================================
// PATCH /api/users/me/preferences
// ============================================================================
describe('PATCH /api/users/me/preferences', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns 401 for unauthenticated user', async () => {
    mockNoAuth();
    const { PATCH } = await import('@/app/api/users/me/preferences/route');
    const req = makeRequest('http://localhost:3000/api/users/me/preferences', {
      method: 'PATCH',
      body: { calendarPreference: 'gregorian' },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  test('updates calendarPreference to gregorian', async () => {
    mockAuth();
    mockUserUpdate.mockResolvedValue({
      id: fakeUser.id,
      calendarPreference: 'gregorian',
    });

    const { PATCH } = await import('@/app/api/users/me/preferences/route');
    const req = makeRequest('http://localhost:3000/api/users/me/preferences', {
      method: 'PATCH',
      body: { calendarPreference: 'gregorian' },
    });
    const res = await PATCH(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.calendarPreference).toBe('gregorian');
  });

  test('updates calendarPreference to hijri', async () => {
    mockAuth();
    mockUserUpdate.mockResolvedValue({
      id: fakeUser.id,
      calendarPreference: 'hijri',
    });

    const { PATCH } = await import('@/app/api/users/me/preferences/route');
    const req = makeRequest('http://localhost:3000/api/users/me/preferences', {
      method: 'PATCH',
      body: { calendarPreference: 'hijri' },
    });
    const res = await PATCH(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.calendarPreference).toBe('hijri');
  });

  test('returns 400 for invalid calendarPreference value', async () => {
    mockAuth();
    const { PATCH } = await import('@/app/api/users/me/preferences/route');
    const req = makeRequest('http://localhost:3000/api/users/me/preferences', {
      method: 'PATCH',
      body: { calendarPreference: 'lunar' },
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  test('returns 400 for missing calendarPreference', async () => {
    mockAuth();
    const { PATCH } = await import('@/app/api/users/me/preferences/route');
    const req = makeRequest('http://localhost:3000/api/users/me/preferences', {
      method: 'PATCH',
      body: {},
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });
});

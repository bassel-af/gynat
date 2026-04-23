import { describe, test, expect, vi, beforeEach } from 'vitest';

/**
 * T2 — requirePlatformOwner helper.
 *
 * The guard supports dual auth: Bearer header first, cookie fallback only when
 * the Authorization header is entirely absent. A present-but-invalid Bearer
 * rejects 401 without trying the cookie (failed intent, not a foot-gun).
 *
 * Success returns `{ user }`, failure returns a `NextResponse` (caller checks
 * via `instanceof NextResponse`). Mirrors `requireWorkspaceAdmin`.
 */

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}));

const { mockCookieGetUser, mockCreateClient } = vi.hoisted(() => ({
  mockCookieGetUser: vi.fn(),
  mockCreateClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: (...args: unknown[]) => {
    mockCreateClient(...args);
    return Promise.resolve({
      auth: { getUser: mockCookieGetUser },
    });
  },
}));

const { mockFindUnique } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: mockFindUnique },
  },
}));

import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformOwner } from '@/lib/api/admin-auth';

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/api/admin/test', {
    method: 'GET',
    headers,
  });
}

describe('requirePlatformOwner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('(a) Bearer-only: returns 401 NextResponse when no Authorization header and no cookie session', async () => {
    mockCookieGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const result = await requirePlatformOwner(makeRequest());

    expect(result).toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) {
      expect(result.status).toBe(401);
      const body = await result.json();
      expect(body.error).toBeTruthy();
    }
  });

  test('(a) Bearer-only: returns 401 NextResponse when token is invalid', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid JWT' },
    });

    const result = await requirePlatformOwner(
      makeRequest({ authorization: 'Bearer bad-token' }),
    );

    expect(result).toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) {
      expect(result.status).toBe(401);
    }
  });

  test('(b) Bearer-only: returns 403 NextResponse when authed but isPlatformOwner=false', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'normal@example.com' } },
      error: null,
    });
    mockFindUnique.mockResolvedValue({
      id: 'user-1',
      isPlatformOwner: false,
    });

    const result = await requirePlatformOwner(
      makeRequest({ authorization: 'Bearer good-token' }),
    );

    expect(result).toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) {
      expect(result.status).toBe(403);
      const body = await result.json();
      expect(body.error).toBeTruthy();
    }
  });

  test('(b) Bearer-only: returns 403 when DB row is missing (treat as not-owner)', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-orphan' } },
      error: null,
    });
    mockFindUnique.mockResolvedValue(null);

    const result = await requirePlatformOwner(
      makeRequest({ authorization: 'Bearer good-token' }),
    );

    expect(result).toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) {
      expect(result.status).toBe(403);
    }
  });

  test('(c) Bearer-only: returns { user } when authed and isPlatformOwner=true', async () => {
    const fakeUser = { id: 'owner-1', email: 'owner@example.com' };
    mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
    mockFindUnique.mockResolvedValue({
      id: 'owner-1',
      isPlatformOwner: true,
    });

    const result = await requirePlatformOwner(
      makeRequest({ authorization: 'Bearer owner-token' }),
    );

    expect(result).not.toBeInstanceOf(NextResponse);
    if (!(result instanceof NextResponse)) {
      expect(result.user).toEqual(fakeUser);
    }
  });

  test('(d) Cookie-only: valid session and isPlatformOwner=true → returns { user }', async () => {
    const fakeUser = { id: 'cookie-owner', email: 'cookie-owner@example.com' };
    mockCookieGetUser.mockResolvedValue({
      data: { user: fakeUser },
      error: null,
    });
    mockFindUnique.mockResolvedValue({
      id: 'cookie-owner',
      isPlatformOwner: true,
    });

    const result = await requirePlatformOwner(makeRequest());

    expect(result).not.toBeInstanceOf(NextResponse);
    if (!(result instanceof NextResponse)) {
      expect(result.user).toEqual(fakeUser);
    }
  });

  test('(e) Cookie-only: valid session but isPlatformOwner=false → 403', async () => {
    mockCookieGetUser.mockResolvedValue({
      data: { user: { id: 'cookie-user', email: 'normal@example.com' } },
      error: null,
    });
    mockFindUnique.mockResolvedValue({
      id: 'cookie-user',
      isPlatformOwner: false,
    });

    const result = await requirePlatformOwner(makeRequest());

    expect(result).toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) {
      expect(result.status).toBe(403);
    }
  });

  test('(f) Cookie-only: auth.getUser returns null → 401', async () => {
    mockCookieGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const result = await requirePlatformOwner(makeRequest());

    expect(result).toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) {
      expect(result.status).toBe(401);
    }
  });

  test('(f) Cookie-only: auth.getUser returns error → 401', async () => {
    mockCookieGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'session expired' },
    });

    const result = await requirePlatformOwner(makeRequest());

    expect(result).toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) {
      expect(result.status).toBe(401);
    }
  });

  test('(g) Both Bearer and cookie present and valid → resolves via Bearer, cookie path not called', async () => {
    const bearerUser = { id: 'bearer-owner', email: 'bearer@example.com' };
    mockGetUser.mockResolvedValue({ data: { user: bearerUser }, error: null });
    mockFindUnique.mockResolvedValue({
      id: 'bearer-owner',
      isPlatformOwner: true,
    });

    const result = await requirePlatformOwner(
      makeRequest({ authorization: 'Bearer good-token' }),
    );

    expect(result).not.toBeInstanceOf(NextResponse);
    if (!(result instanceof NextResponse)) {
      expect(result.user).toEqual(bearerUser);
    }
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockCookieGetUser).not.toHaveBeenCalled();
  });

  test('(h) Bearer present but invalid AND cookie valid+owner → 401, cookie path NOT tried', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid JWT' },
    });
    mockCookieGetUser.mockResolvedValue({
      data: { user: { id: 'cookie-owner' } },
      error: null,
    });
    mockFindUnique.mockResolvedValue({
      id: 'cookie-owner',
      isPlatformOwner: true,
    });

    const result = await requirePlatformOwner(
      makeRequest({ authorization: 'Bearer bad-token' }),
    );

    expect(result).toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) {
      expect(result.status).toBe(401);
    }
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockCookieGetUser).not.toHaveBeenCalled();
  });
});

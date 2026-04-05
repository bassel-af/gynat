import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock @supabase/ssr — used by the middleware helper
const mockGetUser = vi.fn();
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}));

import { middleware } from '@/middleware';
import { NextRequest } from 'next/server';

function makeRequest(
  path: string,
  cookies: Record<string, string> = {},
) {
  const url = `http://localhost:3000${path}`;
  const request = new NextRequest(url);
  for (const [name, value] of Object.entries(cookies)) {
    request.cookies.set(name, value);
  }
  return request;
}

describe('middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no authenticated user (unauthenticated state)
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'No session' },
    });
  });

  describe('public paths', () => {
    test.each([
      '/',
      '/auth/login',
      '/auth/signup',
      '/auth/callback',
      '/auth/confirm',
      '/auth/forgot-password',
      '/policy',
      '/islamic-gedcom',
      '/test',
    ])('allows %s without auth', async (path) => {
      const request = makeRequest(path);
      const response = await middleware(request);

      // NextResponse.next() does not redirect
      expect(response.headers.get('location')).toBeNull();
      expect(response.status).toBe(200);
    });

    test('allows subpaths of public paths (e.g. /auth/login/extra)', async () => {
      const request = makeRequest('/auth/login/extra');
      const response = await middleware(request);

      expect(response.headers.get('location')).toBeNull();
    });
  });

  describe('static assets', () => {
    test('allows _next/* paths without auth and skips session refresh', async () => {
      const request = makeRequest('/_next/static/chunk.js');
      const response = await middleware(request);

      expect(response.headers.get('location')).toBeNull();
      expect(response.status).toBe(200);
      expect(mockGetUser).not.toHaveBeenCalled();
    });

    test('allows paths with file extensions (e.g. /favicon.ico) and skips session refresh', async () => {
      const request = makeRequest('/favicon.ico');
      const response = await middleware(request);

      expect(response.headers.get('location')).toBeNull();
      expect(mockGetUser).not.toHaveBeenCalled();
    });

  });

  describe('API routes', () => {
    test('/api/auth/sync-user is NOT treated as a static asset — skips session refresh', async () => {
      const request = makeRequest('/api/auth/sync-user');
      await middleware(request);

      // API routes skip session refresh to avoid doubling GoTrue calls
      // (route handlers verify auth themselves via getAuthenticatedUser)
      expect(mockGetUser).not.toHaveBeenCalled();
    });

    test('/api/workspaces is NOT treated as a static asset — skips session refresh', async () => {
      const request = makeRequest('/api/workspaces');
      await middleware(request);

      expect(mockGetUser).not.toHaveBeenCalled();
    });

    test('does NOT redirect to /auth/login when unauthenticated', async () => {
      // Default mock: user is null (unauthenticated)
      const request = makeRequest('/api/workspaces');
      const response = await middleware(request);

      // API routes should NOT redirect — route handlers return 401 themselves
      expect(response.headers.get('location')).toBeNull();
      expect(response.status).toBe(200);
    });

    test('passes through without session refresh when authenticated', async () => {
      const request = makeRequest('/api/workspaces', {
        'sb-access-token': 'valid-access-token',
        'sb-refresh-token': 'valid-refresh-token',
      });
      const response = await middleware(request);

      expect(response.headers.get('location')).toBeNull();
      expect(response.status).toBe(200);
      // API routes skip middleware session refresh — auth is handled by route handlers
      expect(mockGetUser).not.toHaveBeenCalled();
    });
  });

  describe('protected routes', () => {
    test('redirects to /auth/login when no session cookies exist', async () => {
      const request = makeRequest('/workspaces');
      const response = await middleware(request);

      expect(response.status).toBe(307);
      const location = new URL(response.headers.get('location')!);
      expect(location.pathname).toBe('/auth/login');
      expect(location.searchParams.get('next')).toBe('/workspaces');
    });

    test('redirects to /auth/login with next param preserving the original path', async () => {
      const request = makeRequest('/workspace/123/settings');
      const response = await middleware(request);

      expect(response.status).toBe(307);
      const location = new URL(response.headers.get('location')!);
      expect(location.pathname).toBe('/auth/login');
      expect(location.searchParams.get('next')).toBe('/workspace/123/settings');
    });

    test('passes through when valid session cookies exist and getUser succeeds', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      });

      const request = makeRequest('/workspaces', {
        'sb-access-token': 'valid-access-token',
        'sb-refresh-token': 'valid-refresh-token',
      });
      const response = await middleware(request);

      expect(response.headers.get('location')).toBeNull();
      expect(response.status).toBe(200);
    });

    test('redirects to /auth/login when access token is invalid (getUser returns error)', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      const request = makeRequest('/workspaces', {
        'sb-access-token': 'expired-token',
        'sb-refresh-token': 'some-refresh-token',
      });
      const response = await middleware(request);

      expect(response.status).toBe(307);
      const location = new URL(response.headers.get('location')!);
      expect(location.pathname).toBe('/auth/login');
    });
  });
});

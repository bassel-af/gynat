import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockExchangeCodeForSession = vi.fn();
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
    },
  }),
}));

const { mockSyncUserToDb } = vi.hoisted(() => ({
  mockSyncUserToDb: vi.fn(),
}));

vi.mock('@/lib/auth/sync-user', () => ({
  syncUserToDb: mockSyncUserToDb,
}));

import { GET } from '@/app/auth/callback/route';
import { NextRequest } from 'next/server';

function makeRequest(url: string) {
  return new NextRequest(url);
}

describe('GET /auth/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('redirects to login when no code param is provided', async () => {
    const request = makeRequest('http://localhost:3000/auth/callback');
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/auth/login');
  });

  test('redirects to login when code exchange fails', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid code' },
    });

    const request = makeRequest('http://localhost:3000/auth/callback?code=bad-code');
    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/auth/login');
  });

  test('calls syncUserToDb and redirects to /workspaces after successful code exchange', async () => {
    const fakeUser = {
      id: 'user-123',
      email: 'test@example.com',
      user_metadata: { display_name: 'Test' },
    };

    mockExchangeCodeForSession.mockResolvedValue({
      data: { user: fakeUser, session: { access_token: 'tok' } },
      error: null,
    });
    mockSyncUserToDb.mockResolvedValue({ id: fakeUser.id });

    const request = makeRequest('http://localhost:3000/auth/callback?code=valid-code');
    const response = await GET(request);

    expect(mockSyncUserToDb).toHaveBeenCalledWith(fakeUser);
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/workspaces');
  });

  test('redirects to next param after successful exchange', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: {
        user: { id: 'u1', email: 'a@b.com', user_metadata: {} },
        session: { access_token: 'tok' },
      },
      error: null,
    });
    mockSyncUserToDb.mockResolvedValue({ id: 'u1' });

    const request = makeRequest('http://localhost:3000/auth/callback?code=valid&next=/workspaces');
    const response = await GET(request);

    expect(new URL(response.headers.get('location')!).pathname).toBe('/workspaces');
  });

  test('still redirects even if syncUserToDb throws', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: {
        user: { id: 'u1', email: 'a@b.com', user_metadata: {} },
        session: { access_token: 'tok' },
      },
      error: null,
    });
    mockSyncUserToDb.mockRejectedValue(new Error('DB connection failed'));

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const request = makeRequest('http://localhost:3000/auth/callback?code=valid-code');
    const response = await GET(request);

    // Should still redirect despite sync failure
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/workspaces');
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});

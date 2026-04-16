import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockGetSession = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: mockGetSession,
    },
  }),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { apiFetch } from '@/lib/api/client';

describe('apiFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('attaches Bearer token from session to request', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'my-token-123' } },
      error: null,
    });
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await apiFetch('/api/some-endpoint');

    expect(mockFetch).toHaveBeenCalledWith('/api/some-endpoint', expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer my-token-123',
      }),
    }));
  });

  test('merges custom headers with Authorization', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
      error: null,
    });
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));

    await apiFetch('/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer tok',
        'Content-Type': 'application/json',
      }),
    }));
  });

  test('throws when no session is available', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(apiFetch('/api/test')).rejects.toThrow('No active session');
  });

  test('returns the fetch Response object', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
      error: null,
    });
    const fakeResponse = new Response(JSON.stringify({ data: 'hello' }), { status: 200 });
    mockFetch.mockResolvedValue(fakeResponse);

    const result = await apiFetch('/api/data');

    expect(result).toBe(fakeResponse);
  });

  test('passes through other fetch options like method and body', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
      error: null,
    });
    mockFetch.mockResolvedValue(new Response('{}', { status: 201 }));

    const body = JSON.stringify({ name: 'test' });
    await apiFetch('/api/create', { method: 'POST', body });

    expect(mockFetch).toHaveBeenCalledWith('/api/create', expect.objectContaining({
      method: 'POST',
      body,
    }));
  });

  test('adds X-Solalah-Undo header when isUndo option is true', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
      error: null,
    });
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));

    await apiFetch('/api/do', { method: 'PATCH', isUndo: true });

    expect(mockFetch).toHaveBeenCalledWith('/api/do', expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer tok',
        'X-Solalah-Undo': 'true',
      }),
    }));
  });

  test('does not add X-Solalah-Undo header when isUndo is falsy', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
      error: null,
    });
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));

    await apiFetch('/api/do', { method: 'PATCH' });

    const callArgs = mockFetch.mock.calls[0][1];
    expect(callArgs.headers).not.toHaveProperty('X-Solalah-Undo');
  });

  test('does not forward isUndo as a fetch init option', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
      error: null,
    });
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));

    await apiFetch('/api/do', { method: 'PATCH', isUndo: true });

    const callArgs = mockFetch.mock.calls[0][1];
    expect(callArgs).not.toHaveProperty('isUndo');
  });
});

import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock @supabase/supabase-js before importing the route
const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}));

// Mock the Prisma singleton from @/lib/db
const { mockUpsert } = vi.hoisted(() => ({
  mockUpsert: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { upsert: mockUpsert },
  },
}));

import { POST } from '@/app/api/auth/sync-user/route';
import { NextRequest } from 'next/server';

function makeRequest(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/api/auth/sync-user', {
    method: 'POST',
    headers,
  });
}

describe('POST /api/auth/sync-user', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns 401 if no Authorization header', async () => {
    const request = makeRequest();
    const response = await POST(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Missing authorization');
  });

  test('returns 401 if Authorization header does not start with Bearer', async () => {
    const request = makeRequest({ authorization: 'Basic abc123' });
    const response = await POST(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Missing authorization');
  });

  test('returns 401 if token is invalid (getUser returns error)', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token' },
    });

    const request = makeRequest({ authorization: 'Bearer invalid-token' });
    const response = await POST(request);

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Invalid session');
  });

  test('upserts user using Prisma singleton and returns user data', async () => {
    const fakeUser = {
      id: 'user-uuid-123',
      email: 'test@example.com',
      phone: '+1234567890',
      user_metadata: {
        display_name: 'Test User',
        avatar_url: 'https://example.com/avatar.jpg',
      },
    };

    mockGetUser.mockResolvedValue({
      data: { user: fakeUser },
      error: null,
    });

    const dbUser = {
      id: fakeUser.id,
      email: fakeUser.email,
      displayName: 'Test User',
      avatarUrl: 'https://example.com/avatar.jpg',
      phone: '+1234567890',
    };
    mockUpsert.mockResolvedValue(dbUser);

    const request = makeRequest({ authorization: 'Bearer valid-token' });
    const response = await POST(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.user).toEqual(dbUser);

    expect(mockUpsert).toHaveBeenCalledWith({
      where: { id: fakeUser.id },
      update: {
        email: fakeUser.email,
        phone: '+1234567890',
      },
      create: {
        id: fakeUser.id,
        email: fakeUser.email,
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.jpg',
        phone: '+1234567890',
      },
    });
  });

  test('uses email prefix as displayName when display_name metadata is absent', async () => {
    const fakeUser = {
      id: 'user-uuid-456',
      email: 'john@example.com',
      phone: null,
      user_metadata: {},
    };

    mockGetUser.mockResolvedValue({
      data: { user: fakeUser },
      error: null,
    });

    mockUpsert.mockResolvedValue({
      id: fakeUser.id,
      email: fakeUser.email,
      displayName: 'john',
      avatarUrl: null,
      phone: null,
    });

    const request = makeRequest({ authorization: 'Bearer valid-token' });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          displayName: 'john',
          avatarUrl: null,
          phone: null,
        }),
      }),
    );
  });
});

import { describe, test, expect, vi, beforeEach } from 'vitest';

// Finding 12: Unhandled Errors Leak Stack Traces
// These tests verify that unknown errors return a generic 500 response
// instead of re-throwing (which would expose stack traces).

// Mock @supabase/supabase-js
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
  invitationAcceptLimiter: { check: () => ({ allowed: true, retryAfterSeconds: 0 }) },
  rateLimitResponse: () => new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 }),
}));

// Mock Prisma for workspaces route
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
      findUnique: vi.fn(),
    },
    workspaceInvitation: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
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

function mockAuth() {
  mockGetUser.mockResolvedValue({
    data: { user: fakeUser },
    error: null,
  });
}

describe('POST /api/workspaces — unknown error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
  });

  test('returns 500 with generic message for unknown database errors', async () => {
    const { POST } = await import('@/app/api/workspaces/route');

    // Simulate an unexpected error (not a P2002 unique constraint)
    mockTransaction.mockRejectedValue(new Error('Connection timeout'));

    const request = makeRequest('http://localhost:3000/api/workspaces', {
      body: { slug: 'test-ws', nameAr: 'اختبار' },
    });

    // Should NOT throw — should return a 500 response
    const response = await POST(request);
    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body.error).toBe('Internal server error');
    // The actual error message should NOT leak
    expect(body.error).not.toContain('Connection timeout');
  });
});

describe('POST /api/invitations/[id]/accept — unknown error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
  });

  test('returns 500 with generic message for unknown transaction errors', async () => {
    const { prisma } = await import('@/lib/db');
    const { POST } = await import('@/app/api/invitations/[id]/accept/route');

    // Set up a valid pending invitation
    vi.mocked(prisma.workspaceInvitation.findUnique).mockResolvedValue({
      id: 'inv-uuid-1',
      workspaceId: 'ws-uuid-1',
      type: 'email',
      email: fakeUser.email,
      status: 'pending',
      expiresAt: new Date(Date.now() + 86400000),
      useCount: 0,
      maxUses: 1,
      code: null,
      invitedById: 'other-user',
      individualId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // No existing membership
    vi.mocked(prisma.workspaceMembership.findUnique).mockResolvedValue(null);

    // Transaction throws unexpected error
    mockTransaction.mockRejectedValue(new Error('Deadlock detected'));

    const request = makeRequest(
      'http://localhost:3000/api/invitations/inv-uuid-1/accept',
    );

    const response = await POST(request, {
      params: Promise.resolve({ id: 'inv-uuid-1' }),
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Internal server error');
    expect(body.error).not.toContain('Deadlock');
  });
});

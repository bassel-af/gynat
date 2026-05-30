import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}));

// Mock rate limiter to always allow requests (rate-limit logic tested separately)
vi.mock('@/lib/api/rate-limit', () => ({
  invitationAcceptLimiter: { check: () => ({ allowed: true, retryAfterSeconds: 0 }) },
  rateLimitResponse: () => new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 }),
}));

const mockInvitationFindUnique = vi.fn();
const mockInvitationUpdate = vi.fn();
const mockMembershipFindUnique = vi.fn();
const mockMembershipCreate = vi.fn();
const mockTransaction = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceInvitation: {
      findUnique: (...args: unknown[]) => mockInvitationFindUnique(...args),
      update: (...args: unknown[]) => mockInvitationUpdate(...args),
    },
    workspaceMembership: {
      findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
      create: (...args: unknown[]) => mockMembershipCreate(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

import { NextRequest } from 'next/server';

const fakeUser = {
  id: 'user-uuid-111',
  email: 'user@example.com',
  user_metadata: { display_name: 'User' },
};

const invId = 'inv-uuid-001';
const wsId = 'ws-uuid-123';

function mockAuth() {
  mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
}

function mockNoAuth() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid' } });
}

function makeRequest(url: string, options: { method?: string; body?: unknown } = {}) {
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

const acceptParams = { params: Promise.resolve({ id: invId }) };

function makePendingInvitation(overrides = {}) {
  return {
    id: invId,
    workspaceId: wsId,
    type: 'email',
    email: 'user@example.com',
    status: 'pending',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    maxUses: 1,
    useCount: 0,
    invitedById: 'admin-uuid',
    ...overrides,
  };
}

// ============================================================================
// POST /api/invitations/[id]/accept
// ============================================================================
describe('POST /api/invitations/[id]/accept', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns 401 if not authenticated', async () => {
    mockNoAuth();
    const { POST } = await import('@/app/api/invitations/[id]/accept/route');
    const req = makeRequest(`http://localhost:3000/api/invitations/${invId}/accept`);
    const res = await POST(req, acceptParams);
    expect(res.status).toBe(401);
  });

  test('returns generic error if invitation not found', async () => {
    mockAuth();
    mockInvitationFindUnique.mockResolvedValue(null);
    const { POST } = await import('@/app/api/invitations/[id]/accept/route');
    const req = makeRequest(`http://localhost:3000/api/invitations/${invId}/accept`);
    const res = await POST(req, acceptParams);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('دعوة غير صالحة أو منتهية الصلاحية');
  });

  test('returns same generic error if invitation already accepted', async () => {
    mockAuth();
    mockInvitationFindUnique.mockResolvedValue(makePendingInvitation({ status: 'accepted' }));
    const { POST } = await import('@/app/api/invitations/[id]/accept/route');
    const req = makeRequest(`http://localhost:3000/api/invitations/${invId}/accept`);
    const res = await POST(req, acceptParams);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('دعوة غير صالحة أو منتهية الصلاحية');
  });

  test('returns same generic error if invitation revoked', async () => {
    mockAuth();
    mockInvitationFindUnique.mockResolvedValue(makePendingInvitation({ status: 'revoked' }));
    const { POST } = await import('@/app/api/invitations/[id]/accept/route');
    const req = makeRequest(`http://localhost:3000/api/invitations/${invId}/accept`);
    const res = await POST(req, acceptParams);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('دعوة غير صالحة أو منتهية الصلاحية');
  });

  test('returns same generic error if invitation expired', async () => {
    mockAuth();
    mockInvitationFindUnique.mockResolvedValue(
      makePendingInvitation({ expiresAt: new Date(Date.now() - 1000) }),
    );
    const { POST } = await import('@/app/api/invitations/[id]/accept/route');
    const req = makeRequest(`http://localhost:3000/api/invitations/${invId}/accept`);
    const res = await POST(req, acceptParams);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('دعوة غير صالحة أو منتهية الصلاحية');
  });

  test('allows null expiresAt (never expires)', async () => {
    mockAuth();
    mockInvitationFindUnique.mockResolvedValue(
      makePendingInvitation({ expiresAt: null }),
    );
    mockMembershipFindUnique.mockResolvedValue(null);
    const membership = {
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_member',
    };
    mockTransaction.mockResolvedValue(membership);

    const { POST } = await import('@/app/api/invitations/[id]/accept/route');
    const req = makeRequest(`http://localhost:3000/api/invitations/${invId}/accept`);
    const res = await POST(req, acceptParams);
    expect(res.status).toBe(201);
  });

  test('returns same generic error if max uses exceeded', async () => {
    mockAuth();
    mockInvitationFindUnique.mockResolvedValue(
      makePendingInvitation({ maxUses: 5, useCount: 5 }),
    );
    const { POST } = await import('@/app/api/invitations/[id]/accept/route');
    const req = makeRequest(`http://localhost:3000/api/invitations/${invId}/accept`);
    const res = await POST(req, acceptParams);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('دعوة غير صالحة أو منتهية الصلاحية');
  });

  test('returns 403 EMAIL_MISMATCH (not "expired") when signed in with a different email', async () => {
    mockAuth(); // fakeUser.email = 'user@example.com'
    mockInvitationFindUnique.mockResolvedValue(
      makePendingInvitation({ type: 'email', email: 'other@example.com' }),
    );
    const { POST } = await import('@/app/api/invitations/[id]/accept/route');
    const req = makeRequest(`http://localhost:3000/api/invitations/${invId}/accept`);
    const res = await POST(req, acceptParams);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('EMAIL_MISMATCH');
    // Must NOT read as "expired" — that was the production bug.
    expect(body.error).not.toContain('منتهية الصلاحية');
  });

  test('accepts email invitation when only the casing differs (GoTrue lowercases accounts)', async () => {
    // Reproduces the production bug: admin typed "User@Example.com", the
    // invitee's GoTrue account is "user@example.com".
    mockAuth(); // fakeUser.email = 'user@example.com'
    mockInvitationFindUnique.mockResolvedValue(
      makePendingInvitation({ type: 'email', email: 'User@Example.com' }),
    );
    mockMembershipFindUnique.mockResolvedValue(null);
    mockTransaction.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_member',
    });

    const { POST } = await import('@/app/api/invitations/[id]/accept/route');
    const req = makeRequest(`http://localhost:3000/api/invitations/${invId}/accept`);
    const res = await POST(req, acceptParams);
    expect(res.status).toBe(201);
  });

  test('skips email check for code-type invitations', async () => {
    mockAuth();
    mockInvitationFindUnique.mockResolvedValue(
      makePendingInvitation({ type: 'code', email: null }),
    );
    mockMembershipFindUnique.mockResolvedValue(null);
    const membership = {
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_member',
    };
    mockTransaction.mockResolvedValue(membership);

    const { POST } = await import('@/app/api/invitations/[id]/accept/route');
    const req = makeRequest(`http://localhost:3000/api/invitations/${invId}/accept`);
    const res = await POST(req, acceptParams);
    expect(res.status).toBe(201);
  });

  test('returns 400 with ALREADY_MEMBER if user is already a member', async () => {
    mockAuth();
    mockInvitationFindUnique.mockResolvedValue(makePendingInvitation());
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_member',
    });

    const { POST } = await import('@/app/api/invitations/[id]/accept/route');
    const req = makeRequest(`http://localhost:3000/api/invitations/${invId}/accept`);
    const res = await POST(req, acceptParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('ALREADY_MEMBER');
  });

  test('creates membership and updates invitation on success', async () => {
    mockAuth();
    mockInvitationFindUnique.mockResolvedValue(makePendingInvitation());
    mockMembershipFindUnique.mockResolvedValue(null);

    const membership = {
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_member',
      joinedAt: new Date(),
    };
    mockTransaction.mockResolvedValue(membership);

    const { POST } = await import('@/app/api/invitations/[id]/accept/route');
    const req = makeRequest(`http://localhost:3000/api/invitations/${invId}/accept`);
    const res = await POST(req, acceptParams);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.userId).toBe(fakeUser.id);
    expect(body.data.workspaceId).toBe(wsId);
    expect(body.data.role).toBe('workspace_member');

    // Verify transaction was called
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  test('handles unique constraint violation (race condition)', async () => {
    mockAuth();
    mockInvitationFindUnique.mockResolvedValue(makePendingInvitation());
    mockMembershipFindUnique.mockResolvedValue(null);

    // Simulate Prisma unique constraint error
    const prismaError = new Error('Unique constraint failed');
    (prismaError as unknown as Record<string, unknown>).code = 'P2002';
    mockTransaction.mockRejectedValue(prismaError);

    const { POST } = await import('@/app/api/invitations/[id]/accept/route');
    const req = makeRequest(`http://localhost:3000/api/invitations/${invId}/accept`);
    const res = await POST(req, acceptParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('ALREADY_MEMBER');
  });
});

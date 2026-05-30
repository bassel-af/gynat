import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}));

const mockMembershipFindUnique = vi.fn();
const mockMembershipFindMany = vi.fn();
const mockMembershipCreate = vi.fn();
const mockMembershipUpdate = vi.fn();
const mockMembershipDelete = vi.fn();
const mockMembershipCount = vi.fn();
const mockInvitationCreate = vi.fn();
const mockUserFindUnique = vi.fn();
const mockWorkspaceFindUnique = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: {
      findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
      findMany: (...args: unknown[]) => mockMembershipFindMany(...args),
      create: (...args: unknown[]) => mockMembershipCreate(...args),
      update: (...args: unknown[]) => mockMembershipUpdate(...args),
      delete: (...args: unknown[]) => mockMembershipDelete(...args),
      count: (...args: unknown[]) => mockMembershipCount(...args),
    },
    workspaceInvitation: {
      create: (...args: unknown[]) => mockInvitationCreate(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    workspace: {
      findUnique: (...args: unknown[]) => mockWorkspaceFindUnique(...args),
    },
  },
}));

const mockSendEmail = vi.fn();
vi.mock('@/lib/email/transport', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

import { NextRequest } from 'next/server';

const fakeUser = {
  id: 'user-uuid-111',
  email: 'admin@example.com',
  user_metadata: { display_name: 'Admin' },
};

function mockAuth() {
  mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
}

function mockNoAuth() {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid' } });
}

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

const wsId = 'ws-uuid-123';
const membersParams = { params: Promise.resolve({ id: wsId }) };

// ============================================================================
// GET /api/workspaces/[id]/members — List members
// ============================================================================
describe('GET /api/workspaces/[id]/members', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns 401 if not authenticated', async () => {
    mockNoAuth();
    const { GET } = await import('@/app/api/workspaces/[id]/members/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/members`);
    const res = await GET(req, membersParams);
    expect(res.status).toBe(401);
  });

  test('returns 403 if not a member', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue(null);
    const { GET } = await import('@/app/api/workspaces/[id]/members/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/members`);
    const res = await GET(req, membersParams);
    expect(res.status).toBe(403);
  });

  test('returns list of members with roles', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_admin',
    });
    const members = [
      {
        userId: fakeUser.id,
        workspaceId: wsId,
        role: 'workspace_admin',
        permissions: [],
        user: { id: fakeUser.id, displayName: 'Admin', avatarUrl: null },
      },
      {
        userId: 'user-2',
        workspaceId: wsId,
        role: 'workspace_member',
        permissions: ['tree_editor'],
        user: { id: 'user-2', displayName: 'Member', avatarUrl: null },
      },
    ];
    mockMembershipFindMany.mockResolvedValue(members);

    const { GET } = await import('@/app/api/workspaces/[id]/members/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/members`);
    const res = await GET(req, membersParams);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0].role).toBe('workspace_admin');
  });

  test('returns displayName and avatarUrl for each member', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_admin',
    });
    const members = [
      {
        userId: fakeUser.id,
        workspaceId: wsId,
        role: 'workspace_admin',
        permissions: [],
        user: { id: fakeUser.id, displayName: 'Admin', avatarUrl: 'https://example.com/avatar.jpg' },
      },
    ];
    mockMembershipFindMany.mockResolvedValue(members);

    const { GET } = await import('@/app/api/workspaces/[id]/members/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/members`);
    const res = await GET(req, membersParams);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].user.displayName).toBe('Admin');
    expect(body.data[0].user.avatarUrl).toBe('https://example.com/avatar.jpg');
  });

  test('queries only id, displayName, and avatarUrl for user data', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_admin',
    });
    mockMembershipFindMany.mockResolvedValue([]);

    const { GET } = await import('@/app/api/workspaces/[id]/members/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/members`);
    await GET(req, membersParams);

    const findManyCall = mockMembershipFindMany.mock.calls[0][0];
    expect(findManyCall.include.user).toEqual({
      select: { id: true, displayName: true, avatarUrl: true },
    });
  });
});

// ============================================================================
// POST /api/workspaces/[id]/members — Invite by email
// ============================================================================
describe('POST /api/workspaces/[id]/members', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns 401 if not authenticated', async () => {
    mockNoAuth();
    const { POST } = await import('@/app/api/workspaces/[id]/members/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/members`, {
      method: 'POST',
      body: { email: 'invite@example.com' },
    });
    const res = await POST(req, membersParams);
    expect(res.status).toBe(401);
  });

  test('returns 403 if not admin', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_member',
    });
    const { POST } = await import('@/app/api/workspaces/[id]/members/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/members`, {
      method: 'POST',
      body: { email: 'invite@example.com' },
    });
    const res = await POST(req, membersParams);
    expect(res.status).toBe(403);
  });

  test('returns 400 if email is already a member', async () => {
    mockAuth();
    // First call: check caller's membership (admin)
    // Second call might be for checking existing member
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_admin',
    });
    mockUserFindUnique.mockResolvedValue({
      id: 'existing-user',
      email: 'invite@example.com',
    });
    // The invited user is already a member
    mockMembershipFindMany.mockResolvedValue([
      { userId: 'existing-user', workspaceId: wsId },
    ]);

    const { POST } = await import('@/app/api/workspaces/[id]/members/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/members`, {
      method: 'POST',
      body: { email: 'invite@example.com' },
    });
    const res = await POST(req, membersParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('already');
  });

  test('creates email invitation successfully', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_admin',
    });
    mockUserFindUnique
      .mockResolvedValueOnce(null) // user not registered yet (membership check)
      .mockResolvedValueOnce({ displayName: 'Admin' }); // inviter lookup
    mockMembershipFindMany.mockResolvedValue([]); // not a member
    mockWorkspaceFindUnique.mockResolvedValue({ name: 'آل سعيد' });
    mockSendEmail.mockResolvedValue({});

    const invitation = {
      id: 'inv-uuid-1',
      workspaceId: wsId,
      type: 'email',
      email: 'new@example.com',
      invitedById: fakeUser.id,
    };
    mockInvitationCreate.mockResolvedValue(invitation);

    const { POST } = await import('@/app/api/workspaces/[id]/members/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/members`, {
      method: 'POST',
      body: { email: 'new@example.com' },
    });
    const res = await POST(req, membersParams);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.email).toBe('new@example.com');
    expect(body.data.type).toBe('email');
    expect(body.emailSent).toBe(true);
  });

  test('normalizes the invite email (trims + lowercases) before storing/sending', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_admin',
    });
    mockUserFindUnique
      .mockResolvedValueOnce(null) // membership check
      .mockResolvedValueOnce({ displayName: 'Admin' }); // inviter lookup
    mockMembershipFindMany.mockResolvedValue([]);
    mockWorkspaceFindUnique.mockResolvedValue({ name: 'آل سعيد' });
    mockSendEmail.mockResolvedValue({});
    mockInvitationCreate.mockResolvedValue({ id: 'inv-norm', type: 'email', email: 'ayman@gmail.com' });

    const { POST } = await import('@/app/api/workspaces/[id]/members/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/members`, {
      method: 'POST',
      body: { email: '  Ayman@Gmail.com  ' },
    });
    const res = await POST(req, membersParams);
    expect(res.status).toBe(201);

    // Stored lowercased — so it matches the GoTrue account at accept time.
    expect(mockInvitationCreate.mock.calls[0][0].data.email).toBe('ayman@gmail.com');
    // Duplicate-member lookup also uses the normalized address.
    expect(mockUserFindUnique.mock.calls[0][0].where.email).toBe('ayman@gmail.com');
    // Email is sent to the normalized address.
    expect(mockSendEmail.mock.calls[0][0].to).toBe('ayman@gmail.com');
  });

  test('creates invitation with optional individualId', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_admin',
    });
    mockUserFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ displayName: 'Admin' });
    mockMembershipFindMany.mockResolvedValue([]);
    mockWorkspaceFindUnique.mockResolvedValue({ name: 'آل سعيد' });
    mockSendEmail.mockResolvedValue({});

    const indId = 'a0000000-0000-4000-a000-000000000001';
    const invitation = {
      id: 'inv-uuid-2',
      workspaceId: wsId,
      type: 'email',
      email: 'linked@example.com',
      individualId: indId,
      invitedById: fakeUser.id,
    };
    mockInvitationCreate.mockResolvedValue(invitation);

    const { POST } = await import('@/app/api/workspaces/[id]/members/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/members`, {
      method: 'POST',
      body: { email: 'linked@example.com', individualId: indId },
    });
    const res = await POST(req, membersParams);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.individualId).toBe(indId);
  });

  test('returns emailSent false when email sending fails', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_admin',
    });
    mockUserFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ displayName: 'Admin' });
    mockMembershipFindMany.mockResolvedValue([]);
    mockWorkspaceFindUnique.mockResolvedValue({ name: 'آل سعيد' });
    mockSendEmail.mockRejectedValue(new Error('SMTP connection failed'));

    const invitation = {
      id: 'inv-uuid-3',
      workspaceId: wsId,
      type: 'email',
      email: 'fail@example.com',
      invitedById: fakeUser.id,
    };
    mockInvitationCreate.mockResolvedValue(invitation);

    const { POST } = await import('@/app/api/workspaces/[id]/members/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/members`, {
      method: 'POST',
      body: { email: 'fail@example.com' },
    });
    const res = await POST(req, membersParams);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.emailSent).toBe(false);
    expect(body.data.id).toBe('inv-uuid-3');
  });

  test('sets expiresAt and maxUses when creating invitation', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_admin',
    });
    mockUserFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ displayName: 'Admin' });
    mockMembershipFindMany.mockResolvedValue([]);
    mockWorkspaceFindUnique.mockResolvedValue({ name: 'Test' });
    mockSendEmail.mockResolvedValue({});
    mockInvitationCreate.mockResolvedValue({ id: 'inv-uuid-4' });

    const { POST } = await import('@/app/api/workspaces/[id]/members/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/members`, {
      method: 'POST',
      body: { email: 'test@example.com' },
    });
    await POST(req, membersParams);

    const createCall = mockInvitationCreate.mock.calls[0][0];
    expect(createCall.data.maxUses).toBe(1);
    expect(createCall.data.expiresAt).toBeInstanceOf(Date);
    // expiresAt should be ~7 days from now
    const diffMs = createCall.data.expiresAt.getTime() - Date.now();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(6.9);
    expect(diffDays).toBeLessThan(7.1);
  });
});

// ============================================================================
// PATCH /api/workspaces/[id]/members/[userId] — Update member role
// ============================================================================
const targetUserId = 'user-uuid-222';
const memberParams = { params: Promise.resolve({ id: wsId, userId: targetUserId }) };

describe('PATCH /api/workspaces/[id]/members/[userId]', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns 403 if not admin', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_member',
    });
    const { PATCH } = await import('@/app/api/workspaces/[id]/members/[userId]/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/members/${targetUserId}`, {
      method: 'PATCH',
      body: { role: 'workspace_member' },
    });
    const res = await PATCH(req, memberParams);
    expect(res.status).toBe(403);
  });

  test('cannot demote self if last admin', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_admin',
    });
    mockMembershipCount.mockResolvedValue(1); // only 1 admin

    const selfParams = { params: Promise.resolve({ id: wsId, userId: fakeUser.id }) };
    const { PATCH } = await import('@/app/api/workspaces/[id]/members/[userId]/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/members/${fakeUser.id}`, {
      method: 'PATCH',
      body: { role: 'workspace_member' },
    });
    const res = await PATCH(req, selfParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('last admin');
  });

  test('updates member role and permissions', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_admin',
    });

    const updatedMembership = {
      userId: targetUserId,
      workspaceId: wsId,
      role: 'workspace_admin',
      permissions: ['tree_editor', 'news_editor'],
    };
    mockMembershipUpdate.mockResolvedValue(updatedMembership);

    const { PATCH } = await import('@/app/api/workspaces/[id]/members/[userId]/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/members/${targetUserId}`, {
      method: 'PATCH',
      body: { role: 'workspace_admin', permissions: ['tree_editor', 'news_editor'] },
    });
    const res = await PATCH(req, memberParams);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.role).toBe('workspace_admin');
    expect(body.data.permissions).toEqual(['tree_editor', 'news_editor']);
  });
});

// ============================================================================
// DELETE /api/workspaces/[id]/members/[userId] — Remove member
// ============================================================================
describe('DELETE /api/workspaces/[id]/members/[userId]', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns 403 if not admin', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_member',
    });
    const { DELETE } = await import('@/app/api/workspaces/[id]/members/[userId]/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/members/${targetUserId}`, {
      method: 'DELETE',
    });
    const res = await DELETE(req, memberParams);
    expect(res.status).toBe(403);
  });

  test('cannot remove self if last admin', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_admin',
    });
    mockMembershipCount.mockResolvedValue(1);

    const selfParams = { params: Promise.resolve({ id: wsId, userId: fakeUser.id }) };
    const { DELETE } = await import('@/app/api/workspaces/[id]/members/[userId]/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/members/${fakeUser.id}`, {
      method: 'DELETE',
    });
    const res = await DELETE(req, selfParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('last admin');
  });

  test('removes member successfully', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_admin',
    });
    mockMembershipDelete.mockResolvedValue({});

    const { DELETE } = await import('@/app/api/workspaces/[id]/members/[userId]/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/members/${targetUserId}`, {
      method: 'DELETE',
    });
    const res = await DELETE(req, memberParams);
    expect(res.status).toBe(200);
  });
});

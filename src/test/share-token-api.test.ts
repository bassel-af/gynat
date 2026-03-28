import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}));

const mockMembershipFindUnique = vi.fn();
const mockWorkspaceFindUnique = vi.fn();
const mockIndividualFindFirst = vi.fn();
const mockShareTokenCreate = vi.fn();
const mockShareTokenFindMany = vi.fn();
const mockShareTokenUpdate = vi.fn();
const mockShareTokenCount = vi.fn();
const mockBranchPointerFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: {
      findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
    },
    workspace: {
      findUnique: (...args: unknown[]) => mockWorkspaceFindUnique(...args),
    },
    individual: {
      findFirst: (...args: unknown[]) => mockIndividualFindFirst(...args),
    },
    branchShareToken: {
      create: (...args: unknown[]) => mockShareTokenCreate(...args),
      findMany: (...args: unknown[]) => mockShareTokenFindMany(...args),
      update: (...args: unknown[]) => mockShareTokenUpdate(...args),
      count: (...args: unknown[]) => mockShareTokenCount(...args),
    },
    branchPointer: {
      findMany: (...args: unknown[]) => mockBranchPointerFindMany(...args),
      groupBy: vi.fn().mockResolvedValue([]),
    },
  },
}));

// Mock token generation
vi.mock('@/lib/tree/branch-share-token', () => ({
  generateShareToken: () => 'brsh_test-token-123',
  hashToken: (token: string) => `hashed_${token}`,
  TOKEN_PREFIX: 'brsh_',
}));

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const wsId = 'ws-source-uuid';
const fakeUser = {
  id: 'user-uuid-admin',
  email: 'admin@example.com',
  user_metadata: { display_name: 'Admin User' },
};

function makePostRequest(url: string, body: object) {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      authorization: 'Bearer valid-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(url: string) {
  return new NextRequest(url, {
    method: 'GET',
    headers: { authorization: 'Bearer valid-token' },
  });
}

function makeDeleteRequest(url: string) {
  return new NextRequest(url, {
    method: 'DELETE',
    headers: { authorization: 'Bearer valid-token' },
  });
}

function mockAuth() {
  mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
}

function mockAdmin() {
  mockMembershipFindUnique.mockResolvedValue({
    userId: fakeUser.id,
    workspaceId: wsId,
    role: 'workspace_admin',
    permissions: [],
  });
}

function mockMember() {
  mockMembershipFindUnique.mockResolvedValue({
    userId: fakeUser.id,
    workspaceId: wsId,
    role: 'workspace_member',
    permissions: [],
  });
}

function mockShareableWorkspace() {
  mockWorkspaceFindUnique.mockResolvedValue({
    id: wsId,
    slug: 'al-saeed',
    nameAr: 'آل السعيد',
    branchSharingPolicy: 'shareable',
  });
}

function mockNoSharingWorkspace() {
  mockWorkspaceFindUnique.mockResolvedValue({
    id: wsId,
    slug: 'al-saeed',
    nameAr: 'آل السعيد',
    branchSharingPolicy: 'none',
  });
}

const routeParams = { params: Promise.resolve({ id: wsId }) };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/workspaces/[id]/share-tokens — create share token', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns 401 for unauthenticated user', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token' },
    });

    const { POST } = await import(
      '@/app/api/workspaces/[id]/share-tokens/route'
    );
    const req = makePostRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens`,
      { rootIndividualId: '123e4567-e89b-12d3-a456-426614174000' },
    );
    const res = await POST(req, routeParams);
    expect(res.status).toBe(401);
  });

  test('returns 403 for non-admin member', async () => {
    mockAuth();
    mockMember();

    const { POST } = await import(
      '@/app/api/workspaces/[id]/share-tokens/route'
    );
    const req = makePostRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens`,
      { rootIndividualId: '123e4567-e89b-12d3-a456-426614174000' },
    );
    const res = await POST(req, routeParams);
    expect(res.status).toBe(403);
  });

  test('returns 201 with token string for valid request', async () => {
    mockAuth();
    mockAdmin();
    mockShareableWorkspace();
    const indId = '123e4567-e89b-12d3-a456-426614174000';
    mockIndividualFindFirst.mockResolvedValue({ id: indId });
    mockShareTokenCount.mockResolvedValue(0);
    mockShareTokenCreate.mockResolvedValue({
      id: 'token-uuid-1',
      tokenHash: 'hashed_brsh_test-token-123',
      sourceWorkspaceId: wsId,
      rootIndividualId: indId,
    });

    const { POST } = await import(
      '@/app/api/workspaces/[id]/share-tokens/route'
    );
    const req = makePostRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens`,
      { rootIndividualId: indId },
    );
    const res = await POST(req, routeParams);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.token).toBe('brsh_test-token-123');
  });

  test('returns 400 for invalid rootIndividualId', async () => {
    mockAuth();
    mockAdmin();
    mockShareableWorkspace();

    const { POST } = await import(
      '@/app/api/workspaces/[id]/share-tokens/route'
    );
    const req = makePostRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens`,
      { rootIndividualId: 'not-a-uuid' },
    );
    const res = await POST(req, routeParams);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/workspaces/[id]/share-tokens — list tokens', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns list of tokens for admin', async () => {
    mockAuth();
    mockAdmin();
    mockShareTokenFindMany.mockResolvedValue([
      {
        id: 'token-uuid-1',
        sourceWorkspaceId: wsId,
        rootIndividualId: 'ind-uuid',
        depthLimit: 3,
        includeGrafts: false,
        isPublic: false,
        isRevoked: false,
        maxUses: 1,
        useCount: 0,
        expiresAt: new Date('2026-04-15'),
        createdAt: new Date(),
        rootIndividual: { givenName: 'أحمد', surname: 'السعيد' },
        targetWorkspace: { slug: 'al-sharbek', nameAr: 'آل شربك' },
      },
    ]);

    const { GET } = await import(
      '@/app/api/workspaces/[id]/share-tokens/route'
    );
    const req = makeGetRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens`,
    );
    const res = await GET(req, routeParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    // Verify shaped response
    expect(body.data[0].rootPersonName).toBe('أحمد السعيد');
    expect(body.data[0].activePointerCount).toBe(0);
    expect(body.data[0]).not.toHaveProperty('rootIndividualId');
  });
});

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
const mockShareTokenFindMany = vi.fn();
const mockBranchPointerGroupBy = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: {
      findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
    },
    workspace: {
      findUnique: (...args: unknown[]) => mockWorkspaceFindUnique(...args),
    },
    branchShareToken: {
      findMany: (...args: unknown[]) => mockShareTokenFindMany(...args),
    },
    branchPointer: {
      groupBy: (...args: unknown[]) => mockBranchPointerGroupBy(...args),
    },
  },
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

function makeGetRequest(url: string) {
  return new NextRequest(url, {
    method: 'GET',
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

const routeParams = { params: Promise.resolve({ id: wsId }) };

// ---------------------------------------------------------------------------
// Tests — GET /api/workspaces/[id]/share-tokens response shaping
// ---------------------------------------------------------------------------

describe('GET /api/workspaces/[id]/share-tokens — redesigned response', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBranchPointerGroupBy.mockResolvedValue([]);
  });

  test('returns rootPersonName from joined rootIndividual', async () => {
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
        createdAt: new Date('2026-03-27'),
        rootIndividual: { givenName: 'أحمد', surname: 'السعيد' },
        targetWorkspace: null,
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
    const token = body.data[0];

    expect(token.rootPersonName).toBe('أحمد السعيد');
  });

  test('returns activePointerCount from groupBy', async () => {
    mockAuth();
    mockAdmin();
    mockBranchPointerGroupBy.mockResolvedValue([
      { shareTokenId: 'token-uuid-1', _count: { id: 3 } },
    ]);
    mockShareTokenFindMany.mockResolvedValue([
      {
        id: 'token-uuid-1',
        sourceWorkspaceId: wsId,
        rootIndividualId: 'ind-uuid',
        depthLimit: null,
        includeGrafts: false,
        isPublic: true,
        isRevoked: false,
        maxUses: 100,
        useCount: 5,
        expiresAt: new Date('2026-04-15'),
        createdAt: new Date('2026-03-27'),
        rootIndividual: { givenName: 'فاطمة', surname: null },
        targetWorkspace: null,
      },
    ]);

    const { GET } = await import(
      '@/app/api/workspaces/[id]/share-tokens/route'
    );
    const req = makeGetRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens`,
    );
    const res = await GET(req, routeParams);
    const body = await res.json();
    const token = body.data[0];

    expect(token.activePointerCount).toBe(3);
  });

  test('returns targetWorkspaceName when scoped', async () => {
    mockAuth();
    mockAdmin();
    mockShareTokenFindMany.mockResolvedValue([
      {
        id: 'token-uuid-1',
        sourceWorkspaceId: wsId,
        rootIndividualId: 'ind-uuid',
        depthLimit: 2,
        includeGrafts: false,
        isPublic: false,
        isRevoked: false,
        maxUses: 1,
        useCount: 0,
        expiresAt: new Date('2026-04-15'),
        createdAt: new Date('2026-03-27'),
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
    const body = await res.json();
    const token = body.data[0];

    expect(token.targetWorkspaceName).toBe('آل شربك');
  });

  test('returns null targetWorkspaceName for public tokens', async () => {
    mockAuth();
    mockAdmin();
    mockShareTokenFindMany.mockResolvedValue([
      {
        id: 'token-uuid-1',
        sourceWorkspaceId: wsId,
        rootIndividualId: 'ind-uuid',
        depthLimit: null,
        includeGrafts: false,
        isPublic: true,
        isRevoked: false,
        maxUses: 100,
        useCount: 0,
        expiresAt: new Date('2026-04-15'),
        createdAt: new Date('2026-03-27'),
        rootIndividual: { givenName: 'خالد', surname: null },
        targetWorkspace: null,
      },
    ]);

    const { GET } = await import(
      '@/app/api/workspaces/[id]/share-tokens/route'
    );
    const req = makeGetRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens`,
    );
    const res = await GET(req, routeParams);
    const body = await res.json();
    const token = body.data[0];

    expect(token.targetWorkspaceName).toBeNull();
    expect(token.isPublic).toBe(true);
  });

  test('shaped response includes all expected fields and excludes raw IDs', async () => {
    mockAuth();
    mockAdmin();
    const now = new Date('2026-03-27T10:00:00Z');
    const expires = new Date('2026-04-26T10:00:00Z');
    mockShareTokenFindMany.mockResolvedValue([
      {
        id: 'token-uuid-1',
        sourceWorkspaceId: wsId,
        rootIndividualId: 'ind-uuid',
        tokenHash: 'hashed_value',
        depthLimit: 3,
        includeGrafts: false,
        isPublic: false,
        isRevoked: false,
        maxUses: 1,
        useCount: 0,
        expiresAt: expires,
        createdAt: now,
        createdById: 'user-uuid',
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
    const body = await res.json();
    const token = body.data[0];

    // Should have shaped fields
    expect(token).toHaveProperty('id');
    expect(token).toHaveProperty('rootPersonName');
    expect(token).toHaveProperty('depthLimit');
    expect(token).toHaveProperty('activePointerCount');
    expect(token).toHaveProperty('isPublic');
    expect(token).toHaveProperty('targetWorkspaceName');
    expect(token).toHaveProperty('isRevoked');
    expect(token).toHaveProperty('expiresAt');
    expect(token).toHaveProperty('createdAt');

    // Should NOT have raw internal IDs or sensitive fields
    expect(token).not.toHaveProperty('rootIndividualId');
    expect(token).not.toHaveProperty('sourceWorkspaceId');
    expect(token).not.toHaveProperty('tokenHash');
    expect(token).not.toHaveProperty('createdById');
    expect(token).not.toHaveProperty('rootIndividual');
    expect(token).not.toHaveProperty('targetWorkspace');
    expect(token).not.toHaveProperty('_count');
  });

  test('rootPersonName handles missing surname', async () => {
    mockAuth();
    mockAdmin();
    mockShareTokenFindMany.mockResolvedValue([
      {
        id: 'token-uuid-1',
        sourceWorkspaceId: wsId,
        rootIndividualId: 'ind-uuid',
        depthLimit: null,
        includeGrafts: false,
        isPublic: true,
        isRevoked: false,
        maxUses: 100,
        useCount: 0,
        expiresAt: new Date('2026-04-15'),
        createdAt: new Date('2026-03-27'),
        rootIndividual: { givenName: 'فاطمة', surname: null },
        targetWorkspace: null,
      },
    ]);

    const { GET } = await import(
      '@/app/api/workspaces/[id]/share-tokens/route'
    );
    const req = makeGetRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens`,
    );
    const res = await GET(req, routeParams);
    const body = await res.json();

    expect(body.data[0].rootPersonName).toBe('فاطمة');
  });
});

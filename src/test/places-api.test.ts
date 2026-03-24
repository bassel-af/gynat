import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that use them
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
const mockPlaceFindMany = vi.fn();
const mockPlaceFindFirst = vi.fn();
const mockPlaceCreate = vi.fn();
const mockQueryRaw = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: {
      findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
    },
    place: {
      findMany: (...args: unknown[]) => mockPlaceFindMany(...args),
      findFirst: (...args: unknown[]) => mockPlaceFindFirst(...args),
      create: (...args: unknown[]) => mockPlaceCreate(...args),
    },
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}));

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const wsId = 'ws-uuid-places-1';

const fakeUser = {
  id: 'user-uuid-places-1',
  email: 'member@example.com',
  user_metadata: { display_name: 'Member' },
};

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

function mockAuth() {
  mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
}

function mockNoAuth() {
  mockGetUser.mockResolvedValue({
    data: { user: null },
    error: { message: 'Invalid token' },
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

const routeParams = { params: Promise.resolve({ id: wsId }) };

// ============================================================================
// GET /api/workspaces/[id]/places?q=...
// ============================================================================

describe('GET /api/workspaces/[id]/places', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns 401 for unauthenticated user', async () => {
    mockNoAuth();
    const { GET } = await import('@/app/api/workspaces/[id]/places/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/places?q=مكة`);
    const res = await GET(req, routeParams);
    expect(res.status).toBe(401);
  });

  test('returns 403 for non-member', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue(null);
    const { GET } = await import('@/app/api/workspaces/[id]/places/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/places?q=مكة`);
    const res = await GET(req, routeParams);
    expect(res.status).toBe(403);
  });

  test('returns matching places for authenticated member', async () => {
    mockAuth();
    mockMember();
    // Step 1: raw SQL returns matching IDs
    mockQueryRaw.mockResolvedValue([{ id: 'place-1' }]);
    // Step 2: findMany fetches full records with parents
    mockPlaceFindMany.mockResolvedValue([
      {
        id: 'place-1',
        nameAr: 'مكة المكرمة',
        nameEn: 'Makkah',
        workspaceId: null,
        parent: {
          id: 'place-parent-1',
          nameAr: 'منطقة مكة المكرمة',
          parent: {
            id: 'place-grandparent-1',
            nameAr: 'المملكة العربية السعودية',
            parent: null,
          },
        },
      },
    ]);
    const { GET } = await import('@/app/api/workspaces/[id]/places/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/places?q=مكة`);
    const res = await GET(req, routeParams);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].nameAr).toBe('مكة المكرمة');
    expect(json.data[0].nameEn).toBe('Makkah');
    expect(json.data[0].parentNameAr).toBe('منطقة مكة المكرمة');
    expect(json.data[0].fullPath).toBe('مكة المكرمة، منطقة مكة المكرمة، المملكة العربية السعودية');
  });

  test('returns empty array when no matches', async () => {
    mockAuth();
    mockMember();
    mockQueryRaw.mockResolvedValue([]);
    const { GET } = await import('@/app/api/workspaces/[id]/places/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/places?q=xyz`);
    const res = await GET(req, routeParams);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data).toHaveLength(0);
  });

  test('returns results when q is empty', async () => {
    mockAuth();
    mockMember();
    mockQueryRaw.mockResolvedValue([]);
    const { GET } = await import('@/app/api/workspaces/[id]/places/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/places`);
    const res = await GET(req, routeParams);
    expect(res.status).toBe(200);
  });
});

// ============================================================================
// POST /api/workspaces/[id]/places
// ============================================================================

describe('POST /api/workspaces/[id]/places', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns 401 for unauthenticated user', async () => {
    mockNoAuth();
    const { POST } = await import('@/app/api/workspaces/[id]/places/route');
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/places`,
      { method: 'POST', body: { nameAr: 'مكة' } },
    );
    const res = await POST(req, routeParams);
    expect(res.status).toBe(401);
  });

  test('returns 403 for non-member', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue(null);
    const { POST } = await import('@/app/api/workspaces/[id]/places/route');
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/places`,
      { method: 'POST', body: { nameAr: 'مكة' } },
    );
    const res = await POST(req, routeParams);
    expect(res.status).toBe(403);
  });

  test('returns 400 for missing nameAr', async () => {
    mockAuth();
    mockMember();
    const { POST } = await import('@/app/api/workspaces/[id]/places/route');
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/places`,
      { method: 'POST', body: {} },
    );
    const res = await POST(req, routeParams);
    expect(res.status).toBe(400);
  });

  test('creates a workspace-scoped place', async () => {
    mockAuth();
    mockMember();
    mockPlaceFindFirst.mockResolvedValue(null); // no existing
    const newPlace = {
      id: 'place-new-1',
      nameAr: 'الخرج',
      nameEn: null,
      workspaceId: wsId,
      parentId: null,
      parent: null,
    };
    mockPlaceCreate.mockResolvedValue(newPlace);
    const { POST } = await import('@/app/api/workspaces/[id]/places/route');
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/places`,
      { method: 'POST', body: { nameAr: 'الخرج' } },
    );
    const res = await POST(req, routeParams);
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json.data.nameAr).toBe('الخرج');
    expect(json.data.id).toBe('place-new-1');
  });

  test('returns existing place if nameAr already exists for workspace', async () => {
    mockAuth();
    mockMember();
    const existingPlace = {
      id: 'place-existing-1',
      nameAr: 'الخرج',
      nameEn: null,
      workspaceId: wsId,
      parentId: null,
      parent: null,
    };
    mockPlaceFindFirst.mockResolvedValue(existingPlace);
    const { POST } = await import('@/app/api/workspaces/[id]/places/route');
    const req = makeRequest(
      `http://localhost:3000/api/workspaces/${wsId}/places`,
      { method: 'POST', body: { nameAr: 'الخرج' } },
    );
    const res = await POST(req, routeParams);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.id).toBe('place-existing-1');
  });
});

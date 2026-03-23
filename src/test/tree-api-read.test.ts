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
const mockFamilyTreeFindUnique = vi.fn();
const mockFamilyTreeCreate = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: {
      findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
    },
    familyTree: {
      findUnique: (...args: unknown[]) => mockFamilyTreeFindUnique(...args),
      create: (...args: unknown[]) => mockFamilyTreeCreate(...args),
    },
  },
}));

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const wsId = 'ws-uuid-tree-123';
const treeParams = { params: Promise.resolve({ id: wsId }) };

const fakeUser = {
  id: 'user-uuid-111',
  email: 'test@example.com',
  user_metadata: { display_name: 'Test User' },
};

function makeRequest(url: string) {
  return new NextRequest(url, {
    method: 'GET',
    headers: {
      authorization: 'Bearer valid-token',
      'content-type': 'application/json',
    },
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

function mockNotMember() {
  mockMembershipFindUnique.mockResolvedValue(null);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/workspaces/[id]/tree', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns 401 for unauthenticated user', async () => {
    mockNoAuth();
    const { GET } = await import('@/app/api/workspaces/[id]/tree/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree`);
    const res = await GET(req, treeParams);
    expect(res.status).toBe(401);
  });

  test('returns 403 for non-member', async () => {
    mockAuth();
    mockNotMember();
    const { GET } = await import('@/app/api/workspaces/[id]/tree/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree`);
    const res = await GET(req, treeParams);
    expect(res.status).toBe(403);
  });

  test('returns empty GedcomData for workspace with no tree (auto-creates)', async () => {
    mockAuth();
    mockMember();
    // No existing tree
    mockFamilyTreeFindUnique.mockResolvedValue(null);
    // Auto-create returns empty tree
    mockFamilyTreeCreate.mockResolvedValue({
      id: 'tree-uuid-1',
      workspaceId: wsId,
      individuals: [],
      families: [],
    });

    const { GET } = await import('@/app/api/workspaces/[id]/tree/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree`);
    const res = await GET(req, treeParams);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ individuals: {}, families: {} });
  });

  test('returns correct GedcomData for workspace with existing tree data', async () => {
    mockAuth();
    mockMember();

    const now = new Date();
    mockFamilyTreeFindUnique.mockResolvedValue({
      id: 'tree-uuid-1',
      workspaceId: wsId,
      individuals: [
        {
          id: 'ind-1',
          treeId: 'tree-uuid-1',
          gedcomId: null,
          givenName: 'محمد',
          surname: 'السعيد',
          fullName: null,
          sex: 'M',
          birthDate: '1950',
          birthPlace: null,
          deathDate: null,
          deathPlace: null,
          isPrivate: false,
          createdById: null,
          updatedAt: now,
          createdAt: now,
        },
        {
          id: 'ind-2',
          treeId: 'tree-uuid-1',
          gedcomId: null,
          givenName: 'فاطمة',
          surname: null,
          fullName: null,
          sex: 'F',
          birthDate: null,
          birthPlace: null,
          deathDate: null,
          deathPlace: null,
          isPrivate: false,
          createdById: null,
          updatedAt: now,
          createdAt: now,
        },
      ],
      families: [
        {
          id: 'fam-1',
          treeId: 'tree-uuid-1',
          gedcomId: null,
          husbandId: 'ind-1',
          wifeId: 'ind-2',
          children: [],
        },
      ],
    });

    const { GET } = await import('@/app/api/workspaces/[id]/tree/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree`);
    const res = await GET(req, treeParams);

    expect(res.status).toBe(200);
    const body = await res.json();

    // Verify individuals mapped correctly
    expect(body.data.individuals['ind-1']).toMatchObject({
      id: 'ind-1',
      type: 'INDI',
      givenName: 'محمد',
      surname: 'السعيد',
      sex: 'M',
      birth: '1950',
      familiesAsSpouse: ['fam-1'],
    });

    expect(body.data.individuals['ind-2']).toMatchObject({
      id: 'ind-2',
      type: 'INDI',
      givenName: 'فاطمة',
      sex: 'F',
      familiesAsSpouse: ['fam-1'],
    });

    // Verify family mapped correctly
    expect(body.data.families['fam-1']).toMatchObject({
      id: 'fam-1',
      type: 'FAM',
      husband: 'ind-1',
      wife: 'ind-2',
      children: [],
    });
  });

  test('returns 200 with correct response shape', async () => {
    mockAuth();
    mockMember();
    mockFamilyTreeFindUnique.mockResolvedValue({
      id: 'tree-uuid-1',
      workspaceId: wsId,
      individuals: [],
      families: [],
    });

    const { GET } = await import('@/app/api/workspaces/[id]/tree/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree`);
    const res = await GET(req, treeParams);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
    expect(body.data).toHaveProperty('individuals');
    expect(body.data).toHaveProperty('families');
    expect(typeof body.data.individuals).toBe('object');
    expect(typeof body.data.families).toBe('object');
  });
});

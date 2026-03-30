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

// Mock the queries module to intercept source tree fetching
const mockGetTreeByWorkspaceId = vi.fn();
vi.mock('@/lib/tree/queries', () => ({
  getTreeByWorkspaceId: (...args: unknown[]) => mockGetTreeByWorkspaceId(...args),
  getOrCreateTree: () => mockFamilyTreeFindUnique() ?? mockFamilyTreeCreate(),
}));

// Mock the branch pointer queries
const mockGetActivePointers = vi.fn();
vi.mock('@/lib/tree/branch-pointer-queries', () => ({
  getActivePointersForWorkspace: (...args: unknown[]) => mockGetActivePointers(...args),
}));

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const wsId = 'ws-target-123';
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

function mockMember() {
  mockMembershipFindUnique.mockResolvedValue({
    userId: fakeUser.id,
    workspaceId: wsId,
    role: 'workspace_member',
    permissions: [],
  });
}

const now = new Date();

// Target workspace tree: Father + Mother with Child1
function mockTargetTree() {
  mockFamilyTreeFindUnique.mockResolvedValue({
    id: 'tree-target',
    workspaceId: wsId,
    lastModifiedAt: now,
    individuals: [
      {
        id: 'father', treeId: 'tree-target', gedcomId: null,
        givenName: 'محمد', surname: 'السعيد', fullName: null,
        sex: 'M', birthDate: '1950', birthPlace: null,
        birthPlaceId: null, birthDescription: null, birthNotes: null,
        deathDate: null, deathPlace: null, deathPlaceId: null,
        deathDescription: null, deathNotes: null,
        birthHijriDate: null, deathHijriDate: null, notes: null,
        isDeceased: false, isPrivate: false,
        createdById: null, updatedAt: now, createdAt: now,
      },
      {
        id: 'mother', treeId: 'tree-target', gedcomId: null,
        givenName: 'فاطمة', surname: null, fullName: null,
        sex: 'F', birthDate: null, birthPlace: null,
        birthPlaceId: null, birthDescription: null, birthNotes: null,
        deathDate: null, deathPlace: null, deathPlaceId: null,
        deathDescription: null, deathNotes: null,
        birthHijriDate: null, deathHijriDate: null, notes: null,
        isDeceased: false, isPrivate: false,
        createdById: null, updatedAt: now, createdAt: now,
      },
      {
        id: 'child1', treeId: 'tree-target', gedcomId: null,
        givenName: 'أحمد', surname: 'السعيد', fullName: null,
        sex: 'M', birthDate: '1980', birthPlace: null,
        birthPlaceId: null, birthDescription: null, birthNotes: null,
        deathDate: null, deathPlace: null, deathPlaceId: null,
        deathDescription: null, deathNotes: null,
        birthHijriDate: null, deathHijriDate: null, notes: null,
        isDeceased: false, isPrivate: false,
        createdById: null, updatedAt: now, createdAt: now,
      },
    ],
    families: [
      {
        id: 'f-target', treeId: 'tree-target', gedcomId: null,
        husbandId: 'father', wifeId: 'mother',
        children: [{ familyId: 'f-target', individualId: 'child1' }],
        // Event fields (simplified — mapper handles null)
        marriageContractDate: null, marriageContractHijriDate: null,
        marriageContractPlace: null, marriageContractPlaceId: null,
        marriageContractDescription: null, marriageContractNotes: null,
        marriageDate: null, marriageHijriDate: null,
        marriagePlace: null, marriagePlaceId: null,
        marriageDescription: null, marriageNotes: null,
        isDivorced: false, divorceDate: null, divorceHijriDate: null,
        divorcePlace: null, divorcePlaceId: null,
        divorceDescription: null, divorceNotes: null,
      },
    ],
  });
}

// Source workspace tree: PtrRoot + PtrSpouse with PtrChild
function makeSourceTreeData() {
  return {
    id: 'tree-source',
    workspaceId: 'ws-source-123',
    individuals: [
      {
        id: 'ptr-root', treeId: 'tree-source', gedcomId: null,
        givenName: 'فدوى', surname: 'شربك', fullName: null,
        sex: 'F', birthDate: '1970', birthPlace: null,
        birthPlaceId: null, birthDescription: null, birthNotes: null,
        deathDate: null, deathPlace: null, deathPlaceId: null,
        deathDescription: null, deathNotes: null,
        birthHijriDate: null, deathHijriDate: null, notes: null,
        isDeceased: false, isPrivate: false,
        createdById: null, updatedAt: now, createdAt: now,
      },
      {
        id: 'ptr-child', treeId: 'tree-source', gedcomId: null,
        givenName: 'ليلى', surname: 'السعيد', fullName: null,
        sex: 'F', birthDate: '2000', birthPlace: null,
        birthPlaceId: null, birthDescription: null, birthNotes: null,
        deathDate: null, deathPlace: null, deathPlaceId: null,
        deathDescription: null, deathNotes: null,
        birthHijriDate: null, deathHijriDate: null, notes: null,
        isDeceased: false, isPrivate: false,
        createdById: null, updatedAt: now, createdAt: now,
      },
    ],
    families: [
      {
        id: 'ptr-fam', treeId: 'tree-source', gedcomId: null,
        husbandId: null, wifeId: 'ptr-root',
        children: [{ familyId: 'ptr-fam', individualId: 'ptr-child' }],
        marriageContractDate: null, marriageContractHijriDate: null,
        marriageContractPlace: null, marriageContractPlaceId: null,
        marriageContractDescription: null, marriageContractNotes: null,
        marriageDate: null, marriageHijriDate: null,
        marriagePlace: null, marriagePlaceId: null,
        marriageDescription: null, marriageNotes: null,
        isDivorced: false, divorceDate: null, divorceHijriDate: null,
        divorcePlace: null, divorcePlaceId: null,
        divorceDescription: null, divorceNotes: null,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/workspaces/[id]/tree — branch pointer merge', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns only target tree data when no active pointers exist', async () => {
    mockAuth();
    mockMember();
    mockTargetTree();
    mockGetActivePointers.mockResolvedValue([]);

    const { GET } = await import('@/app/api/workspaces/[id]/tree/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree`);
    const res = await GET(req, treeParams);

    expect(res.status).toBe(200);
    const body = await res.json();

    // Should have target tree data
    expect(body.data.individuals['father']).toBeDefined();
    expect(body.data.individuals['mother']).toBeDefined();
    expect(body.data.individuals['child1']).toBeDefined();

    // Should NOT have any pointed data
    expect(body.data.individuals['ptr-root']).toBeUndefined();
  });

  test('merges pointed subtree when active pointer exists', async () => {
    mockAuth();
    mockMember();
    mockTargetTree();

    // Active pointer: ptr-root from ws-source linked to child1 as spouse
    mockGetActivePointers.mockResolvedValue([
      {
        id: 'bp-1',
        sourceWorkspaceId: 'ws-source-123',
        rootIndividualId: 'ptr-root',
        depthLimit: null,
        includeGrafts: false,
        targetWorkspaceId: wsId,
        anchorIndividualId: 'child1',
        relationship: 'spouse',
        status: 'active',
      },
    ]);

    // Source tree data
    mockGetTreeByWorkspaceId.mockResolvedValue(makeSourceTreeData());

    const { GET } = await import('@/app/api/workspaces/[id]/tree/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree`);
    const res = await GET(req, treeParams);

    expect(res.status).toBe(200);
    const body = await res.json();

    // Should have target + pointed data
    expect(body.data.individuals['father']).toBeDefined();
    expect(body.data.individuals['ptr-root']).toBeDefined();
    expect(body.data.individuals['ptr-root']._pointed).toBe(true);
    expect(body.data.individuals['ptr-root']._sourceWorkspaceId).toBe('ws-source-123');
    expect(body.data.individuals['ptr-child']).toBeDefined();
    expect(body.data.individuals['ptr-child']._pointed).toBe(true);
  });

  test('does not include data from revoked pointers', async () => {
    mockAuth();
    mockMember();
    mockTargetTree();

    // Revoked pointer — should not be returned by findMany with status filter
    mockGetActivePointers.mockResolvedValue([]);

    const { GET } = await import('@/app/api/workspaces/[id]/tree/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree`);
    const res = await GET(req, treeParams);

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data.individuals['ptr-root']).toBeUndefined();
  });

  test('applies privacy redaction to pointed individuals', async () => {
    mockAuth();
    mockMember();
    mockTargetTree();

    mockGetActivePointers.mockResolvedValue([
      {
        id: 'bp-1',
        sourceWorkspaceId: 'ws-source-123',
        rootIndividualId: 'ptr-root',
        depthLimit: null,
        includeGrafts: false,
        targetWorkspaceId: wsId,
        anchorIndividualId: 'child1',
        relationship: 'spouse',
        status: 'active',
      },
    ]);

    // Source tree with a private individual
    const sourceData = makeSourceTreeData();
    sourceData.individuals[1].isPrivate = true; // ptr-child is private
    mockGetTreeByWorkspaceId.mockResolvedValue(sourceData);

    const { GET } = await import('@/app/api/workspaces/[id]/tree/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree`);
    const res = await GET(req, treeParams);

    expect(res.status).toBe(200);
    const body = await res.json();

    // ptr-child should be redacted (name = 'خاص')
    const ptrChild = body.data.individuals['ptr-child'];
    expect(ptrChild).toBeDefined();
    expect(ptrChild.name).toBe('خاص');
    expect(ptrChild.givenName).toBe('خاص');
  });
});

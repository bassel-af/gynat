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

const wsId = 'ws-target-parallel';
const treeParams = { params: Promise.resolve({ id: wsId }) };

const fakeUser = {
  id: 'user-uuid-parallel',
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

// Target workspace tree: a single individual (anchor point)
function mockTargetTree() {
  mockFamilyTreeFindUnique.mockResolvedValue({
    id: 'tree-target',
    workspaceId: wsId,
    lastModifiedAt: now,
    individuals: [
      {
        id: 'anchor', treeId: 'tree-target', gedcomId: null,
        givenName: 'محمد', surname: 'السعيد', fullName: null,
        sex: 'M', birthDate: '1950', birthPlace: null,
        birthPlaceId: null, birthDescription: null, birthNotes: null,
        deathDate: null, deathPlace: null, deathPlaceId: null,
        deathDescription: null, deathNotes: null,
        birthHijriDate: null, deathHijriDate: null, notes: null,
        isDeceased: false, isPrivate: false,
        createdById: null, updatedAt: now, createdAt: now,
      },
    ],
    families: [],
  });
}

/** Source workspace A tree: two individuals (ptr-root-a and ptr-child-a) */
function makeSourceTreeA() {
  return {
    id: 'tree-source-a',
    workspaceId: 'ws-source-a',
    individuals: [
      {
        id: 'ptr-root-a', treeId: 'tree-source-a', gedcomId: null,
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
        id: 'ptr-child-a', treeId: 'tree-source-a', gedcomId: null,
        givenName: 'ليلى', surname: null, fullName: null,
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
        id: 'fam-source-a', treeId: 'tree-source-a', gedcomId: null,
        husbandId: null, wifeId: 'ptr-root-a',
        children: [{ familyId: 'fam-source-a', individualId: 'ptr-child-a' }],
        marriageContractDate: null, marriageContractHijriDate: null,
        marriageContractPlace: null, marriageContractPlaceId: null,
        marriageContractDescription: null, marriageContractNotes: null,
        marriageDate: null, marriageHijriDate: null,
        marriagePlace: null, marriagePlaceId: null,
        marriageDescription: null, marriageNotes: null,
        isUmmWalad: false,
        isDivorced: false, divorceDate: null, divorceHijriDate: null,
        divorcePlace: null, divorcePlaceId: null,
        divorceDescription: null, divorceNotes: null,
      },
    ],
  };
}

/** Source workspace B tree: one individual (ptr-root-b) */
function makeSourceTreeB() {
  return {
    id: 'tree-source-b',
    workspaceId: 'ws-source-b',
    individuals: [
      {
        id: 'ptr-root-b', treeId: 'tree-source-b', gedcomId: null,
        givenName: 'عائشة', surname: null, fullName: null,
        sex: 'F', birthDate: '1975', birthPlace: null,
        birthPlaceId: null, birthDescription: null, birthNotes: null,
        deathDate: null, deathPlace: null, deathPlaceId: null,
        deathDescription: null, deathNotes: null,
        birthHijriDate: null, deathHijriDate: null, notes: null,
        isDeceased: false, isPrivate: false,
        createdById: null, updatedAt: now, createdAt: now,
      },
    ],
    families: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/workspaces/[id]/tree — parallel pointer fetch optimization', () => {
  beforeEach(() => vi.clearAllMocks());

  test('fetches source tree only once when two pointers reference the same source workspace', async () => {
    mockAuth();
    mockMember();
    mockTargetTree();

    // Two pointers, both from the same source workspace
    mockGetActivePointers.mockResolvedValue([
      {
        id: 'bp-1',
        sourceWorkspaceId: 'ws-source-a',
        rootIndividualId: 'ptr-root-a',
        selectedIndividualId: 'ptr-root-a',
        depthLimit: null,
        includeGrafts: false,
        targetWorkspaceId: wsId,
        anchorIndividualId: 'anchor',
        relationship: 'spouse',
        linkChildrenToAnchor: false,
        sourceWorkspaceNameAr: 'عائلة أ',
        sourceWorkspaceSlug: 'source-a',
        sourceRootName: 'فدوى',
      },
      {
        id: 'bp-2',
        sourceWorkspaceId: 'ws-source-a',
        rootIndividualId: 'ptr-child-a',
        selectedIndividualId: 'ptr-child-a',
        depthLimit: null,
        includeGrafts: false,
        targetWorkspaceId: wsId,
        anchorIndividualId: 'anchor',
        relationship: 'child',
        linkChildrenToAnchor: false,
        sourceWorkspaceNameAr: 'عائلة أ',
        sourceWorkspaceSlug: 'source-a',
        sourceRootName: 'ليلى',
      },
    ]);

    mockGetTreeByWorkspaceId.mockResolvedValue(makeSourceTreeA());

    const { GET } = await import('@/app/api/workspaces/[id]/tree/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree`);
    const res = await GET(req, treeParams);

    expect(res.status).toBe(200);

    // Key assertion: getTreeByWorkspaceId should be called only ONCE
    // for the deduplicated source workspace, not twice
    expect(mockGetTreeByWorkspaceId).toHaveBeenCalledTimes(1);
    expect(mockGetTreeByWorkspaceId).toHaveBeenCalledWith('ws-source-a');
  });

  test('fetches different source workspaces in parallel (not sequentially)', async () => {
    mockAuth();
    mockMember();
    mockTargetTree();

    // Two pointers from two different source workspaces
    mockGetActivePointers.mockResolvedValue([
      {
        id: 'bp-1',
        sourceWorkspaceId: 'ws-source-a',
        rootIndividualId: 'ptr-root-a',
        selectedIndividualId: 'ptr-root-a',
        depthLimit: null,
        includeGrafts: false,
        targetWorkspaceId: wsId,
        anchorIndividualId: 'anchor',
        relationship: 'spouse',
        linkChildrenToAnchor: false,
        sourceWorkspaceNameAr: 'عائلة أ',
        sourceWorkspaceSlug: 'source-a',
        sourceRootName: 'فدوى',
      },
      {
        id: 'bp-2',
        sourceWorkspaceId: 'ws-source-b',
        rootIndividualId: 'ptr-root-b',
        selectedIndividualId: 'ptr-root-b',
        depthLimit: null,
        includeGrafts: false,
        targetWorkspaceId: wsId,
        anchorIndividualId: 'anchor',
        relationship: 'child',
        linkChildrenToAnchor: false,
        sourceWorkspaceNameAr: 'عائلة ب',
        sourceWorkspaceSlug: 'source-b',
        sourceRootName: 'عائشة',
      },
    ]);

    // Track call order to verify parallelism
    const callOrder: string[] = [];
    mockGetTreeByWorkspaceId.mockImplementation(async (wsId: string) => {
      callOrder.push(`start:${wsId}`);
      // Simulate async delay
      await new Promise((r) => setTimeout(r, 10));
      callOrder.push(`end:${wsId}`);
      if (wsId === 'ws-source-a') return makeSourceTreeA();
      if (wsId === 'ws-source-b') return makeSourceTreeB();
      return null;
    });

    const { GET } = await import('@/app/api/workspaces/[id]/tree/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree`);
    const res = await GET(req, treeParams);

    expect(res.status).toBe(200);

    // Both fetches should be called
    expect(mockGetTreeByWorkspaceId).toHaveBeenCalledTimes(2);

    // Parallel execution: both starts should happen before any end
    // Sequential would be: start:a, end:a, start:b, end:b
    // Parallel should be: start:a, start:b, end:a, end:b (or start:a, start:b, end:b, end:a)
    const firstEndIndex = callOrder.findIndex((c) => c.startsWith('end:'));
    const startCount = callOrder.slice(0, firstEndIndex).filter((c) => c.startsWith('start:')).length;
    expect(startCount).toBe(2); // Both starts should happen before any end
  });

  test('merge results include data from all pointers after parallel fetch', async () => {
    mockAuth();
    mockMember();
    mockTargetTree();

    mockGetActivePointers.mockResolvedValue([
      {
        id: 'bp-1',
        sourceWorkspaceId: 'ws-source-a',
        rootIndividualId: 'ptr-root-a',
        selectedIndividualId: 'ptr-root-a',
        depthLimit: null,
        includeGrafts: false,
        targetWorkspaceId: wsId,
        anchorIndividualId: 'anchor',
        relationship: 'spouse',
        linkChildrenToAnchor: false,
        sourceWorkspaceNameAr: 'عائلة أ',
        sourceWorkspaceSlug: 'source-a',
        sourceRootName: 'فدوى',
      },
      {
        id: 'bp-2',
        sourceWorkspaceId: 'ws-source-b',
        rootIndividualId: 'ptr-root-b',
        selectedIndividualId: 'ptr-root-b',
        depthLimit: null,
        includeGrafts: false,
        targetWorkspaceId: wsId,
        anchorIndividualId: 'anchor',
        relationship: 'child',
        linkChildrenToAnchor: false,
        sourceWorkspaceNameAr: 'عائلة ب',
        sourceWorkspaceSlug: 'source-b',
        sourceRootName: 'عائشة',
      },
    ]);

    mockGetTreeByWorkspaceId.mockImplementation(async (wsId: string) => {
      if (wsId === 'ws-source-a') return makeSourceTreeA();
      if (wsId === 'ws-source-b') return makeSourceTreeB();
      return null;
    });

    const { GET } = await import('@/app/api/workspaces/[id]/tree/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree`);
    const res = await GET(req, treeParams);

    expect(res.status).toBe(200);
    const body = await res.json();

    // Target individual present
    expect(body.data.individuals['anchor']).toBeDefined();

    // Individuals from source A merged
    expect(body.data.individuals['ptr-root-a']).toBeDefined();
    expect(body.data.individuals['ptr-root-a']._pointed).toBe(true);
    expect(body.data.individuals['ptr-child-a']).toBeDefined();
    expect(body.data.individuals['ptr-child-a']._pointed).toBe(true);

    // Individuals from source B merged
    expect(body.data.individuals['ptr-root-b']).toBeDefined();
    expect(body.data.individuals['ptr-root-b']._pointed).toBe(true);
  });

  test('skips source workspace when getTreeByWorkspaceId returns null', async () => {
    mockAuth();
    mockMember();
    mockTargetTree();

    mockGetActivePointers.mockResolvedValue([
      {
        id: 'bp-1',
        sourceWorkspaceId: 'ws-source-missing',
        rootIndividualId: 'ptr-root-x',
        selectedIndividualId: 'ptr-root-x',
        depthLimit: null,
        includeGrafts: false,
        targetWorkspaceId: wsId,
        anchorIndividualId: 'anchor',
        relationship: 'spouse',
        linkChildrenToAnchor: false,
        sourceWorkspaceNameAr: 'عائلة مفقودة',
        sourceWorkspaceSlug: 'source-missing',
        sourceRootName: 'مجهول',
      },
      {
        id: 'bp-2',
        sourceWorkspaceId: 'ws-source-a',
        rootIndividualId: 'ptr-root-a',
        selectedIndividualId: 'ptr-root-a',
        depthLimit: null,
        includeGrafts: false,
        targetWorkspaceId: wsId,
        anchorIndividualId: 'anchor',
        relationship: 'child',
        linkChildrenToAnchor: false,
        sourceWorkspaceNameAr: 'عائلة أ',
        sourceWorkspaceSlug: 'source-a',
        sourceRootName: 'فدوى',
      },
    ]);

    mockGetTreeByWorkspaceId.mockImplementation(async (wsId: string) => {
      if (wsId === 'ws-source-a') return makeSourceTreeA();
      return null; // ws-source-missing returns null
    });

    const { GET } = await import('@/app/api/workspaces/[id]/tree/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree`);
    const res = await GET(req, treeParams);

    expect(res.status).toBe(200);
    const body = await res.json();

    // Source A data should be present
    expect(body.data.individuals['ptr-root-a']).toBeDefined();

    // Missing source data should not cause errors
    expect(body.data.individuals['ptr-root-x']).toBeUndefined();
  });

  test('three pointers to two workspaces: deduplicates correctly', async () => {
    mockAuth();
    mockMember();
    mockTargetTree();

    // 3 pointers: 2 to ws-source-a, 1 to ws-source-b
    mockGetActivePointers.mockResolvedValue([
      {
        id: 'bp-1',
        sourceWorkspaceId: 'ws-source-a',
        rootIndividualId: 'ptr-root-a',
        selectedIndividualId: 'ptr-root-a',
        depthLimit: null,
        includeGrafts: false,
        targetWorkspaceId: wsId,
        anchorIndividualId: 'anchor',
        relationship: 'spouse',
        linkChildrenToAnchor: false,
        sourceWorkspaceNameAr: 'عائلة أ',
        sourceWorkspaceSlug: 'source-a',
        sourceRootName: 'فدوى',
      },
      {
        id: 'bp-2',
        sourceWorkspaceId: 'ws-source-b',
        rootIndividualId: 'ptr-root-b',
        selectedIndividualId: 'ptr-root-b',
        depthLimit: null,
        includeGrafts: false,
        targetWorkspaceId: wsId,
        anchorIndividualId: 'anchor',
        relationship: 'child',
        linkChildrenToAnchor: false,
        sourceWorkspaceNameAr: 'عائلة ب',
        sourceWorkspaceSlug: 'source-b',
        sourceRootName: 'عائشة',
      },
      {
        id: 'bp-3',
        sourceWorkspaceId: 'ws-source-a',
        rootIndividualId: 'ptr-child-a',
        selectedIndividualId: 'ptr-child-a',
        depthLimit: null,
        includeGrafts: false,
        targetWorkspaceId: wsId,
        anchorIndividualId: 'anchor',
        relationship: 'child',
        linkChildrenToAnchor: false,
        sourceWorkspaceNameAr: 'عائلة أ',
        sourceWorkspaceSlug: 'source-a',
        sourceRootName: 'ليلى',
      },
    ]);

    mockGetTreeByWorkspaceId.mockImplementation(async (wsId: string) => {
      if (wsId === 'ws-source-a') return makeSourceTreeA();
      if (wsId === 'ws-source-b') return makeSourceTreeB();
      return null;
    });

    const { GET } = await import('@/app/api/workspaces/[id]/tree/route');
    const req = makeRequest(`http://localhost:3000/api/workspaces/${wsId}/tree`);
    const res = await GET(req, treeParams);

    expect(res.status).toBe(200);

    // Should only fetch 2 unique workspaces, not 3
    expect(mockGetTreeByWorkspaceId).toHaveBeenCalledTimes(2);
    expect(mockGetTreeByWorkspaceId).toHaveBeenCalledWith('ws-source-a');
    expect(mockGetTreeByWorkspaceId).toHaveBeenCalledWith('ws-source-b');

    // All pointed data should still be merged
    const body = await res.json();
    expect(body.data.individuals['ptr-root-a']).toBeDefined();
    expect(body.data.individuals['ptr-child-a']).toBeDefined();
    expect(body.data.individuals['ptr-root-b']).toBeDefined();
  });
});

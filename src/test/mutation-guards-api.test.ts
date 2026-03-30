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
const mockFamilyTreeFindUnique = vi.fn();
const mockFamilyTreeCreate = vi.fn();
const mockFamilyTreeUpdate = vi.fn();
const mockIndividualUpdate = vi.fn();
const mockIndividualFindFirst = vi.fn();
const mockFamilyFindFirst = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: {
      findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
    },
    familyTree: {
      findUnique: (...args: unknown[]) => mockFamilyTreeFindUnique(...args),
      create: (...args: unknown[]) => mockFamilyTreeCreate(...args),
      update: (...args: unknown[]) => mockFamilyTreeUpdate(...args),
    },
    individual: {
      update: (...args: unknown[]) => mockIndividualUpdate(...args),
      findFirst: (...args: unknown[]) => mockIndividualFindFirst(...args),
    },
    family: {
      findFirst: (...args: unknown[]) => mockFamilyFindFirst(...args),
    },
    treeEditLog: {
      create: vi.fn(),
    },
  },
}));

// Mock the branch pointer guard query
const mockIsPointedIndividual = vi.fn();
vi.mock('@/lib/tree/branch-pointer-queries', () => ({
  isPointedIndividualInWorkspace: (...args: unknown[]) => mockIsPointedIndividual(...args),
  getActivePointersForWorkspace: vi.fn().mockResolvedValue([]),
}));

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const wsId = 'ws-uuid-guard-123';
const fakeUser = {
  id: 'user-uuid-111',
  email: 'test@example.com',
  user_metadata: { display_name: 'Test User' },
};

function makePatchRequest(url: string, body: object) {
  return new NextRequest(url, {
    method: 'PATCH',
    headers: {
      authorization: 'Bearer valid-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(url: string) {
  return new NextRequest(url, {
    method: 'DELETE',
    headers: {
      authorization: 'Bearer valid-token',
    },
  });
}

function mockAuth() {
  mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
}

function mockEditor() {
  mockMembershipFindUnique.mockResolvedValue({
    userId: fakeUser.id,
    workspaceId: wsId,
    role: 'workspace_admin',
    permissions: ['tree_editor'],
  });
}

function mockTree() {
  mockFamilyTreeFindUnique.mockResolvedValue({
    id: 'tree-uuid-1',
    workspaceId: wsId,
    individuals: [],
    families: [],
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Mutation guards for pointed individuals', () => {
  beforeEach(() => vi.clearAllMocks());

  test('PATCH individual returns 403 when individual is pointed', async () => {
    mockAuth();
    mockEditor();
    mockTree();
    mockIndividualFindFirst.mockResolvedValue({
      id: 'ptr-root',
      treeId: 'tree-uuid-1',
    });
    mockIsPointedIndividual.mockResolvedValue(true);

    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makePatchRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/individuals/ptr-root`,
      { givenName: 'هاكر' },
    );
    const res = await PATCH(req, {
      params: Promise.resolve({ id: wsId, individualId: 'ptr-root' }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  test('DELETE individual returns 403 when individual is pointed', async () => {
    mockAuth();
    mockEditor();
    mockTree();
    mockIndividualFindFirst.mockResolvedValue({
      id: 'ptr-root',
      treeId: 'tree-uuid-1',
    });
    mockIsPointedIndividual.mockResolvedValue(true);

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makeDeleteRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/individuals/ptr-root`,
    );
    const res = await DELETE(req, {
      params: Promise.resolve({ id: wsId, individualId: 'ptr-root' }),
    });

    expect(res.status).toBe(403);
  });

  test('PATCH individual succeeds for non-pointed individual', async () => {
    mockAuth();
    mockEditor();
    mockTree();
    mockIndividualFindFirst.mockResolvedValue({
      id: 'local-person',
      treeId: 'tree-uuid-1',
    });
    mockIsPointedIndividual.mockResolvedValue(false);
    mockIndividualUpdate.mockResolvedValue({ id: 'local-person', givenName: 'أحمد' });

    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makePatchRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/individuals/local-person`,
      { givenName: 'أحمد' },
    );
    const res = await PATCH(req, {
      params: Promise.resolve({ id: wsId, individualId: 'local-person' }),
    });

    expect(res.status).toBe(200);
  });
});

describe('Synthetic family ID validation', () => {
  beforeEach(() => vi.clearAllMocks());

  test('PATCH family returns 400 for synthetic ptr-* family ID', async () => {
    mockAuth();
    mockEditor();
    mockTree();

    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/route'
    );
    const req = makePatchRequest(
      `http://localhost:3000/api/workspaces/${wsId}/tree/families/ptr-bp-1-fam`,
      { marriageDate: '2020' },
    );
    const res = await PATCH(req, {
      params: Promise.resolve({ id: wsId, familyId: 'ptr-bp-1-fam' }),
    });

    expect(res.status).toBe(400);
  });
});

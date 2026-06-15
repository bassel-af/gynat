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
const mockShareTokenFindFirst = vi.fn();
const mockFamilyTreeFindUnique = vi.fn();
const mockWorkspaceFindUnique = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: {
      findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
    },
    workspace: {
      findUnique: (...args: unknown[]) => mockWorkspaceFindUnique(...args),
    },
    branchShareToken: {
      findFirst: (...args: unknown[]) => mockShareTokenFindFirst(...args),
    },
    familyTree: {
      findUnique: (...args: unknown[]) => mockFamilyTreeFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFamilyTreeFindUnique(...args),
    },
  },
}));

vi.mock('@/lib/tree/branch-share-token', () => ({
  hashToken: (token: string) => `hashed_${token}`,
  TOKEN_PREFIX: 'brsh_',
}));

// Mock tree queries for source tree fetch
const mockGetTreeByWorkspaceId = vi.fn();
vi.mock('@/lib/tree/queries', () => ({
  getTreeByWorkspaceId: (...args: unknown[]) => mockGetTreeByWorkspaceId(...args),
}));

// Phase 10b: stub workspace-key helpers.
vi.mock('@/lib/tree/encryption', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tree/encryption')>('@/lib/tree/encryption');
  return {
    ...actual,
    getWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 7)),
    getOrCreateWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 7)),
  };
});

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const wsId = 'ws-target-uuid';
const fakeUser = {
  id: 'user-uuid-admin',
  email: 'admin@example.com',
  user_metadata: { display_name: 'Admin' },
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

const now = new Date();
const routeParams = { params: Promise.resolve({ id: wsId }) };

function mockValidToken() {
  mockShareTokenFindFirst.mockResolvedValue({
    id: 'token-uuid-1',
    tokenHash: 'hashed_brsh_valid-token',
    sourceWorkspaceId: 'ws-source-uuid',
    rootIndividualId: 'src-root',
    depthLimit: null,
    includeGrafts: false,
    targetWorkspaceId: wsId,
    isPublic: false,
    maxUses: 1,
    useCount: 0,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 86400000),
  });
}

function mockSourceWorkspace() {
  mockWorkspaceFindUnique.mockResolvedValue({
    nameAr: 'آل شربك',
  });
}

function mockSourceTree() {
  mockGetTreeByWorkspaceId.mockResolvedValue({
    id: 'tree-source',
    workspaceId: 'ws-source-uuid',
    individuals: [
      {
        id: 'src-root', treeId: 'tree-source', gedcomId: null,
        givenName: 'فدوى', surname: 'شربك', fullName: null,
        sex: 'F', birthDate: '1970', birthPlace: null,
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/workspaces/[id]/share-tokens/preview — token preview', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns 401 for unauthenticated user', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid' },
    });

    const { POST } = await import(
      '@/app/api/workspaces/[id]/share-tokens/preview/route'
    );
    const req = makePostRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens/preview`,
      { token: 'brsh_valid-token' },
    );
    const res = await POST(req, routeParams);
    expect(res.status).toBe(401);
  });

  test('returns 403 for non-admin member', async () => {
    mockAuth();
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsId,
      role: 'workspace_member',
      permissions: [],
    });

    const { POST } = await import(
      '@/app/api/workspaces/[id]/share-tokens/preview/route'
    );
    const req = makePostRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens/preview`,
      { token: 'brsh_valid-token' },
    );
    const res = await POST(req, routeParams);
    expect(res.status).toBe(403);
  });

  test('returns 400 for invalid token', async () => {
    mockAuth();
    mockAdmin();
    mockShareTokenFindFirst.mockResolvedValue(null);

    const { POST } = await import(
      '@/app/api/workspaces/[id]/share-tokens/preview/route'
    );
    const req = makePostRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens/preview`,
      { token: 'brsh_invalid' },
    );
    const res = await POST(req, routeParams);
    expect(res.status).toBe(400);
  });

  test('returns 200 with subtree preview for valid token', async () => {
    mockAuth();
    mockAdmin();
    mockValidToken();
    mockSourceWorkspace();
    mockSourceTree();

    const { POST } = await import(
      '@/app/api/workspaces/[id]/share-tokens/preview/route'
    );
    const req = makePostRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens/preview`,
      { token: 'brsh_valid-token' },
    );
    const res = await POST(req, routeParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.subtree.individuals).toBeDefined();
    expect(body.data.subtree.families).toBeDefined();
    expect(body.data.sourceWorkspaceNameAr).toBeDefined();
    expect(body.data.rootPersonName).toBe('فدوى شربك');
    // Should contain the source root
    expect(body.data.subtree.individuals['src-root']).toBeDefined();
  });

  test('redacts private individuals in preview', async () => {
    mockAuth();
    mockAdmin();
    mockValidToken();
    mockSourceWorkspace();

    // Source tree with private individual
    mockGetTreeByWorkspaceId.mockResolvedValue({
      id: 'tree-source',
      workspaceId: 'ws-source-uuid',
      individuals: [
        {
          id: 'src-root', treeId: 'tree-source', gedcomId: null,
          givenName: 'فدوى', surname: 'شربك', fullName: null,
          sex: 'F', birthDate: '1970', birthPlace: null,
          birthPlaceId: null, birthDescription: null, birthNotes: null,
          deathDate: null, deathPlace: null, deathPlaceId: null,
          deathDescription: null, deathNotes: null,
          birthHijriDate: null, deathHijriDate: null, notes: null,
          isDeceased: false, isPrivate: true, // PRIVATE
          createdById: null, updatedAt: now, createdAt: now,
        },
      ],
      families: [],
    });

    const { POST } = await import(
      '@/app/api/workspaces/[id]/share-tokens/preview/route'
    );
    const req = makePostRequest(
      `http://localhost:3000/api/workspaces/${wsId}/share-tokens/preview`,
      { token: 'brsh_valid-token' },
    );
    const res = await POST(req, routeParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    // Should be redacted
    expect(body.data.subtree.individuals['src-root'].name).toBe('خاص');
    expect(body.data.subtree.individuals['src-root'].givenName).toBe('خاص');
  });
});

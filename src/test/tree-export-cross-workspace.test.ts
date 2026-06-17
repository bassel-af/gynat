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

vi.mock('@/lib/api/rate-limit', () => ({
  treeExportLimiter: { check: () => ({ allowed: true, retryAfterSeconds: 0 }) },
  rateLimitResponse: () =>
    new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 }),
}));

const mockMembershipFindUnique = vi.fn();
const mockFamilyTreeFindUnique = vi.fn();
const mockWorkspaceFindUnique = vi.fn();
const mockWorkspaceFindMany = vi.fn();
const mockPointerQuery = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: {
      findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
    },
    familyTree: {
      findUnique: (...args: unknown[]) => mockFamilyTreeFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFamilyTreeFindUnique(...args),
      create: vi.fn(),
    },
    workspace: {
      findUnique: (...args: unknown[]) => mockWorkspaceFindUnique(...args),
      findMany: (...args: unknown[]) => mockWorkspaceFindMany(...args),
    },
  },
}));

vi.mock('@/lib/tree/branch-pointer-queries', () => ({
  getActivePointersForWorkspace: (...args: unknown[]) => mockPointerQuery(...args),
}));

vi.mock('@/lib/tree/encryption', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tree/encryption')>(
    '@/lib/tree/encryption',
  );
  return {
    ...actual,
    getWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 7)),
    getOrCreateWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 7)),
  };
});

// Mock queries to bypass FamilyTree lookup (we use workspaceFindUnique for everything)
vi.mock('@/lib/tree/queries', async () => {
  const now = new Date();
  const treeA = {
      id: 'tree-A',
      workspaceId: 'ws-A',
      lastModifiedAt: now,
      individuals: [
        {
          id: 'ind-A1',
          treeId: 'tree-A',
          gedcomId: null,
          givenName: 'أ-Given',
          surname: 'أ-Surname',
          fullName: null,
          sex: 'M',
          birthDate: null,
          birthPlace: null,
          birthPlaceId: null,
          birthNotes: null,
          birthDescription: null,
          birthHijriDate: null,
          deathDate: null,
          deathPlace: null,
          deathPlaceId: null,
          deathNotes: null,
          deathDescription: null,
          deathHijriDate: null,
          notes: null,
          isDeceased: false,
          isPrivate: false,
          createdById: null,
          updatedAt: now,
          createdAt: now,
        },
      ],
      families: [],
  };
  return {
    getOrCreateTree: vi.fn().mockResolvedValue(treeA),
    // Export route resolves via resolveTargetTreeOr404; no treeId in these tests
    // → the main tree (treeA), so the stub resolves to it (never a 404).
    getOrCreateTargetTree: vi.fn().mockResolvedValue(treeA),
    resolveTargetTreeOr404: vi.fn().mockResolvedValue(treeA),
    getTreeByWorkspaceId: vi.fn().mockImplementation(async (wsId: string) => {
      if (wsId === 'ws-B') {
        return {
          id: 'tree-B',
          workspaceId: 'ws-B',
          lastModifiedAt: now,
          individuals: [
            {
              id: 'ind-B1',
              treeId: 'tree-B',
              gedcomId: null,
              givenName: 'ب-Given',
              surname: 'ب-Surname',
              fullName: null,
              sex: 'M',
              birthDate: null,
              birthPlace: null,
              birthPlaceId: null,
              birthNotes: null,
              birthDescription: null,
              birthHijriDate: null,
              deathDate: null,
              deathPlace: null,
              deathPlaceId: null,
              deathNotes: null,
              deathDescription: null,
              deathHijriDate: null,
              notes: null,
              isDeceased: false,
              isPrivate: false,
              createdById: null,
              updatedAt: now,
              createdAt: now,
            },
          ],
          families: [],
        };
      }
      return null;
    }),
  };
});

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------

const wsA = 'ws-A';
const wsB = 'ws-B';
const routeParams = { params: Promise.resolve({ id: wsA }) };

const fakeUser = {
  id: 'user-1',
  email: 'u@example.com',
  user_metadata: {},
};

function makeRequest() {
  return new NextRequest(`http://localhost:4000/api/workspaces/${wsA}/tree/export?version=5.5.1`, {
    method: 'GET',
    headers: { authorization: 'Bearer valid-token' },
  });
}

describe('GET /api/workspaces/[id]/tree/export — cross-workspace export guard (C3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id,
      workspaceId: wsA,
      role: 'workspace_admin',
      permissions: [],
    });
    // Caller workspace A — always exports.
    mockWorkspaceFindUnique.mockResolvedValue({
      slug: 'ws-a',
      enableTreeExport: true,
      allowMemberExport: true,
    });
    // One active pointer from A → B
    mockPointerQuery.mockResolvedValue([
      {
        id: 'pointer-1',
        sourceWorkspaceId: wsB,
        rootIndividualId: 'ind-B1',
        anchorIndividualId: 'ind-A1',
        selectedIndividualId: 'ind-B1',
        relationship: 'child',
        depthLimit: null,
        includeGrafts: false,
        linkChildrenToAnchor: false,
      },
    ]);
  });

  test('excludes pointed subtree from B when B.enableTreeExport=false', async () => {
    mockWorkspaceFindMany.mockResolvedValue([{ id: wsB, enableTreeExport: false }]);
    const { GET } = await import('@/app/api/workspaces/[id]/tree/export/route');
    const res = await GET(makeRequest(), routeParams);
    expect(res.status).toBe(200);
    const body = await res.text();
    // Native A data still present
    expect(body).toContain('أ-Given');
    // Pointed B data MUST NOT appear
    expect(body).not.toContain('ب-Given');
    expect(body).not.toContain('ب-Surname');
  });

  test('A can still export its own native data even when every source denies export', async () => {
    mockWorkspaceFindMany.mockResolvedValue([{ id: wsB, enableTreeExport: false }]);
    const { GET } = await import('@/app/api/workspaces/[id]/tree/export/route');
    const res = await GET(makeRequest(), routeParams);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('0 HEAD');
    expect(body).toContain('0 TRLR');
    expect(body).toContain('أ-Given');
  });
});

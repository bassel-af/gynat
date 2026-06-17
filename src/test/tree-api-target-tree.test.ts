import { describe, test, expect, vi, beforeEach } from 'vitest';
import { generateWorkspaceKey, wrapKey } from '@/lib/crypto/workspace-encryption';
import { getMasterKey } from '@/lib/crypto/master-key';

// ===========================================================================
// Collections Chunk 2 — extra-tree editing: routes parameterized by `treeId`.
//
// Behavior under test (the contract that can break):
//  1. A mutation/read with a valid same-workspace EXTRA treeId resolves to THAT
//     tree and touches ITS timestamp (not main's).
//  2. A mutation/read with a foreign/unknown treeId → 404, no write performed.
//  3. Absent treeId → the workspace main tree (backward-compatible).
//
// We mock auth (Supabase) + Prisma the same way the existing tree-route tests
// do, then call the real handlers. `familyTree.findFirst` is the resolver seam:
// it returns the extra tree only when the where clause is scoped to its id, and
// null when scoped to a foreign id.
// ===========================================================================

const TEST_WRAPPED_KEY = wrapKey(generateWorkspaceKey(), getMasterKey());

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

const mockMembershipFindUnique = vi.fn();
const mockWorkspaceFindUnique = vi.fn();
const mockFamilyTreeFindFirst = vi.fn();
const mockFamilyTreeCreate = vi.fn();
const mockFamilyTreeUpdate = vi.fn();
const mockIndividualCreate = vi.fn();
const mockIndividualFindFirst = vi.fn();
const mockTreeEditLogCreate = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: {
      findUnique: (...a: unknown[]) => mockMembershipFindUnique(...a),
    },
    workspace: {
      findUnique: (...a: unknown[]) => mockWorkspaceFindUnique(...a),
    },
    familyTree: {
      findUnique: (...a: unknown[]) => mockFamilyTreeFindFirst(...a),
      findFirst: (...a: unknown[]) => mockFamilyTreeFindFirst(...a),
      create: (...a: unknown[]) => mockFamilyTreeCreate(...a),
      update: (...a: unknown[]) => mockFamilyTreeUpdate(...a),
    },
    individual: {
      create: (...a: unknown[]) => mockIndividualCreate(...a),
      findFirst: (...a: unknown[]) => mockIndividualFindFirst(...a),
    },
    treeEditLog: {
      create: (...a: unknown[]) => mockTreeEditLogCreate(...a),
    },
  },
}));

vi.mock('@/lib/tree/branch-pointer-queries', () => ({
  isPointedIndividualInWorkspace: vi.fn().mockResolvedValue(false),
  getActivePointersForWorkspace: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/tree/encryption', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tree/encryption')>('@/lib/tree/encryption');
  return {
    ...actual,
    getWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 7)),
  };
});

import { NextRequest } from 'next/server';

const wsId = 'ws-uuid-target-tree';
const MAIN_TREE_ID = 'a0000000-0000-4000-a000-0000000000ff';
const EXTRA_TREE_ID = 'b0000000-0000-4000-b000-000000000011';
const FOREIGN_TREE_ID = 'a0000000-0000-4000-9000-000000000099';
const indId = 'd0000000-0000-4000-d000-000000000001';
const now = new Date();

const listParams = { params: Promise.resolve({ id: wsId }) };

const fakeUser = { id: 'user-uuid-1', email: 'e@x.com', user_metadata: { display_name: 'E' } };

function mockAuth() {
  mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
}
function mockTreeEditor() {
  mockMembershipFindUnique.mockResolvedValue({
    userId: fakeUser.id, workspaceId: wsId, role: 'workspace_admin', permissions: [],
  });
}

function makeTree(id: string, kind: 'main' | 'extra') {
  return { id, workspaceId: wsId, kind, lastModifiedAt: now, individuals: [], families: [], radaFamilies: [] };
}

/**
 * Resolver seam: return the right tree based on the `where` the route built.
 * - `{ workspaceId, kind: 'main' }`           → main tree   (treeId absent)
 * - `{ id: EXTRA, ..., kind: { in: [...] } }`  → extra tree (valid same-ws id)
 * - `{ id: FOREIGN, ... }`                     → null       (foreign id)
 */
function wireResolver() {
  mockFamilyTreeFindFirst.mockImplementation((args: { where?: Record<string, unknown> }) => {
    const where = args?.where ?? {};
    if (where.id === EXTRA_TREE_ID) return Promise.resolve(makeTree(EXTRA_TREE_ID, 'extra'));
    if (where.id === FOREIGN_TREE_ID) return Promise.resolve(null);
    if (where.id === undefined) return Promise.resolve(makeTree(MAIN_TREE_ID, 'main'));
    return Promise.resolve(null);
  });
}

function postReq(body: object) {
  return new NextRequest(`http://localhost:3000/api/workspaces/${wsId}/tree/individuals`, {
    method: 'POST',
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockWorkspaceFindUnique.mockResolvedValue({ enableKunya: true, encryptedKey: TEST_WRAPPED_KEY });
  wireResolver();
  mockTreeEditLogCreate.mockResolvedValue({});
  mockFamilyTreeUpdate.mockResolvedValue({});
});

// ---------------------------------------------------------------------------
// 1. Valid same-workspace extra treeId → writes to THAT tree + touches IT
// ---------------------------------------------------------------------------
describe('POST individuals with a same-workspace extra treeId', () => {
  test('creates the individual under the extra tree and touches its timestamp', async () => {
    mockAuth();
    mockTreeEditor();
    mockIndividualCreate.mockResolvedValue({ id: indId, treeId: EXTRA_TREE_ID, givenName: 'فرع', sex: 'M' });

    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');
    const res = await POST(postReq({ givenName: 'فرع', sex: 'M', treeId: EXTRA_TREE_ID }), listParams);

    expect(res.status).toBe(201);

    // Wrote under the EXTRA tree, not main
    const createArg = mockIndividualCreate.mock.calls[0][0];
    expect(createArg.data.treeId).toBe(EXTRA_TREE_ID);
    // `treeId` must NOT leak into the Individual row as a column
    expect('treeId' in createArg.data && createArg.data.treeId).toBe(EXTRA_TREE_ID);

    // Touched the EXTRA tree's timestamp (ETag invalidation), never main's
    const touched = mockFamilyTreeUpdate.mock.calls.map((c) => (c[0] as { where: { id: string } }).where.id);
    expect(touched).toContain(EXTRA_TREE_ID);
    expect(touched).not.toContain(MAIN_TREE_ID);

    // Audit log row also bound to the extra tree
    expect(mockTreeEditLogCreate.mock.calls[0][0].data.treeId).toBe(EXTRA_TREE_ID);
  });
});

// ---------------------------------------------------------------------------
// 2. Foreign / unknown treeId → 404, no write
// ---------------------------------------------------------------------------
describe('POST individuals with a foreign treeId', () => {
  test('returns 404 and performs no write', async () => {
    mockAuth();
    mockTreeEditor();

    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');
    const res = await POST(postReq({ givenName: 'دخيل', sex: 'M', treeId: FOREIGN_TREE_ID }), listParams);

    expect(res.status).toBe(404);
    expect(mockIndividualCreate).not.toHaveBeenCalled();
    expect(mockTreeEditLogCreate).not.toHaveBeenCalled();
    expect(mockFamilyTreeUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. Absent treeId → main tree (backward-compatible)
// ---------------------------------------------------------------------------
describe('POST individuals without a treeId', () => {
  test('writes under the workspace main tree', async () => {
    mockAuth();
    mockTreeEditor();
    mockIndividualCreate.mockResolvedValue({ id: indId, treeId: MAIN_TREE_ID, givenName: 'أصل', sex: 'M' });

    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');
    const res = await POST(postReq({ givenName: 'أصل', sex: 'M' }), listParams);

    expect(res.status).toBe(201);
    expect(mockIndividualCreate.mock.calls[0][0].data.treeId).toBe(MAIN_TREE_ID);
  });
});

// ---------------------------------------------------------------------------
// Read path — GET tree?treeId= resolves the extra tree (404 on foreign)
// ---------------------------------------------------------------------------
describe('GET /tree?treeId=', () => {
  function getReq(treeId?: string) {
    const url = new URL(`http://localhost:3000/api/workspaces/${wsId}/tree`);
    if (treeId) url.searchParams.set('treeId', treeId);
    return new NextRequest(url, { method: 'GET', headers: { authorization: 'Bearer t' } });
  }
  function mockMember() {
    mockMembershipFindUnique.mockResolvedValue({
      userId: fakeUser.id, workspaceId: wsId, role: 'workspace_member', permissions: [],
    });
  }

  test('404 when treeId is foreign/unknown', async () => {
    mockAuth();
    mockMember();
    const { GET } = await import('@/app/api/workspaces/[id]/tree/route');
    const res = await GET(getReq(FOREIGN_TREE_ID), listParams);
    expect(res.status).toBe(404);
  });

  test('200 with the extra tree when treeId matches the workspace', async () => {
    mockAuth();
    mockMember();
    const { GET } = await import('@/app/api/workspaces/[id]/tree/route');
    const res = await GET(getReq(EXTRA_TREE_ID), listParams);
    expect(res.status).toBe(200);
  });
});

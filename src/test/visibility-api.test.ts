import { describe, test, expect, vi, beforeEach } from 'vitest';
import { generateWorkspaceKey, wrapKey } from '@/lib/crypto/workspace-encryption';
import { getMasterKey } from '@/lib/crypto/master-key';

const TEST_WRAPPED_KEY = wrapKey(generateWorkspaceKey(), getMasterKey());

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

const mockMembershipFindUnique = vi.fn();
const mockWorkspaceFindUnique = vi.fn();
const mockFamilyTreeFindFirst = vi.fn();
const mockFamilyTreeFindUnique = vi.fn();
const mockFamilyTreeCreate = vi.fn();
const mockFamilyTreeUpdate = vi.fn();
const mockTreeEditLogCreate = vi.fn().mockResolvedValue({});

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: {
      findUnique: (...a: unknown[]) => mockMembershipFindUnique(...a),
    },
    workspace: {
      findUnique: (...a: unknown[]) => mockWorkspaceFindUnique(...a),
    },
    familyTree: {
      findFirst: (...a: unknown[]) => mockFamilyTreeFindFirst(...a),
      findUnique: (...a: unknown[]) => mockFamilyTreeFindUnique(...a),
      create: (...a: unknown[]) => mockFamilyTreeCreate(...a),
      update: (...a: unknown[]) => mockFamilyTreeUpdate(...a),
    },
    treeEditLog: {
      create: (...a: unknown[]) => mockTreeEditLogCreate(...a),
    },
    branchPointer: {
      // Going-private freeze: no dependent pointers in these tests.
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

// Spy on the going-private dependent-freeze so we can assert WHEN it runs.
// S19: the freeze is workspace-scoped, so it must run ONLY on a MAIN-tree
// unpublish — never on an extra-tree unpublish (which would clobber main's
// dependent pointers). Returns a benign result so the route's try/catch passes.
const mockFreezeDependentPointers = vi.fn().mockResolvedValue({ frozen: 0, failed: 0 });
vi.mock('@/lib/tree/going-private', () => ({
  freezeDependentPointers: (...a: unknown[]) => mockFreezeDependentPointers(...a),
}));

import { PATCH } from '@/app/api/workspaces/[id]/tree/visibility/route';

const WS = 'ws-1';
const USER = 'user-1';
const TREE_ID = 'tree-1';

function adminAuth() {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER } }, error: null });
  mockMembershipFindUnique.mockResolvedValue({
    userId: USER,
    workspaceId: WS,
    role: 'workspace_admin',
    permissions: [],
  });
}

function memberAuth() {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER } }, error: null });
  mockMembershipFindUnique.mockResolvedValue({
    userId: USER,
    workspaceId: WS,
    role: 'workspace_member',
    permissions: [],
  });
}

function req(body: unknown) {
  return new Request(`http://localhost/api/workspaces/${WS}/tree/visibility`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: 'Bearer tok' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest;
}

const params = Promise.resolve({ id: WS });

beforeEach(() => {
  vi.clearAllMocks();
  mockTreeEditLogCreate.mockResolvedValue({});
  mockFreezeDependentPointers.mockResolvedValue({ frozen: 0, failed: 0 });
  // tree: private, no slug yet
  mockFamilyTreeFindFirst.mockResolvedValue({
    id: TREE_ID,
    workspaceId: WS,
    kind: 'main',
    nameAr: null,
    visibility: 'private',
    publicSlug: null,
    publishedAt: null,
    lastModifiedAt: new Date(),
  });
  mockFamilyTreeFindUnique.mockResolvedValue(null); // slug not taken
  mockFamilyTreeUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: TREE_ID,
    visibility: data.visibility,
    publicSlug: data.publicSlug ?? null,
    allowReuse: data.allowReuse ?? false,
    publishedAt: data.publishedAt ?? null,
  }));
  mockWorkspaceFindUnique.mockResolvedValue({
    nameAr: 'آل السعيد',
    enableKunya: true,
    encryptedKey: TEST_WRAPPED_KEY,
  });
});

// ---------------------------------------------------------------------------
// Access control
// ---------------------------------------------------------------------------

describe('PATCH visibility — access control', () => {
  test('non-admin member is rejected (403)', async () => {
    memberAuth();
    const res = await PATCH(req({ level: 'private' }), { params });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Going public — typed confirmation phrase gate
// ---------------------------------------------------------------------------

describe('PATCH visibility — going public', () => {
  test('rejects when the confirmation phrase is wrong (400)', async () => {
    adminAuth();
    const res = await PATCH(req({ level: 'link', confirmationPhrase: 'wrong' }), { params });
    expect(res.status).toBe(400);
    expect(mockFamilyTreeUpdate).not.toHaveBeenCalled();
  });

  test('rejects when the confirmation phrase is missing (400)', async () => {
    adminAuth();
    const res = await PATCH(req({ level: 'link' }), { params });
    expect(res.status).toBe(400);
  });

  test('publishes with the correct phrase and generates a slug', async () => {
    adminAuth();
    const res = await PATCH(req({ level: 'link', confirmationPhrase: 'آل السعيد' }), { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.visibility).toBe('public_link');
    expect(json.data.publicSlug).toBeTruthy();
    expect(json.data.publishedAt).toBeTruthy();
  });

  test('listed publish generates a readable slug derived from the family name', async () => {
    adminAuth();
    const res = await PATCH(req({ level: 'search', confirmationPhrase: 'آل السعيد' }), { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.visibility).toBe('public_listed');
    // The update was called with a generated slug.
    const updateArg = mockFamilyTreeUpdate.mock.calls[0][0];
    expect(typeof updateArg.data.publicSlug).toBe('string');
  });

  test('writes a publish audit entry', async () => {
    adminAuth();
    await PATCH(req({ level: 'link', confirmationPhrase: 'آل السعيد' }), { params });
    expect(mockTreeEditLogCreate).toHaveBeenCalledTimes(1);
    const logArg = mockTreeEditLogCreate.mock.calls[0][0];
    expect(logArg.data.action).toBe('publish');
    expect(logArg.data.entityType).toBe('tree');
  });
});

// ---------------------------------------------------------------------------
// Going private
// ---------------------------------------------------------------------------

describe('PATCH visibility — going private', () => {
  test('going private sets visibility=private but KEEPS the slug and publish stamps (stable address)', async () => {
    adminAuth();
    // Tree is currently public with a slug.
    mockFamilyTreeFindFirst.mockResolvedValue({
      id: TREE_ID,
      workspaceId: WS,
      kind: 'main',
      nameAr: null,
      visibility: 'public_link',
      publicSlug: 'abc123xyz',
      publishedAt: new Date(),
      lastModifiedAt: new Date(),
    });
    const res = await PATCH(req({ level: 'private' }), { params });
    expect(res.status).toBe(200);
    const updateArg = mockFamilyTreeUpdate.mock.calls[0][0];
    expect(updateArg.data.visibility).toBe('private');
    // The slug + publish stamps are NOT touched on going-private (owner's
    // decision: a private round-trip keeps the same public address).
    expect('publicSlug' in updateArg.data).toBe(false);
    expect('publishedAt' in updateArg.data).toBe(false);
    expect('publishedById' in updateArg.data).toBe(false);
  });

  test('re-publishing a tree that already has a slug reuses the SAME slug', async () => {
    adminAuth();
    // Tree was previously public, now private, still has its slug.
    mockFamilyTreeFindFirst.mockResolvedValue({
      id: TREE_ID,
      workspaceId: WS,
      kind: 'main',
      nameAr: null,
      visibility: 'private',
      publicSlug: 'abc123xyz',
      publishedAt: new Date('2026-01-01'),
      lastModifiedAt: new Date(),
    });
    const res = await PATCH(req({ level: 'link', confirmationPhrase: 'آل السعيد' }), { params });
    expect(res.status).toBe(200);
    const updateArg = mockFamilyTreeUpdate.mock.calls[0][0];
    expect(updateArg.data.visibility).toBe('public_link');
    // No new slug generated — the guard keeps the existing one.
    expect('publicSlug' in updateArg.data).toBe(false);
  });

  test('switching link <-> listed keeps the same slug', async () => {
    adminAuth();
    // Currently public_link with a slug; switch to public_listed.
    mockFamilyTreeFindFirst.mockResolvedValue({
      id: TREE_ID,
      workspaceId: WS,
      kind: 'main',
      nameAr: null,
      visibility: 'public_link',
      publicSlug: 'abc123xyz',
      publishedAt: new Date('2026-01-01'),
      lastModifiedAt: new Date(),
    });
    const res = await PATCH(req({ level: 'search', confirmationPhrase: 'آل السعيد' }), { params });
    expect(res.status).toBe(200);
    const updateArg = mockFamilyTreeUpdate.mock.calls[0][0];
    expect(updateArg.data.visibility).toBe('public_listed');
    expect('publicSlug' in updateArg.data).toBe(false); // slug preserved
  });

  test('going private writes an unpublish audit entry', async () => {
    adminAuth();
    mockFamilyTreeFindFirst.mockResolvedValue({
      id: TREE_ID, workspaceId: WS, kind: 'main', nameAr: null,
      visibility: 'public_listed', publicSlug: 'x', publishedAt: new Date(), lastModifiedAt: new Date(),
    });
    await PATCH(req({ level: 'private' }), { params });
    const logArg = mockTreeEditLogCreate.mock.calls[0][0];
    expect(logArg.data.action).toBe('unpublish');
  });
});

// ---------------------------------------------------------------------------
// Standalone extra-tree publish (Slice B) — optional treeId scopes the publish
// to a single `extra` tree, reusing the SAME phrase/slug/freeze machinery.
// ---------------------------------------------------------------------------

const EXTRA_TREE_ID = 'extra-tree-9';

describe('PATCH visibility — extra tree (treeId scoped)', () => {
  test('publishes the resolved extra tree, scoping the lookup to that id', async () => {
    adminAuth();
    mockFamilyTreeFindFirst.mockResolvedValue({
      id: EXTRA_TREE_ID,
      workspaceId: WS,
      kind: 'extra',
      nameAr: 'فرع بني تميم',
      visibility: 'private',
      publicSlug: null,
      publishedAt: null,
      lastModifiedAt: new Date(),
    });
    const res = await PATCH(
      req({ level: 'link', treeId: EXTRA_TREE_ID, confirmationPhrase: 'فرع بني تميم' }),
      { params },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.visibility).toBe('public_link');
    expect(json.data.publicSlug).toBeTruthy();
    // The resolver was scoped to the passed treeId (not a bare main lookup).
    const findArg = mockFamilyTreeFindFirst.mock.calls[0][0];
    expect(findArg.where.id).toBe(EXTRA_TREE_ID);
    // The update targeted the extra tree row.
    expect(mockFamilyTreeUpdate.mock.calls[0][0].where.id).toBe(EXTRA_TREE_ID);
  });

  test('confirmation phrase validates against the EXTRA tree name', async () => {
    adminAuth();
    mockFamilyTreeFindFirst.mockResolvedValue({
      id: EXTRA_TREE_ID,
      workspaceId: WS,
      kind: 'extra',
      nameAr: 'فرع بني تميم',
      visibility: 'private',
      publicSlug: null,
      publishedAt: null,
      lastModifiedAt: new Date(),
    });
    // The workspace family name would pass for the MAIN tree, but this is an
    // extra tree — its own nameAr is the phrase, so the workspace name fails.
    const res = await PATCH(
      req({ level: 'link', treeId: EXTRA_TREE_ID, confirmationPhrase: 'آل السعيد' }),
      { params },
    );
    expect(res.status).toBe(400);
    expect(mockFamilyTreeUpdate).not.toHaveBeenCalled();
  });

  test('unknown/foreign treeId returns 404 without updating', async () => {
    adminAuth();
    // Scoped resolver finds nothing (foreign or non-existent id).
    mockFamilyTreeFindFirst.mockResolvedValue(null);
    const res = await PATCH(
      req({ level: 'link', treeId: 'someone-elses-tree', confirmationPhrase: 'x' }),
      { params },
    );
    expect(res.status).toBe(404);
    expect(mockFamilyTreeUpdate).not.toHaveBeenCalled();
  });

  // S19 — the going-private dependent-freeze is WORKSPACE-scoped, so it must NOT
  // run when an EXTRA tree is unpublished (it would clobber the MAIN tree's
  // dependent pointers and silently break collections borrowing from main).
  test('unpublishing an EXTRA tree does NOT run the workspace-scoped freeze', async () => {
    adminAuth();
    mockFamilyTreeFindFirst.mockResolvedValue({
      id: EXTRA_TREE_ID,
      workspaceId: WS,
      kind: 'extra',
      nameAr: 'فرع بني تميم',
      visibility: 'public_link',
      publicSlug: 'extra-slug',
      publishedAt: new Date(),
      lastModifiedAt: new Date(),
    });
    const res = await PATCH(
      req({ level: 'private', treeId: EXTRA_TREE_ID }),
      { params },
    );
    expect(res.status).toBe(200);
    // The freeze (which freezes ALL pointers sourced from this workspace, i.e.
    // mostly the MAIN tree's dependents) must be skipped for an extra tree.
    expect(mockFreezeDependentPointers).not.toHaveBeenCalled();
  });

  test('unpublishing the MAIN tree still runs the freeze (unchanged)', async () => {
    adminAuth();
    mockFamilyTreeFindFirst.mockResolvedValue({
      id: TREE_ID,
      workspaceId: WS,
      kind: 'main',
      nameAr: null,
      visibility: 'public_link',
      publicSlug: 'main-slug',
      publishedAt: new Date(),
      lastModifiedAt: new Date(),
    });
    const res = await PATCH(req({ level: 'private' }), { params });
    expect(res.status).toBe(200);
    expect(mockFreezeDependentPointers).toHaveBeenCalledWith(WS);
  });
});

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

import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Collection publish routes (admin-only, behind enableCollections):
//   PATCH /api/workspaces/[id]/collections/[collectionId]/visibility
//   GET   /api/workspaces/[id]/collections/[collectionId]/publish-preview
//
// Contract (consumed by collections/api.ts client wrappers):
//   visibility PATCH → { data: { publicSlug, visibility } }
//   publish-preview  → { data: { withheldTrees, publishableCount, publicSlug,
//                                currentVisibility } }
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

const mockMembershipFindUnique = vi.fn();
const mockWorkspaceFindUnique = vi.fn();
const mockCollectionFindFirst = vi.fn();
const mockCollectionUpdate = vi.fn();
const mockCollectionFindUnique = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: { findUnique: (...a: unknown[]) => mockMembershipFindUnique(...a) },
    workspace: { findUnique: (...a: unknown[]) => mockWorkspaceFindUnique(...a) },
    collection: {
      findFirst: (...a: unknown[]) => mockCollectionFindFirst(...a),
      findUnique: (...a: unknown[]) => mockCollectionFindUnique(...a),
      update: (...a: unknown[]) => mockCollectionUpdate(...a),
    },
  },
}));

const mockGenSlug = vi.fn().mockResolvedValue('newslug123');
vi.mock('@/lib/collections/queries', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, generateUniqueCollectionSlug: () => mockGenSlug() };
});

// publish-preview computes withheld items via the public-serve walk.
const mockLoadWalk = vi.fn();
vi.mock('@/lib/collections/public-serve', () => ({
  countPublishableTrees: (...a: unknown[]) => mockLoadWalk(...a),
}));

import { PATCH } from '@/app/api/workspaces/[id]/collections/[collectionId]/visibility/route';
import { GET as PREVIEW } from '@/app/api/workspaces/[id]/collections/[collectionId]/publish-preview/route';

const WS = 'ws-1';
const COLL = 'coll-1';
const USER = 'user-1';

function admin() {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER } }, error: null });
  mockMembershipFindUnique.mockResolvedValue({
    userId: USER, workspaceId: WS, role: 'workspace_admin', permissions: [],
  });
}
function nonAdminMember() {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER } }, error: null });
  mockMembershipFindUnique.mockResolvedValue({
    userId: USER, workspaceId: WS, role: 'member', permissions: ['collection_editor'],
  });
}

const AUTH = { 'content-type': 'application/json', authorization: 'Bearer tok' };
function patchReq(body: object): Request {
  return new Request('https://x', { method: 'PATCH', headers: AUTH, body: JSON.stringify(body) });
}
function getReq(): Request {
  return new Request('https://x', { headers: AUTH });
}
const params = { params: Promise.resolve({ id: WS, collectionId: COLL }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockGenSlug.mockResolvedValue('newslug123');
});

describe('PATCH visibility — gating', () => {
  test('404 when enableCollections is off (deny-by-default, before auth)', async () => {
    mockWorkspaceFindUnique.mockResolvedValue({ enableCollections: false });
    const res = await PATCH(patchReq({ visibility: 'public_link' }) as never, params as never);
    expect(res.status).toBe(404);
  });

  test('403 for a non-admin (collection_editor cannot publish)', async () => {
    mockWorkspaceFindUnique.mockResolvedValue({ enableCollections: true });
    nonAdminMember();
    const res = await PATCH(patchReq({ visibility: 'public_link' }) as never, params as never);
    expect(res.status).toBe(403);
  });
});

describe('PATCH visibility — publish', () => {
  test('mints a slug on first publish and returns { data: { publicSlug, visibility } }', async () => {
    mockWorkspaceFindUnique.mockResolvedValue({ enableCollections: true });
    admin();
    mockCollectionFindFirst.mockResolvedValue({
      id: COLL, workspaceId: WS, visibility: 'private', publicSlug: null,
    });
    mockCollectionUpdate.mockResolvedValue({
      id: COLL, visibility: 'public_link', publicSlug: 'newslug123',
    });

    const res = await PATCH(patchReq({ visibility: 'public_link' }) as never, params as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.publicSlug).toBe('newslug123');
    expect(body.data.visibility).toBe('public_link');
    expect(mockGenSlug).toHaveBeenCalled();
  });

  test('keeps the existing slug across a private round-trip (no re-mint)', async () => {
    mockWorkspaceFindUnique.mockResolvedValue({ enableCollections: true });
    admin();
    mockCollectionFindFirst.mockResolvedValue({
      id: COLL, workspaceId: WS, visibility: 'public_link', publicSlug: 'keepme',
    });
    mockCollectionUpdate.mockResolvedValue({
      id: COLL, visibility: 'private', publicSlug: 'keepme',
    });

    const res = await PATCH(patchReq({ visibility: 'private' }) as never, params as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.publicSlug).toBe('keepme');
    expect(mockGenSlug).not.toHaveBeenCalled();
  });

  test('404 for an unknown collection in this workspace', async () => {
    mockWorkspaceFindUnique.mockResolvedValue({ enableCollections: true });
    admin();
    mockCollectionFindFirst.mockResolvedValue(null);
    const res = await PATCH(patchReq({ visibility: 'public_link' }) as never, params as never);
    expect(res.status).toBe(404);
  });
});

describe('GET publish-preview', () => {
  test('admin-only: 403 for a non-admin', async () => {
    mockWorkspaceFindUnique.mockResolvedValue({ enableCollections: true });
    nonAdminMember();
    const res = await PREVIEW(getReq() as never, params as never);
    expect(res.status).toBe(403);
  });

  test('returns withheld trees + publishable count under { data }', async () => {
    mockWorkspaceFindUnique.mockResolvedValue({ enableCollections: true });
    admin();
    mockCollectionFindFirst.mockResolvedValue({
      id: COLL, workspaceId: WS, visibility: 'private', publicSlug: null,
    });
    mockLoadWalk.mockResolvedValue({
      withheldTrees: [{ titleAr: 'فرع خاص' }],
      publishableCount: 2,
    });

    const res = await PREVIEW(getReq() as never, params as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.withheldTrees).toEqual([{ titleAr: 'فرع خاص' }]);
    expect(body.data.publishableCount).toBe(2);
    expect(body.data.currentVisibility).toBe('private');
    expect(body.data.publicSlug).toBeNull();
  });
});

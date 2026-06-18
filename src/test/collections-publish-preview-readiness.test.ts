import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// GET .../collections/[id]/publish-preview — Slice C extension.
//
// The admin preview is the AUTHORITATIVE source for the listing-readiness
// breakdown the modal renders: which OWN trees are not-yet-listed (promotable)
// and which BORROWED trees are not-listed (blocking). It must NOT be recomputed
// client-side. Comes from getCollectionListingReadiness (Slice A), keyed by the
// collection's public slug (null when never published → empty breakdown).
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

const mockMembershipFindUnique = vi.fn();
const mockWorkspaceFindUnique = vi.fn();
const mockCollectionFindFirst = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: { findUnique: (...a: unknown[]) => mockMembershipFindUnique(...a) },
    workspace: { findUnique: (...a: unknown[]) => mockWorkspaceFindUnique(...a) },
    collection: { findFirst: (...a: unknown[]) => mockCollectionFindFirst(...a) },
  },
}));

const mockCount = vi.fn();
const mockReadiness = vi.fn();
vi.mock('@/lib/collections/public-serve', () => ({
  countPublishableTrees: (...a: unknown[]) => mockCount(...a),
  getCollectionListingReadinessById: (...a: unknown[]) => mockReadiness(...a),
}));

import { GET } from '@/app/api/workspaces/[id]/collections/[collectionId]/publish-preview/route';

const WS = 'ws-1';
const COLL = 'coll-1';
const USER = 'user-1';
const AUTH = { 'content-type': 'application/json', authorization: 'Bearer tok' };
const params = { params: Promise.resolve({ id: WS, collectionId: COLL }) };
const getReq = () => new Request('https://x', { headers: AUTH });

function admin() {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER } }, error: null });
  mockMembershipFindUnique.mockResolvedValue({
    userId: USER, workspaceId: WS, role: 'workspace_admin', permissions: [],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockWorkspaceFindUnique.mockResolvedValue({ enableCollections: true });
  admin();
  mockCount.mockResolvedValue({ withheldTrees: [], publishableCount: 1 });
});

describe('GET publish-preview — listing readiness', () => {
  test('includes the own/borrowed not-listed breakdown from getCollectionListingReadiness', async () => {
    mockCollectionFindFirst.mockResolvedValue({
      id: COLL, workspaceId: WS, visibility: 'public_link', publicSlug: 'slug-1',
    });
    mockReadiness.mockResolvedValue({
      fullyListable: false,
      notListedOwnTrees: [{ treeId: 't1', titleAr: 'فرعنا' }],
      notListedBorrowedTrees: [{ titleAr: 'عائلة معارة', sourceWorkspaceNameAr: 'آل فلان' }],
    });

    const res = await GET(getReq() as never, params as never);
    expect(res.status).toBe(200);
    const body = await res.json();

    // Computed by collection id (works even before a slug exists).
    expect(mockReadiness).toHaveBeenCalledWith(COLL);
    expect(body.data.notListedOwnTrees).toEqual([{ treeId: 't1', titleAr: 'فرعنا' }]);
    expect(body.data.notListedBorrowedTrees).toEqual([
      { titleAr: 'عائلة معارة', sourceWorkspaceNameAr: 'آل فلان' },
    ]);
    expect(body.data.fullyListable).toBe(false);
  });

  test('evaluates readiness even for a still-private collection (id-keyed, no slug)', async () => {
    mockCollectionFindFirst.mockResolvedValue({
      id: COLL, workspaceId: WS, visibility: 'private', publicSlug: null,
    });
    mockReadiness.mockResolvedValue({
      fullyListable: true,
      notListedOwnTrees: [],
      notListedBorrowedTrees: [],
    });

    const res = await GET(getReq() as never, params as never);
    expect(res.status).toBe(200);
    const body = await res.json();

    // Id-keyed readiness is consulted regardless of the (absent) slug.
    expect(mockReadiness).toHaveBeenCalledWith(COLL);
    expect(body.data.notListedOwnTrees).toEqual([]);
    expect(body.data.notListedBorrowedTrees).toEqual([]);
    expect(body.data.fullyListable).toBe(true);
  });
});

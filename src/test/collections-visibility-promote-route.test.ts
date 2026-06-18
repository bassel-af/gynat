import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// PATCH .../collections/[id]/visibility — the Slice C promote-and-list flow.
//
// When an admin lists a collection (public_listed) with
// promoteOwnTreesToListed:true we, in ONE transaction, flip the caller's own
// public_link leaf trees to public_listed, then set the collection. If any
// BORROWED (foreign-workspace) tree is still not listed afterward, the
// collection CANNOT be listed: we publish it public_link instead and report
// { listedBlocked:true, blockingBorrowed:[...] } so the owner can ask/remove.
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

const mockMembershipFindUnique = vi.fn();
const mockWorkspaceFindUnique = vi.fn();
const mockCollectionFindFirst = vi.fn();
const mockCollectionUpdate = vi.fn();
const mockTransaction = vi.fn();
const mockPromote = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: { findUnique: (...a: unknown[]) => mockMembershipFindUnique(...a) },
    workspace: { findUnique: (...a: unknown[]) => mockWorkspaceFindUnique(...a) },
    collection: {
      findFirst: (...a: unknown[]) => mockCollectionFindFirst(...a),
      update: (...a: unknown[]) => mockCollectionUpdate(...a),
    },
    $transaction: (fn: (tx: unknown) => unknown) => mockTransaction(fn),
  },
}));

const mockGenSlug = vi.fn();
vi.mock('@/lib/collections/queries', async (orig) => {
  const actual = (await orig()) as object;
  return {
    ...actual,
    generateUniqueCollectionSlug: () => mockGenSlug(),
    promoteOwnTreesToListed: (...a: unknown[]) => mockPromote(...a),
  };
});

const mockReadiness = vi.fn();
vi.mock('@/lib/collections/public-serve', () => ({
  countPublishableTrees: vi.fn(),
  getCollectionListingReadinessById: (...a: unknown[]) => mockReadiness(...a),
}));

import { PATCH } from '@/app/api/workspaces/[id]/collections/[collectionId]/visibility/route';

const WS = 'ws-1';
const COLL = 'coll-1';
const USER = 'user-1';
const AUTH = { 'content-type': 'application/json', authorization: 'Bearer tok' };
const params = { params: Promise.resolve({ id: WS, collectionId: COLL }) };

function patchReq(body: object): Request {
  return new Request('https://x', { method: 'PATCH', headers: AUTH, body: JSON.stringify(body) });
}
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
  // The transaction runs its callback with a tx client carrying the same shape.
  mockTransaction.mockImplementation((fn) =>
    fn({
      collection: { update: (...a: unknown[]) => mockCollectionUpdate(...a) },
    }),
  );
  mockGenSlug.mockResolvedValue('newslug123');
  mockPromote.mockResolvedValue(1);
});

describe('PATCH visibility — promote own trees + list', () => {
  test('promotes own public_link trees then lists the collection when nothing borrowed blocks', async () => {
    mockCollectionFindFirst.mockResolvedValue({
      id: COLL, workspaceId: WS, visibility: 'public_link', publicSlug: 'keep',
    });
    // After own promotion the only not-listed trees were the owner's own.
    mockReadiness.mockResolvedValue({
      fullyListable: false,
      notListedOwnTrees: [{ treeId: 't1', titleAr: 'فرعنا' }],
      notListedBorrowedTrees: [],
    });
    mockCollectionUpdate.mockResolvedValue({ visibility: 'public_listed', publicSlug: 'keep' });

    const res = await PATCH(
      patchReq({ visibility: 'public_listed', promoteOwnTreesToListed: true }) as never,
      params as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    // Own trees were promoted with their ids, scoped to the caller workspace.
    expect(mockPromote).toHaveBeenCalledWith(['t1'], WS, expect.anything());
    // Collection ended up listed; not blocked.
    expect(body.data.visibility).toBe('public_listed');
    expect(body.data.listedBlocked).toBeFalsy();
  });

  test('blocks listing (publishes public_link) when a borrowed tree stays not-listed', async () => {
    mockCollectionFindFirst.mockResolvedValue({
      id: COLL, workspaceId: WS, visibility: 'public_link', publicSlug: 'keep',
    });
    mockReadiness.mockResolvedValue({
      fullyListable: false,
      notListedOwnTrees: [],
      notListedBorrowedTrees: [
        { titleAr: 'عائلة معارة', sourceWorkspaceNameAr: 'آل فلان' },
      ],
    });
    mockCollectionUpdate.mockResolvedValue({ visibility: 'public_link', publicSlug: 'keep' });

    const res = await PATCH(
      patchReq({ visibility: 'public_listed', promoteOwnTreesToListed: true }) as never,
      params as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    // Did NOT list — fell back to public_link, reported the blocking borrows.
    expect(body.data.visibility).toBe('public_link');
    expect(body.data.listedBlocked).toBe(true);
    expect(body.data.blockingBorrowed).toEqual([
      { titleAr: 'عائلة معارة', sourceWorkspaceNameAr: 'آل فلان' },
    ]);
  });

  test('does NOT promote own trees when the flag is absent (plain listed publish)', async () => {
    mockCollectionFindFirst.mockResolvedValue({
      id: COLL, workspaceId: WS, visibility: 'public_link', publicSlug: 'keep',
    });
    mockReadiness.mockResolvedValue({
      fullyListable: true,
      notListedOwnTrees: [],
      notListedBorrowedTrees: [],
    });
    mockCollectionUpdate.mockResolvedValue({ visibility: 'public_listed', publicSlug: 'keep' });

    const res = await PATCH(
      patchReq({ visibility: 'public_listed' }) as never,
      params as never,
    );
    expect(res.status).toBe(200);
    expect(mockPromote).not.toHaveBeenCalled();
  });

  test('a private patch never computes readiness or promotes', async () => {
    mockCollectionFindFirst.mockResolvedValue({
      id: COLL, workspaceId: WS, visibility: 'public_listed', publicSlug: 'keep',
    });
    mockCollectionUpdate.mockResolvedValue({ visibility: 'private', publicSlug: 'keep' });

    const res = await PATCH(patchReq({ visibility: 'private' }) as never, params as never);
    expect(res.status).toBe(200);
    expect(mockReadiness).not.toHaveBeenCalled();
    expect(mockPromote).not.toHaveBeenCalled();
  });
});

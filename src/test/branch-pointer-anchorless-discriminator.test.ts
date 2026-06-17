import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Collection-link branch pointers must NEVER enter the member tree. They are
// anchor-less (null anchor/selected/relationship) source descriptors, so
// `mergePointedSubtree` would break on them and they're not member-tree branch
// links at all. The three TARGET-side consumers all filter
// `isCollectionLink: false` — this test pins that fail-closed discriminator.
// ---------------------------------------------------------------------------

const mockFindMany = vi.fn();
const mockFindFirst = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    branchPointer: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
      findFirst: (...a: unknown[]) => mockFindFirst(...a),
    },
  },
}));

import {
  getActivePointersForWorkspace,
  isPointedIndividualInWorkspace,
} from '@/lib/tree/branch-pointer-queries';

const WS = 'ws-target-0001';

beforeEach(() => vi.clearAllMocks());

describe('getActivePointersForWorkspace excludes collection-link pointers', () => {
  test('the query filters isCollectionLink:false (collection-link = never merged)', async () => {
    mockFindMany.mockResolvedValue([]);
    await getActivePointersForWorkspace(WS);
    const where = mockFindMany.mock.calls[0][0].where;
    expect(where.targetWorkspaceId).toBe(WS);
    expect(where.status).toBe('active');
    // The discriminator: a collection-link pointer is never merged.
    expect(where.isCollectionLink).toBe(false);
  });

  test('returns only the anchored (real branch) pointers the DB hands back', async () => {
    // The DB applies the filter; the helper just maps. Simulate one anchored row.
    mockFindMany.mockResolvedValue([
      {
        id: 'p1', sourceWorkspaceId: 'ws-src', rootIndividualId: 'r1',
        selectedIndividualId: 's1', depthLimit: null, includeGrafts: false,
        targetWorkspaceId: WS, anchorIndividualId: 'a1', relationship: 'child',
        linkChildrenToAnchor: false,
        sourceWorkspace: { nameAr: 'X', slug: 'x' },
        rootIndividual: { givenName: 'ج', surname: null },
      },
    ]);
    const res = await getActivePointersForWorkspace(WS);
    expect(res).toHaveLength(1);
    expect(res[0].anchorIndividualId).toBe('a1');
  });
});

describe('isPointedIndividualInWorkspace excludes collection-link pointers', () => {
  test('the guard query filters isCollectionLink:false', async () => {
    mockFindFirst.mockResolvedValue(null);
    await isPointedIndividualInWorkspace('ind-1', WS);
    const where = mockFindFirst.mock.calls[0][0].where;
    expect(where.targetWorkspaceId).toBe(WS);
    expect(where.rootIndividualId).toBe('ind-1');
    expect(where.status).toBe('active');
    expect(where.isCollectionLink).toBe(false);
  });
});

// ===========================================================================
// S20 item 8 — REGRESSION GATE. With a collection-link pointer present in the
// DB, every TARGET-side reader must behave as if it isn't there. We model the
// DB honoring the `isCollectionLink: false` filter (a real Postgres WHERE drops
// the collection-link row), and assert the readers surface ONLY the anchored
// pointer — never the collection-link one — so the merge/export/guards can't
// crash on its null anchor and the native tree is untouched.
// ===========================================================================
describe('S20 regression gate — a collection-link pointer never surfaces target-side', () => {
  const anchoredRow = {
    id: 'p-anchored', sourceWorkspaceId: 'ws-src', rootIndividualId: 'r1',
    selectedIndividualId: 's1', depthLimit: null, includeGrafts: false,
    targetWorkspaceId: WS, anchorIndividualId: 'a1', relationship: 'child' as const,
    linkChildrenToAnchor: false, isCollectionLink: false,
    sourceWorkspace: { nameAr: 'X', slug: 'x' }, rootIndividual: { givenName: 'ج', surname: null },
  };
  const collectionLinkRow = {
    id: 'p-collection', sourceWorkspaceId: 'ws-src', rootIndividualId: 'r9',
    selectedIndividualId: null, depthLimit: null, includeGrafts: false,
    targetWorkspaceId: WS, anchorIndividualId: null, relationship: null,
    linkChildrenToAnchor: false, isCollectionLink: true,
    sourceWorkspace: { nameAr: 'X', slug: 'x' }, rootIndividual: { givenName: 'ك', surname: null },
  };

  /** A findMany mock that honors an `isCollectionLink: false` WHERE like Postgres would. */
  function dbHonoringFilter(rows: Array<{ isCollectionLink: boolean }>) {
    return (args: { where?: { isCollectionLink?: boolean } }) => {
      const want = args?.where?.isCollectionLink;
      return Promise.resolve(
        want === undefined ? rows : rows.filter((r) => r.isCollectionLink === want),
      );
    };
  }

  test('the member-merge pointer set excludes the collection-link pointer (no null-anchor row reaches mergePointedSubtree)', async () => {
    mockFindMany.mockImplementation(dbHonoringFilter([anchoredRow, collectionLinkRow]));
    const pointers = await getActivePointersForWorkspace(WS);
    // Only the anchored pointer is returned — the merge loop never sees a null anchor.
    expect(pointers.map((p) => p.id)).toEqual(['p-anchored']);
    expect(pointers.every((p) => p.anchorIndividualId != null)).toBe(true);
  });

  test('an individual that is ONLY a collection-link root is NOT flagged as pointed (edit not falsely blocked)', async () => {
    // The DB drops the collection-link row, so the guard finds nothing → not pointed.
    mockFindFirst.mockImplementation((args: { where?: { isCollectionLink?: boolean } }) => {
      return Promise.resolve(args?.where?.isCollectionLink === false ? null : collectionLinkRow);
    });
    const pointed = await isPointedIndividualInWorkspace('r9', WS);
    expect(pointed).toBe(false);
  });
});

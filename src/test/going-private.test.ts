import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockBranchPointerFindMany = vi.fn();
const mockBranchPointerUpdate = vi.fn().mockResolvedValue({});
const mockTransaction = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    branchPointer: {
      findMany: (...a: unknown[]) => mockBranchPointerFindMany(...a),
      update: (...a: unknown[]) => mockBranchPointerUpdate(...a),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => mockTransaction(fn),
  },
}));

const mockGetTreeByWorkspaceId = vi.fn();
const mockGetOrCreateTree = vi.fn();
vi.mock('@/lib/tree/queries', () => ({
  getTreeByWorkspaceId: (...a: unknown[]) => mockGetTreeByWorkspaceId(...a),
  getOrCreateTree: (...a: unknown[]) => mockGetOrCreateTree(...a),
}));

vi.mock('@/lib/tree/encryption', () => ({
  getWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32)),
}));

vi.mock('@/lib/tree/mapper', () => ({
  dbTreeToGedcomData: vi.fn().mockReturnValue({
    individuals: { root: { id: 'root', familyAsChild: null, familiesAsSpouse: [] } },
    families: {},
  }),
}));

vi.mock('@/lib/tree/branch-pointer-merge', () => ({
  extractPointedSubtree: vi.fn().mockReturnValue({
    individuals: { root: { id: 'root', familyAsChild: null, familiesAsSpouse: [] } },
    families: {},
  }),
}));

const mockPersistDeepCopy = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/tree/branch-pointer-deep-copy', () => ({
  prepareDeepCopy: vi.fn().mockReturnValue({
    individuals: {},
    families: {},
    idMap: new Map([['root', 'new-root']]),
    stitchFamily: null,
  }),
  persistDeepCopy: (...a: unknown[]) => mockPersistDeepCopy(...a),
  computeAnchorReuse: vi.fn().mockReturnValue(null),
}));

vi.mock('@/lib/api/swallowed-error-log', () => ({
  logSwallowedAuditError: vi.fn(),
}));

import { freezeDependentPointers } from '@/lib/tree/going-private';

const POINTER = {
  id: 'ptr-1',
  sourceWorkspaceId: 'src-ws',
  targetWorkspaceId: 'tgt-ws',
  rootIndividualId: 'root',
  selectedIndividualId: 'root',
  anchorIndividualId: 'anchor',
  relationship: 'child',
  depthLimit: null,
  includeGrafts: false,
  status: 'active',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTreeByWorkspaceId.mockResolvedValue({ id: 'src-tree' });
  mockGetOrCreateTree.mockResolvedValue({ id: 'tgt-tree' });
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = { branchPointer: { update: vi.fn().mockResolvedValue({}) } };
    return fn(tx);
  });
});

describe('freezeDependentPointers', () => {
  test('returns zero counts when there are no active dependent pointers', async () => {
    mockBranchPointerFindMany.mockResolvedValue([]);
    const result = await freezeDependentPointers('src-ws');
    expect(result).toEqual({ frozen: 0, failed: 0 });
    expect(mockPersistDeepCopy).not.toHaveBeenCalled();
  });

  test('deep-copies each dependent pointer and writes going_private provenance', async () => {
    mockBranchPointerFindMany.mockResolvedValue([POINTER]);
    const result = await freezeDependentPointers('src-ws');

    expect(result.frozen).toBe(1);
    expect(mockPersistDeepCopy).toHaveBeenCalledTimes(1);
    // 5th arg is the provenance object
    const provenance = mockPersistDeepCopy.mock.calls[0][4];
    expect(provenance.reason).toBe('going_private');
    expect(provenance.sourceWorkspaceId).toBe('src-ws');
    expect(provenance.sourceRootId).toBe('root');
    expect(provenance.copiedRootId).toBe('new-root'); // from idMap
  });

  test('marks the pointer broken (not revoked) inside the transaction', async () => {
    let updateArg: unknown = null;
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        branchPointer: {
          update: vi.fn().mockImplementation((a) => { updateArg = a; return Promise.resolve({}); }),
        },
      };
      return fn(tx);
    });
    mockBranchPointerFindMany.mockResolvedValue([POINTER]);

    await freezeDependentPointers('src-ws');
    expect((updateArg as { data: { status: string } }).data.status).toBe('broken');
  });

  test('breaks the pointer without a copy when the source tree is gone', async () => {
    mockGetTreeByWorkspaceId.mockResolvedValue(null);
    mockBranchPointerFindMany.mockResolvedValue([POINTER]);

    const result = await freezeDependentPointers('src-ws');
    expect(result.frozen).toBe(1);
    expect(mockPersistDeepCopy).not.toHaveBeenCalled();
    expect(mockBranchPointerUpdate).toHaveBeenCalledWith({
      where: { id: 'ptr-1' },
      data: { status: 'broken' },
    });
  });

  test('one failing pointer does not abort the rest', async () => {
    mockBranchPointerFindMany.mockResolvedValue([POINTER, { ...POINTER, id: 'ptr-2' }]);
    // First transaction throws, second succeeds.
    let call = 0;
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      call++;
      if (call === 1) throw new Error('boom');
      const tx = { branchPointer: { update: vi.fn().mockResolvedValue({}) } };
      return fn(tx);
    });

    const result = await freezeDependentPointers('src-ws');
    expect(result.frozen).toBe(1);
    expect(result.failed).toBe(1);
  });

  // S20 (freeze decision): anchor-less collection-link pointers are EXCLUDED at
  // the query level — the freeze is for real anchored member branches only. A
  // collection borrow must NEVER be deep-copied or stitched into the target's
  // MAIN tree (that would corrupt it). Safety on source-private is the serve-
  // time reuse-gate (S11), not the freeze.
  test('the query excludes collection-link pointers (isCollectionLink:false)', async () => {
    mockBranchPointerFindMany.mockResolvedValue([]);
    await freezeDependentPointers('src-ws');
    const where = mockBranchPointerFindMany.mock.calls[0][0].where;
    expect(where.sourceWorkspaceId).toBe('src-ws');
    expect(where.status).toBe('active');
    expect(where.isCollectionLink).toBe(false);
  });

  test('never deep-copies or stitches a collection-link pointer into the target main tree', async () => {
    // Model the DB honoring the WHERE: a collection-link row is dropped, so the
    // freeze only ever sees the anchored one (here, none).
    const collectionLinkPointer = {
      ...POINTER, id: 'ptr-coll', isCollectionLink: true,
      anchorIndividualId: null, selectedIndividualId: null, relationship: null,
    };
    mockBranchPointerFindMany.mockImplementation((args: { where?: { isCollectionLink?: boolean } }) => {
      const rows = [collectionLinkPointer];
      const want = args?.where?.isCollectionLink;
      return Promise.resolve(want === undefined ? rows : rows.filter((r) => r.isCollectionLink === want));
    });

    const result = await freezeDependentPointers('src-ws');
    // The collection-link pointer was filtered out → nothing to freeze, and it
    // is NEVER deep-copied, stitched, or marked broken/revoked (left untouched).
    expect(result).toEqual({ frozen: 0, failed: 0 });
    expect(mockPersistDeepCopy).not.toHaveBeenCalled();
    expect(mockBranchPointerUpdate).not.toHaveBeenCalled();
  });
});

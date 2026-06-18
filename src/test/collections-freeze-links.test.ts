import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// freezeCollectionLinks — the going-private PRESERVATION path for collection
// links (PRD §2.10). When a SOURCE workspace goes private, its anchor-less
// collection-link pointers are deep-copied into a NEW frozen extra tree in the
// borrowing (TARGET) workspace; each dependent CollectionItem is re-pointed
// branchPointerId → treeId + linkMode:'copied'; the pointer is marked broken.
//
// SEPARATE from freezeDependentPointers (that one is for anchored member-tree
// stitches; this one is anchor-less and never touches a main tree).
// ---------------------------------------------------------------------------

const mockPointerFindMany = vi.fn();
const mockPointerUpdate = vi.fn();
const mockItemUpdateMany = vi.fn();
const mockTx = {
  branchPointer: { update: (...a: unknown[]) => mockPointerUpdate(...a) },
  collectionItem: { updateMany: (...a: unknown[]) => mockItemUpdateMany(...a) },
};

vi.mock('@/lib/db', () => ({
  prisma: {
    branchPointer: { findMany: (...a: unknown[]) => mockPointerFindMany(...a) },
    $transaction: (fn: (tx: unknown) => unknown) => fn(mockTx),
  },
}));

const mockCopyBorrowed = vi.fn();
vi.mock('@/lib/collections/copy-borrowed', () => ({
  copyBorrowedBranchIntoNewExtraTree: (...a: unknown[]) => mockCopyBorrowed(...a),
}));

import { freezeCollectionLinks } from '@/lib/tree/going-private';

beforeEach(() => {
  vi.clearAllMocks();
  mockCopyBorrowed.mockResolvedValue({ newTreeId: 'new-tree-1', peopleCount: 3 });
  mockPointerUpdate.mockResolvedValue({});
  mockItemUpdateMany.mockResolvedValue({ count: 1 });
});

describe('freezeCollectionLinks', () => {
  test('queries ONLY active isCollectionLink pointers for the source workspace', async () => {
    mockPointerFindMany.mockResolvedValue([]);
    await freezeCollectionLinks('ws-source');
    expect(mockPointerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sourceWorkspaceId: 'ws-source',
          status: 'active',
          isCollectionLink: true,
        }),
      }),
    );
  });

  test('no collection-link pointers → no copy, zero counts', async () => {
    mockPointerFindMany.mockResolvedValue([]);
    const result = await freezeCollectionLinks('ws-source');
    expect(mockCopyBorrowed).not.toHaveBeenCalled();
    expect(result).toEqual({ frozen: 0, failed: 0 });
  });

  test('deep-copies the borrow, re-points the dependent item, breaks the pointer', async () => {
    mockPointerFindMany.mockResolvedValue([
      {
        id: 'ptr-1',
        sourceWorkspaceId: 'ws-source',
        targetWorkspaceId: 'ws-target',
        rootIndividualId: 'ind-root',
        depthLimit: 4,
        includeGrafts: true,
        rootIndividual: { tree: { id: 'src-leaf-tree' } },
        collectionItems: [{ id: 'item-1', titleAr: 'فرع مستعار' }],
      },
    ]);

    const result = await freezeCollectionLinks('ws-source');

    // Deep-copied into the TARGET workspace.
    expect(mockCopyBorrowed).toHaveBeenCalledWith(
      expect.objectContaining({ addingWorkspaceId: 'ws-target' }),
    );
    // Item re-pointed to the new frozen tree, copied mode, pointer detached.
    expect(mockItemUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { branchPointerId: 'ptr-1' },
        data: expect.objectContaining({
          treeId: 'new-tree-1',
          branchPointerId: null,
          linkMode: 'copied',
        }),
      }),
    );
    // Pointer marked broken.
    expect(mockPointerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ptr-1' },
        data: { status: 'broken' },
      }),
    );
    expect(result).toEqual({ frozen: 1, failed: 0 });
  });

  test('SKIPS a borrow whose source leaf tree is still public + reusable (S19 over-broad fix)', async () => {
    // The MAIN tree of ws-source is going private, but THIS borrow's source leaf
    // is a DIFFERENT extra tree that is STILL public + allowReuse. The borrow
    // would still serve publicly, so it must NOT be frozen — it stays a live link.
    mockPointerFindMany.mockResolvedValue([
      {
        id: 'ptr-live',
        sourceWorkspaceId: 'ws-source',
        targetWorkspaceId: 'ws-target',
        rootIndividualId: 'ind-root',
        depthLimit: 4,
        includeGrafts: true,
        rootIndividual: {
          tree: { id: 'src-extra-tree', visibility: 'public_link', allowReuse: true },
        },
        collectionItems: [{ id: 'item-1', titleAr: 'فرع حي' }],
      },
    ]);

    const result = await freezeCollectionLinks('ws-source');

    // No copy, no re-point, no break — the live borrow is left untouched.
    expect(mockCopyBorrowed).not.toHaveBeenCalled();
    expect(mockItemUpdateMany).not.toHaveBeenCalled();
    expect(mockPointerUpdate).not.toHaveBeenCalled();
    expect(result).toEqual({ frozen: 0, failed: 0 });
  });

  test('STILL freezes a borrow whose source leaf tree is now private (or non-reusable)', async () => {
    // The source leaf tree itself is the one that went private → the borrow is no
    // longer publicly reusable, so the preservation freeze MUST still run.
    mockPointerFindMany.mockResolvedValue([
      {
        id: 'ptr-frozen',
        sourceWorkspaceId: 'ws-source',
        targetWorkspaceId: 'ws-target',
        rootIndividualId: 'ind-root',
        depthLimit: 4,
        includeGrafts: true,
        rootIndividual: {
          tree: { id: 'src-leaf-tree', visibility: 'private', allowReuse: false },
        },
        collectionItems: [{ id: 'item-1', titleAr: 'فرع مجمد' }],
      },
    ]);

    const result = await freezeCollectionLinks('ws-source');

    expect(mockCopyBorrowed).toHaveBeenCalledWith(
      expect.objectContaining({ addingWorkspaceId: 'ws-target' }),
    );
    expect(mockItemUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { branchPointerId: 'ptr-frozen' },
        data: expect.objectContaining({
          treeId: 'new-tree-1',
          branchPointerId: null,
          linkMode: 'copied',
        }),
      }),
    );
    expect(mockPointerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ptr-frozen' },
        data: { status: 'broken' },
      }),
    );
    expect(result).toEqual({ frozen: 1, failed: 0 });
  });

  test('STILL freezes a borrow whose source leaf is public but NOT reusable (allowReuse off)', async () => {
    mockPointerFindMany.mockResolvedValue([
      {
        id: 'ptr-noreuse',
        sourceWorkspaceId: 'ws-source',
        targetWorkspaceId: 'ws-target',
        rootIndividualId: 'ind-root',
        depthLimit: null,
        includeGrafts: false,
        rootIndividual: {
          tree: { id: 'src-leaf-tree', visibility: 'public_link', allowReuse: false },
        },
        collectionItems: [{ id: 'item-1', titleAr: 'فرع' }],
      },
    ]);

    const result = await freezeCollectionLinks('ws-source');

    expect(mockCopyBorrowed).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ frozen: 1, failed: 0 });
  });

  test('a copy failure is counted as failed and does not abort the rest', async () => {
    mockPointerFindMany.mockResolvedValue([
      { id: 'ptr-bad', sourceWorkspaceId: 'ws-source', targetWorkspaceId: 'ws-t', rootIndividualId: 'r', depthLimit: null, includeGrafts: false, rootIndividual: { tree: { id: 'leaf-bad' } }, collectionItems: [] },
      { id: 'ptr-ok', sourceWorkspaceId: 'ws-source', targetWorkspaceId: 'ws-t', rootIndividualId: 'r2', depthLimit: null, includeGrafts: false, rootIndividual: { tree: { id: 'leaf-ok' } }, collectionItems: [{ id: 'i2', titleAr: 'x' }] },
    ]);
    mockCopyBorrowed
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ newTreeId: 'nt2', peopleCount: 1 });

    const result = await freezeCollectionLinks('ws-source');
    expect(result).toEqual({ frozen: 1, failed: 1 });
  });
});

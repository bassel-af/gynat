import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Finding 2 (TOCTOU): the cycle check and the insert must run on ONE
// transaction client. These tests prove `detectCollectionCycleInWorkspace`
// (and `addItem`) accept an explicit Prisma client and use THAT client — so
// the POST route can thread its `tx` through both, making check+insert atomic.
// ---------------------------------------------------------------------------

const mockModuleItemFindMany = vi.fn();
const mockModuleItemFindFirst = vi.fn();
const mockModuleItemCreate = vi.fn();
const mockModuleItemCount = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    collectionItem: {
      findMany: (...a: unknown[]) => mockModuleItemFindMany(...a),
      findFirst: (...a: unknown[]) => mockModuleItemFindFirst(...a),
      create: (...a: unknown[]) => mockModuleItemCreate(...a),
      count: (...a: unknown[]) => mockModuleItemCount(...a),
    },
  },
}));

import {
  detectCollectionCycleInWorkspace,
  addItem,
  itemExistsInCollection,
} from '@/lib/collections/queries';

const wsId = 'ws-tx';

describe('detectCollectionCycleInWorkspace — tx threading', () => {
  beforeEach(() => vi.clearAllMocks());

  test('uses the provided tx client (not the module prisma) for its edge query', async () => {
    // A stand-in transaction client whose findMany is a distinct spy.
    const txFindMany = vi.fn().mockResolvedValue([]);
    const tx = { collectionItem: { findMany: txFindMany } };

    await detectCollectionCycleInWorkspace(wsId, 'A', 'B', tx as never);

    expect(txFindMany).toHaveBeenCalledOnce();
    // The module-level prisma client must NOT be consulted.
    expect(mockModuleItemFindMany).not.toHaveBeenCalled();
  });

  test('still rejects self-nesting when called with a tx client', async () => {
    const tx = { collectionItem: { findMany: vi.fn().mockResolvedValue([]) } };
    const wouldCycle = await detectCollectionCycleInWorkspace(wsId, 'A', 'A', tx as never);
    expect(wouldCycle).toBe(true);
  });

  test('still rejects an ancestor cycle (B->A then A under B) with a tx client', async () => {
    // Edge map: A nests B. Adding A under B closes a loop.
    const tx = {
      collectionItem: {
        findMany: vi.fn().mockResolvedValue([
          { collectionId: 'A', childCollectionId: 'B' },
        ]),
      },
    };
    const wouldCycle = await detectCollectionCycleInWorkspace(wsId, 'B', 'A', tx as never);
    expect(wouldCycle).toBe(true);
  });

  test('defaults to the module prisma when no client is passed', async () => {
    mockModuleItemFindMany.mockResolvedValue([]);
    await detectCollectionCycleInWorkspace(wsId, 'A', 'B');
    expect(mockModuleItemFindMany).toHaveBeenCalledOnce();
  });
});

describe('addItem — tx threading', () => {
  beforeEach(() => vi.clearAllMocks());

  test('uses the provided tx client for both the sortOrder read and the create', async () => {
    const txFindFirst = vi.fn().mockResolvedValue(null);
    const txCreate = vi.fn().mockResolvedValue({ id: 'item-1', sortOrder: 0 });
    const tx = { collectionItem: { findFirst: txFindFirst, create: txCreate } };

    await addItem(
      { collectionId: 'A', kind: 'collection', titleAr: 'ت', childCollectionId: 'B' },
      tx as never,
    );

    expect(txFindFirst).toHaveBeenCalledOnce();
    expect(txCreate).toHaveBeenCalledOnce();
    expect(mockModuleItemFindFirst).not.toHaveBeenCalled();
    expect(mockModuleItemCreate).not.toHaveBeenCalled();
  });

  test('defaults to the module prisma when no client is passed', async () => {
    mockModuleItemFindFirst.mockResolvedValue(null);
    mockModuleItemCreate.mockResolvedValue({ id: 'item-1', sortOrder: 0 });
    await addItem({ collectionId: 'A', kind: 'collection', titleAr: 'ت', childCollectionId: 'B' });
    expect(mockModuleItemFindFirst).toHaveBeenCalledOnce();
    expect(mockModuleItemCreate).toHaveBeenCalledOnce();
  });
});

describe('itemExistsInCollection — dedupe existence check', () => {
  beforeEach(() => vi.clearAllMocks());

  test('uses the provided tx client (not the module prisma) for its count', async () => {
    const txCount = vi.fn().mockResolvedValue(0);
    const tx = { collectionItem: { count: txCount } };
    await itemExistsInCollection('A', { treeId: 'tree-1' }, tx as never);
    expect(txCount).toHaveBeenCalledOnce();
    expect(mockModuleItemCount).not.toHaveBeenCalled();
  });

  test('returns true when a matching tree item already exists', async () => {
    const tx = { collectionItem: { count: vi.fn().mockResolvedValue(1) } };
    const exists = await itemExistsInCollection('A', { treeId: 'tree-1' }, tx as never);
    expect(exists).toBe(true);
  });

  test('returns false when no matching collection item exists', async () => {
    const tx = { collectionItem: { count: vi.fn().mockResolvedValue(0) } };
    const exists = await itemExistsInCollection(
      'A',
      { childCollectionId: 'coll-1' },
      tx as never,
    );
    expect(exists).toBe(false);
  });

  test('defaults to the module prisma when no client is passed', async () => {
    mockModuleItemCount.mockResolvedValue(0);
    await itemExistsInCollection('A', { treeId: 'tree-1' });
    expect(mockModuleItemCount).toHaveBeenCalledOnce();
  });
});

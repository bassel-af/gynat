import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { GedcomData } from '@/lib/gedcom/types';

// ---------------------------------------------------------------------------
// copy.ts — copyTreeIntoNewExtraTree (single-key, same-workspace deep copy of an
// OWN tree into a new extra tree). This suite covers the per-workspace extra
// cap: a copy into a workspace already at the cap must be rejected before any
// write, matching the extra-trees POST route contract.
// ---------------------------------------------------------------------------

const WS = 'ws-own-0000';
const SOURCE_TREE_ID = 'tree-own-source';
const NEW_TREE_ID = 'tree-own-new00';

const mockKey = Buffer.from('own-key-32-bytes-own-key-32-byte');
vi.mock('@/lib/tree/encryption', () => ({
  getWorkspaceKey: () => Promise.resolve(mockKey),
}));

const sourceData: GedcomData = {
  individuals: {
    'ind-1': {
      id: 'ind-1', type: 'INDI', name: 'الجد', givenName: 'الجد', surname: '',
      sex: 'M', familiesAsSpouse: [], familyAsChild: null,
      birth: '', death: '', isDeceased: true, isPrivate: false,
    } as never,
  },
  families: {},
};
vi.mock('@/lib/tree/mapper', () => ({
  dbTreeToGedcomData: () => sourceData,
}));

const mockPersistDeepCopy = vi.fn((..._a: unknown[]): Promise<void> => Promise.resolve());
vi.mock('@/lib/tree/branch-pointer-deep-copy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tree/branch-pointer-deep-copy')>();
  return { ...actual, persistDeepCopy: (...a: unknown[]) => mockPersistDeepCopy(...a) };
});

const mockFindFirst = vi.fn((..._a: unknown[]): Promise<unknown> => Promise.resolve({ id: SOURCE_TREE_ID }));
const mockTreeCount = vi.fn((..._a: unknown[]): Promise<number> => Promise.resolve(0));
const mockTreeCreate = vi.fn((..._a: unknown[]): Promise<{ id: string }> => Promise.resolve({ id: NEW_TREE_ID }));
const mockTransaction = vi.fn((fn: (tx: unknown) => unknown) =>
  fn({ familyTree: { create: (...a: unknown[]) => mockTreeCreate(...a) } }),
);
vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) => mockTransaction(fn),
    familyTree: {
      findFirst: (...a: unknown[]) => mockFindFirst(...a),
      count: (...a: unknown[]) => mockTreeCount(...a),
    },
  },
}));

vi.mock('@/lib/tree/queries', () => ({ TREE_INCLUDES: {} }));

const mockCopySources = vi.fn((..._a: unknown[]) => Promise.resolve({ skippedSourceFiles: 0 }));
vi.mock('@/lib/tree/source-copy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tree/source-copy')>()),
  copySources: (...a: unknown[]) => mockCopySources(...a),
}));

import { copyTreeIntoNewExtraTree } from '@/lib/collections/copy';
import { ExtraTreeCapError, MAX_EXTRA_TREES_PER_WORKSPACE } from '@/lib/collections/extra-tree-cap';

beforeEach(() => {
  vi.clearAllMocks();
  mockFindFirst.mockResolvedValue({ id: SOURCE_TREE_ID });
  mockTreeCount.mockResolvedValue(0);
  mockTreeCreate.mockResolvedValue({ id: NEW_TREE_ID });
  mockCopySources.mockResolvedValue({ skippedSourceFiles: 0 });
});

describe('copyTreeIntoNewExtraTree — extra-tree cap', () => {
  test('rejects with ExtraTreeCapError when the workspace is at the cap', async () => {
    mockTreeCount.mockResolvedValue(MAX_EXTRA_TREES_PER_WORKSPACE);
    await expect(
      copyTreeIntoNewExtraTree({ workspaceId: WS, sourceTreeId: SOURCE_TREE_ID, nameAr: 'نسخة' }),
    ).rejects.toBeInstanceOf(ExtraTreeCapError);
    expect(mockTreeCount).toHaveBeenCalledWith({ where: { workspaceId: WS, kind: 'extra' } });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  test('copies when the workspace is below the cap', async () => {
    mockTreeCount.mockResolvedValue(MAX_EXTRA_TREES_PER_WORKSPACE - 1);
    const res = await copyTreeIntoNewExtraTree({
      workspaceId: WS, sourceTreeId: SOURCE_TREE_ID, nameAr: 'نسخة',
    });
    expect(res.newTreeId).toBe(NEW_TREE_ID);
    expect(mockTransaction).toHaveBeenCalledOnce();
  });
});

describe('copyTreeIntoNewExtraTree — sources (step 8)', () => {
  const copy = () => copyTreeIntoNewExtraTree({ workspaceId: WS, sourceTreeId: SOURCE_TREE_ID, nameAr: 'نسخة' });

  test('copies every source of the tree in same-workspace mode, tree-wide source included', async () => {
    await copy();
    expect(mockCopySources).toHaveBeenCalledOnce();
    const [, input] = mockCopySources.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(input).toMatchObject({
      fromTreeId: SOURCE_TREE_ID,
      toTreeId: NEW_TREE_ID,
      targetWorkspaceId: WS,
      mode: { kind: 'same' },
      includeTreeWide: true,
    });
  });

  test('re-points links through the snapshot id map', async () => {
    await copy();
    const [, input] = mockCopySources.mock.calls[0] as [unknown, { idMap: Map<string, string> }];
    expect(input.idMap.get('ind-1')).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('runs inside the copy transaction, after the people are written', async () => {
    await copy();
    expect(mockPersistDeepCopy.mock.invocationCallOrder[0]).toBeLessThan(mockCopySources.mock.invocationCallOrder[0]);
    expect(mockCopySources.mock.calls[0][0]).toBe(mockPersistDeepCopy.mock.calls[0][0]);
  });

  test('reports the files skipped for the quota', async () => {
    mockCopySources.mockResolvedValue({ skippedSourceFiles: 3 });
    const res = await copy();
    expect(res.skippedSourceFiles).toBe(3);
  });
});

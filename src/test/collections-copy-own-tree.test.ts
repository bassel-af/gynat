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

import { copyTreeIntoNewExtraTree } from '@/lib/collections/copy';
import { ExtraTreeCapError, MAX_EXTRA_TREES_PER_WORKSPACE } from '@/lib/collections/extra-tree-cap';

beforeEach(() => {
  vi.clearAllMocks();
  mockFindFirst.mockResolvedValue({ id: SOURCE_TREE_ID });
  mockTreeCount.mockResolvedValue(0);
  mockTreeCreate.mockResolvedValue({ id: NEW_TREE_ID });
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

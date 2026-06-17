import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { GedcomData } from '@/lib/gedcom/types';

// ---------------------------------------------------------------------------
// copy-borrowed — cross-workspace deep-copy of a borrowed branch into a new
// extra tree (TWO-KEY: decrypt SOURCE key → re-encrypt TARGET key). Distinct
// from copy.ts (single-key, same-workspace). Writes CopyProvenance in the SAME
// transaction. No ciphertext / plaintext-under-source-key crosses workspaces.
// ---------------------------------------------------------------------------

const SOURCE_WS = 'ws-source-0000';
const ADDING_WS = 'ws-adding-0000';
const SOURCE_TREE_ID = 'tree-source-id0';
const NEW_TREE_ID = 'tree-new-id0000';
const ROOT_IND = 'ind-root-00000';

const mockSourceKey = Buffer.from('source-key-32-bytes-source-keyAA');
const mockTargetKey = Buffer.from('target-key-32-bytes-target-keyBB');

const mockGetWorkspaceKey = vi.fn((wsId: string) =>
  Promise.resolve(wsId === SOURCE_WS ? mockSourceKey : mockTargetKey),
);
vi.mock('@/lib/tree/encryption', () => ({
  getWorkspaceKey: (wsId: string) => mockGetWorkspaceKey(wsId),
}));

const mockGetTreeByWorkspaceId = vi.fn((..._a: unknown[]): unknown => undefined);
vi.mock('@/lib/tree/queries', () => ({
  getTreeByWorkspaceId: (...a: unknown[]) => mockGetTreeByWorkspaceId(...a),
  TREE_INCLUDES: {},
}));

// Source DB tree → GedcomData. Return a tiny 2-person branch.
const sourceData: GedcomData = {
  individuals: {
    [ROOT_IND]: {
      id: ROOT_IND, type: 'INDI', name: 'الجد', givenName: 'الجد', surname: '',
      sex: 'M', familiesAsSpouse: ['fam-1'], familyAsChild: null,
      birth: '', death: '', isDeceased: true, isPrivate: false,
    } as never,
    'ind-child': {
      id: 'ind-child', type: 'INDI', name: 'الابن', givenName: 'الابن', surname: '',
      sex: 'M', familiesAsSpouse: [], familyAsChild: 'fam-1',
      birth: '', death: '', isDeceased: false, isPrivate: false,
    } as never,
  },
  families: {
    'fam-1': {
      id: 'fam-1', type: 'FAM', husband: ROOT_IND, wife: null, children: ['ind-child'],
      marriageContract: { date: '', hijriDate: '', place: '', description: '', notes: '' },
      marriage: { date: '', hijriDate: '', place: '', description: '', notes: '' },
      divorce: { date: '', hijriDate: '', place: '', description: '', notes: '' },
      isDivorced: false, isUmmWalad: false,
    } as never,
  },
};
const mockDbTreeToGedcomData = vi.fn((..._a: unknown[]): GedcomData => sourceData);
vi.mock('@/lib/tree/mapper', () => ({
  dbTreeToGedcomData: (...a: unknown[]) => mockDbTreeToGedcomData(...a),
}));

// persistDeepCopy is the DB write — spy it; keep prepare/extract pure.
const mockPersistDeepCopy = vi.fn((..._a: unknown[]): Promise<void> => Promise.resolve());
vi.mock('@/lib/tree/branch-pointer-deep-copy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tree/branch-pointer-deep-copy')>();
  return { ...actual, persistDeepCopy: (...a: unknown[]) => mockPersistDeepCopy(...a) };
});

const mockTreeCreate = vi.fn((..._a: unknown[]): Promise<{ id: string }> => Promise.resolve({ id: NEW_TREE_ID }));
const mockTransaction = vi.fn((fn: (tx: unknown) => unknown) =>
  fn({ familyTree: { create: (...a: unknown[]) => mockTreeCreate(...a) } }),
);
vi.mock('@/lib/db', () => ({
  prisma: { $transaction: (fn: (tx: unknown) => unknown) => mockTransaction(fn) },
}));

import { copyBorrowedBranchIntoNewExtraTree } from '@/lib/collections/copy-borrowed';
import { WHOLE_TREE_ROOT } from '@/lib/collections/resolve-link';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTreeByWorkspaceId.mockResolvedValue({ id: SOURCE_TREE_ID });
  mockGetWorkspaceKey.mockImplementation(async (wsId: string) =>
    wsId === SOURCE_WS ? mockSourceKey : mockTargetKey,
  );
  mockDbTreeToGedcomData.mockReturnValue(sourceData);
  mockTreeCreate.mockResolvedValue({ id: NEW_TREE_ID });
});

describe('copyBorrowedBranchIntoNewExtraTree — TWO-KEY cross-workspace deep copy', () => {
  test('persists with the TARGET key (re-encrypt), never the source key', async () => {
    const res = await copyBorrowedBranchIntoNewExtraTree({
      addingWorkspaceId: ADDING_WS,
      source: {
        type: 'private-token', sourceWorkspaceId: SOURCE_WS, sourceTreeId: SOURCE_TREE_ID,
        rootIndividualId: ROOT_IND, depthLimit: null, includeGrafts: false,
        isPublic: false, shareTokenId: 'tok-1',
      },
      nameAr: 'فرع منسوخ',
    });

    expect(res.newTreeId).toBe(NEW_TREE_ID);
    // persistDeepCopy called with TARGET key (4th arg), not source.
    expect(mockPersistDeepCopy).toHaveBeenCalledOnce();
    const args = mockPersistDeepCopy.mock.calls[0];
    expect(args[3]).toBe(mockTargetKey);
    expect(args[3]).not.toBe(mockSourceKey);
  });

  test('decrypts the source tree with the SOURCE key', async () => {
    await copyBorrowedBranchIntoNewExtraTree({
      addingWorkspaceId: ADDING_WS,
      source: {
        type: 'private-token', sourceWorkspaceId: SOURCE_WS, sourceTreeId: SOURCE_TREE_ID,
        rootIndividualId: ROOT_IND, depthLimit: null, includeGrafts: false,
        isPublic: false, shareTokenId: 'tok-1',
      },
      nameAr: 'فرع منسوخ',
    });
    // dbTreeToGedcomData was called with the SOURCE key.
    expect(mockDbTreeToGedcomData).toHaveBeenCalledWith(expect.anything(), mockSourceKey);
  });

  test('writes CopyProvenance (collection_link_copy) in the same transaction as the copy', async () => {
    await copyBorrowedBranchIntoNewExtraTree({
      addingWorkspaceId: ADDING_WS,
      source: {
        type: 'private-token', sourceWorkspaceId: SOURCE_WS, sourceTreeId: SOURCE_TREE_ID,
        rootIndividualId: ROOT_IND, depthLimit: null, includeGrafts: false,
        isPublic: false, shareTokenId: 'tok-1',
      },
      nameAr: 'فرع منسوخ',
    });
    // persistDeepCopy got a provenance object (5th arg) with the source coords.
    const args = mockPersistDeepCopy.mock.calls[0];
    const provenance = args[4] as Record<string, unknown>;
    expect(provenance).toBeTruthy();
    expect(provenance.reason).toBe('collection_link_copy');
    expect(provenance.sourceWorkspaceId).toBe(SOURCE_WS);
    // The new tree create + persist + provenance all ran inside one $transaction.
    expect(mockTransaction).toHaveBeenCalledOnce();
  });

  test('whole-tree (public slug) source snapshots the entire source tree', async () => {
    const res = await copyBorrowedBranchIntoNewExtraTree({
      addingWorkspaceId: ADDING_WS,
      source: {
        type: 'public-slug', sourceWorkspaceId: SOURCE_WS, sourceTreeId: SOURCE_TREE_ID,
        rootIndividualId: WHOLE_TREE_ROOT, depthLimit: null, includeGrafts: false,
        isPublic: true, shareTokenId: null,
      },
      nameAr: 'شجرة عامة',
    });
    expect(res.newTreeId).toBe(NEW_TREE_ID);
    // The whole 2-person tree was copied (both individuals present in the persisted result).
    // persistDeepCopy(tx, newTreeId, copyResult, targetKey, provenance) → copyResult is arg[2].
    const copyResult = mockPersistDeepCopy.mock.calls[0][2] as { individuals: Record<string, unknown> };
    expect(Object.keys(copyResult.individuals)).toHaveLength(2);
  });

  test('throws when the source tree is missing (fail-closed)', async () => {
    mockGetTreeByWorkspaceId.mockResolvedValue(null);
    await expect(
      copyBorrowedBranchIntoNewExtraTree({
        addingWorkspaceId: ADDING_WS,
        source: {
          type: 'private-token', sourceWorkspaceId: SOURCE_WS, sourceTreeId: SOURCE_TREE_ID,
          rootIndividualId: ROOT_IND, depthLimit: null, includeGrafts: false,
          isPublic: false, shareTokenId: 'tok-1',
        },
        nameAr: 'فرع',
      }),
    ).rejects.toThrow();
  });
});

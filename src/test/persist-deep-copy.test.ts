import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { Individual, Family, FamilyEvent } from '@/lib/gedcom/types';
import type { DeepCopyResult } from '@/lib/tree/branch-pointer-deep-copy';
import {
  generateWorkspaceKey,
  decryptFieldNullable,
} from '@/lib/crypto/workspace-encryption';

// Phase 10b: persistDeepCopy now encrypts every sensitive field with the
// TARGET workspace key before the DB write. Tests capture `createMany`
// args and decrypt with this key to inspect plaintext.
const TEST_TARGET_KEY = generateWorkspaceKey();

function dec(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return decryptFieldNullable(value, TEST_TARGET_KEY);
  if (value instanceof Uint8Array) return decryptFieldNullable(Buffer.from(value), TEST_TARGET_KEY);
  throw new Error(`dec(): unexpected value type: ${typeof value}`);
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const EMPTY_EVENT: FamilyEvent = { date: '', hijriDate: '', place: '', description: '', notes: '' };

function makeIndividual(overrides: Partial<Individual> & { id: string }): Individual {
  return {
    type: 'INDI',
    name: overrides.id,
    givenName: overrides.id,
    surname: '',
    sex: 'M',
    birth: '',
    birthPlace: '',
    birthDescription: '',
    birthNotes: '',
    birthHijriDate: '',
    death: '',
    deathPlace: '',
    deathDescription: '',
    deathNotes: '',
    deathHijriDate: '',
    notes: '',
    isDeceased: false,
    isPrivate: false,
    familiesAsSpouse: [],
    kunya: '',
    familyAsChild: null,
    ...overrides,
  };
}

function makeFamily(overrides: Partial<Family> & { id: string }): Family {
  return {
    type: 'FAM',
    husband: null,
    wife: null,
    children: [],
    marriageContract: EMPTY_EVENT,
    marriage: EMPTY_EVENT,
    divorce: EMPTY_EVENT,
    isDivorced: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock Prisma transaction client
// ---------------------------------------------------------------------------

function makeMockTx() {
  const individualCreateMany = vi.fn().mockResolvedValue({ count: 0 });
  const familyCreateMany = vi.fn().mockResolvedValue({ count: 0 });
  const familyCreate = vi.fn().mockResolvedValue({});
  const familyChildCreate = vi.fn().mockResolvedValue({});

  return {
    tx: {
      individual: { createMany: individualCreateMany },
      family: { createMany: familyCreateMany, create: familyCreate },
      familyChild: { create: familyChildCreate },
    },
    mocks: { individualCreateMany, familyCreateMany, familyCreate, familyChildCreate },
  };
}

// ---------------------------------------------------------------------------
// Tests — persistDeepCopy
// ---------------------------------------------------------------------------

describe('persistDeepCopy', () => {
  beforeEach(() => vi.clearAllMocks());

  const treeId = 'target-tree-uuid';

  function makeCopyResult(): DeepCopyResult {
    return {
      individuals: {
        'new-root': makeIndividual({
          id: 'new-root',
          givenName: 'فدوى',
          surname: 'شربك',
          sex: 'F',
          birth: '1980-01-01',
          birthHijriDate: '1400/02/13',
          birthPlace: 'مكة المكرمة',
          death: '2020-06-15',
          deathHijriDate: '1441/10/23',
          deathPlace: 'المدينة المنورة',
          birthDescription: 'ولدت في مكة',
          birthNotes: 'ملاحظة ولادة',
          deathDescription: 'توفيت في المدينة',
          deathNotes: 'ملاحظة وفاة',
          notes: 'ملاحظات عامة',
          isDeceased: true,
          isPrivate: false,
          familiesAsSpouse: ['new-fam'],
          familyAsChild: null,
        }),
        'new-child': makeIndividual({
          id: 'new-child',
          givenName: 'محمد',
          sex: 'M',
          familyAsChild: 'new-fam',
        }),
      },
      families: {
        'new-fam': makeFamily({
          id: 'new-fam',
          husband: 'anchor-id',
          wife: 'new-root',
          children: ['new-child'],
          marriageContract: { date: '2000-01-01', hijriDate: '1420/09/24', place: 'مكة', description: 'عقد', notes: '' },
          marriage: { date: '2000-06-01', hijriDate: '1421/02/27', place: 'جدة', description: 'زفاف', notes: 'ملاحظة' },
          divorce: EMPTY_EVENT,
          isDivorced: false,
        }),
      },
      idMap: new Map([
        ['old-root', 'new-root'],
        ['old-child', 'new-child'],
        ['old-fam', 'new-fam'],
      ]),
      stitchFamily: null,
      reuseStitch: null,
    };
  }

  test('creates individuals with correct Prisma field mapping', async () => {
    const { persistDeepCopy } = await import('@/lib/tree/branch-pointer-deep-copy');
    const { tx, mocks } = makeMockTx();
    const copyResult = makeCopyResult();

    await persistDeepCopy(tx, treeId, copyResult, TEST_TARGET_KEY);

    expect(mocks.individualCreateMany).toHaveBeenCalledOnce();
    const { data } = mocks.individualCreateMany.mock.calls[0][0];
    expect(data).toHaveLength(2);

    const rootData = data.find((d: { id: string }) => d.id === 'new-root');
    // Phase 10b: encrypted-at-rest fields must be decrypted before compare.
    expect(rootData.id).toBe('new-root');
    expect(rootData.treeId).toBe(treeId);
    expect(rootData.sex).toBe('F');
    expect(rootData.isDeceased).toBe(true);
    expect(rootData.isPrivate).toBe(false);
    expect(dec(rootData.givenName)).toBe('فدوى');
    expect(dec(rootData.surname)).toBe('شربك');
    expect(dec(rootData.birthDate)).toBe('1980-01-01');
    expect(dec(rootData.birthHijriDate)).toBe('1400/02/13');
    expect(dec(rootData.birthPlace)).toBe('مكة المكرمة');
    expect(dec(rootData.deathDate)).toBe('2020-06-15');
    expect(dec(rootData.deathHijriDate)).toBe('1441/10/23');
    expect(dec(rootData.deathPlace)).toBe('المدينة المنورة');
    expect(dec(rootData.birthDescription)).toBe('ولدت في مكة');
    expect(dec(rootData.birthNotes)).toBe('ملاحظة ولادة');
    expect(dec(rootData.deathDescription)).toBe('توفيت في المدينة');
    expect(dec(rootData.deathNotes)).toBe('ملاحظة وفاة');
    expect(dec(rootData.notes)).toBe('ملاحظات عامة');
  });

  test('creates families with correct Prisma field mapping', async () => {
    const { persistDeepCopy } = await import('@/lib/tree/branch-pointer-deep-copy');
    const { tx, mocks } = makeMockTx();
    const copyResult = makeCopyResult();

    await persistDeepCopy(tx, treeId, copyResult, TEST_TARGET_KEY);

    expect(mocks.familyCreateMany).toHaveBeenCalledOnce();
    const { data } = mocks.familyCreateMany.mock.calls[0][0];
    expect(data).toHaveLength(1);

    const fam = data[0];
    expect(fam.id).toBe('new-fam');
    expect(fam.treeId).toBe(treeId);
    expect(fam.husbandId).toBe('anchor-id');
    expect(fam.wifeId).toBe('new-root');
    expect(fam.isDivorced).toBe(false);
    // Phase 10b: event fields encrypted with the target workspace key.
    expect(dec(fam.marriageContractDate)).toBe('2000-01-01');
    expect(dec(fam.marriageContractHijriDate)).toBe('1420/09/24');
    expect(dec(fam.marriageContractPlace)).toBe('مكة');
    expect(dec(fam.marriageContractDescription)).toBe('عقد');
    expect(dec(fam.marriageContractNotes)).toBeNull();
    expect(dec(fam.marriageDate)).toBe('2000-06-01');
    expect(dec(fam.marriageHijriDate)).toBe('1421/02/27');
    expect(dec(fam.marriagePlace)).toBe('جدة');
    expect(dec(fam.marriageDescription)).toBe('زفاف');
    expect(dec(fam.marriageNotes)).toBe('ملاحظة');
    expect(dec(fam.divorceDate)).toBeNull();
    expect(dec(fam.divorceHijriDate)).toBeNull();
    expect(dec(fam.divorcePlace)).toBeNull();
    expect(dec(fam.divorceDescription)).toBeNull();
    expect(dec(fam.divorceNotes)).toBeNull();
  });

  test('creates familyChild records for copied families', async () => {
    const { persistDeepCopy } = await import('@/lib/tree/branch-pointer-deep-copy');
    const { tx, mocks } = makeMockTx();
    const copyResult = makeCopyResult();

    await persistDeepCopy(tx, treeId, copyResult, TEST_TARGET_KEY);

    // One child in new-fam
    expect(mocks.familyChildCreate).toHaveBeenCalledWith({
      data: { familyId: 'new-fam', individualId: 'new-child' },
    });
  });

  test('creates stitch family when present', async () => {
    const { persistDeepCopy } = await import('@/lib/tree/branch-pointer-deep-copy');
    const { tx, mocks } = makeMockTx();
    const copyResult = makeCopyResult();
    copyResult.stitchFamily = makeFamily({
      id: 'stitch-fam',
      husband: 'anchor-id',
      wife: 'new-root',
      children: ['new-child'],
    });

    await persistDeepCopy(tx, treeId, copyResult, TEST_TARGET_KEY);

    // Stitch family created via family.create
    expect(mocks.familyCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'stitch-fam',
        treeId,
        husbandId: 'anchor-id',
        wifeId: 'new-root',
      }),
    });

    // Stitch family children
    const stitchChildCalls = mocks.familyChildCreate.mock.calls.filter(
      (call: unknown[]) => (call[0] as { data: { familyId: string } }).data.familyId === 'stitch-fam',
    );
    expect(stitchChildCalls).toHaveLength(1);
    expect(stitchChildCalls[0][0]).toEqual({
      data: { familyId: 'stitch-fam', individualId: 'new-child' },
    });
  });

  test('skips createMany when no individuals', async () => {
    const { persistDeepCopy } = await import('@/lib/tree/branch-pointer-deep-copy');
    const { tx, mocks } = makeMockTx();
    const copyResult: DeepCopyResult = {
      individuals: {},
      families: {},
      idMap: new Map(),
      stitchFamily: null,
      reuseStitch: null,
    };

    await persistDeepCopy(tx, treeId, copyResult, TEST_TARGET_KEY);

    expect(mocks.individualCreateMany).not.toHaveBeenCalled();
    expect(mocks.familyCreateMany).not.toHaveBeenCalled();
    expect(mocks.familyChildCreate).not.toHaveBeenCalled();
    expect(mocks.familyCreate).not.toHaveBeenCalled();
  });

  test('fullName maps from ind.name', async () => {
    const { persistDeepCopy } = await import('@/lib/tree/branch-pointer-deep-copy');
    const { tx, mocks } = makeMockTx();
    const copyResult = makeCopyResult();
    // Set a specific name
    copyResult.individuals['new-root'].name = 'فدوى شربك';

    await persistDeepCopy(tx, treeId, copyResult, TEST_TARGET_KEY);

    const { data } = mocks.individualCreateMany.mock.calls[0][0];
    const rootData = data.find((d: { id: string }) => d.id === 'new-root');
    expect(dec(rootData.fullName)).toBe('فدوى شربك');
  });
});

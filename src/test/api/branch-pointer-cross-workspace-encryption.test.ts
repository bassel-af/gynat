/**
 * Phase 10b (task #14) integration test: branch pointer deep-copy must
 * decrypt from the SOURCE workspace key and re-encrypt with the TARGET
 * workspace key. Ciphertext is not portable across workspaces.
 *
 * This test exercises the full pipeline with two distinct workspace keys:
 *   1. Build an encrypted DbTree in workspace A (using A's key).
 *   2. Run it through dbTreeToGedcomData(dbTree, keyA) → plaintext GedcomData.
 *   3. extractPointedSubtree → pointed GedcomData.
 *   4. prepareDeepCopy → new UUIDs + stitch family.
 *   5. persistDeepCopy(tx, targetTreeId, copyResult, keyB) → captures
 *      ciphertext written into mocked createMany args.
 *   6. Verify: the captured ciphertext decrypts with keyB but NOT with keyA.
 */

import { describe, test, expect, vi } from 'vitest';
import {
  generateWorkspaceKey,
  encryptFieldNullable,
  decryptFieldNullable,
} from '@/lib/crypto/workspace-encryption';
import { dbTreeToGedcomData, type DbTree } from '@/lib/tree/mapper';
import { extractPointedSubtree } from '@/lib/tree/branch-pointer-merge';
import {
  prepareDeepCopy,
  persistDeepCopy,
} from '@/lib/tree/branch-pointer-deep-copy';

// Two distinct workspace keys — A is the source, B is the target.
const KEY_A = generateWorkspaceKey();
const KEY_B = generateWorkspaceKey();

function encA(value: string | null) {
  return encryptFieldNullable(value, KEY_A);
}

function buildWorkspaceATree(): DbTree {
  const now = new Date();
  const individualBase = {
    treeId: 'tree-A',
    gedcomId: null,
    sex: null,
    isDeceased: false,
    isPrivate: false,
    createdById: null,
    createdAt: now,
    updatedAt: now,
    birthPlaceId: null,
    deathPlaceId: null,
    birthPlaceRef: null,
    deathPlaceRef: null,
    surname: null,
    fullName: null,
    birthDate: null,
    birthPlace: null,
    birthDescription: null,
    birthNotes: null,
    birthHijriDate: null,
    deathDate: null,
    deathPlace: null,
    deathDescription: null,
    deathNotes: null,
    deathHijriDate: null,
    kunya: null,
    notes: null,
  };
  const familyBase = {
    treeId: 'tree-A',
    gedcomId: null,
    marriageContractPlaceId: null,
    marriagePlaceId: null,
    divorcePlaceId: null,
    marriageContractPlaceRef: null,
    marriagePlaceRef: null,
    divorcePlaceRef: null,
    isUmmWalad: false,
    isDivorced: false,
    marriageContractDate: null,
    marriageContractHijriDate: null,
    marriageContractPlace: null,
    marriageContractDescription: null,
    marriageContractNotes: null,
    marriageDate: null,
    marriageHijriDate: null,
    marriagePlace: null,
    marriageDescription: null,
    marriageNotes: null,
    divorceDate: null,
    divorceHijriDate: null,
    divorcePlace: null,
    divorceDescription: null,
    divorceNotes: null,
  };

  return {
    id: 'tree-A',
    workspaceId: 'ws-A',
    individuals: [
      {
        ...individualBase,
        id: 'A1',
        sex: 'M',
        givenName: encA('محمد'),
        surname: encA('السعيد'),
        birthDate: encA('1950-05-20'),
      },
      {
        ...individualBase,
        id: 'A2',
        sex: 'F',
        givenName: encA('زينب'),
        surname: encA('السعيد'),
      },
    ],
    families: [
      {
        ...familyBase,
        id: 'FA',
        husbandId: 'A1',
        wifeId: 'A2',
        children: [{ familyId: 'FA', individualId: 'A2' }],
        marriageDate: encA('1975-03-10'),
        marriagePlace: encA('دمشق'),
      },
    ],
  } as unknown as DbTree;
}

describe('branch pointer deep copy — cross-workspace encryption', () => {
  test('persistDeepCopy encrypts with TARGET key, not source key', async () => {
    // Step 1: read workspace A's tree through the mapper (uses KEY_A)
    const dbTreeA = buildWorkspaceATree();
    const gedcomA = dbTreeToGedcomData(dbTreeA, KEY_A);

    // Plaintext assertion — the source decrypted cleanly
    expect(gedcomA.individuals['A1'].givenName).toBe('محمد');

    // Step 2: extract the pointed subtree
    const pointed = extractPointedSubtree(gedcomA, {
      rootIndividualId: 'A1',
      depthLimit: null,
      includeGrafts: false,
    });
    expect(Object.keys(pointed.individuals).length).toBeGreaterThan(0);

    // Step 3: prepare the deep copy
    const copyResult = prepareDeepCopy(pointed, {
      anchorIndividualId: 'anchor-in-B',
      relationship: 'child',
      pointerId: 'ptr-1',
    });
    expect(Object.keys(copyResult.individuals).length).toBe(
      Object.keys(pointed.individuals).length,
    );

    // Step 4: capture what persistDeepCopy writes with KEY_B
    const captured: { individuals: unknown[]; families: unknown[] } = {
      individuals: [],
      families: [],
    };
    const mockTx = {
      individual: {
        createMany: vi.fn(async ({ data }: { data: unknown[] }) => {
          captured.individuals.push(...data);
          return { count: data.length };
        }),
      },
      family: {
        createMany: vi.fn(async ({ data }: { data: unknown[] }) => {
          captured.families.push(...data);
          return { count: data.length };
        }),
        create: vi.fn().mockResolvedValue({}),
      },
      familyChild: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    await persistDeepCopy(mockTx, 'tree-B', copyResult, KEY_B);

    // Step 5: verify captured ciphertext decrypts with KEY_B
    expect(captured.individuals.length).toBe(2);
    const muhammadRow = captured.individuals.find(
      (i) => decryptFieldNullable((i as { givenName: Buffer | null }).givenName, KEY_B) === 'محمد',
    ) as { givenName: Buffer; surname: Buffer; birthDate: Buffer; sex: string };

    expect(muhammadRow).toBeDefined();
    expect(decryptFieldNullable(muhammadRow.surname, KEY_B)).toBe('السعيد');
    expect(decryptFieldNullable(muhammadRow.birthDate, KEY_B)).toBe('1950-05-20');
    expect(muhammadRow.sex).toBe('M'); // plaintext scalar

    // Step 6: CRITICAL invariant — the same ciphertext does NOT decrypt with KEY_A
    expect(() =>
      decryptFieldNullable(muhammadRow.givenName, KEY_A),
    ).toThrow();
    expect(() =>
      decryptFieldNullable(muhammadRow.birthDate, KEY_A),
    ).toThrow();

    // Family event fields also encrypted with KEY_B
    expect(captured.families.length).toBe(1);
    const fam = captured.families[0] as {
      marriageDate: Buffer | null;
      marriagePlace: Buffer | null;
    };
    expect(decryptFieldNullable(fam.marriageDate, KEY_B)).toBe('1975-03-10');
    expect(decryptFieldNullable(fam.marriagePlace, KEY_B)).toBe('دمشق');
    expect(() => decryptFieldNullable(fam.marriageDate, KEY_A)).toThrow();
  });

  test('empty pointed subtree does not call createMany', async () => {
    const emptyCopy = {
      individuals: {},
      families: {},
      idMap: new Map<string, string>(),
      stitchFamily: null,
      reuseStitch: null,
    };

    const individualCreateMany = vi.fn();
    const familyCreateMany = vi.fn();
    const mockTx = {
      individual: { createMany: individualCreateMany },
      family: { createMany: familyCreateMany, create: vi.fn() },
      familyChild: { create: vi.fn() },
    };

    await persistDeepCopy(mockTx, 'tree-B', emptyCopy, KEY_B);

    expect(individualCreateMany).not.toHaveBeenCalled();
    expect(familyCreateMany).not.toHaveBeenCalled();
  });
});

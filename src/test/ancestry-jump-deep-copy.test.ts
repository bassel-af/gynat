/**
 * «قفزة نسب» — deep copy and tree snapshot (spec §9.4).
 *
 * Two rules, both fail-closed:
 *
 *  1. BOTH ENDPOINTS OR NOTHING. A jump is copied only when its descendant AND
 *     its ancestor family both landed in the copied set. `extractSubtree` /
 *     `extractPointedSubtree` are downward-only, so a jump ancestor sitting
 *     ABOVE the copied root is never in the set — the jump is dropped rather
 *     than left pointing at a family that does not exist in the target
 *     workspace.
 *
 *  2. NO STALE BACK-REFERENCES. Both copiers build a record by spreading the
 *     source (`{...ind}` / `{...fam}`), which would carry
 *     `ancestryJumpAsDescendant` / `ancestryJumpsAsAncestor` through holding the
 *     OLD jump ids. They are deleted, not remapped: `dbTreeToGedcomData`
 *     regenerates both from the persisted rows on the next read.
 */
import { describe, test, expect, vi } from 'vitest';
import type { GedcomData, Individual, Family, AncestryJump } from '@/lib/gedcom/types';
import { prepareDeepCopy, persistDeepCopy } from '@/lib/tree/branch-pointer-deep-copy';
import { prepareTreeSnapshot } from '@/lib/collections/copy';
import { extractSubtree } from '@/lib/gedcom/graph';
import { decryptField } from '@/lib/crypto/workspace-encryption';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function ind(overrides: Partial<Individual> & { id: string }): Individual {
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
    kunya: '',
    notes: '',
    isDeceased: true,
    isPrivate: false,
    familiesAsSpouse: [],
    familyAsChild: null,
    ...overrides,
  };
}

const EMPTY_EVENT = { date: '', hijriDate: '', place: '', description: '', notes: '' };

function fam(overrides: Partial<Family> & { id: string }): Family {
  return {
    type: 'FAM',
    husband: null,
    wife: null,
    children: [],
    marriageContract: { ...EMPTY_EVENT },
    marriage: { ...EMPTY_EVENT },
    divorce: { ...EMPTY_EVENT },
    isDivorced: false,
    ...overrides,
  };
}

function jump(overrides: Partial<AncestryJump> & { id: string }): AncestryJump {
  return {
    type: '_ANC_JUMP',
    descendant: 'adnan',
    ancestorFamily: 'f-ish',
    generationsMin: 4,
    generationsMax: 40,
    notes: 'قفزة نسب موثّقة',
    ...overrides,
  };
}

/**
 * A self-contained payload holding BOTH ends of the jump:
 *   إسماعيل × هاجر (f-ish) ⇠ عدنان ⇢ his own family with معد.
 */
function wholeTree(): GedcomData {
  const individuals: Record<string, Individual> = {
    ish: ind({ id: 'ish', name: 'إسماعيل', familiesAsSpouse: ['f-ish'] }),
    hagar: ind({ id: 'hagar', name: 'هاجر', sex: 'F', familiesAsSpouse: ['f-ish'] }),
    adnan: ind({
      id: 'adnan',
      name: 'عدنان',
      familiesAsSpouse: ['f-adnan'],
      ancestryJumpAsDescendant: 'j1',
    }),
    maadd: ind({ id: 'maadd', name: 'معد', familyAsChild: 'f-adnan' }),
  };
  const families: Record<string, Family> = {
    'f-ish': fam({ id: 'f-ish', husband: 'ish', wife: 'hagar', ancestryJumpsAsAncestor: ['j1'] }),
    'f-adnan': fam({ id: 'f-adnan', husband: 'adnan', children: ['maadd'] }),
  };
  return { individuals, families, ancestryJumps: { j1: jump({ id: 'j1' }) } };
}

const CHILD_COPY = {
  anchorIndividualId: 'anchor-1',
  relationship: 'child' as const,
  pointerId: 'ptr-1',
};

// ===========================================================================
// prepareDeepCopy
// ===========================================================================

describe('prepareDeepCopy — «قفزة نسب»', () => {
  test('copies a jump whose two endpoints are both inside the copied set', () => {
    const result = prepareDeepCopy(wholeTree(), CHILD_COPY);
    expect(Object.keys(result.ancestryJumps)).toHaveLength(1);
  });

  test('remaps both endpoints and the jump id to the new UUIDs', () => {
    const source = wholeTree();
    const result = prepareDeepCopy(source, CHILD_COPY);
    const copied = Object.values(result.ancestryJumps)[0];

    expect(copied.id).not.toBe('j1');
    expect(copied.descendant).toBe(result.idMap.get('adnan'));
    expect(copied.ancestorFamily).toBe(result.idMap.get('f-ish'));
    expect(result.ancestryJumps[copied.id]).toBe(copied);
  });

  test('carries the range and the notes across', () => {
    const copied = Object.values(prepareDeepCopy(wholeTree(), CHILD_COPY).ancestryJumps)[0];
    expect(copied.generationsMin).toBe(4);
    expect(copied.generationsMax).toBe(40);
    expect(copied.notes).toBe('قفزة نسب موثّقة');
  });

  test('drops a jump whose ancestor family is outside the copied set', () => {
    const source = wholeTree();
    delete source.families['f-ish'];
    delete source.individuals.ish;
    delete source.individuals.hagar;
    expect(prepareDeepCopy(source, CHILD_COPY).ancestryJumps).toEqual({});
  });

  test('drops a jump whose descendant is outside the copied set', () => {
    const source = wholeTree();
    delete source.individuals.adnan;
    expect(prepareDeepCopy(source, CHILD_COPY).ancestryJumps).toEqual({});
  });

  test('returns an empty map (never undefined) when the source has no jumps', () => {
    const source = wholeTree();
    delete source.ancestryJumps;
    expect(prepareDeepCopy(source, CHILD_COPY).ancestryJumps).toEqual({});
  });

  test('strips the stale descendant back-reference from every copied individual', () => {
    const result = prepareDeepCopy(wholeTree(), CHILD_COPY);
    for (const person of Object.values(result.individuals)) {
      expect(person.ancestryJumpAsDescendant).toBeUndefined();
    }
  });

  test('strips the stale ancestor back-reference from every copied family', () => {
    const result = prepareDeepCopy(wholeTree(), CHILD_COPY);
    for (const family of Object.values(result.families)) {
      expect(family.ancestryJumpsAsAncestor).toBeUndefined();
    }
  });

  test('does not mutate the source payload', () => {
    const source = wholeTree();
    prepareDeepCopy(source, CHILD_COPY);
    expect(source.individuals.adnan.ancestryJumpAsDescendant).toBe('j1');
    expect(source.families['f-ish'].ancestryJumpsAsAncestor).toEqual(['j1']);
    expect(source.ancestryJumps?.j1.id).toBe('j1');
  });
});

// ===========================================================================
// prepareTreeSnapshot (collections copy of a WHOLE own tree)
// ===========================================================================

describe('prepareTreeSnapshot — «قفزة نسب»', () => {
  test('carries the jump when the whole tree is snapshot', () => {
    const source = wholeTree();
    const snapshot = prepareTreeSnapshot(source);
    const copied = Object.values(snapshot.ancestryJumps)[0];

    expect(Object.keys(snapshot.ancestryJumps)).toHaveLength(1);
    expect(copied.descendant).toBe(snapshot.idMap.get('adnan'));
    expect(copied.ancestorFamily).toBe(snapshot.idMap.get('f-ish'));
  });

  test('strips the stale back-references from individuals and families', () => {
    const snapshot = prepareTreeSnapshot(wholeTree());
    for (const person of Object.values(snapshot.individuals)) {
      expect(person.ancestryJumpAsDescendant).toBeUndefined();
    }
    for (const family of Object.values(snapshot.families)) {
      expect(family.ancestryJumpsAsAncestor).toBeUndefined();
    }
  });

  test('returns an empty map when the tree has no jumps', () => {
    const source = wholeTree();
    delete source.ancestryJumps;
    expect(prepareTreeSnapshot(source).ancestryJumps).toEqual({});
  });
});

// ===========================================================================
// A branch copy: the ancestor sits ABOVE the copied root
// ===========================================================================

describe('branch copies drop a jump that points above the copied root', () => {
  test('extractSubtree from the jump descendant carries no jump rows', () => {
    const extracted = extractSubtree(wholeTree(), 'adnan');
    expect(extracted.ancestryJumps).toBeUndefined();
  });

  test('snapshotting that extract produces no jumps (the ancestor is out of set)', () => {
    const extracted = extractSubtree(wholeTree(), 'adnan');
    expect(prepareTreeSnapshot(extracted).ancestryJumps).toEqual({});
  });

  test('the extracted branch carries no stale back-reference into the copy', () => {
    // `extractSubtree` spreads the source individual, so the back-reference
    // survives the extract — the copiers are what must scrub it.
    const snapshot = prepareTreeSnapshot(extractSubtree(wholeTree(), 'adnan'));
    for (const person of Object.values(snapshot.individuals)) {
      expect(person.ancestryJumpAsDescendant).toBeUndefined();
    }
  });
});

// ===========================================================================
// persistDeepCopy
// ===========================================================================

describe('persistDeepCopy — «قفزة نسب» rows', () => {
  const targetKey = Buffer.alloc(32, 9);

  function txMock() {
    return {
      individual: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      family: {
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      familyChild: { create: vi.fn().mockResolvedValue({}) },
      ancestryJump: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      copyProvenance: { create: vi.fn().mockResolvedValue({}) },
    };
  }

  test('writes one row per copied jump, scoped to the target tree', async () => {
    const tx = txMock();
    const copy = prepareDeepCopy(wholeTree(), CHILD_COPY);
    const copied = Object.values(copy.ancestryJumps)[0];

    await persistDeepCopy(tx, 'target-tree', copy, targetKey);

    expect(tx.ancestryJump.createMany).toHaveBeenCalledOnce();
    const rows = tx.ancestryJump.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: copied.id,
      treeId: 'target-tree',
      descendantId: copied.descendant,
      ancestorFamilyId: copied.ancestorFamily,
      generationsMin: 4,
      generationsMax: 40,
    });
  });

  test('re-encrypts the notes under the TARGET workspace key', async () => {
    const tx = txMock();
    const copy = prepareDeepCopy(wholeTree(), CHILD_COPY);

    await persistDeepCopy(tx, 'target-tree', copy, targetKey);

    const { notes } = tx.ancestryJump.createMany.mock.calls[0][0].data[0];
    expect(Buffer.isBuffer(notes)).toBe(true);
    expect(decryptField(notes, targetKey)).toBe('قفزة نسب موثّقة');
  });

  test('stores null notes rather than an empty ciphertext', async () => {
    const tx = txMock();
    const source = wholeTree();
    source.ancestryJumps!.j1.notes = '';
    const copy = prepareDeepCopy(source, CHILD_COPY);

    await persistDeepCopy(tx, 'target-tree', copy, targetKey);

    expect(tx.ancestryJump.createMany.mock.calls[0][0].data[0].notes).toBeNull();
  });

  test('writes nothing when there are no jumps to copy', async () => {
    const tx = txMock();
    const source = wholeTree();
    delete source.ancestryJumps;

    await persistDeepCopy(tx, 'target-tree', prepareDeepCopy(source, CHILD_COPY), targetKey);

    expect(tx.ancestryJump.createMany).not.toHaveBeenCalled();
  });
});

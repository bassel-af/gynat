/**
 * «قفزة نسب» — DB → `GedcomData` mapping.
 *
 * Covers: `dbTreeToGedcomData` emitting `ancestryJumps` plus BOTH
 * back-references; the dangling-reference rule (a jump whose endpoint is not in
 * the payload is emitted but leaves no back-reference and breaks nothing);
 * `notes` round-tripping through AES-256-GCM; and `redactPrivateIndividuals`
 * passing jumps through untouched (the MEMBER surface keeps them — public is a
 * different path and a different chunk).
 */
import { describe, test, expect } from 'vitest';
import {
  dbTreeToGedcomData,
  redactPrivateIndividuals,
  mapAncestryJump,
  type DbTree,
  type DbIndividual,
  type DbFamily,
  type DbAncestryJump,
  type DecryptedAncestryJump,
} from '@/lib/tree/mapper';
import { encryptAncestryJumpInput, decryptAncestryJumpRow } from '@/lib/tree/encryption';
import { encryptField } from '@/lib/crypto/workspace-encryption';

const KEY = Buffer.alloc(32, 7);

// ---------------------------------------------------------------------------
// DB row builders — encrypted fields must be real ciphertext under KEY.
// ---------------------------------------------------------------------------

function enc(value: string | null): Buffer | null {
  return value === null ? null : encryptField(value, KEY);
}

function dbIndividual(id: string, givenName: string): DbIndividual {
  return {
    id,
    treeId: 'tree-1',
    gedcomId: null,
    givenName: enc(givenName),
    surname: null,
    fullName: null,
    sex: 'M',
    birthDate: null,
    birthPlace: null,
    birthPlaceId: null,
    birthPlaceRef: null,
    birthDescription: null,
    birthNotes: null,
    birthHijriDate: null,
    deathDate: null,
    deathPlace: null,
    deathPlaceId: null,
    deathPlaceRef: null,
    deathDescription: null,
    deathNotes: null,
    deathHijriDate: null,
    kunya: null,
    notes: null,
    isDeceased: false,
    isPrivate: false,
  } as unknown as DbIndividual;
}

function dbFamily(id: string, husbandId: string | null, wifeId: string | null): DbFamily {
  return {
    id,
    treeId: 'tree-1',
    gedcomId: null,
    husbandId,
    wifeId,
    children: [],
    isDivorced: false,
    isUmmWalad: false,
    marriageContractDate: null,
    marriageContractHijriDate: null,
    marriageContractPlace: null,
    marriageContractPlaceId: null,
    marriageContractPlaceRef: null,
    marriageContractDescription: null,
    marriageContractNotes: null,
    marriageDate: null,
    marriageHijriDate: null,
    marriagePlace: null,
    marriagePlaceId: null,
    marriagePlaceRef: null,
    marriageDescription: null,
    marriageNotes: null,
    divorceDate: null,
    divorceHijriDate: null,
    divorcePlace: null,
    divorcePlaceId: null,
    divorcePlaceRef: null,
    divorceDescription: null,
    divorceNotes: null,
  } as unknown as DbFamily;
}

function dbJump(overrides: Partial<DbAncestryJump> & { id: string }): DbAncestryJump {
  return {
    treeId: 'tree-1',
    gedcomId: null,
    descendantId: 'ADNAN',
    ancestorFamilyId: 'FAM-ISH',
    generationsMin: null,
    generationsMax: null,
    notes: null,
    createdAt: new Date('2026-09-22T00:00:00.000Z'),
    ...overrides,
  } as DbAncestryJump;
}

function baseTree(jumps: DbAncestryJump[]): DbTree {
  return {
    id: 'tree-1',
    workspaceId: 'ws-1',
    individuals: [
      dbIndividual('ISH', 'إسماعيل'),
      dbIndividual('HAJAR', 'هاجر'),
      dbIndividual('ADNAN', 'عدنان'),
    ],
    families: [dbFamily('FAM-ISH', 'ISH', 'HAJAR')],
    ancestryJumps: jumps,
  };
}

// ---------------------------------------------------------------------------
// mapAncestryJump
// ---------------------------------------------------------------------------

describe('mapAncestryJump', () => {
  test('maps a decrypted row to the GedcomData shape', () => {
    const row: DecryptedAncestryJump = {
      id: 'J1',
      treeId: 'tree-1',
      gedcomId: null,
      descendantId: 'ADNAN',
      ancestorFamilyId: 'FAM-ISH',
      generationsMin: 4,
      generationsMax: 40,
      notes: 'عدنان من وَلَد إسماعيل',
      createdAt: new Date(),
    };
    expect(mapAncestryJump(row)).toEqual({
      id: 'J1',
      type: '_ANC_JUMP',
      descendant: 'ADNAN',
      ancestorFamily: 'FAM-ISH',
      generationsMin: 4,
      generationsMax: 40,
      notes: 'عدنان من وَلَد إسماعيل',
    });
  });

  test('null notes become an empty string', () => {
    const row = {
      id: 'J1',
      treeId: 'tree-1',
      gedcomId: null,
      descendantId: 'ADNAN',
      ancestorFamilyId: 'FAM-ISH',
      generationsMin: null,
      generationsMax: null,
      notes: null,
      createdAt: new Date(),
    } satisfies DecryptedAncestryJump;
    expect(mapAncestryJump(row).notes).toBe('');
  });
});

// ---------------------------------------------------------------------------
// dbTreeToGedcomData
// ---------------------------------------------------------------------------

describe('dbTreeToGedcomData — ancestryJumps', () => {
  test('emits the jump keyed by id', () => {
    const data = dbTreeToGedcomData(baseTree([dbJump({ id: 'J1' })]), KEY);
    expect(data.ancestryJumps).toBeDefined();
    expect(Object.keys(data.ancestryJumps!)).toEqual(['J1']);
    expect(data.ancestryJumps!.J1.type).toBe('_ANC_JUMP');
  });

  test('sets the descendant back-reference on the individual', () => {
    const data = dbTreeToGedcomData(baseTree([dbJump({ id: 'J1' })]), KEY);
    expect(data.individuals.ADNAN.ancestryJumpAsDescendant).toBe('J1');
  });

  test('sets the ancestor back-reference on the family', () => {
    const data = dbTreeToGedcomData(baseTree([dbJump({ id: 'J1' })]), KEY);
    expect(data.families['FAM-ISH'].ancestryJumpsAsAncestor).toEqual(['J1']);
  });

  test('accumulates several jumps hanging off the same ancestor family', () => {
    const tree = baseTree([
      dbJump({ id: 'J1', descendantId: 'ADNAN' }),
      dbJump({ id: 'J2', descendantId: 'HAJAR' }),
    ]);
    const data = dbTreeToGedcomData(tree, KEY);
    expect(data.families['FAM-ISH'].ancestryJumpsAsAncestor).toEqual(['J1', 'J2']);
  });

  test('omits the ancestryJumps key entirely when there are no jumps', () => {
    const data = dbTreeToGedcomData(baseTree([]), KEY);
    expect(data.ancestryJumps).toBeUndefined();
  });

  test('a tree with no ancestryJumps field at all still maps', () => {
    const tree = baseTree([]);
    delete tree.ancestryJumps;
    const data = dbTreeToGedcomData(tree, KEY);
    expect(data.ancestryJumps).toBeUndefined();
    expect(Object.keys(data.individuals)).toHaveLength(3);
  });

  test('round-trips encrypted notes back to plaintext', () => {
    const { notes } = encryptAncestryJumpInput({ notes: 'قيل سبعة، وقيل أربعون' }, KEY);
    const data = dbTreeToGedcomData(baseTree([dbJump({ id: 'J1', notes })]), KEY);
    expect(data.ancestryJumps!.J1.notes).toBe('قيل سبعة، وقيل أربعون');
  });

  test('carries the generation range through', () => {
    const tree = baseTree([dbJump({ id: 'J1', generationsMin: 4, generationsMax: 40 })]);
    const data = dbTreeToGedcomData(tree, KEY);
    expect(data.ancestryJumps!.J1.generationsMin).toBe(4);
    expect(data.ancestryJumps!.J1.generationsMax).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// Dangling references — a borrowed/extracted subtree can lose an endpoint.
// ---------------------------------------------------------------------------

describe('dbTreeToGedcomData — dangling jumps are inert', () => {
  test('a jump whose descendant is absent is still emitted, with no back-reference', () => {
    const tree = baseTree([dbJump({ id: 'J1', descendantId: 'GHOST' })]);
    const data = dbTreeToGedcomData(tree, KEY);
    expect(data.ancestryJumps!.J1.descendant).toBe('GHOST');
    expect(data.individuals.GHOST).toBeUndefined();
    // The ancestor side still binds.
    expect(data.families['FAM-ISH'].ancestryJumpsAsAncestor).toEqual(['J1']);
  });

  test('a jump whose ancestor family is absent is still emitted, with no back-reference', () => {
    const tree = baseTree([dbJump({ id: 'J1', ancestorFamilyId: 'GHOST-FAM' })]);
    const data = dbTreeToGedcomData(tree, KEY);
    expect(data.ancestryJumps!.J1.ancestorFamily).toBe('GHOST-FAM');
    expect(data.families['GHOST-FAM']).toBeUndefined();
    expect(data.individuals.ADNAN.ancestryJumpAsDescendant).toBe('J1');
  });

  test('a fully dangling jump does not throw', () => {
    const tree = baseTree([
      dbJump({ id: 'J1', descendantId: 'GHOST', ancestorFamilyId: 'GHOST-FAM' }),
    ]);
    expect(() => dbTreeToGedcomData(tree, KEY)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Member redaction — jumps pass through untouched.
// ---------------------------------------------------------------------------

describe('redactPrivateIndividuals — ancestryJumps', () => {
  test('passes jumps through unchanged, notes included', () => {
    const data = dbTreeToGedcomData(
      baseTree([
        dbJump({ id: 'J1', notes: encryptAncestryJumpInput({ notes: 'سرّي' }, KEY).notes }),
      ]),
      KEY,
    );
    data.individuals.ISH.isPrivate = true;

    const redacted = redactPrivateIndividuals(data);
    expect(redacted.ancestryJumps).toEqual(data.ancestryJumps);
    expect(redacted.ancestryJumps!.J1.notes).toBe('سرّي');
  });

  test('omits the key when the source had no jumps', () => {
    const data = dbTreeToGedcomData(baseTree([]), KEY);
    expect(redactPrivateIndividuals(data).ancestryJumps).toBeUndefined();
  });

  test('the descendant back-reference survives member redaction', () => {
    const data = dbTreeToGedcomData(baseTree([dbJump({ id: 'J1' })]), KEY);
    data.individuals.ADNAN.isPrivate = true;
    const redacted = redactPrivateIndividuals(data);
    expect(redacted.individuals.ADNAN.ancestryJumpAsDescendant).toBe('J1');
  });
});

// ---------------------------------------------------------------------------
// Encryption adapter
// ---------------------------------------------------------------------------

describe('ancestry jump encryption helpers', () => {
  test('encrypts notes to bytes and decrypts back', () => {
    const encrypted = encryptAncestryJumpInput({ notes: 'نصّ' }, KEY);
    expect(Buffer.isBuffer(encrypted.notes)).toBe(true);
    const back = decryptAncestryJumpRow({ notes: encrypted.notes }, KEY);
    expect(back.notes).toBe('نصّ');
  });

  test('null notes stay null through both directions', () => {
    const encrypted = encryptAncestryJumpInput({ notes: null }, KEY);
    expect(encrypted.notes).toBeNull();
    expect(decryptAncestryJumpRow({ notes: null }, KEY).notes).toBeNull();
  });

  test('leaves non-encrypted fields untouched', () => {
    const out = encryptAncestryJumpInput(
      { notes: 'x', generationsMin: 4, descendantId: 'ADNAN' },
      KEY,
    );
    expect(out.generationsMin).toBe(4);
    expect(out.descendantId).toBe('ADNAN');
  });
});

/**
 * Tests for src/lib/tree/encryption.ts — the domain-level encryption adapter.
 *
 * These are pure-function tests. They never touch Prisma. The DB-backed
 * functions `getOrCreateWorkspaceKey` / `getWorkspaceKey` are covered by
 * integration tests elsewhere (workspace-create-encryption + tree route tests).
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { generateWorkspaceKey } from '@/lib/crypto/workspace-encryption';
import {
  INDIVIDUAL_ENCRYPTED_FIELDS,
  FAMILY_ENCRYPTED_FIELDS,
  RADA_FAMILY_ENCRYPTED_FIELDS,
  encryptIndividualInput,
  decryptIndividualRow,
  encryptFamilyInput,
  decryptFamilyRow,
  encryptRadaFamilyInput,
  decryptRadaFamilyRow,
  encryptSnapshot,
  decryptSnapshot,
  encryptDescription,
  decryptDescription,
} from '@/lib/tree/encryption';

let key: Buffer;
let otherKey: Buffer;

beforeAll(() => {
  key = generateWorkspaceKey();
  otherKey = generateWorkspaceKey();
});

// ---------------------------------------------------------------------------
// Field-list constants (compile-time safety / source of truth)
// ---------------------------------------------------------------------------

describe('field lists', () => {
  test('INDIVIDUAL_ENCRYPTED_FIELDS contains exactly the 16 sensitive fields', () => {
    expect([...INDIVIDUAL_ENCRYPTED_FIELDS].sort()).toEqual(
      [
        'givenName',
        'surname',
        'fullName',
        'birthDate',
        'birthPlace',
        'birthDescription',
        'birthNotes',
        'birthHijriDate',
        'deathDate',
        'deathPlace',
        'deathDescription',
        'deathNotes',
        'deathHijriDate',
        'kunya',
        'famousName',
        'notes',
      ].sort(),
    );
  });

  test('FAMILY_ENCRYPTED_FIELDS contains exactly the 15 event fields', () => {
    expect([...FAMILY_ENCRYPTED_FIELDS].sort()).toEqual(
      [
        'marriageContractDate',
        'marriageContractHijriDate',
        'marriageContractPlace',
        'marriageContractDescription',
        'marriageContractNotes',
        'marriageDate',
        'marriageHijriDate',
        'marriagePlace',
        'marriageDescription',
        'marriageNotes',
        'divorceDate',
        'divorceHijriDate',
        'divorcePlace',
        'divorceDescription',
        'divorceNotes',
      ].sort(),
    );
  });

  test('RADA_FAMILY_ENCRYPTED_FIELDS contains only notes', () => {
    expect([...RADA_FAMILY_ENCRYPTED_FIELDS]).toEqual(['notes']);
  });
});

// ---------------------------------------------------------------------------
// Individual encrypt/decrypt
// ---------------------------------------------------------------------------

describe('encryptIndividualInput / decryptIndividualRow', () => {
  test('encrypts listed fields to Buffers and leaves other fields untouched', () => {
    const input = {
      id: 'abc-123',
      treeId: 'tree-1',
      sex: 'M',
      isPrivate: false,
      isDeceased: true,
      givenName: 'أحمد',
      surname: 'الشربك',
      fullName: null,
      birthDate: '1990-01-01',
      birthHijriDate: null,
      birthPlace: 'دمشق',
      birthPlaceId: 'place-uuid',
      birthDescription: 'born at home',
      birthNotes: 'long notes here',
      deathDate: null,
      deathHijriDate: null,
      deathPlace: null,
      deathPlaceId: null,
      deathDescription: null,
      deathNotes: null,
      kunya: 'أبو محمد',
      notes: 'family patriarch',
    };

    const encrypted = encryptIndividualInput(input, key);

    // Plaintext scalars untouched
    expect(encrypted.id).toBe('abc-123');
    expect(encrypted.treeId).toBe('tree-1');
    expect(encrypted.sex).toBe('M');
    expect(encrypted.isPrivate).toBe(false);
    expect(encrypted.isDeceased).toBe(true);
    expect(encrypted.birthPlaceId).toBe('place-uuid');

    // Non-null encrypted fields are Buffers
    expect(Buffer.isBuffer(encrypted.givenName)).toBe(true);
    expect(Buffer.isBuffer(encrypted.surname)).toBe(true);
    expect(Buffer.isBuffer(encrypted.birthDate)).toBe(true);
    expect(Buffer.isBuffer(encrypted.birthPlace)).toBe(true);
    expect(Buffer.isBuffer(encrypted.birthDescription)).toBe(true);
    expect(Buffer.isBuffer(encrypted.birthNotes)).toBe(true);
    expect(Buffer.isBuffer(encrypted.kunya)).toBe(true);
    expect(Buffer.isBuffer(encrypted.notes)).toBe(true);

    // Null fields stay null
    expect(encrypted.fullName).toBeNull();
    expect(encrypted.birthHijriDate).toBeNull();
    expect(encrypted.deathDate).toBeNull();
    expect(encrypted.deathPlace).toBeNull();
    expect(encrypted.deathDescription).toBeNull();
    expect(encrypted.deathNotes).toBeNull();

    // Ciphertext is not identity — encrypted Arabic bytes are not the UTF-8 encoding
    const directUtf8 = Buffer.from('أحمد', 'utf8');
    expect(Buffer.isBuffer(encrypted.givenName) ? encrypted.givenName.equals(directUtf8) : false).toBe(false);
  });

  test('does not mutate the input object', () => {
    const input = {
      id: '1',
      givenName: 'أحمد',
      notes: 'hi',
      fullName: null,
    };
    const originalGiven = input.givenName;
    encryptIndividualInput(input, key);
    expect(input.givenName).toBe(originalGiven);
    expect(input.fullName).toBeNull();
  });

  test('roundtrip: encrypt then decrypt recovers all strings', () => {
    const input = {
      id: 'abc',
      treeId: 'tree-1',
      sex: 'F',
      isPrivate: true,
      isDeceased: false,
      givenName: 'فاطمة',
      surname: null,
      fullName: 'فاطمة بنت محمد',
      birthDate: '2000-03-14',
      birthHijriDate: '1420-11-08',
      birthPlace: 'Aleppo، Syria',
      birthPlaceId: null,
      birthDescription: '',
      birthNotes: 'Note with \n newline and "quotes"',
      deathDate: null,
      deathHijriDate: null,
      deathPlace: null,
      deathPlaceId: null,
      deathDescription: null,
      deathNotes: null,
      kunya: null,
      notes: null,
    };

    const encrypted = encryptIndividualInput(input, key);
    const decrypted = decryptIndividualRow(encrypted, key);

    // Note: empty strings are coerced to null by encryptFieldNullable semantics
    expect(decrypted.givenName).toBe('فاطمة');
    expect(decrypted.surname).toBeNull();
    expect(decrypted.fullName).toBe('فاطمة بنت محمد');
    expect(decrypted.birthDate).toBe('2000-03-14');
    expect(decrypted.birthHijriDate).toBe('1420-11-08');
    expect(decrypted.birthPlace).toBe('Aleppo، Syria');
    expect(decrypted.birthDescription).toBeNull(); // '' was coerced to null
    expect(decrypted.birthNotes).toBe('Note with \n newline and "quotes"');
    expect(decrypted.deathDate).toBeNull();
    expect(decrypted.kunya).toBeNull();
    expect(decrypted.notes).toBeNull();

    // Plaintext scalars preserved
    expect(decrypted.id).toBe('abc');
    expect(decrypted.sex).toBe('F');
    expect(decrypted.isPrivate).toBe(true);
    expect(decrypted.isDeceased).toBe(false);
  });

  test('decryptIndividualRow accepts Uint8Array values (Prisma driver returns these)', () => {
    const encrypted = encryptIndividualInput(
      { id: '1', givenName: 'عمر', notes: null },
      key,
    );
    // Simulate Prisma returning Uint8Array instead of Buffer
    const asUint8 = {
      ...encrypted,
      givenName: encrypted.givenName ? new Uint8Array(encrypted.givenName) : null,
    };
    const decrypted = decryptIndividualRow(asUint8, key);
    expect(decrypted.givenName).toBe('عمر');
  });

  test('decryptIndividualRow throws on wrong key', () => {
    const encrypted = encryptIndividualInput(
      { id: '1', givenName: 'hi', notes: null },
      key,
    );
    expect(() => decryptIndividualRow(encrypted, otherKey)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Family encrypt/decrypt
// ---------------------------------------------------------------------------

describe('encryptFamilyInput / decryptFamilyRow', () => {
  test('roundtrip preserves all 15 event fields and leaves plaintext scalars', () => {
    const input = {
      id: 'fam-1',
      treeId: 'tree-1',
      husbandId: 'h-1',
      wifeId: 'w-1',
      marriageContractPlaceId: null,
      marriagePlaceId: 'place-1',
      divorcePlaceId: null,
      isUmmWalad: false,
      isDivorced: true,

      marriageContractDate: '1980-01-01',
      marriageContractHijriDate: null,
      marriageContractPlace: 'Damascus',
      marriageContractDescription: 'contract notes',
      marriageContractNotes: null,

      marriageDate: '1980-06-15',
      marriageHijriDate: '1400-08-01',
      marriagePlace: null,
      marriageDescription: null,
      marriageNotes: 'big wedding',

      divorceDate: '1995-12-31',
      divorceHijriDate: null,
      divorcePlace: 'Aleppo',
      divorceDescription: null,
      divorceNotes: null,
    };

    const encrypted = encryptFamilyInput(input, key);

    // IDs and booleans pass through
    expect(encrypted.id).toBe('fam-1');
    expect(encrypted.husbandId).toBe('h-1');
    expect(encrypted.wifeId).toBe('w-1');
    expect(encrypted.isUmmWalad).toBe(false);
    expect(encrypted.isDivorced).toBe(true);
    expect(encrypted.marriagePlaceId).toBe('place-1');

    // Non-null event fields are Buffers
    expect(Buffer.isBuffer(encrypted.marriageContractDate)).toBe(true);
    expect(Buffer.isBuffer(encrypted.marriageContractPlace)).toBe(true);
    expect(Buffer.isBuffer(encrypted.marriageContractDescription)).toBe(true);
    expect(Buffer.isBuffer(encrypted.marriageDate)).toBe(true);
    expect(Buffer.isBuffer(encrypted.marriageHijriDate)).toBe(true);
    expect(Buffer.isBuffer(encrypted.marriageNotes)).toBe(true);
    expect(Buffer.isBuffer(encrypted.divorceDate)).toBe(true);
    expect(Buffer.isBuffer(encrypted.divorcePlace)).toBe(true);

    // Null event fields stay null
    expect(encrypted.marriageContractHijriDate).toBeNull();
    expect(encrypted.marriageContractNotes).toBeNull();
    expect(encrypted.marriagePlace).toBeNull();
    expect(encrypted.marriageDescription).toBeNull();
    expect(encrypted.divorceHijriDate).toBeNull();
    expect(encrypted.divorceDescription).toBeNull();
    expect(encrypted.divorceNotes).toBeNull();

    const decrypted = decryptFamilyRow(encrypted, key);
    expect(decrypted.marriageContractDate).toBe('1980-01-01');
    expect(decrypted.marriageContractPlace).toBe('Damascus');
    expect(decrypted.marriageContractDescription).toBe('contract notes');
    expect(decrypted.marriageDate).toBe('1980-06-15');
    expect(decrypted.marriageHijriDate).toBe('1400-08-01');
    expect(decrypted.marriageNotes).toBe('big wedding');
    expect(decrypted.divorceDate).toBe('1995-12-31');
    expect(decrypted.divorcePlace).toBe('Aleppo');
    expect(decrypted.marriagePlace).toBeNull();
    expect(decrypted.marriageDescription).toBeNull();
    expect(decrypted.divorceDescription).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// RadaFamily
// ---------------------------------------------------------------------------

describe('encryptRadaFamilyInput / decryptRadaFamilyRow', () => {
  test('encrypts only notes, other fields pass through', () => {
    const input = {
      id: 'rada-1',
      treeId: 'tree-1',
      fosterFatherId: 'f-1',
      fosterMotherId: 'm-1',
      notes: 'milk kinship notes',
    };
    const encrypted = encryptRadaFamilyInput(input, key);
    expect(encrypted.id).toBe('rada-1');
    expect(encrypted.fosterFatherId).toBe('f-1');
    expect(encrypted.fosterMotherId).toBe('m-1');
    expect(Buffer.isBuffer(encrypted.notes)).toBe(true);

    const decrypted = decryptRadaFamilyRow(encrypted, key);
    expect(decrypted.notes).toBe('milk kinship notes');
  });

  test('null notes stay null', () => {
    const input = {
      id: 'rada-1',
      treeId: 'tree-1',
      fosterFatherId: null,
      fosterMotherId: 'm-1',
      notes: null,
    };
    const encrypted = encryptRadaFamilyInput(input, key);
    expect(encrypted.notes).toBeNull();
    const decrypted = decryptRadaFamilyRow(encrypted, key);
    expect(decrypted.notes).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Snapshot envelope
// ---------------------------------------------------------------------------

describe('encryptSnapshot / decryptSnapshot', () => {
  test('null snapshot returns null', () => {
    expect(encryptSnapshot(null, key)).toBeNull();
    expect(decryptSnapshot(null, key)).toBeNull();
  });

  test('roundtrip preserves nested object with arrays', () => {
    const snapshot = {
      id: 'fam-1',
      husbandId: 'h-1',
      wifeId: null,
      childrenIds: ['c-1', 'c-2', 'c-3'],
      marriageDate: '1980-06-15',
      marriagePlace: 'Damascus، Syria',
      isDivorced: false,
    };
    const envelope = encryptSnapshot(snapshot, key);
    expect(envelope).not.toBeNull();
    expect(envelope?._encrypted).toBe(true);
    expect(typeof envelope?.data).toBe('string');
    // base64 of any GCM output starts with non-readable chars; just check it's not the raw JSON
    expect(envelope?.data).not.toContain('fam-1');

    const decrypted = decryptSnapshot<typeof snapshot>(envelope, key);
    expect(decrypted).toEqual(snapshot);
    expect(decrypted?.childrenIds).toEqual(['c-1', 'c-2', 'c-3']);
  });

  test('decryptSnapshot passes through legacy non-envelope data unchanged', () => {
    // Legacy pre-Phase-10b log rows have snapshot as a plain object.
    const legacy = { id: 'x', givenName: 'legacy' };
    const result = decryptSnapshot(legacy, key);
    expect(result).toEqual(legacy);
  });

  test('decryptSnapshot throws on envelope with wrong key', () => {
    const envelope = encryptSnapshot({ a: 1 }, key);
    expect(() => decryptSnapshot(envelope, otherKey)).toThrow();
  });

  test('decryptSnapshot throws on tampered envelope data', () => {
    const envelope = encryptSnapshot({ a: 1 }, key);
    if (!envelope) throw new Error('expected envelope');
    const tampered = { _encrypted: true as const, data: envelope.data.slice(0, -4) + 'XXXX' };
    expect(() => decryptSnapshot(tampered, key)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// TreeEditLog description
// ---------------------------------------------------------------------------

describe('encryptDescription / decryptDescription', () => {
  test('roundtrip for Arabic description', () => {
    const desc = 'إضافة شخص "أحمد"';
    const encrypted = encryptDescription(desc, key);
    expect(Buffer.isBuffer(encrypted)).toBe(true);
    expect(decryptDescription(encrypted, key)).toBe(desc);
  });

  test('null in, null out', () => {
    expect(encryptDescription(null, key)).toBeNull();
    expect(decryptDescription(null, key)).toBeNull();
  });

  test('wrong key throws', () => {
    const encrypted = encryptDescription('hi', key);
    expect(() => decryptDescription(encrypted, otherKey)).toThrow();
  });
});

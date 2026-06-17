import { describe, test, expect } from 'vitest';
import {
  individualFieldsSchema,
  createIndividualSchema,
  updateIndividualSchema,
  familyEventFieldsSchema,
  createFamilySchema,
  updateFamilySchema,
  createRadaFamilySchema,
  updateRadaFamilySchema,
} from '@/lib/tree/schemas';

// ============================================================================
// individualFieldsSchema — shared string fields
// ============================================================================
describe('individualFieldsSchema', () => {
  test('accepts all fields as strings', () => {
    const result = individualFieldsSchema.safeParse({
      givenName: 'محمد',
      surname: 'السعيد',
      fullName: 'محمد السعيد',
      sex: 'M',
      birthDate: '1950',
      birthPlace: 'الرياض',
      notes: 'ملاحظات',
    });
    expect(result.success).toBe(true);
  });

  test('accepts null for all string fields', () => {
    const result = individualFieldsSchema.safeParse({
      givenName: null,
      surname: null,
      birthDate: null,
      birthPlace: null,
      notes: null,
    });
    expect(result.success).toBe(true);
  });

  test('accepts empty object (all fields optional)', () => {
    const result = individualFieldsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  test('enforces max length on givenName (200)', () => {
    const result = individualFieldsSchema.safeParse({
      givenName: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  test('enforces max length on notes (5000)', () => {
    const result = individualFieldsSchema.safeParse({
      notes: 'a'.repeat(5001),
    });
    expect(result.success).toBe(false);
  });

  test('rejects invalid sex value', () => {
    const result = individualFieldsSchema.safeParse({
      sex: 'X',
    });
    expect(result.success).toBe(false);
  });

  test('accepts kunya as a string with max 200 chars', () => {
    const result = individualFieldsSchema.safeParse({
      kunya: 'أبو أحمد',
    });
    expect(result.success).toBe(true);
  });

  test('accepts kunya as null', () => {
    const result = individualFieldsSchema.safeParse({
      kunya: null,
    });
    expect(result.success).toBe(true);
  });

  test('enforces max length on kunya (200)', () => {
    const result = individualFieldsSchema.safeParse({
      kunya: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// createIndividualSchema — requires givenName or fullName
// ============================================================================
describe('createIndividualSchema', () => {
  test('requires givenName or fullName', () => {
    const result = createIndividualSchema.safeParse({ sex: 'M' });
    expect(result.success).toBe(false);
  });

  test('requires sex', () => {
    const result = createIndividualSchema.safeParse({ givenName: 'محمد' });
    expect(result.success).toBe(false);
  });

  test('rejects null sex', () => {
    const result = createIndividualSchema.safeParse({ givenName: 'محمد', sex: null });
    expect(result.success).toBe(false);
  });

  test('accepts givenName with sex', () => {
    const result = createIndividualSchema.safeParse({ givenName: 'محمد', sex: 'M' });
    expect(result.success).toBe(true);
  });

  test('accepts fullName with sex', () => {
    const result = createIndividualSchema.safeParse({ fullName: 'محمد بن عبدالله', sex: 'F' });
    expect(result.success).toBe(true);
  });

  test('defaults isPrivate to false', () => {
    const result = createIndividualSchema.safeParse({ givenName: 'محمد', sex: 'M' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isPrivate).toBe(false);
    }
  });
});

// ============================================================================
// updateIndividualSchema — all fields optional, null allowed
// ============================================================================
describe('updateIndividualSchema', () => {
  test('accepts empty object', () => {
    const result = updateIndividualSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  test('accepts null for string fields', () => {
    const result = updateIndividualSchema.safeParse({
      birthDate: null,
      birthPlace: null,
      notes: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.birthDate).toBeNull();
      expect(result.data.birthPlace).toBeNull();
      expect(result.data.notes).toBeNull();
    }
  });

  test('accepts valid sex value', () => {
    const result = updateIndividualSchema.safeParse({ sex: 'F' });
    expect(result.success).toBe(true);
  });

  test('rejects null sex', () => {
    const result = updateIndividualSchema.safeParse({ sex: null });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// familyEventFieldsSchema — shared marriage/divorce fields
// ============================================================================
describe('familyEventFieldsSchema', () => {
  test('accepts all marriage fields', () => {
    const result = familyEventFieldsSchema.safeParse({
      marriageContractDate: '2020-01-01',
      marriageContractHijriDate: '1441/05/06',
      marriageContractPlace: 'Riyadh',
      marriageDate: '2020-03-15',
      marriagePlace: 'Jeddah',
    });
    expect(result.success).toBe(true);
  });

  test('accepts null for all fields', () => {
    const result = familyEventFieldsSchema.safeParse({
      marriageContractDate: null,
      marriageDate: null,
      divorceDate: null,
    });
    expect(result.success).toBe(true);
  });

  test('enforces max length on marriageDescription (500)', () => {
    const result = familyEventFieldsSchema.safeParse({
      marriageDescription: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  test('enforces max length on divorceNotes (5000)', () => {
    const result = familyEventFieldsSchema.safeParse({
      divorceNotes: 'a'.repeat(5001),
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// createFamilySchema
// ============================================================================
describe('createFamilySchema', () => {
  test('accepts husbandId and wifeId as UUIDs', () => {
    const result = createFamilySchema.safeParse({
      husbandId: 'a0000000-0000-4000-a000-000000000001',
      wifeId: 'a0000000-0000-4000-a000-000000000002',
    });
    expect(result.success).toBe(true);
  });

  test('rejects invalid UUID for husbandId', () => {
    const result = createFamilySchema.safeParse({
      husbandId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  test('accepts childrenIds', () => {
    const result = createFamilySchema.safeParse({
      husbandId: 'a0000000-0000-4000-a000-000000000001',
      childrenIds: ['a0000000-0000-4000-a000-000000000003'],
    });
    expect(result.success).toBe(true);
  });

  test('includes event fields from shared schema', () => {
    const result = createFamilySchema.safeParse({
      husbandId: 'a0000000-0000-4000-a000-000000000001',
      marriageDate: '2020-01-01',
      marriagePlace: 'Jeddah',
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// updateFamilySchema
// ============================================================================
describe('updateFamilySchema', () => {
  test('accepts nullable husbandId and wifeId', () => {
    const result = updateFamilySchema.safeParse({
      husbandId: null,
      wifeId: null,
    });
    expect(result.success).toBe(true);
  });

  test('accepts event fields with null values', () => {
    const result = updateFamilySchema.safeParse({
      marriageDate: null,
      divorceDate: null,
    });
    expect(result.success).toBe(true);
  });

  test('accepts empty object', () => {
    const result = updateFamilySchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// treeId — optional target-tree binding (Collections Chunk 2)
// ============================================================================
describe('treeId — optional target-tree field', () => {
  const VALID_UUID = '11111111-1111-4111-8111-111111111111';

  test('createIndividualSchema accepts an optional treeId UUID', () => {
    const result = createIndividualSchema.safeParse({
      givenName: 'محمد',
      sex: 'M',
      treeId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  test('createIndividualSchema rejects a non-UUID treeId', () => {
    const result = createIndividualSchema.safeParse({
      givenName: 'محمد',
      sex: 'M',
      treeId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  test('createIndividualSchema still valid without treeId (backward-compatible)', () => {
    const result = createIndividualSchema.safeParse({ givenName: 'محمد', sex: 'M' });
    expect(result.success).toBe(true);
  });

  test('updateIndividualSchema accepts an optional treeId UUID', () => {
    const result = updateIndividualSchema.safeParse({ givenName: 'محمد', treeId: VALID_UUID });
    expect(result.success).toBe(true);
  });

  test('createFamilySchema accepts an optional treeId UUID', () => {
    const result = createFamilySchema.safeParse({ treeId: VALID_UUID });
    expect(result.success).toBe(true);
  });

  test('updateFamilySchema accepts an optional treeId UUID', () => {
    const result = updateFamilySchema.safeParse({ husbandId: null, treeId: VALID_UUID });
    expect(result.success).toBe(true);
  });

  test('createRadaFamilySchema accepts an optional treeId UUID', () => {
    const result = createRadaFamilySchema.safeParse({
      childrenIds: [VALID_UUID],
      notes: 'رضاعة',
      treeId: VALID_UUID,
    });
    expect(result.success).toBe(true);
  });

  test('updateRadaFamilySchema accepts an optional treeId UUID', () => {
    const result = updateRadaFamilySchema.safeParse({ notes: 'رضاعة', treeId: VALID_UUID });
    expect(result.success).toBe(true);
  });
});

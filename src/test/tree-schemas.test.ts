import { describe, test, expect } from 'vitest';
import {
  individualFieldsSchema,
  createIndividualSchema,
  updateIndividualSchema,
  familyEventFieldsSchema,
  createFamilySchema,
  updateFamilySchema,
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
});

// ============================================================================
// createIndividualSchema — requires givenName or fullName
// ============================================================================
describe('createIndividualSchema', () => {
  test('requires givenName or fullName', () => {
    const result = createIndividualSchema.safeParse({ sex: 'M' });
    expect(result.success).toBe(false);
  });

  test('accepts givenName alone', () => {
    const result = createIndividualSchema.safeParse({ givenName: 'محمد' });
    expect(result.success).toBe(true);
  });

  test('accepts fullName alone', () => {
    const result = createIndividualSchema.safeParse({ fullName: 'محمد بن عبدالله' });
    expect(result.success).toBe(true);
  });

  test('defaults isPrivate to false', () => {
    const result = createIndividualSchema.safeParse({ givenName: 'محمد' });
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

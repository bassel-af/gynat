import { describe, test, expect } from 'vitest';
import { serializeIndividualForm } from '@/lib/person-detail-helpers';

describe('serializeIndividualForm', () => {
  test('converts empty strings to null (not undefined) for field clearing', () => {
    const result = serializeIndividualForm({
      givenName: '',
      surname: '',
      sex: '',
      birthDate: '',
      birthPlace: '',
      birthDescription: '',
      birthNotes: '',
      birthHijriDate: '',
      deathDate: '',
      deathPlace: '',
      deathDescription: '',
      deathNotes: '',
      deathHijriDate: '',
      isDeceased: false,
      isPrivate: false,
      notes: '',
    });

    // All empty string fields should be null, NOT undefined
    expect(result.givenName).toBeNull();
    expect(result.surname).toBeNull();
    expect(result.sex).toBeNull();
    expect(result.birthDate).toBeNull();
    expect(result.birthPlace).toBeNull();
    expect(result.birthDescription).toBeNull();
    expect(result.birthNotes).toBeNull();
    expect(result.birthHijriDate).toBeNull();
    expect(result.deathDate).toBeNull();
    expect(result.deathPlace).toBeNull();
    expect(result.deathDescription).toBeNull();
    expect(result.deathNotes).toBeNull();
    expect(result.deathHijriDate).toBeNull();
    expect(result.notes).toBeNull();
  });

  test('preserves non-empty string values', () => {
    const result = serializeIndividualForm({
      givenName: 'محمد',
      surname: 'السعيد',
      sex: 'M',
      birthDate: '1950',
      birthPlace: 'الرياض',
      birthDescription: '',
      birthNotes: '',
      birthHijriDate: '',
      deathDate: '',
      deathPlace: '',
      deathDescription: '',
      deathNotes: '',
      deathHijriDate: '',
      isDeceased: false,
      isPrivate: false,
      notes: '',
    });

    expect(result.givenName).toBe('محمد');
    expect(result.surname).toBe('السعيد');
    expect(result.sex).toBe('M');
    expect(result.birthDate).toBe('1950');
    expect(result.birthPlace).toBe('الرياض');
  });

  test('preserves boolean fields', () => {
    const result = serializeIndividualForm({
      givenName: 'محمد',
      surname: '',
      sex: '',
      birthDate: '',
      birthPlace: '',
      birthDescription: '',
      birthNotes: '',
      birthHijriDate: '',
      deathDate: '',
      deathPlace: '',
      deathDescription: '',
      deathNotes: '',
      deathHijriDate: '',
      isDeceased: true,
      isPrivate: true,
      notes: '',
    });

    expect(result.isDeceased).toBe(true);
    expect(result.isPrivate).toBe(true);
  });
});

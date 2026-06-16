import { describe, test, expect } from 'vitest';
import { validateAddSibling } from '@/lib/person-detail-helpers';
import type { Individual, GedcomData, Family, FamilyEvent } from '@/lib/gedcom/types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const emptyEvent: FamilyEvent = {
  date: '',
  hijriDate: '',
  place: '',
  description: '',
  notes: '',
};

function makeIndividual(overrides: Partial<Individual> = {}): Individual {
  return {
    id: 'I1',
    type: 'INDI',
    name: 'محمد /السعيد/',
    givenName: 'محمد',
    surname: 'السعيد',
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

function makeFamily(overrides: Partial<Family> = {}): Family {
  return {
    id: 'F1',
    type: 'FAM',
    husband: null,
    wife: null,
    children: [],
    marriageContract: { ...emptyEvent },
    marriage: { ...emptyEvent },
    divorce: { ...emptyEvent },
    isDivorced: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('validateAddSibling', () => {
  test('returns allowed false when familyAsChild is null', () => {
    const person = makeIndividual({ familyAsChild: null });
    const data: GedcomData = {
      individuals: { [person.id]: person },
      families: {},
    };

    const result = validateAddSibling(person, data);

    expect(result).toEqual({ allowed: false });
  });

  test('returns allowed false when familyAsChild references a missing family', () => {
    const person = makeIndividual({ familyAsChild: 'F_MISSING' });
    const data: GedcomData = {
      individuals: { [person.id]: person },
      families: {},
    };

    const result = validateAddSibling(person, data);

    expect(result).toEqual({ allowed: false });
  });

  test('returns allowed true with targetFamilyId when family exists', () => {
    const family = makeFamily({ id: 'F1', husband: 'I_DAD', children: ['I1'] });
    const person = makeIndividual({ id: 'I1', familyAsChild: 'F1' });
    const data: GedcomData = {
      individuals: { [person.id]: person },
      families: { [family.id]: family },
    };

    const result = validateAddSibling(person, data);

    expect(result).toEqual({ allowed: true, targetFamilyId: 'F1' });
  });
});

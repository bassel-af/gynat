import { describe, it, expect } from 'vitest';
import type { Individual, Family, GedcomData } from '@/lib/gedcom/types';
import { getSurnamePrefill } from '@/lib/person-detail-helpers';

// ---------------------------------------------------------------------------
// Minimal fixture builders
// ---------------------------------------------------------------------------

function indi(id: string, overrides: Partial<Individual> = {}): Individual {
  return {
    id,
    type: 'INDI',
    name: '',
    givenName: '',
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
    isDeceased: false,
    isPrivate: false,
    familiesAsSpouse: [],
    familyAsChild: null,
    ...overrides,
  };
}

function fam(id: string, overrides: Partial<Family> = {}): Family {
  const emptyEvent = {
    date: '',
    hijriDate: '',
    place: '',
    description: '',
    notes: '',
  };
  return {
    id,
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

function gedcom(individuals: Individual[], families: Family[] = []): GedcomData {
  return {
    individuals: Object.fromEntries(individuals.map((i) => [i.id, i])),
    families: Object.fromEntries(families.map((f) => [f.id, f])),
  };
}

describe('getSurnamePrefill — addChild', () => {
  it('returns the anchor surname when the anchor is male', () => {
    const anchor = indi('I1', { sex: 'M', givenName: 'أحمد', surname: 'شربك' });
    const data = gedcom([anchor]);

    expect(getSurnamePrefill(data, anchor, { kind: 'addChild' })).toBe('شربك');
  });

  it('returns the husband surname of the explicit target family when the anchor is female', () => {
    const anchor = indi('I1', { sex: 'F', surname: 'شربك', familiesAsSpouse: ['F1'] });
    const husband = indi('I2', { sex: 'M', surname: 'الدلاتي', familiesAsSpouse: ['F1'] });
    const family = fam('F1', { husband: 'I2', wife: 'I1' });
    const data = gedcom([anchor, husband], [family]);

    expect(
      getSurnamePrefill(data, anchor, { kind: 'addChild', targetFamilyId: 'F1' }),
    ).toBe('الدلاتي');
  });

  it('falls back to the only editable spouse family when no target family is given', () => {
    const anchor = indi('I1', { sex: 'F', surname: 'شربك', familiesAsSpouse: ['F1'] });
    const husband = indi('I2', { sex: 'M', surname: 'الدلاتي', familiesAsSpouse: ['F1'] });
    const family = fam('F1', { husband: 'I2', wife: 'I1' });
    const data = gedcom([anchor, husband], [family]);

    expect(getSurnamePrefill(data, anchor, { kind: 'addChild' })).toBe('الدلاتي');
  });

  it('uses the second family husband when the second family id is the target', () => {
    const anchor = indi('I1', { sex: 'F', surname: 'شربك', familiesAsSpouse: ['F1', 'F2'] });
    const husbandOne = indi('I2', { sex: 'M', surname: 'الدلاتي', familiesAsSpouse: ['F1'] });
    const husbandTwo = indi('I3', { sex: 'M', surname: 'الدباغ', familiesAsSpouse: ['F2'] });
    const data = gedcom(
      [anchor, husbandOne, husbandTwo],
      [fam('F1', { husband: 'I2', wife: 'I1' }), fam('F2', { husband: 'I3', wife: 'I1' })],
    );

    expect(
      getSurnamePrefill(data, anchor, { kind: 'addChild', targetFamilyId: 'F2' }),
    ).toBe('الدباغ');
  });

  it('returns null for a female anchor with no family', () => {
    const anchor = indi('I1', { sex: 'F', surname: 'شربك' });
    const data = gedcom([anchor]);

    expect(getSurnamePrefill(data, anchor, { kind: 'addChild' })).toBeNull();
  });

  it('returns null when the resolved family has no husband (never falls back to the mother)', () => {
    const anchor = indi('I1', { sex: 'F', surname: 'شربك', familiesAsSpouse: ['F1'] });
    const data = gedcom([anchor], [fam('F1', { husband: null, wife: 'I1' })]);

    expect(getSurnamePrefill(data, anchor, { kind: 'addChild' })).toBeNull();
  });

  it('returns null when the anchor is private (redacted)', () => {
    const anchor = indi('I1', {
      sex: 'M',
      givenName: 'خاص',
      surname: '',
      isPrivate: true,
    });
    const data = gedcom([anchor]);

    expect(getSurnamePrefill(data, anchor, { kind: 'addChild' })).toBeNull();
  });

  it('returns null for a whitespace-only surname', () => {
    const anchor = indi('I1', { sex: 'M', surname: '   ' });
    const data = gedcom([anchor]);

    expect(getSurnamePrefill(data, anchor, { kind: 'addChild' })).toBeNull();
  });

  it('trims a padded surname', () => {
    const anchor = indi('I1', { sex: 'M', surname: ' شربك ' });
    const data = gedcom([anchor]);

    expect(getSurnamePrefill(data, anchor, { kind: 'addChild' })).toBe('شربك');
  });

  it('returns null when the resolved husband surname is the private placeholder', () => {
    const anchor = indi('I1', { sex: 'F', surname: 'شربك', familiesAsSpouse: ['F1'] });
    const husband = indi('I2', { sex: 'M', givenName: 'خاص', surname: 'خاص', isPrivate: true });
    const data = gedcom([anchor, husband], [fam('F1', { husband: 'I2', wife: 'I1' })]);

    expect(getSurnamePrefill(data, anchor, { kind: 'addChild' })).toBeNull();
  });
});

describe('getSurnamePrefill — addSibling', () => {
  it('returns the target family husband surname', () => {
    const anchor = indi('I1', { sex: 'M', surname: 'شربك', familyAsChild: 'F1' });
    const father = indi('I2', { sex: 'M', surname: 'الدلاتي', familiesAsSpouse: ['F1'] });
    const data = gedcom([anchor, father], [fam('F1', { husband: 'I2', children: ['I1'] })]);

    expect(
      getSurnamePrefill(data, anchor, { kind: 'addSibling', targetFamilyId: 'F1' }),
    ).toBe('الدلاتي');
  });

  it('falls back to the anchor own surname when the target family husband is private', () => {
    const anchor = indi('I1', { sex: 'M', surname: 'شربك', familyAsChild: 'F1' });
    const father = indi('I2', { sex: 'M', givenName: 'خاص', surname: '', isPrivate: true });
    const data = gedcom([anchor, father], [fam('F1', { husband: 'I2', children: ['I1'] })]);

    expect(
      getSurnamePrefill(data, anchor, { kind: 'addSibling', targetFamilyId: 'F1' }),
    ).toBe('شربك');
  });
});

describe('getSurnamePrefill — addParent', () => {
  it('returns the anchor surname when the locked sex is male', () => {
    const anchor = indi('I1', { sex: 'M', surname: 'شربك' });
    const data = gedcom([anchor]);

    expect(getSurnamePrefill(data, anchor, { kind: 'addParent', lockedSex: 'M' })).toBe('شربك');
  });

  it('returns null when the locked sex is female', () => {
    const anchor = indi('I1', { sex: 'M', surname: 'شربك' });
    const data = gedcom([anchor]);

    expect(getSurnamePrefill(data, anchor, { kind: 'addParent', lockedSex: 'F' })).toBeNull();
  });

  it('returns the anchor surname when no sex is locked', () => {
    const anchor = indi('I1', { sex: 'M', surname: 'شربك' });
    const data = gedcom([anchor]);

    expect(getSurnamePrefill(data, anchor, { kind: 'addParent' })).toBe('شربك');
  });
});

describe('getSurnamePrefill — non-prefilling modes', () => {
  it('returns null for addSpouse', () => {
    const anchor = indi('I1', { sex: 'M', surname: 'شربك' });
    const data = gedcom([anchor]);

    expect(getSurnamePrefill(data, anchor, { kind: 'addSpouse' })).toBeNull();
  });

  it('returns null for edit', () => {
    const anchor = indi('I1', { sex: 'M', surname: 'شربك' });
    const data = gedcom([anchor]);

    expect(getSurnamePrefill(data, anchor, { kind: 'edit' })).toBeNull();
  });

  it('returns null when data, person, or mode is missing', () => {
    const anchor = indi('I1', { sex: 'M', surname: 'شربك' });
    const data = gedcom([anchor]);

    expect(getSurnamePrefill(null, anchor, { kind: 'addChild' })).toBeNull();
    expect(getSurnamePrefill(data, undefined, { kind: 'addChild' })).toBeNull();
    expect(getSurnamePrefill(data, anchor, null)).toBeNull();
  });
});

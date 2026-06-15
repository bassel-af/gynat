import { describe, test, expect } from 'vitest';
import type { GedcomData, Individual, Family } from '@/lib/gedcom/types';
import {
  isSourceTreePublic,
  composePublicGedcom,
} from '@/lib/tree/public-compose';

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
    kunya: '',
    notes: '',
    isDeceased: false,
    isPrivate: false,
    familiesAsSpouse: [],
    familyAsChild: null,
    ...overrides,
  };
}

const EMPTY_EVENT = { date: '', hijriDate: '', place: '', description: '', notes: '' };

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
// isSourceTreePublic — the borrowed-branch source gate (fail-closed)
// ---------------------------------------------------------------------------

describe('isSourceTreePublic', () => {
  test('public_link source is allowed', () => {
    expect(isSourceTreePublic('public_link')).toBe(true);
  });

  test('public_listed source is allowed', () => {
    expect(isSourceTreePublic('public_listed')).toBe(true);
  });

  test('private source is withheld', () => {
    expect(isSourceTreePublic('private')).toBe(false);
  });

  test('unknown / null visibility is withheld (fail-closed)', () => {
    expect(isSourceTreePublic(null)).toBe(false);
    expect(isSourceTreePublic(undefined)).toBe(false);
    expect(isSourceTreePublic('something_else')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// composePublicGedcom — additive merge of home + included borrowed subtrees
// ---------------------------------------------------------------------------

describe('composePublicGedcom', () => {
  test('returns the home tree unchanged when there are no borrowed subtrees', () => {
    const home: GedcomData = {
      individuals: { h1: makeIndividual({ id: 'h1' }) },
      families: { f1: makeFamily({ id: 'f1' }) },
    };
    const result = composePublicGedcom(home, []);
    expect(Object.keys(result.individuals)).toEqual(['h1']);
    expect(Object.keys(result.families)).toEqual(['f1']);
  });

  test('merges borrowed individuals and families into the composed set', () => {
    const home: GedcomData = {
      individuals: { h1: makeIndividual({ id: 'h1' }) },
      families: {},
    };
    const borrowed: GedcomData = {
      individuals: { b1: makeIndividual({ id: 'b1' }) },
      families: { bf1: makeFamily({ id: 'bf1' }) },
    };
    const result = composePublicGedcom(home, [borrowed]);
    expect(Object.keys(result.individuals).sort()).toEqual(['b1', 'h1']);
    expect(Object.keys(result.families)).toEqual(['bf1']);
  });

  test('home data wins on an id collision (home is authoritative)', () => {
    const home: GedcomData = {
      individuals: { x: makeIndividual({ id: 'x', name: 'HOME' }) },
      families: {},
    };
    const borrowed: GedcomData = {
      individuals: { x: makeIndividual({ id: 'x', name: 'BORROWED' }) },
      families: {},
    };
    const result = composePublicGedcom(home, [borrowed]);
    expect(result.individuals.x.name).toBe('HOME');
  });

  test('does not mutate the home input', () => {
    const home: GedcomData = {
      individuals: { h1: makeIndividual({ id: 'h1' }) },
      families: {},
    };
    composePublicGedcom(home, [
      { individuals: { b1: makeIndividual({ id: 'b1' }) }, families: {} },
    ]);
    expect(Object.keys(home.individuals)).toEqual(['h1']);
  });

  test('merges multiple borrowed subtrees', () => {
    const home: GedcomData = { individuals: {}, families: {} };
    const result = composePublicGedcom(home, [
      { individuals: { a: makeIndividual({ id: 'a' }) }, families: {} },
      { individuals: { b: makeIndividual({ id: 'b' }) }, families: {} },
    ]);
    expect(Object.keys(result.individuals).sort()).toEqual(['a', 'b']);
  });
});

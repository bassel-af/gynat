import { describe, test, expect } from 'vitest';
import type { GedcomData, Individual } from '@/lib/gedcom/types';
import { stripDisabledNameFeatures, dropDisabledNameInput } from '@/lib/tree/feature-strip';

function person(id: string, overrides: Partial<Individual> = {}): Individual {
  return {
    id, type: 'INDI', name: id, givenName: id, surname: '', sex: 'M',
    birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
    death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
    kunya: 'أبو طالب', famousName: 'هاشم', famousNameInNasab: true,
    notes: '', isDeceased: true, isPrivate: false, familiesAsSpouse: [], familyAsChild: null,
    ...overrides,
  };
}

function tree(): GedcomData {
  return { individuals: { a: person('a'), b: person('b') }, families: {} };
}

const ALL_ON = { enableKunya: true, enableFamousName: true };

describe('stripDisabledNameFeatures', () => {
  test('famous name off → no person carries a famous name', () => {
    const out = stripDisabledNameFeatures(tree(), { ...ALL_ON, enableFamousName: false });
    for (const ind of Object.values(out.individuals)) {
      expect('famousName' in ind).toBe(false);
    }
  });

  test('famous name off → no person carries the in-nasab choice', () => {
    const out = stripDisabledNameFeatures(tree(), { ...ALL_ON, enableFamousName: false });
    for (const ind of Object.values(out.individuals)) {
      expect('famousNameInNasab' in ind).toBe(false);
    }
  });

  test('kunya off → every kunya is blank', () => {
    const out = stripDisabledNameFeatures(tree(), { ...ALL_ON, enableKunya: false });
    expect(Object.values(out.individuals).map((i) => i.kunya)).toEqual(['', '']);
  });

  test('kunya off leaves the famous name alone', () => {
    const out = stripDisabledNameFeatures(tree(), { ...ALL_ON, enableKunya: false });
    expect(out.individuals.a.famousName).toBe('هاشم');
  });

  test('does not mutate the input', () => {
    const input = tree();
    const before = structuredClone(input);
    stripDisabledNameFeatures(input, { enableKunya: false, enableFamousName: false });
    expect(input).toEqual(before);
  });

  test('both features on → data unchanged', () => {
    expect(stripDisabledNameFeatures(tree(), ALL_ON)).toEqual(tree());
  });
});

describe('dropDisabledNameInput', () => {
  const input = () => ({ givenName: 'علي', kunya: 'أبو حسن', famousName: 'المرتضى', famousNameInNasab: false });

  test('famous name off → famous-name fields are dropped', () => {
    const out = dropDisabledNameInput(input(), { ...ALL_ON, enableFamousName: false });
    expect(out).toEqual({ givenName: 'علي', kunya: 'أبو حسن' });
  });

  test('kunya off → kunya is dropped', () => {
    const out = dropDisabledNameInput(input(), { ...ALL_ON, enableKunya: false });
    expect(out).toEqual({ givenName: 'علي', famousName: 'المرتضى', famousNameInNasab: false });
  });

  test('both on → input kept as-is', () => {
    expect(dropDisabledNameInput(input(), ALL_ON)).toEqual(input());
  });

  test('does not mutate the input', () => {
    const original = input();
    dropDisabledNameInput(original, { enableKunya: false, enableFamousName: false });
    expect(original).toEqual(input());
  });
});

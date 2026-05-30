import { describe, test, expect } from 'vitest';
import { getConnectedIndividuals } from '@/lib/gedcom/graph';
import type { GedcomData, Individual, Family } from '@/lib/gedcom/types';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

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

/**
 * Topology:
 *
 *   ROOT ─┬─(F1)            STRANGER ─┬─(FS)   [disconnected island]
 *        SON ─┬─(F2)── WIFE          STRANGER_SON
 *       GRANDCHILD        │
 *                         │ WIFE is married-in, child of FWIFE
 *               WIFE_DAD ─┴─(FWIFE)── WIFE, WIFE_SIS
 *                                       │
 *                          WIFE_SIS ─(F3)── OUTSIDER   (a second marriage hop out)
 *                                            │ OUTSIDER child of FOUT
 *                              OUTSIDER_DAD ─┴─(FOUT)── OUTSIDER, OUTSIDER_BRO
 *
 * Connected to ROOT by blood-or-marriage (any distance):
 *   ROOT, SON, WIFE, GRANDCHILD, WIFE_DAD, WIFE_SIS, OUTSIDER, OUTSIDER_DAD, OUTSIDER_BRO
 * NOT connected: STRANGER, STRANGER_SON
 */
function buildFixture(): GedcomData {
  const individuals: Record<string, Individual> = {
    '@ROOT@': makeIndividual({ id: '@ROOT@', familiesAsSpouse: ['@F1@'] }),
    '@SON@': makeIndividual({ id: '@SON@', familyAsChild: '@F1@', familiesAsSpouse: ['@F2@'] }),
    '@WIFE@': makeIndividual({ id: '@WIFE@', sex: 'F', familyAsChild: '@FWIFE@', familiesAsSpouse: ['@F2@'] }),
    '@GRANDCHILD@': makeIndividual({ id: '@GRANDCHILD@', familyAsChild: '@F2@' }),
    '@WIFE_DAD@': makeIndividual({ id: '@WIFE_DAD@', familiesAsSpouse: ['@FWIFE@'] }),
    '@WIFE_SIS@': makeIndividual({ id: '@WIFE_SIS@', sex: 'F', familyAsChild: '@FWIFE@', familiesAsSpouse: ['@F3@'] }),
    '@OUTSIDER@': makeIndividual({ id: '@OUTSIDER@', familyAsChild: '@FOUT@', familiesAsSpouse: ['@F3@'] }),
    '@OUTSIDER_DAD@': makeIndividual({ id: '@OUTSIDER_DAD@', familiesAsSpouse: ['@FOUT@'] }),
    '@OUTSIDER_BRO@': makeIndividual({ id: '@OUTSIDER_BRO@', familyAsChild: '@FOUT@' }),
    // Disconnected island — no blood or marriage path to ROOT
    '@STRANGER@': makeIndividual({ id: '@STRANGER@', familiesAsSpouse: ['@FS@'] }),
    '@STRANGER_SON@': makeIndividual({ id: '@STRANGER_SON@', familyAsChild: '@FS@' }),
  };

  const families: Record<string, Family> = {
    '@F1@': makeFamily({ id: '@F1@', husband: '@ROOT@', children: ['@SON@'] }),
    '@F2@': makeFamily({ id: '@F2@', husband: '@SON@', wife: '@WIFE@', children: ['@GRANDCHILD@'] }),
    '@FWIFE@': makeFamily({ id: '@FWIFE@', husband: '@WIFE_DAD@', children: ['@WIFE@', '@WIFE_SIS@'] }),
    '@F3@': makeFamily({ id: '@F3@', husband: '@OUTSIDER@', wife: '@WIFE_SIS@', children: [] }),
    '@FOUT@': makeFamily({ id: '@FOUT@', husband: '@OUTSIDER_DAD@', children: ['@OUTSIDER@', '@OUTSIDER_BRO@'] }),
    '@FS@': makeFamily({ id: '@FS@', husband: '@STRANGER@', children: ['@STRANGER_SON@'] }),
  };

  return { individuals, families };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getConnectedIndividuals — connected component by blood or marriage', () => {
  test('includes the immediate married-in family (spouse parents + siblings)', () => {
    const data = buildFixture();
    const connected = getConnectedIndividuals(data, '@ROOT@');

    expect(connected.has('@WIFE_DAD@')).toBe(true);
    expect(connected.has('@WIFE_SIS@')).toBe(true);
  });

  test('reaches married-in families across MULTIPLE hops (not just one)', () => {
    const data = buildFixture();
    const connected = getConnectedIndividuals(data, '@ROOT@');

    // WIFE_SIS married OUTSIDER, whose father + brother are two marriages away from ROOT
    expect(connected.has('@OUTSIDER@')).toBe(true);
    expect(connected.has('@OUTSIDER_DAD@')).toBe(true);
    expect(connected.has('@OUTSIDER_BRO@')).toBe(true);
  });

  test('includes the core tree (root, descendants, spouses)', () => {
    const data = buildFixture();
    const connected = getConnectedIndividuals(data, '@ROOT@');

    expect(connected.has('@ROOT@')).toBe(true);
    expect(connected.has('@SON@')).toBe(true);
    expect(connected.has('@WIFE@')).toBe(true);
    expect(connected.has('@GRANDCHILD@')).toBe(true);
  });

  test('EXCLUDES a separate, unlinked family island', () => {
    const data = buildFixture();
    const connected = getConnectedIndividuals(data, '@ROOT@');

    expect(connected.has('@STRANGER@')).toBe(false);
    expect(connected.has('@STRANGER_SON@')).toBe(false);
  });

  test('is symmetric — starting from a married-in node yields the same component', () => {
    const data = buildFixture();
    const fromRoot = getConnectedIndividuals(data, '@ROOT@');
    const fromInLaw = getConnectedIndividuals(data, '@WIFE_DAD@');

    expect([...fromInLaw].sort()).toEqual([...fromRoot].sort());
    expect(fromInLaw.has('@ROOT@')).toBe(true);
  });

  test('traverses THROUGH private individuals (they can bridge) but excludes them from the result', () => {
    const data = buildFixture();
    // Make the only bridge to the OUTSIDER family private.
    data.individuals['@OUTSIDER@'].isPrivate = true;

    const connected = getConnectedIndividuals(data, '@ROOT@');

    // Private bridge itself is excluded...
    expect(connected.has('@OUTSIDER@')).toBe(false);
    // ...but the family reachable only through it is still connected.
    expect(connected.has('@OUTSIDER_DAD@')).toBe(true);
    expect(connected.has('@OUTSIDER_BRO@')).toBe(true);
  });

  test('returns an empty set for a nonexistent root', () => {
    const data = buildFixture();
    expect(getConnectedIndividuals(data, '@NOPE@').size).toBe(0);
  });
});

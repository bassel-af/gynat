import { describe, test, expect } from 'vitest';
import type { GedcomData, Individual, Family } from '@/lib/gedcom/types';
import { findTopmostAncestor, hasExternalFamily } from '@/lib/gedcom/graph';
import { getAllDescendants } from '@/lib/gedcom/graph';

// ---------------------------------------------------------------------------
// Fixture builder helpers (same pattern as extract-subtree.test.ts)
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
// Fixture:
//
// Tree A (main family):
//   GrandpaA
//     └── FatherA + MotherB (married-in from Tree B)
//           └── Child
//
// Tree B (in-law family):
//   GrandpaB
//     └── FatherB
//           └── MotherB (who married into Tree A)
//
// Orphan: no parents, no family as child
// ---------------------------------------------------------------------------

function buildFixture(): GedcomData {
  const individuals: Record<string, Individual> = {
    '@GRANDPA_A@': makeIndividual({
      id: '@GRANDPA_A@',
      name: 'GrandpaA',
      sex: 'M',
      familiesAsSpouse: ['@F_A1@'],
    }),
    '@FATHER_A@': makeIndividual({
      id: '@FATHER_A@',
      name: 'FatherA',
      sex: 'M',
      familiesAsSpouse: ['@F_A2@'],
      familyAsChild: '@F_A1@',
    }),
    '@MOTHER_B@': makeIndividual({
      id: '@MOTHER_B@',
      name: 'MotherB',
      sex: 'F',
      familiesAsSpouse: ['@F_A2@'],
      familyAsChild: '@F_B2@',
    }),
    '@CHILD@': makeIndividual({
      id: '@CHILD@',
      name: 'Child',
      sex: 'M',
      familyAsChild: '@F_A2@',
    }),
    '@GRANDPA_B@': makeIndividual({
      id: '@GRANDPA_B@',
      name: 'GrandpaB',
      sex: 'M',
      familiesAsSpouse: ['@F_B1@'],
    }),
    '@FATHER_B@': makeIndividual({
      id: '@FATHER_B@',
      name: 'FatherB',
      sex: 'M',
      familiesAsSpouse: ['@F_B2@'],
      familyAsChild: '@F_B1@',
    }),
    '@ORPHAN@': makeIndividual({
      id: '@ORPHAN@',
      name: 'Orphan',
      sex: 'M',
    }),
  };

  const families: Record<string, Family> = {
    '@F_A1@': makeFamily({
      id: '@F_A1@',
      husband: '@GRANDPA_A@',
      children: ['@FATHER_A@'],
    }),
    '@F_A2@': makeFamily({
      id: '@F_A2@',
      husband: '@FATHER_A@',
      wife: '@MOTHER_B@',
      children: ['@CHILD@'],
    }),
    '@F_B1@': makeFamily({
      id: '@F_B1@',
      husband: '@GRANDPA_B@',
      children: ['@FATHER_B@'],
    }),
    '@F_B2@': makeFamily({
      id: '@F_B2@',
      husband: '@FATHER_B@',
      children: ['@MOTHER_B@'],
    }),
  };

  return { individuals, families };
}

// ---------------------------------------------------------------------------
// findTopmostAncestor tests
// ---------------------------------------------------------------------------

describe('findTopmostAncestor', () => {
  test('returns topmost ancestor by walking up familyAsChild chains', () => {
    const data = buildFixture();
    // MotherB -> FatherB -> GrandpaB (no parents)
    expect(findTopmostAncestor(data, '@MOTHER_B@')).toBe('@GRANDPA_B@');
  });

  test('returns topmost ancestor for a person one level below root', () => {
    const data = buildFixture();
    // FatherA -> GrandpaA
    expect(findTopmostAncestor(data, '@FATHER_A@')).toBe('@GRANDPA_A@');
  });

  test('returns null when person has no parents (already a root)', () => {
    const data = buildFixture();
    expect(findTopmostAncestor(data, '@GRANDPA_A@')).toBeNull();
  });

  test('returns null for person with no familyAsChild', () => {
    const data = buildFixture();
    expect(findTopmostAncestor(data, '@ORPHAN@')).toBeNull();
  });

  test('returns null when person does not exist in data', () => {
    const data = buildFixture();
    expect(findTopmostAncestor(data, '@NONEXISTENT@')).toBeNull();
  });

  test('handles circular references by using visited set', () => {
    // Create a cycle: A -> B -> A
    const individuals: Record<string, Individual> = {
      '@A@': makeIndividual({
        id: '@A@',
        familyAsChild: '@F1@',
      }),
      '@B@': makeIndividual({
        id: '@B@',
        familiesAsSpouse: ['@F1@'],
        familyAsChild: '@F2@',
      }),
    };
    const families: Record<string, Family> = {
      '@F1@': makeFamily({
        id: '@F1@',
        husband: '@B@',
        children: ['@A@'],
      }),
      '@F2@': makeFamily({
        id: '@F2@',
        husband: '@A@',
        children: ['@B@'],
      }),
    };
    const data: GedcomData = { individuals, families };

    // Should not infinite loop; returns some result without crashing
    const result = findTopmostAncestor(data, '@A@');
    // The exact result depends on traversal order, but it must not hang
    expect(result).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// hasExternalFamily tests
// ---------------------------------------------------------------------------

describe('hasExternalFamily', () => {
  test('returns true for married-in spouse with parents outside the root tree', () => {
    const data = buildFixture();
    const rootDescendants = getAllDescendants(data, '@GRANDPA_A@');
    rootDescendants.add('@GRANDPA_A@');

    // MotherB is NOT in rootDescendants (she is a spouse, not a descendant)
    // and she HAS parents in DB (FatherB via @F_B2@)
    expect(hasExternalFamily(data, '@MOTHER_B@', rootDescendants)).toBe(true);
  });

  test('returns false for person who IS a descendant of the root', () => {
    const data = buildFixture();
    const rootDescendants = getAllDescendants(data, '@GRANDPA_A@');
    rootDescendants.add('@GRANDPA_A@');

    // FatherA IS a descendant of GrandpaA
    expect(hasExternalFamily(data, '@FATHER_A@', rootDescendants)).toBe(false);
  });

  test('returns false for person with no parents in DB', () => {
    const data = buildFixture();
    const rootDescendants = getAllDescendants(data, '@GRANDPA_A@');
    rootDescendants.add('@GRANDPA_A@');

    // Orphan has no familyAsChild
    expect(hasExternalFamily(data, '@ORPHAN@', rootDescendants)).toBe(false);
  });

  test('returns false for the root itself', () => {
    const data = buildFixture();
    const rootDescendants = getAllDescendants(data, '@GRANDPA_A@');
    rootDescendants.add('@GRANDPA_A@');

    expect(hasExternalFamily(data, '@GRANDPA_A@', rootDescendants)).toBe(false);
  });

  test('returns false for person who does not exist in data', () => {
    const data = buildFixture();
    const rootDescendants = new Set<string>();

    expect(hasExternalFamily(data, '@NONEXISTENT@', rootDescendants)).toBe(false);
  });

  test('returns false when familyAsChild points to family with no parents', () => {
    // Person has familyAsChild but the family has no husband/wife
    const individuals: Record<string, Individual> = {
      '@PERSON@': makeIndividual({
        id: '@PERSON@',
        familyAsChild: '@F1@',
      }),
    };
    const families: Record<string, Family> = {
      '@F1@': makeFamily({
        id: '@F1@',
        // No husband or wife
        children: ['@PERSON@'],
      }),
    };
    const data: GedcomData = { individuals, families };
    const rootDescendants = new Set<string>();

    expect(hasExternalFamily(data, '@PERSON@', rootDescendants)).toBe(false);
  });
});

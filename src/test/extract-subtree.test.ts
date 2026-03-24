import { describe, test, expect } from 'vitest';
import type { GedcomData, Individual, Family } from '@/lib/gedcom/types';
import { extractSubtree } from '@/lib/gedcom/graph';

// ---------------------------------------------------------------------------
// Fixture builder helpers
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
    birthNotes: '',
    death: '',
    deathPlace: '',
    deathNotes: '',
    notes: '',
    isDeceased: false,
    isPrivate: false,
    familiesAsSpouse: [],
    familyAsChild: null,
    ...overrides,
  };
}

function makeFamily(overrides: Partial<Family> & { id: string }): Family {
  return {
    type: 'FAM',
    husband: null,
    wife: null,
    children: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Build the fixture tree:
//
// Grandpa (root) + Grandma
//   ├── Father + MotherInLaw
//   │     ├── Child1
//   │     └── Child2
//   └── Uncle + Aunt
//         └── Cousin
//
// MotherInLaw + ExHusband (outside subtree)
//   └── Stepchild (outside subtree)
// ---------------------------------------------------------------------------

function buildFixture(): GedcomData {
  const individuals: Record<string, Individual> = {
    '@GRANDPA@': makeIndividual({
      id: '@GRANDPA@',
      name: 'Grandpa',
      sex: 'M',
      familiesAsSpouse: ['@F_GP@'],
      familyAsChild: null,
    }),
    '@GRANDMA@': makeIndividual({
      id: '@GRANDMA@',
      name: 'Grandma',
      sex: 'F',
      familiesAsSpouse: ['@F_GP@'],
      familyAsChild: null,
    }),
    '@FATHER@': makeIndividual({
      id: '@FATHER@',
      name: 'Father',
      sex: 'M',
      familiesAsSpouse: ['@F_FATHER@'],
      familyAsChild: '@F_GP@',
    }),
    '@UNCLE@': makeIndividual({
      id: '@UNCLE@',
      name: 'Uncle',
      sex: 'M',
      familiesAsSpouse: ['@F_UNCLE@'],
      familyAsChild: '@F_GP@',
    }),
    '@MOTHER_IN_LAW@': makeIndividual({
      id: '@MOTHER_IN_LAW@',
      name: 'MotherInLaw',
      sex: 'F',
      familiesAsSpouse: ['@F_FATHER@', '@F_OUTSIDE@'],
      familyAsChild: null,
    }),
    '@AUNT@': makeIndividual({
      id: '@AUNT@',
      name: 'Aunt',
      sex: 'F',
      familiesAsSpouse: ['@F_UNCLE@'],
      familyAsChild: null,
    }),
    '@CHILD1@': makeIndividual({
      id: '@CHILD1@',
      name: 'Child1',
      sex: 'M',
      familiesAsSpouse: [],
      familyAsChild: '@F_FATHER@',
    }),
    '@CHILD2@': makeIndividual({
      id: '@CHILD2@',
      name: 'Child2',
      sex: 'F',
      familiesAsSpouse: [],
      familyAsChild: '@F_FATHER@',
    }),
    '@COUSIN@': makeIndividual({
      id: '@COUSIN@',
      name: 'Cousin',
      sex: 'M',
      familiesAsSpouse: [],
      familyAsChild: '@F_UNCLE@',
    }),
    // Outside the subtree
    '@EX_HUSBAND@': makeIndividual({
      id: '@EX_HUSBAND@',
      name: 'ExHusband',
      sex: 'M',
      familiesAsSpouse: ['@F_OUTSIDE@'],
      familyAsChild: null,
    }),
    '@STEPCHILD@': makeIndividual({
      id: '@STEPCHILD@',
      name: 'Stepchild',
      sex: 'M',
      familiesAsSpouse: [],
      familyAsChild: '@F_OUTSIDE@',
    }),
  };

  const families: Record<string, Family> = {
    '@F_GP@': makeFamily({
      id: '@F_GP@',
      husband: '@GRANDPA@',
      wife: '@GRANDMA@',
      children: ['@FATHER@', '@UNCLE@'],
    }),
    '@F_FATHER@': makeFamily({
      id: '@F_FATHER@',
      husband: '@FATHER@',
      wife: '@MOTHER_IN_LAW@',
      children: ['@CHILD1@', '@CHILD2@'],
    }),
    '@F_UNCLE@': makeFamily({
      id: '@F_UNCLE@',
      husband: '@UNCLE@',
      wife: '@AUNT@',
      children: ['@COUSIN@'],
    }),
    // Family outside the subtree
    '@F_OUTSIDE@': makeFamily({
      id: '@F_OUTSIDE@',
      husband: '@EX_HUSBAND@',
      wife: '@MOTHER_IN_LAW@',
      children: ['@STEPCHILD@'],
    }),
  };

  return { individuals, families };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractSubtree', () => {
  test('returns only root + descendants + spouses from a multi-generation tree', () => {
    const data = buildFixture();
    const result = extractSubtree(data, '@GRANDPA@');

    const ids = Object.keys(result.individuals);
    expect(ids).toHaveLength(9);
    expect(ids).toContain('@GRANDPA@');
    expect(ids).toContain('@GRANDMA@');
    expect(ids).toContain('@FATHER@');
    expect(ids).toContain('@MOTHER_IN_LAW@');
    expect(ids).toContain('@CHILD1@');
    expect(ids).toContain('@CHILD2@');
    expect(ids).toContain('@UNCLE@');
    expect(ids).toContain('@AUNT@');
    expect(ids).toContain('@COUSIN@');
  });

  test('excludes individuals not in the subtree', () => {
    const data = buildFixture();
    const result = extractSubtree(data, '@GRANDPA@');

    expect(result.individuals['@EX_HUSBAND@']).toBeUndefined();
    expect(result.individuals['@STEPCHILD@']).toBeUndefined();
  });

  test('includes families where at least one spouse is in the set', () => {
    const data = buildFixture();
    const result = extractSubtree(data, '@GRANDPA@');

    const familyIds = Object.keys(result.families);
    expect(familyIds).toContain('@F_GP@');
    expect(familyIds).toContain('@F_FATHER@');
    expect(familyIds).toContain('@F_UNCLE@');
  });

  test('excludes families entirely outside the subtree', () => {
    const data = buildFixture();
    const result = extractSubtree(data, '@GRANDPA@');

    expect(result.families['@F_OUTSIDE@']).toBeUndefined();
  });

  test('filters children array to only include subtree members', () => {
    // Build a case where an included family has children both inside and outside
    const individuals: Record<string, Individual> = {
      '@ROOT@': makeIndividual({
        id: '@ROOT@',
        sex: 'M',
        familiesAsSpouse: ['@F1@'],
      }),
      '@SPOUSE@': makeIndividual({
        id: '@SPOUSE@',
        sex: 'F',
        familiesAsSpouse: ['@F1@', '@F2@'],
      }),
      '@CHILD_IN@': makeIndividual({
        id: '@CHILD_IN@',
        sex: 'M',
        familyAsChild: '@F1@',
      }),
      // This person is the husband in F2 (outside root's subtree)
      '@OTHER_HUSBAND@': makeIndividual({
        id: '@OTHER_HUSBAND@',
        sex: 'M',
        familiesAsSpouse: ['@F2@'],
      }),
      '@CHILD_OUT@': makeIndividual({
        id: '@CHILD_OUT@',
        sex: 'M',
        familyAsChild: '@F2@',
      }),
    };

    const families: Record<string, Family> = {
      '@F1@': makeFamily({
        id: '@F1@',
        husband: '@ROOT@',
        wife: '@SPOUSE@',
        children: ['@CHILD_IN@'],
      }),
      '@F2@': makeFamily({
        id: '@F2@',
        husband: '@OTHER_HUSBAND@',
        wife: '@SPOUSE@',
        children: ['@CHILD_OUT@'],
      }),
    };

    const data: GedcomData = { individuals, families };
    const result = extractSubtree(data, '@ROOT@');

    // F1 should be included with its child
    expect(result.families['@F1@'].children).toEqual(['@CHILD_IN@']);
    // F2 should be excluded (OTHER_HUSBAND is not in the subtree)
    expect(result.families['@F2@']).toBeUndefined();
  });

  test('updates familiesAsSpouse to exclude families not in the subtree', () => {
    const data = buildFixture();
    const result = extractSubtree(data, '@GRANDPA@');

    // MotherInLaw originally has familiesAsSpouse: ['@F_FATHER@', '@F_OUTSIDE@']
    // After extraction, @F_OUTSIDE@ should be excluded
    const motherInLaw = result.individuals['@MOTHER_IN_LAW@'];
    expect(motherInLaw.familiesAsSpouse).toEqual(['@F_FATHER@']);
    expect(motherInLaw.familiesAsSpouse).not.toContain('@F_OUTSIDE@');
  });

  test('updates familyAsChild to null if the family is not in the subtree', () => {
    // Create a scenario where someone's familyAsChild points to an excluded family
    const individuals: Record<string, Individual> = {
      '@ROOT@': makeIndividual({
        id: '@ROOT@',
        sex: 'M',
        familiesAsSpouse: ['@F1@'],
        // ROOT's parent family is outside the subtree from ROOT's perspective
        // (ROOT is the topmost, so this family is never included)
        familyAsChild: '@F_PARENT@',
      }),
      '@WIFE@': makeIndividual({
        id: '@WIFE@',
        sex: 'F',
        familiesAsSpouse: ['@F1@'],
      }),
      '@CHILD@': makeIndividual({
        id: '@CHILD@',
        sex: 'M',
        familyAsChild: '@F1@',
      }),
      '@GRANDPARENT@': makeIndividual({
        id: '@GRANDPARENT@',
        sex: 'M',
        familiesAsSpouse: ['@F_PARENT@'],
      }),
    };

    const families: Record<string, Family> = {
      '@F1@': makeFamily({
        id: '@F1@',
        husband: '@ROOT@',
        wife: '@WIFE@',
        children: ['@CHILD@'],
      }),
      '@F_PARENT@': makeFamily({
        id: '@F_PARENT@',
        husband: '@GRANDPARENT@',
        children: ['@ROOT@'],
      }),
    };

    const data: GedcomData = { individuals, families };
    const result = extractSubtree(data, '@ROOT@');

    // ROOT's familyAsChild should be null because @F_PARENT@ is not included
    expect(result.individuals['@ROOT@'].familyAsChild).toBeNull();
    // CHILD's familyAsChild should still reference @F1@ which IS included
    expect(result.individuals['@CHILD@'].familyAsChild).toBe('@F1@');
  });

  test('handles root with no descendants (returns just root + spouse)', () => {
    const individuals: Record<string, Individual> = {
      '@ROOT@': makeIndividual({
        id: '@ROOT@',
        sex: 'M',
        familiesAsSpouse: ['@F1@'],
      }),
      '@SPOUSE@': makeIndividual({
        id: '@SPOUSE@',
        sex: 'F',
        familiesAsSpouse: ['@F1@'],
      }),
      '@OTHER@': makeIndividual({
        id: '@OTHER@',
        sex: 'M',
        familiesAsSpouse: [],
      }),
    };

    const families: Record<string, Family> = {
      '@F1@': makeFamily({
        id: '@F1@',
        husband: '@ROOT@',
        wife: '@SPOUSE@',
        children: [],
      }),
    };

    const data: GedcomData = { individuals, families };
    const result = extractSubtree(data, '@ROOT@');

    expect(Object.keys(result.individuals)).toHaveLength(2);
    expect(result.individuals['@ROOT@']).toBeDefined();
    expect(result.individuals['@SPOUSE@']).toBeDefined();
    expect(result.individuals['@OTHER@']).toBeUndefined();

    expect(Object.keys(result.families)).toHaveLength(1);
    expect(result.families['@F1@']).toBeDefined();
  });

  test('handles root that does not exist in data (returns empty GedcomData)', () => {
    const data = buildFixture();
    const result = extractSubtree(data, '@NONEXISTENT@');

    expect(Object.keys(result.individuals)).toHaveLength(0);
    expect(Object.keys(result.families)).toHaveLength(0);
  });

  test('does not mutate the original data', () => {
    const data = buildFixture();
    const originalMotherInLawSpouseFams = [...data.individuals['@MOTHER_IN_LAW@'].familiesAsSpouse];

    extractSubtree(data, '@GRANDPA@');

    // Original should be unchanged
    expect(data.individuals['@MOTHER_IN_LAW@'].familiesAsSpouse).toEqual(originalMotherInLawSpouseFams);
    // Original should still have all individuals
    expect(Object.keys(data.individuals)).toHaveLength(11);
    expect(Object.keys(data.families)).toHaveLength(4);
  });

  test('nullifies husband/wife in a family if that spouse is not in the subtree', () => {
    // Create a scenario where a family has one spouse in the subtree and one outside
    // This happens when we include a family because at least one spouse is in the set,
    // but the other spouse is not a descendant/spouse of root
    //
    // Actually, by the inclusion rule (family included if at least one of husband/wife
    // is in the individual set), both spouses would be in the set because
    // getTreeVisibleIndividuals adds spouses. So this edge case would only happen if
    // somehow the family references someone who doesn't exist in individuals at all.
    //
    // Let's test with a family where one spouse reference is dangling (missing individual)
    const individuals: Record<string, Individual> = {
      '@ROOT@': makeIndividual({
        id: '@ROOT@',
        sex: 'M',
        familiesAsSpouse: ['@F1@'],
      }),
    };

    const families: Record<string, Family> = {
      '@F1@': makeFamily({
        id: '@F1@',
        husband: '@ROOT@',
        wife: '@MISSING@', // This person doesn't exist in individuals
        children: [],
      }),
    };

    const data: GedcomData = { individuals, families };
    const result = extractSubtree(data, '@ROOT@');

    // The family should be included because husband (@ROOT@) is in the set
    expect(result.families['@F1@']).toBeDefined();
    // Wife should be null because @MISSING@ is not in the individual set
    expect(result.families['@F1@'].wife).toBeNull();
    expect(result.families['@F1@'].husband).toBe('@ROOT@');
  });
});

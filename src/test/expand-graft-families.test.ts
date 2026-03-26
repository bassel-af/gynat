import { describe, test, expect } from 'vitest';
import type { GedcomData, Individual, Family } from '@/lib/gedcom/types';
import { expandGraftFamilies, MAX_GRAFT_SIBLINGS } from '@/lib/gedcom/graph';

// ---------------------------------------------------------------------------
// Fixture helpers (same pattern as graft-descriptors.test.ts)
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
// Fixture builder:
//
// fullData contains:
//   @ROOT@ (surname: 'السعيد')
//     └── @SON@ (surname: 'السعيد') + @WIFE@ (surname: 'السعيد', married-in)
//           └── @GRANDCHILD@
//
//   Wife's origin family (@FWIFE@):
//     @WIFE_DAD@ + @WIFE_MOM@
//       ├── @WIFE@
//       ├── @WIFE_BRO@
//       └── @WIFE_SIS@
//
// subtree (extractSubtree output) contains:
//   @ROOT@, @SON@, @WIFE@ (familyAsChild = null), @GRANDCHILD@
//   @F1@, @F2@
//   (No wife's family data)
// ---------------------------------------------------------------------------

function buildFullData(): GedcomData {
  const individuals: Record<string, Individual> = {
    '@ROOT@': makeIndividual({
      id: '@ROOT@',
      name: 'Root السعيد',
      surname: 'السعيد',
      familiesAsSpouse: ['@F1@'],
    }),
    '@SON@': makeIndividual({
      id: '@SON@',
      name: 'Son السعيد',
      surname: 'السعيد',
      familiesAsSpouse: ['@F2@'],
      familyAsChild: '@F1@',
    }),
    '@WIFE@': makeIndividual({
      id: '@WIFE@',
      name: 'Wife السعيد',
      surname: 'السعيد',
      sex: 'F',
      familiesAsSpouse: ['@F2@'],
      familyAsChild: '@FWIFE@',
    }),
    '@GRANDCHILD@': makeIndividual({
      id: '@GRANDCHILD@',
      name: 'Grandchild السعيد',
      surname: 'السعيد',
      familyAsChild: '@F2@',
    }),
    '@WIFE_DAD@': makeIndividual({
      id: '@WIFE_DAD@',
      name: 'WifeDad السعيد',
      surname: 'السعيد',
      familiesAsSpouse: ['@FWIFE@'],
    }),
    '@WIFE_MOM@': makeIndividual({
      id: '@WIFE_MOM@',
      name: 'WifeMom',
      sex: 'F',
      familiesAsSpouse: ['@FWIFE@'],
    }),
    '@WIFE_BRO@': makeIndividual({
      id: '@WIFE_BRO@',
      name: 'WifeBro السعيد',
      surname: 'السعيد',
      familyAsChild: '@FWIFE@',
    }),
    '@WIFE_SIS@': makeIndividual({
      id: '@WIFE_SIS@',
      name: 'WifeSis السعيد',
      surname: 'السعيد',
      sex: 'F',
      familyAsChild: '@FWIFE@',
    }),
  };

  const families: Record<string, Family> = {
    '@F1@': makeFamily({
      id: '@F1@',
      husband: '@ROOT@',
      children: ['@SON@'],
    }),
    '@F2@': makeFamily({
      id: '@F2@',
      husband: '@SON@',
      wife: '@WIFE@',
      children: ['@GRANDCHILD@'],
    }),
    '@FWIFE@': makeFamily({
      id: '@FWIFE@',
      husband: '@WIFE_DAD@',
      wife: '@WIFE_MOM@',
      children: ['@WIFE@', '@WIFE_BRO@', '@WIFE_SIS@'],
    }),
  };

  return { individuals, families };
}

function buildSubtree(): GedcomData {
  // This mimics the output of extractSubtree(fullData, '@ROOT@')
  // Wife is included as a spouse, but her familyAsChild is null (not in subtree)
  const individuals: Record<string, Individual> = {
    '@ROOT@': makeIndividual({
      id: '@ROOT@',
      name: 'Root السعيد',
      surname: 'السعيد',
      familiesAsSpouse: ['@F1@'],
    }),
    '@SON@': makeIndividual({
      id: '@SON@',
      name: 'Son السعيد',
      surname: 'السعيد',
      familiesAsSpouse: ['@F2@'],
      familyAsChild: '@F1@',
    }),
    '@WIFE@': makeIndividual({
      id: '@WIFE@',
      name: 'Wife السعيد',
      surname: 'السعيد',
      sex: 'F',
      familiesAsSpouse: ['@F2@'],
      familyAsChild: null, // was '@FWIFE@' in fullData but not in subtree
    }),
    '@GRANDCHILD@': makeIndividual({
      id: '@GRANDCHILD@',
      name: 'Grandchild السعيد',
      surname: 'السعيد',
      familyAsChild: '@F2@',
    }),
  };

  const families: Record<string, Family> = {
    '@F1@': makeFamily({
      id: '@F1@',
      husband: '@ROOT@',
      children: ['@SON@'],
    }),
    '@F2@': makeFamily({
      id: '@F2@',
      husband: '@SON@',
      wife: '@WIFE@',
      children: ['@GRANDCHILD@'],
    }),
  };

  return { individuals, families };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('expandGraftFamilies', () => {
  test('includes parents and siblings of married-in spouse with matching surname', () => {
    const subtree = buildSubtree();
    const fullData = buildFullData();

    const result = expandGraftFamilies(subtree, fullData, '@ROOT@');

    // Parents should be included
    expect(result.individuals['@WIFE_DAD@']).toBeDefined();
    expect(result.individuals['@WIFE_MOM@']).toBeDefined();

    // Siblings should be included
    expect(result.individuals['@WIFE_BRO@']).toBeDefined();
    expect(result.individuals['@WIFE_SIS@']).toBeDefined();

    // Origin family should be included
    expect(result.families['@FWIFE@']).toBeDefined();

    // Original subtree members still present
    expect(result.individuals['@ROOT@']).toBeDefined();
    expect(result.individuals['@SON@']).toBeDefined();
    expect(result.individuals['@WIFE@']).toBeDefined();
    expect(result.individuals['@GRANDCHILD@']).toBeDefined();
  });

  test('does not expand married-in spouse with non-matching surname', () => {
    const subtree = buildSubtree();
    const fullData = buildFullData();

    // Change wife's surname to something different
    fullData.individuals['@WIFE@'] = {
      ...fullData.individuals['@WIFE@'],
      surname: 'الحربي',
    };

    const result = expandGraftFamilies(subtree, fullData, '@ROOT@');

    // No expansion should occur
    expect(result.individuals['@WIFE_DAD@']).toBeUndefined();
    expect(result.individuals['@WIFE_MOM@']).toBeUndefined();
    expect(result.families['@FWIFE@']).toBeUndefined();
  });

  test('returns subtree unchanged when root has no surname', () => {
    const subtree = buildSubtree();
    const fullData = buildFullData();

    // Clear root surname
    fullData.individuals['@ROOT@'] = {
      ...fullData.individuals['@ROOT@'],
      surname: '',
    };

    const result = expandGraftFamilies(subtree, fullData, '@ROOT@');

    // Should be structurally identical to subtree
    expect(Object.keys(result.individuals).sort()).toEqual(
      Object.keys(subtree.individuals).sort()
    );
    expect(Object.keys(result.families).sort()).toEqual(
      Object.keys(subtree.families).sort()
    );
  });

  test('skips spouse with no familyAsChild', () => {
    const subtree = buildSubtree();
    const fullData = buildFullData();

    // Remove wife's familyAsChild in fullData
    fullData.individuals['@WIFE@'] = {
      ...fullData.individuals['@WIFE@'],
      familyAsChild: null,
    };

    const result = expandGraftFamilies(subtree, fullData, '@ROOT@');

    // No expansion
    expect(result.individuals['@WIFE_DAD@']).toBeUndefined();
    expect(result.families['@FWIFE@']).toBeUndefined();
  });

  test('excludes private siblings from expansion', () => {
    const subtree = buildSubtree();
    const fullData = buildFullData();

    // Make wife's sister private
    fullData.individuals['@WIFE_SIS@'] = {
      ...fullData.individuals['@WIFE_SIS@'],
      isPrivate: true,
    };

    const result = expandGraftFamilies(subtree, fullData, '@ROOT@');

    // Brother should still be included, but private sister should not
    expect(result.individuals['@WIFE_BRO@']).toBeDefined();
    expect(result.individuals['@WIFE_SIS@']).toBeUndefined();
  });

  test('caps siblings at MAX_GRAFT_SIBLINGS', () => {
    const subtree = buildSubtree();
    const fullData = buildFullData();

    // Add extra siblings to exceed the cap (already have WIFE_BRO and WIFE_SIS = 2)
    for (let i = 1; i <= 5; i++) {
      const sibId = `@EXTRA_SIB_${i}@`;
      fullData.individuals[sibId] = makeIndividual({
        id: sibId,
        surname: 'السعيد',
        familyAsChild: '@FWIFE@',
      });
      fullData.families['@FWIFE@'].children.push(sibId);
    }
    // Total non-private siblings (excluding WIFE): WIFE_BRO, WIFE_SIS, EXTRA_SIB_1..5 = 7

    const result = expandGraftFamilies(subtree, fullData, '@ROOT@');

    // Count siblings that were added (everyone in result who has familyAsChild = @FWIFE@
    // and is not @WIFE@ herself)
    const addedSiblings = Object.keys(result.individuals).filter((id) => {
      const ind = result.individuals[id];
      return ind.familyAsChild === '@FWIFE@' && id !== '@WIFE@';
    });

    expect(addedSiblings.length).toBe(MAX_GRAFT_SIBLINGS);
  });

  test('updates married-in spouse familyAsChild to point to origin family', () => {
    const subtree = buildSubtree();
    const fullData = buildFullData();

    // In subtree, wife's familyAsChild is null
    expect(subtree.individuals['@WIFE@'].familyAsChild).toBeNull();

    const result = expandGraftFamilies(subtree, fullData, '@ROOT@');

    // After expansion, wife's familyAsChild should point to the origin family
    expect(result.individuals['@WIFE@'].familyAsChild).toBe('@FWIFE@');
  });

  test('does not mutate input subtree or fullData', () => {
    const subtree = buildSubtree();
    const fullData = buildFullData();

    // Take snapshots
    const subtreeSnapshot = JSON.stringify(subtree);
    const fullDataSnapshot = JSON.stringify(fullData);

    expandGraftFamilies(subtree, fullData, '@ROOT@');

    // Inputs should be unchanged
    expect(JSON.stringify(subtree)).toBe(subtreeSnapshot);
    expect(JSON.stringify(fullData)).toBe(fullDataSnapshot);
  });

  test('scopes newly added individuals familiesAsSpouse to families in result', () => {
    const subtree = buildSubtree();
    const fullData = buildFullData();

    // Give WIFE_DAD an extra family that is NOT part of the subtree or expansion
    fullData.individuals['@WIFE_DAD@'] = {
      ...fullData.individuals['@WIFE_DAD@'],
      familiesAsSpouse: ['@FWIFE@', '@F_EXTERNAL@'],
    };
    fullData.families['@F_EXTERNAL@'] = makeFamily({
      id: '@F_EXTERNAL@',
      husband: '@WIFE_DAD@',
      children: ['@SOME_CHILD@'],
    });
    fullData.individuals['@SOME_CHILD@'] = makeIndividual({
      id: '@SOME_CHILD@',
      familyAsChild: '@F_EXTERNAL@',
    });

    const result = expandGraftFamilies(subtree, fullData, '@ROOT@');

    // WIFE_DAD should be in result, but @F_EXTERNAL@ should NOT
    expect(result.individuals['@WIFE_DAD@']).toBeDefined();
    expect(result.families['@F_EXTERNAL@']).toBeUndefined();

    // WIFE_DAD's familiesAsSpouse in result should only include @FWIFE@
    expect(result.individuals['@WIFE_DAD@'].familiesAsSpouse).toEqual(['@FWIFE@']);
  });
});

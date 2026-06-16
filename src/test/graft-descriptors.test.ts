import { describe, test, expect } from 'vitest';
import type { GedcomData, Individual, Family } from '@/lib/gedcom/types';
import { computeGraftDescriptors } from '@/lib/gedcom/graph';

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
    notes: '',
    isDeceased: false,
    isPrivate: false,
    familiesAsSpouse: [],
    kunya: '',
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
// Main tree (root = @ROOT@):
//   @ROOT@
//     └── @SON@ + @WIFE@ (married-in, has parents @WIFE_DAD@ and @WIFE_MOM@, sibling @WIFE_SIS@)
//           └── @GRANDCHILD@
//
// Wife's family:
//   @WIFE_DAD@ + @WIFE_MOM@
//     ├── @WIFE@
//     └── @WIFE_SIS@
// ---------------------------------------------------------------------------

function buildBasicFixture(): GedcomData {
  const individuals: Record<string, Individual> = {
    '@ROOT@': makeIndividual({
      id: '@ROOT@',
      name: 'Root',
      familiesAsSpouse: ['@F1@'],
    }),
    '@SON@': makeIndividual({
      id: '@SON@',
      name: 'Son',
      familiesAsSpouse: ['@F2@'],
      familyAsChild: '@F1@',
    }),
    '@WIFE@': makeIndividual({
      id: '@WIFE@',
      name: 'Wife',
      sex: 'F',
      familiesAsSpouse: ['@F2@'],
      familyAsChild: '@FWIFE@',
    }),
    '@GRANDCHILD@': makeIndividual({
      id: '@GRANDCHILD@',
      name: 'Grandchild',
      familyAsChild: '@F2@',
    }),
    '@WIFE_DAD@': makeIndividual({
      id: '@WIFE_DAD@',
      name: 'WifeDad',
      familiesAsSpouse: ['@FWIFE@'],
    }),
    '@WIFE_MOM@': makeIndividual({
      id: '@WIFE_MOM@',
      name: 'WifeMom',
      sex: 'F',
      familiesAsSpouse: ['@FWIFE@'],
    }),
    '@WIFE_SIS@': makeIndividual({
      id: '@WIFE_SIS@',
      name: 'WifeSis',
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
      children: ['@WIFE@', '@WIFE_SIS@'],
    }),
  };

  return { individuals, families };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeGraftDescriptors', () => {
  test('returns graft descriptor for married-in spouse with parents and siblings', () => {
    const data = buildBasicFixture();
    const grafts = computeGraftDescriptors(data, '@ROOT@');

    // SON has a married-in spouse (WIFE) with parents and siblings
    expect(grafts.has('@SON@')).toBe(true);
    const descriptors = grafts.get('@SON@')!;
    expect(descriptors).toHaveLength(1);

    const graft = descriptors[0];
    expect(graft.spouseId).toBe('@WIFE@');
    expect(graft.hubPersonId).toBe('@SON@');
    expect(graft.parentIds).toContain('@WIFE_DAD@');
    expect(graft.parentIds).toContain('@WIFE_MOM@');
    expect(graft.siblingIds).toContain('@WIFE_SIS@');
    // Spouse herself should NOT be in sibling list
    expect(graft.siblingIds).not.toContain('@WIFE@');
  });

  test('returns empty map when no spouses have external families', () => {
    const data = buildBasicFixture();
    // Remove wife's family link
    data.individuals['@WIFE@'] = {
      ...data.individuals['@WIFE@'],
      familyAsChild: null,
    };

    const grafts = computeGraftDescriptors(data, '@ROOT@');
    expect(grafts.size).toBe(0);
  });

  test('does not create graft for spouse who is a descendant of root', () => {
    // Build a fixture where the spouse IS a descendant of root
    const individuals: Record<string, Individual> = {
      '@ROOT@': makeIndividual({
        id: '@ROOT@',
        familiesAsSpouse: ['@F1@'],
      }),
      '@SON@': makeIndividual({
        id: '@SON@',
        familiesAsSpouse: ['@F3@'],
        familyAsChild: '@F1@',
      }),
      '@DAUGHTER@': makeIndividual({
        id: '@DAUGHTER@',
        sex: 'F',
        familiesAsSpouse: ['@F3@'],
        familyAsChild: '@F1@', // also a child of root
      }),
      '@CHILD@': makeIndividual({
        id: '@CHILD@',
        familyAsChild: '@F3@',
      }),
    };

    const families: Record<string, Family> = {
      '@F1@': makeFamily({
        id: '@F1@',
        husband: '@ROOT@',
        children: ['@SON@', '@DAUGHTER@'],
      }),
      '@F3@': makeFamily({
        id: '@F3@',
        husband: '@SON@',
        wife: '@DAUGHTER@',
        children: ['@CHILD@'],
      }),
    };

    const data: GedcomData = { individuals, families };
    const grafts = computeGraftDescriptors(data, '@ROOT@');

    // DAUGHTER is a descendant of ROOT, so no graft for her
    expect(grafts.size).toBe(0);
  });

  test('caps siblings at MAX_GRAFT_SIBLINGS with overflow count', () => {
    const data = buildBasicFixture();
    // Add 5 more siblings to wife's family (total 6 siblings, cap at 4)
    for (let i = 1; i <= 5; i++) {
      const sibId = `@SIB_${i}@`;
      data.individuals[sibId] = makeIndividual({ id: sibId, familyAsChild: '@FWIFE@' });
      data.families['@FWIFE@'].children.push(sibId);
    }

    const grafts = computeGraftDescriptors(data, '@ROOT@');
    const descriptors = grafts.get('@SON@')!;
    const graft = descriptors[0];

    // Should have at most 4 sibling IDs
    expect(graft.siblingIds.length).toBeLessThanOrEqual(4);
    // Total sibling count should reflect all siblings
    expect(graft.totalSiblingCount).toBe(6); // WIFE_SIS + 5 new ones
  });

  test('handles spouse with parents but no siblings', () => {
    const data = buildBasicFixture();
    // Remove the sister
    delete data.individuals['@WIFE_SIS@'];
    data.families['@FWIFE@'].children = ['@WIFE@'];

    const grafts = computeGraftDescriptors(data, '@ROOT@');
    const descriptors = grafts.get('@SON@')!;
    expect(descriptors).toHaveLength(1);
    expect(descriptors[0].siblingIds).toEqual([]);
    expect(descriptors[0].parentIds.length).toBe(2);
  });

  test('handles root node with married-in spouse', () => {
    // Root itself has a married-in wife with parents
    const individuals: Record<string, Individual> = {
      '@ROOT@': makeIndividual({
        id: '@ROOT@',
        familiesAsSpouse: ['@F1@'],
      }),
      '@ROOT_WIFE@': makeIndividual({
        id: '@ROOT_WIFE@',
        sex: 'F',
        familiesAsSpouse: ['@F1@'],
        familyAsChild: '@FW@',
      }),
      '@CHILD@': makeIndividual({
        id: '@CHILD@',
        familyAsChild: '@F1@',
      }),
      '@WIFE_PARENT@': makeIndividual({
        id: '@WIFE_PARENT@',
        familiesAsSpouse: ['@FW@'],
      }),
    };

    const families: Record<string, Family> = {
      '@F1@': makeFamily({
        id: '@F1@',
        husband: '@ROOT@',
        wife: '@ROOT_WIFE@',
        children: ['@CHILD@'],
      }),
      '@FW@': makeFamily({
        id: '@FW@',
        husband: '@WIFE_PARENT@',
        children: ['@ROOT_WIFE@'],
      }),
    };

    const data: GedcomData = { individuals, families };
    const grafts = computeGraftDescriptors(data, '@ROOT@');

    // Root has a married-in wife with parents
    expect(grafts.has('@ROOT@')).toBe(true);
    const descriptors = grafts.get('@ROOT@')!;
    expect(descriptors[0].spouseId).toBe('@ROOT_WIFE@');
    expect(descriptors[0].parentIds).toContain('@WIFE_PARENT@');
  });

  test('handles private spouse - no graft for private individuals', () => {
    const data = buildBasicFixture();
    data.individuals['@WIFE@'] = {
      ...data.individuals['@WIFE@'],
      isPrivate: true,
    };

    const grafts = computeGraftDescriptors(data, '@ROOT@');
    // Private spouse should not generate a graft
    expect(grafts.size).toBe(0);
  });
});

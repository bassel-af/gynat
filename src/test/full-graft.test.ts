import { describe, test, expect } from 'vitest';
import type { GedcomData, Individual, Family } from '@/lib/gedcom/types';
import { computeFullGraftDescriptors } from '@/lib/gedcom/graph';
import * as gedcomExports from '@/lib/gedcom/index';

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
//     └── @SON@ + @WIFE@ (married-in, family rooted at @WIFE_GRANDPA@)
//           └── @GRANDCHILD@
//
// Wife's full family tree:
//   @WIFE_GRANDPA@
//     └── @WIFE_DAD@ + @WIFE_MOM@
//           ├── @WIFE@
//           ├── @WIFE_SIS@
//           └── @WIFE_BRO@ + @WIFE_BRO_WIFE@
//                 └── @NEPHEW@
// ---------------------------------------------------------------------------

function buildFullGraftFixture(): GedcomData {
  const individuals: Record<string, Individual> = {
    // Main tree
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
    '@GRANDCHILD@': makeIndividual({
      id: '@GRANDCHILD@',
      name: 'Grandchild',
      familyAsChild: '@F2@',
    }),

    // Wife (married-in)
    '@WIFE@': makeIndividual({
      id: '@WIFE@',
      name: 'Wife',
      sex: 'F',
      familiesAsSpouse: ['@F2@'],
      familyAsChild: '@FWIFE@',
    }),

    // Wife's family
    '@WIFE_GRANDPA@': makeIndividual({
      id: '@WIFE_GRANDPA@',
      name: 'WifeGrandpa',
      familiesAsSpouse: ['@FWG@'],
    }),
    '@WIFE_DAD@': makeIndividual({
      id: '@WIFE_DAD@',
      name: 'WifeDad',
      familiesAsSpouse: ['@FWIFE@'],
      familyAsChild: '@FWG@',
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
    '@WIFE_BRO@': makeIndividual({
      id: '@WIFE_BRO@',
      name: 'WifeBro',
      familiesAsSpouse: ['@FBRO@'],
      familyAsChild: '@FWIFE@',
    }),
    '@WIFE_BRO_WIFE@': makeIndividual({
      id: '@WIFE_BRO_WIFE@',
      name: 'WifeBroWife',
      sex: 'F',
      familiesAsSpouse: ['@FBRO@'],
    }),
    '@NEPHEW@': makeIndividual({
      id: '@NEPHEW@',
      name: 'Nephew',
      familyAsChild: '@FBRO@',
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
    '@FWG@': makeFamily({
      id: '@FWG@',
      husband: '@WIFE_GRANDPA@',
      children: ['@WIFE_DAD@'],
    }),
    '@FWIFE@': makeFamily({
      id: '@FWIFE@',
      husband: '@WIFE_DAD@',
      wife: '@WIFE_MOM@',
      children: ['@WIFE@', '@WIFE_SIS@', '@WIFE_BRO@'],
    }),
    '@FBRO@': makeFamily({
      id: '@FBRO@',
      husband: '@WIFE_BRO@',
      wife: '@WIFE_BRO_WIFE@',
      children: ['@NEPHEW@'],
    }),
  };

  return { individuals, families };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeFullGraftDescriptors', () => {
  test('returns full subtree for a married-in spouse', () => {
    const data = buildFullGraftFixture();
    const result = computeFullGraftDescriptors(data, '@ROOT@');

    // Wife's topmost ancestor is @WIFE_GRANDPA@
    expect(result.has('@WIFE_GRANDPA@')).toBe(true);

    const descriptor = result.get('@WIFE_GRANDPA@')!;
    expect(descriptor.graftRootId).toBe('@WIFE_GRANDPA@');

    // The subtree should contain the wife's full family tree
    const subtreeIds = Object.keys(descriptor.subtree.individuals);
    expect(subtreeIds).toContain('@WIFE_GRANDPA@');
    expect(subtreeIds).toContain('@WIFE_DAD@');
    expect(subtreeIds).toContain('@WIFE_MOM@');
    expect(subtreeIds).toContain('@WIFE_SIS@');
    expect(subtreeIds).toContain('@WIFE_BRO@');
    expect(subtreeIds).toContain('@WIFE_BRO_WIFE@');
    expect(subtreeIds).toContain('@NEPHEW@');
  });

  test('subtree contains all descendants of the graft root, not just parents and siblings', () => {
    const data = buildFullGraftFixture();
    const result = computeFullGraftDescriptors(data, '@ROOT@');
    const descriptor = result.get('@WIFE_GRANDPA@')!;

    // Nephew is a grandchild of WifeGrandpa - should be included
    expect(Object.keys(descriptor.subtree.individuals)).toContain('@NEPHEW@');
    // WifeBroWife is a spouse in the subtree
    expect(Object.keys(descriptor.subtree.individuals)).toContain('@WIFE_BRO_WIFE@');
    // The subtree should have the family @FBRO@ (WifeBro + WifeBroWife's family)
    expect(Object.keys(descriptor.subtree.families)).toContain('@FBRO@');
  });

  test('deduplication: two spouses from the same family produce one descriptor with two spouseConnections', () => {
    // Build a fixture where two descendants marry two siblings from the same external family
    const individuals: Record<string, Individual> = {
      '@ROOT@': makeIndividual({
        id: '@ROOT@',
        familiesAsSpouse: ['@F1@'],
      }),
      '@SON1@': makeIndividual({
        id: '@SON1@',
        familiesAsSpouse: ['@F2@'],
        familyAsChild: '@F1@',
      }),
      '@SON2@': makeIndividual({
        id: '@SON2@',
        familiesAsSpouse: ['@F3@'],
        familyAsChild: '@F1@',
      }),
      // Two sisters from the same external family
      '@EXT_DAD@': makeIndividual({
        id: '@EXT_DAD@',
        familiesAsSpouse: ['@FEXT@'],
      }),
      '@SIS1@': makeIndividual({
        id: '@SIS1@',
        sex: 'F',
        familiesAsSpouse: ['@F2@'],
        familyAsChild: '@FEXT@',
      }),
      '@SIS2@': makeIndividual({
        id: '@SIS2@',
        sex: 'F',
        familiesAsSpouse: ['@F3@'],
        familyAsChild: '@FEXT@',
      }),
    };

    const families: Record<string, Family> = {
      '@F1@': makeFamily({
        id: '@F1@',
        husband: '@ROOT@',
        children: ['@SON1@', '@SON2@'],
      }),
      '@F2@': makeFamily({
        id: '@F2@',
        husband: '@SON1@',
        wife: '@SIS1@',
      }),
      '@F3@': makeFamily({
        id: '@F3@',
        husband: '@SON2@',
        wife: '@SIS2@',
      }),
      '@FEXT@': makeFamily({
        id: '@FEXT@',
        husband: '@EXT_DAD@',
        children: ['@SIS1@', '@SIS2@'],
      }),
    };

    const data: GedcomData = { individuals, families };
    const result = computeFullGraftDescriptors(data, '@ROOT@');

    // Should produce only ONE descriptor keyed by @EXT_DAD@ (the topmost ancestor)
    expect(result.size).toBe(1);
    expect(result.has('@EXT_DAD@')).toBe(true);

    const descriptor = result.get('@EXT_DAD@')!;
    // Should have two spouse connections
    expect(descriptor.spouseConnections).toHaveLength(2);

    const spouseIds = descriptor.spouseConnections.map(c => c.spouseId);
    expect(spouseIds).toContain('@SIS1@');
    expect(spouseIds).toContain('@SIS2@');
  });

  test('non-married-in spouses (descendants of root) are not grafted', () => {
    // Build a fixture where the spouse IS a descendant of root (cousin marriage)
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
        familyAsChild: '@F1@',
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
      }),
    };

    const data: GedcomData = { individuals, families };
    const result = computeFullGraftDescriptors(data, '@ROOT@');

    // DAUGHTER is a descendant of ROOT, so no graft
    expect(result.size).toBe(0);
  });

  test('spouse with no familyAsChild produces no graft', () => {
    const individuals: Record<string, Individual> = {
      '@ROOT@': makeIndividual({
        id: '@ROOT@',
        familiesAsSpouse: ['@F1@'],
      }),
      '@SON@': makeIndividual({
        id: '@SON@',
        familiesAsSpouse: ['@F2@'],
        familyAsChild: '@F1@',
      }),
      '@WIFE@': makeIndividual({
        id: '@WIFE@',
        sex: 'F',
        familiesAsSpouse: ['@F2@'],
        familyAsChild: null, // No family of origin
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
      }),
    };

    const data: GedcomData = { individuals, families };
    const result = computeFullGraftDescriptors(data, '@ROOT@');

    expect(result.size).toBe(0);
  });

  test('spouse whose topmost ancestor is herself (findTopmostAncestor returns null) but has parents produces graft at parent level', () => {
    // Wife has parents but no grandparent — her dad is already a root
    const individuals: Record<string, Individual> = {
      '@ROOT@': makeIndividual({
        id: '@ROOT@',
        familiesAsSpouse: ['@F1@'],
      }),
      '@SON@': makeIndividual({
        id: '@SON@',
        familiesAsSpouse: ['@F2@'],
        familyAsChild: '@F1@',
      }),
      '@WIFE@': makeIndividual({
        id: '@WIFE@',
        sex: 'F',
        familiesAsSpouse: ['@F2@'],
        familyAsChild: '@FW@',
      }),
      '@WIFE_DAD@': makeIndividual({
        id: '@WIFE_DAD@',
        familiesAsSpouse: ['@FW@'],
        // No familyAsChild — he IS the root of his tree
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
      }),
      '@FW@': makeFamily({
        id: '@FW@',
        husband: '@WIFE_DAD@',
        children: ['@WIFE@'],
      }),
    };

    const data: GedcomData = { individuals, families };
    const result = computeFullGraftDescriptors(data, '@ROOT@');

    // findTopmostAncestor(@WIFE@) returns @WIFE_DAD@ (since @WIFE@ has a familyAsChild)
    // So there SHOULD be a graft rooted at @WIFE_DAD@
    expect(result.size).toBe(1);
    expect(result.has('@WIFE_DAD@')).toBe(true);
  });
});

describe('computeFullGraftDescriptors export', () => {
  test('is exported from @/lib/gedcom/index.ts', () => {
    expect(typeof gedcomExports.computeFullGraftDescriptors).toBe('function');
  });
});

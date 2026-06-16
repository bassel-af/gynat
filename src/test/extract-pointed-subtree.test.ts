import { describe, test, expect } from 'vitest';
import type { GedcomData, Individual, Family } from '@/lib/gedcom/types';
import { extractPointedSubtree } from '@/lib/tree/branch-pointer-merge';

// ---------------------------------------------------------------------------
// Fixture builder helpers
// ---------------------------------------------------------------------------

const EMPTY_EVENT = { date: '', hijriDate: '', place: '', description: '', notes: '' };

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
// Build a 4-generation fixture tree:
//
// Root (gen 0) + RootWife
//   ├── Son1 (gen 1) + DaughterInLaw (married-in, has parents)
//   │     ├── Grandson1 (gen 2)
//   │     └── Grandson2 (gen 2) + GrandDaughterInLaw
//   │           └── GreatGrandson (gen 3)
//   └── Son2 (gen 1)
//
// DaughterInLaw's origin family (for graft testing):
//   FatherInLaw + MotherInLaw
//     ├── DaughterInLaw
//     └── SisterInLaw
// ---------------------------------------------------------------------------

function buildFixture(): GedcomData {
  const individuals: Record<string, Individual> = {
    root: makeIndividual({
      id: 'root', sex: 'M',
      familiesAsSpouse: ['f-root'],
    }),
    'root-wife': makeIndividual({
      id: 'root-wife', sex: 'F',
      familiesAsSpouse: ['f-root'],
    }),
    son1: makeIndividual({
      id: 'son1', sex: 'M',
      familyAsChild: 'f-root',
      familiesAsSpouse: ['f-son1'],
    }),
    son2: makeIndividual({
      id: 'son2', sex: 'M',
      familyAsChild: 'f-root',
    }),
    'daughter-in-law': makeIndividual({
      id: 'daughter-in-law', sex: 'F',
      familiesAsSpouse: ['f-son1'],
      familyAsChild: 'f-inlaw-origin',
    }),
    grandson1: makeIndividual({
      id: 'grandson1', sex: 'M',
      familyAsChild: 'f-son1',
    }),
    grandson2: makeIndividual({
      id: 'grandson2', sex: 'M',
      familyAsChild: 'f-son1',
      familiesAsSpouse: ['f-grandson2'],
    }),
    'grand-daughter-in-law': makeIndividual({
      id: 'grand-daughter-in-law', sex: 'F',
      familiesAsSpouse: ['f-grandson2'],
    }),
    'great-grandson': makeIndividual({
      id: 'great-grandson', sex: 'M',
      familyAsChild: 'f-grandson2',
    }),
    // In-law origin family
    'father-in-law': makeIndividual({
      id: 'father-in-law', sex: 'M',
      familiesAsSpouse: ['f-inlaw-origin'],
    }),
    'mother-in-law': makeIndividual({
      id: 'mother-in-law', sex: 'F',
      familiesAsSpouse: ['f-inlaw-origin'],
    }),
    'sister-in-law': makeIndividual({
      id: 'sister-in-law', sex: 'F',
      familyAsChild: 'f-inlaw-origin',
    }),
  };

  const families: Record<string, Family> = {
    'f-root': makeFamily({
      id: 'f-root',
      husband: 'root',
      wife: 'root-wife',
      children: ['son1', 'son2'],
    }),
    'f-son1': makeFamily({
      id: 'f-son1',
      husband: 'son1',
      wife: 'daughter-in-law',
      children: ['grandson1', 'grandson2'],
    }),
    'f-grandson2': makeFamily({
      id: 'f-grandson2',
      husband: 'grandson2',
      wife: 'grand-daughter-in-law',
      children: ['great-grandson'],
    }),
    'f-inlaw-origin': makeFamily({
      id: 'f-inlaw-origin',
      husband: 'father-in-law',
      wife: 'mother-in-law',
      children: ['daughter-in-law', 'sister-in-law'],
    }),
  };

  return { individuals, families };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractPointedSubtree', () => {
  describe('basic extraction without depth limit', () => {
    test('returns the full subtree when depthLimit is null (unlimited)', () => {
      const data = buildFixture();
      const result = extractPointedSubtree(data, {
        rootIndividualId: 'root',
        depthLimit: null,
        includeGrafts: false,
      });

      // Should include root + all descendants + their spouses (but not in-law origin family)
      const ids = Object.keys(result.individuals);
      expect(ids).toContain('root');
      expect(ids).toContain('root-wife');
      expect(ids).toContain('son1');
      expect(ids).toContain('son2');
      expect(ids).toContain('daughter-in-law');
      expect(ids).toContain('grandson1');
      expect(ids).toContain('grandson2');
      expect(ids).toContain('grand-daughter-in-law');
      expect(ids).toContain('great-grandson');
    });

    test('excludes in-law origin family when includeGrafts is false', () => {
      const data = buildFixture();
      const result = extractPointedSubtree(data, {
        rootIndividualId: 'root',
        depthLimit: null,
        includeGrafts: false,
      });

      const ids = Object.keys(result.individuals);
      expect(ids).not.toContain('father-in-law');
      expect(ids).not.toContain('mother-in-law');
      expect(ids).not.toContain('sister-in-law');
      expect(result.families['f-inlaw-origin']).toBeUndefined();
    });
  });

  describe('depth limiting', () => {
    test('depthLimit 0 returns only the root and their spouse', () => {
      const data = buildFixture();
      const result = extractPointedSubtree(data, {
        rootIndividualId: 'root',
        depthLimit: 0,
        includeGrafts: false,
      });

      const ids = Object.keys(result.individuals);
      expect(ids).toContain('root');
      expect(ids).toContain('root-wife');
      expect(ids).not.toContain('son1');
      expect(ids).not.toContain('son2');
    });

    test('depthLimit 1 returns root + children + their spouses, not grandchildren', () => {
      const data = buildFixture();
      const result = extractPointedSubtree(data, {
        rootIndividualId: 'root',
        depthLimit: 1,
        includeGrafts: false,
      });

      const ids = Object.keys(result.individuals);
      // Gen 0: root + root-wife
      expect(ids).toContain('root');
      expect(ids).toContain('root-wife');
      // Gen 1: son1 + daughter-in-law, son2
      expect(ids).toContain('son1');
      expect(ids).toContain('daughter-in-law');
      expect(ids).toContain('son2');
      // Gen 2: should NOT be included
      expect(ids).not.toContain('grandson1');
      expect(ids).not.toContain('grandson2');
      expect(ids).not.toContain('great-grandson');
    });

    test('depthLimit 2 returns root + children + grandchildren + spouses, not great-grandchildren', () => {
      const data = buildFixture();
      const result = extractPointedSubtree(data, {
        rootIndividualId: 'root',
        depthLimit: 2,
        includeGrafts: false,
      });

      const ids = Object.keys(result.individuals);
      expect(ids).toContain('root');
      expect(ids).toContain('son1');
      expect(ids).toContain('grandson1');
      expect(ids).toContain('grandson2');
      expect(ids).toContain('grand-daughter-in-law');
      // Gen 3: should NOT be included
      expect(ids).not.toContain('great-grandson');
    });

    test('depthLimit 3 includes all 4 generations', () => {
      const data = buildFixture();
      const result = extractPointedSubtree(data, {
        rootIndividualId: 'root',
        depthLimit: 3,
        includeGrafts: false,
      });

      const ids = Object.keys(result.individuals);
      expect(ids).toContain('great-grandson');
    });

    test('families are filtered to only include members within the depth limit', () => {
      const data = buildFixture();
      const result = extractPointedSubtree(data, {
        rootIndividualId: 'root',
        depthLimit: 1,
        includeGrafts: false,
      });

      // f-root should exist (root family)
      expect(result.families['f-root']).toBeDefined();
      // f-son1 should exist (son1 is a spouse in this family and is within depth)
      // BUT its children should be filtered to only those within depth
      expect(result.families['f-son1']).toBeDefined();
      expect(result.families['f-son1'].children).toEqual([]);
      // f-grandson2 should NOT exist
      expect(result.families['f-grandson2']).toBeUndefined();
    });

    test('cross-references are valid after depth limiting', () => {
      const data = buildFixture();
      const result = extractPointedSubtree(data, {
        rootIndividualId: 'root',
        depthLimit: 1,
        includeGrafts: false,
      });

      // Every familyAsChild reference should point to a family in the result
      for (const [, ind] of Object.entries(result.individuals)) {
        if (ind.familyAsChild) {
          expect(result.families[ind.familyAsChild]).toBeDefined();
        }
      }

      // Every familiesAsSpouse reference should point to a family in the result
      for (const [, ind] of Object.entries(result.individuals)) {
        for (const famId of ind.familiesAsSpouse) {
          expect(result.families[famId]).toBeDefined();
        }
      }

      // Every family husband/wife/children reference should point to an individual in the result
      for (const [, fam] of Object.entries(result.families)) {
        if (fam.husband) expect(result.individuals[fam.husband]).toBeDefined();
        if (fam.wife) expect(result.individuals[fam.wife]).toBeDefined();
        for (const childId of fam.children) {
          expect(result.individuals[childId]).toBeDefined();
        }
      }
    });
  });

  describe('graft inclusion', () => {
    test('includeGrafts true includes in-law origin family', () => {
      const data = buildFixture();
      const result = extractPointedSubtree(data, {
        rootIndividualId: 'root',
        depthLimit: null,
        includeGrafts: true,
      });

      const ids = Object.keys(result.individuals);
      expect(ids).toContain('father-in-law');
      expect(ids).toContain('mother-in-law');
      expect(ids).toContain('sister-in-law');
      expect(result.families['f-inlaw-origin']).toBeDefined();
    });

    test('includeGrafts true with depth limit still includes grafts for spouses within depth', () => {
      const data = buildFixture();
      const result = extractPointedSubtree(data, {
        rootIndividualId: 'root',
        depthLimit: 1,
        includeGrafts: true,
      });

      const ids = Object.keys(result.individuals);
      // daughter-in-law is within depth 1 (married to son1)
      expect(ids).toContain('daughter-in-law');
      // Her graft data should be included
      expect(ids).toContain('father-in-law');
      expect(ids).toContain('mother-in-law');
      expect(ids).toContain('sister-in-law');
    });

    test('includeGrafts true does NOT include grafts for spouses beyond depth limit', () => {
      const data = buildFixture();
      const result = extractPointedSubtree(data, {
        rootIndividualId: 'root',
        depthLimit: 0,
        includeGrafts: true,
      });

      const ids = Object.keys(result.individuals);
      // daughter-in-law is NOT within depth 0 (she's at depth 1)
      // So her graft data should NOT be included
      expect(ids).not.toContain('father-in-law');
      expect(ids).not.toContain('mother-in-law');
      expect(ids).not.toContain('sister-in-law');
    });
  });

  describe('edge cases', () => {
    test('nonexistent root returns empty GedcomData', () => {
      const data = buildFixture();
      const result = extractPointedSubtree(data, {
        rootIndividualId: 'nonexistent',
        depthLimit: null,
        includeGrafts: false,
      });

      expect(Object.keys(result.individuals)).toHaveLength(0);
      expect(Object.keys(result.families)).toHaveLength(0);
    });

    test('root with no descendants returns just root and spouse', () => {
      const data = buildFixture();
      const result = extractPointedSubtree(data, {
        rootIndividualId: 'son2',
        depthLimit: null,
        includeGrafts: false,
      });

      const ids = Object.keys(result.individuals);
      expect(ids).toContain('son2');
      // son2 has no families as spouse, so just son2
      expect(ids).toHaveLength(1);
    });

    test('does not mutate the original data', () => {
      const data = buildFixture();
      const originalIndCount = Object.keys(data.individuals).length;
      const originalFamCount = Object.keys(data.families).length;

      extractPointedSubtree(data, {
        rootIndividualId: 'root',
        depthLimit: 1,
        includeGrafts: true,
      });

      expect(Object.keys(data.individuals)).toHaveLength(originalIndCount);
      expect(Object.keys(data.families)).toHaveLength(originalFamCount);
    });
  });
});

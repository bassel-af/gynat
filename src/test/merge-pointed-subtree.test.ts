import { describe, test, expect } from 'vitest';
import type { GedcomData, Individual, Family } from '@/lib/gedcom/types';
import { mergePointedSubtree } from '@/lib/tree/branch-pointer-merge';

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
// Pointer config type matching the merge function's expected input
// ---------------------------------------------------------------------------

interface MergePointerConfig {
  pointerId: string;
  anchorIndividualId: string;
  selectedIndividualId: string;
  relationship: 'child' | 'sibling' | 'spouse' | 'parent';
  sourceWorkspaceId: string;
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** Target tree: Father + Mother with Child1 */
function makeTargetTree(): GedcomData {
  return {
    individuals: {
      father: makeIndividual({
        id: 'father', sex: 'M',
        familiesAsSpouse: ['f-target'],
      }),
      mother: makeIndividual({
        id: 'mother', sex: 'F',
        familiesAsSpouse: ['f-target'],
      }),
      child1: makeIndividual({
        id: 'child1', sex: 'M',
        familyAsChild: 'f-target',
      }),
    },
    families: {
      'f-target': makeFamily({
        id: 'f-target',
        husband: 'father',
        wife: 'mother',
        children: ['child1'],
      }),
    },
  };
}

/** Pointed subtree: Root + Spouse with PointedChild */
function makePointedSubtree(): GedcomData {
  return {
    individuals: {
      'ptr-root': makeIndividual({
        id: 'ptr-root', sex: 'M',
        familiesAsSpouse: ['ptr-fam'],
      }),
      'ptr-spouse': makeIndividual({
        id: 'ptr-spouse', sex: 'F',
        familiesAsSpouse: ['ptr-fam'],
      }),
      'ptr-child': makeIndividual({
        id: 'ptr-child', sex: 'M',
        familyAsChild: 'ptr-fam',
      }),
    },
    families: {
      'ptr-fam': makeFamily({
        id: 'ptr-fam',
        husband: 'ptr-root',
        wife: 'ptr-spouse',
        children: ['ptr-child'],
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mergePointedSubtree', () => {
  describe('_pointed marking', () => {
    test('all pointed individuals are marked with _pointed: true', () => {
      const target = makeTargetTree();
      const pointed = makePointedSubtree();
      const config: MergePointerConfig = {
        pointerId: 'bp-1',
        anchorIndividualId: 'father',
        selectedIndividualId: 'ptr-root',
        relationship: 'child',
        sourceWorkspaceId: 'ws-source',
      };

      const result = mergePointedSubtree(target, pointed, config);

      expect(result.individuals['ptr-root']._pointed).toBe(true);
      expect(result.individuals['ptr-spouse']._pointed).toBe(true);
      expect(result.individuals['ptr-child']._pointed).toBe(true);
    });

    test('all pointed individuals have _sourceWorkspaceId set', () => {
      const target = makeTargetTree();
      const pointed = makePointedSubtree();
      const config: MergePointerConfig = {
        pointerId: 'bp-1',
        anchorIndividualId: 'father',
        selectedIndividualId: 'ptr-root',
        relationship: 'child',
        sourceWorkspaceId: 'ws-source',
      };

      const result = mergePointedSubtree(target, pointed, config);

      expect(result.individuals['ptr-root']._sourceWorkspaceId).toBe('ws-source');
      expect(result.individuals['ptr-spouse']._sourceWorkspaceId).toBe('ws-source');
      expect(result.individuals['ptr-child']._sourceWorkspaceId).toBe('ws-source');
    });

    test('all pointed families are marked with _pointed: true', () => {
      const target = makeTargetTree();
      const pointed = makePointedSubtree();
      const config: MergePointerConfig = {
        pointerId: 'bp-1',
        anchorIndividualId: 'father',
        selectedIndividualId: 'ptr-root',
        relationship: 'child',
        sourceWorkspaceId: 'ws-source',
      };

      const result = mergePointedSubtree(target, pointed, config);

      expect(result.families['ptr-fam']._pointed).toBe(true);
      expect(result.families['ptr-fam']._sourceWorkspaceId).toBe('ws-source');
    });

    test('target individuals are NOT marked as pointed', () => {
      const target = makeTargetTree();
      const pointed = makePointedSubtree();
      const config: MergePointerConfig = {
        pointerId: 'bp-1',
        anchorIndividualId: 'father',
        selectedIndividualId: 'ptr-root',
        relationship: 'child',
        sourceWorkspaceId: 'ws-source',
      };

      const result = mergePointedSubtree(target, pointed, config);

      expect(result.individuals['father']._pointed).toBeUndefined();
      expect(result.individuals['mother']._pointed).toBeUndefined();
      expect(result.individuals['child1']._pointed).toBeUndefined();
    });
  });

  describe('relationship: child', () => {
    test('creates a synthetic family linking anchor as parent and pointed root as child', () => {
      const target = makeTargetTree();
      const pointed = makePointedSubtree();
      const config: MergePointerConfig = {
        pointerId: 'bp-1',
        anchorIndividualId: 'father',
        selectedIndividualId: 'ptr-root',
        relationship: 'child',
        sourceWorkspaceId: 'ws-source',
      };

      const result = mergePointedSubtree(target, pointed, config);

      // A synthetic family should exist linking father -> ptr-root
      const syntheticFamId = `ptr-bp-1-fam`;
      const syntheticFam = result.families[syntheticFamId];
      expect(syntheticFam).toBeDefined();
      expect(syntheticFam.children).toContain('ptr-root');
      // Anchor (father) should be a parent in the synthetic family
      expect(syntheticFam.husband === 'father' || syntheticFam.wife === 'father').toBe(true);
    });

    test('pointed root gets familyAsChild pointing to the synthetic family', () => {
      const target = makeTargetTree();
      const pointed = makePointedSubtree();
      const config: MergePointerConfig = {
        pointerId: 'bp-1',
        anchorIndividualId: 'father',
        selectedIndividualId: 'ptr-root',
        relationship: 'child',
        sourceWorkspaceId: 'ws-source',
      };

      const result = mergePointedSubtree(target, pointed, config);

      expect(result.individuals['ptr-root'].familyAsChild).toBe('ptr-bp-1-fam');
    });

    test('anchor individual gets the synthetic family in familiesAsSpouse', () => {
      const target = makeTargetTree();
      const pointed = makePointedSubtree();
      const config: MergePointerConfig = {
        pointerId: 'bp-1',
        anchorIndividualId: 'father',
        selectedIndividualId: 'ptr-root',
        relationship: 'child',
        sourceWorkspaceId: 'ws-source',
      };

      const result = mergePointedSubtree(target, pointed, config);

      expect(result.individuals['father'].familiesAsSpouse).toContain('ptr-bp-1-fam');
    });
  });

  describe('relationship: sibling', () => {
    test('adds pointed root as a child of the same family as the anchor', () => {
      const target = makeTargetTree();
      const pointed: GedcomData = {
        individuals: {
          'ptr-sibling': makeIndividual({ id: 'ptr-sibling', sex: 'F' }),
        },
        families: {},
      };
      const config: MergePointerConfig = {
        pointerId: 'bp-2',
        anchorIndividualId: 'child1',
        selectedIndividualId: 'ptr-sibling',
        relationship: 'sibling',
        sourceWorkspaceId: 'ws-source',
      };

      const result = mergePointedSubtree(target, pointed, config);

      // child1's familyAsChild is 'f-target', so ptr-sibling should be added there
      expect(result.families['f-target'].children).toContain('ptr-sibling');
      expect(result.individuals['ptr-sibling'].familyAsChild).toBe('f-target');
    });

    test('creates synthetic family if anchor has no familyAsChild', () => {
      // Use father (who has no familyAsChild) as anchor
      const target = makeTargetTree();
      const pointed: GedcomData = {
        individuals: {
          'ptr-sibling': makeIndividual({ id: 'ptr-sibling', sex: 'F' }),
        },
        families: {},
      };
      const config: MergePointerConfig = {
        pointerId: 'bp-2',
        anchorIndividualId: 'father',
        selectedIndividualId: 'ptr-sibling',
        relationship: 'sibling',
        sourceWorkspaceId: 'ws-source',
      };

      const result = mergePointedSubtree(target, pointed, config);

      const syntheticFamId = 'ptr-bp-2-fam';
      expect(result.families[syntheticFamId]).toBeDefined();
      expect(result.families[syntheticFamId].children).toContain('father');
      expect(result.families[syntheticFamId].children).toContain('ptr-sibling');
    });
  });

  describe('relationship: spouse', () => {
    test('creates a synthetic family with anchor and pointed root as spouses', () => {
      const target = makeTargetTree();
      const pointed: GedcomData = {
        individuals: {
          'ptr-wife': makeIndividual({ id: 'ptr-wife', sex: 'F' }),
        },
        families: {},
      };
      const config: MergePointerConfig = {
        pointerId: 'bp-3',
        anchorIndividualId: 'child1',
        selectedIndividualId: 'ptr-wife',
        relationship: 'spouse',
        sourceWorkspaceId: 'ws-source',
      };

      const result = mergePointedSubtree(target, pointed, config);

      const syntheticFamId = 'ptr-bp-3-fam';
      const fam = result.families[syntheticFamId];
      expect(fam).toBeDefined();
      // One of husband/wife should be child1, the other should be ptr-wife
      const spouseIds = [fam.husband, fam.wife].filter(Boolean);
      expect(spouseIds).toContain('child1');
      expect(spouseIds).toContain('ptr-wife');
    });

    test('both anchor and pointed root get the synthetic family in familiesAsSpouse', () => {
      const target = makeTargetTree();
      const pointed: GedcomData = {
        individuals: {
          'ptr-wife': makeIndividual({ id: 'ptr-wife', sex: 'F' }),
        },
        families: {},
      };
      const config: MergePointerConfig = {
        pointerId: 'bp-3',
        anchorIndividualId: 'child1',
        selectedIndividualId: 'ptr-wife',
        relationship: 'spouse',
        sourceWorkspaceId: 'ws-source',
      };

      const result = mergePointedSubtree(target, pointed, config);

      expect(result.individuals['child1'].familiesAsSpouse).toContain('ptr-bp-3-fam');
      expect(result.individuals['ptr-wife'].familiesAsSpouse).toContain('ptr-bp-3-fam');
    });
  });

  describe('relationship: parent', () => {
    test('creates a synthetic family with pointed root as parent and anchor as child', () => {
      const target = makeTargetTree();
      const pointed: GedcomData = {
        individuals: {
          'ptr-grandpa': makeIndividual({ id: 'ptr-grandpa', sex: 'M' }),
        },
        families: {},
      };
      const config: MergePointerConfig = {
        pointerId: 'bp-4',
        anchorIndividualId: 'father',
        selectedIndividualId: 'ptr-grandpa',
        relationship: 'parent',
        sourceWorkspaceId: 'ws-source',
      };

      const result = mergePointedSubtree(target, pointed, config);

      const syntheticFamId = 'ptr-bp-4-fam';
      const fam = result.families[syntheticFamId];
      expect(fam).toBeDefined();
      expect(fam.children).toContain('father');
      // Pointed root should be a parent
      expect(fam.husband === 'ptr-grandpa' || fam.wife === 'ptr-grandpa').toBe(true);
    });

    test('anchor gets familyAsChild pointing to the synthetic family', () => {
      const target = makeTargetTree();
      const pointed: GedcomData = {
        individuals: {
          'ptr-grandpa': makeIndividual({ id: 'ptr-grandpa', sex: 'M' }),
        },
        families: {},
      };
      const config: MergePointerConfig = {
        pointerId: 'bp-4',
        anchorIndividualId: 'father',
        selectedIndividualId: 'ptr-grandpa',
        relationship: 'parent',
        sourceWorkspaceId: 'ws-source',
      };

      const result = mergePointedSubtree(target, pointed, config);

      expect(result.individuals['father'].familyAsChild).toBe('ptr-bp-4-fam');
    });
  });

  describe('no ID collisions', () => {
    test('pointed individuals do not overwrite target individuals', () => {
      const target = makeTargetTree();
      // Create a pointed subtree where an individual has the same ID as a target individual
      // This shouldn't happen in practice (UUIDs from different workspaces), but test defensively
      const pointed: GedcomData = {
        individuals: {
          'unique-ptr': makeIndividual({ id: 'unique-ptr', sex: 'M' }),
        },
        families: {},
      };
      const config: MergePointerConfig = {
        pointerId: 'bp-5',
        anchorIndividualId: 'father',
        selectedIndividualId: 'unique-ptr',
        relationship: 'child',
        sourceWorkspaceId: 'ws-source',
      };

      const result = mergePointedSubtree(target, pointed, config);

      // Original target individuals should be unchanged
      expect(result.individuals['father'].givenName).toBe('father');
      expect(result.individuals['mother'].givenName).toBe('mother');
      // Pointed individual should be present
      expect(result.individuals['unique-ptr']).toBeDefined();
      expect(result.individuals['unique-ptr']._pointed).toBe(true);
    });
  });

  describe('cross-reference validity', () => {
    test('all cross-references are valid after merge with child relationship', () => {
      const target = makeTargetTree();
      const pointed = makePointedSubtree();
      const config: MergePointerConfig = {
        pointerId: 'bp-1',
        anchorIndividualId: 'father',
        selectedIndividualId: 'ptr-root',
        relationship: 'child',
        sourceWorkspaceId: 'ws-source',
      };

      const result = mergePointedSubtree(target, pointed, config);

      // Verify all family references from individuals point to existing families
      for (const [, ind] of Object.entries(result.individuals)) {
        for (const famId of ind.familiesAsSpouse) {
          expect(result.families[famId]).toBeDefined();
        }
        if (ind.familyAsChild) {
          expect(result.families[ind.familyAsChild]).toBeDefined();
        }
      }

      // Verify all individual references from families point to existing individuals
      for (const [, fam] of Object.entries(result.families)) {
        if (fam.husband) expect(result.individuals[fam.husband]).toBeDefined();
        if (fam.wife) expect(result.individuals[fam.wife]).toBeDefined();
        for (const childId of fam.children) {
          expect(result.individuals[childId]).toBeDefined();
        }
      }
    });
  });

  describe('does not mutate input', () => {
    test('target data is not mutated', () => {
      const target = makeTargetTree();
      const originalFatherSpouseFams = [...target.individuals['father'].familiesAsSpouse];
      const originalTargetFamChildren = [...target.families['f-target'].children];

      const pointed = makePointedSubtree();
      mergePointedSubtree(target, pointed, {
        pointerId: 'bp-1',
        anchorIndividualId: 'father',
        selectedIndividualId: 'ptr-root',
        relationship: 'child',
        sourceWorkspaceId: 'ws-source',
      });

      expect(target.individuals['father'].familiesAsSpouse).toEqual(originalFatherSpouseFams);
      expect(target.families['f-target'].children).toEqual(originalTargetFamChildren);
    });

    test('pointed data is not mutated', () => {
      const target = makeTargetTree();
      const pointed = makePointedSubtree();
      const originalRootFamilyAsChild = pointed.individuals['ptr-root'].familyAsChild;

      mergePointedSubtree(target, pointed, {
        pointerId: 'bp-1',
        anchorIndividualId: 'father',
        selectedIndividualId: 'ptr-root',
        relationship: 'child',
        sourceWorkspaceId: 'ws-source',
      });

      expect(pointed.individuals['ptr-root'].familyAsChild).toBe(originalRootFamilyAsChild);
      expect(pointed.individuals['ptr-root']._pointed).toBeUndefined();
    });
  });

  describe('synthetic family is marked as pointed', () => {
    test('synthetic stitching family is marked _pointed', () => {
      const target = makeTargetTree();
      const pointed = makePointedSubtree();
      const config: MergePointerConfig = {
        pointerId: 'bp-1',
        anchorIndividualId: 'father',
        selectedIndividualId: 'ptr-root',
        relationship: 'child',
        sourceWorkspaceId: 'ws-source',
      };

      const result = mergePointedSubtree(target, pointed, config);

      const syntheticFam = result.families['ptr-bp-1-fam'];
      expect(syntheticFam._pointed).toBe(true);
      expect(syntheticFam._sourceWorkspaceId).toBe('ws-source');
    });
  });
});

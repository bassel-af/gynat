import { describe, test, expect } from 'vitest';
import type { GedcomData, Individual, Family } from '@/lib/gedcom/types';
import { prepareDeepCopy } from '@/lib/tree/branch-pointer-deep-copy';

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
// Test fixtures
// ---------------------------------------------------------------------------

/** Pointed subtree: Root + Spouse with Child, Root has placeIds */
function makePointedSubtree(): GedcomData {
  return {
    individuals: {
      'src-root': makeIndividual({
        id: 'src-root', sex: 'F', givenName: 'فدوى', surname: 'شربك',
        familiesAsSpouse: ['src-fam'],
        birthPlace: 'مكة المكرمة',
        birthPlaceId: 'place-makkah-uuid',
        _pointed: true,
        _sourceWorkspaceId: 'ws-source',
      }),
      'src-spouse': makeIndividual({
        id: 'src-spouse', sex: 'M', givenName: 'أحمد',
        familiesAsSpouse: ['src-fam'],
        _pointed: true,
        _sourceWorkspaceId: 'ws-source',
      }),
      'src-child': makeIndividual({
        id: 'src-child', sex: 'M', givenName: 'محمد',
        familyAsChild: 'src-fam',
        deathPlace: 'المدينة المنورة',
        deathPlaceId: 'place-madinah-uuid',
        _pointed: true,
        _sourceWorkspaceId: 'ws-source',
      }),
    },
    families: {
      'src-fam': makeFamily({
        id: 'src-fam',
        husband: 'src-spouse',
        wife: 'src-root',
        children: ['src-child'],
        _pointed: true,
        _sourceWorkspaceId: 'ws-source',
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('prepareDeepCopy', () => {
  describe('new UUIDs', () => {
    test('all individuals get new UUIDs', () => {
      const pointed = makePointedSubtree();
      const result = prepareDeepCopy(pointed, {
        anchorIndividualId: 'target-anchor',
        relationship: 'spouse',
        pointerId: 'bp-1',
      });

      // No individual should keep its original ID
      const newIndIds = Object.keys(result.individuals);
      expect(newIndIds).not.toContain('src-root');
      expect(newIndIds).not.toContain('src-spouse');
      expect(newIndIds).not.toContain('src-child');

      // Should have same count
      expect(newIndIds).toHaveLength(3);
    });

    test('all families get new UUIDs', () => {
      const pointed = makePointedSubtree();
      const result = prepareDeepCopy(pointed, {
        anchorIndividualId: 'target-anchor',
        relationship: 'spouse',
        pointerId: 'bp-1',
      });

      const newFamIds = Object.keys(result.families);
      expect(newFamIds).not.toContain('src-fam');
      expect(newFamIds).toHaveLength(1);
    });

    test('idMap maps old IDs to new UUIDs', () => {
      const pointed = makePointedSubtree();
      const result = prepareDeepCopy(pointed, {
        anchorIndividualId: 'target-anchor',
        relationship: 'spouse',
        pointerId: 'bp-1',
      });

      expect(result.idMap.get('src-root')).toBeDefined();
      expect(result.idMap.get('src-spouse')).toBeDefined();
      expect(result.idMap.get('src-child')).toBeDefined();
      expect(result.idMap.get('src-fam')).toBeDefined();

      // New IDs should be valid UUID format
      const newRootId = result.idMap.get('src-root')!;
      expect(newRootId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });

  describe('cross-reference rewriting', () => {
    test('familyAsChild references are rewritten to new family IDs', () => {
      const pointed = makePointedSubtree();
      const result = prepareDeepCopy(pointed, {
        anchorIndividualId: 'target-anchor',
        relationship: 'spouse',
        pointerId: 'bp-1',
      });

      const newChildId = result.idMap.get('src-child')!;
      const newFamId = result.idMap.get('src-fam')!;
      expect(result.individuals[newChildId].familyAsChild).toBe(newFamId);
    });

    test('familiesAsSpouse references are rewritten to new family IDs', () => {
      const pointed = makePointedSubtree();
      const result = prepareDeepCopy(pointed, {
        anchorIndividualId: 'target-anchor',
        relationship: 'spouse',
        pointerId: 'bp-1',
      });

      const newRootId = result.idMap.get('src-root')!;
      const newFamId = result.idMap.get('src-fam')!;
      expect(result.individuals[newRootId].familiesAsSpouse).toContain(newFamId);
    });

    test('family husband/wife references are rewritten to new individual IDs', () => {
      const pointed = makePointedSubtree();
      const result = prepareDeepCopy(pointed, {
        anchorIndividualId: 'target-anchor',
        relationship: 'spouse',
        pointerId: 'bp-1',
      });

      const newFamId = result.idMap.get('src-fam')!;
      const newRootId = result.idMap.get('src-root')!;
      const newSpouseId = result.idMap.get('src-spouse')!;
      const fam = result.families[newFamId];
      expect(fam.wife).toBe(newRootId);
      expect(fam.husband).toBe(newSpouseId);
    });

    test('family children references are rewritten to new individual IDs', () => {
      const pointed = makePointedSubtree();
      const result = prepareDeepCopy(pointed, {
        anchorIndividualId: 'target-anchor',
        relationship: 'spouse',
        pointerId: 'bp-1',
      });

      const newFamId = result.idMap.get('src-fam')!;
      const newChildId = result.idMap.get('src-child')!;
      expect(result.families[newFamId].children).toContain(newChildId);
    });
  });

  describe('placeId nullification', () => {
    test('birthPlaceId is removed from copied individuals', () => {
      const pointed = makePointedSubtree();
      const result = prepareDeepCopy(pointed, {
        anchorIndividualId: 'target-anchor',
        relationship: 'spouse',
        pointerId: 'bp-1',
      });

      const newRootId = result.idMap.get('src-root')!;
      expect(result.individuals[newRootId].birthPlaceId).toBeUndefined();
      // But the string place name should be preserved
      expect(result.individuals[newRootId].birthPlace).toBe('مكة المكرمة');
    });

    test('deathPlaceId is removed from copied individuals', () => {
      const pointed = makePointedSubtree();
      const result = prepareDeepCopy(pointed, {
        anchorIndividualId: 'target-anchor',
        relationship: 'spouse',
        pointerId: 'bp-1',
      });

      const newChildId = result.idMap.get('src-child')!;
      expect(result.individuals[newChildId].deathPlaceId).toBeUndefined();
      expect(result.individuals[newChildId].deathPlace).toBe('المدينة المنورة');
    });
  });

  describe('_pointed flag removed', () => {
    test('copied individuals do NOT have _pointed flag', () => {
      const pointed = makePointedSubtree();
      const result = prepareDeepCopy(pointed, {
        anchorIndividualId: 'target-anchor',
        relationship: 'spouse',
        pointerId: 'bp-1',
      });

      for (const ind of Object.values(result.individuals)) {
        expect(ind._pointed).toBeUndefined();
        expect(ind._sourceWorkspaceId).toBeUndefined();
      }
    });

    test('copied families do NOT have _pointed flag', () => {
      const pointed = makePointedSubtree();
      const result = prepareDeepCopy(pointed, {
        anchorIndividualId: 'target-anchor',
        relationship: 'spouse',
        pointerId: 'bp-1',
      });

      for (const fam of Object.values(result.families)) {
        expect(fam._pointed).toBeUndefined();
        expect(fam._sourceWorkspaceId).toBeUndefined();
      }
    });
  });

  describe('anchor stitching', () => {
    test('spouse relationship: returns stitchFamily with anchor and copied root as spouses', () => {
      const pointed = makePointedSubtree();
      const result = prepareDeepCopy(pointed, {
        anchorIndividualId: 'target-anchor',
        relationship: 'spouse',
        pointerId: 'bp-1',
      });

      expect(result.stitchFamily).toBeDefined();
      const sf = result.stitchFamily!;
      const spouseIds = [sf.husband, sf.wife].filter(Boolean);
      expect(spouseIds).toContain('target-anchor');
      // The other spouse should be the new root ID
      const newRootId = result.idMap.get('src-root')!;
      expect(spouseIds).toContain(newRootId);
    });

    test('child relationship: returns stitchFamily with anchor as parent and copied root as child', () => {
      const pointed = makePointedSubtree();
      const result = prepareDeepCopy(pointed, {
        anchorIndividualId: 'target-anchor',
        relationship: 'child',
        pointerId: 'bp-2',
      });

      expect(result.stitchFamily).toBeDefined();
      const sf = result.stitchFamily!;
      const newRootId = result.idMap.get('src-root')!;
      expect(sf.children).toContain(newRootId);
    });

    test('parent relationship: returns stitchFamily with copied root as parent and anchor as child', () => {
      const pointed = makePointedSubtree();
      const result = prepareDeepCopy(pointed, {
        anchorIndividualId: 'target-anchor',
        relationship: 'parent',
        pointerId: 'bp-3',
      });

      expect(result.stitchFamily).toBeDefined();
      const sf = result.stitchFamily!;
      expect(sf.children).toContain('target-anchor');
      const newRootId = result.idMap.get('src-root')!;
      expect(sf.husband === newRootId || sf.wife === newRootId).toBe(true);
    });
  });

  describe('does not mutate input', () => {
    test('original pointed data is unchanged', () => {
      const pointed = makePointedSubtree();
      const originalRootId = 'src-root';
      const originalRootName = pointed.individuals[originalRootId].givenName;

      prepareDeepCopy(pointed, {
        anchorIndividualId: 'target-anchor',
        relationship: 'spouse',
        pointerId: 'bp-1',
      });

      expect(pointed.individuals[originalRootId]).toBeDefined();
      expect(pointed.individuals[originalRootId].givenName).toBe(originalRootName);
      expect(pointed.individuals[originalRootId]._pointed).toBe(true);
    });
  });
});

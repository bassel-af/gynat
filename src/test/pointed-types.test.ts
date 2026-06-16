import { describe, test, expect } from 'vitest';
import type { GedcomData, Individual, Family } from '@/lib/gedcom/types';
import { extractSubtree, getAllDescendants } from '@/lib/gedcom/graph';

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
// Tests
// ---------------------------------------------------------------------------

describe('_pointed and _sourceWorkspaceId optional fields on Individual', () => {
  test('Individual type accepts _pointed and _sourceWorkspaceId fields', () => {
    const person: Individual = makeIndividual({
      id: 'ind-1',
      _pointed: true,
      _sourceWorkspaceId: 'ws-abc',
    });

    expect(person._pointed).toBe(true);
    expect(person._sourceWorkspaceId).toBe('ws-abc');
  });

  test('Individual without _pointed fields works normally', () => {
    const person: Individual = makeIndividual({ id: 'ind-1' });

    expect(person._pointed).toBeUndefined();
    expect(person._sourceWorkspaceId).toBeUndefined();
  });

  test('extractSubtree preserves _pointed flag on individuals', () => {
    const data: GedcomData = {
      individuals: {
        root: makeIndividual({ id: 'root', familiesAsSpouse: ['f1'] }),
        child: makeIndividual({
          id: 'child',
          familyAsChild: 'f1',
          _pointed: true,
          _sourceWorkspaceId: 'ws-source',
        }),
      },
      families: {
        f1: makeFamily({ id: 'f1', husband: 'root', children: ['child'] }),
      },
    };

    const result = extractSubtree(data, 'root');
    expect(result.individuals['child']._pointed).toBe(true);
    expect(result.individuals['child']._sourceWorkspaceId).toBe('ws-source');
  });

  test('getAllDescendants works with _pointed individuals', () => {
    const data: GedcomData = {
      individuals: {
        root: makeIndividual({ id: 'root', familiesAsSpouse: ['f1'] }),
        child: makeIndividual({
          id: 'child',
          familyAsChild: 'f1',
          familiesAsSpouse: ['f2'],
          _pointed: true,
        }),
        grandchild: makeIndividual({
          id: 'grandchild',
          familyAsChild: 'f2',
          _pointed: true,
        }),
      },
      families: {
        f1: makeFamily({ id: 'f1', husband: 'root', children: ['child'] }),
        f2: makeFamily({ id: 'f2', husband: 'child', children: ['grandchild'] }),
      },
    };

    const descendants = getAllDescendants(data, 'root');
    expect(descendants.has('child')).toBe(true);
    expect(descendants.has('grandchild')).toBe(true);
  });
});

describe('_pointed and _sourceWorkspaceId optional fields on Family', () => {
  test('Family type accepts _pointed and _sourceWorkspaceId fields', () => {
    const family: Family = makeFamily({
      id: 'fam-1',
      _pointed: true,
      _sourceWorkspaceId: 'ws-abc',
    });

    expect(family._pointed).toBe(true);
    expect(family._sourceWorkspaceId).toBe('ws-abc');
  });

  test('Family without _pointed fields works normally', () => {
    const family: Family = makeFamily({ id: 'fam-1' });

    expect(family._pointed).toBeUndefined();
    expect(family._sourceWorkspaceId).toBeUndefined();
  });
});

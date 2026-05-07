import type { GedcomData, Individual, Family } from '@/lib/gedcom/types';

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
    kunya: '',
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
    marriageContract: EMPTY_EVENT,
    marriage: EMPTY_EVENT,
    divorce: EMPTY_EVENT,
    isDivorced: false,
    ...overrides,
  };
}

/**
 * Cousin-marriage fixture.
 *
 * Structure:
 *   GRANDPA (G)
 *   ├── UNCLE_X (X) ──── (no wife in tree)
 *   │     └── A (son)
 *   └── UNCLE_Y (Y) ──── (no wife in tree)
 *         └── B (daughter)
 *
 *   A married to B (both blood descendants of G).
 *   A + B → C1, C2 (shared children).
 *   C1 → GC (grandchild — depth-3 descendant under canonical placement).
 *
 * BFS order from G: G, X, Y, A, B, C1, C2, GC.
 * A is dequeued before B → A is canonical placement for C1, C2.
 */
export function buildCousinMarriageFixture(): GedcomData {
  const individuals: Record<string, Individual> = {
    'G': makeIndividual({
      id: 'G',
      name: 'جد',
      sex: 'M',
      familiesAsSpouse: ['F_G'],
    }),
    'X': makeIndividual({
      id: 'X',
      name: 'عم1',
      sex: 'M',
      familiesAsSpouse: ['F_X'],
      familyAsChild: 'F_G',
    }),
    'Y': makeIndividual({
      id: 'Y',
      name: 'عم2',
      sex: 'M',
      familiesAsSpouse: ['F_Y'],
      familyAsChild: 'F_G',
    }),
    'A': makeIndividual({
      id: 'A',
      name: 'علي',
      sex: 'M',
      familiesAsSpouse: ['F_AB'],
      familyAsChild: 'F_X',
    }),
    'B': makeIndividual({
      id: 'B',
      name: 'بشرى',
      sex: 'F',
      familiesAsSpouse: ['F_AB'],
      familyAsChild: 'F_Y',
    }),
    'C1': makeIndividual({
      id: 'C1',
      name: 'الابن الأول',
      sex: 'M',
      familiesAsSpouse: ['F_C1'],
      familyAsChild: 'F_AB',
    }),
    'C2': makeIndividual({
      id: 'C2',
      name: 'الابن الثاني',
      sex: 'M',
      familyAsChild: 'F_AB',
    }),
    'GC': makeIndividual({
      id: 'GC',
      name: 'حفيد',
      sex: 'M',
      familyAsChild: 'F_C1',
    }),
  };

  const families: Record<string, Family> = {
    'F_G': makeFamily({
      id: 'F_G',
      husband: 'G',
      children: ['X', 'Y'],
    }),
    'F_X': makeFamily({
      id: 'F_X',
      husband: 'X',
      children: ['A'],
    }),
    'F_Y': makeFamily({
      id: 'F_Y',
      husband: 'Y',
      children: ['B'],
    }),
    'F_AB': makeFamily({
      id: 'F_AB',
      husband: 'A',
      wife: 'B',
      children: ['C1', 'C2'],
    }),
    'F_C1': makeFamily({
      id: 'F_C1',
      husband: 'C1',
      children: ['GC'],
    }),
  };

  return { individuals, families };
}

/**
 * Early-marriage explosion fixture.
 *
 * Structure:
 *   ROOT (R)
 *   ├── P1 (son)
 *   └── P2 (daughter)
 *
 *   P1 married to P2 (sibling-incest as a stress proxy for "two root children
 *   marry each other"; we don't care about the moral angle, only that BOTH
 *   parents are at depth 1 and would each duplicate the entire descendant
 *   subtree without claim-once placement).
 *
 *   P1 + P2 → D1, D2 (a pair of children at depth 2).
 *   D1 → GD1, GD2 (grandchildren at depth 3).
 *   GD1 → GGD (great-grandchild at depth 4).
 *
 * Without claim-once, D1, D2, GD1, GD2, GGD would all render twice.
 */
export function buildEarlyMarriageFixture(): GedcomData {
  const individuals: Record<string, Individual> = {
    'R': makeIndividual({
      id: 'R',
      sex: 'M',
      familiesAsSpouse: ['F_R'],
    }),
    'P1': makeIndividual({
      id: 'P1',
      sex: 'M',
      familiesAsSpouse: ['F_P'],
      familyAsChild: 'F_R',
    }),
    'P2': makeIndividual({
      id: 'P2',
      sex: 'F',
      familiesAsSpouse: ['F_P'],
      familyAsChild: 'F_R',
    }),
    'D1': makeIndividual({
      id: 'D1',
      sex: 'M',
      familiesAsSpouse: ['F_D1'],
      familyAsChild: 'F_P',
    }),
    'D2': makeIndividual({
      id: 'D2',
      sex: 'M',
      familyAsChild: 'F_P',
    }),
    'GD1': makeIndividual({
      id: 'GD1',
      sex: 'M',
      familiesAsSpouse: ['F_GD1'],
      familyAsChild: 'F_D1',
    }),
    'GD2': makeIndividual({
      id: 'GD2',
      sex: 'M',
      familyAsChild: 'F_D1',
    }),
    'GGD': makeIndividual({
      id: 'GGD',
      sex: 'M',
      familyAsChild: 'F_GD1',
    }),
  };

  const families: Record<string, Family> = {
    'F_R': makeFamily({
      id: 'F_R',
      husband: 'R',
      children: ['P1', 'P2'],
    }),
    'F_P': makeFamily({
      id: 'F_P',
      husband: 'P1',
      wife: 'P2',
      children: ['D1', 'D2'],
    }),
    'F_D1': makeFamily({
      id: 'F_D1',
      husband: 'D1',
      children: ['GD1', 'GD2'],
    }),
    'F_GD1': makeFamily({
      id: 'F_GD1',
      husband: 'GD1',
      children: ['GGD'],
    }),
  };

  return { individuals, families };
}

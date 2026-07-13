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
 * Double-cousin-marriage fixture: H marries TWO cousins from DIFFERENT
 * uncles (no sister-wife cluster — the wives have different parents).
 *
 * Structure:
 *   GRANDPA (G)
 *   ├── UNCLE_X (X) ── H (son, the husband)
 *   ├── UNCLE_Y (Y) ── W1 (daughter)
 *   └── UNCLE_Z (Z) ── W2 (daughter)
 *
 *   H married to W1 AND W2 (all three are blood descendants of G).
 *
 * Expected: H has a main node (child of X) plus a spouse-card occurrence on
 * BOTH W1's and W2's nodes — three occurrences total.
 */
export function buildDoubleCousinMarriageFixture(): GedcomData {
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
    'Z': makeIndividual({
      id: 'Z',
      name: 'عم3',
      sex: 'M',
      familiesAsSpouse: ['F_Z'],
      familyAsChild: 'F_G',
    }),
    'H': makeIndividual({
      id: 'H',
      name: 'الزوج',
      sex: 'M',
      familiesAsSpouse: ['F_HW1', 'F_HW2'],
      familyAsChild: 'F_X',
    }),
    'W1': makeIndividual({
      id: 'W1',
      name: 'الزوجة الأولى',
      sex: 'F',
      familiesAsSpouse: ['F_HW1'],
      familyAsChild: 'F_Y',
    }),
    'W2': makeIndividual({
      id: 'W2',
      name: 'الزوجة الثانية',
      sex: 'F',
      familiesAsSpouse: ['F_HW2'],
      familyAsChild: 'F_Z',
    }),
  };

  const families: Record<string, Family> = {
    'F_G': makeFamily({
      id: 'F_G',
      husband: 'G',
      children: ['X', 'Y', 'Z'],
    }),
    'F_X': makeFamily({
      id: 'F_X',
      husband: 'X',
      children: ['H'],
    }),
    'F_Y': makeFamily({
      id: 'F_Y',
      husband: 'Y',
      children: ['W1'],
    }),
    'F_Z': makeFamily({
      id: 'F_Z',
      husband: 'Z',
      children: ['W2'],
    }),
    'F_HW1': makeFamily({
      id: 'F_HW1',
      husband: 'H',
      wife: 'W1',
      children: [],
    }),
    'F_HW2': makeFamily({
      id: 'F_HW2',
      husband: 'H',
      wife: 'W2',
      children: [],
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

/**
 * Sister-wives fixture: a man H marries two sisters S1 and S2
 * (both daughters of parent F).
 *
 * Structure:
 *   F (parent)
 *   ├── B0 (brother, eldest, born 1900)
 *   ├── S1 (sister, born 1905, married H)
 *   ├── B1 (brother, born 1908)
 *   └── S2 (sister, youngest, born 1910, married H)
 *
 *   S1 + H → SC1 (child of S1 + H, in F_S1H)
 *   S2 + H → SC2 (child of S2 + H, in F_S2H)
 *
 * Expected: H rendered ONCE on S1 (the elder sister-wife = anchor).
 * S1 and S2 occupy adjacent sibling indices (cluster block in middle).
 * B0 stays leftmost, B1 stays rightmost of the cluster block.
 */
export function buildSisterWivesFixture(): GedcomData {
  const individuals: Record<string, Individual> = {
    'F': makeIndividual({
      id: 'F',
      name: 'الأب',
      sex: 'M',
      familiesAsSpouse: ['F_F'],
    }),
    'B0': makeIndividual({
      id: 'B0',
      name: 'الأخ الأكبر',
      sex: 'M',
      birth: '1900',
      familyAsChild: 'F_F',
    }),
    'S1': makeIndividual({
      id: 'S1',
      name: 'الأخت الأولى',
      sex: 'F',
      birth: '1905',
      familiesAsSpouse: ['F_S1H'],
      familyAsChild: 'F_F',
    }),
    'B1': makeIndividual({
      id: 'B1',
      name: 'الأخ الأصغر',
      sex: 'M',
      birth: '1908',
      familyAsChild: 'F_F',
    }),
    'S2': makeIndividual({
      id: 'S2',
      name: 'الأخت الثانية',
      sex: 'F',
      birth: '1910',
      familiesAsSpouse: ['F_S2H'],
      familyAsChild: 'F_F',
    }),
    'H': makeIndividual({
      id: 'H',
      name: 'الزوج',
      sex: 'M',
      familiesAsSpouse: ['F_S1H', 'F_S2H'],
    }),
    'SC1': makeIndividual({
      id: 'SC1',
      name: 'ابن الأولى',
      sex: 'M',
      familyAsChild: 'F_S1H',
    }),
    'SC2': makeIndividual({
      id: 'SC2',
      name: 'ابن الثانية',
      sex: 'M',
      familyAsChild: 'F_S2H',
    }),
  };

  const families: Record<string, Family> = {
    'F_F': makeFamily({
      id: 'F_F',
      husband: 'F',
      children: ['B0', 'S1', 'B1', 'S2'],
    }),
    'F_S1H': makeFamily({
      id: 'F_S1H',
      husband: 'H',
      wife: 'S1',
      children: ['SC1'],
    }),
    'F_S2H': makeFamily({
      id: 'F_S2H',
      husband: 'H',
      wife: 'S2',
      children: ['SC2'],
    }),
  };

  return { individuals, families };
}

/**
 * Sister-wives WITH a mother: same as buildSisterWivesFixture, but the father F
 * has a wife M (the sisters' mother). Used to verify the sister-wife daughters'
 * link to their father is drawn from the MOTHER's spouse handle, not F's own.
 */
export function buildSisterWivesWithMotherFixture(): GedcomData {
  const data = buildSisterWivesFixture();
  data.individuals['M'] = makeIndividual({
    id: 'M',
    name: 'الأم',
    sex: 'F',
    familiesAsSpouse: ['F_F'],
  });
  data.families['F_F'].wife = 'M';
  return data;
}

/**
 * Three-sister-wives fixture: H marries three sisters of the same parent F.
 *
 * Structure:
 *   F (parent)
 *   ├── S1 (born 1900, eldest, anchor)
 *   ├── S2 (born 1905)
 *   └── S3 (born 1910)
 *
 *   All three married H. Expected: H rendered ONCE on S1 (anchor).
 *   Two `sister-wife-link` edges from anchor's H spouse-card to S2 and S3.
 */
export function buildThreeSisterWivesFixture(): GedcomData {
  const individuals: Record<string, Individual> = {
    'F': makeIndividual({
      id: 'F',
      name: 'الأب',
      sex: 'M',
      familiesAsSpouse: ['F_F'],
    }),
    'S1': makeIndividual({
      id: 'S1',
      name: 'الأخت الأولى',
      sex: 'F',
      birth: '1900',
      familiesAsSpouse: ['F_S1H'],
      familyAsChild: 'F_F',
    }),
    'S2': makeIndividual({
      id: 'S2',
      name: 'الأخت الثانية',
      sex: 'F',
      birth: '1905',
      familiesAsSpouse: ['F_S2H'],
      familyAsChild: 'F_F',
    }),
    'S3': makeIndividual({
      id: 'S3',
      name: 'الأخت الثالثة',
      sex: 'F',
      birth: '1910',
      familiesAsSpouse: ['F_S3H'],
      familyAsChild: 'F_F',
    }),
    'H': makeIndividual({
      id: 'H',
      name: 'الزوج',
      sex: 'M',
      familiesAsSpouse: ['F_S1H', 'F_S2H', 'F_S3H'],
    }),
  };

  const families: Record<string, Family> = {
    'F_F': makeFamily({
      id: 'F_F',
      husband: 'F',
      children: ['S1', 'S2', 'S3'],
    }),
    'F_S1H': makeFamily({
      id: 'F_S1H',
      husband: 'H',
      wife: 'S1',
      children: [],
    }),
    'F_S2H': makeFamily({
      id: 'F_S2H',
      husband: 'H',
      wife: 'S2',
      children: [],
    }),
    'F_S3H': makeFamily({
      id: 'F_S3H',
      husband: 'H',
      wife: 'S3',
      children: [],
    }),
  };

  return { individuals, families };
}

/**
 * Mixed-cluster fixture: H is married to two sisters (S1, S2 — daughters of F)
 * AND to an unrelated wife W3 (daughter of an unrelated parent F2 in the same root tree).
 *
 * Both F and F2 are children of GP (the root).
 *
 *   GP
 *   ├── F  ── (children: S1, S2)
 *   └── F2 ── (children: W3)
 *
 *   H married S1 (anchor for the sister cluster), S2, AND W3 (separate parent FAM).
 *
 * Expected: H spouse-card count = 2 tree-wide:
 *   - Once on S1 (anchor of F's cluster).
 *   - Once on W3 (her own row, no cluster — different parent FAM).
 *   S2 has H omitted from her spouses[].
 */
export function buildMixedClusterFixture(): GedcomData {
  const individuals: Record<string, Individual> = {
    'GP': makeIndividual({
      id: 'GP',
      name: 'الجد',
      sex: 'M',
      familiesAsSpouse: ['F_GP'],
    }),
    'F': makeIndividual({
      id: 'F',
      name: 'الأب الأول',
      sex: 'M',
      familiesAsSpouse: ['F_F'],
      familyAsChild: 'F_GP',
    }),
    'F2': makeIndividual({
      id: 'F2',
      name: 'الأب الثاني',
      sex: 'M',
      familiesAsSpouse: ['F_F2'],
      familyAsChild: 'F_GP',
    }),
    'S1': makeIndividual({
      id: 'S1',
      name: 'الأخت الأولى',
      sex: 'F',
      birth: '1900',
      familiesAsSpouse: ['F_S1H'],
      familyAsChild: 'F_F',
    }),
    'S2': makeIndividual({
      id: 'S2',
      name: 'الأخت الثانية',
      sex: 'F',
      birth: '1905',
      familiesAsSpouse: ['F_S2H'],
      familyAsChild: 'F_F',
    }),
    'W3': makeIndividual({
      id: 'W3',
      name: 'الزوجة الثالثة',
      sex: 'F',
      birth: '1910',
      familiesAsSpouse: ['F_W3H'],
      familyAsChild: 'F_F2',
    }),
    'H': makeIndividual({
      id: 'H',
      name: 'الزوج',
      sex: 'M',
      familiesAsSpouse: ['F_S1H', 'F_S2H', 'F_W3H'],
    }),
  };

  const families: Record<string, Family> = {
    'F_GP': makeFamily({
      id: 'F_GP',
      husband: 'GP',
      children: ['F', 'F2'],
    }),
    'F_F': makeFamily({
      id: 'F_F',
      husband: 'F',
      children: ['S1', 'S2'],
    }),
    'F_F2': makeFamily({
      id: 'F_F2',
      husband: 'F2',
      children: ['W3'],
    }),
    'F_S1H': makeFamily({ id: 'F_S1H', husband: 'H', wife: 'S1', children: [] }),
    'F_S2H': makeFamily({ id: 'F_S2H', husband: 'H', wife: 'S2', children: [] }),
    'F_W3H': makeFamily({ id: 'F_W3H', husband: 'H', wife: 'W3', children: [] }),
  };

  return { individuals, families };
}

/**
 * Tiebreak fixture: S1 and S2 have identical/missing birth dates.
 * Anchor must be the first by BFS dequeue order — i.e., the one listed
 * first in F's children array.
 */
export function buildSisterWivesTiebreakFixture(): GedcomData {
  const individuals: Record<string, Individual> = {
    'F': makeIndividual({
      id: 'F',
      name: 'الأب',
      sex: 'M',
      familiesAsSpouse: ['F_F'],
    }),
    'S1': makeIndividual({
      id: 'S1',
      name: 'الأخت الأولى',
      sex: 'F',
      familiesAsSpouse: ['F_S1H'],
      familyAsChild: 'F_F',
    }),
    'S2': makeIndividual({
      id: 'S2',
      name: 'الأخت الثانية',
      sex: 'F',
      familiesAsSpouse: ['F_S2H'],
      familyAsChild: 'F_F',
    }),
    'H': makeIndividual({
      id: 'H',
      name: 'الزوج',
      sex: 'M',
      familiesAsSpouse: ['F_S1H', 'F_S2H'],
    }),
  };

  const families: Record<string, Family> = {
    'F_F': makeFamily({
      id: 'F_F',
      husband: 'F',
      children: ['S1', 'S2'],
    }),
    'F_S1H': makeFamily({ id: 'F_S1H', husband: 'H', wife: 'S1', children: [] }),
    'F_S2H': makeFamily({ id: 'F_S2H', husband: 'H', wife: 'S2', children: [] }),
  };

  return { individuals, families };
}

import { describe, test, expect } from 'vitest';
import type { GedcomData, Individual, Family, RadaFamily } from '@/lib/gedcom/types';
import { getDisplayName } from '@/lib/gedcom/display';
import {
  projectPerson,
  PRIVATE_PLACEHOLDER,
  PROJECTION_NODE_CEILING,
  MEMBER_PROJECT_OPTIONS,
  type ProjectOptions,
} from '@/lib/tree/person-projection';

// ---------------------------------------------------------------------------
// Fixture builders (same pattern as cascade-delete.test.ts / extract-subtree)
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

function makeRada(overrides: Partial<RadaFamily> & { id: string }): RadaFamily {
  return {
    type: '_RADA_FAM',
    fosterFather: null,
    fosterMother: null,
    children: [],
    notes: '',
    ...overrides,
  };
}

function data(
  individuals: Individual[],
  families: Family[],
  radaFamilies?: RadaFamily[],
): GedcomData {
  const d: GedcomData = {
    individuals: Object.fromEntries(individuals.map((i) => [i.id, i])),
    families: Object.fromEntries(families.map((f) => [f.id, f])),
  };
  if (radaFamilies) d.radaFamilies = Object.fromEntries(radaFamilies.map((r) => [r.id, r]));
  return d;
}

// Member options: the SAME shared const the member route uses (unbounded
// female-line depth, boundary = `_pointed`, patriline continues through a
// private ancestor).
const MEMBER: ProjectOptions = MEMBER_PROJECT_OPTIONS;

const ids = (chips: { id?: string }[]) => chips.map((c) => c.id);
const last = <T>(arr: T[]): T => arr[arr.length - 1];

// ---------------------------------------------------------------------------
// Subject identity
// ---------------------------------------------------------------------------

describe('projectPerson — subject', () => {
  test('returns null for an unknown subject', () => {
    expect(projectPerson(data([], []), 'nobody', MEMBER)).toBeNull();
  });

  test('returns null when the subject is private (defensive backstop)', () => {
    const d = data([makeIndividual({ id: 'p', isPrivate: true })], []);
    expect(projectPerson(d, 'p', MEMBER)).toBeNull();
  });

  test('maps the subject identity fields, raw dates, house and living state', () => {
    const individual = makeIndividual({
      id: 'p',
      givenName: 'باسل',
      surname: 'آل السعيد',
      sex: 'M',
      kunya: 'أبو عمر',
      birth: '1980',
      birthHijriDate: '1400',
      birthPlace: 'حلب',
      notes: 'ملاحظة',
      isDeceased: false,
    });
    const d = data([individual], []);
    const { subject } = projectPerson(d, 'p', MEMBER)!;
    // `name` is the composed FULL display name via getDisplayName — DISTINCT from
    // `givenName` (first name only) — the single canonical label for UI + JSON-LD.
    expect(subject.name).toBe(getDisplayName(individual));
    expect(subject.name).toBe('باسل آل السعيد');
    expect(subject.givenName).toBe('باسل');
    expect(subject.surname).toBe('آل السعيد');
    expect(subject.house).toBe('آل السعيد');
    expect(subject.gender).toBe('male');
    expect(subject.kunya).toBe('أبو عمر');
    expect(subject.living).toBe(true);
    expect(subject.birth).toBe('1980');
    expect(subject.birthHijriDate).toBe('1400');
    expect(subject.birthPlace).toBe('حلب');
    expect(subject.notes).toBe('ملاحظة');
  });

  test('living=false when the subject is deceased', () => {
    const d = data([makeIndividual({ id: 'p', isDeceased: true, death: '2010' })], []);
    expect(projectPerson(d, 'p', MEMBER)!.subject.living).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Paternal nasab chain
// ---------------------------------------------------------------------------

describe('projectPerson — paternal chain', () => {
  test('walks father → grandfather, ordered oldest → father, excluding subject', () => {
    const d = data(
      [
        makeIndividual({ id: 'gf', givenName: 'إبراهيم', familiesAsSpouse: ['F1'] }),
        makeIndividual({ id: 'fa', givenName: 'خالد', familyAsChild: 'F1', familiesAsSpouse: ['F2'] }),
        makeIndividual({ id: 'p', givenName: 'باسل', familyAsChild: 'F2' }),
      ],
      [
        makeFamily({ id: 'F1', husband: 'gf', children: ['fa'] }),
        makeFamily({ id: 'F2', husband: 'fa', children: ['p'] }),
      ],
    );
    expect(ids(projectPerson(d, 'p', MEMBER)!.paternalChain)).toEqual(['gf', 'fa']);
  });

  test('chips carry raw dates and private:false (no formatting here)', () => {
    const d = data(
      [
        makeIndividual({ id: 'fa', givenName: 'خالد', birth: '1900', birthHijriDate: '1318', death: '1972', isDeceased: true, familiesAsSpouse: ['F2'] }),
        makeIndividual({ id: 'p', givenName: 'باسل', familyAsChild: 'F2' }),
      ],
      [makeFamily({ id: 'F2', husband: 'fa', children: ['p'] })],
    );
    const fa = projectPerson(d, 'p', MEMBER)!.paternalChain[0];
    expect(fa.birth).toBe('1900');
    expect(fa.birthHijriDate).toBe('1318');
    expect(fa.death).toBe('1972');
    expect(fa.private).toBe(false);
    expect(fa.living).toBe(false);
  });

  // §4.4: a private patrilineal ancestor → «خاص» placeholder, the climb CONTINUES.
  test('a private patrilineal ancestor is a «خاص» placeholder; the climb continues to his father', () => {
    // ggf -> gf(private) -> father -> subject ; placeholder at gf, ggf STILL reached.
    const d = data(
      [
        makeIndividual({ id: 'ggf', givenName: 'عمر', familiesAsSpouse: ['F0'] }),
        makeIndividual({ id: 'gf', isPrivate: true, familyAsChild: 'F0', familiesAsSpouse: ['F1'] }),
        makeIndividual({ id: 'fa', givenName: 'خالد', familyAsChild: 'F1', familiesAsSpouse: ['F2'] }),
        makeIndividual({ id: 'p', givenName: 'باسل', familyAsChild: 'F2' }),
      ],
      [
        makeFamily({ id: 'F0', husband: 'ggf', children: ['gf'] }),
        makeFamily({ id: 'F1', husband: 'gf', children: ['fa'] }),
        makeFamily({ id: 'F2', husband: 'fa', children: ['p'] }),
      ],
    );
    const chain = projectPerson(d, 'p', MEMBER)!.paternalChain;
    // oldest → father: real ggf, the private placeholder (NO id), real fa.
    expect(chain).toHaveLength(3);
    expect(chain[0].id).toBe('ggf');
    expect(chain[2].id).toBe('fa');
    const gfNode = chain[1];
    expect(gfNode.private).toBe(true);
    expect(gfNode.name).toBe(PRIVATE_PLACEHOLDER);
    expect(gfNode.id).toBeUndefined(); // placeholder is non-navigable, non-enumerable
    expect(gfNode.mother).toBeUndefined();
  });

  // Conservative (public default): a private patrilineal ancestor STOPS the climb.
  test('continueThroughPrivateAncestor:false → private ancestor placeholder STOPS the climb (conservative/public)', () => {
    const d = data(
      [
        makeIndividual({ id: 'ggf', givenName: 'عمر', familiesAsSpouse: ['F0'] }),
        makeIndividual({ id: 'gf', isPrivate: true, familyAsChild: 'F0', familiesAsSpouse: ['F1'] }),
        makeIndividual({ id: 'fa', givenName: 'خالد', familyAsChild: 'F1', familiesAsSpouse: ['F2'] }),
        makeIndividual({ id: 'p', givenName: 'باسل', familyAsChild: 'F2' }),
      ],
      [
        makeFamily({ id: 'F0', husband: 'ggf', children: ['gf'] }),
        makeFamily({ id: 'F1', husband: 'gf', children: ['fa'] }),
        makeFamily({ id: 'F2', husband: 'fa', children: ['p'] }),
      ],
    );
    // continueThroughPrivateAncestor: false → conservative stop.
    const conservative: ProjectOptions = {
      maternalRecursionDepth: 1,
      isBoundary: () => false,
      continueThroughPrivateAncestor: false,
    };
    const chain = projectPerson(d, 'p', conservative)!.paternalChain;
    // oldest → father: only the private placeholder, then fa. ggf is NOT reached.
    expect(chain).toHaveLength(2);
    expect(chain[0].private).toBe(true);
    expect(chain[0].id).toBeUndefined();
    expect(chain[1].id).toBe('fa');
    expect(chain.some((c) => c.id === 'ggf')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cross-workspace boundary
// ---------------------------------------------------------------------------

describe('projectPerson — cross-workspace boundary', () => {
  test('emits a _pointed ancestor but never climbs into its borrowed parents', () => {
    const d = data(
      [
        makeIndividual({ id: 'srcGreat', givenName: 'سلف-بعيد', familiesAsSpouse: ['SF'] }),
        makeIndividual({ id: 'bGf', givenName: 'الجد-المستعار', _pointed: true, familyAsChild: 'SF', familiesAsSpouse: ['F1'] }),
        makeIndividual({ id: 'fa', givenName: 'خالد', familyAsChild: 'F1', familiesAsSpouse: ['F2'] }),
        makeIndividual({ id: 'p', givenName: 'باسل', familyAsChild: 'F2' }),
      ],
      [
        makeFamily({ id: 'SF', husband: 'srcGreat', children: ['bGf'] }),
        makeFamily({ id: 'F1', husband: 'bGf', children: ['fa'] }),
        makeFamily({ id: 'F2', husband: 'fa', children: ['p'] }),
      ],
    );
    const chain = projectPerson(d, 'p', MEMBER)!.paternalChain;
    expect(ids(chain)).toEqual(['bGf', 'fa']);
    expect(chain[0].private).toBe(false); // boundary node is a real, clickable chip
    expect(chain.some((c) => c.id === 'srcGreat')).toBe(false);
  });

  test('public boundary via a home-id set stops at the first foreign ancestor', () => {
    const d = data(
      [
        makeIndividual({ id: 'foreign', givenName: 'أجنبي', familiesAsSpouse: ['F1'] }),
        makeIndividual({ id: 'fa', givenName: 'خالد', familyAsChild: 'F1', familiesAsSpouse: ['F2'] }),
        makeIndividual({ id: 'p', givenName: 'باسل', familyAsChild: 'F2' }),
      ],
      [
        makeFamily({ id: 'F1', husband: 'foreign', children: ['fa'] }),
        makeFamily({ id: 'F2', husband: 'fa', children: ['p'] }),
      ],
    );
    const home = new Set(['p', 'fa']); // 'foreign' is outside the home tree
    const opts: ProjectOptions = {
      maternalRecursionDepth: 1,
      isBoundary: (ind) => !home.has(ind.id),
      continueThroughPrivateAncestor: false,
    };
    const chain = projectPerson(d, 'p', opts)!.paternalChain;
    // foreign is emitted (it's the boundary) but its parents are never climbed.
    expect(ids(chain)).toEqual(['foreign', 'fa']);
  });
});

// ---------------------------------------------------------------------------
// Maternal chain + female-line recursion depth
// ---------------------------------------------------------------------------

describe('projectPerson — maternal chain', () => {
  test('mother is the bottom node, preceded by her fathers-only spine (oldest → mother)', () => {
    const d = data(
      [
        makeIndividual({ id: 'mGf', givenName: 'حسن', familiesAsSpouse: ['MF1'] }),
        makeIndividual({ id: 'mom', sex: 'F', givenName: 'رقية', familyAsChild: 'MF1', familiesAsSpouse: ['F'] }),
        makeIndividual({ id: 'fa', givenName: 'خالد', familiesAsSpouse: ['F'] }),
        makeIndividual({ id: 'p', givenName: 'باسل', familyAsChild: 'F' }),
      ],
      [
        makeFamily({ id: 'MF1', husband: 'mGf', children: ['mom'] }),
        makeFamily({ id: 'F', husband: 'fa', wife: 'mom', children: ['p'] }),
      ],
    );
    const chain = projectPerson(d, 'p', MEMBER)!.maternalChain;
    expect(ids(chain)).toEqual(['mGf', 'mom']);
    expect(chain[chain.length - 1].gender).toBe('female');
  });

  test('member: female line recurses unbounded (assert 4 deep)', () => {
    // mom -> m1 -> m2 -> m3 -> m4 (each the mother of the previous)
    const inds: Individual[] = [
      makeIndividual({ id: 'fa', givenName: 'خالد', familiesAsSpouse: ['F'] }),
      makeIndividual({ id: 'p', givenName: 'باسل', familyAsChild: 'F' }),
    ];
    const fams: Family[] = [makeFamily({ id: 'F', husband: 'fa', wife: 'mom', children: ['p'] })];
    const chainIds = ['mom', 'm1', 'm2', 'm3', 'm4'];
    for (let i = 0; i < chainIds.length; i++) {
      const id = chainIds[i];
      const childFam = i === 0 ? 'F' : `MF${i - 1}`;
      const ownFam = `MF${i}`;
      inds.push(
        makeIndividual({
          id,
          sex: 'F',
          givenName: `أم${i}`,
          familyAsChild: i + 1 < chainIds.length ? ownFam : null,
          familiesAsSpouse: [childFam],
        }),
      );
    }
    // family linking each mother to her own mother: MF{i} has wife = m{i+1}, child = chain[i]
    for (let i = 0; i + 1 < chainIds.length; i++) {
      fams.push(makeFamily({ id: `MF${i}`, wife: chainIds[i + 1], children: [chainIds[i]] }));
    }
    const d = data(inds, fams);
    const momNode = last(projectPerson(d, 'p', MEMBER)!.maternalChain);
    expect(momNode.mother?.id).toBe('m1');
    expect(momNode.mother?.mother?.id).toBe('m2');
    expect(momNode.mother?.mother?.mother?.id).toBe('m3');
    expect(momNode.mother?.mother?.mother?.mother?.id).toBe('m4');
  });

  test('public: maternalRecursionDepth=1 yields exactly one female-line level', () => {
    const d = data(
      [
        makeIndividual({ id: 'gm', sex: 'F', givenName: 'نجيبة', familiesAsSpouse: ['GMF'] }),
        makeIndividual({ id: 'mom', sex: 'F', givenName: 'رقية', familyAsChild: 'GMF', familiesAsSpouse: ['F'] }),
        makeIndividual({ id: 'fa', givenName: 'خالد', familiesAsSpouse: ['F'] }),
        makeIndividual({ id: 'p', givenName: 'باسل', familyAsChild: 'F' }),
      ],
      [
        makeFamily({ id: 'GMF', wife: 'gm', children: ['mom'] }),
        makeFamily({ id: 'F', husband: 'fa', wife: 'mom', children: ['p'] }),
      ],
    );
    const opts: ProjectOptions = {
      maternalRecursionDepth: 1,
      isBoundary: () => false,
      continueThroughPrivateAncestor: false,
    };
    const momNode = last(projectPerson(d, 'p', opts)!.maternalChain);
    expect(momNode.mother?.id).toBe('gm');
    expect(momNode.mother?.mother).toBeUndefined(); // exactly one level deep
  });

  test('a private mother yields an empty maternal column (no placeholder, no leak)', () => {
    const d = data(
      [
        makeIndividual({ id: 'mom', sex: 'F', isPrivate: true, familiesAsSpouse: ['F'] }),
        makeIndividual({ id: 'fa', givenName: 'خالد', familiesAsSpouse: ['F'] }),
        makeIndividual({ id: 'p', givenName: 'باسل', familyAsChild: 'F' }),
      ],
      [makeFamily({ id: 'F', husband: 'fa', wife: 'mom', children: ['p'] })],
    );
    expect(projectPerson(d, 'p', MEMBER)!.maternalChain).toEqual([]);
  });

  test('a spine man\'s married-in mother who is private → locked chip, fathers:[], no recursion', () => {
    // fa's mother (gm) is private; her own father exists but must NOT surface.
    const d = data(
      [
        makeIndividual({ id: 'gmFather', givenName: 'والد-الجدة', familiesAsSpouse: ['GMF'] }),
        makeIndividual({ id: 'gm', sex: 'F', isPrivate: true, familyAsChild: 'GMF', familiesAsSpouse: ['GF'] }),
        makeIndividual({ id: 'gf', givenName: 'إبراهيم', familiesAsSpouse: ['GF'] }),
        makeIndividual({ id: 'fa', givenName: 'خالد', familyAsChild: 'GF', familiesAsSpouse: ['F'] }),
        makeIndividual({ id: 'p', givenName: 'باسل', familyAsChild: 'F' }),
      ],
      [
        makeFamily({ id: 'GMF', husband: 'gmFather', children: ['gm'] }),
        makeFamily({ id: 'GF', husband: 'gf', wife: 'gm', children: ['fa'] }),
        makeFamily({ id: 'F', husband: 'fa', children: ['p'] }),
      ],
    );
    const chain = projectPerson(d, 'p', MEMBER)!.paternalChain;
    const faNode = chain.find((c) => c.id === 'fa')!;
    // private married-in mother → locked placeholder: private, no id, no line.
    expect(faNode.mother?.private).toBe(true);
    expect(faNode.mother?.name).toBe(PRIVATE_PLACEHOLDER);
    expect(faNode.mother?.id).toBeUndefined();
    expect(faNode.mother?.fathers).toEqual([]);
    expect(faNode.mother?.mother).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Marriages (per-family grouping) + grandchildren
// ---------------------------------------------------------------------------

describe('projectPerson — marriages', () => {
  test('groups children under each marriage family (polygamy), preserving order', () => {
    const d = data(
      [
        makeIndividual({ id: 'p', sex: 'M', givenName: 'باسل', familiesAsSpouse: ['M1', 'M2'] }),
        makeIndividual({ id: 'w1', sex: 'F', givenName: 'ليلى', familiesAsSpouse: ['M1'] }),
        makeIndividual({ id: 'w2', sex: 'F', givenName: 'مريم', familiesAsSpouse: ['M2'] }),
        makeIndividual({ id: 'c1', givenName: 'عمر', familyAsChild: 'M1' }),
        makeIndividual({ id: 'c2', givenName: 'نور', sex: 'F', familyAsChild: 'M1' }),
        makeIndividual({ id: 'c3', givenName: 'سارة', sex: 'F', familyAsChild: 'M2' }),
      ],
      [
        makeFamily({ id: 'M1', husband: 'p', wife: 'w1', children: ['c1', 'c2'], marriageContract: { ...EMPTY_EVENT, hijriDate: '1427', place: 'حلب' } }),
        makeFamily({ id: 'M2', husband: 'p', wife: 'w2', children: ['c3'] }),
      ],
    );
    const { marriages } = projectPerson(d, 'p', MEMBER)!;
    expect(marriages).toHaveLength(2);
    expect(marriages[0].familyId).toBe('M1');
    expect(marriages[0].spouse?.id).toBe('w1');
    expect(ids(marriages[0].children)).toEqual(['c1', 'c2']);
    expect(marriages[0].marriageEvent).toEqual({ date: '', hijriDate: '1427', place: 'حلب' });
    expect(marriages[1].spouse?.id).toBe('w2');
    expect(ids(marriages[1].children)).toEqual(['c3']);
    expect(marriages[1].marriageEvent).toBeUndefined();
  });

  test('omits a private spouse (spouse=null) and private children', () => {
    const d = data(
      [
        makeIndividual({ id: 'p', sex: 'M', familiesAsSpouse: ['M1'] }),
        makeIndividual({ id: 'w', sex: 'F', isPrivate: true, familiesAsSpouse: ['M1'] }),
        makeIndividual({ id: 'c1', givenName: 'عمر', familyAsChild: 'M1' }),
        makeIndividual({ id: 'cp', isPrivate: true, familyAsChild: 'M1' }),
      ],
      [makeFamily({ id: 'M1', husband: 'p', wife: 'w', children: ['c1', 'cp'] })],
    );
    const { marriages } = projectPerson(d, 'p', MEMBER)!;
    expect(marriages[0].spouse).toBeNull();
    expect(ids(marriages[0].children)).toEqual(['c1']);
  });

  test('grandchildren carry parentId → the subject\'s own child', () => {
    const d = data(
      [
        makeIndividual({ id: 'p', sex: 'M', familiesAsSpouse: ['M1'] }),
        makeIndividual({ id: 'c1', givenName: 'عمر', familyAsChild: 'M1', familiesAsSpouse: ['C1F'] }),
        makeIndividual({ id: 'gc1', givenName: 'تسنيم', sex: 'F', familyAsChild: 'C1F' }),
        makeIndividual({ id: 'gc2', givenName: 'زياد', familyAsChild: 'C1F' }),
      ],
      [
        makeFamily({ id: 'M1', husband: 'p', children: ['c1'] }),
        makeFamily({ id: 'C1F', husband: 'c1', children: ['gc1', 'gc2'] }),
      ],
    );
    const { grandchildren } = projectPerson(d, 'p', MEMBER)!;
    expect(ids(grandchildren)).toEqual(['gc1', 'gc2']);
    expect(grandchildren.every((g) => g.parentId === 'c1')).toBe(true);
  });

  test('grandchild whose linking child is private is shown WITHOUT parentId', () => {
    const d = data(
      [
        makeIndividual({ id: 'p', sex: 'M', familiesAsSpouse: ['M1'] }),
        makeIndividual({ id: 'c1', isPrivate: true, familyAsChild: 'M1', familiesAsSpouse: ['C1F'] }),
        makeIndividual({ id: 'gc1', givenName: 'تسنيم', sex: 'F', familyAsChild: 'C1F' }),
      ],
      [
        makeFamily({ id: 'M1', husband: 'p', children: ['c1'] }),
        makeFamily({ id: 'C1F', husband: 'c1', children: ['gc1'] }),
      ],
    );
    const { grandchildren } = projectPerson(d, 'p', MEMBER)!;
    expect(ids(grandchildren)).toEqual(['gc1']);
    expect(grandchildren[0].parentId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Siblings
// ---------------------------------------------------------------------------

describe('projectPerson — siblings', () => {
  test('lists the subject\'s siblings, excluding the subject and private people', () => {
    const d = data(
      [
        makeIndividual({ id: 'fa', familiesAsSpouse: ['F'] }),
        makeIndividual({ id: 'p', familyAsChild: 'F' }),
        makeIndividual({ id: 's1', givenName: 'أحمد', familyAsChild: 'F' }),
        makeIndividual({ id: 's2', givenName: 'هدى', sex: 'F', familyAsChild: 'F' }),
        makeIndividual({ id: 'sp', isPrivate: true, familyAsChild: 'F' }),
      ],
      [makeFamily({ id: 'F', husband: 'fa', children: ['p', 's1', 's2', 'sp'] })],
    );
    expect(ids(projectPerson(d, 'p', MEMBER)!.siblings)).toEqual(['s1', 's2']);
  });
});

// ---------------------------------------------------------------------------
// Uncles + cousins
// ---------------------------------------------------------------------------

describe('projectPerson — uncles and cousins', () => {
  function unclesGraph(): GedcomData {
    return data(
      [
        makeIndividual({ id: 'gf', givenName: 'إبراهيم', familiesAsSpouse: ['GF'] }),
        makeIndividual({ id: 'fa', givenName: 'خالد', familyAsChild: 'GF', familiesAsSpouse: ['F'] }),
        makeIndividual({ id: 'u1', givenName: 'وليد', familyAsChild: 'GF', familiesAsSpouse: ['U1F'] }),
        makeIndividual({ id: 'u2', givenName: 'سامي', familyAsChild: 'GF' }),
        makeIndividual({ id: 'up', isPrivate: true, familyAsChild: 'GF', familiesAsSpouse: ['UPF'] }),
        makeIndividual({ id: 'pc1', givenName: 'طارق', familyAsChild: 'U1F' }),
        makeIndividual({ id: 'pc2', givenName: 'رنا', sex: 'F', familyAsChild: 'U1F' }),
        makeIndividual({ id: 'pcPriv', givenName: 'ابن-العم-المخفي', familyAsChild: 'UPF' }),

        makeIndividual({ id: 'mGf', givenName: 'حسن', familiesAsSpouse: ['MGF'] }),
        makeIndividual({ id: 'mom', sex: 'F', givenName: 'رقية', familyAsChild: 'MGF', familiesAsSpouse: ['F'] }),
        makeIndividual({ id: 'mu1', givenName: 'غسان', familyAsChild: 'MGF', familiesAsSpouse: ['MU1F'] }),
        makeIndividual({ id: 'mc1', givenName: 'كريم', familyAsChild: 'MU1F' }),

        makeIndividual({ id: 'p', givenName: 'باسل', familyAsChild: 'F' }),
      ],
      [
        makeFamily({ id: 'GF', husband: 'gf', children: ['fa', 'u1', 'u2', 'up'] }),
        makeFamily({ id: 'F', husband: 'fa', wife: 'mom', children: ['p'] }),
        makeFamily({ id: 'U1F', husband: 'u1', children: ['pc1', 'pc2'] }),
        makeFamily({ id: 'UPF', husband: 'up', children: ['pcPriv'] }),
        makeFamily({ id: 'MGF', husband: 'mGf', children: ['mom', 'mu1'] }),
        makeFamily({ id: 'MU1F', husband: 'mu1', children: ['mc1'] }),
      ],
    );
  }

  test('paternal uncles are the father\'s siblings (private omitted)', () => {
    expect(ids(projectPerson(unclesGraph(), 'p', MEMBER)!.paternalUncles).sort()).toEqual(['u1', 'u2']);
  });

  test('maternal uncles are the mother\'s siblings', () => {
    expect(ids(projectPerson(unclesGraph(), 'p', MEMBER)!.maternalUncles)).toEqual(['mu1']);
  });

  test('paternal cousins are children of NON-private uncles, parentId → the عم', () => {
    const { paternalCousins } = projectPerson(unclesGraph(), 'p', MEMBER)!;
    // a private uncle's children are NOT enumerated (pcPriv excluded).
    expect(ids(paternalCousins).sort()).toEqual(['pc1', 'pc2']);
    expect(paternalCousins.every((c) => c.parentId === 'u1')).toBe(true);
  });

  test('maternal cousins are children of maternal uncles, parentId → the خال', () => {
    const { maternalCousins } = projectPerson(unclesGraph(), 'p', MEMBER)!;
    expect(ids(maternalCousins)).toEqual(['mc1']);
    expect(maternalCousins[0].parentId).toBe('mu1');
  });

  test('uncle/cousin walks never reach into a _pointed grandfather\'s other branch', () => {
    const d = data(
      [
        makeIndividual({ id: 'gf', _pointed: true, familiesAsSpouse: ['GF'] }),
        makeIndividual({ id: 'fa', givenName: 'خالد', familyAsChild: 'GF', familiesAsSpouse: ['F'] }),
        makeIndividual({ id: 'borrowedUncle', givenName: 'مستعار', familyAsChild: 'GF' }),
        makeIndividual({ id: 'p', givenName: 'باسل', familyAsChild: 'F' }),
      ],
      [
        makeFamily({ id: 'GF', husband: 'gf', children: ['fa', 'borrowedUncle'] }),
        makeFamily({ id: 'F', husband: 'fa', children: ['p'] }),
      ],
    );
    expect(projectPerson(d, 'p', MEMBER)!.paternalUncles).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rada (milk-kinship) split
// ---------------------------------------------------------------------------

describe('projectPerson — rada split', () => {
  test('splits rada parents into fathers/mothers and lists rada siblings', () => {
    const d = data(
      [
        makeIndividual({ id: 'p', givenName: 'باسل', radaFamiliesAsChild: ['R1'] }),
        makeIndividual({ id: 'rf', givenName: 'عبد القادر', sex: 'M' }),
        makeIndividual({ id: 'rm', givenName: 'زينب', sex: 'F' }),
        makeIndividual({ id: 'rs1', givenName: 'بلال', sex: 'M' }),
        makeIndividual({ id: 'rs2', givenName: 'عائشة', sex: 'F' }),
      ],
      [],
      [makeRada({ id: 'R1', fosterFather: 'rf', fosterMother: 'rm', children: ['p', 'rs1', 'rs2'] })],
    );
    const { rada } = projectPerson(d, 'p', MEMBER)!;
    expect(ids(rada.fathers)).toEqual(['rf']);
    expect(ids(rada.mothers)).toEqual(['rm']);
    expect(ids(rada.siblings).sort()).toEqual(['rs1', 'rs2']);
  });

  test('omits a private rada person', () => {
    const d = data(
      [
        makeIndividual({ id: 'p', radaFamiliesAsChild: ['R1'] }),
        makeIndividual({ id: 'rf', sex: 'M', isPrivate: true }),
        makeIndividual({ id: 'rs1', givenName: 'بلال', sex: 'M' }),
      ],
      [],
      [makeRada({ id: 'R1', fosterFather: 'rf', children: ['p', 'rs1'] })],
    );
    const { rada } = projectPerson(d, 'p', MEMBER)!;
    expect(rada.fathers).toEqual([]);
    expect(ids(rada.siblings)).toEqual(['rs1']);
  });
});

// ---------------------------------------------------------------------------
// Sanity guards — cycle + node ceiling
// ---------------------------------------------------------------------------

describe('projectPerson — sanity guards', () => {
  test('a parent cycle terminates instead of looping forever', () => {
    const d = data(
      [
        makeIndividual({ id: 'p', givenName: 'باسل', familyAsChild: 'F1', familiesAsSpouse: ['F2'] }),
        makeIndividual({ id: 'fa', givenName: 'خالد', familyAsChild: 'F2', familiesAsSpouse: ['F1'] }),
      ],
      [
        makeFamily({ id: 'F1', husband: 'fa', children: ['p'] }),
        makeFamily({ id: 'F2', husband: 'p', children: ['fa'] }),
      ],
    );
    expect(ids(projectPerson(d, 'p', MEMBER)!.paternalChain)).toEqual(['fa']);
  });

  test('a very deep paternal line is bounded by the node ceiling', () => {
    const N = PROJECTION_NODE_CEILING + 50;
    const inds: Individual[] = [];
    const fams: Family[] = [];
    for (let i = 0; i < N; i++) {
      inds.push(
        makeIndividual({
          id: `a${i}`,
          givenName: `ج${i}`,
          familyAsChild: i + 1 < N ? `F${i}` : null,
          familiesAsSpouse: i > 0 ? [`F${i - 1}`] : [],
        }),
      );
    }
    for (let i = 0; i + 1 < N; i++) {
      fams.push(makeFamily({ id: `F${i}`, husband: `a${i + 1}`, children: [`a${i}`] }));
    }
    const d = data(inds, fams);
    const chain = projectPerson(d, 'a0', MEMBER)!.paternalChain;
    expect(chain.length).toBeLessThanOrEqual(PROJECTION_NODE_CEILING);
  });
});

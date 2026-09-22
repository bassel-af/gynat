/**
 * «قفزة نسب» — graph traversal support.
 *
 * Chunk 1 added `buildJumpIndex` and `includeJumps` on `getAllDescendants`.
 * Chunk 2 (below the «Chunk 2» banner) covers the remaining §5.1 helpers:
 * `getAllAncestors`, `getTreeVisibleIndividuals`, `getConnectedIndividuals`,
 * `getCanvasVisibleIndividuals`, `buildChildrenGraph` (+ the unchanged
 * `calculateDescendantCounts` on top of it), `findTopmostAncestor` and
 * `resolveNavigationRoot`.
 *
 * THE LOAD-BEARING GUARANTEE: `includeJumps` defaults OFF. A caller that knows
 * nothing about jumps must get EXACTLY today's answer even on jump-bearing
 * data — fail-closed, so the worst case is a missing link and never a false
 * parent claim. The expected sets below are written out literally rather than
 * compared against a second call, so a leak cannot hide behind a shared bug.
 */
import { describe, test, expect } from 'vitest';
import type { GedcomData, Individual, Family, AncestryJump } from '@/lib/gedcom/types';
import {
  getAllDescendants,
  buildJumpIndex,
  getAllAncestors,
  getTreeVisibleIndividuals,
  getConnectedIndividuals,
  getCanvasVisibleIndividuals,
  buildChildrenGraph,
  calculateDescendantCounts,
  findTopmostAncestor,
  resolveNavigationRoot,
} from '@/lib/gedcom/graph';

// ---------------------------------------------------------------------------
// Fixture builders
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

function makeJump(overrides: Partial<AncestryJump> & { id: string }): AncestryJump {
  return {
    type: '_ANC_JUMP',
    descendant: '',
    ancestorFamily: '',
    generationsMin: null,
    generationsMax: null,
    notes: '',
    ...overrides,
  };
}

/**
 * إسماعيل × هاجر (FAM-ISH), with a recorded son قيدار.
 * عدنان — parentless — is linked to FAM-ISH by a «قفزة نسب».
 * عدنان × زوجته (FAM-ADN) has a son معد, who in turn has نزار.
 *
 * Jump-blind, إسماعيل's descendants are {قيدار} only.
 * Jump-aware, they are {قيدار, عدنان, معد, نزار}.
 */
function jumpBearingData(): GedcomData {
  const data: GedcomData = {
    individuals: {
      ISH: makeIndividual({ id: 'ISH', familiesAsSpouse: ['FAM-ISH'] }),
      HAJAR: makeIndividual({ id: 'HAJAR', sex: 'F', familiesAsSpouse: ['FAM-ISH'] }),
      QAYDAR: makeIndividual({ id: 'QAYDAR', familyAsChild: 'FAM-ISH' }),
      ADNAN: makeIndividual({ id: 'ADNAN', familiesAsSpouse: ['FAM-ADN'] }),
      WIFE: makeIndividual({ id: 'WIFE', sex: 'F', familiesAsSpouse: ['FAM-ADN'] }),
      MAADD: makeIndividual({ id: 'MAADD', familyAsChild: 'FAM-ADN', familiesAsSpouse: ['FAM-MAADD'] }),
      NIZAR: makeIndividual({ id: 'NIZAR', familyAsChild: 'FAM-MAADD' }),
    },
    families: {
      'FAM-ISH': makeFamily({ id: 'FAM-ISH', husband: 'ISH', wife: 'HAJAR', children: ['QAYDAR'] }),
      'FAM-ADN': makeFamily({ id: 'FAM-ADN', husband: 'ADNAN', wife: 'WIFE', children: ['MAADD'] }),
      'FAM-MAADD': makeFamily({ id: 'FAM-MAADD', husband: 'MAADD', children: ['NIZAR'] }),
    },
    ancestryJumps: {
      J1: makeJump({
        id: 'J1',
        descendant: 'ADNAN',
        ancestorFamily: 'FAM-ISH',
        generationsMin: 4,
        generationsMax: 40,
      }),
    },
  };
  data.individuals.ADNAN.ancestryJumpAsDescendant = 'J1';
  data.families['FAM-ISH'].ancestryJumpsAsAncestor = ['J1'];
  return data;
}

const sorted = (s: Set<string>) => [...s].sort();

// ---------------------------------------------------------------------------
// The fail-closed guarantee
// ---------------------------------------------------------------------------

describe('getAllDescendants — includeJumps defaults OFF (fail-closed)', () => {
  test('with the option OMITTED, a jump ancestor sees only his recorded child', () => {
    expect(sorted(getAllDescendants(jumpBearingData(), 'ISH'))).toEqual(['QAYDAR']);
  });

  test('with the option OMITTED, the wife of the ancestor couple sees only her recorded child', () => {
    expect(sorted(getAllDescendants(jumpBearingData(), 'HAJAR'))).toEqual(['QAYDAR']);
  });

  test('explicit `{ includeJumps: false }` matches the omitted default', () => {
    expect(sorted(getAllDescendants(jumpBearingData(), 'ISH', { includeJumps: false }))).toEqual([
      'QAYDAR',
    ]);
  });

  test('an empty options object matches the omitted default', () => {
    expect(sorted(getAllDescendants(jumpBearingData(), 'ISH', {}))).toEqual(['QAYDAR']);
  });

  test('the jump descendant’s OWN line is unaffected by the option', () => {
    // عدنان's descendants never depend on the jump above him.
    const data = jumpBearingData();
    expect(sorted(getAllDescendants(data, 'ADNAN'))).toEqual(['MAADD', 'NIZAR']);
    expect(sorted(getAllDescendants(data, 'ADNAN', { includeJumps: true }))).toEqual([
      'MAADD',
      'NIZAR',
    ]);
  });

  test('jump-free data gives byte-identical results either way', () => {
    const data = jumpBearingData();
    delete data.ancestryJumps;
    delete data.individuals.ADNAN.ancestryJumpAsDescendant;
    delete data.families['FAM-ISH'].ancestryJumpsAsAncestor;

    expect(sorted(getAllDescendants(data, 'ISH'))).toEqual(['QAYDAR']);
    expect(sorted(getAllDescendants(data, 'ISH', { includeJumps: true }))).toEqual(['QAYDAR']);
  });
});

// ---------------------------------------------------------------------------
// Opting in
// ---------------------------------------------------------------------------

describe('getAllDescendants — includeJumps: true', () => {
  test('crosses the jump and pulls in the descendant’s whole line', () => {
    expect(sorted(getAllDescendants(jumpBearingData(), 'ISH', { includeJumps: true }))).toEqual([
      'ADNAN',
      'MAADD',
      'NIZAR',
      'QAYDAR',
    ]);
  });

  test('BOTH spouses of the ancestor couple reach across the jump', () => {
    // The jump names the FAMILY, so هاجر gains عدنان's line exactly as إسماعيل does.
    expect(sorted(getAllDescendants(jumpBearingData(), 'HAJAR', { includeJumps: true }))).toEqual([
      'ADNAN',
      'MAADD',
      'NIZAR',
      'QAYDAR',
    ]);
  });

  test('a dangling jump (descendant absent) adds nothing and does not throw', () => {
    const data = jumpBearingData();
    delete data.individuals.ADNAN;
    expect(sorted(getAllDescendants(data, 'ISH', { includeJumps: true }))).toEqual([
      'ADNAN',
      'QAYDAR',
    ]);
  });

  test('terminates on a jump loop rather than recursing forever', () => {
    // Add the reverse jump: إسماعيل ⇢ عدنان's couple, closing the cycle.
    const data = jumpBearingData();
    data.ancestryJumps!.J2 = makeJump({
      id: 'J2',
      descendant: 'ISH',
      ancestorFamily: 'FAM-ADN',
    });
    data.individuals.ISH.ancestryJumpAsDescendant = 'J2';
    data.families['FAM-ADN'].ancestryJumpsAsAncestor = ['J2'];

    const reach = getAllDescendants(data, 'ISH', { includeJumps: true });
    expect(reach.has('ISH')).toBe(true); // reached back around the loop
    expect(sorted(reach)).toEqual(['ADNAN', 'ISH', 'MAADD', 'NIZAR', 'QAYDAR']);
  });
});

// ---------------------------------------------------------------------------
// buildJumpIndex
// ---------------------------------------------------------------------------

describe('buildJumpIndex', () => {
  test('indexes by descendant and by ancestor family', () => {
    const index = buildJumpIndex(jumpBearingData());
    expect(index.byDescendant.get('ADNAN')?.id).toBe('J1');
    expect(index.byAncestorFamily.get('FAM-ISH')?.map((j) => j.id)).toEqual(['J1']);
  });

  test('returns empty maps when the payload has no jumps', () => {
    const index = buildJumpIndex({ individuals: {}, families: {} });
    expect(index.byDescendant.size).toBe(0);
    expect(index.byAncestorFamily.size).toBe(0);
  });

  test('groups several jumps hanging off the same ancestor family', () => {
    const data = jumpBearingData();
    data.ancestryJumps!.J2 = makeJump({
      id: 'J2',
      descendant: 'QAYDAR',
      ancestorFamily: 'FAM-ISH',
    });
    expect(buildJumpIndex(data).byAncestorFamily.get('FAM-ISH')?.map((j) => j.id)).toEqual([
      'J1',
      'J2',
    ]);
  });

  test('first jump wins if malformed data gives one person two', () => {
    const data = jumpBearingData();
    data.ancestryJumps!.J2 = makeJump({
      id: 'J2',
      descendant: 'ADNAN',
      ancestorFamily: 'FAM-MAADD',
    });
    expect(buildJumpIndex(data).byDescendant.get('ADNAN')?.id).toBe('J1');
  });
});

// ===========================================================================
// Chunk 2 — the remaining §5.1 helpers
// ===========================================================================

/**
 * `jumpBearingData` plus a generation ABOVE the ancestor couple:
 * إبراهيم (FAM-IBR) → إسماعيل. The jump ancestor now has his own نسب to climb,
 * which is what distinguishes "emit the ancestor" from "keep walking up".
 */
function deepJumpData(): GedcomData {
  const data = jumpBearingData();
  data.individuals.IBRAHIM = makeIndividual({ id: 'IBRAHIM', familiesAsSpouse: ['FAM-IBR'] });
  data.families['FAM-IBR'] = makeFamily({ id: 'FAM-IBR', husband: 'IBRAHIM', children: ['ISH'] });
  data.individuals.ISH.familyAsChild = 'FAM-IBR';
  return data;
}

/** Add the reverse jump إسماعيل ⇢ عدنان's couple, closing a loop. */
function withJumpLoop(data: GedcomData): GedcomData {
  data.ancestryJumps!.J2 = makeJump({ id: 'J2', descendant: 'ISH', ancestorFamily: 'FAM-ADN' });
  data.individuals.ISH.ancestryJumpAsDescendant = 'J2';
  data.families['FAM-ADN'].ancestryJumpsAsAncestor = ['J2'];
  return data;
}

// ---------------------------------------------------------------------------
// getAllAncestors
// ---------------------------------------------------------------------------

describe('getAllAncestors', () => {
  test('OFF (default): a jump descendant has no ancestors at all', () => {
    expect(sorted(getAllAncestors(deepJumpData(), 'ADNAN'))).toEqual([]);
  });

  test('OFF (default): the climb stops dead at the jump descendant', () => {
    // معد's recorded parents are عدنان + زوجته, and that is the whole answer.
    expect(sorted(getAllAncestors(deepJumpData(), 'MAADD'))).toEqual(['ADNAN', 'WIFE']);
  });

  test('ON: both spouses of the ancestor couple are ancestors, and the climb continues', () => {
    expect(sorted(getAllAncestors(deepJumpData(), 'ADNAN', { includeJumps: true }))).toEqual([
      'HAJAR',
      'IBRAHIM',
      'ISH',
    ]);
  });

  test('ON: a grandchild of the jump descendant reaches the apex ancestor', () => {
    expect(sorted(getAllAncestors(deepJumpData(), 'MAADD', { includeJumps: true }))).toEqual([
      'ADNAN',
      'HAJAR',
      'IBRAHIM',
      'ISH',
      'WIFE',
    ]);
  });

  test('ON: a dangling ancestor family adds nothing and does not throw', () => {
    const data = deepJumpData();
    delete data.families['FAM-ISH'];
    expect(sorted(getAllAncestors(data, 'ADNAN', { includeJumps: true }))).toEqual([]);
  });

  test('ON: a recorded father always wins over the jump', () => {
    // إسماعيل has a real father, so his own (looping) jump is never consulted.
    expect(sorted(getAllAncestors(withJumpLoop(deepJumpData()), 'ADNAN', { includeJumps: true })))
      .toEqual(['HAJAR', 'IBRAHIM', 'ISH']);
  });

  test('ON: terminates on a jump loop', () => {
    const reach = getAllAncestors(withJumpLoop(jumpBearingData()), 'ADNAN', { includeJumps: true });
    expect(sorted(reach)).toEqual(['ADNAN', 'HAJAR', 'ISH', 'WIFE']);
  });

  test('jump-free data gives the same answer either way', () => {
    const data = deepJumpData();
    delete data.ancestryJumps;
    delete data.individuals.ADNAN.ancestryJumpAsDescendant;
    expect(sorted(getAllAncestors(data, 'ADNAN'))).toEqual([]);
    expect(sorted(getAllAncestors(data, 'ADNAN', { includeJumps: true }))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getTreeVisibleIndividuals
// ---------------------------------------------------------------------------

describe('getTreeVisibleIndividuals', () => {
  test('OFF (default): the ancestor couple sees only its recorded child', () => {
    expect(sorted(getTreeVisibleIndividuals(deepJumpData(), 'ISH'))).toEqual([
      'HAJAR',
      'ISH',
      'QAYDAR',
    ]);
  });

  test('ON: the jump descendant, his line AND his spouses become visible', () => {
    expect(
      sorted(getTreeVisibleIndividuals(deepJumpData(), 'ISH', false, { includeJumps: true })),
    ).toEqual(['ADNAN', 'HAJAR', 'ISH', 'MAADD', 'NIZAR', 'QAYDAR', 'WIFE']);
  });

  test('ON: excludePrivate still drops private people from the jumped-in line', () => {
    const data = deepJumpData();
    data.individuals.MAADD.isPrivate = true;
    expect(sorted(getTreeVisibleIndividuals(data, 'ISH', true, { includeJumps: true }))).toEqual([
      'ADNAN',
      'HAJAR',
      'ISH',
      'NIZAR',
      'QAYDAR',
      'WIFE',
    ]);
  });
});

// ---------------------------------------------------------------------------
// getConnectedIndividuals
// ---------------------------------------------------------------------------

describe('getConnectedIndividuals', () => {
  test('OFF (default): the two lines are separate islands', () => {
    const data = deepJumpData();
    expect(sorted(getConnectedIndividuals(data, 'ISH'))).toEqual([
      'HAJAR',
      'IBRAHIM',
      'ISH',
      'QAYDAR',
    ]);
    expect(sorted(getConnectedIndividuals(data, 'ADNAN'))).toEqual([
      'ADNAN',
      'MAADD',
      'NIZAR',
      'WIFE',
    ]);
  });

  test('ON: the jump bridges the two islands, from either side', () => {
    const all = ['ADNAN', 'HAJAR', 'IBRAHIM', 'ISH', 'MAADD', 'NIZAR', 'QAYDAR', 'WIFE'];
    expect(sorted(getConnectedIndividuals(deepJumpData(), 'ISH', { includeJumps: true }))).toEqual(
      all,
    );
    expect(sorted(getConnectedIndividuals(deepJumpData(), 'ADNAN', { includeJumps: true }))).toEqual(
      all,
    );
  });

  test('ON: private people are still filtered out of the returned set', () => {
    const data = deepJumpData();
    data.individuals.ADNAN.isPrivate = true;
    const reach = getConnectedIndividuals(data, 'ISH', { includeJumps: true });
    expect(reach.has('ADNAN')).toBe(false);
    // …but the walk passed THROUGH him, so his line is still connected.
    expect(reach.has('NIZAR')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getCanvasVisibleIndividuals
// ---------------------------------------------------------------------------

describe('getCanvasVisibleIndividuals', () => {
  test('OFF (default): the canvas under the ancestor shows only his own line', () => {
    expect(sorted(getCanvasVisibleIndividuals(deepJumpData(), 'ISH'))).toEqual([
      'HAJAR',
      'ISH',
      'QAYDAR',
    ]);
  });

  test('ON: the canvas under the ancestor draws the jumped-in line too', () => {
    expect(
      sorted(getCanvasVisibleIndividuals(deepJumpData(), 'ISH', { includeJumps: true })),
    ).toEqual(['ADNAN', 'HAJAR', 'ISH', 'MAADD', 'NIZAR', 'QAYDAR', 'WIFE']);
  });
});

// ---------------------------------------------------------------------------
// buildChildrenGraph (+ calculateDescendantCounts, which is UNCHANGED)
// ---------------------------------------------------------------------------

describe('buildChildrenGraph', () => {
  test('OFF (default): neither spouse of the ancestor couple gains the jump descendant', () => {
    const childrenOf = buildChildrenGraph(deepJumpData());
    expect(childrenOf.get('ISH')).toEqual(['QAYDAR']);
    expect(childrenOf.get('HAJAR')).toEqual(['QAYDAR']);
  });

  test('ON: BOTH spouses gain the jump descendant as a child edge', () => {
    const childrenOf = buildChildrenGraph(deepJumpData(), { includeJumps: true });
    expect(childrenOf.get('ISH')?.slice().sort()).toEqual(['ADNAN', 'QAYDAR']);
    expect(childrenOf.get('HAJAR')?.slice().sort()).toEqual(['ADNAN', 'QAYDAR']);
  });

  test('ON: a jump descendant who is ALSO a recorded child is not duplicated', () => {
    const data = deepJumpData();
    data.ancestryJumps!.J2 = makeJump({
      id: 'J2',
      descendant: 'QAYDAR',
      ancestorFamily: 'FAM-ISH',
    });
    const childrenOf = buildChildrenGraph(data, { includeJumps: true });
    expect(childrenOf.get('ISH')?.slice().sort()).toEqual(['ADNAN', 'QAYDAR']);
  });

  test('ON: a dangling ancestor family contributes no edge', () => {
    const data = deepJumpData();
    delete data.families['FAM-ISH'];
    const childrenOf = buildChildrenGraph(data, { includeJumps: true });
    expect(childrenOf.get('ISH')).toEqual([]);
  });

  test('calculateDescendantCounts is unchanged — jumps enter only via the graph it is given', () => {
    const data = deepJumpData();
    const blind = calculateDescendantCounts(data.individuals, buildChildrenGraph(data));
    expect(blind.get('ISH')).toBe(1);
    expect(blind.get('IBRAHIM')).toBe(2);

    const aware = calculateDescendantCounts(
      data.individuals,
      buildChildrenGraph(data, { includeJumps: true }),
    );
    expect(aware.get('ISH')).toBe(4); // قيدار + عدنان + معد + نزار
    expect(aware.get('IBRAHIM')).toBe(5); // …plus إسماعيل himself
  });
});

// ---------------------------------------------------------------------------
// findTopmostAncestor
// ---------------------------------------------------------------------------

describe('findTopmostAncestor', () => {
  test('OFF (default): the climb stops at the jump descendant', () => {
    expect(findTopmostAncestor(deepJumpData(), 'NIZAR')).toBe('ADNAN');
  });

  test('OFF (default): a parentless jump descendant is already a root', () => {
    expect(findTopmostAncestor(deepJumpData(), 'ADNAN')).toBeNull();
  });

  test('ON: the climb crosses the jump and reaches the apex ancestor', () => {
    expect(findTopmostAncestor(deepJumpData(), 'NIZAR', { includeJumps: true })).toBe('IBRAHIM');
  });

  test('ON: the jump descendant himself is no longer a root', () => {
    expect(findTopmostAncestor(deepJumpData(), 'ADNAN', { includeJumps: true })).toBe('IBRAHIM');
  });

  test('ON: a wife-only ancestor couple is climbed through the wife', () => {
    const data = jumpBearingData();
    data.families['FAM-ISH'].husband = null;
    delete data.individuals.ISH;
    expect(findTopmostAncestor(data, 'ADNAN', { includeJumps: true })).toBe('HAJAR');
  });

  test('ON: an ancestor couple with no surviving spouse leaves the person a root', () => {
    const data = jumpBearingData();
    data.families['FAM-ISH'].husband = null;
    data.families['FAM-ISH'].wife = null;
    expect(findTopmostAncestor(data, 'ADNAN', { includeJumps: true })).toBeNull();
  });

  test('ON: a jump loop terminates at the already-visited node instead of spinning', () => {
    // عدنان ⇢ إسماعيل's couple and إسماعيل ⇢ عدنان's couple: the visited set
    // breaks the ring and returns the highest node actually reached.
    expect(findTopmostAncestor(withJumpLoop(jumpBearingData()), 'ADNAN', { includeJumps: true }))
      .toBe('ISH');
  });
});

// ---------------------------------------------------------------------------
// resolveNavigationRoot
// ---------------------------------------------------------------------------

describe('resolveNavigationRoot', () => {
  test('OFF (default): clicking the jump descendant roots on his own line', () => {
    expect(resolveNavigationRoot(deepJumpData(), 'ADNAN', 'ISH')).toBe('ADNAN');
  });

  test('ON: clicking the jump descendant keeps him embedded under the apex ancestor', () => {
    expect(resolveNavigationRoot(deepJumpData(), 'ADNAN', 'ISH', { includeJumps: true })).toBe(
      'IBRAHIM',
    );
  });
});

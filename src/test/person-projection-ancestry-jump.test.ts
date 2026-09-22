/**
 * «قفزة نسب» — Person Page projection (§7).
 *
 * The jump is walked by the nasab spine exactly like a father link, so the two
 * hard invariants of `person-projection.ts` must survive it untouched:
 *
 *   1. a BOUNDARY ancestor reached through a jump is emitted as a chip and
 *      never climbed past;
 *   2. a PRIVATE ancestor reached through a jump surfaces ONLY as the id-less
 *      «خاص» placeholder — a direct-ancestor nasab position, the one place a
 *      private person may appear.
 *
 * Separately, `projection.ancestryJump` carries the ancestor COUPLE, which is
 * the only place a FEMALE-only distant ancestor is ever shown (she is not in
 * the نسب chain — owner ruling).
 */
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { GedcomData, Individual, Family, AncestryJump } from '@/lib/gedcom/types';
import {
  projectPerson,
  PRIVATE_PLACEHOLDER,
  MEMBER_PROJECT_OPTIONS,
  type ProjectOptions,
} from '@/lib/tree/person-projection';

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

function build(
  individuals: Individual[],
  families: Family[],
  jumps: AncestryJump[] = [],
): GedcomData {
  const data: GedcomData = {
    individuals: Object.fromEntries(individuals.map((i) => [i.id, i])),
    families: Object.fromEntries(families.map((f) => [f.id, f])),
  };
  if (jumps.length > 0) {
    data.ancestryJumps = Object.fromEntries(jumps.map((j) => [j.id, j]));
    for (const jump of jumps) {
      const descendant = data.individuals[jump.descendant];
      if (descendant) descendant.ancestryJumpAsDescendant = jump.id;
      const family = data.families[jump.ancestorFamily];
      if (family) {
        family.ancestryJumpsAsAncestor = [...(family.ancestryJumpsAsAncestor ?? []), jump.id];
      }
    }
  }
  return data;
}

const MEMBER: ProjectOptions = MEMBER_PROJECT_OPTIONS;
const ids = (chips: { id?: string }[]) => chips.map((c) => c.id);

/**
 * إبراهيم → إسماعيل × هاجر, and عدنان ⇢ that couple across 4–40 generations.
 * عدنان is the subject throughout unless a test says otherwise.
 */
function adnanData(jumpOverrides: Partial<AncestryJump> = {}): GedcomData {
  return build(
    [
      makeIndividual({ id: 'IBRAHIM', givenName: 'إبراهيم', familiesAsSpouse: ['FAM-IBR'] }),
      makeIndividual({
        id: 'ISH',
        givenName: 'إسماعيل',
        familyAsChild: 'FAM-IBR',
        familiesAsSpouse: ['FAM-ISH'],
      }),
      makeIndividual({ id: 'HAJAR', givenName: 'هاجر', sex: 'F', familiesAsSpouse: ['FAM-ISH'] }),
      makeIndividual({ id: 'ADNAN', givenName: 'عدنان' }),
    ],
    [
      makeFamily({ id: 'FAM-IBR', husband: 'IBRAHIM', children: ['ISH'] }),
      makeFamily({ id: 'FAM-ISH', husband: 'ISH', wife: 'HAJAR' }),
    ],
    [
      makeJump({
        id: 'J1',
        descendant: 'ADNAN',
        ancestorFamily: 'FAM-ISH',
        generationsMin: 4,
        generationsMax: 40,
        ...jumpOverrides,
      }),
    ],
  );
}

// ---------------------------------------------------------------------------
// The paternal spine
// ---------------------------------------------------------------------------

describe('paternal spine across a «قفزة نسب»', () => {
  test('emits the jump ancestor and keeps climbing HIS own father chain', () => {
    const { paternalChain } = projectPerson(adnanData(), 'ADNAN', MEMBER)!;
    expect(ids(paternalChain)).toEqual(['IBRAHIM', 'ISH']); // oldest → nearest
  });

  test('only the node REACHED BY the jump is marked, carrying the range', () => {
    const { paternalChain } = projectPerson(adnanData(), 'ADNAN', MEMBER)!;
    const [ibrahim, ish] = paternalChain;
    expect(ish.jump).toEqual({ generationsMin: 4, generationsMax: 40 });
    expect(ibrahim.jump).toBeUndefined();
  });

  test('an unstated range still marks the node, with both bounds null', () => {
    const data = adnanData({ generationsMin: null, generationsMax: null });
    const { paternalChain } = projectPerson(data, 'ADNAN', MEMBER)!;
    expect(paternalChain[1].jump).toEqual({ generationsMin: null, generationsMax: null });
  });

  test('a person with a recorded father never consults his jump', () => {
    // Defence in depth: rule J3 forbids this row, but if one exists the real
    // father wins and no jump token is emitted.
    const data = adnanData();
    data.individuals.ADNAN.familyAsChild = 'FAM-REAL';
    data.individuals.REAL = makeIndividual({
      id: 'REAL',
      givenName: 'أبوه',
      familiesAsSpouse: ['FAM-REAL'],
    });
    data.families['FAM-REAL'] = makeFamily({
      id: 'FAM-REAL',
      husband: 'REAL',
      children: ['ADNAN'],
    });
    const { paternalChain } = projectPerson(data, 'ADNAN', MEMBER)!;
    expect(ids(paternalChain)).toEqual(['REAL']);
    expect(paternalChain[0].jump).toBeUndefined();
  });

  test('a female-only ancestor couple contributes NO spine token', () => {
    const data = adnanData();
    data.families['FAM-ISH'].husband = null;
    const { paternalChain } = projectPerson(data, 'ADNAN', MEMBER)!;
    expect(paternalChain).toEqual([]);
  });

  test('a dangling ancestor family contributes NO spine token', () => {
    const data = adnanData();
    delete data.families['FAM-ISH'];
    expect(projectPerson(data, 'ADNAN', MEMBER)!.paternalChain).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Invariant 2 — the private gate
// ---------------------------------------------------------------------------

describe('a PRIVATE jump ancestor', () => {
  test('surfaces as the id-less «خاص» placeholder, still marked as a jump', () => {
    const data = adnanData();
    data.individuals.ISH.isPrivate = true;
    const { paternalChain } = projectPerson(data, 'ADNAN', MEMBER)!;
    const reached = paternalChain[paternalChain.length - 1];
    expect(reached.name).toBe(PRIVATE_PLACEHOLDER);
    expect(reached.private).toBe(true);
    expect(reached.id).toBeUndefined();
    expect(reached.jump).toEqual({ generationsMin: 4, generationsMax: 40 });
  });

  test('the member surface keeps climbing past him to his public father', () => {
    const data = adnanData();
    data.individuals.ISH.isPrivate = true;
    const { paternalChain } = projectPerson(data, 'ADNAN', MEMBER)!;
    expect(ids(paternalChain)).toEqual(['IBRAHIM', undefined]);
  });

  test('a surface that stops at a private ancestor stops right there', () => {
    const data = adnanData();
    data.individuals.ISH.isPrivate = true;
    const conservative: ProjectOptions = {
      maternalRecursionDepth: 1,
      isBoundary: () => false,
      continueThroughPrivateAncestor: false,
    };
    const { paternalChain } = projectPerson(data, 'ADNAN', conservative)!;
    expect(paternalChain.length).toBe(1);
    expect(paternalChain[0].name).toBe(PRIVATE_PLACEHOLDER);
  });
});

// ---------------------------------------------------------------------------
// Invariant 1 — the cross-workspace boundary
// ---------------------------------------------------------------------------

describe('a BOUNDARY jump ancestor', () => {
  const atIsh: ProjectOptions = {
    maternalRecursionDepth: Infinity,
    isBoundary: (ind) => ind.id === 'ISH',
    continueThroughPrivateAncestor: true,
  };

  test('is emitted as a chip but never climbed past', () => {
    const { paternalChain } = projectPerson(adnanData(), 'ADNAN', atIsh)!;
    expect(ids(paternalChain)).toEqual(['ISH']);
    expect(paternalChain[0].jump).toEqual({ generationsMin: 4, generationsMax: 40 });
  });

  test('his married-in mother is not enumerated either', () => {
    const data = adnanData();
    data.families['FAM-IBR'].wife = 'SARAH';
    data.individuals.SARAH = makeIndividual({
      id: 'SARAH',
      givenName: 'سارة',
      sex: 'F',
      familiesAsSpouse: ['FAM-IBR'],
    });
    const { paternalChain } = projectPerson(data, 'ADNAN', atIsh)!;
    expect(paternalChain[0].mother).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The female nasab climbs jumps too
// ---------------------------------------------------------------------------

describe('the female-line walks', () => {
  /** بشر × سلمى; سلمى has no recorded father but a jump to إسماعيل's couple. */
  function motherJumpData(): GedcomData {
    const data = adnanData();
    data.individuals.SUBJ = makeIndividual({ id: 'SUBJ', givenName: 'زيد', familyAsChild: 'F0' });
    data.individuals.BISHR = makeIndividual({
      id: 'BISHR',
      givenName: 'بشر',
      familiesAsSpouse: ['F0'],
    });
    data.individuals.SALMA = makeIndividual({
      id: 'SALMA',
      givenName: 'سلمى',
      sex: 'F',
      familiesAsSpouse: ['F0'],
    });
    data.families.F0 = makeFamily({
      id: 'F0',
      husband: 'BISHR',
      wife: 'SALMA',
      children: ['SUBJ'],
    });
    // Move the jump from عدنان onto سلمى.
    delete data.individuals.ADNAN.ancestryJumpAsDescendant;
    data.ancestryJumps!.J1.descendant = 'SALMA';
    data.individuals.SALMA.ancestryJumpAsDescendant = 'J1';
    return data;
  }

  test('the maternal spine climbs the mother’s jump and marks the ancestor', () => {
    const { maternalChain } = projectPerson(motherJumpData(), 'SUBJ', MEMBER)!;
    expect(ids(maternalChain)).toEqual(['IBRAHIM', 'ISH', 'SALMA']);
    expect(maternalChain[1].jump).toEqual({ generationsMin: 4, generationsMax: 40 });
  });

  test('a married-in mother’s fathers-only chain crosses her jump', () => {
    // The spine man بشر carries his own married-in mother; SHE is the one with
    // the jump, so the chain under her disclosure must cross it.
    const data = motherJumpData();
    data.individuals.BISHR.familyAsChild = 'F-B';
    data.individuals.BFATHER = makeIndividual({
      id: 'BFATHER',
      givenName: 'أبوبشر',
      familiesAsSpouse: ['F-B'],
    });
    data.individuals.BMOTHER = makeIndividual({
      id: 'BMOTHER',
      givenName: 'أمبشر',
      sex: 'F',
      familiesAsSpouse: ['F-B'],
    });
    data.families['F-B'] = makeFamily({
      id: 'F-B',
      husband: 'BFATHER',
      wife: 'BMOTHER',
      children: ['BISHR'],
    });
    // أمّ بشر has no father of her own, but she does have a «قفزة نسب».
    data.ancestryJumps!.J2 = makeJump({
      id: 'J2',
      descendant: 'BMOTHER',
      ancestorFamily: 'FAM-ISH',
      generationsMin: 7,
      generationsMax: null,
    });
    data.individuals.BMOTHER.ancestryJumpAsDescendant = 'J2';

    const { paternalChain } = projectPerson(data, 'SUBJ', MEMBER)!;
    const bishr = paternalChain[paternalChain.length - 1];
    expect(bishr.id).toBe('BISHR');
    expect(ids(bishr.mother!.fathers)).toEqual(['ISH', 'IBRAHIM']); // nearest → oldest
    expect(bishr.mother!.fathers[0].jump).toEqual({ generationsMin: 7, generationsMax: null });
  });
});

// ---------------------------------------------------------------------------
// projection.ancestryJump — the couple
// ---------------------------------------------------------------------------

describe('projection.ancestryJump', () => {
  test('carries both ancestors and the range', () => {
    const jump = projectPerson(adnanData(), 'ADNAN', MEMBER)!.ancestryJump!;
    expect(jump.generationsMin).toBe(4);
    expect(jump.generationsMax).toBe(40);
    expect(jump.father?.id).toBe('ISH');
    expect(jump.mother?.id).toBe('HAJAR');
  });

  test('the father chip is the SAME person as the jump-marked head of the spine', () => {
    const projection = projectPerson(adnanData(), 'ADNAN', MEMBER)!;
    const marked = projection.paternalChain.find((c) => c.jump);
    expect(projection.ancestryJump!.father?.id).toBe(marked!.id);
  });

  test('a FEMALE-ONLY ancestor is surfaced here even though the نسب chain stops', () => {
    const data = adnanData();
    data.families['FAM-ISH'].husband = null;
    const projection = projectPerson(data, 'ADNAN', MEMBER)!;
    expect(projection.paternalChain).toEqual([]);
    expect(projection.ancestryJump!.father).toBeNull();
    expect(projection.ancestryJump!.mother?.id).toBe('HAJAR');
  });

  test('a private ancestor yields null in HIS slot, not a placeholder', () => {
    const data = adnanData();
    data.individuals.ISH.isPrivate = true;
    const jump = projectPerson(data, 'ADNAN', MEMBER)!.ancestryJump!;
    expect(jump.father).toBeNull();
    expect(jump.mother?.id).toBe('HAJAR');
  });

  test('is absent when BOTH ancestors are private', () => {
    const data = adnanData();
    data.individuals.ISH.isPrivate = true;
    data.individuals.HAJAR.isPrivate = true;
    expect(projectPerson(data, 'ADNAN', MEMBER)!.ancestryJump).toBeUndefined();
  });

  test('is absent when the person has no jump', () => {
    expect(projectPerson(adnanData(), 'ISH', MEMBER)!.ancestryJump).toBeUndefined();
  });

  test('is absent when the jump dangles', () => {
    const data = adnanData();
    delete data.families['FAM-ISH'];
    expect(projectPerson(data, 'ADNAN', MEMBER)!.ancestryJump).toBeUndefined();
  });

  test('is absent when the back-reference points at a missing jump row', () => {
    const data = adnanData();
    delete data.ancestryJumps!.J1;
    expect(projectPerson(data, 'ADNAN', MEMBER)!.ancestryJump).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ETag
// ---------------------------------------------------------------------------

describe('PROJECTION_ETAG_VERSION', () => {
  test('is bumped to v4 — a logic-only projection change leaves lastModifiedAt alone', () => {
    const route = readFileSync(
      join(process.cwd(), 'src/app/api/workspaces/[id]/tree/person/[individualId]/route.ts'),
      'utf-8',
    );
    expect(route).toContain("const PROJECTION_ETAG_VERSION = 'v4'");
  });
});

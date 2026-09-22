/**
 * «قفزة نسب» — PUBLIC redaction (spec §6.1).
 *
 * `redactForPublic` is the ONE filter a stranger's payload passes through. A
 * jump is a published lineage CLAIM about three people (the descendant and the
 * ancestor couple), so it is FAIL-CLOSED: the whole row is dropped unless every
 * one of those three survives redaction. Half-publishing a couple would be a
 * structural oracle — «X من وَلَد إسماعيل» with the wife hidden still publishes
 * that the hidden person is إسماعيل's wife.
 *
 * The dangling-reference rule is the other half: when a jump is dropped, every
 * back-reference to it (`Individual.ancestryJumpAsDescendant`,
 * `Family.ancestryJumpsAsAncestor`) must go with it, or a public consumer
 * dereferences an id that is not in the payload.
 */
import { describe, test, expect } from 'vitest';
import type { GedcomData, Individual, Family, AncestryJump } from '@/lib/gedcom/types';
import { redactForPublic } from '@/lib/tree/public-visibility';
import { composePublicGedcom } from '@/lib/tree/public-compose';

// ---------------------------------------------------------------------------
// Fixture builders (same shape as public-visibility.test.ts)
// ---------------------------------------------------------------------------

function ind(overrides: Partial<Individual> & { id: string }): Individual {
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
    isDeceased: true,
    isPrivate: false,
    familiesAsSpouse: [],
    familyAsChild: null,
    ...overrides,
  };
}

const EMPTY_EVENT = { date: '', hijriDate: '', place: '', description: '', notes: '' };

function fam(overrides: Partial<Family> & { id: string }): Family {
  return {
    type: 'FAM',
    husband: null,
    wife: null,
    children: [],
    marriageContract: { ...EMPTY_EVENT },
    marriage: { ...EMPTY_EVENT },
    divorce: { ...EMPTY_EVENT },
    isDivorced: false,
    ...overrides,
  };
}

function jump(overrides: Partial<AncestryJump> & { id: string }): AncestryJump {
  return {
    type: '_ANC_JUMP',
    descendant: 'adnan',
    ancestorFamily: 'f-ish',
    generationsMin: null,
    generationsMax: null,
    notes: '',
    ...overrides,
  };
}

const NOW = new Date('2026-06-15T00:00:00Z');
const JUMP_NOTES = 'قفزة نسب: عدنان من وَلَد إسماعيل عليه السلام. قيل سبعة، وقيل أربعون.';

/**
 * عدنان (jump descendant, born long ago so he is `full`) linked to the
 * إسماعيل × هاجر couple. `opts` flips any of the three to private.
 */
function buildTree(
  opts: { descendantPrivate?: boolean; husbandPrivate?: boolean; wifePrivate?: boolean } = {},
): GedcomData {
  const individuals: Record<string, Individual> = {
    adnan: ind({
      id: 'adnan',
      name: 'عدنان',
      birth: '0100',
      isPrivate: opts.descendantPrivate ?? false,
      familiesAsSpouse: ['f-adnan'],
      ancestryJumpAsDescendant: 'j1',
    }),
    maadd: ind({ id: 'maadd', name: 'معد', birth: '0130', familyAsChild: 'f-adnan' }),
    ish: ind({
      id: 'ish',
      name: 'إسماعيل',
      birth: '0001',
      isPrivate: opts.husbandPrivate ?? false,
      familiesAsSpouse: ['f-ish'],
    }),
    hagar: ind({
      id: 'hagar',
      name: 'هاجر',
      sex: 'F',
      birth: '0001',
      isPrivate: opts.wifePrivate ?? false,
      familiesAsSpouse: ['f-ish'],
    }),
  };
  const families: Record<string, Family> = {
    'f-ish': fam({ id: 'f-ish', husband: 'ish', wife: 'hagar', ancestryJumpsAsAncestor: ['j1'] }),
    'f-adnan': fam({ id: 'f-adnan', husband: 'adnan', children: ['maadd'] }),
  };
  return {
    individuals,
    families,
    ancestryJumps: { j1: jump({ id: 'j1', generationsMin: 4, generationsMax: 40, notes: JUMP_NOTES }) },
  };
}

// ---------------------------------------------------------------------------
// The jump survives only when all three people survive
// ---------------------------------------------------------------------------

describe('redactForPublic — «قفزة نسب» survival', () => {
  test('keeps the jump when the descendant and both ancestors are public', () => {
    const out = redactForPublic(buildTree(), NOW);
    expect(Object.keys(out.ancestryJumps ?? {})).toEqual(['j1']);
  });

  test('keeps the scholarly notes on a surviving jump', () => {
    const out = redactForPublic(buildTree(), NOW);
    expect(out.ancestryJumps?.j1.notes).toBe(JUMP_NOTES);
  });

  test('keeps the stated generation range on a surviving jump', () => {
    const out = redactForPublic(buildTree(), NOW);
    expect(out.ancestryJumps?.j1.generationsMin).toBe(4);
    expect(out.ancestryJumps?.j1.generationsMax).toBe(40);
  });

  test('drops the jump when the DESCENDANT is private', () => {
    const out = redactForPublic(buildTree({ descendantPrivate: true }), NOW);
    expect(out.ancestryJumps).toBeUndefined();
  });

  test('drops the jump when the ancestor HUSBAND is private', () => {
    const out = redactForPublic(buildTree({ husbandPrivate: true }), NOW);
    expect(out.ancestryJumps).toBeUndefined();
  });

  test('drops the jump when the ancestor WIFE is private even though the husband is public', () => {
    // Fail-closed: a surviving «من وَلَد إسماعيل» would publish that the hidden
    // person is his wife.
    const out = redactForPublic(buildTree({ wifePrivate: true }), NOW);
    expect(out.ancestryJumps).toBeUndefined();
  });

  test('keeps the jump when the people are LIVING (living is not redacted)', () => {
    const data = buildTree();
    for (const id of ['adnan', 'ish', 'hagar']) {
      data.individuals[id].birth = '2000';
      data.individuals[id].isDeceased = false;
    }
    const out = redactForPublic(data, NOW);
    expect(out.individuals.adnan.publicDisplay).toBe('living');
    expect(Object.keys(out.ancestryJumps ?? {})).toEqual(['j1']);
  });

  test('drops the jump when the ancestor family is absent from the payload', () => {
    const data = buildTree();
    delete data.families['f-ish'];
    const out = redactForPublic(data, NOW);
    expect(out.ancestryJumps).toBeUndefined();
  });

  test('drops the jump when the ancestor family has no spouse at all', () => {
    const data = buildTree();
    data.families['f-ish'].husband = null;
    data.families['f-ish'].wife = null;
    const out = redactForPublic(data, NOW);
    expect(out.ancestryJumps).toBeUndefined();
  });

  test('drops the jump when a named spouse is missing from individuals', () => {
    const data = buildTree();
    delete data.individuals.hagar;
    const out = redactForPublic(data, NOW);
    expect(out.ancestryJumps).toBeUndefined();
  });

  test('drops the jump when the descendant is missing from individuals', () => {
    const data = buildTree();
    delete data.individuals.adnan;
    const out = redactForPublic(data, NOW);
    expect(out.ancestryJumps).toBeUndefined();
  });

  test('omits the ancestryJumps key entirely when the input had none', () => {
    const data = buildTree();
    delete data.ancestryJumps;
    const out = redactForPublic(data, NOW);
    expect(out.ancestryJumps).toBeUndefined();
  });

  test('keeps a public jump and drops a private one in the same payload', () => {
    const data = buildTree();
    data.individuals.qidar = ind({ id: 'qidar', name: 'قيدار', birth: '0100', isPrivate: true });
    data.individuals.qidar.ancestryJumpAsDescendant = 'j2';
    data.families['f-ish'].ancestryJumpsAsAncestor = ['j1', 'j2'];
    data.ancestryJumps!.j2 = jump({ id: 'j2', descendant: 'qidar' });

    const out = redactForPublic(data, NOW);
    expect(Object.keys(out.ancestryJumps ?? {})).toEqual(['j1']);
  });
});

// ---------------------------------------------------------------------------
// Dangling back-references
// ---------------------------------------------------------------------------

describe('redactForPublic — back-references follow the jump', () => {
  test('keeps the descendant back-reference when the jump survives', () => {
    const out = redactForPublic(buildTree(), NOW);
    expect(out.individuals.adnan.ancestryJumpAsDescendant).toBe('j1');
  });

  test('clears the descendant back-reference when the jump is dropped', () => {
    const out = redactForPublic(buildTree({ husbandPrivate: true }), NOW);
    expect(out.individuals.adnan.ancestryJumpAsDescendant).toBeUndefined();
  });

  test('clears the back-reference on a REDACTED descendant too', () => {
    const out = redactForPublic(buildTree({ descendantPrivate: true }), NOW);
    expect(out.individuals.adnan.publicDisplay).toBe('redacted');
    expect(out.individuals.adnan.ancestryJumpAsDescendant).toBeUndefined();
  });

  test('clears the family back-reference when the jump is dropped', () => {
    const out = redactForPublic(buildTree({ wifePrivate: true }), NOW);
    expect(out.families['f-ish'].ancestryJumpsAsAncestor).toBeUndefined();
  });

  test('keeps the family back-reference when the jump survives', () => {
    const out = redactForPublic(buildTree(), NOW);
    expect(out.families['f-ish'].ancestryJumpsAsAncestor).toEqual(['j1']);
  });

  test('prunes only the dropped id from a family that hosts two jumps', () => {
    const data = buildTree();
    data.individuals.qidar = ind({ id: 'qidar', name: 'قيدار', birth: '0100', isPrivate: true });
    data.individuals.qidar.ancestryJumpAsDescendant = 'j2';
    data.families['f-ish'].ancestryJumpsAsAncestor = ['j1', 'j2'];
    data.ancestryJumps!.j2 = jump({ id: 'j2', descendant: 'qidar' });

    const out = redactForPublic(data, NOW);
    expect(out.families['f-ish'].ancestryJumpsAsAncestor).toEqual(['j1']);
  });

  test('every surviving back-reference resolves inside the published payload', () => {
    const out = redactForPublic(buildTree({ husbandPrivate: true }), NOW);
    for (const person of Object.values(out.individuals)) {
      if (person.ancestryJumpAsDescendant) {
        expect(out.ancestryJumps?.[person.ancestryJumpAsDescendant]).toBeDefined();
      }
    }
    for (const family of Object.values(out.families)) {
      for (const id of family.ancestryJumpsAsAncestor ?? []) {
        expect(out.ancestryJumps?.[id]).toBeDefined();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Composition — the jump has to REACH the redactor (§6.3)
// ---------------------------------------------------------------------------

describe('composePublicGedcom — «قفزة نسب»', () => {
  test('carries the home tree’s jumps into the composed payload', () => {
    const composed = composePublicGedcom(buildTree(), []);
    expect(Object.keys(composed.ancestryJumps ?? {})).toEqual(['j1']);
  });

  test('never composes in a borrowed branch’s jumps', () => {
    // A borrowed subtree is downward-only, so any jump it appears to carry
    // points at an ancestor family outside the borrowed set.
    const borrowed = buildTree();
    borrowed.ancestryJumps = { 'j-borrowed': jump({ id: 'j-borrowed' }) };
    const composed = composePublicGedcom({ individuals: {}, families: {} }, [borrowed]);
    expect(composed.ancestryJumps).toBeUndefined();
  });

  test('omits the key when the home tree has no jumps', () => {
    const home = buildTree();
    delete home.ancestryJumps;
    expect(composePublicGedcom(home, []).ancestryJumps).toBeUndefined();
  });

  test('compose-then-redact still drops a jump with a private ancestor', () => {
    const composed = composePublicGedcom(buildTree({ husbandPrivate: true }), []);
    expect(redactForPublic(composed, NOW).ancestryJumps).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Purity
// ---------------------------------------------------------------------------

describe('redactForPublic — the input is never mutated', () => {
  test('leaves the caller’s jumps, individuals and families untouched', () => {
    const data = buildTree({ husbandPrivate: true });
    redactForPublic(data, NOW);

    expect(Object.keys(data.ancestryJumps ?? {})).toEqual(['j1']);
    expect(data.individuals.adnan.ancestryJumpAsDescendant).toBe('j1');
    expect(data.families['f-ish'].ancestryJumpsAsAncestor).toEqual(['j1']);
    expect(data.individuals.ish.name).toBe('إسماعيل');
  });
});

/**
 * «قفزة نسب» — moving a jump up to a brand-new father (pure planning layer).
 *
 * P has a jump to a distant ancestor couple. When the editor adds P's real
 * father F, the jump must travel UP to F: F becomes the descendant, and one
 * generation of the stated gap is now recorded, so the range shrinks by one.
 *
 * Three pure pieces live here:
 *   - `shiftJumpRange` — the one-generation shrink (below 1 → unstated);
 *   - `planJumpMoveToNewFather` — refusals + the J-rules run on the PROJECTED
 *     tree (F in place, P under him), never on today's tree;
 *   - `checkJumpMoveBack` — the undo guard: only a tree that still looks
 *     exactly like "what the move created" may be rolled back.
 */
import { describe, test, expect } from 'vitest';
import type { AncestryJump, Family, GedcomData, Individual } from '@/lib/gedcom/types';
import {
  shiftJumpRange,
  planJumpMoveToNewFather,
  checkJumpMoveBack,
  JUMP_MOVE_BACK_STALE_MESSAGE,
} from '@/lib/tree/ancestry-jump-validators';

function ind(id: string, overrides: Partial<Individual> = {}): Individual {
  return {
    id,
    type: 'INDI',
    name: id,
    givenName: id,
    surname: '',
    sex: 'M',
    birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
    death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
    notes: '',
    isDeceased: false,
    isPrivate: false,
    familiesAsSpouse: [],
    kunya: '',
    familyAsChild: null,
    ...overrides,
  };
}

const EMPTY = { date: '', hijriDate: '', place: '', description: '', notes: '' };
function fam(id: string, overrides: Partial<Family> = {}): Family {
  return {
    id,
    type: 'FAM',
    husband: null,
    wife: null,
    children: [],
    marriageContract: EMPTY,
    marriage: EMPTY,
    divorce: EMPTY,
    isDivorced: false,
    ...overrides,
  };
}

function jump(overrides: Partial<AncestryJump> = {}): AncestryJump {
  return {
    id: 'J1',
    type: '_ANC_JUMP',
    descendant: 'P',
    ancestorFamily: 'F-ISH',
    generationsMin: 5,
    generationsMax: 40,
    notes: '',
    ...overrides,
  };
}

/** P (parentless) → jump → إسماعيل's couple. P has a son S. */
function treeWithJump(j: Partial<AncestryJump> = {}): GedcomData {
  return {
    individuals: {
      P: ind('P', { familiesAsSpouse: ['F-P'], ancestryJumpAsDescendant: 'J1' }),
      S: ind('S', { familyAsChild: 'F-P' }),
      ISH: ind('ISH', { familiesAsSpouse: ['F-ISH'] }),
    },
    families: {
      'F-P': fam('F-P', { husband: 'P', children: ['S'] }),
      'F-ISH': fam('F-ISH', { husband: 'ISH', ancestryJumpsAsAncestor: ['J1'] }),
    },
    ancestryJumps: { J1: jump(j) },
  };
}

// ---------------------------------------------------------------------------
// shiftJumpRange
// ---------------------------------------------------------------------------

describe('shiftJumpRange — one recorded generation shrinks the stated gap', () => {
  test('an unstated bound stays unstated', () => {
    expect(shiftJumpRange(null, null)).toEqual({ generationsMin: null, generationsMax: null });
  });

  test('a bound of 1 becomes unstated (0 skipped generations is not a gap)', () => {
    expect(shiftJumpRange(1, 1)).toEqual({ generationsMin: null, generationsMax: null });
  });

  test('each stated bound drops by one', () => {
    expect(shiftJumpRange(5, 40)).toEqual({ generationsMin: 4, generationsMax: 39 });
  });

  test('a min of 1 goes unstated while the max still drops', () => {
    expect(shiftJumpRange(1, 3)).toEqual({ generationsMin: null, generationsMax: 2 });
  });
});

// ---------------------------------------------------------------------------
// planJumpMoveToNewFather
// ---------------------------------------------------------------------------

describe('planJumpMoveToNewFather', () => {
  test('an unknown jump is a 404', () => {
    const plan = planJumpMoveToNewFather(treeWithJump(), 'NOPE');
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.status).toBe(404);
  });

  test('a descendant who already has parents is a 409 — the tree changed under us', () => {
    const data = treeWithJump();
    data.individuals.P = { ...data.individuals.P, familyAsChild: 'F-X' };
    data.families['F-X'] = fam('F-X', { husband: 'S', children: ['P'] });
    const plan = planJumpMoveToNewFather(data, 'J1');
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.status).toBe(409);
  });

  test('a clean move returns the descendant, the ancestor family and the SHIFTED range', () => {
    const plan = planJumpMoveToNewFather(treeWithJump(), 'J1');
    expect(plan).toEqual({
      ok: true,
      descendantId: 'P',
      ancestorFamilyId: 'F-ISH',
      generationsMin: 4,
      generationsMax: 39,
    });
  });

  test('the J-rules run on the projection — an ancestor who is P’s own descendant is a cycle', () => {
    // The ancestor couple is headed by S, P's son. Today's tree already makes
    // this a cycle; the projected tree (F above P) must still refuse it.
    const data = treeWithJump({ ancestorFamily: 'F-S' });
    data.individuals.S = { ...data.individuals.S, familiesAsSpouse: ['F-S'] };
    data.families['F-S'] = fam('F-S', { husband: 'S', ancestryJumpsAsAncestor: ['J1'] });
    const plan = planJumpMoveToNewFather(data, 'J1');
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.status).toBe(400);
  });

  test('an ancestor family that lost every spouse is refused', () => {
    const data = treeWithJump();
    data.families['F-ISH'] = { ...data.families['F-ISH'], husband: null };
    const plan = planJumpMoveToNewFather(data, 'J1');
    expect(plan.ok).toBe(false);
  });

  test('does not mutate the input tree', () => {
    const data = treeWithJump();
    const before = JSON.stringify(data);
    planJumpMoveToNewFather(data, 'J1');
    expect(JSON.stringify(data)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// checkJumpMoveBack — the undo guard
// ---------------------------------------------------------------------------

/** The tree right after a move: F (new) → family F-NEW {husband F, children [P]}; jump on F. */
function afterMove(): GedcomData {
  const data = treeWithJump({ descendant: 'F', generationsMin: 4, generationsMax: 39 });
  data.individuals.P = { ...data.individuals.P, familyAsChild: 'F-NEW', ancestryJumpAsDescendant: undefined };
  data.individuals.F = ind('F', { familiesAsSpouse: ['F-NEW'], ancestryJumpAsDescendant: 'J1' });
  data.families['F-NEW'] = fam('F-NEW', { husband: 'F', children: ['P'] });
  return data;
}

const MOVE_BACK = { jumpId: 'J1', fatherId: 'F', familyId: 'F-NEW', childId: 'P' };

describe('checkJumpMoveBack', () => {
  test('the untouched post-move tree may be rolled back', () => {
    expect(checkJumpMoveBack(afterMove(), MOVE_BACK)).toBeNull();
  });

  test('the stale message is the plain Arabic one', () => {
    expect(JUMP_MOVE_BACK_STALE_MESSAGE).toBe('تغيّرت الشجرة منذ هذا الإجراء، فلا يمكن التراجع عنه');
  });

  test('refused when the jump no longer sits on F', () => {
    const data = afterMove();
    data.ancestryJumps!.J1 = { ...data.ancestryJumps!.J1, descendant: 'P' };
    expect(checkJumpMoveBack(data, MOVE_BACK)).toBe(JUMP_MOVE_BACK_STALE_MESSAGE);
  });

  test('refused when F gained a wife in that family', () => {
    const data = afterMove();
    data.individuals.W = ind('W', { sex: 'F', familiesAsSpouse: ['F-NEW'] });
    data.families['F-NEW'] = { ...data.families['F-NEW'], wife: 'W' };
    expect(checkJumpMoveBack(data, MOVE_BACK)).toBe(JUMP_MOVE_BACK_STALE_MESSAGE);
  });

  test('refused when the family gained a second child', () => {
    const data = afterMove();
    data.individuals.B = ind('B', { familyAsChild: 'F-NEW' });
    data.families['F-NEW'] = { ...data.families['F-NEW'], children: ['P', 'B'] };
    expect(checkJumpMoveBack(data, MOVE_BACK)).toBe(JUMP_MOVE_BACK_STALE_MESSAGE);
  });

  test('refused when F has another family', () => {
    const data = afterMove();
    data.individuals.F = { ...data.individuals.F, familiesAsSpouse: ['F-NEW', 'F-2'] };
    data.families['F-2'] = fam('F-2', { husband: 'F' });
    expect(checkJumpMoveBack(data, MOVE_BACK)).toBe(JUMP_MOVE_BACK_STALE_MESSAGE);
  });

  test('refused when F gained parents', () => {
    const data = afterMove();
    data.individuals.F = { ...data.individuals.F, familyAsChild: 'F-GP' };
    data.families['F-GP'] = fam('F-GP', { husband: 'ISH', children: ['F'] });
    expect(checkJumpMoveBack(data, MOVE_BACK)).toBe(JUMP_MOVE_BACK_STALE_MESSAGE);
  });

  test('refused when F has a rada link', () => {
    const data = afterMove();
    data.radaFamilies = {
      R1: { id: 'R1', type: '_RADA_FAM', fosterFather: 'F', fosterMother: null, children: ['S'], notes: '' },
    };
    expect(checkJumpMoveBack(data, MOVE_BACK)).toBe(JUMP_MOVE_BACK_STALE_MESSAGE);
  });

  test('refused when the family became another jump’s ancestor couple', () => {
    const data = afterMove();
    data.families['F-NEW'] = { ...data.families['F-NEW'], ancestryJumpsAsAncestor: ['J2'] };
    data.ancestryJumps!.J2 = jump({ id: 'J2', descendant: 'ISH', ancestorFamily: 'F-NEW' });
    expect(checkJumpMoveBack(data, MOVE_BACK)).toBe(JUMP_MOVE_BACK_STALE_MESSAGE);
  });
});

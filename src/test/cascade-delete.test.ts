import { describe, test, expect } from 'vitest';
import type { GedcomData, Individual, Family } from '@/lib/gedcom/types';
import { computeDeleteImpact } from '@/lib/tree/cascade-delete';

// ---------------------------------------------------------------------------
// Fixture builder helpers (same pattern as extract-subtree.test.ts)
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeDeleteImpact', () => {
  // =========================================================================
  // 1. Leaf person (no children) — no cascade
  // =========================================================================
  test('deleting a leaf person with no children returns no impact', () => {
    // Root -> Father -> Child (leaf)
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({
          id: '@ROOT@',
          familiesAsSpouse: ['@F1@'],
        }),
        '@FATHER@': makeIndividual({
          id: '@FATHER@',
          familyAsChild: '@F1@',
          familiesAsSpouse: ['@F2@'],
        }),
        '@CHILD@': makeIndividual({
          id: '@CHILD@',
          familyAsChild: '@F2@',
        }),
      },
      families: {
        '@F1@': makeFamily({
          id: '@F1@',
          husband: '@ROOT@',
          children: ['@FATHER@'],
        }),
        '@F2@': makeFamily({
          id: '@F2@',
          husband: '@FATHER@',
          children: ['@CHILD@'],
        }),
      },
    };

    const impact = computeDeleteImpact(data, '@CHILD@');
    expect(impact.hasImpact).toBe(false);
    expect(impact.affectedIds).toEqual(new Set());
  });

  // =========================================================================
  // 2. Single parent with children, no spouse — children become unreachable
  // =========================================================================
  test('deleting the only parent in a single-parent family cascades to children', () => {
    // Root -> Son (single parent) -> GrandchildA, GrandchildB, GrandchildC
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({
          id: '@ROOT@',
          familiesAsSpouse: ['@F1@'],
        }),
        '@SON@': makeIndividual({
          id: '@SON@',
          familyAsChild: '@F1@',
          familiesAsSpouse: ['@F2@'],
        }),
        '@GCA@': makeIndividual({ id: '@GCA@', familyAsChild: '@F2@' }),
        '@GCB@': makeIndividual({ id: '@GCB@', familyAsChild: '@F2@' }),
        '@GCC@': makeIndividual({ id: '@GCC@', familyAsChild: '@F2@' }),
      },
      families: {
        '@F1@': makeFamily({
          id: '@F1@',
          husband: '@ROOT@',
          children: ['@SON@'],
        }),
        '@F2@': makeFamily({
          id: '@F2@',
          husband: '@SON@',
          children: ['@GCA@', '@GCB@', '@GCC@'],
        }),
      },
    };

    const impact = computeDeleteImpact(data, '@SON@');
    expect(impact.hasImpact).toBe(true);
    expect(impact.affectedIds).toEqual(new Set(['@GCA@', '@GCB@', '@GCC@']));
  });

  // =========================================================================
  // 3. Two parents, delete one — children stay connected via remaining parent
  // =========================================================================
  test('children stay reachable when family has both parents and one is deleted', () => {
    // Root -> Son + Daughter (both root descendants)
    // Son + Daughter have GrandChild
    // Deleting Son: Daughter still connected to root, children stay reachable
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({
          id: '@ROOT@',
          familiesAsSpouse: ['@F_ROOT@'],
        }),
        '@SON@': makeIndividual({
          id: '@SON@',
          sex: 'M',
          familyAsChild: '@F_ROOT@',
          familiesAsSpouse: ['@F_COUPLE@'],
        }),
        '@DAUGHTER@': makeIndividual({
          id: '@DAUGHTER@',
          sex: 'F',
          familyAsChild: '@F_ROOT@',
          familiesAsSpouse: ['@F_COUPLE@'],
        }),
        '@GRANDCHILD@': makeIndividual({
          id: '@GRANDCHILD@',
          familyAsChild: '@F_COUPLE@',
        }),
      },
      families: {
        '@F_ROOT@': makeFamily({
          id: '@F_ROOT@',
          husband: '@ROOT@',
          children: ['@SON@', '@DAUGHTER@'],
        }),
        '@F_COUPLE@': makeFamily({
          id: '@F_COUPLE@',
          husband: '@SON@',
          wife: '@DAUGHTER@',
          children: ['@GRANDCHILD@'],
        }),
      },
    };

    const impact = computeDeleteImpact(data, '@SON@');
    expect(impact.hasImpact).toBe(false);
    expect(impact.affectedIds).toEqual(new Set());
  });

  // =========================================================================
  // 4. Married-in spouse link — spouse has familyAsChild, so no independent root
  // =========================================================================
  test('deleting person linking married-in spouse cascades to spouse and children', () => {
    // Root -> Son + MarriedInWife -> GrandChild
    // MarriedInWife has familyAsChild (she has parents in the data)
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({
          id: '@ROOT@',
          familiesAsSpouse: ['@F1@'],
        }),
        '@SON@': makeIndividual({
          id: '@SON@',
          familyAsChild: '@F1@',
          familiesAsSpouse: ['@F2@'],
        }),
        '@WIFE_IN@': makeIndividual({
          id: '@WIFE_IN@',
          sex: 'F',
          familyAsChild: '@F_INLAW@',
          familiesAsSpouse: ['@F2@'],
        }),
        '@FIL@': makeIndividual({
          id: '@FIL@',
          familiesAsSpouse: ['@F_INLAW@'],
        }),
        '@GRANDCHILD@': makeIndividual({
          id: '@GRANDCHILD@',
          familyAsChild: '@F2@',
        }),
      },
      families: {
        '@F1@': makeFamily({
          id: '@F1@',
          husband: '@ROOT@',
          children: ['@SON@'],
        }),
        '@F2@': makeFamily({
          id: '@F2@',
          husband: '@SON@',
          wife: '@WIFE_IN@',
          children: ['@GRANDCHILD@'],
        }),
        '@F_INLAW@': makeFamily({
          id: '@F_INLAW@',
          husband: '@FIL@',
          children: ['@WIFE_IN@'],
        }),
      },
    };

    const impact = computeDeleteImpact(data, '@SON@');
    // FIL has no familyAsChild -> becomes a root
    // FIL -> F_INLAW -> WIFE_IN -> F2 -> GRANDCHILD: all reachable
    expect(impact.hasImpact).toBe(false);
    expect(impact.affectedIds).toEqual(new Set());
  });

  // =========================================================================
  // 4b. True cascade: spouse has familyAsChild, parents also have familyAsChild
  // =========================================================================
  test('cascade when entire subtree has no independent roots', () => {
    // Root -> Son -> GrandChild
    // Son is single parent, no spouse
    // Deleting Son: GrandChild has familyAsChild pointing to Son's family,
    // but nobody else is in that family as parent -> GrandChild is orphaned
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({
          id: '@ROOT@',
          familiesAsSpouse: ['@F1@'],
        }),
        '@SON@': makeIndividual({
          id: '@SON@',
          familyAsChild: '@F1@',
          familiesAsSpouse: ['@F2@'],
        }),
        '@GRANDCHILD@': makeIndividual({
          id: '@GRANDCHILD@',
          familyAsChild: '@F2@',
        }),
      },
      families: {
        '@F1@': makeFamily({ id: '@F1@', husband: '@ROOT@', children: ['@SON@'] }),
        '@F2@': makeFamily({ id: '@F2@', husband: '@SON@', children: ['@GRANDCHILD@'] }),
      },
    };

    const impact = computeDeleteImpact(data, '@SON@');
    expect(impact.hasImpact).toBe(true);
    expect(impact.affectedIds).toEqual(new Set(['@GRANDCHILD@']));
  });

  // =========================================================================
  // 5. Deep cascade — entire subtree affected
  // =========================================================================
  test('deleting a person cascades to entire descendant subtree', () => {
    // Root -> A -> B -> C
    // Deleting A orphans B and C
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({
          id: '@ROOT@',
          familiesAsSpouse: ['@F1@'],
        }),
        '@A@': makeIndividual({
          id: '@A@',
          familyAsChild: '@F1@',
          familiesAsSpouse: ['@F2@'],
        }),
        '@B@': makeIndividual({
          id: '@B@',
          familyAsChild: '@F2@',
          familiesAsSpouse: ['@F3@'],
        }),
        '@C@': makeIndividual({
          id: '@C@',
          familyAsChild: '@F3@',
        }),
      },
      families: {
        '@F1@': makeFamily({ id: '@F1@', husband: '@ROOT@', children: ['@A@'] }),
        '@F2@': makeFamily({ id: '@F2@', husband: '@A@', children: ['@B@'] }),
        '@F3@': makeFamily({ id: '@F3@', husband: '@B@', children: ['@C@'] }),
      },
    };

    const impact = computeDeleteImpact(data, '@A@');
    expect(impact.hasImpact).toBe(true);
    expect(impact.affectedIds).toEqual(new Set(['@B@', '@C@']));
  });

  // =========================================================================
  // 6. Root ancestor deletion — cascades when no other roots exist
  // =========================================================================
  test('deleting root ancestor cascades to all descendants when no other roots', () => {
    // Root (sole root) -> Son -> GrandChild
    // Everyone except Root has familyAsChild set -> no one becomes a new root
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({
          id: '@ROOT@',
          familiesAsSpouse: ['@F1@'],
        }),
        '@SON@': makeIndividual({
          id: '@SON@',
          familyAsChild: '@F1@',
          familiesAsSpouse: ['@F2@'],
        }),
        '@GRANDCHILD@': makeIndividual({
          id: '@GRANDCHILD@',
          familyAsChild: '@F2@',
        }),
      },
      families: {
        '@F1@': makeFamily({ id: '@F1@', husband: '@ROOT@', children: ['@SON@'] }),
        '@F2@': makeFamily({ id: '@F2@', husband: '@SON@', children: ['@GRANDCHILD@'] }),
      },
    };

    const impact = computeDeleteImpact(data, '@ROOT@');
    expect(impact.hasImpact).toBe(true);
    expect(impact.affectedIds).toEqual(new Set(['@SON@', '@GRANDCHILD@']));
  });

  // =========================================================================
  // 6b. Root deletion with married-in spouse — spouse becomes new root
  // =========================================================================
  test('root deletion: married-in spouse (no familyAsChild) becomes new root, children safe', () => {
    // Root -> Son + Wife (no familyAsChild) -> GrandChild
    // After deleting Root: Wife has no familyAsChild -> becomes root
    // Wife -> F2 -> Son (as husband), GrandChild (as child): all reachable
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({
          id: '@ROOT@',
          familiesAsSpouse: ['@F1@'],
        }),
        '@SON@': makeIndividual({
          id: '@SON@',
          familyAsChild: '@F1@',
          familiesAsSpouse: ['@F2@'],
        }),
        '@WIFE@': makeIndividual({
          id: '@WIFE@',
          sex: 'F',
          familiesAsSpouse: ['@F2@'],
        }),
        '@GRANDCHILD@': makeIndividual({
          id: '@GRANDCHILD@',
          familyAsChild: '@F2@',
        }),
      },
      families: {
        '@F1@': makeFamily({ id: '@F1@', husband: '@ROOT@', children: ['@SON@'] }),
        '@F2@': makeFamily({
          id: '@F2@',
          husband: '@SON@',
          wife: '@WIFE@',
          children: ['@GRANDCHILD@'],
        }),
      },
    };

    const impact = computeDeleteImpact(data, '@ROOT@');
    // ROOT has no familyAsChild → no married-in exclusion applies.
    // WIFE stays seeded → reaches SON and GRANDCHILD → no cascade.
    expect(impact.hasImpact).toBe(false);
    expect(impact.affectedIds).toEqual(new Set());
  });

  // =========================================================================
  // 7. Remaining spouse is root descendant — no cascade
  // =========================================================================
  test('no cascade when remaining spouse is independently connected to tree', () => {
    // Root -> Daughter + HusbandIn (married-in, no children)
    // Deleting HusbandIn: Daughter still reachable via Root
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({
          id: '@ROOT@',
          familiesAsSpouse: ['@F_ROOT@'],
        }),
        '@DAUGHTER@': makeIndividual({
          id: '@DAUGHTER@',
          sex: 'F',
          familyAsChild: '@F_ROOT@',
          familiesAsSpouse: ['@F_COUPLE@'],
        }),
        '@HUSBAND_IN@': makeIndividual({
          id: '@HUSBAND_IN@',
          familiesAsSpouse: ['@F_COUPLE@'],
        }),
      },
      families: {
        '@F_ROOT@': makeFamily({
          id: '@F_ROOT@',
          husband: '@ROOT@',
          children: ['@DAUGHTER@'],
        }),
        '@F_COUPLE@': makeFamily({
          id: '@F_COUPLE@',
          husband: '@HUSBAND_IN@',
          wife: '@DAUGHTER@',
        }),
      },
    };

    const impact = computeDeleteImpact(data, '@HUSBAND_IN@');
    expect(impact.hasImpact).toBe(false);
    expect(impact.affectedIds).toEqual(new Set());
  });

  // =========================================================================
  // 8. Married-in spouse with graft subtree — in-law parents are independent roots
  // =========================================================================
  test('deleting hub: in-law parents (no familyAsChild) become roots, keep subtree reachable', () => {
    // Root -> Son + Wife (has familyAsChild -> InLawFamily)
    // FIL and MIL have no familyAsChild -> they are independent roots
    // Deleting Son: FIL is root -> reaches Wife via F_INLAW -> reaches GrandChild via F_COUPLE
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({
          id: '@ROOT@',
          familiesAsSpouse: ['@F_ROOT@'],
        }),
        '@SON@': makeIndividual({
          id: '@SON@',
          familyAsChild: '@F_ROOT@',
          familiesAsSpouse: ['@F_COUPLE@'],
        }),
        '@WIFE@': makeIndividual({
          id: '@WIFE@',
          sex: 'F',
          familyAsChild: '@F_INLAW@',
          familiesAsSpouse: ['@F_COUPLE@'],
        }),
        '@GRANDCHILD@': makeIndividual({
          id: '@GRANDCHILD@',
          familyAsChild: '@F_COUPLE@',
        }),
        '@FIL@': makeIndividual({
          id: '@FIL@',
          familiesAsSpouse: ['@F_INLAW@'],
        }),
        '@MIL@': makeIndividual({
          id: '@MIL@',
          sex: 'F',
          familiesAsSpouse: ['@F_INLAW@'],
        }),
        '@SIL@': makeIndividual({
          id: '@SIL@',
          sex: 'F',
          familyAsChild: '@F_INLAW@',
        }),
      },
      families: {
        '@F_ROOT@': makeFamily({
          id: '@F_ROOT@',
          husband: '@ROOT@',
          children: ['@SON@'],
        }),
        '@F_COUPLE@': makeFamily({
          id: '@F_COUPLE@',
          husband: '@SON@',
          wife: '@WIFE@',
          children: ['@GRANDCHILD@'],
        }),
        '@F_INLAW@': makeFamily({
          id: '@F_INLAW@',
          husband: '@FIL@',
          wife: '@MIL@',
          children: ['@WIFE@', '@SIL@'],
        }),
      },
    };

    // FIL+MIL are roots -> reach Wife, SIL, GrandChild
    const impact = computeDeleteImpact(data, '@SON@');
    expect(impact.hasImpact).toBe(false);
    expect(impact.affectedIds).toEqual(new Set());
  });

  // =========================================================================
  // 8b. True graft cascade: when married-in spouse's parents ALSO have familyAsChild
  // =========================================================================
  test('deleting hub cascades to graft family when no one in graft has independent root', () => {
    // Root -> Son + Wife (familyAsChild=@F_INLAW@)
    // Wife's parent FIL also has familyAsChild (not a root)
    // Deleting Son: Wife has familyAsChild -> not root. FIL has familyAsChild -> not root.
    // No one in the graft can serve as root -> all orphaned
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({
          id: '@ROOT@',
          familiesAsSpouse: ['@F_ROOT@'],
        }),
        '@SON@': makeIndividual({
          id: '@SON@',
          familyAsChild: '@F_ROOT@',
          familiesAsSpouse: ['@F_COUPLE@'],
        }),
        '@WIFE@': makeIndividual({
          id: '@WIFE@',
          sex: 'F',
          familyAsChild: '@F_INLAW@',
          familiesAsSpouse: ['@F_COUPLE@'],
        }),
        '@GRANDCHILD@': makeIndividual({
          id: '@GRANDCHILD@',
          familyAsChild: '@F_COUPLE@',
        }),
        '@FIL@': makeIndividual({
          id: '@FIL@',
          familyAsChild: '@F_GRANDPARENT@',
          familiesAsSpouse: ['@F_INLAW@'],
        }),
      },
      families: {
        '@F_ROOT@': makeFamily({
          id: '@F_ROOT@',
          husband: '@ROOT@',
          children: ['@SON@'],
        }),
        '@F_COUPLE@': makeFamily({
          id: '@F_COUPLE@',
          husband: '@SON@',
          wife: '@WIFE@',
          children: ['@GRANDCHILD@'],
        }),
        '@F_INLAW@': makeFamily({
          id: '@F_INLAW@',
          husband: '@FIL@',
          children: ['@WIFE@'],
        }),
        '@F_GRANDPARENT@': makeFamily({
          id: '@F_GRANDPARENT@',
          children: ['@FIL@'],
        }),
      },
    };

    const impact = computeDeleteImpact(data, '@SON@');
    expect(impact.hasImpact).toBe(true);
    expect(impact.affectedIds).toEqual(new Set(['@WIFE@', '@GRANDCHILD@', '@FIL@']));
  });

  // =========================================================================
  // 9. Diamond topology — child reachable via two paths, not orphaned
  // =========================================================================
  test('diamond: child reachable via alternate path is not orphaned', () => {
    // Root -> Son1 + Wife1 -> GrandChild
    // Root -> Son2 who also has GrandChild in his family
    // Deleting Son1: GrandChild reachable via Son2, Wife1 reachable via GrandChild's familyAsChild
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({
          id: '@ROOT@',
          familiesAsSpouse: ['@F_ROOT@'],
        }),
        '@SON1@': makeIndividual({
          id: '@SON1@',
          familyAsChild: '@F_ROOT@',
          familiesAsSpouse: ['@F_S1@'],
        }),
        '@SON2@': makeIndividual({
          id: '@SON2@',
          familyAsChild: '@F_ROOT@',
          familiesAsSpouse: ['@F_S2@'],
        }),
        '@WIFE1@': makeIndividual({
          id: '@WIFE1@',
          sex: 'F',
          familiesAsSpouse: ['@F_S1@'],
        }),
        '@GRANDCHILD@': makeIndividual({
          id: '@GRANDCHILD@',
          familyAsChild: '@F_S1@',
        }),
      },
      families: {
        '@F_ROOT@': makeFamily({
          id: '@F_ROOT@',
          husband: '@ROOT@',
          children: ['@SON1@', '@SON2@'],
        }),
        '@F_S1@': makeFamily({
          id: '@F_S1@',
          husband: '@SON1@',
          wife: '@WIFE1@',
          children: ['@GRANDCHILD@'],
        }),
        '@F_S2@': makeFamily({
          id: '@F_S2@',
          husband: '@SON2@',
          children: ['@GRANDCHILD@'],
        }),
      },
    };

    const impact = computeDeleteImpact(data, '@SON1@');
    // GrandChild reachable via Root->Son2->F_S2
    // Wife1 excluded from root seeding (married-in)
    // Upward traversal from GrandChild blocked: F_S1 has SON1 (target) as parent
    // Wife1 only connected through SON1 → affected
    expect(impact.hasImpact).toBe(true);
    expect(impact.affectedIds).toEqual(new Set(['@WIFE1@']));
  });

  // =========================================================================
  // 10. Siblings stay connected
  // =========================================================================
  test('deleting one child does not affect siblings', () => {
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({
          id: '@ROOT@',
          familiesAsSpouse: ['@F1@'],
        }),
        '@C1@': makeIndividual({ id: '@C1@', familyAsChild: '@F1@' }),
        '@C2@': makeIndividual({ id: '@C2@', familyAsChild: '@F1@' }),
        '@C3@': makeIndividual({ id: '@C3@', familyAsChild: '@F1@' }),
      },
      families: {
        '@F1@': makeFamily({
          id: '@F1@',
          husband: '@ROOT@',
          children: ['@C1@', '@C2@', '@C3@'],
        }),
      },
    };

    const impact = computeDeleteImpact(data, '@C2@');
    expect(impact.hasImpact).toBe(false);
    expect(impact.affectedIds).toEqual(new Set());
  });

  // =========================================================================
  // 11. Person not in data — no impact
  // =========================================================================
  test('deleting a person not in data returns no impact', () => {
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({ id: '@ROOT@' }),
      },
      families: {},
    };

    const impact = computeDeleteImpact(data, '@NONEXISTENT@');
    expect(impact.hasImpact).toBe(false);
    expect(impact.affectedIds).toEqual(new Set());
  });

  // =========================================================================
  // 12. Single-person tree — deleting the only person, no one else affected
  // =========================================================================
  test('single-person tree: deleting the only person returns no impact', () => {
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({ id: '@ROOT@' }),
      },
      families: {},
    };

    const impact = computeDeleteImpact(data, '@ROOT@');
    expect(impact.hasImpact).toBe(false);
    expect(impact.affectedIds).toEqual(new Set());
  });

  // =========================================================================
  // 13. Polygamy — wives with no familyAsChild become roots
  // =========================================================================
  test('polygamy: married-in wives cascade when husband deleted', () => {
    // Wives have no familyAsChild but their only spouse is SON (target) -> excluded from seeds
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({
          id: '@ROOT@',
          familiesAsSpouse: ['@F_ROOT@'],
        }),
        '@SON@': makeIndividual({
          id: '@SON@',
          familyAsChild: '@F_ROOT@',
          familiesAsSpouse: ['@F_W1@', '@F_W2@'],
        }),
        '@WIFE1@': makeIndividual({ id: '@WIFE1@', sex: 'F', familiesAsSpouse: ['@F_W1@'] }),
        '@WIFE2@': makeIndividual({ id: '@WIFE2@', sex: 'F', familiesAsSpouse: ['@F_W2@'] }),
        '@CHILD1@': makeIndividual({ id: '@CHILD1@', familyAsChild: '@F_W1@' }),
        '@CHILD2@': makeIndividual({ id: '@CHILD2@', familyAsChild: '@F_W2@' }),
      },
      families: {
        '@F_ROOT@': makeFamily({ id: '@F_ROOT@', husband: '@ROOT@', children: ['@SON@'] }),
        '@F_W1@': makeFamily({ id: '@F_W1@', husband: '@SON@', wife: '@WIFE1@', children: ['@CHILD1@'] }),
        '@F_W2@': makeFamily({ id: '@F_W2@', husband: '@SON@', wife: '@WIFE2@', children: ['@CHILD2@'] }),
      },
    };

    const impact = computeDeleteImpact(data, '@SON@');
    // Wives' only spouse is SON (target) -> excluded from seeds -> all affected
    expect(impact.hasImpact).toBe(true);
    expect(impact.affectedIds).toEqual(new Set(['@WIFE1@', '@WIFE2@', '@CHILD1@', '@CHILD2@']));
  });

  // =========================================================================
  // 13b. Polygamy cascade — when all wives have familyAsChild
  // =========================================================================
  test('polygamy: all wives have familyAsChild, deleting husband cascades everything', () => {
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({ id: '@ROOT@', familiesAsSpouse: ['@F_ROOT@'] }),
        '@SON@': makeIndividual({
          id: '@SON@',
          familyAsChild: '@F_ROOT@',
          familiesAsSpouse: ['@F_W1@', '@F_W2@'],
        }),
        '@WIFE1@': makeIndividual({
          id: '@WIFE1@', sex: 'F',
          familyAsChild: '@F_W1_PARENTS@',
          familiesAsSpouse: ['@F_W1@'],
        }),
        '@WIFE2@': makeIndividual({
          id: '@WIFE2@', sex: 'F',
          familyAsChild: '@F_W2_PARENTS@',
          familiesAsSpouse: ['@F_W2@'],
        }),
        '@CHILD1@': makeIndividual({ id: '@CHILD1@', familyAsChild: '@F_W1@' }),
        '@CHILD2@': makeIndividual({ id: '@CHILD2@', familyAsChild: '@F_W2@' }),
      },
      families: {
        '@F_ROOT@': makeFamily({ id: '@F_ROOT@', husband: '@ROOT@', children: ['@SON@'] }),
        '@F_W1@': makeFamily({ id: '@F_W1@', husband: '@SON@', wife: '@WIFE1@', children: ['@CHILD1@'] }),
        '@F_W2@': makeFamily({ id: '@F_W2@', husband: '@SON@', wife: '@WIFE2@', children: ['@CHILD2@'] }),
        '@F_W1_PARENTS@': makeFamily({ id: '@F_W1_PARENTS@', children: ['@WIFE1@'] }),
        '@F_W2_PARENTS@': makeFamily({ id: '@F_W2_PARENTS@', children: ['@WIFE2@'] }),
      },
    };

    const impact = computeDeleteImpact(data, '@SON@');
    expect(impact.hasImpact).toBe(true);
    expect(impact.affectedIds).toEqual(new Set(['@WIFE1@', '@WIFE2@', '@CHILD1@', '@CHILD2@']));
  });

  // =========================================================================
  // 14. Married-in spouse only (no familyAsChild) — becomes root, no cascade
  // =========================================================================
  test('deleting root descendant: married-in spouse cascades (only connected via target)', () => {
    // Wife has no familyAsChild, only spouse is SON (target) -> excluded from seeds
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({
          id: '@ROOT@',
          familiesAsSpouse: ['@F_ROOT@'],
        }),
        '@SON@': makeIndividual({
          id: '@SON@',
          familyAsChild: '@F_ROOT@',
          familiesAsSpouse: ['@F_COUPLE@'],
        }),
        '@WIFE_IN@': makeIndividual({
          id: '@WIFE_IN@',
          sex: 'F',
          familiesAsSpouse: ['@F_COUPLE@'],
        }),
      },
      families: {
        '@F_ROOT@': makeFamily({ id: '@F_ROOT@', husband: '@ROOT@', children: ['@SON@'] }),
        '@F_COUPLE@': makeFamily({ id: '@F_COUPLE@', husband: '@SON@', wife: '@WIFE_IN@' }),
      },
    };

    const impact = computeDeleteImpact(data, '@SON@');
    // Wife's only spouse is SON (target) -> excluded -> affected
    expect(impact.hasImpact).toBe(true);
    expect(impact.affectedIds).toEqual(new Set(['@WIFE_IN@']));
  });

  // =========================================================================
  // 15. Multiple disconnected roots — deleting under one doesn't affect other
  // =========================================================================
  test('multiple roots: deleting under Root1 does not affect Root2 tree', () => {
    // Root1 -> Child1 (single parent) -> Grandchild1
    // Root2 -> Child2
    // Deleting Child1: Grandchild1 affected, but Root2 and Child2 unaffected
    const data: GedcomData = {
      individuals: {
        '@ROOT1@': makeIndividual({ id: '@ROOT1@', familiesAsSpouse: ['@F1@'] }),
        '@CHILD1@': makeIndividual({
          id: '@CHILD1@',
          familyAsChild: '@F1@',
          familiesAsSpouse: ['@F2@'],
        }),
        '@GC1@': makeIndividual({ id: '@GC1@', familyAsChild: '@F2@' }),
        '@ROOT2@': makeIndividual({ id: '@ROOT2@', familiesAsSpouse: ['@F3@'] }),
        '@CHILD2@': makeIndividual({ id: '@CHILD2@', familyAsChild: '@F3@' }),
      },
      families: {
        '@F1@': makeFamily({ id: '@F1@', husband: '@ROOT1@', children: ['@CHILD1@'] }),
        '@F2@': makeFamily({ id: '@F2@', husband: '@CHILD1@', children: ['@GC1@'] }),
        '@F3@': makeFamily({ id: '@F3@', husband: '@ROOT2@', children: ['@CHILD2@'] }),
      },
    };

    const impact = computeDeleteImpact(data, '@CHILD1@');
    expect(impact.hasImpact).toBe(true);
    expect(impact.affectedIds).toEqual(new Set(['@GC1@']));
    // Root2 and Child2 are NOT affected
    expect(impact.affectedIds.has('@ROOT2@')).toBe(false);
    expect(impact.affectedIds.has('@CHILD2@')).toBe(false);
  });

  // =========================================================================
  // 16. Person is child AND spouse in different families
  // =========================================================================
  test('person connected as child in one family stays reachable even if other parent deleted', () => {
    // Root -> Son + Wife -> GrandChild
    // GrandChild also has familyAsChild in Son's family
    // AND GrandChild is a spouse in another family with their own children
    // Deleting Wife: Son is still there (root descendant), GrandChild stays connected
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({ id: '@ROOT@', familiesAsSpouse: ['@F_ROOT@'] }),
        '@SON@': makeIndividual({
          id: '@SON@',
          familyAsChild: '@F_ROOT@',
          familiesAsSpouse: ['@F_COUPLE@'],
        }),
        '@WIFE@': makeIndividual({
          id: '@WIFE@',
          sex: 'F',
          familiesAsSpouse: ['@F_COUPLE@'],
        }),
        '@GC@': makeIndividual({
          id: '@GC@',
          familyAsChild: '@F_COUPLE@',
          familiesAsSpouse: ['@F_GC@'],
        }),
        '@GC_SPOUSE@': makeIndividual({
          id: '@GC_SPOUSE@',
          sex: 'F',
          familiesAsSpouse: ['@F_GC@'],
        }),
        '@GGC@': makeIndividual({ id: '@GGC@', familyAsChild: '@F_GC@' }),
      },
      families: {
        '@F_ROOT@': makeFamily({ id: '@F_ROOT@', husband: '@ROOT@', children: ['@SON@'] }),
        '@F_COUPLE@': makeFamily({
          id: '@F_COUPLE@',
          husband: '@SON@',
          wife: '@WIFE@',
          children: ['@GC@'],
        }),
        '@F_GC@': makeFamily({
          id: '@F_GC@',
          husband: '@GC@',
          wife: '@GC_SPOUSE@',
          children: ['@GGC@'],
        }),
      },
    };

    // Delete Wife (married-in): Son still connected, GC still child of Son via F_COUPLE
    const impact = computeDeleteImpact(data, '@WIFE@');
    expect(impact.hasImpact).toBe(false);
    expect(impact.affectedIds).toEqual(new Set());
  });

  // =========================================================================
  // 17. Pointed individuals still appear in affected set
  // =========================================================================
  test('pointed individuals in unreachable set are included', () => {
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({ id: '@ROOT@', familiesAsSpouse: ['@F1@'] }),
        '@SON@': makeIndividual({
          id: '@SON@',
          familyAsChild: '@F1@',
          familiesAsSpouse: ['@F2@'],
        }),
        '@POINTED@': makeIndividual({
          id: '@POINTED@',
          familyAsChild: '@F2@',
          _pointed: true,
          _sourceWorkspaceId: 'other-ws',
        }),
      },
      families: {
        '@F1@': makeFamily({ id: '@F1@', husband: '@ROOT@', children: ['@SON@'] }),
        '@F2@': makeFamily({ id: '@F2@', husband: '@SON@', children: ['@POINTED@'] }),
      },
    };

    const impact = computeDeleteImpact(data, '@SON@');
    expect(impact.hasImpact).toBe(true);
    expect(impact.affectedIds).toEqual(new Set(['@POINTED@']));
  });

  // =========================================================================
  // 18. Deep cascade — all descendants have familyAsChild, nobody becomes root
  // =========================================================================
  test('deep cascade orphans entire subtree when nobody has independent root', () => {
    // Root -> Son -> Grandson -> GreatGrandson (all single-parent, no spouses)
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({ id: '@ROOT@', familiesAsSpouse: ['@F1@'] }),
        '@SON@': makeIndividual({
          id: '@SON@',
          familyAsChild: '@F1@',
          familiesAsSpouse: ['@F2@'],
        }),
        '@GRANDSON@': makeIndividual({
          id: '@GRANDSON@',
          familyAsChild: '@F2@',
          familiesAsSpouse: ['@F3@'],
        }),
        '@GGSON@': makeIndividual({ id: '@GGSON@', familyAsChild: '@F3@' }),
      },
      families: {
        '@F1@': makeFamily({ id: '@F1@', husband: '@ROOT@', children: ['@SON@'] }),
        '@F2@': makeFamily({ id: '@F2@', husband: '@SON@', children: ['@GRANDSON@'] }),
        '@F3@': makeFamily({ id: '@F3@', husband: '@GRANDSON@', children: ['@GGSON@'] }),
      },
    };

    const impact = computeDeleteImpact(data, '@SON@');
    expect(impact.hasImpact).toBe(true);
    expect(impact.affectedIds).toEqual(new Set(['@GRANDSON@', '@GGSON@']));
  });

  // =========================================================================
  // 19. Root's married-in spouse — no cascade (root stays)
  // =========================================================================
  test('deleting root married-in spouse: root stays (both are co-founders)', () => {
    // ROOT + ROOT_WIFE (no children). Delete ROOT_WIFE.
    // ROOT_WIFE has no familyAsChild (target is root-level) → no exclusion.
    // ROOT stays seeded. No impact.
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({ id: '@ROOT@', familiesAsSpouse: ['@F1@'] }),
        '@ROOT_WIFE@': makeIndividual({
          id: '@ROOT_WIFE@',
          sex: 'F',
          familiesAsSpouse: ['@F1@'],
        }),
      },
      families: {
        '@F1@': makeFamily({ id: '@F1@', husband: '@ROOT@', wife: '@ROOT_WIFE@' }),
      },
    };

    const impact = computeDeleteImpact(data, '@ROOT_WIFE@');
    expect(impact.hasImpact).toBe(false);
    expect(impact.affectedIds).toEqual(new Set());
  });

  // =========================================================================
  // 20. Root deletion — no married-in spouses, everything cascades
  // =========================================================================
  test('root deletion with large tree cascades to everyone when no independent roots remain', () => {
    // Root -> Son1 -> GC1
    // Root -> Son2 -> GC2
    // No married-in spouses (no one with familyAsChild=null except Root)
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({ id: '@ROOT@', familiesAsSpouse: ['@F_ROOT@'] }),
        '@SON1@': makeIndividual({
          id: '@SON1@',
          familyAsChild: '@F_ROOT@',
          familiesAsSpouse: ['@F_S1@'],
        }),
        '@SON2@': makeIndividual({
          id: '@SON2@',
          familyAsChild: '@F_ROOT@',
          familiesAsSpouse: ['@F_S2@'],
        }),
        '@GC1@': makeIndividual({ id: '@GC1@', familyAsChild: '@F_S1@' }),
        '@GC2@': makeIndividual({ id: '@GC2@', familyAsChild: '@F_S2@' }),
      },
      families: {
        '@F_ROOT@': makeFamily({ id: '@F_ROOT@', husband: '@ROOT@', children: ['@SON1@', '@SON2@'] }),
        '@F_S1@': makeFamily({ id: '@F_S1@', husband: '@SON1@', children: ['@GC1@'] }),
        '@F_S2@': makeFamily({ id: '@F_S2@', husband: '@SON2@', children: ['@GC2@'] }),
      },
    };

    const impact = computeDeleteImpact(data, '@ROOT@');
    expect(impact.hasImpact).toBe(true);
    expect(impact.affectedIds).toEqual(new Set(['@SON1@', '@SON2@', '@GC1@', '@GC2@']));
  });

  // =========================================================================
  // 21. Root with spouse who has children — root deletion, spouse becomes root
  // =========================================================================
  test('root with spouse: deleting root, spouse has no familyAsChild so becomes new root', () => {
    // Root + RootWife -> Child
    // RootWife has no familyAsChild (she's a married-in root-level spouse)
    // After deleting Root, RootWife has no familyAsChild -> she becomes a new root
    // -> Child is reachable via RootWife
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({ id: '@ROOT@', familiesAsSpouse: ['@F1@'] }),
        '@ROOT_WIFE@': makeIndividual({
          id: '@ROOT_WIFE@',
          sex: 'F',
          familiesAsSpouse: ['@F1@'],
        }),
        '@CHILD@': makeIndividual({ id: '@CHILD@', familyAsChild: '@F1@' }),
      },
      families: {
        '@F1@': makeFamily({
          id: '@F1@',
          husband: '@ROOT@',
          wife: '@ROOT_WIFE@',
          children: ['@CHILD@'],
        }),
      },
    };

    // ROOT has no familyAsChild → target is root-level → no exclusion.
    // RootWife stays seeded → reaches Child → no impact.
    const impact = computeDeleteImpact(data, '@ROOT@');
    expect(impact.hasImpact).toBe(false);
    expect(impact.affectedIds).toEqual(new Set());
  });

  // =========================================================================
  // 22. BUG FIX: married-in spouse with no familyAsChild — delete linking husband
  //     This is the محمد زياد سعيد scenario that triggered the two-phase fix
  // =========================================================================
  test('deleting husband cascades to married-in wife (no familyAsChild) and children', () => {
    // Root -> Son (محمد) + Wife (آمال, married-in, no familyAsChild) -> 4 children
    // Deleting Son: Wife is married-in, no lineage connection. Children only connect
    // to the tree through Son. With two-phase algo:
    // Phase 1: Root seeded -> down via F_ROOT -> Son is target (skip)
    //   No other children of Root. Lineage core = {Root}
    // Phase 2: Root has no spouses. No expansion.
    // Wife + children are unreachable.
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({ id: '@ROOT@', familiesAsSpouse: ['@F_ROOT@'] }),
        '@SON@': makeIndividual({
          id: '@SON@',
          familyAsChild: '@F_ROOT@',
          familiesAsSpouse: ['@F_COUPLE@'],
        }),
        '@WIFE@': makeIndividual({
          id: '@WIFE@',
          sex: 'F',
          familiesAsSpouse: ['@F_COUPLE@'],
          // NO familyAsChild — married-in
        }),
        '@C1@': makeIndividual({ id: '@C1@', familyAsChild: '@F_COUPLE@' }),
        '@C2@': makeIndividual({ id: '@C2@', familyAsChild: '@F_COUPLE@' }),
        '@C3@': makeIndividual({ id: '@C3@', familyAsChild: '@F_COUPLE@' }),
        '@C4@': makeIndividual({ id: '@C4@', familyAsChild: '@F_COUPLE@' }),
      },
      families: {
        '@F_ROOT@': makeFamily({ id: '@F_ROOT@', husband: '@ROOT@', children: ['@SON@'] }),
        '@F_COUPLE@': makeFamily({
          id: '@F_COUPLE@',
          husband: '@SON@',
          wife: '@WIFE@',
          children: ['@C1@', '@C2@', '@C3@', '@C4@'],
        }),
      },
    };

    const impact = computeDeleteImpact(data, '@SON@');
    expect(impact.hasImpact).toBe(true);
    expect(impact.affectedIds).toEqual(new Set(['@WIFE@', '@C1@', '@C2@', '@C3@', '@C4@']));
  });

  // =========================================================================
  // 23. Delete a married-in spouse (the wife) — no impact, lineage stays
  // =========================================================================
  test('deleting married-in spouse has no impact on lineage', () => {
    // Root -> Son + Wife (married-in) -> Children
    // Deleting Wife: Son is still reachable from Root, children are reachable from Son
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({ id: '@ROOT@', familiesAsSpouse: ['@F_ROOT@'] }),
        '@SON@': makeIndividual({
          id: '@SON@',
          familyAsChild: '@F_ROOT@',
          familiesAsSpouse: ['@F_COUPLE@'],
        }),
        '@WIFE@': makeIndividual({
          id: '@WIFE@',
          sex: 'F',
          familiesAsSpouse: ['@F_COUPLE@'],
        }),
        '@CHILD@': makeIndividual({ id: '@CHILD@', familyAsChild: '@F_COUPLE@' }),
      },
      families: {
        '@F_ROOT@': makeFamily({ id: '@F_ROOT@', husband: '@ROOT@', children: ['@SON@'] }),
        '@F_COUPLE@': makeFamily({
          id: '@F_COUPLE@',
          husband: '@SON@',
          wife: '@WIFE@',
          children: ['@CHILD@'],
        }),
      },
    };

    const impact = computeDeleteImpact(data, '@WIFE@');
    expect(impact.hasImpact).toBe(false);
    expect(impact.affectedIds).toEqual(new Set());
  });

  // =========================================================================
  // 24. Polygamy: delete husband, all wives married-in → all cascade
  // =========================================================================
  test('polygamy: delete husband, married-in wives and children all cascade', () => {
    // Root -> Son + Wife1 (married-in) -> Child1
    //              + Wife2 (married-in) -> Child2
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({ id: '@ROOT@', familiesAsSpouse: ['@F_ROOT@'] }),
        '@SON@': makeIndividual({
          id: '@SON@',
          familyAsChild: '@F_ROOT@',
          familiesAsSpouse: ['@F_W1@', '@F_W2@'],
        }),
        '@WIFE1@': makeIndividual({ id: '@WIFE1@', sex: 'F', familiesAsSpouse: ['@F_W1@'] }),
        '@WIFE2@': makeIndividual({ id: '@WIFE2@', sex: 'F', familiesAsSpouse: ['@F_W2@'] }),
        '@CHILD1@': makeIndividual({ id: '@CHILD1@', familyAsChild: '@F_W1@' }),
        '@CHILD2@': makeIndividual({ id: '@CHILD2@', familyAsChild: '@F_W2@' }),
      },
      families: {
        '@F_ROOT@': makeFamily({ id: '@F_ROOT@', husband: '@ROOT@', children: ['@SON@'] }),
        '@F_W1@': makeFamily({ id: '@F_W1@', husband: '@SON@', wife: '@WIFE1@', children: ['@CHILD1@'] }),
        '@F_W2@': makeFamily({ id: '@F_W2@', husband: '@SON@', wife: '@WIFE2@', children: ['@CHILD2@'] }),
      },
    };

    const impact = computeDeleteImpact(data, '@SON@');
    expect(impact.hasImpact).toBe(true);
    expect(impact.affectedIds).toEqual(new Set(['@WIFE1@', '@WIFE2@', '@CHILD1@', '@CHILD2@']));
  });

  // =========================================================================
  // 25. In-law graft: FIL/MIL are independent roots, keep wife reachable
  // =========================================================================
  test('in-law graft: FIL as independent root keeps wife reachable when husband deleted', () => {
    // Root -> Son + Wife (familyAsChild -> F_INLAW)
    // FIL has no familyAsChild -> independent root
    // Deleting Son: Phase 1 seeds Root and FIL.
    //   Root -> (Son is target, skip). FIL -> WIFE_IN -> GrandChild
    //   All reachable from FIL.
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({ id: '@ROOT@', familiesAsSpouse: ['@F_ROOT@'] }),
        '@SON@': makeIndividual({
          id: '@SON@',
          familyAsChild: '@F_ROOT@',
          familiesAsSpouse: ['@F_COUPLE@'],
        }),
        '@WIFE_IN@': makeIndividual({
          id: '@WIFE_IN@',
          sex: 'F',
          familyAsChild: '@F_INLAW@',
          familiesAsSpouse: ['@F_COUPLE@'],
        }),
        '@GC@': makeIndividual({ id: '@GC@', familyAsChild: '@F_COUPLE@' }),
        '@FIL@': makeIndividual({ id: '@FIL@', familiesAsSpouse: ['@F_INLAW@'] }),
        '@MIL@': makeIndividual({ id: '@MIL@', sex: 'F', familiesAsSpouse: ['@F_INLAW@'] }),
      },
      families: {
        '@F_ROOT@': makeFamily({ id: '@F_ROOT@', husband: '@ROOT@', children: ['@SON@'] }),
        '@F_COUPLE@': makeFamily({
          id: '@F_COUPLE@',
          husband: '@SON@',
          wife: '@WIFE_IN@',
          children: ['@GC@'],
        }),
        '@F_INLAW@': makeFamily({
          id: '@F_INLAW@',
          husband: '@FIL@',
          wife: '@MIL@',
          children: ['@WIFE_IN@'],
        }),
      },
    };

    const impact = computeDeleteImpact(data, '@SON@');
    // FIL+MIL are roots -> Phase 1 reaches WIFE_IN, GC through downward BFS
    expect(impact.hasImpact).toBe(false);
    expect(impact.affectedIds).toEqual(new Set());
  });

  // =========================================================================
  // 26. Root deletion with married-in wife — wife becomes root via Phase 1
  // =========================================================================
  test('root deletion: wife is co-founder, keeps children safe', () => {
    // Root + Wife (no familyAsChild, co-founder) -> Child1, Child2
    // Delete Root. ROOT has no familyAsChild → target is root-level → no exclusion.
    // Wife stays seeded → reaches children → no cascade.
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({ id: '@ROOT@', familiesAsSpouse: ['@F1@'] }),
        '@WIFE@': makeIndividual({
          id: '@WIFE@',
          sex: 'F',
          familiesAsSpouse: ['@F1@'],
        }),
        '@C1@': makeIndividual({ id: '@C1@', familyAsChild: '@F1@' }),
        '@C2@': makeIndividual({ id: '@C2@', familyAsChild: '@F1@' }),
      },
      families: {
        '@F1@': makeFamily({
          id: '@F1@',
          husband: '@ROOT@',
          wife: '@WIFE@',
          children: ['@C1@', '@C2@'],
        }),
      },
    };

    const impact = computeDeleteImpact(data, '@ROOT@');
    expect(impact.hasImpact).toBe(false);
    expect(impact.affectedIds).toEqual(new Set());
  });

  // =========================================================================
  // 27. Upward traversal rescue bug — cross-marriage should not rescue
  //     target's married-in spouse via familyAsChild traversal
  // =========================================================================
  test('upward traversal does not rescue married-in spouse through target family', () => {
    // Root -> A (target) + B (married-in) -> C, D
    // C married to E (from Root2's branch — independent lineage)
    // C + E -> F
    //
    // Delete A: B is married-in (excluded). C and D are children of A.
    // E is reachable from Root2. C is reachable via E (spouse link).
    // F is reachable via C or E.
    // BUT: C's familyAsChild points to F_A (A's family). Upward traversal
    // from C would reach B (A's spouse). B should NOT be rescued this way
    // because A (target) is a parent in that family.
    //
    // Expected: B and D affected. C, E, F safe.
    const data: GedcomData = {
      individuals: {
        '@ROOT@': makeIndividual({ id: '@ROOT@', familiesAsSpouse: ['@F_ROOT@'] }),
        '@ROOT2@': makeIndividual({ id: '@ROOT2@', familiesAsSpouse: ['@F_ROOT2@'] }),
        '@A@': makeIndividual({
          id: '@A@',
          familyAsChild: '@F_ROOT@',
          familiesAsSpouse: ['@F_A@'],
        }),
        '@B@': makeIndividual({
          id: '@B@',
          sex: 'F',
          familiesAsSpouse: ['@F_A@'],
          // married-in: only spouse A has familyAsChild
        }),
        '@C@': makeIndividual({
          id: '@C@',
          familyAsChild: '@F_A@',
          familiesAsSpouse: ['@F_CE@'],
        }),
        '@D@': makeIndividual({ id: '@D@', familyAsChild: '@F_A@' }),
        '@E@': makeIndividual({
          id: '@E@',
          sex: 'F',
          familyAsChild: '@F_ROOT2@',
          familiesAsSpouse: ['@F_CE@'],
        }),
        '@F@': makeIndividual({ id: '@F@', familyAsChild: '@F_CE@' }),
      },
      families: {
        '@F_ROOT@': makeFamily({ id: '@F_ROOT@', husband: '@ROOT@', children: ['@A@'] }),
        '@F_ROOT2@': makeFamily({ id: '@F_ROOT2@', husband: '@ROOT2@', children: ['@E@'] }),
        '@F_A@': makeFamily({
          id: '@F_A@',
          husband: '@A@',
          wife: '@B@',
          children: ['@C@', '@D@'],
        }),
        '@F_CE@': makeFamily({
          id: '@F_CE@',
          husband: '@C@',
          wife: '@E@',
          children: ['@F@'],
        }),
      },
    };

    const impact = computeDeleteImpact(data, '@A@');
    // B: married-in to A → excluded from seeds, not rescued
    // D: child of A, no other connections → affected
    // C: child of A, BUT married to E who is reachable from ROOT2 → C rescued via spouse
    // E: reachable from ROOT2 → safe
    // F: child of C+E → safe
    // Upward traversal from C should NOT climb into F_A (A is parent there)
    expect(impact.hasImpact).toBe(true);
    expect(impact.affectedIds).toEqual(new Set(['@B@', '@D@']));
  });

});

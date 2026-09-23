/**
 * «قفزة نسب» (ancestry jump) — business rules.
 *
 * A PURE function over an already-mapped `GedcomData`. No DB access: the route
 * already holds the mapped tree, so validation is one in-memory pass.
 */
import type { GedcomData } from '@/lib/gedcom/types';
import { getAllDescendants, buildJumpIndex } from '@/lib/gedcom/graph';
import { EMPTY_EVENT } from '@/lib/tree/branch-pointer-merge';

export type AncestryJumpError =
  | 'descendant_not_found'
  | 'ancestor_family_not_found'
  | 'descendant_has_parents'
  | 'descendant_already_has_jump'
  | 'ancestor_family_empty'
  | 'self_reference'
  | 'cycle'
  | 'invalid_range'
  | 'child_has_jump';

/**
 * The 409 every "give this person parents" path returns when the person
 * carries a jump — the jump claims his line continues up to a distant
 * ancestor, and recorded parents beside it would break rule J3. The only
 * sanctioned way to add a father is «إضافة أب», which MOVES the jump up.
 */
export const JUMP_BLOCKS_PARENTS_MESSAGE =
  'لهذا الشخص قفزة نسب، فلا يمكن إضافة أب أو أم له. لنقل القفزة إلى أب جديد استخدم «إضافة أب»، أو احذف قفزة النسب يدويًا أولًا ثم أضف الأب.';

export const ANCESTRY_JUMP_ERROR_MESSAGES: Record<AncestryJumpError, string> = {
  descendant_not_found:        'الشخص غير موجود في هذه الشجرة',
  ancestor_family_not_found:   'الجدّ المختار غير موجود في هذه الشجرة',
  descendant_has_parents:      'لا يمكن إضافة قفزة نسب لشخص له أب أو أم في الشجرة',
  descendant_already_has_jump: 'لهذا الشخص قفزة نسب بالفعل',
  ancestor_family_empty:       'لا بدّ من تحديد الجدّ أو الجدّة',
  self_reference:              'لا يمكن ربط الشخص بنفسه',
  cycle:                       'لا يمكن الربط بجدّ هو من ذرّية هذا الشخص',
  invalid_range:               'أقل عدد للأجيال يجب ألا يتجاوز أكثر عدد',
  child_has_jump:              JUMP_BLOCKS_PARENTS_MESSAGE,
};

/** HTTP status per error code. */
export const ANCESTRY_JUMP_ERROR_STATUS: Record<AncestryJumpError, number> = {
  descendant_not_found:        404,
  ancestor_family_not_found:   404,
  descendant_has_parents:      400,
  descendant_already_has_jump: 409,
  ancestor_family_empty:       400,
  self_reference:              400,
  cycle:                       400,
  invalid_range:               400,
  child_has_jump:              409,
};

export interface AncestryJumpCandidate {
  descendantId: string;
  ancestorFamilyId: string;
  generationsMin?: number | null;
  generationsMax?: number | null;
}

/**
 * Rules, in evaluation order. Returns the FIRST violated code, or null.
 *
 *  J1  descendant exists in this tree
 *  J2  ancestor family exists in this tree
 *  J3  descendant has NO familyAsChild (a jump belongs at the TOP of a known line)
 *  J4  descendant has no existing jump (one per person) — `ignoreJumpId` skips self
 *  J5  ancestor family has at least one spouse PRESENT in this tree
 *  J6  range is ordered (called with MERGED values on the PATCH path)
 *  J7  descendant is not himself a spouse of the ancestor family (self reference)
 *  J8  NO CYCLE: no spouse of the ancestor family is reachable DOWNWARD from the
 *      descendant through family-child edges AND existing jump edges.
 *
 * J8 deliberately uses `getAllDescendants(..., { includeJumps: true })`, whose
 * visited-set makes it cycle-safe. It must NOT be rebuilt on
 * `calculateDescendantCounts` (Kahn's algorithm), which would silently DROP a
 * cyclic component instead of reporting it.
 */
/**
 * J3 + J4 alone — the rules that concern the DESCENDANT and nothing else, so
 * they can be judged before an ancestor family exists. The client runs these
 * before it writes anything (a refusal after the ancestor and his couple are
 * created costs a rollback); `validateAncestryJump` runs them as part of the
 * full set. One implementation, so the two can never disagree.
 *
 * Assumes the descendant exists in `data` (J1 is the caller's job).
 */
export function validateJumpDescendant(
  data: GedcomData,
  descendantId: string,
  opts: { ignoreJumpId?: string } = {},
): Extract<AncestryJumpError, 'descendant_has_parents' | 'descendant_already_has_jump'> | null {
  // J3 — a jump sits at the TOP of a known line, never beside recorded parents.
  if (data.individuals[descendantId]?.familyAsChild) return 'descendant_has_parents';

  // J4 — one jump per person, judged on the ROW, never the bare back-reference.
  // `ignoreJumpId` lets a PATCH re-validate its own row.
  const existing = buildJumpIndex(data).byDescendant.get(descendantId);
  if (existing && existing.id !== opts.ignoreJumpId) {
    return 'descendant_already_has_jump';
  }
  return null;
}

export function validateAncestryJump(
  data: GedcomData,
  candidate: AncestryJumpCandidate,
  opts: { ignoreJumpId?: string } = {},
): AncestryJumpError | null {
  const { descendantId, ancestorFamilyId, generationsMin, generationsMax } = candidate;

  // J1 — descendant exists here.
  const descendant = data.individuals[descendantId];
  if (!descendant) return 'descendant_not_found';

  // J2 — ancestor family exists here.
  const family = data.families[ancestorFamilyId];
  if (!family) return 'ancestor_family_not_found';

  // J3 + J4 — the descendant-side rules, shared with the client pre-flight.
  const descendantError = validateJumpDescendant(data, descendantId, opts);
  if (descendantError) return descendantError;

  // J5 — the couple must actually name someone who is in this tree. A family
  // row whose only spouse has been deleted points at nothing.
  const spouseIds = [family.husband, family.wife].filter(
    (id): id is string => Boolean(id) && Boolean(data.individuals[id as string]),
  );
  if (spouseIds.length === 0) return 'ancestor_family_empty';

  // J6 — ordering. The caller passes MERGED values on the PATCH path, because
  // Zod's `.refine` only ever sees the patch body.
  if (
    generationsMin != null &&
    generationsMax != null &&
    generationsMin > generationsMax
  ) {
    return 'invalid_range';
  }

  // J7 + J8 — self reference, then cycle. The downward reach is computed ONCE
  // and must cross existing jump edges, or a multi-hop loop would slip through.
  const reach = getAllDescendants(data, descendantId, { includeJumps: true });
  for (const spouseId of spouseIds) {
    if (spouseId === descendantId) return 'self_reference';
    if (reach.has(spouseId)) return 'cycle';
  }

  return null;
}

// ---------------------------------------------------------------------------
// Moving a jump up to a brand-new father
//
// P has a jump to a distant couple; the editor now records P's real father F.
// The jump travels UP: F becomes the descendant. `generationsMin/Max` count the
// generations SKIPPED between the descendant and the ancestor
// (docs/specs/ancestry-jump-spec.md), and F is one of them — so each stated
// bound drops by one, and a bound that would fall below 1 becomes unstated.
// ---------------------------------------------------------------------------

export function shiftJumpRange(
  generationsMin: number | null,
  generationsMax: number | null,
): { generationsMin: number | null; generationsMax: number | null } {
  const shift = (v: number | null) => (v == null || v - 1 < 1 ? null : v - 1);
  return { generationsMin: shift(generationsMin), generationsMax: shift(generationsMax) };
}

export const JUMP_NOT_FOUND_MESSAGE = 'قفزة النسب غير موجودة في هذه الشجرة';

export type JumpMovePlan =
  | {
      ok: true;
      /** P — today's descendant, the new father's only child. */
      descendantId: string;
      ancestorFamilyId: string;
      /** The range AFTER the one-generation shift. */
      generationsMin: number | null;
      generationsMax: number | null;
    }
  | { ok: false; status: number; error: string };

/** Placeholder ids for the projected father and his couple — never persisted. */
const PROJECTED_FATHER_ID = '__jump-move-father__';
const PROJECTED_FAMILY_ID = '__jump-move-family__';

/**
 * Plan "move the jump to a new father" over the resolved tree. PURE.
 *
 * The J-rules are run on the PROJECTED tree — F in place, P his only child,
 * the jump re-pointed to F — never on today's tree, where F does not exist.
 */
export function planJumpMoveToNewFather(data: GedcomData, jumpId: string): JumpMovePlan {
  const jump = data.ancestryJumps?.[jumpId];
  const descendant = jump ? data.individuals[jump.descendant] : undefined;
  if (!jump || !descendant) {
    return { ok: false, status: 404, error: JUMP_NOT_FOUND_MESSAGE };
  }
  if (descendant.familyAsChild) {
    return { ok: false, status: 409, error: ANCESTRY_JUMP_ERROR_MESSAGES.descendant_has_parents };
  }

  const range = shiftJumpRange(jump.generationsMin, jump.generationsMax);
  const P = descendant.id;
  const F = PROJECTED_FATHER_ID;
  const FAM = PROJECTED_FAMILY_ID;

  const projected: GedcomData = {
    ...data,
    individuals: {
      ...data.individuals,
      [P]: { ...descendant, familyAsChild: FAM, ancestryJumpAsDescendant: undefined },
      [F]: {
        ...descendant,
        id: F,
        name: '',
        givenName: '',
        sex: 'M',
        familiesAsSpouse: [FAM],
        familyAsChild: null,
        ancestryJumpAsDescendant: jumpId,
        radaFamiliesAsChild: undefined,
      },
    },
    families: {
      ...data.families,
      [FAM]: {
        id: FAM,
        type: 'FAM',
        husband: F,
        wife: null,
        children: [P],
        marriageContract: EMPTY_EVENT,
        marriage: EMPTY_EVENT,
        divorce: EMPTY_EVENT,
        isDivorced: false,
      },
    },
    ancestryJumps: {
      ...data.ancestryJumps,
      [jumpId]: { ...jump, descendant: F, ...range },
    },
  };

  const violation = validateAncestryJump(
    projected,
    { descendantId: F, ancestorFamilyId: jump.ancestorFamily, ...range },
    { ignoreJumpId: jumpId },
  );
  if (violation) {
    return {
      ok: false,
      status: ANCESTRY_JUMP_ERROR_STATUS[violation],
      error: ANCESTRY_JUMP_ERROR_MESSAGES[violation],
    };
  }

  return {
    ok: true,
    descendantId: P,
    ancestorFamilyId: jump.ancestorFamily,
    ...range,
  };
}

/** 409 when the tree changed under a move-to-new-father between plan and write. */
export const JUMP_MOVE_STALE_MESSAGE = 'تغيّرت الشجرة أثناء الحفظ، فأعد المحاولة';

export const JUMP_MOVE_BACK_STALE_MESSAGE = 'تغيّرت الشجرة منذ هذا الإجراء، فلا يمكن التراجع عنه';

export interface JumpMoveBackTarget {
  jumpId: string;
  fatherId: string;
  familyId: string;
  childId: string;
}

/**
 * Undo guard for a move. PURE. The move-back deletes F and his couple, so it
 * is allowed ONLY while the tree still looks exactly like what the move made:
 * the jump sits on F; the couple is {husband F, no wife, children exactly [P]}
 * and is nobody's jump ancestor; F has no other family, no parents, no rada
 * link. Anything else means the editor built on F since — deleting him would
 * destroy that work. Returns the Arabic 409 message, or null when clear.
 */
export function checkJumpMoveBack(data: GedcomData, t: JumpMoveBackTarget): string | null {
  const jump = data.ancestryJumps?.[t.jumpId];
  const father = data.individuals[t.fatherId];
  const family = data.families[t.familyId];
  const child = data.individuals[t.childId];
  if (!jump || !father || !family || !child) return JUMP_MOVE_BACK_STALE_MESSAGE;

  if (jump.descendant !== t.fatherId) return JUMP_MOVE_BACK_STALE_MESSAGE;

  if (family.husband !== t.fatherId || family.wife) return JUMP_MOVE_BACK_STALE_MESSAGE;
  if (family.children.length !== 1 || family.children[0] !== t.childId) {
    return JUMP_MOVE_BACK_STALE_MESSAGE;
  }
  const familyIsAncestor = Object.values(data.ancestryJumps ?? {}).some(
    (j) => j.ancestorFamily === t.familyId,
  );
  if (familyIsAncestor) return JUMP_MOVE_BACK_STALE_MESSAGE;

  if (father.familyAsChild) return JUMP_MOVE_BACK_STALE_MESSAGE;
  if (father.familiesAsSpouse.some((id) => id !== t.familyId)) return JUMP_MOVE_BACK_STALE_MESSAGE;

  const hasRada = Object.values(data.radaFamilies ?? {}).some(
    (r) =>
      r.fosterFather === t.fatherId ||
      r.fosterMother === t.fatherId ||
      r.children.includes(t.fatherId),
  );
  if (hasRada) return JUMP_MOVE_BACK_STALE_MESSAGE;

  return null;
}

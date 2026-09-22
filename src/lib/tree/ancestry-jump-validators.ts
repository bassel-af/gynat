/**
 * «قفزة نسب» (ancestry jump) — business rules.
 *
 * A PURE function over an already-mapped `GedcomData`. No DB access: the route
 * already holds the mapped tree, so validation is one in-memory pass.
 */
import type { GedcomData } from '@/lib/gedcom/types';
import { getAllDescendants, buildJumpIndex } from '@/lib/gedcom/graph';

export type AncestryJumpError =
  | 'descendant_not_found'
  | 'ancestor_family_not_found'
  | 'descendant_has_parents'
  | 'descendant_already_has_jump'
  | 'ancestor_family_empty'
  | 'self_reference'
  | 'cycle'
  | 'invalid_range';

export const ANCESTRY_JUMP_ERROR_MESSAGES: Record<AncestryJumpError, string> = {
  descendant_not_found:        'الشخص غير موجود في هذه الشجرة',
  ancestor_family_not_found:   'الجدّ المختار غير موجود في هذه الشجرة',
  descendant_has_parents:      'لا يمكن إضافة قفزة نسب لشخص له أب أو أم في الشجرة',
  descendant_already_has_jump: 'لهذا الشخص قفزة نسب بالفعل',
  ancestor_family_empty:       'لا بدّ من تحديد الجدّ أو الجدّة',
  self_reference:              'لا يمكن ربط الشخص بنفسه',
  cycle:                       'لا يمكن الربط بجدّ هو من ذرّية هذا الشخص',
  invalid_range:               'أقل عدد للأجيال يجب ألا يتجاوز أكثر عدد',
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

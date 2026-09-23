/**
 * «قفزة نسب» (ancestry jump) — request schemas.
 *
 * Kept in their own file rather than in `schemas.ts` because the schemas, the
 * validators and the error-code map belong together; `schemas.ts` is the shared
 * individual/family surface.
 *
 * DESIGN RULE — PATCH does NOT move either endpoint. Re-pointing a jump is
 * delete + create. That keeps the cycle and one-jump-per-person invariants
 * trivially checkable and keeps undo as two single-row operations. The ONE
 * sanctioned re-point is the dedicated move-to-new-father route (and its
 * move-back undo), which re-runs the full rule set on the projected tree.
 *
 * PATCH partial-range semantics: `undefined` = leave unchanged, explicit `null`
 * = clear. Zod's `.refine` only ever sees the PATCH body, so the route must
 * re-run the ordering check against the MERGED (existing ⊕ patch) values —
 * that is validator rule J6, not this file's job.
 */
import { z } from 'zod';
import { targetTreeIdSchema, individualFieldsSchema } from '@/lib/tree/schemas';

/** Hard ceiling on a stated generation gap. 200 is a sanity bound, not a claim. */
export const MAX_JUMP_GENERATIONS = 200;

const generationsSchema = z
  .number()
  .int()
  .min(1)
  .max(MAX_JUMP_GENERATIONS)
  .nullable()
  .optional();

const rangeOrdered = (d: { generationsMin?: number | null; generationsMax?: number | null }) =>
  d.generationsMin == null || d.generationsMax == null || d.generationsMin <= d.generationsMax;

const RANGE_MESSAGE = 'أقل عدد للأجيال يجب ألا يتجاوز أكثر عدد';

export const createAncestryJumpSchema = z
  .object({
    treeId: targetTreeIdSchema,
    descendantId: z.string().uuid(),
    ancestorFamilyId: z.string().uuid(),
    generationsMin: generationsSchema,
    generationsMax: generationsSchema,
    notes: z.string().max(5000).nullable().optional(),
  })
  .refine(rangeOrdered, { message: RANGE_MESSAGE, path: ['generationsMax'] });

/** PATCH: range + notes only. The two endpoints are immutable — delete + recreate. */
export const updateAncestryJumpSchema = z
  .object({
    treeId: targetTreeIdSchema,
    generationsMin: generationsSchema,
    generationsMax: generationsSchema,
    notes: z.string().max(5000).nullable().optional(),
  })
  .refine(rangeOrdered, { message: RANGE_MESSAGE, path: ['generationsMax'] });

/**
 * Move a jump up to a brand-new father. `father` is the individual-create body
 * (minus `treeId`, which travels at the top level) with the sex locked to
 * male: a MOTHER never takes the jump over — a «قفزة نسب» is a paternal
 * descent claim, and only a father continues the line upward.
 */
export const moveJumpToNewFatherSchema = z.object({
  treeId: targetTreeIdSchema,
  father: individualFieldsSchema
    .omit({ treeId: true })
    .extend({
      sex: z.literal('M'),
      isPrivate: z.boolean().optional().default(false),
    })
    .refine((d) => d.givenName || d.fullName, {
      message: 'يجب تقديم الاسم الأول أو الاسم الكامل',
    }),
});

/**
 * Undo of a move. The client sends the ids the move returned and the PRE-move
 * range (the move shrank it by one; a bound that fell to "unstated" can only
 * be restored from what the client remembers).
 */
export const moveJumpBackSchema = z
  .object({
    treeId: targetTreeIdSchema,
    fatherId: z.string().uuid(),
    familyId: z.string().uuid(),
    childId: z.string().uuid(),
    generationsMin: generationsSchema,
    generationsMax: generationsSchema,
  })
  .refine(rangeOrdered, { message: RANGE_MESSAGE, path: ['generationsMax'] });

export type CreateAncestryJumpInput = z.infer<typeof createAncestryJumpSchema>;
export type UpdateAncestryJumpInput = z.infer<typeof updateAncestryJumpSchema>;
export type MoveJumpToNewFatherInput = z.infer<typeof moveJumpToNewFatherSchema>;
export type MoveJumpBackInput = z.infer<typeof moveJumpBackSchema>;

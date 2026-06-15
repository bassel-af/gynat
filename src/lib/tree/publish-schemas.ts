import { z } from 'zod'

/**
 * Body for PATCH .../tree/visibility.
 *
 * `level` is the UI ladder value (mapped to the DB enum at the route).
 * `confirmationPhrase` is required ONLY when going public (link/search) — the
 * route recomputes the living set and validates the typed phrase server-side.
 * `allowReuse` is the separate "others may include this tree in collections"
 * opt-in (PRD §1.10).
 */
export const visibilityPatchSchema = z.object({
  level: z.enum(['private', 'link', 'search']),
  confirmationPhrase: z.string().max(200).optional(),
  allowReuse: z.boolean().optional(),
})

export type VisibilityPatchInput = z.infer<typeof visibilityPatchSchema>

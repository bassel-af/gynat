import { z } from 'zod'

/**
 * Public report submission (PRD §1.5, §7.7). No account required, so keep it
 * minimal and bounded. `reason` is the free-text complaint; `reporterContact`
 * is optional (someone reporting their own exposure may want a reply).
 */
export const reportSchema = z.object({
  reason: z.string().trim().min(3).max(2000),
  reporterContact: z.string().trim().max(200).optional(),
})

export type ReportInput = z.infer<typeof reportSchema>

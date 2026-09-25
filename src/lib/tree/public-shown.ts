/**
 * Public Tree — "does the public tree show this person in full?"
 *
 * Client-safe and pure (no DB, no crypto): the Sources form warning runs it
 * over the loaded tree in the browser, and the server's publish summary runs
 * it over the same data. It is also the HOME of the single living-status rule
 * (`isPresumedLiving`), which `public-visibility.ts` re-exports so the
 * publish checkpoint, the public redactor and this predicate can never drift.
 */
import type { Individual } from '@/lib/gedcom/types'

/**
 * Anyone whose birth date makes them this old or older is presumed deceased,
 * even without a deceased mark. A safe, well-understood genealogy cutoff that
 * clears out the obviously-dead without risking a living person.
 */
export const PRESUMED_DECEASED_AGE_YEARS = 130

/** Extracts a 4-digit year from a free-form date string ("12 JAN 1850" -> 1850). */
export function extractYear(dateStr: string): number | null {
  const match = dateStr.match(/\d{4}/)
  return match ? Number(match[0]) : null
}

/**
 * The SINGLE living-status rule. A person is presumed LIVING when they are
 * NOT marked deceased AND were not born more than 130 years ago. A person
 * with neither a birth date nor a deceased mark is treated as living.
 */
export function isPresumedLiving(individual: Individual, now: Date): boolean {
  if (individual.isDeceased) return false

  const birthYear = extractYear(individual.birth)
  if (birthYear === null) return true // no date, not deceased -> living

  const age = now.getUTCFullYear() - birthYear
  if (age >= PRESUMED_DECEASED_AGE_YEARS) return false // presumed deceased

  return true
}

/**
 * True when the published tree shows this person in full — i.e. what
 * `redactForPublic` marks `publicDisplay: 'full'` — AND the person is native
 * to the tree (a borrowed `_pointed` person's sources are never served
 * through the borrowing tree). Fail-closed: anything but an explicit
 * `isPrivate === false` counts as private.
 */
export function isShownOnPublicTree(ind: Individual, now: Date): boolean {
  if (ind.isPrivate !== false) return false
  if (ind._pointed) return false
  return !isPresumedLiving(ind, now)
}

/**
 * Public Tree — additive composition of the published dataset (PRD §7.1, §7.5).
 *
 * This is the deny-by-default public composition: it starts from the home main
 * tree and ADDS only explicitly-included, source-public borrowed subtrees. It
 * does NOT import or call the member-serving merge path (the active-pointers
 * query or the pointed-subtree merger) — the public route is structurally
 * forbidden from those (see the no-unsafe-import test).
 *
 * Compose-then-redact: the route composes here FIRST, then runs
 * `redactForPublic` ONCE over the whole composed set. Never redact-then-merge.
 */

import type { GedcomData, Individual, Family, RadaFamily } from '@/lib/gedcom/types'

/**
 * A borrowed branch is shown on a public tree ONLY if its source tree is
 * itself public. Fail-closed: anything that is not explicitly one of the two
 * public levels (including null/undefined/unknown) is withheld.
 */
export function isSourceTreePublic(visibility: string | null | undefined): boolean {
  return visibility === 'public_link' || visibility === 'public_listed'
}

/**
 * Additively merge the home tree with already-vetted public borrowed subtrees
 * into a single `GedcomData`. Home data is authoritative on id collisions. The
 * inputs are not mutated. No redaction happens here — the caller redacts the
 * composed result once.
 */
export function composePublicGedcom(
  home: GedcomData,
  borrowedSubtrees: GedcomData[],
): GedcomData {
  const individuals: Record<string, Individual> = {}
  const families: Record<string, Family> = {}
  const radaFamilies: Record<string, RadaFamily> = {}

  // Borrowed first, home last — so home wins on any id collision.
  for (const sub of borrowedSubtrees) {
    Object.assign(individuals, sub.individuals)
    Object.assign(families, sub.families)
    if (sub.radaFamilies) Object.assign(radaFamilies, sub.radaFamilies)
  }
  Object.assign(individuals, home.individuals)
  Object.assign(families, home.families)
  if (home.radaFamilies) Object.assign(radaFamilies, home.radaFamilies)

  const result: GedcomData = { individuals, families }
  if (Object.keys(radaFamilies).length > 0) result.radaFamilies = radaFamilies
  return result
}

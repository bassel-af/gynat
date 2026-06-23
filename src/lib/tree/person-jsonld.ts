/**
 * Public person page — schema.org Person/genealogy JSON-LD builder.
 *
 * SECURITY-CRITICAL. This is the ONE place that turns a published person into
 * machine-readable structured data. It deliberately REVERSES the platform's
 * prior "no Person/genealogy schema" rule, so it is the guardrail for that
 * reversal. Every privacy guarantee lives here, in one pure, exhaustively
 * tested function.
 *
 * Contract (locked with architect, see Surface 4 spec):
 *  - INPUT is the ALREADY-redacted public GedcomData (post-`redactForPublic`),
 *    where every individual carries `publicDisplay`. We NEVER read raw records.
 *  - EMISSION GATE: returns the Person graph ONLY when `indexable` is true
 *    (the caller passes `isPublicTreeIndexable(record)` = main + public_listed).
 *    Otherwise -> null (no Person schema on by-link/extra/member/private pages).
 *  - Focal person resolving to `redacted` (private) or absent -> null (the page
 *    404s separately; the schema never describes a private person).
 *  - PER-NODE PRIVACY (defense in depth — the data is already redacted, this is
 *    the second independent gate): a node is emitted ONLY if its
 *    `publicDisplay !== 'redacted'`. A private parent/spouse/child/sibling is
 *    dropped entirely — no node, no edge, no «خاص» placeholder (which would be a
 *    structural oracle for scrapers).
 *  - DATES: NONE. The public machine-readable feed is fully DATELESS for
 *    everyone — focal, relations, living AND deceased (team-lead halt,
 *    2026-06-23). No birthDate/deathDate is ever emitted on any node; the date
 *    keys are absent from the allowlists so no code path can produce one. (The
 *    human-visible page still shows deceased dates — that is unchanged; this is
 *    only about the indexed structured-data feed.)
 *  - FIRST-DEGREE ONLY: parent (father+mother), spouse, children, sibling.
 *    Uncles/cousins/grandchildren/rada'a are shown on the human page but are
 *    NEVER in the machine graph.
 */

import type { GedcomData, Individual } from '@/lib/gedcom/types'

/** A person is safe to surface in the public graph iff not redacted. */
function isPublicNode(ind: Individual | undefined): ind is Individual {
  return !!ind && ind.publicDisplay !== 'redacted'
}

/**
 * STRICT KEY ALLOWLISTS — the final, exhaustive set of keys permitted on each
 * node type. Applied as the LAST step so a future careless field added to a
 * node literal can NEVER leak into the public JSON: anything not on the list is
 * dropped.
 *
 * DATELESS by design (team-lead halt, 2026-06-23): the public machine-readable
 * structured data carries NO birth/death dates for ANYONE — not the focal, not
 * relations, not deceased people. `birthDate`/`deathDate` are deliberately ABSENT
 * from both allowlists, so there is NO code path that can emit a date string.
 * (Human-visible page text still shows dates; this is only the indexed feed.)
 */
const FOCAL_KEYS = new Set([
  '@context',
  '@type',
  '@id',
  'name',
  'gender',
  'url',
  'parent',
  'children',
  'spouse',
  'sibling',
])
// Relation nodes carry name + gender ONLY — no dates, no structural keys.
const RELATION_KEYS = new Set(['@type', 'name', 'gender'])

/** Drop any key not on `allowed` (last-step guardrail against future leaks). */
function pruneToAllowlist(
  obj: Record<string, unknown>,
  allowed: Set<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (allowed.has(k)) out[k] = v
  }
  return out
}

/**
 * A relation Person node: name + gender ONLY. NO dates, ever (dateless feed —
 * team-lead halt). Pruned to the relation allowlist as a last-step backstop.
 */
function relationNode(ind: Individual): Record<string, unknown> {
  return pruneToAllowlist(
    {
      '@type': 'Person',
      name: ind.name,
      gender: ind.sex === 'F' ? 'female' : 'male',
    },
    RELATION_KEYS,
  )
}

/**
 * First-degree relations of the focal person, derived from the redacted
 * GedcomData and filtered to PUBLIC nodes only. Mirrors the human-page graph
 * but stays strictly first-degree (no uncles/cousins/grandchildren/rada).
 */
function collectRelations(data: GedcomData, focalId: string) {
  const { individuals, families } = data
  const focal = individuals[focalId]

  const parents: Individual[] = []
  const siblings: Individual[] = []
  const spouses: Individual[] = []
  const children: Individual[] = []

  if (!focal) return { parents, siblings, spouses, children }

  // Parents + siblings from the focal's family-as-child.
  if (focal.familyAsChild) {
    const fam = families[focal.familyAsChild]
    if (fam) {
      const father = fam.husband ? individuals[fam.husband] : undefined
      const mother = fam.wife ? individuals[fam.wife] : undefined
      if (isPublicNode(father)) parents.push(father)
      if (isPublicNode(mother)) parents.push(mother)
      for (const childId of fam.children) {
        if (childId === focalId) continue
        const sib = individuals[childId]
        if (isPublicNode(sib)) siblings.push(sib)
      }
    }
  }

  // Spouses + children from the focal's families-as-spouse.
  const seenSpouse = new Set<string>()
  const seenChild = new Set<string>()
  for (const familyId of focal.familiesAsSpouse) {
    const fam = families[familyId]
    if (!fam) continue
    const spouseId = fam.husband === focalId ? fam.wife : fam.husband
    if (spouseId && !seenSpouse.has(spouseId)) {
      const spouse = individuals[spouseId]
      if (isPublicNode(spouse)) {
        seenSpouse.add(spouseId)
        spouses.push(spouse)
      }
    }
    for (const childId of fam.children) {
      if (seenChild.has(childId)) continue
      const child = individuals[childId]
      if (isPublicNode(child)) {
        seenChild.add(childId)
        children.push(child)
      }
    }
  }

  return { parents, siblings, spouses, children }
}

export interface PersonJsonLdArgs {
  /** Post-`redactForPublic` public dataset (every node carries publicDisplay). */
  data: GedcomData
  /** Focal individual id (the person this page is about). */
  focalId: string
  /** Absolute/relative canonical URL of the person page. */
  canonicalUrl: string
  /** `isPublicTreeIndexable(record)` — main tree AND public_listed. */
  indexable: boolean
}

/**
 * Build the schema.org Person graph for the public person page, or `null` when
 * it must not be emitted (non-indexable page, or focal private/absent).
 */
export function buildPersonJsonLd(args: PersonJsonLdArgs): Record<string, unknown> | null {
  const { data, focalId, canonicalUrl, indexable } = args

  // Emission gate: machine-readable Person data only on indexable pages.
  if (!indexable) return null

  const focal = data.individuals[focalId]
  // Focal private or absent -> no schema (page 404s; never describe a private).
  if (!isPublicNode(focal)) return null

  const { parents, siblings, spouses, children } = collectRelations(data, focalId)

  const person: Record<string, unknown> = {
    '@type': 'Person',
    '@id': canonicalUrl,
    name: focal.name,
    gender: focal.sex === 'F' ? 'female' : 'male',
    url: canonicalUrl,
    // NO dates — the public machine-readable feed is fully dateless (team-lead
    // halt). The focal node carries identity + relationships only.
  }

  // First-degree relations, date-free name+gender nodes.
  if (parents.length > 0) person.parent = parents.map(relationNode)
  if (children.length > 0) person.children = children.map(relationNode)
  if (spouses.length > 0) person.spouse = spouses.map(relationNode)
  if (siblings.length > 0) person.sibling = siblings.map(relationNode)

  // Last-step allowlist prune on the focal node: any key not explicitly
  // permitted is dropped, so a future careless addition cannot leak.
  return pruneToAllowlist({ '@context': 'https://schema.org', ...person }, FOCAL_KEYS)
}

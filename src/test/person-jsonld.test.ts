import { describe, test, expect } from 'vitest'
import type { GedcomData, Individual, Family } from '@/lib/gedcom/types'
import { redactForPublic } from '@/lib/tree/public-visibility'
import { buildPersonJsonLd } from '@/lib/tree/person-jsonld'

// ---------------------------------------------------------------------------
// Fixtures (mirror public-visibility.test.ts)
// ---------------------------------------------------------------------------

function ind(overrides: Partial<Individual> & { id: string }): Individual {
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
    kunya: '',
    notes: '',
    isDeceased: false,
    isPrivate: false,
    familiesAsSpouse: [],
    familyAsChild: null,
    ...overrides,
  }
}

function fam(overrides: Partial<Family> & { id: string }): Family {
  const empty = { date: '', hijriDate: '', place: '', description: '', notes: '' }
  return {
    type: 'FAM',
    husband: null,
    wife: null,
    children: [],
    marriageContract: { ...empty },
    marriage: { ...empty },
    divorce: { ...empty },
    isDivorced: false,
    ...overrides,
  }
}

const URL = '/family/saeed/person/focal'
const NOW = new Date('2026-06-23T00:00:00Z')

/**
 * A rich family with every state:
 *  - focal: LIVING (born 2000, not deceased) — birth set in DB, never emitted
 *  - father: DECEASED (born 1900) — `publicDisplay==='full'`; note the feed is
 *    DATELESS so even his date is NOT emitted in the JSON-LD (it stays on the
 *    human page only)
 *  - mother: PRIVATE
 *  - spouse: LIVING with a birth date
 *  - child: LIVING
 *  - sibling A: deceased; sibling B (priv): PRIVATE
 *  - an uncle/cousin/grandchild that must NEVER appear (first-degree-only)
 */
function buildRichTree(): GedcomData {
  const individuals: Record<string, Individual> = {
    focal: ind({ id: 'focal', name: 'باسل', sex: 'M', birth: '2000', familyAsChild: 'f-parents', familiesAsSpouse: ['f-marriage'] }),
    father: ind({ id: 'father', name: 'خالد', sex: 'M', birth: '1900', isDeceased: true, familyAsChild: 'f-grand', familiesAsSpouse: ['f-parents'] }),
    mother: ind({ id: 'mother', name: 'رقية', sex: 'F', birth: '1905', isPrivate: true, familiesAsSpouse: ['f-parents'] }),
    spouse: ind({ id: 'spouse', name: 'ليلى', sex: 'F', birth: '2002', familiesAsSpouse: ['f-marriage'] }),
    child: ind({ id: 'child', name: 'عمر', sex: 'M', birth: '2025', familyAsChild: 'f-marriage' }),
    sibA: ind({ id: 'sibA', name: 'أحمد', sex: 'M', birth: '1990', isDeceased: true, familyAsChild: 'f-parents' }),
    sibPriv: ind({ id: 'sibPriv', name: 'سر', sex: 'F', isPrivate: true, familyAsChild: 'f-parents' }),
    // grandfather + uncle (focal's father's family) — uncle is first-cousin-once... NOT first degree to focal
    grandfather: ind({ id: 'grandfather', name: 'إبراهيم', sex: 'M', birth: '1870', isDeceased: true, familiesAsSpouse: ['f-grand'] }),
    uncle: ind({ id: 'uncle', name: 'وليد', sex: 'M', birth: '1905', isDeceased: true, familyAsChild: 'f-grand', familiesAsSpouse: ['f-uncle'] }),
    cousin: ind({ id: 'cousin', name: 'طارق', sex: 'M', birth: '1940', isDeceased: true, familyAsChild: 'f-uncle' }),
    grandchild: ind({ id: 'grandchild', name: 'تسنيم', sex: 'F', birth: '2050', familyAsChild: 'f-child' }),
  }
  const families: Record<string, Family> = {
    'f-parents': fam({ id: 'f-parents', husband: 'father', wife: 'mother', children: ['focal', 'sibA', 'sibPriv'] }),
    'f-marriage': fam({ id: 'f-marriage', husband: 'focal', wife: 'spouse', children: ['child'] }),
    'f-grand': fam({ id: 'f-grand', husband: 'grandfather', children: ['father', 'uncle'] }),
    'f-uncle': fam({ id: 'f-uncle', husband: 'uncle', children: ['cousin'] }),
    'f-child': fam({ id: 'f-child', husband: 'child', children: ['grandchild'] }),
  }
  return { individuals, families }
}

/** Walk every string value anywhere in the JSON graph. */
function allStrings(obj: unknown): string[] {
  const out: string[] = []
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.push(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(obj)
  return out
}

// ---------------------------------------------------------------------------
// THE load-bearing guarantee
// ---------------------------------------------------------------------------

describe('buildPersonJsonLd — load-bearing privacy guarantee', () => {
  test('never emits a living person’s birth date, never emits any private person', () => {
    const data = redactForPublic(buildRichTree(), NOW)

    // Try EVERY individual as the focal person — covers all code paths.
    for (const focalId of Object.keys(data.individuals)) {
      const json = buildPersonJsonLd({ data, focalId, canonicalUrl: URL, indexable: true })
      if (json === null) continue // private focal -> null, fine

      const strings = allStrings(json)

      // (1) No PRIVATE person's identity ever appears — neither raw name nor the
      // redaction placeholder. mother ('رقية') and sibPriv ('سر') are private.
      expect(strings).not.toContain('رقية')
      expect(strings).not.toContain('سر')
      expect(strings).not.toContain('خاص') // the redaction placeholder
      expect(strings).not.toContain('خاص') // belt: placeholder must never be a node name

      // (2) DATELESS FEED (team-lead halt): NO date/year of ANY person — living
      // OR deceased, focal OR relation — appears anywhere in the JSON-LD. The
      // fixture's every birth/death year must be absent, and no birthDate/
      // deathDate key may exist on any node.
      const everyYear = ['2000', '2002', '2025', '2050', '1900', '1990', '1870', '1905', '1940']
      for (const year of everyYear) {
        expect(strings).not.toContain(year)
      }
      // No date KEY anywhere in the serialized graph.
      expect(JSON.stringify(json)).not.toContain('birthDate')
      expect(JSON.stringify(json)).not.toContain('deathDate')
    }
  })

  test('a redacted node never appears as a node or relation endpoint (any focal)', () => {
    const data = redactForPublic(buildRichTree(), NOW)
    for (const focalId of Object.keys(data.individuals)) {
      const json = buildPersonJsonLd({ data, focalId, canonicalUrl: URL, indexable: true })
      if (json === null) continue
      // Re-walk for any object whose name maps to a redacted individual.
      const redactedNames = Object.values(data.individuals)
        .filter((i) => i.publicDisplay === 'redacted')
        .map((i) => i.name)
      for (const name of redactedNames) {
        expect(allStrings(json)).not.toContain(name)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Emission gate + focal resolution
// ---------------------------------------------------------------------------

describe('buildPersonJsonLd — emission gate', () => {
  test('returns null when not indexable (no Person schema on by-link/extra/member)', () => {
    const data = redactForPublic(buildRichTree(), NOW)
    expect(buildPersonJsonLd({ data, focalId: 'focal', canonicalUrl: URL, indexable: false })).toBeNull()
  })

  test('returns null for a private focal id (no oracle — page 404s separately)', () => {
    const data = redactForPublic(buildRichTree(), NOW)
    expect(buildPersonJsonLd({ data, focalId: 'mother', canonicalUrl: URL, indexable: true })).toBeNull()
    expect(buildPersonJsonLd({ data, focalId: 'sibPriv', canonicalUrl: URL, indexable: true })).toBeNull()
  })

  test('returns null for an absent focal id', () => {
    const data = redactForPublic(buildRichTree(), NOW)
    expect(buildPersonJsonLd({ data, focalId: 'nope', canonicalUrl: URL, indexable: true })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Shape + first-degree-only + date rules
// ---------------------------------------------------------------------------

describe('buildPersonJsonLd — shape', () => {
  test('NO node carries a date — focal OR relation, living OR deceased (dateless feed)', () => {
    const data = redactForPublic(buildRichTree(), NOW)
    // The focal here is LIVING and a DECEASED focal (father) — both dateless.
    for (const focalId of ['focal', 'father', 'sibA']) {
      const json = buildPersonJsonLd({ data, focalId, canonicalUrl: URL, indexable: true })!
      expect(json.birthDate).toBeUndefined()
      expect(json.deathDate).toBeUndefined()
      const rels = [json.parent, json.children, json.spouse, json.sibling]
        .flat()
        .filter(Boolean) as Record<string, unknown>[]
      for (const node of rels) {
        // EVERY relation node — living or deceased — is name + gender only.
        expect(Object.keys(node).sort()).toEqual(['@type', 'gender', 'name'])
      }
    }
  })

  test('private father drops the parent edge (no node, no «خاص»)', () => {
    const data = redactForPublic(buildRichTree(), NOW)
    // focal's mother is private -> only ONE parent (father) emitted.
    const json = buildPersonJsonLd({ data, focalId: 'focal', canonicalUrl: URL, indexable: true })!
    const parents = json.parent as Record<string, unknown>[]
    expect(parents).toHaveLength(1)
    expect(parents[0].name).toBe('خالد') // the deceased father, not the private mother
  })

  test('uncles, cousins, grandchildren NEVER appear (first-degree only)', () => {
    const data = redactForPublic(buildRichTree(), NOW)
    // Use the FATHER as focal — he HAS an uncle-equivalent (his sibling) and
    // a grandfather; assert only his first-degree relations surface.
    for (const focalId of Object.keys(data.individuals)) {
      const json = buildPersonJsonLd({ data, focalId, canonicalUrl: URL, indexable: true })
      if (!json) continue
      const strings = allStrings(json)
      // From the focal=باسل perspective these are non-first-degree:
      if (focalId === 'focal') {
        expect(strings).not.toContain('وليد') // uncle
        expect(strings).not.toContain('طارق') // cousin
        expect(strings).not.toContain('تسنيم') // grandchild
        expect(strings).not.toContain('إبراهيم') // grandfather
      }
    }
  })

  test('focal node keys are a strict subset of the DATELESS allowlist (no date keys)', () => {
    const data = redactForPublic(buildRichTree(), NOW)
    // birthDate/deathDate are deliberately NOT in the allowed set — a dateless feed.
    const allowed = new Set([
      '@context', '@type', '@id', 'name', 'gender', 'url',
      'parent', 'children', 'spouse', 'sibling',
    ])
    for (const focalId of Object.keys(data.individuals)) {
      const json = buildPersonJsonLd({ data, focalId, canonicalUrl: URL, indexable: true })
      if (!json) continue
      for (const key of Object.keys(json)) {
        expect(allowed.has(key)).toBe(true)
      }
    }
  })

  test('NO person carries a date on ANY node — every focal permutation (dateless feed)', () => {
    // The absolute invariant: NO birthDate/deathDate is ever emitted, for anyone,
    // anywhere — living or deceased, focal or relation (team-lead halt).
    const data = redactForPublic(buildRichTree(), NOW)
    for (const focalId of Object.keys(data.individuals)) {
      const json = buildPersonJsonLd({ data, focalId, canonicalUrl: URL, indexable: true })
      if (!json) continue
      const nodes: Record<string, unknown>[] = [json]
      for (const group of [json.parent, json.children, json.spouse, json.sibling]) {
        if (Array.isArray(group)) nodes.push(...(group as Record<string, unknown>[]))
      }
      for (const node of nodes) {
        expect(node.birthDate).toBeUndefined()
        expect(node.deathDate).toBeUndefined()
      }
    }
  })

  test('emitted graph has the schema.org context and focal Person', () => {
    const data = redactForPublic(buildRichTree(), NOW)
    const json = buildPersonJsonLd({ data, focalId: 'focal', canonicalUrl: URL, indexable: true })!
    expect(json['@context']).toBe('https://schema.org')
    expect(json['@type']).toBe('Person')
    expect(json.name).toBe('باسل')
    expect(json['@id']).toBe(URL)
  })
})

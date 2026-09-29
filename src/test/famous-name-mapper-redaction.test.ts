/**
 * اسم الشهرة (famousName / famousNameInNasab) — data layer:
 *   - famousName is encrypted at rest and decrypted by the tree mapper;
 *   - famousNameInNasab null (never chosen) → key ABSENT on the Individual;
 *   - a private person leaks NOTHING through either redactor. The reflective
 *     test fills EVERY Individual key (type-enforced via `Required<Individual>`,
 *     so a newly added field breaks compilation here until it is classified)
 *     and asserts only an explicit structural allow-list survives.
 */
import { describe, test, expect } from 'vitest'
import { generateWorkspaceKey } from '@/lib/crypto/workspace-encryption'
import { encryptIndividualInput } from '@/lib/tree/encryption'
import {
  dbTreeToGedcomData,
  redactPrivateIndividuals,
  type DbIndividual,
  type DbTree,
} from '@/lib/tree/mapper'
import { redactForPublic } from '@/lib/tree/public-visibility'
import type { GedcomData, Individual } from '@/lib/gedcom/types'

const KEY = generateWorkspaceKey()

function plainRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'p1',
    treeId: 't1',
    gedcomId: null,
    givenName: 'عبد المطلب',
    surname: null,
    fullName: null,
    sex: 'M',
    birthDate: null,
    birthPlace: null,
    birthPlaceId: null,
    birthDescription: null,
    birthNotes: null,
    birthHijriDate: null,
    deathDate: null,
    deathPlace: null,
    deathPlaceId: null,
    deathDescription: null,
    deathNotes: null,
    deathHijriDate: null,
    kunya: null,
    famousName: null,
    famousNameInNasab: null,
    notes: null,
    isDeceased: true,
    isPrivate: false,
    createdById: null,
    updatedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  }
}

function mapOne(overrides: Record<string, unknown>): Individual {
  const row = encryptIndividualInput(plainRow(overrides), KEY) as unknown as DbIndividual
  const tree: DbTree = { id: 't1', workspaceId: 'w1', individuals: [row], families: [] }
  return dbTreeToGedcomData(tree, KEY).individuals.p1
}

describe('famousName — encryption + mapper', () => {
  test('famousName is stored as ciphertext, not plaintext', () => {
    const row = encryptIndividualInput(plainRow({ famousName: 'شيبة الحمد' }), KEY)
    expect(typeof row.famousName).not.toBe('string')
    expect(Buffer.from(row.famousName as Uint8Array).toString('utf8')).not.toContain('شيبة الحمد')
  })

  test('famousName round-trips through dbTreeToGedcomData', () => {
    expect(mapOne({ famousName: 'شيبة الحمد' }).famousName).toBe('شيبة الحمد')
  })

  test('famousNameInNasab false passes through', () => {
    expect(mapOne({ famousName: 'هاشم', famousNameInNasab: false }).famousNameInNasab).toBe(false)
  })

  test('famousNameInNasab true passes through', () => {
    expect(mapOne({ famousName: 'هاشم', famousNameInNasab: true }).famousNameInNasab).toBe(true)
  })

  test('famousNameInNasab null leaves the key absent', () => {
    expect('famousNameInNasab' in mapOne({ famousName: 'هاشم', famousNameInNasab: null })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Reflective private-person blanking
// ---------------------------------------------------------------------------

const M = (key: string) => `MARK_${key}_MARK`

/** Every key of Individual filled; string values carry a per-key marker. */
function fullyFilledPrivatePerson(): Required<Individual> {
  return {
    id: M('id'),
    type: 'INDI',
    name: M('name'),
    givenName: M('givenName'),
    surname: M('surname'),
    sex: 'M',
    birth: M('birth'),
    birthPlace: M('birthPlace'),
    birthPlaceId: M('birthPlaceId'),
    birthDescription: M('birthDescription'),
    birthNotes: M('birthNotes'),
    birthHijriDate: M('birthHijriDate'),
    death: M('death'),
    deathPlace: M('deathPlace'),
    deathPlaceId: M('deathPlaceId'),
    deathDescription: M('deathDescription'),
    deathNotes: M('deathNotes'),
    deathHijriDate: M('deathHijriDate'),
    kunya: M('kunya'),
    famousName: M('famousName'),
    famousNameInNasab: true,
    notes: M('notes'),
    isDeceased: true,
    isPrivate: true,
    familiesAsSpouse: [M('familiesAsSpouse')],
    familyAsChild: M('familyAsChild'),
    radaFamiliesAsChild: [M('radaFamiliesAsChild')],
    ancestryJumpAsDescendant: M('ancestryJumpAsDescendant'),
    _pointed: true,
    _sourceWorkspaceId: M('_sourceWorkspaceId'),
    _pointerId: M('_pointerId'),
    _sharedRoot: true,
    publicDisplay: 'full',
  }
}

/** Structural references that keep the tree layout working (not PII). */
const STRUCTURAL = [
  'id',
  'familiesAsSpouse',
  'familyAsChild',
  'radaFamiliesAsChild',
  'ancestryJumpAsDescendant',
]
/** Member surface only: composition metadata about the borrow, not the person. */
const MEMBER_ONLY_STRUCTURAL = ['_sourceWorkspaceId', '_pointerId']

function survivingMarkers(output: GedcomData): string[] {
  const json = JSON.stringify(output)
  return Object.keys(fullyFilledPrivatePerson()).filter((k) => json.includes(M(k)))
}

function dataWith(person: Individual): GedcomData {
  return { individuals: { [person.id]: person }, families: {} }
}

describe('private person — nothing but structure survives', () => {
  test('redactPrivateIndividuals leaves only structural markers', () => {
    const out = redactPrivateIndividuals(dataWith(fullyFilledPrivatePerson()))
    const allowed = [...STRUCTURAL, ...MEMBER_ONLY_STRUCTURAL]
    expect(survivingMarkers(out).filter((k) => !allowed.includes(k))).toEqual([])
  })

  test('redactPrivateIndividuals drops famousNameInNasab', () => {
    const person = fullyFilledPrivatePerson()
    const out = redactPrivateIndividuals(dataWith(person))
    expect('famousNameInNasab' in out.individuals[person.id]).toBe(false)
  })

  test('redactForPublic leaves only structural markers', () => {
    const out = redactForPublic(dataWith(fullyFilledPrivatePerson()), new Date('2026-01-01'))
    expect(survivingMarkers(out).filter((k) => !STRUCTURAL.includes(k))).toEqual([])
  })

  test('redactForPublic drops famousNameInNasab', () => {
    const person = fullyFilledPrivatePerson()
    const out = redactForPublic(dataWith(person), new Date('2026-01-01'))
    expect('famousNameInNasab' in out.individuals[person.id]).toBe(false)
  })
})

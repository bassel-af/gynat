import { describe, test, expect } from 'vitest'
import {
  buildEditInitialData,
  buildFamilyEventInitialData,
  serializeIndividualForm,
} from '@/lib/person-detail-helpers'
import type { Individual, Family } from '@/lib/gedcom/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIndividual(overrides?: Partial<Individual>): Individual {
  return {
    id: 'ind-1',
    type: 'INDI',
    name: 'Ahmad',
    givenName: 'Ahmad',
    surname: '',
    sex: 'M',
    birth: '1950',
    birthPlace: 'مكة المكرمة',
    birthDescription: '',
    birthNotes: '',
    birthHijriDate: '',
    death: '',
    deathPlace: '',
    deathDescription: '',
    deathNotes: '',
    deathHijriDate: '',
    notes: '',
    isDeceased: false,
    isPrivate: false,
    familiesAsSpouse: [],
    kunya: '',
    familyAsChild: null,
    ...overrides,
  }
}

function makeFamily(overrides?: Partial<Family>): Family {
  return {
    id: 'fam-1',
    type: 'FAM',
    husband: 'h-1',
    wife: 'w-1',
    children: [],
    marriageContract: { date: '', hijriDate: '', place: '', description: '', notes: '' },
    marriage: { date: '', hijriDate: '', place: '', description: '', notes: '' },
    divorce: { date: '', hijriDate: '', place: '', description: '', notes: '' },
    isDivorced: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// buildEditInitialData — placeId fields
// ---------------------------------------------------------------------------

describe('buildEditInitialData — placeId fields', () => {
  test('includes birthPlaceId and deathPlaceId when present on individual', () => {
    const person = makeIndividual({
      birthPlaceId: 'place-uuid-1',
      deathPlaceId: 'place-uuid-2',
    })
    const result = buildEditInitialData(person)
    expect(result.birthPlaceId).toBe('place-uuid-1')
    expect(result.deathPlaceId).toBe('place-uuid-2')
  })

  test('includes undefined placeId when not present on individual', () => {
    const person = makeIndividual()
    const result = buildEditInitialData(person)
    expect(result.birthPlaceId).toBeUndefined()
    expect(result.deathPlaceId).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// buildFamilyEventInitialData — placeId fields
// ---------------------------------------------------------------------------

describe('buildFamilyEventInitialData — placeId fields', () => {
  test('includes placeId fields from FamilyEvent objects', () => {
    const family = makeFamily({
      marriageContract: { date: '2020', hijriDate: '', place: 'مكة', description: '', notes: '', placeId: 'p1' },
      marriage: { date: '2021', hijriDate: '', place: 'جدة', description: '', notes: '', placeId: 'p2' },
      divorce: { date: '2022', hijriDate: '', place: 'الرياض', description: '', notes: '', placeId: 'p3' },
    })
    const result = buildFamilyEventInitialData(family)
    expect(result.marriageContractPlaceId).toBe('p1')
    expect(result.marriagePlaceId).toBe('p2')
    expect(result.divorcePlaceId).toBe('p3')
  })

  test('returns undefined placeId when not set on FamilyEvent', () => {
    const family = makeFamily()
    const result = buildFamilyEventInitialData(family)
    expect(result.marriageContractPlaceId).toBeUndefined()
    expect(result.marriagePlaceId).toBeUndefined()
    expect(result.divorcePlaceId).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// serializeIndividualForm — placeId fields
// ---------------------------------------------------------------------------

describe('serializeIndividualForm — placeId fields', () => {
  test('passes through birthPlaceId and deathPlaceId when provided', () => {
    const result = serializeIndividualForm({
      givenName: 'محمد',
      surname: '',
      sex: 'M',
      birthDate: '',
      birthPlace: 'مكة',
      birthPlaceId: 'place-uuid-1',
      birthDescription: '',
      birthNotes: '',
      birthHijriDate: '',
      deathDate: '',
      deathPlace: '',
      deathPlaceId: 'place-uuid-2',
      deathDescription: '',
      deathNotes: '',
      deathHijriDate: '',
      isDeceased: false,
      isPrivate: false,
      notes: '',
    })
    expect(result.birthPlaceId).toBe('place-uuid-1')
    expect(result.deathPlaceId).toBe('place-uuid-2')
  })

  test('sends null birthPlaceId when not provided', () => {
    const result = serializeIndividualForm({
      givenName: 'محمد',
      surname: '',
      sex: 'M',
      birthDate: '',
      birthPlace: '',
      birthDescription: '',
      birthNotes: '',
      birthHijriDate: '',
      deathDate: '',
      deathPlace: '',
      deathDescription: '',
      deathNotes: '',
      deathHijriDate: '',
      isDeceased: false,
      isPrivate: false,
      notes: '',
    })
    expect(result.birthPlaceId).toBeNull()
    expect(result.deathPlaceId).toBeNull()
  })
})

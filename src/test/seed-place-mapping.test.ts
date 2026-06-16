import { describe, it, expect } from 'vitest'
import { mapGedcomPlaceToArabic, resolveGedcomPlaces } from '@/lib/tree/seed-place-mapping'
import type { GedcomData, Individual, Family, FamilyEvent } from '@/lib/gedcom/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(overrides?: Partial<FamilyEvent>): FamilyEvent {
  return {
    date: '',
    hijriDate: '',
    place: '',
    description: '',
    notes: '',
    ...overrides,
  }
}

function makeIndividual(overrides?: Partial<Individual>): Individual {
  return {
    id: 'ind-1',
    type: 'INDI',
    name: 'Test',
    givenName: 'Test',
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
    husband: null,
    wife: null,
    children: [],
    marriageContract: makeEvent(),
    marriage: makeEvent(),
    divorce: makeEvent(),
    isDivorced: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// mapGedcomPlaceToArabic
// ---------------------------------------------------------------------------

describe('mapGedcomPlaceToArabic', () => {
  it('maps English GEDCOM "Mecca,,Makkah,Saudi Arabia" to "مكة المكرمة"', () => {
    expect(mapGedcomPlaceToArabic('Mecca,,Makkah,Saudi Arabia')).toBe('مكة المكرمة')
  })

  it('maps English "Medina,,Al Madīnah,Saudi Arabia" to "المدينة المنورة"', () => {
    expect(mapGedcomPlaceToArabic('Medina,,Al Madīnah,Saudi Arabia')).toBe('المدينة المنورة')
  })

  it('maps English "Damascus,,," to "دمشق"', () => {
    expect(mapGedcomPlaceToArabic('Damascus,,,')).toBe('دمشق')
  })

  it('maps English "Amman,,Amman,Jordan" to "عمّان"', () => {
    expect(mapGedcomPlaceToArabic('Amman,,Amman,Jordan')).toBe('عمّان')
  })

  it('maps English "Idlib,,Idlib,Syria" to "إدلب"', () => {
    expect(mapGedcomPlaceToArabic('Idlib,,Idlib,Syria')).toBe('إدلب')
  })

  it('maps English "Jazrāyā,,Aleppo,Syria" to "جزرايا"', () => {
    expect(mapGedcomPlaceToArabic('Jazrāyā,,Aleppo,Syria')).toBe('جزرايا')
  })

  it('maps English "Yanbu\' al Baḩr,,Al Madīnah,Saudi Arabia" to "ينبع"', () => {
    expect(mapGedcomPlaceToArabic("Yanbu' al Baḩr,,Al Madīnah,Saudi Arabia")).toBe('ينبع')
  })

  it('maps country-only ",,,,China" to "الصين"', () => {
    expect(mapGedcomPlaceToArabic(',,,,China')).toBe('الصين')
  })

  it('normalizes Arabic "اسطنبول,اسطنبول,تركيا" to "إسطنبول"', () => {
    expect(mapGedcomPlaceToArabic('اسطنبول,اسطنبول,تركيا')).toBe('إسطنبول')
  })

  it('normalizes "الرياض,منطقة الرياض‎,المملكة العربية السعودية" to "الرياض"', () => {
    expect(mapGedcomPlaceToArabic('الرياض,منطقة الرياض\u200E,المملكة العربية السعودية')).toBe('الرياض')
  })

  it('extracts city from Arabic "الرياض,,الرياض,السعودية" to "الرياض"', () => {
    expect(mapGedcomPlaceToArabic('الرياض,,الرياض,السعودية')).toBe('الرياض')
  })

  it('extracts city from "دمشق,,دمشق,سوريا" to "دمشق"', () => {
    expect(mapGedcomPlaceToArabic('دمشق,,دمشق,سوريا')).toBe('دمشق')
  })

  it('extracts city from "حمص,,حمص,سوريا" to "حمص"', () => {
    expect(mapGedcomPlaceToArabic('حمص,,حمص,سوريا')).toBe('حمص')
  })

  it('extracts city from "الكويت,,الكويت,الكويت" to "الكويت"', () => {
    expect(mapGedcomPlaceToArabic('الكويت,,الكويت,الكويت')).toBe('الكويت')
  })

  it('extracts city from "جدة,,مكة المكرمة,السعودية" to "جدة"', () => {
    expect(mapGedcomPlaceToArabic('جدة,,مكة المكرمة,السعودية')).toBe('جدة')
  })

  it('extracts city from "إسطنبول,,,تركيا" to "إسطنبول"', () => {
    expect(mapGedcomPlaceToArabic('إسطنبول,,,تركيا')).toBe('إسطنبول')
  })

  it('extracts city from "القاهرة,,,مصر" to "القاهرة"', () => {
    expect(mapGedcomPlaceToArabic('القاهرة,,,مصر')).toBe('القاهرة')
  })

  it('extracts country from ",,,ألمانيا" to "ألمانيا"', () => {
    expect(mapGedcomPlaceToArabic(',,,ألمانيا')).toBe('ألمانيا')
  })

  it('extracts country from ",,,لبنان" to "لبنان"', () => {
    expect(mapGedcomPlaceToArabic(',,,لبنان')).toBe('لبنان')
  })

  it('extracts country from ",,,السعودية" to "السعودية"', () => {
    expect(mapGedcomPlaceToArabic(',,,السعودية')).toBe('السعودية')
  })

  it('extracts country from ",,,الإمارات" to "الإمارات"', () => {
    expect(mapGedcomPlaceToArabic(',,,الإمارات')).toBe('الإمارات')
  })

  it('extracts city from "سكّرة,,,سوريا" to "سكّرة"', () => {
    expect(mapGedcomPlaceToArabic('سكّرة,,,سوريا')).toBe('سكّرة')
  })

  it('extracts city from "ليون,,,فرنسا" to "ليون"', () => {
    expect(mapGedcomPlaceToArabic('ليون,,,فرنسا')).toBe('ليون')
  })

  it('returns empty string for empty input', () => {
    expect(mapGedcomPlaceToArabic('')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// resolveGedcomPlaces
// ---------------------------------------------------------------------------

describe('resolveGedcomPlaces', () => {
  it('replaces individual birthPlace with Arabic city name and sets birthPlaceId', () => {
    const data: GedcomData = {
      individuals: {
        'ind-1': makeIndividual({
          id: 'ind-1',
          birthPlace: 'Mecca,,Makkah,Saudi Arabia',
        }),
      },
      families: {},
    }
    const placeNameToId = new Map<string, string>([['مكة المكرمة', 'place-uuid-mecca']])

    const result = resolveGedcomPlaces(data, placeNameToId)
    const ind = result.individuals['ind-1']

    expect(ind.birthPlace).toBe('مكة المكرمة')
    expect(ind.birthPlaceId).toBe('place-uuid-mecca')
  })

  it('replaces individual deathPlace with Arabic city name and sets deathPlaceId', () => {
    const data: GedcomData = {
      individuals: {
        'ind-1': makeIndividual({
          id: 'ind-1',
          deathPlace: 'Medina,,Al Madīnah,Saudi Arabia',
        }),
      },
      families: {},
    }
    const placeNameToId = new Map<string, string>([['المدينة المنورة', 'place-uuid-medina']])

    const result = resolveGedcomPlaces(data, placeNameToId)
    const ind = result.individuals['ind-1']

    expect(ind.deathPlace).toBe('المدينة المنورة')
    expect(ind.deathPlaceId).toBe('place-uuid-medina')
  })

  it('sets placeId to undefined when place name is not found in lookup', () => {
    const data: GedcomData = {
      individuals: {
        'ind-1': makeIndividual({
          id: 'ind-1',
          birthPlace: 'ليون,,,فرنسا',
        }),
      },
      families: {},
    }
    const placeNameToId = new Map<string, string>() // empty lookup

    const result = resolveGedcomPlaces(data, placeNameToId)
    const ind = result.individuals['ind-1']

    expect(ind.birthPlace).toBe('ليون')
    expect(ind.birthPlaceId).toBeUndefined()
  })

  it('replaces family marriage place and sets placeId', () => {
    const data: GedcomData = {
      individuals: {},
      families: {
        'fam-1': makeFamily({
          id: 'fam-1',
          marriage: makeEvent({ place: 'الرياض,,الرياض,السعودية' }),
        }),
      },
    }
    const placeNameToId = new Map<string, string>([['الرياض', 'place-uuid-riyadh']])

    const result = resolveGedcomPlaces(data, placeNameToId)
    const fam = result.families['fam-1']

    expect(fam.marriage.place).toBe('الرياض')
    expect(fam.marriage.placeId).toBe('place-uuid-riyadh')
  })

  it('replaces family marriageContract place and sets placeId', () => {
    const data: GedcomData = {
      individuals: {},
      families: {
        'fam-1': makeFamily({
          id: 'fam-1',
          marriageContract: makeEvent({ place: 'Mecca,,Makkah,Saudi Arabia' }),
        }),
      },
    }
    const placeNameToId = new Map<string, string>([['مكة المكرمة', 'place-uuid-mecca']])

    const result = resolveGedcomPlaces(data, placeNameToId)
    const fam = result.families['fam-1']

    expect(fam.marriageContract.place).toBe('مكة المكرمة')
    expect(fam.marriageContract.placeId).toBe('place-uuid-mecca')
  })

  it('replaces family divorce place and sets placeId', () => {
    const data: GedcomData = {
      individuals: {},
      families: {
        'fam-1': makeFamily({
          id: 'fam-1',
          divorce: makeEvent({ place: 'الرياض,,الرياض,السعودية' }),
        }),
      },
    }
    const placeNameToId = new Map<string, string>([['الرياض', 'place-uuid-riyadh']])

    const result = resolveGedcomPlaces(data, placeNameToId)
    const fam = result.families['fam-1']

    expect(fam.divorce.place).toBe('الرياض')
    expect(fam.divorce.placeId).toBe('place-uuid-riyadh')
  })

  it('does not mutate the original GedcomData', () => {
    const original: GedcomData = {
      individuals: {
        'ind-1': makeIndividual({
          id: 'ind-1',
          birthPlace: 'Mecca,,Makkah,Saudi Arabia',
        }),
      },
      families: {},
    }
    const placeNameToId = new Map<string, string>([['مكة المكرمة', 'place-uuid-mecca']])
    const originalBirthPlace = original.individuals['ind-1'].birthPlace

    resolveGedcomPlaces(original, placeNameToId)

    expect(original.individuals['ind-1'].birthPlace).toBe(originalBirthPlace)
  })

  it('handles empty place strings gracefully', () => {
    const data: GedcomData = {
      individuals: {
        'ind-1': makeIndividual({
          id: 'ind-1',
          birthPlace: '',
          deathPlace: '',
        }),
      },
      families: {},
    }
    const placeNameToId = new Map<string, string>()

    const result = resolveGedcomPlaces(data, placeNameToId)
    const ind = result.individuals['ind-1']

    expect(ind.birthPlace).toBe('')
    expect(ind.birthPlaceId).toBeUndefined()
  })
})

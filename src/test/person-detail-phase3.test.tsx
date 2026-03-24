import { describe, it, expect } from 'vitest'
import { parseGedcom } from '@/lib/gedcom/parser'
import type { Individual, Family, GedcomData, FamilyEvent } from '@/lib/gedcom/types'
import {
  formatDateWithPlace,
  getDeceasedLabel,
  needsFamilyPickerForAddChild,
  validateAddParent,
  canMoveChild,
  getAlternativeFamilies,
  buildEditInitialData,
  buildFamilyEventInitialData,
} from '@/lib/person-detail-helpers'

// ---------------------------------------------------------------------------
// Helper: create a minimal Individual for testing display logic
// ---------------------------------------------------------------------------
function makeIndividual(overrides: Partial<Individual> = {}): Individual {
  return {
    id: '@I1@',
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
    familyAsChild: null,
    ...overrides,
  }
}

function makeEmptyEvent(): FamilyEvent {
  return { date: '', hijriDate: '', place: '', description: '', notes: '' }
}

function makeFamily(overrides: Partial<Family> = {}): Family {
  return {
    id: '@F1@',
    type: 'FAM',
    husband: null,
    wife: null,
    children: [],
    marriageContract: makeEmptyEvent(),
    marriage: makeEmptyEvent(),
    divorce: makeEmptyEvent(),
    isDivorced: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PersonDetail Phase 3 – date/place display', () => {
  it('formats birth date with place', () => {
    expect(formatDateWithPlace('1950', 'مكة المكرمة')).toBe('1950 — مكة المكرمة')
  })

  it('formats date only when no place', () => {
    expect(formatDateWithPlace('1950', '')).toBe('1950')
  })

  it('formats place only when no date', () => {
    expect(formatDateWithPlace('', 'مكة المكرمة')).toBe('مكة المكرمة')
  })

  it('returns empty when both are empty', () => {
    expect(formatDateWithPlace('', '')).toBe('')
  })
})

describe('PersonDetail Phase 3 – isDeceased display', () => {
  it('returns male deceased label when isDeceased and no death date', () => {
    const person = makeIndividual({ isDeceased: true, sex: 'M', death: '' })
    expect(getDeceasedLabel(person)).toBe('متوفى')
  })

  it('returns female deceased label when isDeceased and no death date', () => {
    const person = makeIndividual({ isDeceased: true, sex: 'F', death: '' })
    expect(getDeceasedLabel(person)).toBe('متوفية')
  })

  it('returns null when not deceased', () => {
    const person = makeIndividual({ isDeceased: false })
    expect(getDeceasedLabel(person)).toBeNull()
  })

  it('returns null when deceased but has death date', () => {
    const person = makeIndividual({ isDeceased: true, death: '2020' })
    expect(getDeceasedLabel(person)).toBeNull()
  })
})

describe('PersonDetail Phase 3 – notes display', () => {
  it('person with notes should have notes shown', () => {
    const person = makeIndividual({ notes: 'ملاحظة اختبار' })
    expect(person.notes).toBe('ملاحظة اختبار')
    expect(person.notes.length > 0).toBe(true)
  })

  it('person without notes should not show notes section', () => {
    const person = makeIndividual({ notes: '' })
    expect(person.notes.length > 0).toBe(false)
  })
})

describe('PersonDetail Phase 3 – birthNotes / deathNotes display', () => {
  it('person with birthNotes should have birthNotes accessible', () => {
    const person = makeIndividual({ birthNotes: 'ولد في عاصفة ثلجية' })
    expect(person.birthNotes).toBe('ولد في عاصفة ثلجية')
  })

  it('person with deathNotes should have deathNotes accessible', () => {
    const person = makeIndividual({ deathNotes: 'توفي بسلام في منزله' })
    expect(person.deathNotes).toBe('توفي بسلام في منزله')
  })

  it('person without birthNotes has empty string', () => {
    const person = makeIndividual({})
    expect(person.birthNotes).toBe('')
  })

  it('person without deathNotes has empty string', () => {
    const person = makeIndividual({})
    expect(person.deathNotes).toBe('')
  })
})

describe('PersonDetail Phase 3 – birthDescription / deathDescription display', () => {
  it('person with birthDescription should have birthDescription accessible', () => {
    const person = makeIndividual({ birthDescription: 'ولادة طبيعية في المنزل' })
    expect(person.birthDescription).toBe('ولادة طبيعية في المنزل')
  })

  it('person with deathDescription should have deathDescription accessible', () => {
    const person = makeIndividual({ deathDescription: 'نوبة قلبية' })
    expect(person.deathDescription).toBe('نوبة قلبية')
  })

  it('person without birthDescription has empty string', () => {
    const person = makeIndividual({})
    expect(person.birthDescription).toBe('')
  })

  it('person without deathDescription has empty string', () => {
    const person = makeIndividual({})
    expect(person.deathDescription).toBe('')
  })
})

describe('PersonDetail Phase 3 – edit form pre-fill', () => {
  it('includes birthPlace, deathPlace, isDeceased, notes, birthNotes, deathNotes, birthDescription, deathDescription, and Hijri dates in initial data', () => {
    const person = makeIndividual({
      givenName: 'أحمد',
      surname: 'السعيد',
      sex: 'M',
      birth: '1950',
      birthPlace: 'مكة المكرمة',
      birthHijriDate: '5 رمضان 1370',
      death: '2020',
      deathPlace: 'المدينة المنورة',
      deathHijriDate: '15 محرم 1442',
      isDeceased: true,
      isPrivate: false,
      notes: 'ملاحظة',
      birthNotes: 'ملاحظة ميلاد',
      deathNotes: 'ملاحظة وفاة',
      birthDescription: 'وصف ميلاد',
      deathDescription: 'سبب وفاة',
    })
    const data = buildEditInitialData(person)
    expect(data).toEqual({
      givenName: 'أحمد',
      surname: 'السعيد',
      sex: 'M',
      birthDate: '1950',
      birthPlace: 'مكة المكرمة',
      birthDescription: 'وصف ميلاد',
      birthHijriDate: '5 رمضان 1370',
      deathDate: '2020',
      deathPlace: 'المدينة المنورة',
      deathDescription: 'سبب وفاة',
      deathHijriDate: '15 محرم 1442',
      isDeceased: true,
      isPrivate: false,
      notes: 'ملاحظة',
      birthNotes: 'ملاحظة ميلاد',
      deathNotes: 'ملاحظة وفاة',
    })
  })

  it('includes birthDescription and deathDescription in initial data', () => {
    const person = makeIndividual({
      givenName: 'أحمد',
      birthDescription: 'ولادة طبيعية في المنزل',
      deathDescription: 'نوبة قلبية',
    })
    const data = buildEditInitialData(person)
    expect(data).toMatchObject({
      birthDescription: 'ولادة طبيعية في المنزل',
      deathDescription: 'نوبة قلبية',
    })
  })

  it('includes Hijri dates in initial data', () => {
    const person = makeIndividual({
      birthHijriDate: '5 رمضان 1370',
      deathHijriDate: '15 محرم 1442',
    })
    const data = buildEditInitialData(person)
    expect(data).toMatchObject({
      birthHijriDate: '5 رمضان 1370',
      deathHijriDate: '15 محرم 1442',
    })
  })
})

describe('PersonDetail Phase 3 – family picker for add-child', () => {
  it('needs family picker when person has multiple families', () => {
    const person = makeIndividual({ familiesAsSpouse: ['@F1@', '@F2@'] })
    expect(needsFamilyPickerForAddChild(person)).toBe(true)
  })

  it('does not need family picker when person has one family', () => {
    const person = makeIndividual({ familiesAsSpouse: ['@F1@'] })
    expect(needsFamilyPickerForAddChild(person)).toBe(false)
  })

  it('does not need family picker when person has no families', () => {
    const person = makeIndividual({ familiesAsSpouse: [] })
    expect(needsFamilyPickerForAddChild(person)).toBe(false)
  })
})

describe('PersonDetail Phase 3 – add-parent validation', () => {
  it('allows adding parent when person has no familyAsChild', () => {
    const person = makeIndividual({ familyAsChild: null })
    const data: GedcomData = { individuals: {}, families: {} }
    expect(validateAddParent(person, data)).toEqual({ allowed: true })
  })

  it('blocks adding parent when both parents exist', () => {
    const data = parseGedcom(`
0 @I1@ INDI
1 NAME Father
1 SEX M
1 FAMS @F1@
0 @I2@ INDI
1 NAME Mother
1 SEX F
1 FAMS @F1@
0 @I3@ INDI
1 NAME Child
1 SEX M
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
`.trim())
    const person = data.individuals['@I3@']
    const result = validateAddParent(person, data)
    expect(result).toEqual({
      allowed: false,
      error: 'هذا الشخص لديه والدان بالفعل',
    })
  })

  it('locks sex to female when father exists but mother missing', () => {
    const data = parseGedcom(`
0 @I1@ INDI
1 NAME Father
1 SEX M
1 FAMS @F1@
0 @I3@ INDI
1 NAME Child
1 SEX M
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 CHIL @I3@
`.trim())
    const person = data.individuals['@I3@']
    const result = validateAddParent(person, data)
    expect(result).toEqual({ allowed: true, lockedSex: 'F' })
  })

  it('locks sex to male when mother exists but father missing', () => {
    const data = parseGedcom(`
0 @I2@ INDI
1 NAME Mother
1 SEX F
1 FAMS @F1@
0 @I3@ INDI
1 NAME Child
1 SEX M
1 FAMC @F1@
0 @F1@ FAM
1 WIFE @I2@
1 CHIL @I3@
`.trim())
    const person = data.individuals['@I3@']
    const result = validateAddParent(person, data)
    expect(result).toEqual({ allowed: true, lockedSex: 'M' })
  })
})

describe('PersonDetail Phase 3 – move child', () => {
  const POLYGAMOUS_GEDCOM = `
0 @I1@ INDI
1 NAME Father
1 SEX M
1 FAMS @F1@
1 FAMS @F2@
0 @I2@ INDI
1 NAME Wife1
1 SEX F
1 FAMS @F1@
0 @I3@ INDI
1 NAME Wife2
1 SEX F
1 FAMS @F2@
0 @I4@ INDI
1 NAME Child
1 SEX M
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I4@
0 @F2@ FAM
1 HUSB @I1@
1 WIFE @I3@
`.trim()

  it('canMoveChild returns true when parent has another family', () => {
    const data = parseGedcom(POLYGAMOUS_GEDCOM)
    const child = data.individuals['@I4@']
    expect(canMoveChild(child, data)).toBe(true)
  })

  it('canMoveChild returns false when no parent has another family', () => {
    const data = parseGedcom(`
0 @I1@ INDI
1 NAME Father
1 SEX M
1 FAMS @F1@
0 @I2@ INDI
1 NAME Mother
1 SEX F
1 FAMS @F1@
0 @I3@ INDI
1 NAME Child
1 SEX M
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
`.trim())
    const child = data.individuals['@I3@']
    expect(canMoveChild(child, data)).toBe(false)
  })

  it('canMoveChild returns false when person has no familyAsChild', () => {
    const data = parseGedcom(POLYGAMOUS_GEDCOM)
    const father = data.individuals['@I1@']
    expect(canMoveChild(father, data)).toBe(false)
  })

  it('getAlternativeFamilies returns the other family with spouse name', () => {
    const data = parseGedcom(POLYGAMOUS_GEDCOM)
    const child = data.individuals['@I4@']
    const alternatives = getAlternativeFamilies(child, data)
    expect(alternatives).toEqual([
      { familyId: '@F2@', spouseName: 'Wife2' },
    ])
  })

  it('getAlternativeFamilies returns empty when no familyAsChild', () => {
    const data = parseGedcom(POLYGAMOUS_GEDCOM)
    const father = data.individuals['@I1@']
    expect(getAlternativeFamilies(father, data)).toEqual([])
  })
})

describe('buildFamilyEventInitialData', () => {
  it('maps family marriage contract event to form data', () => {
    const family = makeFamily({
      marriageContract: { date: '2020', hijriDate: '1441', place: 'مكة', description: 'عقد', notes: 'ملاحظة' },
    })
    const data = buildFamilyEventInitialData(family)
    expect(data.marriageContractDate).toBe('2020')
    expect(data.marriageContractHijriDate).toBe('1441')
    expect(data.marriageContractPlace).toBe('مكة')
    expect(data.marriageContractDescription).toBe('عقد')
    expect(data.marriageContractNotes).toBe('ملاحظة')
  })

  it('maps family marriage event to form data', () => {
    const family = makeFamily({
      marriage: { date: '2021', hijriDate: '1442', place: 'جدة', description: 'زفاف', notes: 'ملاحظة زفاف' },
    })
    const data = buildFamilyEventInitialData(family)
    expect(data.marriageDate).toBe('2021')
    expect(data.marriageHijriDate).toBe('1442')
    expect(data.marriagePlace).toBe('جدة')
    expect(data.marriageDescription).toBe('زفاف')
    expect(data.marriageNotes).toBe('ملاحظة زفاف')
  })

  it('maps family divorce event to form data', () => {
    const family = makeFamily({
      isDivorced: true,
      divorce: { date: '2023', hijriDate: '1444', place: 'الرياض', description: 'طلاق', notes: 'ملاحظة طلاق' },
    })
    const data = buildFamilyEventInitialData(family)
    expect(data.isDivorced).toBe(true)
    expect(data.divorceDate).toBe('2023')
    expect(data.divorceHijriDate).toBe('1444')
    expect(data.divorcePlace).toBe('الرياض')
    expect(data.divorceDescription).toBe('طلاق')
    expect(data.divorceNotes).toBe('ملاحظة طلاق')
  })

  it('returns empty strings for family with no events', () => {
    const family = makeFamily()
    const data = buildFamilyEventInitialData(family)
    expect(data.marriageContractDate).toBe('')
    expect(data.marriageDate).toBe('')
    expect(data.divorceDate).toBe('')
    expect(data.isDivorced).toBe(false)
  })
})

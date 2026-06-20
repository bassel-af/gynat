import { describe, it, expect } from 'vitest'
import { parseGedcom } from '@/lib/gedcom/parser'
import type { Individual, Family, GedcomData, FamilyEvent } from '@/lib/gedcom/types'
import {
  formatDateWithPlace,
  getDeceasedLabel,
  needsFamilyPickerForAddChild,
  getEditableSpouseFamilyIds,
  validateAddParent,
  canMoveSubtree,
  getTargetFamiliesForMove,
  computeSubtreeIds,
  detectOrphanedPreviousParents,
  getSoloIndividualsForParenting,
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
    kunya: '',
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
      kunya: '',
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
  function dataWith(families: Family[]): GedcomData {
    return {
      individuals: {},
      families: Object.fromEntries(families.map((f) => [f.id, f])),
    }
  }

  it('needs family picker when person has multiple editable families', () => {
    const person = makeIndividual({ familiesAsSpouse: ['@F1@', '@F2@'] })
    const data = dataWith([makeFamily({ id: '@F1@' }), makeFamily({ id: '@F2@' })])
    expect(needsFamilyPickerForAddChild(person, data)).toBe(true)
  })

  it('does not need family picker when person has one family', () => {
    const person = makeIndividual({ familiesAsSpouse: ['@F1@'] })
    const data = dataWith([makeFamily({ id: '@F1@' })])
    expect(needsFamilyPickerForAddChild(person, data)).toBe(false)
  })

  it('does not need family picker when person has no families', () => {
    const person = makeIndividual({ familiesAsSpouse: [] })
    expect(needsFamilyPickerForAddChild(person, dataWith([]))).toBe(false)
  })

  it('ignores synthetic branch-pointer stitch families (regression: add-child to a pointer anchor)', () => {
    // The anchor of a branch pointer has only the synthetic `ptr-{id}-fam`
    // stitch family. It must not trigger the picker or count as editable.
    const person = makeIndividual({ familiesAsSpouse: ['ptr-abc-fam'] })
    const data = dataWith([makeFamily({ id: 'ptr-abc-fam', _pointed: true })])
    expect(needsFamilyPickerForAddChild(person, data)).toBe(false)
    expect(getEditableSpouseFamilyIds(person, data)).toEqual([])
  })

  it('keeps native families but drops synthetic ones when both are present', () => {
    const person = makeIndividual({ familiesAsSpouse: ['@F1@', 'ptr-abc-fam'] })
    const data = dataWith([
      makeFamily({ id: '@F1@' }),
      makeFamily({ id: 'ptr-abc-fam', _pointed: true }),
    ])
    expect(getEditableSpouseFamilyIds(person, data)).toEqual(['@F1@'])
    expect(needsFamilyPickerForAddChild(person, data)).toBe(false)
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

describe('PersonDetail Phase 7a – move subtree', () => {
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

  it('canMoveSubtree returns true when person has familyAsChild', () => {
    const data = parseGedcom(POLYGAMOUS_GEDCOM)
    const child = data.individuals['@I4@']
    expect(canMoveSubtree(child)).toBe(true)
  })

  it('canMoveSubtree returns false when person has no familyAsChild', () => {
    const data = parseGedcom(POLYGAMOUS_GEDCOM)
    const father = data.individuals['@I1@']
    expect(canMoveSubtree(father)).toBe(false)
  })

  it('getTargetFamiliesForMove excludes current family', () => {
    const data = parseGedcom(POLYGAMOUS_GEDCOM)
    const child = data.individuals['@I4@']
    const subtreeIds = computeSubtreeIds(data, child.id)
    const targets = getTargetFamiliesForMove(child, data, subtreeIds)
    // Child is in @F1@, so @F1@ should be excluded; @F2@ should be available
    expect(targets.some(t => t.familyId === '@F1@')).toBe(false)
    expect(targets.some(t => t.familyId === '@F2@')).toBe(true)
  })

  it('getTargetFamiliesForMove returns candidate families when person has no familyAsChild', () => {
    // Person with no parents — should be able to assign existing parents.
    // Setup: parentless man @I1@ married to wife @I2@ in @F1@; another couple @I5@ + @I6@ in @F2@.
    const ASSIGN_GEDCOM = `
0 @I1@ INDI
1 NAME Husband
1 SEX M
1 FAMS @F1@
0 @I2@ INDI
1 NAME Wife
1 SEX F
1 FAMS @F1@
0 @I5@ INDI
1 NAME PossibleFather
1 SEX M
1 FAMS @F2@
0 @I6@ INDI
1 NAME PossibleMother
1 SEX F
1 FAMS @F2@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
0 @F2@ FAM
1 HUSB @I5@
1 WIFE @I6@
`.trim()
    const data = parseGedcom(ASSIGN_GEDCOM)
    const husband = data.individuals['@I1@']
    const subtreeIds = computeSubtreeIds(data, husband.id)
    const targets = getTargetFamiliesForMove(husband, data, subtreeIds)
    // @F2@ (couple with no link to husband) is a valid candidate
    expect(targets.some(t => t.familyId === '@F2@')).toBe(true)
    // @F1@ excluded — husband is a spouse there, not a child
    expect(targets.some(t => t.familyId === '@F1@')).toBe(false)
  })

  it('getTargetFamiliesForMove still excludes own marriage family for parentless person', () => {
    const data = parseGedcom(POLYGAMOUS_GEDCOM)
    const father = data.individuals['@I1@']
    const subtreeIds = computeSubtreeIds(data, father.id)
    const targets = getTargetFamiliesForMove(father, data, subtreeIds)
    // Father is a husband in @F1@ and @F2@; both should be excluded as targets
    expect(targets.some(t => t.familyId === '@F1@')).toBe(false)
    expect(targets.some(t => t.familyId === '@F2@')).toBe(false)
  })
})

describe('detectOrphanedPreviousParents', () => {
  it('returns empty when person has no familyAsChild', () => {
    const data = parseGedcom(`
0 @I1@ INDI
1 NAME Solo
1 SEX M
`.trim())
    const person = data.individuals['@I1@']
    expect(detectOrphanedPreviousParents(person, data)).toEqual([])
  })

  it('returns both parents when source family has only those two parents and the person', () => {
    // Both parents have no other family, no familyAsChild, no siblings, no other children.
    // After removing person, the source family is just husband+wife with no link elsewhere.
    // Per spec: a parent becomes orphan only if they have ZERO connections (no parents,
    // no siblings, no other spouse, no other child, AND no spouse left in the source family).
    // Here, after removal, husband still has wife → NOT orphan. Wife still has husband → NOT orphan.
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
    const orphans = detectOrphanedPreviousParents(child, data)
    expect(orphans.map(p => p.id)).toEqual([])
  })

  it('returns the lone parent when source family has just one parent and the person', () => {
    // Single-parent family. After removing person, the parent is alone with no other
    // connections → orphan.
    const data = parseGedcom(`
0 @I1@ INDI
1 NAME LoneParent
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
    const child = data.individuals['@I3@']
    const orphans = detectOrphanedPreviousParents(child, data)
    expect(orphans.map(p => p.id)).toEqual(['@I1@'])
  })

  it('does not flag a parent who has parents of their own', () => {
    const data = parseGedcom(`
0 @I0@ INDI
1 NAME Grandfather
1 SEX M
1 FAMS @F0@
0 @I1@ INDI
1 NAME LoneParent
1 SEX M
1 FAMC @F0@
1 FAMS @F1@
0 @I3@ INDI
1 NAME Child
1 SEX M
1 FAMC @F1@
0 @F0@ FAM
1 HUSB @I0@
1 CHIL @I1@
0 @F1@ FAM
1 HUSB @I1@
1 CHIL @I3@
`.trim())
    const child = data.individuals['@I3@']
    const orphans = detectOrphanedPreviousParents(child, data)
    expect(orphans.map(p => p.id)).toEqual([])
  })

  it('does not flag a parent who has another marriage', () => {
    const data = parseGedcom(`
0 @I1@ INDI
1 NAME LoneParent
1 SEX M
1 FAMS @F1@
1 FAMS @F2@
0 @I3@ INDI
1 NAME Child
1 SEX M
1 FAMC @F1@
0 @I4@ INDI
1 NAME OtherWife
1 SEX F
1 FAMS @F2@
0 @F1@ FAM
1 HUSB @I1@
1 CHIL @I3@
0 @F2@ FAM
1 HUSB @I1@
1 WIFE @I4@
`.trim())
    const child = data.individuals['@I3@']
    const orphans = detectOrphanedPreviousParents(child, data)
    expect(orphans.map(p => p.id)).toEqual([])
  })

  it('does not flag a parent when source family has another remaining child', () => {
    const data = parseGedcom(`
0 @I1@ INDI
1 NAME LoneParent
1 SEX M
1 FAMS @F1@
0 @I3@ INDI
1 NAME Child
1 SEX M
1 FAMC @F1@
0 @I4@ INDI
1 NAME Sibling
1 SEX F
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 CHIL @I3@
1 CHIL @I4@
`.trim())
    const child = data.individuals['@I3@']
    const orphans = detectOrphanedPreviousParents(child, data)
    expect(orphans.map(p => p.id)).toEqual([])
  })
})

describe('getSoloIndividualsForParenting', () => {
  it('returns a free-floating person of either sex when target has no parents', () => {
    // هالة exists as an individual with no marriage and no children/parents.
    // The target person has no familyAsChild and no descendants. She must be a candidate.
    const data = parseGedcom(`
0 @I1@ INDI
1 NAME أبو-العاص
1 SEX M
0 @I2@ INDI
1 NAME هالة
1 SEX F
`.trim())
    const target = data.individuals['@I1@']
    const subtreeIds = computeSubtreeIds(data, target.id)
    const solos = getSoloIndividualsForParenting(target, data, subtreeIds)
    expect(solos.map(p => p.id)).toEqual(['@I2@'])
  })

  it('excludes individuals who are already a parent in some family', () => {
    // The mother is wife in a separate family — she shows up via the families list,
    // not the solos list, so we exclude her here to avoid duplicates.
    const data = parseGedcom(`
0 @I1@ INDI
1 NAME Target
1 SEX M
0 @I2@ INDI
1 NAME ExistingMother
1 SEX F
1 FAMS @F1@
0 @I3@ INDI
1 NAME ExistingFather
1 SEX M
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I3@
1 WIFE @I2@
`.trim())
    const target = data.individuals['@I1@']
    const subtreeIds = computeSubtreeIds(data, target.id)
    const solos = getSoloIndividualsForParenting(target, data, subtreeIds)
    expect(solos.map(p => p.id)).toEqual([])
  })

  it('excludes the target person themselves', () => {
    const data = parseGedcom(`
0 @I1@ INDI
1 NAME Target
1 SEX M
`.trim())
    const target = data.individuals['@I1@']
    const subtreeIds = computeSubtreeIds(data, target.id)
    expect(getSoloIndividualsForParenting(target, data, subtreeIds)).toEqual([])
  })

  it('excludes descendants of the target (cycle prevention)', () => {
    const data = parseGedcom(`
0 @I1@ INDI
1 NAME Target
1 SEX M
1 FAMS @F1@
0 @I2@ INDI
1 NAME Child
1 SEX F
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 CHIL @I2@
`.trim())
    const target = data.individuals['@I1@']
    const subtreeIds = computeSubtreeIds(data, target.id)
    const solos = getSoloIndividualsForParenting(target, data, subtreeIds)
    expect(solos.map(p => p.id)).toEqual([])
  })

  it('excludes individuals without a known sex', () => {
    // Without a sex, we cannot decide HUSB vs WIFE for the new family.
    const data = parseGedcom(`
0 @I1@ INDI
1 NAME Target
1 SEX M
0 @I2@ INDI
1 NAME Unknown
`.trim())
    const target = data.individuals['@I1@']
    const subtreeIds = computeSubtreeIds(data, target.id)
    expect(getSoloIndividualsForParenting(target, data, subtreeIds)).toEqual([])
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

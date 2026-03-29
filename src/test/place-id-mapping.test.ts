import { describe, it, expect } from 'vitest'
import { dbTreeToGedcomData, redactPrivateIndividuals } from '@/lib/tree/mapper'
import type { DbTree, DbIndividual, DbFamily } from '@/lib/tree/mapper'

// ---------------------------------------------------------------------------
// Helpers — build minimal DB-shaped objects
// ---------------------------------------------------------------------------

function makeIndividual(overrides: Partial<DbIndividual> & { id: string; treeId: string }): DbIndividual {
  return {
    gedcomId: null,
    givenName: null,
    surname: null,
    fullName: null,
    sex: null,
    birthDate: null,
    birthPlace: null,
    birthPlaceId: null,
    birthNotes: null,
    birthDescription: null,
    birthHijriDate: null,
    deathDate: null,
    deathPlace: null,
    deathPlaceId: null,
    deathNotes: null,
    deathDescription: null,
    deathHijriDate: null,
    notes: null,
    isDeceased: false,
    isPrivate: false,
    createdById: null,
    updatedAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  }
}

function makeFamily(overrides: Partial<DbFamily> & { id: string; treeId: string }): DbFamily {
  return {
    gedcomId: null,
    husbandId: null,
    wifeId: null,
    children: [],
    marriageContractDate: null,
    marriageContractHijriDate: null,
    marriageContractPlace: null,
    marriageContractPlaceId: null,
    marriageContractDescription: null,
    marriageContractNotes: null,
    marriageDate: null,
    marriageHijriDate: null,
    marriagePlace: null,
    marriagePlaceId: null,
    marriageDescription: null,
    marriageNotes: null,
    isUmmWalad: false,
    isDivorced: false,
    divorceDate: null,
    divorceHijriDate: null,
    divorcePlace: null,
    divorcePlaceId: null,
    divorceDescription: null,
    divorceNotes: null,
    ...overrides,
  }
}

const TREE_ID = 'tree-001'
const WORKSPACE_ID = 'ws-001'

// ---------------------------------------------------------------------------
// Tests: Individual placeId mapping
// ---------------------------------------------------------------------------

describe('dbTreeToGedcomData — placeId fields', () => {
  it('maps birthPlaceId and deathPlaceId from DB individual to GedcomData', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
          givenName: 'Ahmad',
          birthPlace: 'مكة المكرمة',
          birthPlaceId: 'place-uuid-1',
          deathPlace: 'المدينة المنورة',
          deathPlaceId: 'place-uuid-2',
        }),
      ],
      families: [],
    }

    const result = dbTreeToGedcomData(dbTree)
    const ind = result.individuals['ind-1']

    expect(ind.birthPlaceId).toBe('place-uuid-1')
    expect(ind.deathPlaceId).toBe('place-uuid-2')
    expect(ind.birthPlace).toBe('مكة المكرمة')
    expect(ind.deathPlace).toBe('المدينة المنورة')
  })

  it('maps null placeIds as undefined on GedcomData individual', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
          givenName: 'Omar',
          birthPlace: 'الرياض',
          birthPlaceId: null,
          deathPlaceId: null,
        }),
      ],
      families: [],
    }

    const result = dbTreeToGedcomData(dbTree)
    const ind = result.individuals['ind-1']

    expect(ind.birthPlaceId).toBeUndefined()
    expect(ind.deathPlaceId).toBeUndefined()
    expect(ind.birthPlace).toBe('الرياض')
  })

  it('maps birthPlaceId with Place relation name lookup when birthPlace string is empty', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
          givenName: 'Sara',
          birthPlace: null,
          birthPlaceId: 'place-uuid-1',
          birthPlaceRef: { id: 'place-uuid-1', nameAr: 'مكة المكرمة' },
        }),
      ],
      families: [],
    }

    const result = dbTreeToGedcomData(dbTree)
    const ind = result.individuals['ind-1']

    expect(ind.birthPlaceId).toBe('place-uuid-1')
    // Should resolve name from the Place relation when string field is empty
    expect(ind.birthPlace).toBe('مكة المكرمة')
  })
})

// ---------------------------------------------------------------------------
// Tests: Family placeId mapping
// ---------------------------------------------------------------------------

describe('dbTreeToGedcomData — family placeId fields', () => {
  it('maps marriageContractPlaceId, marriagePlaceId, divorcePlaceId on FamilyEvent', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({ id: 'h-1', treeId: TREE_ID, givenName: 'Ahmad', sex: 'M' }),
        makeIndividual({ id: 'w-1', treeId: TREE_ID, givenName: 'Sara', sex: 'F' }),
      ],
      families: [
        makeFamily({
          id: 'fam-1',
          treeId: TREE_ID,
          husbandId: 'h-1',
          wifeId: 'w-1',
          marriageContractPlace: 'مكة',
          marriageContractPlaceId: 'place-marc-1',
          marriagePlace: 'جدة',
          marriagePlaceId: 'place-marr-1',
          isDivorced: true,
          divorcePlace: 'الرياض',
          divorcePlaceId: 'place-div-1',
        }),
      ],
    }

    const result = dbTreeToGedcomData(dbTree)
    const fam = result.families['fam-1']

    expect(fam.marriageContract.placeId).toBe('place-marc-1')
    expect(fam.marriageContract.place).toBe('مكة')
    expect(fam.marriage.placeId).toBe('place-marr-1')
    expect(fam.marriage.place).toBe('جدة')
    expect(fam.divorce.placeId).toBe('place-div-1')
    expect(fam.divorce.place).toBe('الرياض')
  })

  it('maps null family placeIds as undefined on FamilyEvent', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [],
      families: [
        makeFamily({
          id: 'fam-1',
          treeId: TREE_ID,
          marriageContractPlaceId: null,
          marriagePlaceId: null,
          divorcePlaceId: null,
        }),
      ],
    }

    const result = dbTreeToGedcomData(dbTree)
    const fam = result.families['fam-1']

    expect(fam.marriageContract.placeId).toBeUndefined()
    expect(fam.marriage.placeId).toBeUndefined()
    expect(fam.divorce.placeId).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Tests: Privacy redaction should clear placeId
// ---------------------------------------------------------------------------

describe('redactPrivateIndividuals — placeId fields', () => {
  it('clears birthPlaceId and deathPlaceId for private individuals', () => {
    const data = dbTreeToGedcomData({
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
          givenName: 'Private',
          isPrivate: true,
          birthPlace: 'مكة',
          birthPlaceId: 'place-uuid-1',
          deathPlace: 'جدة',
          deathPlaceId: 'place-uuid-2',
        }),
      ],
      families: [],
    })

    const redacted = redactPrivateIndividuals(data)
    const ind = redacted.individuals['ind-1']

    expect(ind.birthPlaceId).toBeUndefined()
    expect(ind.deathPlaceId).toBeUndefined()
    expect(ind.birthPlace).toBe('')
    expect(ind.deathPlace).toBe('')
  })

  it('preserves placeId for non-private individuals', () => {
    const data = dbTreeToGedcomData({
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
          givenName: 'Public',
          isPrivate: false,
          birthPlaceId: 'place-uuid-1',
          deathPlaceId: 'place-uuid-2',
        }),
      ],
      families: [],
    })

    const redacted = redactPrivateIndividuals(data)
    const ind = redacted.individuals['ind-1']

    expect(ind.birthPlaceId).toBe('place-uuid-1')
    expect(ind.deathPlaceId).toBe('place-uuid-2')
  })
})

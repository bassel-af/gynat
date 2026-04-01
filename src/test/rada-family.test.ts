import { describe, it, expect } from 'vitest'
import { dbTreeToGedcomData, redactPrivateIndividuals, mapRadaFamily } from '@/lib/tree/mapper'
import type { DbTree, DbIndividual, DbFamily, DbRadaFamily } from '@/lib/tree/mapper'
import type { GedcomData, RadaFamily } from '@/lib/gedcom/types'
import { getRadaRelationships } from '@/lib/gedcom/relationships'

// ---------------------------------------------------------------------------
// Helpers
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
// Helper: build GedcomData with rada'a for relationship tests
// ---------------------------------------------------------------------------

function makeGedcomDataWithRada(): GedcomData {
  // Scenario:
  //   - fatherA + motherA (biological family FAM-1) have childA
  //   - fosterFather + fosterMother (rada family RF-1) with fosterChild + childA as rada children
  //   - fosterMother has biological family FAM-2 with bioChild
  //   (bioChild should appear as rada sibling of childA)
  return {
    individuals: {
      'father-a': {
        id: 'father-a', type: 'INDI', name: 'Father A', givenName: 'Father', surname: 'A',
        sex: 'M', birth: '', birthPlace: '', birthDescription: '', birthNotes: '',
        birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '',
        deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
        familiesAsSpouse: ['fam-1'], familyAsChild: null,
      },
      'mother-a': {
        id: 'mother-a', type: 'INDI', name: 'Mother A', givenName: 'Mother', surname: 'A',
        sex: 'F', birth: '', birthPlace: '', birthDescription: '', birthNotes: '',
        birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '',
        deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
        familiesAsSpouse: ['fam-1'], familyAsChild: null,
      },
      'child-a': {
        id: 'child-a', type: 'INDI', name: 'Child A', givenName: 'Child', surname: 'A',
        sex: 'M', birth: '', birthPlace: '', birthDescription: '', birthNotes: '',
        birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '',
        deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
        familiesAsSpouse: [], familyAsChild: 'fam-1',
        radaFamiliesAsChild: ['rf-1'],
      },
      'foster-father': {
        id: 'foster-father', type: 'INDI', name: 'Foster Father', givenName: 'Foster', surname: 'Father',
        sex: 'M', birth: '', birthPlace: '', birthDescription: '', birthNotes: '',
        birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '',
        deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
        familiesAsSpouse: [], familyAsChild: null,
      },
      'foster-mother': {
        id: 'foster-mother', type: 'INDI', name: 'Foster Mother', givenName: 'Foster', surname: 'Mother',
        sex: 'F', birth: '', birthPlace: '', birthDescription: '', birthNotes: '',
        birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '',
        deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
        familiesAsSpouse: ['fam-2'], familyAsChild: null,
      },
      'foster-child': {
        id: 'foster-child', type: 'INDI', name: 'Foster Child', givenName: 'Foster', surname: 'Child',
        sex: 'M', birth: '', birthPlace: '', birthDescription: '', birthNotes: '',
        birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '',
        deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
        familiesAsSpouse: [], familyAsChild: null,
        radaFamiliesAsChild: ['rf-1'],
      },
      'bio-child': {
        id: 'bio-child', type: 'INDI', name: 'Bio Child', givenName: 'Bio', surname: 'Child',
        sex: 'F', birth: '', birthPlace: '', birthDescription: '', birthNotes: '',
        birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '',
        deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
        familiesAsSpouse: [], familyAsChild: 'fam-2',
      },
    },
    families: {
      'fam-1': {
        id: 'fam-1', type: 'FAM', husband: 'father-a', wife: 'mother-a', children: ['child-a'],
        marriageContract: { date: '', hijriDate: '', place: '', description: '', notes: '' },
        marriage: { date: '', hijriDate: '', place: '', description: '', notes: '' },
        divorce: { date: '', hijriDate: '', place: '', description: '', notes: '' },
        isDivorced: false,
      },
      'fam-2': {
        id: 'fam-2', type: 'FAM', husband: null, wife: 'foster-mother', children: ['bio-child'],
        marriageContract: { date: '', hijriDate: '', place: '', description: '', notes: '' },
        marriage: { date: '', hijriDate: '', place: '', description: '', notes: '' },
        divorce: { date: '', hijriDate: '', place: '', description: '', notes: '' },
        isDivorced: false,
      },
    },
    radaFamilies: {
      'rf-1': {
        id: 'rf-1', type: '_RADA_FAM',
        fosterFather: 'foster-father', fosterMother: 'foster-mother',
        children: ['child-a', 'foster-child'],
        notes: '',
      },
    },
  }
}

// ===========================================================================
// A2: mapRadaFamily
// ===========================================================================

describe('mapRadaFamily', () => {
  it('maps a DB rada family record to RadaFamily type', () => {
    const dbRadaFamily: DbRadaFamily = {
      id: 'rf-1',
      treeId: TREE_ID,
      gedcomId: '_RADA_FAM_1',
      fosterFatherId: 'ind-1',
      fosterMotherId: 'ind-2',
      notes: 'Test notes',
      createdAt: new Date(),
      children: [
        { radaFamilyId: 'rf-1', individualId: 'ind-3' },
        { radaFamilyId: 'rf-1', individualId: 'ind-4' },
      ],
    }

    const result = mapRadaFamily(dbRadaFamily)

    expect(result).toEqual({
      id: 'rf-1',
      type: '_RADA_FAM',
      fosterFather: 'ind-1',
      fosterMother: 'ind-2',
      children: ['ind-3', 'ind-4'],
      notes: 'Test notes',
    })
  })

  it('maps null foster parents to null', () => {
    const dbRadaFamily: DbRadaFamily = {
      id: 'rf-2',
      treeId: TREE_ID,
      gedcomId: null,
      fosterFatherId: null,
      fosterMotherId: null,
      notes: null,
      createdAt: new Date(),
      children: [],
    }

    const result = mapRadaFamily(dbRadaFamily)

    expect(result).toEqual({
      id: 'rf-2',
      type: '_RADA_FAM',
      fosterFather: null,
      fosterMother: null,
      children: [],
      notes: '',
    })
  })
})

// ===========================================================================
// A3: dbTreeToGedcomData with rada'a
// ===========================================================================

describe('dbTreeToGedcomData with rada families', () => {
  it('includes radaFamilies when present in DB tree', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({ id: 'ind-1', treeId: TREE_ID, givenName: 'Foster Father', sex: 'M' }),
        makeIndividual({ id: 'ind-2', treeId: TREE_ID, givenName: 'Foster Mother', sex: 'F' }),
        makeIndividual({ id: 'ind-3', treeId: TREE_ID, givenName: 'Rada Child', sex: 'M' }),
      ],
      families: [],
      radaFamilies: [
        {
          id: 'rf-1',
          treeId: TREE_ID,
          gedcomId: null,
          fosterFatherId: 'ind-1',
          fosterMotherId: 'ind-2',
          notes: null,
          createdAt: new Date(),
          children: [{ radaFamilyId: 'rf-1', individualId: 'ind-3' }],
        },
      ],
    }

    const result = dbTreeToGedcomData(dbTree)

    expect(result.radaFamilies).toBeDefined()
    expect(result.radaFamilies!['rf-1']).toEqual({
      id: 'rf-1',
      type: '_RADA_FAM',
      fosterFather: 'ind-1',
      fosterMother: 'ind-2',
      children: ['ind-3'],
      notes: '',
    })
  })

  it('populates radaFamiliesAsChild on individuals', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({ id: 'ind-1', treeId: TREE_ID, givenName: 'Foster Mother', sex: 'F' }),
        makeIndividual({ id: 'ind-2', treeId: TREE_ID, givenName: 'Child 1' }),
        makeIndividual({ id: 'ind-3', treeId: TREE_ID, givenName: 'Child 2' }),
      ],
      families: [],
      radaFamilies: [
        {
          id: 'rf-1',
          treeId: TREE_ID,
          gedcomId: null,
          fosterFatherId: null,
          fosterMotherId: 'ind-1',
          notes: null,
          createdAt: new Date(),
          children: [
            { radaFamilyId: 'rf-1', individualId: 'ind-2' },
            { radaFamilyId: 'rf-1', individualId: 'ind-3' },
          ],
        },
      ],
    }

    const result = dbTreeToGedcomData(dbTree)

    expect(result.individuals['ind-2'].radaFamiliesAsChild).toEqual(['rf-1'])
    expect(result.individuals['ind-3'].radaFamiliesAsChild).toEqual(['rf-1'])
    // Foster mother should NOT have radaFamiliesAsChild
    expect(result.individuals['ind-1'].radaFamiliesAsChild).toBeUndefined()
  })

  it('works without rada families (backwards compatible)', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({ id: 'ind-1', treeId: TREE_ID, givenName: 'Solo' }),
      ],
      families: [],
    }

    const result = dbTreeToGedcomData(dbTree)

    // Should not have radaFamilies when none present
    expect(result.radaFamilies).toBeUndefined()
    expect(result.individuals['ind-1'].radaFamiliesAsChild).toBeUndefined()
  })

  it('handles individual in multiple rada families', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({ id: 'ind-1', treeId: TREE_ID, givenName: 'Multi Rada Child' }),
        makeIndividual({ id: 'ind-2', treeId: TREE_ID, givenName: 'Mother 1', sex: 'F' }),
        makeIndividual({ id: 'ind-3', treeId: TREE_ID, givenName: 'Mother 2', sex: 'F' }),
      ],
      families: [],
      radaFamilies: [
        {
          id: 'rf-1',
          treeId: TREE_ID,
          gedcomId: null,
          fosterFatherId: null,
          fosterMotherId: 'ind-2',
          notes: null,
          createdAt: new Date(),
          children: [{ radaFamilyId: 'rf-1', individualId: 'ind-1' }],
        },
        {
          id: 'rf-2',
          treeId: TREE_ID,
          gedcomId: null,
          fosterFatherId: null,
          fosterMotherId: 'ind-3',
          notes: null,
          createdAt: new Date(),
          children: [{ radaFamilyId: 'rf-2', individualId: 'ind-1' }],
        },
      ],
    }

    const result = dbTreeToGedcomData(dbTree)

    expect(result.individuals['ind-1'].radaFamiliesAsChild).toEqual(['rf-1', 'rf-2'])
  })
})

// ===========================================================================
// Privacy passthrough
// ===========================================================================

describe('redactPrivateIndividuals with rada families', () => {
  it('preserves radaFamilies in redacted output', () => {
    const data: GedcomData = {
      individuals: {
        'ind-1': {
          id: 'ind-1', type: 'INDI', name: 'Public', givenName: 'Public', surname: '',
          sex: 'M', birth: '', birthPlace: '', birthDescription: '', birthNotes: '',
          birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '',
          deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
          familiesAsSpouse: [], familyAsChild: null,
          radaFamiliesAsChild: ['rf-1'],
        },
        'ind-2': {
          id: 'ind-2', type: 'INDI', name: 'Private Person', givenName: 'Private', surname: 'Person',
          sex: 'F', birth: '1990', birthPlace: 'City', birthDescription: 'desc', birthNotes: 'notes',
          birthHijriDate: '1410', death: '', deathPlace: '', deathDescription: '', deathNotes: '',
          deathHijriDate: '', notes: 'secret', isDeceased: false, isPrivate: true,
          familiesAsSpouse: [], familyAsChild: null,
        },
      },
      families: {},
      radaFamilies: {
        'rf-1': {
          id: 'rf-1', type: '_RADA_FAM',
          fosterFather: null, fosterMother: 'ind-2',
          children: ['ind-1'],
          notes: 'Foster notes',
        },
      },
    }

    const result = redactPrivateIndividuals(data)

    // radaFamilies should pass through unchanged
    expect(result.radaFamilies).toEqual(data.radaFamilies)
    // Private individual is still redacted
    expect(result.individuals['ind-2'].name).toBe('خاص')
    // radaFamiliesAsChild preserved on public individual
    expect(result.individuals['ind-1'].radaFamiliesAsChild).toEqual(['rf-1'])
  })
})

// ===========================================================================
// A7: getRadaRelationships
// ===========================================================================

describe('getRadaRelationships', () => {
  it('returns foster parents for a rada child', () => {
    const data = makeGedcomDataWithRada()
    const rel = getRadaRelationships(data, 'child-a')

    expect(rel.radaParents.map(p => p.id)).toEqual(
      expect.arrayContaining(['foster-father', 'foster-mother'])
    )
    expect(rel.radaParents).toHaveLength(2)
  })

  it('returns rada siblings (other children in same rada family)', () => {
    const data = makeGedcomDataWithRada()
    const rel = getRadaRelationships(data, 'child-a')

    // foster-child is in the same rada family
    expect(rel.radaSiblings.map(p => p.id)).toContain('foster-child')
  })

  it('includes foster mother biological children as rada siblings', () => {
    const data = makeGedcomDataWithRada()
    const rel = getRadaRelationships(data, 'child-a')

    // bio-child is foster-mother's biological child → rada sibling
    expect(rel.radaSiblings.map(p => p.id)).toContain('bio-child')
  })

  it('excludes self from rada siblings', () => {
    const data = makeGedcomDataWithRada()
    const rel = getRadaRelationships(data, 'child-a')

    expect(rel.radaSiblings.map(p => p.id)).not.toContain('child-a')
  })

  it('returns rada children for foster parent', () => {
    const data = makeGedcomDataWithRada()
    const rel = getRadaRelationships(data, 'foster-mother')

    expect(rel.radaChildren.map(p => p.id)).toEqual(
      expect.arrayContaining(['child-a', 'foster-child'])
    )
    expect(rel.radaChildren).toHaveLength(2)
  })

  it('returns empty results for person with no rada relationships', () => {
    const data = makeGedcomDataWithRada()
    const rel = getRadaRelationships(data, 'father-a')

    expect(rel.radaParents).toEqual([])
    expect(rel.radaSiblings).toEqual([])
    expect(rel.radaChildren).toEqual([])
  })

  it('returns empty results when no radaFamilies exist', () => {
    const data: GedcomData = {
      individuals: {
        'ind-1': {
          id: 'ind-1', type: 'INDI', name: 'Solo', givenName: 'Solo', surname: '',
          sex: 'M', birth: '', birthPlace: '', birthDescription: '', birthNotes: '',
          birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '',
          deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
          familiesAsSpouse: [], familyAsChild: null,
        },
      },
      families: {},
    }

    const rel = getRadaRelationships(data, 'ind-1')

    expect(rel.radaParents).toEqual([])
    expect(rel.radaSiblings).toEqual([])
    expect(rel.radaChildren).toEqual([])
  })

  it('returns empty results for nonexistent person', () => {
    const data = makeGedcomDataWithRada()
    const rel = getRadaRelationships(data, 'nonexistent')

    expect(rel.radaParents).toEqual([])
    expect(rel.radaSiblings).toEqual([])
    expect(rel.radaChildren).toEqual([])
  })

  it('combines relationships from multiple rada families', () => {
    const data = makeGedcomDataWithRada()

    // Add a second rada family where child-a is also a rada child
    data.radaFamilies!['rf-2'] = {
      id: 'rf-2', type: '_RADA_FAM',
      fosterFather: null, fosterMother: 'mother-a',
      children: ['child-a'],
      notes: '',
    }
    data.individuals['child-a'].radaFamiliesAsChild = ['rf-1', 'rf-2']

    const rel = getRadaRelationships(data, 'child-a')

    // Should have parents from both rada families (no duplicates)
    expect(rel.radaParents.map(p => p.id)).toContain('foster-father')
    expect(rel.radaParents.map(p => p.id)).toContain('foster-mother')
    expect(rel.radaParents.map(p => p.id)).toContain('mother-a')
  })

  it('derives cross-rada-family siblings via shared foster mother', () => {
    // Woman W is foster mother in two separate rada families:
    //   RF-A: fosterMother = W, children = [X]
    //   RF-B: fosterMother = W, children = [Y]
    // X and Y should be rada siblings.
    const W: GedcomData['individuals'][string] = {
      id: 'woman-w', type: 'INDI', name: 'Woman W', givenName: 'Woman', surname: 'W',
      sex: 'F', birth: '', birthPlace: '', birthDescription: '', birthNotes: '',
      birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '',
      deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
      familiesAsSpouse: [], familyAsChild: null,
    }
    const X: GedcomData['individuals'][string] = {
      id: 'child-x', type: 'INDI', name: 'Child X', givenName: 'Child', surname: 'X',
      sex: 'M', birth: '', birthPlace: '', birthDescription: '', birthNotes: '',
      birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '',
      deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
      familiesAsSpouse: [], familyAsChild: null,
      radaFamiliesAsChild: ['rf-a'],
    }
    const Y: GedcomData['individuals'][string] = {
      id: 'child-y', type: 'INDI', name: 'Child Y', givenName: 'Child', surname: 'Y',
      sex: 'F', birth: '', birthPlace: '', birthDescription: '', birthNotes: '',
      birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '',
      deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
      familiesAsSpouse: [], familyAsChild: null,
      radaFamiliesAsChild: ['rf-b'],
    }

    const data: GedcomData = {
      individuals: {
        'woman-w': W,
        'child-x': X,
        'child-y': Y,
      },
      families: {},
      radaFamilies: {
        'rf-a': {
          id: 'rf-a', type: '_RADA_FAM',
          fosterFather: null, fosterMother: 'woman-w',
          children: ['child-x'],
          notes: '',
        },
        'rf-b': {
          id: 'rf-b', type: '_RADA_FAM',
          fosterFather: null, fosterMother: 'woman-w',
          children: ['child-y'],
          notes: '',
        },
      },
    }

    const relX = getRadaRelationships(data, 'child-x')
    const relY = getRadaRelationships(data, 'child-y')

    // X should see Y as a rada sibling (via shared foster mother)
    expect(relX.radaSiblings.map(p => p.id)).toContain('child-y')
    // Y should see X as a rada sibling (via shared foster mother)
    expect(relY.radaSiblings.map(p => p.id)).toContain('child-x')
  })

  it('excludes private individuals from rada relationships', () => {
    const data = makeGedcomDataWithRada()
    // Make foster-child private
    data.individuals['foster-child'].isPrivate = true

    const rel = getRadaRelationships(data, 'child-a')

    expect(rel.radaSiblings.map(p => p.id)).not.toContain('foster-child')
  })
})

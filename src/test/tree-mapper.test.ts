import { describe, it, expect } from 'vitest'
import { dbTreeToGedcomData, redactPrivateIndividuals } from '@/lib/tree/mapper'
import type { GedcomData } from '@/lib/gedcom/types'

// ---------------------------------------------------------------------------
// Helper: build minimal DB-shaped objects that mirror Prisma query results
// with `include: { individuals, families: { include: { children: true } } }`
// ---------------------------------------------------------------------------

interface DbIndividual {
  id: string
  treeId: string
  gedcomId: string | null
  givenName: string | null
  surname: string | null
  fullName: string | null
  sex: string | null
  birthDate: string | null
  birthPlace: string | null
  birthNotes: string | null
  birthDescription: string | null
  birthHijriDate: string | null
  deathDate: string | null
  deathPlace: string | null
  deathNotes: string | null
  deathDescription: string | null
  deathHijriDate: string | null
  notes: string | null
  isDeceased: boolean
  isPrivate: boolean
  createdById: string | null
  updatedAt: Date
  createdAt: Date
}

interface DbFamilyChild {
  familyId: string
  individualId: string
}

interface DbFamily {
  id: string
  treeId: string
  gedcomId: string | null
  husbandId: string | null
  wifeId: string | null
  children: DbFamilyChild[]
  // Marriage contract
  marriageContractDate: string | null
  marriageContractHijriDate: string | null
  marriageContractPlace: string | null
  marriageContractDescription: string | null
  marriageContractNotes: string | null
  // Marriage
  marriageDate: string | null
  marriageHijriDate: string | null
  marriagePlace: string | null
  marriageDescription: string | null
  marriageNotes: string | null
  // Divorce
  isDivorced: boolean
  divorceDate: string | null
  divorceHijriDate: string | null
  divorcePlace: string | null
  divorceDescription: string | null
  divorceNotes: string | null
}

interface DbTree {
  id: string
  workspaceId: string
  individuals: DbIndividual[]
  families: DbFamily[]
}

function makeIndividual(overrides: Partial<DbIndividual> & { id: string; treeId: string }): DbIndividual {
  return {
    gedcomId: null,
    givenName: null,
    surname: null,
    fullName: null,
    sex: null,
    birthDate: null,
    birthPlace: null,
    birthNotes: null,
    birthDescription: null,
    birthHijriDate: null,
    deathDate: null,
    deathPlace: null,
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
    marriageContractDescription: null,
    marriageContractNotes: null,
    marriageDate: null,
    marriageHijriDate: null,
    marriagePlace: null,
    marriageDescription: null,
    marriageNotes: null,
    isDivorced: false,
    divorceDate: null,
    divorceHijriDate: null,
    divorcePlace: null,
    divorceDescription: null,
    divorceNotes: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dbTreeToGedcomData', () => {
  const TREE_ID = 'tree-001'
  const WORKSPACE_ID = 'ws-001'

  it('returns empty GedcomData for a tree with no individuals and no families', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [],
      families: [],
    }

    const result: GedcomData = dbTreeToGedcomData(dbTree)

    expect(result.individuals).toEqual({})
    expect(result.families).toEqual({})
  })

  it('maps a single individual with all fields', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
          givenName: 'Ahmad',
          surname: 'Saeed',
          sex: 'M',
          birthDate: '1950',
          birthPlace: 'Mecca',
          deathDate: '2020',
          deathPlace: 'Jeddah',
          isDeceased: true,
          isPrivate: false,
        }),
      ],
      families: [],
    }

    const result = dbTreeToGedcomData(dbTree)
    const ind = result.individuals['ind-1']

    expect(ind).toBeDefined()
    expect(ind.id).toBe('ind-1')
    expect(ind.type).toBe('INDI')
    expect(ind.name).toBe('Ahmad Saeed')
    expect(ind.givenName).toBe('Ahmad')
    expect(ind.surname).toBe('Saeed')
    expect(ind.sex).toBe('M')
    expect(ind.birth).toBe('1950')
    expect(ind.death).toBe('2020')
    expect(ind.isDeceased).toBe(true)
    expect(ind.isPrivate).toBe(false)
    expect(ind.familiesAsSpouse).toEqual([])
    expect(ind.familyAsChild).toBeNull()
  })

  it('formats name with only givenName (no surname)', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
          givenName: 'Fatima',
        }),
      ],
      families: [],
    }

    const result = dbTreeToGedcomData(dbTree)
    const ind = result.individuals['ind-1']

    expect(ind.name).toBe('Fatima')
    expect(ind.givenName).toBe('Fatima')
    expect(ind.surname).toBe('')
  })

  it('formats name from fullName when givenName and surname are absent', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
          fullName: 'Ahmad bin Saeed',
        }),
      ],
      families: [],
    }

    const result = dbTreeToGedcomData(dbTree)
    const ind = result.individuals['ind-1']

    expect(ind.name).toBe('Ahmad bin Saeed')
    expect(ind.givenName).toBe('Ahmad bin Saeed')
    expect(ind.surname).toBe('')
  })

  it('falls back to empty name when no name fields are set', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
        }),
      ],
      families: [],
    }

    const result = dbTreeToGedcomData(dbTree)
    const ind = result.individuals['ind-1']

    expect(ind.name).toBe('')
    expect(ind.givenName).toBe('')
    expect(ind.surname).toBe('')
  })

  it('maps a family with husband, wife, and children', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({ id: 'husband-1', treeId: TREE_ID, givenName: 'Ahmad', sex: 'M' }),
        makeIndividual({ id: 'wife-1', treeId: TREE_ID, givenName: 'Sara', sex: 'F' }),
        makeIndividual({ id: 'child-1', treeId: TREE_ID, givenName: 'Omar', sex: 'M' }),
        makeIndividual({ id: 'child-2', treeId: TREE_ID, givenName: 'Layla', sex: 'F' }),
      ],
      families: [
        makeFamily({
          id: 'fam-1',
          treeId: TREE_ID,
          husbandId: 'husband-1',
          wifeId: 'wife-1',
          children: [
            { familyId: 'fam-1', individualId: 'child-1' },
            { familyId: 'fam-1', individualId: 'child-2' },
          ],
        }),
      ],
    }

    const result = dbTreeToGedcomData(dbTree)
    const fam = result.families['fam-1']

    expect(fam).toBeDefined()
    expect(fam.id).toBe('fam-1')
    expect(fam.type).toBe('FAM')
    expect(fam.husband).toBe('husband-1')
    expect(fam.wife).toBe('wife-1')
    expect(fam.children).toEqual(['child-1', 'child-2'])
  })

  it('computes familiesAsSpouse from families where individual is husband or wife', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({ id: 'person-1', treeId: TREE_ID, givenName: 'Ahmad', sex: 'M' }),
        makeIndividual({ id: 'wife-1', treeId: TREE_ID, givenName: 'Sara', sex: 'F' }),
        makeIndividual({ id: 'wife-2', treeId: TREE_ID, givenName: 'Huda', sex: 'F' }),
      ],
      families: [
        makeFamily({ id: 'fam-1', treeId: TREE_ID, husbandId: 'person-1', wifeId: 'wife-1' }),
        makeFamily({ id: 'fam-2', treeId: TREE_ID, husbandId: 'person-1', wifeId: 'wife-2' }),
      ],
    }

    const result = dbTreeToGedcomData(dbTree)

    expect(result.individuals['person-1'].familiesAsSpouse).toEqual(['fam-1', 'fam-2'])
    expect(result.individuals['wife-1'].familiesAsSpouse).toEqual(['fam-1'])
    expect(result.individuals['wife-2'].familiesAsSpouse).toEqual(['fam-2'])
  })

  it('computes familyAsChild from FamilyChild records', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({ id: 'parent-1', treeId: TREE_ID, givenName: 'Ahmad', sex: 'M' }),
        makeIndividual({ id: 'child-1', treeId: TREE_ID, givenName: 'Omar', sex: 'M' }),
      ],
      families: [
        makeFamily({
          id: 'fam-1',
          treeId: TREE_ID,
          husbandId: 'parent-1',
          children: [{ familyId: 'fam-1', individualId: 'child-1' }],
        }),
      ],
    }

    const result = dbTreeToGedcomData(dbTree)

    expect(result.individuals['child-1'].familyAsChild).toBe('fam-1')
    expect(result.individuals['parent-1'].familyAsChild).toBeNull()
  })

  it('takes the first family when individual appears as child in multiple families', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({ id: 'child-1', treeId: TREE_ID, givenName: 'Omar', sex: 'M' }),
      ],
      families: [
        makeFamily({
          id: 'fam-1',
          treeId: TREE_ID,
          children: [{ familyId: 'fam-1', individualId: 'child-1' }],
        }),
        makeFamily({
          id: 'fam-2',
          treeId: TREE_ID,
          children: [{ familyId: 'fam-2', individualId: 'child-1' }],
        }),
      ],
    }

    const result = dbTreeToGedcomData(dbTree)

    expect(result.individuals['child-1'].familyAsChild).toBe('fam-1')
  })

  it('preserves the isPrivate flag', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({ id: 'ind-1', treeId: TREE_ID, isPrivate: true }),
      ],
      families: [],
    }

    const result = dbTreeToGedcomData(dbTree)

    expect(result.individuals['ind-1'].isPrivate).toBe(true)
  })

  it('maps sex correctly for male, female, and unknown', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({ id: 'male-1', treeId: TREE_ID, sex: 'M' }),
        makeIndividual({ id: 'female-1', treeId: TREE_ID, sex: 'F' }),
        makeIndividual({ id: 'unknown-1', treeId: TREE_ID, sex: null }),
      ],
      families: [],
    }

    const result = dbTreeToGedcomData(dbTree)

    expect(result.individuals['male-1'].sex).toBe('M')
    expect(result.individuals['female-1'].sex).toBe('F')
    expect(result.individuals['unknown-1'].sex).toBeNull()
  })

  it('sets birth and death to empty string when dates are null', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({ id: 'ind-1', treeId: TREE_ID }),
      ],
      families: [],
    }

    const result = dbTreeToGedcomData(dbTree)

    expect(result.individuals['ind-1'].birth).toBe('')
    expect(result.individuals['ind-1'].death).toBe('')
    expect(result.individuals['ind-1'].isDeceased).toBe(false)
  })

  it('sets isDeceased from the DB field (not derived from deathDate)', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({ id: 'ind-1', treeId: TREE_ID, deathDate: '2020', isDeceased: true }),
        makeIndividual({ id: 'ind-2', treeId: TREE_ID, isDeceased: true }), // deceased without date
        makeIndividual({ id: 'ind-3', treeId: TREE_ID, isDeceased: false }),
      ],
      families: [],
    }

    const result = dbTreeToGedcomData(dbTree)

    expect(result.individuals['ind-1'].isDeceased).toBe(true)
    expect(result.individuals['ind-2'].isDeceased).toBe(true) // no date but still deceased
    expect(result.individuals['ind-3'].isDeceased).toBe(false)
  })

  it('maps a family with no husband or wife', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({ id: 'child-1', treeId: TREE_ID, givenName: 'Omar' }),
      ],
      families: [
        makeFamily({
          id: 'fam-1',
          treeId: TREE_ID,
          children: [{ familyId: 'fam-1', individualId: 'child-1' }],
        }),
      ],
    }

    const result = dbTreeToGedcomData(dbTree)

    expect(result.families['fam-1'].husband).toBeNull()
    expect(result.families['fam-1'].wife).toBeNull()
    expect(result.families['fam-1'].children).toEqual(['child-1'])
  })

  it('handles polygamous families where one individual has multiple spouse families', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({ id: 'man-1', treeId: TREE_ID, givenName: 'Ahmad', sex: 'M' }),
        makeIndividual({ id: 'wife-1', treeId: TREE_ID, givenName: 'Sara', sex: 'F' }),
        makeIndividual({ id: 'wife-2', treeId: TREE_ID, givenName: 'Huda', sex: 'F' }),
        makeIndividual({ id: 'child-a', treeId: TREE_ID, givenName: 'Ali', sex: 'M' }),
        makeIndividual({ id: 'child-b', treeId: TREE_ID, givenName: 'Noor', sex: 'F' }),
      ],
      families: [
        makeFamily({
          id: 'fam-1',
          treeId: TREE_ID,
          husbandId: 'man-1',
          wifeId: 'wife-1',
          children: [{ familyId: 'fam-1', individualId: 'child-a' }],
        }),
        makeFamily({
          id: 'fam-2',
          treeId: TREE_ID,
          husbandId: 'man-1',
          wifeId: 'wife-2',
          children: [{ familyId: 'fam-2', individualId: 'child-b' }],
        }),
      ],
    }

    const result = dbTreeToGedcomData(dbTree)

    // man-1 has two spouse families
    expect(result.individuals['man-1'].familiesAsSpouse).toEqual(['fam-1', 'fam-2'])

    // each child belongs to the correct family
    expect(result.individuals['child-a'].familyAsChild).toBe('fam-1')
    expect(result.individuals['child-b'].familyAsChild).toBe('fam-2')

    // families are correct
    expect(result.families['fam-1'].children).toEqual(['child-a'])
    expect(result.families['fam-2'].children).toEqual(['child-b'])
  })

  it('prefers givenName + surname over fullName when both are present', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
          givenName: 'Ahmad',
          surname: 'Saeed',
          fullName: 'Ahmad bin Saeed al-Something',
        }),
      ],
      families: [],
    }

    const result = dbTreeToGedcomData(dbTree)

    expect(result.individuals['ind-1'].name).toBe('Ahmad Saeed')
    expect(result.individuals['ind-1'].givenName).toBe('Ahmad')
    expect(result.individuals['ind-1'].surname).toBe('Saeed')
  })
})

describe('redactPrivateIndividuals', () => {
  const TREE_ID = 'tree-001'
  const WORKSPACE_ID = 'ws-001'

  it('redacts name fields for private individuals', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
          givenName: 'Ahmad',
          surname: 'Saeed',
          fullName: 'Ahmad Saeed',
          sex: 'M',
          birthDate: '1980',
          birthPlace: 'Mecca',
          deathDate: '2020',
          deathPlace: 'Jeddah',
          isPrivate: true,
          isDeceased: true,
        }),
      ],
      families: [],
    }

    const gedcom = dbTreeToGedcomData(dbTree)
    const result = redactPrivateIndividuals(gedcom)
    const ind = result.individuals['ind-1']

    expect(ind.name).toBe('خاص')
    expect(ind.givenName).toBe('خاص')
    expect(ind.surname).toBe('')
    expect(ind.birth).toBe('')
    expect(ind.death).toBe('')
  })

  it('preserves id, sex, and family references for private individuals', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'father-1',
          treeId: TREE_ID,
          givenName: 'Ahmad',
          sex: 'M',
          isPrivate: true,
        }),
        makeIndividual({
          id: 'child-1',
          treeId: TREE_ID,
          givenName: 'Omar',
          sex: 'M',
          isPrivate: false,
        }),
      ],
      families: [
        makeFamily({
          id: 'fam-1',
          treeId: TREE_ID,
          husbandId: 'father-1',
          children: [{ familyId: 'fam-1', individualId: 'child-1' }],
        }),
      ],
    }

    const gedcom = dbTreeToGedcomData(dbTree)
    const result = redactPrivateIndividuals(gedcom)
    const ind = result.individuals['father-1']

    expect(ind.id).toBe('father-1')
    expect(ind.sex).toBe('M')
    expect(ind.familiesAsSpouse).toEqual(['fam-1'])
    expect(ind.isPrivate).toBe(true)
  })

  it('does not redact non-private individuals', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
          givenName: 'Ahmad',
          surname: 'Saeed',
          sex: 'M',
          birthDate: '1950',
          isPrivate: false,
        }),
      ],
      families: [],
    }

    const gedcom = dbTreeToGedcomData(dbTree)
    const result = redactPrivateIndividuals(gedcom)
    const ind = result.individuals['ind-1']

    expect(ind.name).toBe('Ahmad Saeed')
    expect(ind.givenName).toBe('Ahmad')
    expect(ind.surname).toBe('Saeed')
    expect(ind.birth).toBe('1950')
  })

  it('preserves families and tree structure unchanged', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'father-1',
          treeId: TREE_ID,
          givenName: 'Ahmad',
          sex: 'M',
          isPrivate: true,
        }),
        makeIndividual({
          id: 'child-1',
          treeId: TREE_ID,
          givenName: 'Omar',
          sex: 'M',
          isPrivate: false,
        }),
      ],
      families: [
        makeFamily({
          id: 'fam-1',
          treeId: TREE_ID,
          husbandId: 'father-1',
          children: [{ familyId: 'fam-1', individualId: 'child-1' }],
        }),
      ],
    }

    const gedcom = dbTreeToGedcomData(dbTree)
    const result = redactPrivateIndividuals(gedcom)

    // Families remain intact
    expect(result.families['fam-1'].husband).toBe('father-1')
    expect(result.families['fam-1'].children).toEqual(['child-1'])

    // Child still references parent family
    expect(result.individuals['child-1'].familyAsChild).toBe('fam-1')
  })

  it('does not mutate the original GedcomData', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
          givenName: 'Ahmad',
          surname: 'Saeed',
          birthDate: '1980',
          isPrivate: true,
        }),
      ],
      families: [],
    }

    const gedcom = dbTreeToGedcomData(dbTree)
    const originalName = gedcom.individuals['ind-1'].name

    redactPrivateIndividuals(gedcom)

    // Original should be unchanged
    expect(gedcom.individuals['ind-1'].name).toBe(originalName)
  })

  it('redacts birthPlace, deathPlace, and notes for private individuals', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
          givenName: 'Ahmad',
          surname: 'Saeed',
          birthDate: '1950',
          birthPlace: 'Mecca',
          deathDate: '2020',
          deathPlace: 'Jeddah',
          notes: 'Some private notes',
          isPrivate: true,
          isDeceased: true,
        }),
      ],
      families: [],
    }

    const gedcom = dbTreeToGedcomData(dbTree)
    const result = redactPrivateIndividuals(gedcom)
    const ind = result.individuals['ind-1']

    expect(ind.birthPlace).toBe('')
    expect(ind.deathPlace).toBe('')
    expect(ind.notes).toBe('')
  })

  it('does not redact birthPlace, deathPlace, and notes for non-private individuals', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
          givenName: 'Ahmad',
          birthPlace: 'Mecca',
          deathPlace: 'Jeddah',
          notes: 'Public notes',
          isPrivate: false,
        }),
      ],
      families: [],
    }

    const gedcom = dbTreeToGedcomData(dbTree)
    const result = redactPrivateIndividuals(gedcom)
    const ind = result.individuals['ind-1']

    expect(ind.birthPlace).toBe('Mecca')
    expect(ind.deathPlace).toBe('Jeddah')
    expect(ind.notes).toBe('Public notes')
  })
})

describe('dbTreeToGedcomData — birthNotes and deathNotes mapping', () => {
  const TREE_ID = 'tree-001'
  const WORKSPACE_ID = 'ws-001'

  it('maps birthNotes and deathNotes from DB fields', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
          givenName: 'Ahmad',
          birthNotes: 'Born at home',
          deathNotes: 'Died peacefully',
        }),
      ],
      families: [],
    }

    const result = dbTreeToGedcomData(dbTree)
    const ind = result.individuals['ind-1']

    expect(ind.birthNotes).toBe('Born at home')
    expect(ind.deathNotes).toBe('Died peacefully')
  })

  it('defaults birthNotes and deathNotes to empty string when DB values are null', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
          givenName: 'Ahmad',
          birthNotes: null,
          deathNotes: null,
        }),
      ],
      families: [],
    }

    const result = dbTreeToGedcomData(dbTree)
    const ind = result.individuals['ind-1']

    expect(ind.birthNotes).toBe('')
    expect(ind.deathNotes).toBe('')
  })
})

describe('redactPrivateIndividuals — birthNotes and deathNotes', () => {
  const TREE_ID = 'tree-001'
  const WORKSPACE_ID = 'ws-001'

  it('redacts birthNotes and deathNotes for private individuals', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
          givenName: 'Ahmad',
          birthNotes: 'Private birth note',
          deathNotes: 'Private death note',
          isPrivate: true,
        }),
      ],
      families: [],
    }

    const gedcom = dbTreeToGedcomData(dbTree)
    const result = redactPrivateIndividuals(gedcom)
    const ind = result.individuals['ind-1']

    expect(ind.birthNotes).toBe('')
    expect(ind.deathNotes).toBe('')
  })

  it('does not redact birthNotes and deathNotes for non-private individuals', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
          givenName: 'Ahmad',
          birthNotes: 'Public birth note',
          deathNotes: 'Public death note',
          isPrivate: false,
        }),
      ],
      families: [],
    }

    const gedcom = dbTreeToGedcomData(dbTree)
    const result = redactPrivateIndividuals(gedcom)
    const ind = result.individuals['ind-1']

    expect(ind.birthNotes).toBe('Public birth note')
    expect(ind.deathNotes).toBe('Public death note')
  })
})

describe('dbTreeToGedcomData — birthDescription and deathDescription mapping', () => {
  const TREE_ID = 'tree-001'
  const WORKSPACE_ID = 'ws-001'

  it('maps birthDescription and deathDescription from DB fields', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
          givenName: 'Ahmad',
          birthDescription: 'Natural birth',
          deathDescription: 'Heart attack',
        }),
      ],
      families: [],
    }

    const result = dbTreeToGedcomData(dbTree)
    const ind = result.individuals['ind-1']

    expect(ind.birthDescription).toBe('Natural birth')
    expect(ind.deathDescription).toBe('Heart attack')
  })

  it('defaults birthDescription and deathDescription to empty string when DB values are null', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
          givenName: 'Ahmad',
          birthDescription: null,
          deathDescription: null,
        }),
      ],
      families: [],
    }

    const result = dbTreeToGedcomData(dbTree)
    const ind = result.individuals['ind-1']

    expect(ind.birthDescription).toBe('')
    expect(ind.deathDescription).toBe('')
  })
})

describe('redactPrivateIndividuals — birthDescription and deathDescription', () => {
  const TREE_ID = 'tree-001'
  const WORKSPACE_ID = 'ws-001'

  it('redacts birthDescription and deathDescription for private individuals', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
          givenName: 'Ahmad',
          birthDescription: 'Private birth desc',
          deathDescription: 'Private death desc',
          isPrivate: true,
        }),
      ],
      families: [],
    }

    const gedcom = dbTreeToGedcomData(dbTree)
    const result = redactPrivateIndividuals(gedcom)
    const ind = result.individuals['ind-1']

    expect(ind.birthDescription).toBe('')
    expect(ind.deathDescription).toBe('')
  })

  it('does not redact birthDescription and deathDescription for non-private individuals', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
          givenName: 'Ahmad',
          birthDescription: 'Public birth desc',
          deathDescription: 'Public death desc',
          isPrivate: false,
        }),
      ],
      families: [],
    }

    const gedcom = dbTreeToGedcomData(dbTree)
    const result = redactPrivateIndividuals(gedcom)
    const ind = result.individuals['ind-1']

    expect(ind.birthDescription).toBe('Public birth desc')
    expect(ind.deathDescription).toBe('Public death desc')
  })
})

describe('dbTreeToGedcomData — birthPlace, deathPlace, notes mapping', () => {
  const TREE_ID = 'tree-001'
  const WORKSPACE_ID = 'ws-001'

  it('maps birthPlace, deathPlace, and notes from DB fields', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
          givenName: 'Ahmad',
          birthPlace: 'Mecca',
          deathPlace: 'Jeddah',
          notes: 'A note about Ahmad.',
        }),
      ],
      families: [],
    }

    const result = dbTreeToGedcomData(dbTree)
    const ind = result.individuals['ind-1']

    expect(ind.birthPlace).toBe('Mecca')
    expect(ind.deathPlace).toBe('Jeddah')
    expect(ind.notes).toBe('A note about Ahmad.')
  })

  it('defaults birthPlace, deathPlace, and notes to empty string when DB values are null', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
          givenName: 'Ahmad',
          birthPlace: null,
          deathPlace: null,
          notes: null,
        }),
      ],
      families: [],
    }

    const result = dbTreeToGedcomData(dbTree)
    const ind = result.individuals['ind-1']

    expect(ind.birthPlace).toBe('')
    expect(ind.deathPlace).toBe('')
    expect(ind.notes).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Hijri date mapping
// ---------------------------------------------------------------------------

describe('dbTreeToGedcomData — Hijri date mapping', () => {
  const TREE_ID = 'tree-001'
  const WORKSPACE_ID = 'ws-001'

  it('maps individual with Hijri dates', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
          givenName: 'Ahmad',
          birthDate: '1950-01-15',
          birthHijriDate: '1369/03/16',
          deathDate: '2020-06-01',
          deathHijriDate: '1441/10/09',
        }),
      ],
      families: [],
    }

    const result = dbTreeToGedcomData(dbTree)
    const ind = result.individuals['ind-1']

    expect(ind.birthHijriDate).toBe('1369/03/16')
    expect(ind.deathHijriDate).toBe('1441/10/09')
  })

  it('defaults Hijri dates to empty string when DB values are null', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
          givenName: 'Ahmad',
        }),
      ],
      families: [],
    }

    const result = dbTreeToGedcomData(dbTree)
    const ind = result.individuals['ind-1']

    expect(ind.birthHijriDate).toBe('')
    expect(ind.deathHijriDate).toBe('')
  })
})

describe('redactPrivateIndividuals — Hijri dates', () => {
  const TREE_ID = 'tree-001'
  const WORKSPACE_ID = 'ws-001'

  it('redacts Hijri dates for private individuals', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
          givenName: 'Ahmad',
          birthHijriDate: '1369/03/16',
          deathHijriDate: '1441/10/09',
          isPrivate: true,
        }),
      ],
      families: [],
    }

    const gedcom = dbTreeToGedcomData(dbTree)
    const result = redactPrivateIndividuals(gedcom)
    const ind = result.individuals['ind-1']

    expect(ind.birthHijriDate).toBe('')
    expect(ind.deathHijriDate).toBe('')
  })

  it('does not redact Hijri dates for non-private individuals', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [
        makeIndividual({
          id: 'ind-1',
          treeId: TREE_ID,
          givenName: 'Ahmad',
          birthHijriDate: '1369/03/16',
          deathHijriDate: '1441/10/09',
          isPrivate: false,
        }),
      ],
      families: [],
    }

    const gedcom = dbTreeToGedcomData(dbTree)
    const result = redactPrivateIndividuals(gedcom)
    const ind = result.individuals['ind-1']

    expect(ind.birthHijriDate).toBe('1369/03/16')
    expect(ind.deathHijriDate).toBe('1441/10/09')
  })
})

// ---------------------------------------------------------------------------
// Family event mapping
// ---------------------------------------------------------------------------

describe('dbTreeToGedcomData — family event mapping', () => {
  const TREE_ID = 'tree-001'
  const WORKSPACE_ID = 'ws-001'

  it('maps family with marriage contract data', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [],
      families: [
        makeFamily({
          id: 'fam-1',
          treeId: TREE_ID,
          marriageContractDate: '2020-01-01',
          marriageContractHijriDate: '1441/05/06',
          marriageContractPlace: 'Riyadh',
          marriageContractDescription: 'Official contract',
          marriageContractNotes: 'Witnessed by family',
        }),
      ],
    }

    const result = dbTreeToGedcomData(dbTree)
    const fam = result.families['fam-1']

    expect(fam.marriageContract.date).toBe('2020-01-01')
    expect(fam.marriageContract.hijriDate).toBe('1441/05/06')
    expect(fam.marriageContract.place).toBe('Riyadh')
    expect(fam.marriageContract.description).toBe('Official contract')
    expect(fam.marriageContract.notes).toBe('Witnessed by family')
  })

  it('maps family with marriage data', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [],
      families: [
        makeFamily({
          id: 'fam-1',
          treeId: TREE_ID,
          marriageDate: '2020-03-15',
          marriageHijriDate: '1441/07/20',
          marriagePlace: 'Jeddah',
          marriageDescription: 'Wedding ceremony',
          marriageNotes: 'Large gathering',
        }),
      ],
    }

    const result = dbTreeToGedcomData(dbTree)
    const fam = result.families['fam-1']

    expect(fam.marriage.date).toBe('2020-03-15')
    expect(fam.marriage.hijriDate).toBe('1441/07/20')
    expect(fam.marriage.place).toBe('Jeddah')
    expect(fam.marriage.description).toBe('Wedding ceremony')
    expect(fam.marriage.notes).toBe('Large gathering')
  })

  it('maps family with divorce data', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [],
      families: [
        makeFamily({
          id: 'fam-1',
          treeId: TREE_ID,
          isDivorced: true,
          divorceDate: '2023-06-01',
          divorceHijriDate: '1444/11/12',
          divorcePlace: 'Mecca',
          divorceDescription: 'Mutual agreement',
          divorceNotes: 'Amicable separation',
        }),
      ],
    }

    const result = dbTreeToGedcomData(dbTree)
    const fam = result.families['fam-1']

    expect(fam.isDivorced).toBe(true)
    expect(fam.divorce.date).toBe('2023-06-01')
    expect(fam.divorce.hijriDate).toBe('1444/11/12')
    expect(fam.divorce.place).toBe('Mecca')
    expect(fam.divorce.description).toBe('Mutual agreement')
    expect(fam.divorce.notes).toBe('Amicable separation')
  })

  it('maps family with all events empty (defaults)', () => {
    const dbTree: DbTree = {
      id: TREE_ID,
      workspaceId: WORKSPACE_ID,
      individuals: [],
      families: [
        makeFamily({
          id: 'fam-1',
          treeId: TREE_ID,
        }),
      ],
    }

    const result = dbTreeToGedcomData(dbTree)
    const fam = result.families['fam-1']

    // All event fields default to empty strings
    expect(fam.marriageContract).toEqual({
      date: '',
      hijriDate: '',
      place: '',
      description: '',
      notes: '',
    })
    expect(fam.marriage).toEqual({
      date: '',
      hijriDate: '',
      place: '',
      description: '',
      notes: '',
    })
    expect(fam.divorce).toEqual({
      date: '',
      hijriDate: '',
      place: '',
      description: '',
      notes: '',
    })
    expect(fam.isDivorced).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { dbTreeToGedcomData } from '@/lib/tree/mapper'
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
  deathDate: string | null
  deathPlace: string | null
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
    deathDate: null,
    deathPlace: null,
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

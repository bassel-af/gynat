import type { Individual, Family, GedcomData } from '@/lib/gedcom/types'

// ---------------------------------------------------------------------------
// DB record shapes (as returned by Prisma queries with includes)
// ---------------------------------------------------------------------------

export interface DbFamilyChild {
  familyId: string
  individualId: string
}

export interface DbIndividual {
  id: string
  treeId: string
  gedcomId: string | null
  givenName: string | null
  surname: string | null
  fullName: string | null
  sex: string | null
  birthDate: string | null
  birthPlace: string | null
  birthDescription: string | null
  birthNotes: string | null
  birthHijriDate: string | null
  deathDate: string | null
  deathPlace: string | null
  deathDescription: string | null
  deathNotes: string | null
  deathHijriDate: string | null
  notes: string | null
  isDeceased: boolean
  isPrivate: boolean
  createdById: string | null
  updatedAt: Date
  createdAt: Date
}

export interface DbFamily {
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

export interface DbTree {
  id: string
  workspaceId: string
  individuals: DbIndividual[]
  families: DbFamily[]
}

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

/**
 * Converts a DB tree (as returned by Prisma with includes) into the
 * `GedcomData` shape consumed by all existing tree visualization components.
 */
export function dbTreeToGedcomData(dbTree: DbTree): GedcomData {
  // Pre-compute lookup: individualId -> list of family IDs where they are a spouse
  const spouseFamilies = new Map<string, string[]>()
  // Pre-compute lookup: individualId -> first family ID where they are a child
  const childOfFamily = new Map<string, string>()

  for (const fam of dbTree.families) {
    if (fam.husbandId) {
      const list = spouseFamilies.get(fam.husbandId) ?? []
      list.push(fam.id)
      spouseFamilies.set(fam.husbandId, list)
    }
    if (fam.wifeId) {
      const list = spouseFamilies.get(fam.wifeId) ?? []
      list.push(fam.id)
      spouseFamilies.set(fam.wifeId, list)
    }
    for (const fc of fam.children) {
      // Take the first family only (as per spec)
      if (!childOfFamily.has(fc.individualId)) {
        childOfFamily.set(fc.individualId, fam.id)
      }
    }
  }

  // Map individuals
  const individuals: Record<string, Individual> = {}
  for (const dbInd of dbTree.individuals) {
    individuals[dbInd.id] = mapIndividual(dbInd, spouseFamilies, childOfFamily)
  }

  // Map families
  const families: Record<string, Family> = {}
  for (const dbFam of dbTree.families) {
    families[dbFam.id] = mapFamily(dbFam)
  }

  return { individuals, families }
}

// ---------------------------------------------------------------------------
// Individual mapping
// ---------------------------------------------------------------------------

function mapIndividual(
  dbInd: DbIndividual,
  spouseFamilies: Map<string, string[]>,
  childOfFamily: Map<string, string>,
): Individual {
  const { name, givenName, surname } = formatName(dbInd)
  const sex = mapSex(dbInd.sex)

  return {
    id: dbInd.id,
    type: 'INDI',
    name,
    givenName,
    surname,
    sex,
    birth: dbInd.birthDate ?? '',
    birthPlace: dbInd.birthPlace ?? '',
    birthDescription: dbInd.birthDescription ?? '',
    birthNotes: dbInd.birthNotes ?? '',
    birthHijriDate: dbInd.birthHijriDate ?? '',
    death: dbInd.deathDate ?? '',
    deathPlace: dbInd.deathPlace ?? '',
    deathDescription: dbInd.deathDescription ?? '',
    deathNotes: dbInd.deathNotes ?? '',
    deathHijriDate: dbInd.deathHijriDate ?? '',
    notes: dbInd.notes ?? '',
    isDeceased: dbInd.isDeceased,
    isPrivate: dbInd.isPrivate,
    familiesAsSpouse: spouseFamilies.get(dbInd.id) ?? [],
    familyAsChild: childOfFamily.get(dbInd.id) ?? null,
  }
}

function formatName(dbInd: DbIndividual): { name: string; givenName: string; surname: string } {
  if (dbInd.givenName) {
    const surname = dbInd.surname ?? ''
    // Match the GEDCOM parser: name is the display name WITHOUT slashes
    const name = surname ? `${dbInd.givenName} ${surname}` : dbInd.givenName
    return { name, givenName: dbInd.givenName, surname }
  }

  if (dbInd.fullName) {
    return { name: dbInd.fullName, givenName: dbInd.fullName, surname: '' }
  }

  return { name: '', givenName: '', surname: '' }
}

function mapSex(sex: string | null): 'M' | 'F' | null {
  if (sex === 'M') return 'M'
  if (sex === 'F') return 'F'
  return null
}

// ---------------------------------------------------------------------------
// Privacy redaction
// ---------------------------------------------------------------------------

const PRIVATE_PLACEHOLDER = 'خاص'

/**
 * Returns a new GedcomData with PII redacted for private individuals.
 * Structural data (id, sex, family references) is preserved so the tree
 * layout works correctly. The original object is not mutated.
 */
export function redactPrivateIndividuals(data: GedcomData): GedcomData {
  const redacted: Record<string, Individual> = {}

  for (const [id, ind] of Object.entries(data.individuals)) {
    if (ind.isPrivate) {
      redacted[id] = {
        ...ind,
        name: PRIVATE_PLACEHOLDER,
        givenName: PRIVATE_PLACEHOLDER,
        surname: '',
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
      }
    } else {
      redacted[id] = ind
    }
  }

  return { individuals: redacted, families: data.families }
}

// ---------------------------------------------------------------------------
// Family mapping
// ---------------------------------------------------------------------------

function mapFamily(dbFam: DbFamily): Family {
  return {
    id: dbFam.id,
    type: 'FAM',
    husband: dbFam.husbandId ?? null,
    wife: dbFam.wifeId ?? null,
    children: dbFam.children.map((fc) => fc.individualId),
    marriageContract: {
      date: dbFam.marriageContractDate ?? '',
      hijriDate: dbFam.marriageContractHijriDate ?? '',
      place: dbFam.marriageContractPlace ?? '',
      description: dbFam.marriageContractDescription ?? '',
      notes: dbFam.marriageContractNotes ?? '',
    },
    marriage: {
      date: dbFam.marriageDate ?? '',
      hijriDate: dbFam.marriageHijriDate ?? '',
      place: dbFam.marriagePlace ?? '',
      description: dbFam.marriageDescription ?? '',
      notes: dbFam.marriageNotes ?? '',
    },
    divorce: {
      date: dbFam.divorceDate ?? '',
      hijriDate: dbFam.divorceHijriDate ?? '',
      place: dbFam.divorcePlace ?? '',
      description: dbFam.divorceDescription ?? '',
      notes: dbFam.divorceNotes ?? '',
    },
    isDivorced: dbFam.isDivorced,
  }
}

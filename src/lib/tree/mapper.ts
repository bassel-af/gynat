import type { Individual, Family, GedcomData, RadaFamily } from '@/lib/gedcom/types'

// ---------------------------------------------------------------------------
// DB record shapes (as returned by Prisma queries with includes)
// ---------------------------------------------------------------------------

export interface DbFamilyChild {
  familyId: string
  individualId: string
}

export interface DbPlaceRef {
  id: string
  nameAr: string
  parent?: { nameAr: string; parent?: { nameAr: string } | null } | null
}

/** Build display string from place ref: "city، country" or just "city" */
function placeDisplayName(ref: DbPlaceRef | null | undefined): string {
  if (!ref) return ''
  // Walk up to find the top-level ancestor (country)
  const city = ref.nameAr
  let country: string | undefined
  if (ref.parent?.parent) {
    country = ref.parent.parent.nameAr
  } else if (ref.parent) {
    country = ref.parent.nameAr
  }
  if (country && country !== city) return `${city}، ${country}`
  return city
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
  birthPlaceId: string | null
  birthPlaceRef?: DbPlaceRef | null
  birthDescription: string | null
  birthNotes: string | null
  birthHijriDate: string | null
  deathDate: string | null
  deathPlace: string | null
  deathPlaceId: string | null
  deathPlaceRef?: DbPlaceRef | null
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
  marriageContractPlaceId: string | null
  marriageContractPlaceRef?: DbPlaceRef | null
  marriageContractDescription: string | null
  marriageContractNotes: string | null
  // Marriage
  marriageDate: string | null
  marriageHijriDate: string | null
  marriagePlace: string | null
  marriagePlaceId: string | null
  marriagePlaceRef?: DbPlaceRef | null
  marriageDescription: string | null
  marriageNotes: string | null
  // Umm walad
  isUmmWalad: boolean
  // Divorce
  isDivorced: boolean
  divorceDate: string | null
  divorceHijriDate: string | null
  divorcePlace: string | null
  divorcePlaceId: string | null
  divorcePlaceRef?: DbPlaceRef | null
  divorceDescription: string | null
  divorceNotes: string | null
}

export interface DbRadaFamilyChild {
  radaFamilyId: string
  individualId: string
}

export interface DbRadaFamily {
  id: string
  treeId: string
  gedcomId: string | null
  fosterFatherId: string | null
  fosterMotherId: string | null
  notes: string | null
  createdAt: Date
  children: DbRadaFamilyChild[]
}

export interface DbTree {
  id: string
  workspaceId: string
  individuals: DbIndividual[]
  families: DbFamily[]
  radaFamilies?: DbRadaFamily[]
}

// ---------------------------------------------------------------------------
// Rada family mapping
// ---------------------------------------------------------------------------

export function mapRadaFamily(dbRada: DbRadaFamily): RadaFamily {
  return {
    id: dbRada.id,
    type: '_RADA_FAM',
    fosterFather: dbRada.fosterFatherId ?? null,
    fosterMother: dbRada.fosterMotherId ?? null,
    children: dbRada.children.map((c) => c.individualId),
    notes: dbRada.notes ?? '',
  }
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

  // Map rada families (optional)
  if (dbTree.radaFamilies && dbTree.radaFamilies.length > 0) {
    const radaFamilies: Record<string, RadaFamily> = {}
    // Pre-compute lookup: individualId -> list of rada family IDs where they are a child
    const radaChildOf = new Map<string, string[]>()

    for (const dbRada of dbTree.radaFamilies) {
      radaFamilies[dbRada.id] = mapRadaFamily(dbRada)
      for (const rc of dbRada.children) {
        const list = radaChildOf.get(rc.individualId) ?? []
        list.push(dbRada.id)
        radaChildOf.set(rc.individualId, list)
      }
    }

    // Populate radaFamiliesAsChild on individuals
    for (const [indId, radaFamIds] of radaChildOf) {
      if (individuals[indId]) {
        individuals[indId].radaFamiliesAsChild = radaFamIds
      }
    }

    return { individuals, families, radaFamilies }
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

  // Resolve place names: prefer placeRef display (city، country), fall back to string field
  const birthPlace = dbInd.birthPlaceRef ? placeDisplayName(dbInd.birthPlaceRef) : (dbInd.birthPlace ?? '')
  const deathPlace = dbInd.deathPlaceRef ? placeDisplayName(dbInd.deathPlaceRef) : (dbInd.deathPlace ?? '')

  const result: Individual = {
    id: dbInd.id,
    type: 'INDI',
    name,
    givenName,
    surname,
    sex,
    birth: dbInd.birthDate ?? '',
    birthPlace,
    birthDescription: dbInd.birthDescription ?? '',
    birthNotes: dbInd.birthNotes ?? '',
    birthHijriDate: dbInd.birthHijriDate ?? '',
    death: dbInd.deathDate ?? '',
    deathPlace,
    deathDescription: dbInd.deathDescription ?? '',
    deathNotes: dbInd.deathNotes ?? '',
    deathHijriDate: dbInd.deathHijriDate ?? '',
    notes: dbInd.notes ?? '',
    isDeceased: dbInd.isDeceased,
    isPrivate: dbInd.isPrivate,
    familiesAsSpouse: spouseFamilies.get(dbInd.id) ?? [],
    familyAsChild: childOfFamily.get(dbInd.id) ?? null,
  }

  if (dbInd.birthPlaceId) result.birthPlaceId = dbInd.birthPlaceId
  if (dbInd.deathPlaceId) result.deathPlaceId = dbInd.deathPlaceId

  return result
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
      const redactedInd: Individual = {
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
      // Remove placeId fields from redacted individuals
      delete redactedInd.birthPlaceId
      delete redactedInd.deathPlaceId
      redacted[id] = redactedInd
    } else {
      redacted[id] = ind
    }
  }

  const result: GedcomData = { individuals: redacted, families: data.families }
  if (data.radaFamilies) result.radaFamilies = data.radaFamilies
  return result
}

// ---------------------------------------------------------------------------
// Family mapping
// ---------------------------------------------------------------------------

function mapFamily(dbFam: DbFamily): Family {
  const marriageContract: Family['marriageContract'] = {
    date: dbFam.marriageContractDate ?? '',
    hijriDate: dbFam.marriageContractHijriDate ?? '',
    place: dbFam.marriageContractPlaceRef ? placeDisplayName(dbFam.marriageContractPlaceRef) : (dbFam.marriageContractPlace ?? ''),
    description: dbFam.marriageContractDescription ?? '',
    notes: dbFam.marriageContractNotes ?? '',
  }
  if (dbFam.marriageContractPlaceId) marriageContract.placeId = dbFam.marriageContractPlaceId

  const marriage: Family['marriage'] = {
    date: dbFam.marriageDate ?? '',
    hijriDate: dbFam.marriageHijriDate ?? '',
    place: dbFam.marriagePlaceRef ? placeDisplayName(dbFam.marriagePlaceRef) : (dbFam.marriagePlace ?? ''),
    description: dbFam.marriageDescription ?? '',
    notes: dbFam.marriageNotes ?? '',
  }
  if (dbFam.marriagePlaceId) marriage.placeId = dbFam.marriagePlaceId

  const divorce: Family['divorce'] = {
    date: dbFam.divorceDate ?? '',
    hijriDate: dbFam.divorceHijriDate ?? '',
    place: dbFam.divorcePlaceRef ? placeDisplayName(dbFam.divorcePlaceRef) : (dbFam.divorcePlace ?? ''),
    description: dbFam.divorceDescription ?? '',
    notes: dbFam.divorceNotes ?? '',
  }
  if (dbFam.divorcePlaceId) divorce.placeId = dbFam.divorcePlaceId

  return {
    id: dbFam.id,
    type: 'FAM',
    husband: dbFam.husbandId ?? null,
    wife: dbFam.wifeId ?? null,
    children: dbFam.children.map((fc) => fc.individualId),
    marriageContract,
    marriage,
    divorce,
    isDivorced: dbFam.isDivorced,
    isUmmWalad: dbFam.isUmmWalad,
  }
}

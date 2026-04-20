import type { GedcomData, Individual, Family, FamilyEvent, RadaFamily } from './types'

// ---------------------------------------------------------------------------
// Reverse month maps (number → GEDCOM code)
// ---------------------------------------------------------------------------

const GREGORIAN_MONTHS: Record<string, string> = {
  '01': 'JAN', '02': 'FEB', '03': 'MAR', '04': 'APR', '05': 'MAY', '06': 'JUN',
  '07': 'JUL', '08': 'AUG', '09': 'SEP', '10': 'OCT', '11': 'NOV', '12': 'DEC',
}

const HIJRI_MONTHS: Record<string, string> = {
  '01': 'MUHAR', '02': 'SAFAR', '03': 'RABIA', '04': 'RABIT',
  '05': 'JUMAA', '06': 'JUMAT', '07': 'RAJAB', '08': 'SHAAB',
  '09': 'RAMAD', '10': 'SHAWW', '11': 'DHUAQ', '12': 'DHUAH',
}

// Extension tag URIs for GEDCOM 7.0 SCHMA declarations
const EXT_URIS: Record<string, string> = {
  '_UMM_WALAD': 'https://gynat.com/gedcom/ext/_UMM_WALAD',
  '_KUNYA': 'https://gynat.com/gedcom/ext/_KUNYA',
  '_RADA_FAM': 'https://gynat.com/gedcom/ext/_RADA_FAM',
  '_RADA_HUSB': 'https://gynat.com/gedcom/ext/_RADA_HUSB',
  '_RADA_WIFE': 'https://gynat.com/gedcom/ext/_RADA_WIFE',
  '_RADA_CHIL': 'https://gynat.com/gedcom/ext/_RADA_CHIL',
  '_RADA_FAMC': 'https://gynat.com/gedcom/ext/_RADA_FAMC',
}

// ---------------------------------------------------------------------------
// Date reversal helpers
// ---------------------------------------------------------------------------

/**
 * Reverse a stored date string back to GEDCOM format.
 * Input formats (from parser): "DD/MM/YYYY", "MM/YYYY", "YYYY"
 * Output formats: "D MON YYYY", "MON YYYY", "YYYY"
 */
function reverseGregorianDate(stored: string): string {
  if (!stored) return ''

  // DD/MM/YYYY
  const fullMatch = stored.match(/^(\d{2})\/(\d{2})\/(\d+)$/)
  if (fullMatch) {
    const day = parseInt(fullMatch[1], 10) // strip leading zero
    const month = GREGORIAN_MONTHS[fullMatch[2]]
    if (month) return `${day} ${month} ${fullMatch[3]}`
  }

  // MM/YYYY
  const monthYearMatch = stored.match(/^(\d{2})\/(\d+)$/)
  if (monthYearMatch) {
    const month = GREGORIAN_MONTHS[monthYearMatch[1]]
    if (month) return `${month} ${monthYearMatch[2]}`
  }

  // Year-only or already in GEDCOM format — return as-is
  return stored
}

/**
 * Reverse a stored Hijri date string back to GEDCOM Hijri format.
 * Input formats: "DD/MM/YYYY", "MM/YYYY", "YYYY"
 * Output: "D MONTH_CODE YYYY", "MONTH_CODE YYYY", "YYYY"
 */
function reverseHijriDate(stored: string): string {
  if (!stored) return ''

  // DD/MM/YYYY
  const fullMatch = stored.match(/^(\d{2})\/(\d{2})\/(\d+)$/)
  if (fullMatch) {
    const day = parseInt(fullMatch[1], 10)
    const month = HIJRI_MONTHS[fullMatch[2]]
    if (month) return `${day} ${month} ${fullMatch[3]}`
  }

  // MM/YYYY
  const monthYearMatch = stored.match(/^(\d{2})\/(\d+)$/)
  if (monthYearMatch) {
    const month = HIJRI_MONTHS[monthYearMatch[1]]
    if (month) return `${month} ${monthYearMatch[2]}`
  }

  // Year-only — return as-is
  return stored
}

// ---------------------------------------------------------------------------
// ID wrapping helper
// ---------------------------------------------------------------------------

function wrapId(id: string): string {
  if (id.startsWith('@') && id.endsWith('@')) return id
  return `@${id}@`
}

// ---------------------------------------------------------------------------
// GEDCOM line sanitization (prevents injection via user-controlled strings)
// ---------------------------------------------------------------------------

/**
 * Sanitize a string value before interpolating into a GEDCOM line.
 * - Replaces newlines with spaces (prevents line injection / record injection)
 * - Strips @ characters (prevents cross-reference injection in GEDCOM parsers)
 *
 * NOTE: This is for single-line fields (names, places, descriptions).
 * Multi-line content (notes) should use emitNote() with CONT instead.
 */
function sanitizeLine(value: string): string {
  return value.replace(/[\r\n]/g, ' ').replace(/@/g, '')
}

// ---------------------------------------------------------------------------
// Note serialization helper
// ---------------------------------------------------------------------------

function emitNote(lines: string[], level: number, text: string): void {
  const parts = text.split('\n')
  lines.push(`${level} NOTE ${parts[0]}`)
  for (let i = 1; i < parts.length; i++) {
    lines.push(`${level + 1} CONT ${parts[i]}`)
  }
}

// ---------------------------------------------------------------------------
// Event helper: check if a FamilyEvent has any data
// ---------------------------------------------------------------------------

function hasEventData(event: FamilyEvent): boolean {
  return !!(event.date || event.hijriDate || event.place || event.description || event.notes)
}

// ---------------------------------------------------------------------------
// Birth/death event helpers
// ---------------------------------------------------------------------------

function hasBirthData(ind: Individual): boolean {
  return !!(ind.birth || ind.birthPlace || ind.birthHijriDate || ind.birthNotes || ind.birthDescription)
}

function hasDeathData(ind: Individual): boolean {
  return !!(ind.death || ind.deathPlace || ind.deathHijriDate || ind.deathNotes || ind.deathDescription)
}

// ---------------------------------------------------------------------------
// Family event serialization
// ---------------------------------------------------------------------------

function emitFamilyEvent(
  lines: string[],
  tag: string,
  event: FamilyEvent,
): void {
  if (!hasEventData(event)) return

  if (event.description) {
    lines.push(`1 ${tag} ${sanitizeLine(event.description)}`)
  } else {
    lines.push(`1 ${tag}`)
  }

  if (event.date) {
    lines.push(`2 DATE ${reverseGregorianDate(event.date)}`)
  }

  if (event.hijriDate) {
    const reversed = reverseHijriDate(event.hijriDate)
    lines.push(`2 DATE @#DHIJRI@ ${reversed}`)
  }

  if (event.place) {
    lines.push(`2 PLAC ${sanitizeLine(event.place)}`)
  }

  if (event.notes) {
    emitNote(lines, 2, event.notes)
  }
}

// ---------------------------------------------------------------------------
// Detect which custom tags are needed (for 7.0 SCHMA)
// ---------------------------------------------------------------------------

function collectCustomTags(data: GedcomData): Set<string> {
  const tags = new Set<string>()

  for (const ind of Object.values(data.individuals)) {
    if (ind._pointed || ind.isPrivate) continue
    if (ind.kunya) {
      tags.add('_KUNYA')
      break
    }
  }

  for (const fam of Object.values(data.families)) {
    if (fam._pointed) continue
    if (fam.isUmmWalad) {
      tags.add('_UMM_WALAD')
      break
    }
  }

  if (data.radaFamilies && Object.keys(data.radaFamilies).length > 0) {
    tags.add('_RADA_FAM')
    tags.add('_RADA_CHIL')
    for (const rf of Object.values(data.radaFamilies)) {
      if (rf.fosterFather) tags.add('_RADA_HUSB')
      if (rf.fosterMother) tags.add('_RADA_WIFE')
    }
    for (const ind of Object.values(data.individuals)) {
      if (ind._pointed) continue
      if (ind.radaFamiliesAsChild && ind.radaFamiliesAsChild.length > 0) {
        tags.add('_RADA_FAMC')
        break
      }
    }
  }

  return tags
}

// ---------------------------------------------------------------------------
// Individual serialization
// ---------------------------------------------------------------------------

function emitIndividual(
  lines: string[],
  ind: Individual,
): void {
  lines.push(`0 ${wrapId(ind.id)} INDI`)

  if (ind.isPrivate) {
    lines.push('1 NAME PRIVATE')
    if (ind.sex) lines.push(`1 SEX ${ind.sex}`)
    for (const famId of ind.familiesAsSpouse) {
      lines.push(`1 FAMS ${wrapId(famId)}`)
    }
    if (ind.familyAsChild) {
      lines.push(`1 FAMC ${wrapId(ind.familyAsChild)}`)
    }
    return
  }

  // NAME
  if (ind.givenName || ind.surname || ind.name) {
    if (ind.surname) {
      lines.push(`1 NAME ${sanitizeLine(ind.givenName)} /${sanitizeLine(ind.surname)}/`)
    } else if (ind.givenName) {
      lines.push(`1 NAME ${sanitizeLine(ind.givenName)}`)
    } else if (ind.name) {
      lines.push(`1 NAME ${sanitizeLine(ind.name)}`)
    }
    if (ind.givenName) {
      lines.push(`2 GIVN ${sanitizeLine(ind.givenName)}`)
    }
    if (ind.surname) {
      lines.push(`2 SURN ${sanitizeLine(ind.surname)}`)
    }
  }

  // Kunya
  if (ind.kunya) {
    lines.push(`1 _KUNYA ${sanitizeLine(ind.kunya)}`)
  }

  // SEX
  if (ind.sex) {
    lines.push(`1 SEX ${ind.sex}`)
  }

  // BIRT
  if (hasBirthData(ind)) {
    lines.push('1 BIRT')
    if (ind.birth) {
      lines.push(`2 DATE ${reverseGregorianDate(ind.birth)}`)
    }
    if (ind.birthHijriDate) {
      const reversed = reverseHijriDate(ind.birthHijriDate)
      lines.push(`2 DATE @#DHIJRI@ ${reversed}`)
    }
    if (ind.birthPlace) {
      lines.push(`2 PLAC ${sanitizeLine(ind.birthPlace)}`)
    }
    if (ind.birthDescription) {
      lines.push(`2 CAUS ${sanitizeLine(ind.birthDescription)}`)
    }
    if (ind.birthNotes) {
      emitNote(lines, 2, ind.birthNotes)
    }
  }

  // DEAT
  if (ind.isDeceased || hasDeathData(ind)) {
    if (hasDeathData(ind)) {
      lines.push('1 DEAT')
      if (ind.death) {
        lines.push(`2 DATE ${reverseGregorianDate(ind.death)}`)
      }
      if (ind.deathHijriDate) {
        const reversed = reverseHijriDate(ind.deathHijriDate)
        lines.push(`2 DATE @#DHIJRI@ ${reversed}`)
      }
      if (ind.deathPlace) {
        lines.push(`2 PLAC ${sanitizeLine(ind.deathPlace)}`)
      }
      if (ind.deathDescription) {
        lines.push(`2 CAUS ${sanitizeLine(ind.deathDescription)}`)
      }
      if (ind.deathNotes) {
        emitNote(lines, 2, ind.deathNotes)
      }
    } else {
      lines.push('1 DEAT Y')
    }
  }

  // General notes
  if (ind.notes) {
    emitNote(lines, 1, ind.notes)
  }

  // Family references
  for (const famId of ind.familiesAsSpouse) {
    lines.push(`1 FAMS ${wrapId(famId)}`)
  }
  if (ind.familyAsChild) {
    lines.push(`1 FAMC ${wrapId(ind.familyAsChild)}`)
  }

  // Rada'a family references
  if (ind.radaFamiliesAsChild) {
    for (const rfId of ind.radaFamiliesAsChild) {
      lines.push(`1 _RADA_FAMC ${wrapId(rfId)}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Family serialization
// ---------------------------------------------------------------------------

function emitFamily(
  lines: string[],
  fam: Family,
): void {
  lines.push(`0 ${wrapId(fam.id)} FAM`)

  if (fam.isUmmWalad) {
    lines.push('1 _UMM_WALAD Y')
  }

  if (fam.husband) {
    lines.push(`1 HUSB ${wrapId(fam.husband)}`)
  }
  if (fam.wife) {
    lines.push(`1 WIFE ${wrapId(fam.wife)}`)
  }

  emitFamilyEvent(lines, 'MARC', fam.marriageContract)
  emitFamilyEvent(lines, 'MARR', fam.marriage)

  if (fam.isDivorced) {
    if (hasEventData(fam.divorce)) {
      emitFamilyEvent(lines, 'DIV', fam.divorce)
    } else {
      lines.push('1 DIV Y')
    }
  }

  for (const childId of fam.children) {
    lines.push(`1 CHIL ${wrapId(childId)}`)
  }
}

// ---------------------------------------------------------------------------
// Rada family serialization
// ---------------------------------------------------------------------------

function emitRadaFamily(lines: string[], rf: RadaFamily): void {
  lines.push(`0 ${wrapId(rf.id)} _RADA_FAM`)

  if (rf.fosterFather) {
    lines.push(`1 _RADA_HUSB ${wrapId(rf.fosterFather)}`)
  }
  if (rf.fosterMother) {
    lines.push(`1 _RADA_WIFE ${wrapId(rf.fosterMother)}`)
  }
  for (const childId of rf.children) {
    lines.push(`1 _RADA_CHIL ${wrapId(childId)}`)
  }
  if (rf.notes) {
    emitNote(lines, 1, rf.notes)
  }
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

export function gedcomDataToGedcom(
  data: GedcomData,
  version: '5.5.1' | '7.0',
): string {
  if (version !== '5.5.1' && version !== '7.0') {
    throw new Error(`Unsupported GEDCOM version: ${version}`)
  }

  const lines: string[] = []

  // Export date in GEDCOM format (D MON YYYY)
  const now = new Date()
  const day = now.getDate()
  const monthCodes = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  const exportDate = `${day} ${monthCodes[now.getMonth()]} ${now.getFullYear()}`

  // Header
  lines.push('0 HEAD')

  if (version === '7.0') {
    // GEDCOM 7.0: GEDC must come first in header
    lines.push('1 GEDC')
    lines.push(`2 VERS ${version}`)
    lines.push('1 SOUR Gynat')
    lines.push('2 VERS 1.0')
    lines.push('2 NAME Gynat')
    lines.push(`1 DATE ${exportDate}`)
  } else {
    lines.push('1 SOUR Gynat')
    lines.push('2 VERS 1.0')
    lines.push('2 NAME Gynat')
    lines.push(`1 DATE ${exportDate}`)
    lines.push('1 GEDC')
    lines.push(`2 VERS ${version}`)
    lines.push('2 FORM LINEAGE-LINKED')
    lines.push('1 CHAR UTF-8')
  }

  // 7.0 SCHMA block
  if (version === '7.0') {
    const customTags = collectCustomTags(data)
    if (customTags.size > 0) {
      lines.push('1 SCHMA')
      for (const tag of customTags) {
        const uri = EXT_URIS[tag] || `https://gynat.com/gedcom/ext/${tag}`
        lines.push(`2 TAG ${tag} ${uri}`)
      }
    }
  }

  // Individuals (skip pointed)
  for (const ind of Object.values(data.individuals)) {
    if (ind._pointed) continue
    emitIndividual(lines, ind)
  }

  // Families (skip pointed)
  for (const fam of Object.values(data.families)) {
    if (fam._pointed) continue
    emitFamily(lines, fam)
  }

  // Rada families
  if (data.radaFamilies) {
    for (const rf of Object.values(data.radaFamilies)) {
      emitRadaFamily(lines, rf)
    }
  }

  // Trailer
  lines.push('0 TRLR')

  return lines.join('\n') + '\n'
}

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseGedcom } from '@/lib/gedcom/parser'
import type { GedcomData, Individual, Family, FamilyEvent, RadaFamily } from '@/lib/gedcom/types'
import { gedcomDataToGedcom } from '@/lib/gedcom/exporter'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyEvent(): FamilyEvent {
  return { date: '', hijriDate: '', place: '', description: '', notes: '' }
}

function makeIndividual(overrides: Partial<Individual> & { id: string }): Individual {
  return {
    type: 'INDI',
    name: '',
    givenName: '',
    surname: '',
    sex: null,
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

function makeFamily(overrides: Partial<Family> & { id: string }): Family {
  return {
    type: 'FAM',
    husband: null,
    wife: null,
    children: [],
    marriageContract: emptyEvent(),
    marriage: emptyEvent(),
    divorce: emptyEvent(),
    isDivorced: false,
    ...overrides,
  }
}

function makeRadaFamily(overrides: Partial<RadaFamily> & { id: string }): RadaFamily {
  return {
    type: '_RADA_FAM',
    fosterFather: null,
    fosterMother: null,
    children: [],
    notes: '',
    ...overrides,
  }
}

function makeData(
  individuals: Record<string, Individual> = {},
  families: Record<string, Family> = {},
  radaFamilies?: Record<string, RadaFamily>,
): GedcomData {
  const data: GedcomData = { individuals, families }
  if (radaFamilies) data.radaFamilies = radaFamilies
  return data
}

/** Get all non-empty, non-comment lines from exported GEDCOM text */
function getLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/).filter((l) => l.trim() !== '')
}

/** Check if the exported text contains a specific line (trimmed) */
function hasLine(text: string, line: string): boolean {
  return getLines(text).some((l) => l.trim() === line.trim())
}

/** Get all lines matching a pattern */
function linesMatching(text: string, pattern: RegExp): string[] {
  return getLines(text).filter((l) => pattern.test(l))
}

// ============================================================================
// 1. Version parameter & validation
// ============================================================================

describe('gedcomDataToGedcom — version parameter', () => {
  const data = makeData()

  it('accepts version "5.5.1"', () => {
    const result = gedcomDataToGedcom(data, '5.5.1')
    expect(typeof result).toBe('string')
    expect(result).toContain('0 HEAD')
  })

  it('accepts version "7.0"', () => {
    const result = gedcomDataToGedcom(data, '7.0')
    expect(typeof result).toBe('string')
    expect(result).toContain('0 HEAD')
  })

  it('throws for invalid version', () => {
    expect(() => gedcomDataToGedcom(data, '6.0' as never)).toThrow()
  })

  it('throws for empty string version', () => {
    expect(() => gedcomDataToGedcom(data, '' as never)).toThrow()
  })
})

// ============================================================================
// 2. GEDCOM 5.5.1 header
// ============================================================================

describe('gedcomDataToGedcom — 5.5.1 header', () => {
  const data = makeData()
  let text: string

  beforeAll(() => {
    text = gedcomDataToGedcom(data, '5.5.1')
  })

  it('starts with 0 HEAD', () => {
    expect(getLines(text)[0]).toBe('0 HEAD')
  })

  it('contains SOUR Solalah with sub-tags', () => {
    expect(hasLine(text, '1 SOUR Solalah')).toBe(true)
    expect(hasLine(text, '2 VERS 1.0')).toBe(true)
    expect(hasLine(text, '2 NAME Solalah')).toBe(true)
  })

  it('contains DATE with current export date', () => {
    expect(linesMatching(text, /^1 DATE /)).toHaveLength(1)
  })

  it('contains GEDC with VERS 5.5.1', () => {
    expect(hasLine(text, '1 GEDC')).toBe(true)
    expect(hasLine(text, '2 VERS 5.5.1')).toBe(true)
  })

  it('has SOUR before GEDC in 5.5.1', () => {
    const lines = getLines(text)
    const sourIdx = lines.findIndex((l) => l === '1 SOUR Solalah')
    const gedcIdx = lines.findIndex((l) => l === '1 GEDC')
    expect(sourIdx).toBeLessThan(gedcIdx)
  })

  it('contains FORM LINEAGE-LINKED', () => {
    expect(hasLine(text, '2 FORM LINEAGE-LINKED')).toBe(true)
  })

  it('contains CHAR UTF-8', () => {
    expect(hasLine(text, '1 CHAR UTF-8')).toBe(true)
  })

  it('ends with 0 TRLR', () => {
    const lines = getLines(text)
    expect(lines[lines.length - 1]).toBe('0 TRLR')
  })
})

// ============================================================================
// 3. GEDCOM 7.0 header
// ============================================================================

describe('gedcomDataToGedcom — 7.0 header', () => {
  const data = makeData()
  let text: string

  beforeAll(() => {
    text = gedcomDataToGedcom(data, '7.0')
  })

  it('starts with 0 HEAD', () => {
    expect(getLines(text)[0]).toBe('0 HEAD')
  })

  it('contains GEDC with VERS 7.0', () => {
    expect(hasLine(text, '1 GEDC')).toBe(true)
    expect(hasLine(text, '2 VERS 7.0')).toBe(true)
  })

  it('has GEDC before SOUR in 7.0', () => {
    const lines = getLines(text)
    const gedcIdx = lines.findIndex((l) => l === '1 GEDC')
    const sourIdx = lines.findIndex((l) => l === '1 SOUR Solalah')
    expect(gedcIdx).toBeLessThan(sourIdx)
  })

  it('contains SOUR Solalah with sub-tags', () => {
    expect(hasLine(text, '1 SOUR Solalah')).toBe(true)
    expect(hasLine(text, '2 VERS 1.0')).toBe(true)
    expect(hasLine(text, '2 NAME Solalah')).toBe(true)
  })

  it('contains DATE with current export date', () => {
    expect(linesMatching(text, /^1 DATE /)).toHaveLength(1)
  })

  it('does NOT contain FORM LINEAGE-LINKED', () => {
    expect(hasLine(text, '2 FORM LINEAGE-LINKED')).toBe(false)
  })

  it('does NOT contain CHAR UTF-8', () => {
    expect(hasLine(text, '1 CHAR UTF-8')).toBe(false)
  })

  it('ends with 0 TRLR', () => {
    const lines = getLines(text)
    expect(lines[lines.length - 1]).toBe('0 TRLR')
  })
})

// ============================================================================
// 4. Empty data
// ============================================================================

describe('gedcomDataToGedcom — empty data', () => {
  it('5.5.1: produces HEAD + TRLR only for empty GedcomData', () => {
    const text = gedcomDataToGedcom(makeData(), '5.5.1')
    const lines = getLines(text)
    expect(lines[0]).toBe('0 HEAD')
    expect(lines[lines.length - 1]).toBe('0 TRLR')
    // No INDI or FAM records
    expect(linesMatching(text, /^0 .+@ INDI$/)).toHaveLength(0)
    expect(linesMatching(text, /^0 .+@ FAM$/)).toHaveLength(0)
  })

  it('7.0: produces HEAD + TRLR only for empty GedcomData', () => {
    const text = gedcomDataToGedcom(makeData(), '7.0')
    const lines = getLines(text)
    expect(lines[0]).toBe('0 HEAD')
    expect(lines[lines.length - 1]).toBe('0 TRLR')
    expect(linesMatching(text, /^0 .+@ INDI$/)).toHaveLength(0)
    expect(linesMatching(text, /^0 .+@ FAM$/)).toHaveLength(0)
  })
})

// ============================================================================
// 5. Individual export — names
// ============================================================================

describe('gedcomDataToGedcom — individual names', () => {
  it('exports given name and surname in NAME tag with slashes', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', name: 'Ahmad Saeed', givenName: 'Ahmad', surname: 'Saeed' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 NAME Ahmad /Saeed/')).toBe(true)
  })

  it('exports given name only when no surname', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', name: 'Ahmad', givenName: 'Ahmad', surname: '' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 NAME Ahmad')).toBe(true)
    // Should not have empty slashes
    expect(hasLine(text, '1 NAME Ahmad //')).toBe(false)
  })

  it('exports INDI record even with empty name', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '0 @I1@ INDI')).toBe(true)
  })

  it('exports Arabic names correctly', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', name: 'محمد السعيد', givenName: 'محمد', surname: 'السعيد' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 NAME محمد /السعيد/')).toBe(true)
  })

  it('exports GIVN sub-tag under NAME', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', givenName: 'Ahmad', surname: 'Saeed' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '2 GIVN Ahmad')).toBe(true)
  })

  it('exports SURN sub-tag under NAME', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', givenName: 'Ahmad', surname: 'Saeed' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '2 SURN Saeed')).toBe(true)
  })

  it('exports GIVN and SURN under NAME in correct order', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', givenName: 'محمد', surname: 'السعيد' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    const lines = getLines(text)
    const nameIdx = lines.findIndex((l) => l.startsWith('1 NAME'))
    const givnIdx = lines.findIndex((l) => l === '2 GIVN محمد')
    const surnIdx = lines.findIndex((l) => l === '2 SURN السعيد')
    expect(givnIdx).toBe(nameIdx + 1)
    expect(surnIdx).toBe(nameIdx + 2)
  })

  it('exports GIVN without SURN when no surname', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', givenName: 'Ahmad', surname: '' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '2 GIVN Ahmad')).toBe(true)
    expect(linesMatching(text, /^2 SURN/)).toHaveLength(0)
  })

  it('exports GIVN and SURN in 7.0 as well', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', givenName: 'Ahmad', surname: 'Saeed' }),
    })
    const text = gedcomDataToGedcom(data, '7.0')
    expect(hasLine(text, '2 GIVN Ahmad')).toBe(true)
    expect(hasLine(text, '2 SURN Saeed')).toBe(true)
  })
})

// ============================================================================
// 6. Individual export — sex
// ============================================================================

describe('gedcomDataToGedcom — SEX tag', () => {
  it('exports SEX M', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', sex: 'M' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 SEX M')).toBe(true)
  })

  it('exports SEX F', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', sex: 'F' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 SEX F')).toBe(true)
  })

  it('omits SEX when null', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', sex: null }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(linesMatching(text, /1 SEX/)).toHaveLength(0)
  })
})

// ============================================================================
// 7. Individual export — birth/death Gregorian dates
// ============================================================================

describe('gedcomDataToGedcom — Gregorian dates', () => {
  it('exports BIRT with DATE and PLAC', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', birth: '01/01/1990', birthPlace: 'Mecca' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 BIRT')).toBe(true)
    expect(hasLine(text, '2 DATE 1 JAN 1990')).toBe(true)
    expect(hasLine(text, '2 PLAC Mecca')).toBe(true)
  })

  it('exports DEAT with DATE and PLAC', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', isDeceased: true, death: '15/03/2020', deathPlace: 'Jeddah' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 DEAT')).toBe(true)
    expect(hasLine(text, '2 DATE 15 MAR 2020')).toBe(true)
    expect(hasLine(text, '2 PLAC Jeddah')).toBe(true)
  })

  it('exports DEAT Y for deceased individual with no death date', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', isDeceased: true, death: '' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 DEAT Y')).toBe(true)
  })

  it('omits DEAT entirely for non-deceased individual', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', isDeceased: false, death: '' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(linesMatching(text, /DEAT/)).toHaveLength(0)
  })

  it('exports year-only date as-is', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', birth: '1950' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '2 DATE 1950')).toBe(true)
  })

  it('exports month/year date correctly', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', birth: '06/1990' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '2 DATE JUN 1990')).toBe(true)
  })

  it('reverses DD/MM/YYYY to D MON YYYY (strips leading zero from day)', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', birth: '03/07/2000' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '2 DATE 3 JUL 2000')).toBe(true)
  })

  it('handles Arabic place names', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', birth: '01/01/1990', birthPlace: 'مكة المكرمة، السعودية' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '2 PLAC مكة المكرمة، السعودية')).toBe(true)
  })
})

// ============================================================================
// 8. Individual export — birth/death notes and descriptions
// ============================================================================

describe('gedcomDataToGedcom — birth/death notes and descriptions', () => {
  it('exports birthNotes as NOTE under BIRT', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', birth: '01/01/1990', birthNotes: 'Born at home' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '2 NOTE Born at home')).toBe(true)
  })

  it('exports deathNotes as NOTE under DEAT', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', isDeceased: true, death: '01/01/2020', deathNotes: 'Died peacefully' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '2 NOTE Died peacefully')).toBe(true)
  })

  it('exports birthDescription as CAUS under BIRT', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', birth: '01/01/1990', birthDescription: 'Natural birth' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '2 CAUS Natural birth')).toBe(true)
  })

  it('exports deathDescription as CAUS under DEAT', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', isDeceased: true, death: '01/01/2020', deathDescription: 'Heart attack' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '2 CAUS Heart attack')).toBe(true)
  })
})

// ============================================================================
// 9. Individual export — general notes
// ============================================================================

describe('gedcomDataToGedcom — general notes', () => {
  it('exports general notes as level 1 NOTE', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', notes: 'General note about this person' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 NOTE General note about this person')).toBe(true)
  })

  it('exports multi-line notes with CONT tags', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', notes: 'Line 1\nLine 2\nLine 3' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 NOTE Line 1')).toBe(true)
    expect(hasLine(text, '2 CONT Line 2')).toBe(true)
    expect(hasLine(text, '2 CONT Line 3')).toBe(true)
  })

  it('exports multi-line birthNotes with CONT tags at level 3', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', birth: '1990', birthNotes: 'First line\nSecond line' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '2 NOTE First line')).toBe(true)
    expect(hasLine(text, '3 CONT Second line')).toBe(true)
  })

  it('omits NOTE when notes are empty', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', notes: '' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(linesMatching(text, /1 NOTE/)).toHaveLength(0)
  })
})

// ============================================================================
// 10. Individual export — family references
// ============================================================================

describe('gedcomDataToGedcom — family references', () => {
  it('exports FAMS references', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', familiesAsSpouse: ['F1', 'F2'] }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 FAMS @F1@')).toBe(true)
    expect(hasLine(text, '1 FAMS @F2@')).toBe(true)
  })

  it('exports FAMC reference', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', familyAsChild: 'F1' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 FAMC @F1@')).toBe(true)
  })

  it('omits FAMC when familyAsChild is null', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', familyAsChild: null }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(linesMatching(text, /1 FAMC/)).toHaveLength(0)
  })

  it('wraps IDs in @ delimiters for FAMS/FAMC', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', familiesAsSpouse: ['fam-uuid-1'], familyAsChild: 'fam-uuid-2' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 FAMS @fam-uuid-1@')).toBe(true)
    expect(hasLine(text, '1 FAMC @fam-uuid-2@')).toBe(true)
  })
})

// ============================================================================
// 11. Hijri dates — 5.5.1 (@#DHIJRI@ prefix)
// ============================================================================

describe('gedcomDataToGedcom — 5.5.1 Hijri dates', () => {
  it('exports birthHijriDate as DATE @#DHIJRI@', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', birthHijriDate: '15/01/1410' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '2 DATE @#DHIJRI@ 15 MUHAR 1410')).toBe(true)
  })

  it('exports deathHijriDate as DATE @#DHIJRI@', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', isDeceased: true, deathHijriDate: '20/07/1441' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '2 DATE @#DHIJRI@ 20 RAJAB 1441')).toBe(true)
  })

  it('exports both Gregorian and Hijri birth dates (dual DATE lines)', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', birth: '01/01/1990', birthHijriDate: '15/05/1410' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '2 DATE 1 JAN 1990')).toBe(true)
    expect(hasLine(text, '2 DATE @#DHIJRI@ 15 JUMAA 1410')).toBe(true)
  })

  it('exports month-year only Hijri date', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', birthHijriDate: '02/1410' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '2 DATE @#DHIJRI@ SAFAR 1410')).toBe(true)
  })

  it('exports year-only Hijri date', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', birthHijriDate: '1410' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '2 DATE @#DHIJRI@ 1410')).toBe(true)
  })

  it('exports all 12 Hijri month codes correctly', () => {
    const months: [string, string][] = [
      ['01', 'MUHAR'], ['02', 'SAFAR'], ['03', 'RABIA'], ['04', 'RABIT'],
      ['05', 'JUMAA'], ['06', 'JUMAT'], ['07', 'RAJAB'], ['08', 'SHAAB'],
      ['09', 'RAMAD'], ['10', 'SHAWW'], ['11', 'DHUAQ'], ['12', 'DHUAH'],
    ]
    for (const [num, code] of months) {
      const data = makeData({
        'I1': makeIndividual({ id: 'I1', birthHijriDate: `01/${num}/1440` }),
      })
      const text = gedcomDataToGedcom(data, '5.5.1')
      expect(hasLine(text, `2 DATE @#DHIJRI@ 1 ${code} 1440`)).toBe(true)
    }
  })
})

// ============================================================================
// 12. Hijri dates — 7.0 (uses @#DHIJRI@ same as 5.5.1)
// ============================================================================

describe('gedcomDataToGedcom — 7.0 Hijri dates', () => {
  it('exports birthHijriDate as DATE @#DHIJRI@ (same as 5.5.1)', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', birthHijriDate: '15/01/1410' }),
    })
    const text = gedcomDataToGedcom(data, '7.0')
    expect(hasLine(text, '2 DATE @#DHIJRI@ 15 MUHAR 1410')).toBe(true)
  })

  it('exports Gregorian date as standard DATE line in 7.0', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', birth: '01/01/1990' }),
    })
    const text = gedcomDataToGedcom(data, '7.0')
    expect(hasLine(text, '2 DATE 1 JAN 1990')).toBe(true)
  })

  it('exports both Gregorian and Hijri as dual DATE lines in 7.0', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', birth: '01/01/1990', birthHijriDate: '15/05/1410' }),
    })
    const text = gedcomDataToGedcom(data, '7.0')
    expect(hasLine(text, '2 DATE 1 JAN 1990')).toBe(true)
    expect(hasLine(text, '2 DATE @#DHIJRI@ 15 JUMAA 1410')).toBe(true)
  })

  it('exports month-year only Hijri date in 7.0', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', birthHijriDate: '02/1410' }),
    })
    const text = gedcomDataToGedcom(data, '7.0')
    expect(hasLine(text, '2 DATE @#DHIJRI@ SAFAR 1410')).toBe(true)
  })

  it('exports year-only Hijri date in 7.0', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', birthHijriDate: '1410' }),
    })
    const text = gedcomDataToGedcom(data, '7.0')
    expect(hasLine(text, '2 DATE @#DHIJRI@ 1410')).toBe(true)
  })

  it('exports all 12 Hijri month codes in 7.0 format', () => {
    const months: [string, string][] = [
      ['01', 'MUHAR'], ['02', 'SAFAR'], ['03', 'RABIA'], ['04', 'RABIT'],
      ['05', 'JUMAA'], ['06', 'JUMAT'], ['07', 'RAJAB'], ['08', 'SHAAB'],
      ['09', 'RAMAD'], ['10', 'SHAWW'], ['11', 'DHUAQ'], ['12', 'DHUAH'],
    ]
    for (const [num, code] of months) {
      const data = makeData({
        'I1': makeIndividual({ id: 'I1', birthHijriDate: `01/${num}/1440` }),
      })
      const text = gedcomDataToGedcom(data, '7.0')
      expect(hasLine(text, `2 DATE @#DHIJRI@ 1 ${code} 1440`)).toBe(true)
    }
  })

  it('exports Hijri dates on family events in 7.0 with @#DHIJRI@', () => {
    const data = makeData({}, {
      'F1': makeFamily({
        id: 'F1',
        marriageContract: { ...emptyEvent(), hijriDate: '12/12/1443' },
      }),
    })
    const text = gedcomDataToGedcom(data, '7.0')
    expect(hasLine(text, '2 DATE @#DHIJRI@ 12 DHUAH 1443')).toBe(true)
  })
})

// ============================================================================
// 13. Family export — structure
// ============================================================================

describe('gedcomDataToGedcom — family structure', () => {
  it('exports HUSB and WIFE references', () => {
    const data = makeData({}, {
      'F1': makeFamily({ id: 'F1', husband: 'I1', wife: 'I2' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '0 @F1@ FAM')).toBe(true)
    expect(hasLine(text, '1 HUSB @I1@')).toBe(true)
    expect(hasLine(text, '1 WIFE @I2@')).toBe(true)
  })

  it('exports CHIL references for all children', () => {
    const data = makeData({}, {
      'F1': makeFamily({ id: 'F1', children: ['I3', 'I4'] }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 CHIL @I3@')).toBe(true)
    expect(hasLine(text, '1 CHIL @I4@')).toBe(true)
  })

  it('exports family with no husband (wife-only)', () => {
    const data = makeData({}, {
      'F1': makeFamily({ id: 'F1', husband: null, wife: 'I2', children: ['I3'] }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 WIFE @I2@')).toBe(true)
    expect(linesMatching(text, /1 HUSB/)).toHaveLength(0)
  })

  it('exports family with no wife (husband-only)', () => {
    const data = makeData({}, {
      'F1': makeFamily({ id: 'F1', husband: 'I1', wife: null }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 HUSB @I1@')).toBe(true)
    expect(linesMatching(text, /1 WIFE/)).toHaveLength(0)
  })

  it('exports family with no children', () => {
    const data = makeData({}, {
      'F1': makeFamily({ id: 'F1', husband: 'I1', wife: 'I2', children: [] }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(linesMatching(text, /1 CHIL/)).toHaveLength(0)
  })
})

// ============================================================================
// 14. Family export — marriage events (MARC/MARR/DIV)
// ============================================================================

describe('gedcomDataToGedcom — marriage events', () => {
  it('exports MARC with DATE and PLAC', () => {
    const data = makeData({}, {
      'F1': makeFamily({
        id: 'F1',
        marriageContract: { ...emptyEvent(), date: '11/07/2022', place: 'Riyadh' },
      }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 MARC')).toBe(true)
    expect(hasLine(text, '2 DATE 11 JUL 2022')).toBe(true)
    expect(hasLine(text, '2 PLAC Riyadh')).toBe(true)
  })

  it('exports MARR with DATE and PLAC', () => {
    const data = makeData({}, {
      'F1': makeFamily({
        id: 'F1',
        marriage: { ...emptyEvent(), date: '15/09/2022', place: 'Jeddah' },
      }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 MARR')).toBe(true)
    expect(hasLine(text, '2 DATE 15 SEP 2022')).toBe(true)
    expect(hasLine(text, '2 PLAC Jeddah')).toBe(true)
  })

  it('exports DIV with DATE when isDivorced and has divorce date', () => {
    const data = makeData({}, {
      'F1': makeFamily({
        id: 'F1',
        isDivorced: true,
        divorce: { ...emptyEvent(), date: '01/03/2021', place: 'Dammam' },
      }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 DIV')).toBe(true)
    expect(hasLine(text, '2 DATE 1 MAR 2021')).toBe(true)
    expect(hasLine(text, '2 PLAC Dammam')).toBe(true)
  })

  it('exports DIV Y when isDivorced but no divorce details', () => {
    const data = makeData({}, {
      'F1': makeFamily({
        id: 'F1',
        isDivorced: true,
        divorce: emptyEvent(),
      }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 DIV Y')).toBe(true)
  })

  it('omits DIV entirely when isDivorced is false', () => {
    const data = makeData({}, {
      'F1': makeFamily({
        id: 'F1',
        isDivorced: false,
        divorce: emptyEvent(),
      }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(linesMatching(text, /DIV/)).toHaveLength(0)
  })

  it('exports Hijri dates on MARC/MARR/DIV as @#DHIJRI@ in 5.5.1', () => {
    const data = makeData({}, {
      'F1': makeFamily({
        id: 'F1',
        marriageContract: { ...emptyEvent(), hijriDate: '12/12/1443' },
        marriage: { ...emptyEvent(), hijriDate: '07/10/1444' },
        isDivorced: true,
        divorce: { ...emptyEvent(), hijriDate: '15/06/1445' },
      }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '2 DATE @#DHIJRI@ 12 DHUAH 1443')).toBe(true)
    expect(hasLine(text, '2 DATE @#DHIJRI@ 7 SHAWW 1444')).toBe(true)
    expect(hasLine(text, '2 DATE @#DHIJRI@ 15 JUMAT 1445')).toBe(true)
  })

  it('exports both Gregorian and Hijri dates on same family event', () => {
    const data = makeData({}, {
      'F1': makeFamily({
        id: 'F1',
        marriageContract: { ...emptyEvent(), date: '11/07/2022', hijriDate: '12/12/1443' },
      }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '2 DATE 11 JUL 2022')).toBe(true)
    expect(hasLine(text, '2 DATE @#DHIJRI@ 12 DHUAH 1443')).toBe(true)
  })

  it('exports NOTE under MARC/MARR/DIV', () => {
    const data = makeData({}, {
      'F1': makeFamily({
        id: 'F1',
        marriageContract: { ...emptyEvent(), notes: 'Contract signed at home' },
        marriage: { ...emptyEvent(), notes: 'Large celebration' },
        isDivorced: true,
        divorce: { ...emptyEvent(), notes: 'Mutual decision' },
      }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    // Need at least these note lines present
    expect(text).toContain('2 NOTE Contract signed at home')
    expect(text).toContain('2 NOTE Large celebration')
    expect(text).toContain('2 NOTE Mutual decision')
  })

  it('omits MARC when all event fields are empty', () => {
    const data = makeData({}, {
      'F1': makeFamily({
        id: 'F1',
        marriageContract: emptyEvent(),
      }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(linesMatching(text, /MARC/)).toHaveLength(0)
  })

  it('omits MARR when all event fields are empty', () => {
    const data = makeData({}, {
      'F1': makeFamily({
        id: 'F1',
        marriage: emptyEvent(),
      }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(linesMatching(text, /MARR/)).toHaveLength(0)
  })

  it('exports description inline on MARC', () => {
    const data = makeData({}, {
      'F1': makeFamily({
        id: 'F1',
        marriageContract: { ...emptyEvent(), description: '12/2/1443' },
      }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    // Description should be captured either inline or as sub-tag
    expect(text).toContain('12/2/1443')
  })
})

// ============================================================================
// 15. Islamic extensions — _UMM_WALAD
// ============================================================================

describe('gedcomDataToGedcom — _UMM_WALAD', () => {
  it('exports _UMM_WALAD Y on family with isUmmWalad: true', () => {
    const data = makeData({}, {
      'F1': makeFamily({ id: 'F1', isUmmWalad: true, husband: 'I1', wife: 'I2' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 _UMM_WALAD Y')).toBe(true)
  })

  it('omits _UMM_WALAD when isUmmWalad is false', () => {
    const data = makeData({}, {
      'F1': makeFamily({ id: 'F1', isUmmWalad: false }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(linesMatching(text, /_UMM_WALAD/)).toHaveLength(0)
  })

  it('omits _UMM_WALAD when isUmmWalad is undefined', () => {
    const fam = makeFamily({ id: 'F1' })
    delete (fam as { isUmmWalad?: boolean }).isUmmWalad
    const data = makeData({}, { 'F1': fam })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(linesMatching(text, /_UMM_WALAD/)).toHaveLength(0)
  })

  it('7.0: exports _UMM_WALAD Y and includes SCHMA declaration', () => {
    const data = makeData({}, {
      'F1': makeFamily({ id: 'F1', isUmmWalad: true }),
    })
    const text = gedcomDataToGedcom(data, '7.0')
    expect(hasLine(text, '1 _UMM_WALAD Y')).toBe(true)
    // SCHMA block should declare _UMM_WALAD
    expect(text).toContain('1 SCHMA')
    expect(text).toMatch(/2 TAG _UMM_WALAD/)
  })
})

// ============================================================================
// 16. Islamic extensions — Rada'a (_RADA_FAM)
// ============================================================================

describe('gedcomDataToGedcom — rada\'a (_RADA_FAM)', () => {
  it('exports _RADA_FAM records with _RADA_HUSB and _RADA_WIFE', () => {
    const data = makeData(
      {
        'I1': makeIndividual({ id: 'I1', sex: 'M' }),
        'I2': makeIndividual({ id: 'I2', sex: 'F' }),
        'I3': makeIndividual({ id: 'I3' }),
      },
      {},
      {
        'RF1': makeRadaFamily({ id: 'RF1', fosterFather: 'I1', fosterMother: 'I2', children: ['I3'] }),
      },
    )
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '0 @RF1@ _RADA_FAM')).toBe(true)
    expect(hasLine(text, '1 _RADA_HUSB @I1@')).toBe(true)
    expect(hasLine(text, '1 _RADA_WIFE @I2@')).toBe(true)
  })

  it('exports _RADA_CHIL for each child in rada family', () => {
    const data = makeData(
      {
        'I3': makeIndividual({ id: 'I3' }),
        'I4': makeIndividual({ id: 'I4' }),
      },
      {},
      {
        'RF1': makeRadaFamily({ id: 'RF1', children: ['I3', 'I4'] }),
      },
    )
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 _RADA_CHIL @I3@')).toBe(true)
    expect(hasLine(text, '1 _RADA_CHIL @I4@')).toBe(true)
  })

  it('exports _RADA_FAMC on individuals who are rada children', () => {
    const data = makeData(
      {
        'I3': makeIndividual({ id: 'I3', radaFamiliesAsChild: ['RF1'] }),
      },
      {},
      {
        'RF1': makeRadaFamily({ id: 'RF1', children: ['I3'] }),
      },
    )
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 _RADA_FAMC @RF1@')).toBe(true)
  })

  it('exports multiple _RADA_FAMC on individual in multiple rada families', () => {
    const data = makeData(
      {
        'I3': makeIndividual({ id: 'I3', radaFamiliesAsChild: ['RF1', 'RF2'] }),
      },
      {},
      {
        'RF1': makeRadaFamily({ id: 'RF1', children: ['I3'] }),
        'RF2': makeRadaFamily({ id: 'RF2', children: ['I3'] }),
      },
    )
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 _RADA_FAMC @RF1@')).toBe(true)
    expect(hasLine(text, '1 _RADA_FAMC @RF2@')).toBe(true)
  })

  it('exports rada family notes', () => {
    const data = makeData({}, {}, {
      'RF1': makeRadaFamily({ id: 'RF1', notes: 'Some rada note' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(text).toContain('1 NOTE Some rada note')
  })

  it('omits _RADA_FAM section when no rada families exist', () => {
    const data = makeData({ 'I1': makeIndividual({ id: 'I1' }) })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(linesMatching(text, /_RADA_FAM/)).toHaveLength(0)
  })

  it('exports rada family with no foster father (mother only)', () => {
    const data = makeData({}, {}, {
      'RF1': makeRadaFamily({ id: 'RF1', fosterFather: null, fosterMother: 'I2', children: ['I3'] }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 _RADA_WIFE @I2@')).toBe(true)
    expect(linesMatching(text, /_RADA_HUSB/)).toHaveLength(0)
  })

  it('exports rada family with no foster mother (father only)', () => {
    const data = makeData({}, {}, {
      'RF1': makeRadaFamily({ id: 'RF1', fosterFather: 'I1', fosterMother: null, children: ['I3'] }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 _RADA_HUSB @I1@')).toBe(true)
    expect(linesMatching(text, /_RADA_WIFE/)).toHaveLength(0)
  })

  it('7.0: exports _RADA_FAM with SCHMA declarations', () => {
    const data = makeData(
      { 'I3': makeIndividual({ id: 'I3', radaFamiliesAsChild: ['RF1'] }) },
      {},
      { 'RF1': makeRadaFamily({ id: 'RF1', fosterFather: 'I1', fosterMother: 'I2', children: ['I3'] }) },
    )
    const text = gedcomDataToGedcom(data, '7.0')
    expect(hasLine(text, '0 @RF1@ _RADA_FAM')).toBe(true)
    expect(text).toContain('1 SCHMA')
    expect(text).toMatch(/2 TAG _RADA_FAM/)
    expect(text).toMatch(/2 TAG _RADA_HUSB/)
    expect(text).toMatch(/2 TAG _RADA_WIFE/)
    expect(text).toMatch(/2 TAG _RADA_CHIL/)
    expect(text).toMatch(/2 TAG _RADA_FAMC/)
  })
})

// ============================================================================
// 17. SCHMA block (7.0 only)
// ============================================================================

describe('gedcomDataToGedcom — 7.0 SCHMA block', () => {
  it('includes SCHMA when custom tags are used', () => {
    const data = makeData({}, {
      'F1': makeFamily({ id: 'F1', isUmmWalad: true }),
    })
    const text = gedcomDataToGedcom(data, '7.0')
    expect(text).toContain('1 SCHMA')
  })

  it('SCHMA includes _UMM_WALAD when any family has isUmmWalad: true', () => {
    const data = makeData({}, {
      'F1': makeFamily({ id: 'F1', isUmmWalad: true }),
    })
    const text = gedcomDataToGedcom(data, '7.0')
    expect(text).toMatch(/2 TAG _UMM_WALAD/)
  })

  it('SCHMA includes _RADA_* tags when rada families exist', () => {
    const data = makeData({}, {}, {
      'RF1': makeRadaFamily({ id: 'RF1', fosterFather: 'I1', fosterMother: 'I2', children: ['I3'] }),
    })
    const text = gedcomDataToGedcom(data, '7.0')
    expect(text).toMatch(/2 TAG _RADA_FAM/)
    expect(text).toMatch(/2 TAG _RADA_HUSB/)
    expect(text).toMatch(/2 TAG _RADA_WIFE/)
    expect(text).toMatch(/2 TAG _RADA_CHIL/)
  })

  it('SCHMA omits _RADA_* tags when no rada families in data', () => {
    const data = makeData({}, {
      'F1': makeFamily({ id: 'F1', isUmmWalad: true }),
    })
    const text = gedcomDataToGedcom(data, '7.0')
    expect(text).not.toMatch(/2 TAG _RADA_FAM/)
    expect(text).not.toMatch(/2 TAG _RADA_CHIL/)
  })

  it('SCHMA omits _UMM_WALAD when no umm walad families', () => {
    const data = makeData({}, {}, {
      'RF1': makeRadaFamily({ id: 'RF1', children: ['I3'] }),
    })
    const text = gedcomDataToGedcom(data, '7.0')
    expect(text).not.toMatch(/2 TAG _UMM_WALAD/)
  })

  it('omits SCHMA entirely when no custom tags needed', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', name: 'Ahmad', givenName: 'Ahmad', sex: 'M' }),
    })
    const text = gedcomDataToGedcom(data, '7.0')
    expect(text).not.toContain('1 SCHMA')
  })

  it('each SCHMA entry has format: 2 TAG _TAG_NAME uri', () => {
    const data = makeData({}, {
      'F1': makeFamily({ id: 'F1', isUmmWalad: true }),
    })
    const text = gedcomDataToGedcom(data, '7.0')
    const schmaLines = linesMatching(text, /^2 TAG _/)
    expect(schmaLines.length).toBeGreaterThan(0)
    for (const line of schmaLines) {
      // Format: "2 TAG _NAME uri"
      expect(line).toMatch(/^2 TAG _\S+ \S+/)
    }
  })

  it('5.5.1 does NOT include SCHMA block', () => {
    const data = makeData({}, {
      'F1': makeFamily({ id: 'F1', isUmmWalad: true }),
    }, {
      'RF1': makeRadaFamily({ id: 'RF1', children: ['I3'] }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(text).not.toContain('SCHMA')
  })
})

// ============================================================================
// 18. Privacy redaction
// ============================================================================

describe('gedcomDataToGedcom — privacy redaction', () => {
  it('redacts private individuals: name → PRIVATE, no dates/places', () => {
    const data = makeData({
      'I1': makeIndividual({
        id: 'I1',
        name: 'Secret Person',
        givenName: 'Secret',
        surname: 'Person',
        sex: 'M',
        birth: '01/01/1990',
        birthPlace: 'Mecca',
        birthHijriDate: '15/05/1410',
        birthNotes: 'Some note',
        birthDescription: 'Some desc',
        death: '01/01/2020',
        deathPlace: 'Jeddah',
        deathHijriDate: '07/05/1441',
        deathNotes: 'Death note',
        deathDescription: 'Cause',
        notes: 'General notes',
        isDeceased: true,
        isPrivate: true,
        familiesAsSpouse: ['F1'],
        familyAsChild: 'F2',
      }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')

    // Name should be redacted
    expect(hasLine(text, '1 NAME PRIVATE')).toBe(true)
    expect(text).not.toContain('Secret')

    // Dates and places should NOT be present
    expect(text).not.toContain('Mecca')
    expect(text).not.toContain('Jeddah')
    expect(text).not.toContain('1 JAN 1990')
    expect(text).not.toContain('1 JAN 2020')
    expect(text).not.toContain('Some note')
    expect(text).not.toContain('General notes')
  })

  it('preserves structural references (FAMS, FAMC) for private individuals', () => {
    const data = makeData({
      'I1': makeIndividual({
        id: 'I1',
        isPrivate: true,
        sex: 'M',
        familiesAsSpouse: ['F1'],
        familyAsChild: 'F2',
      }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')

    // Structural data should remain
    expect(hasLine(text, '0 @I1@ INDI')).toBe(true)
    expect(hasLine(text, '1 SEX M')).toBe(true)
    expect(hasLine(text, '1 FAMS @F1@')).toBe(true)
    expect(hasLine(text, '1 FAMC @F2@')).toBe(true)
  })

  it('non-private individuals exported normally alongside private ones', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', isPrivate: true, name: 'Secret', givenName: 'Secret' }),
      'I2': makeIndividual({ id: 'I2', isPrivate: false, name: 'Ahmad', givenName: 'Ahmad', surname: 'Saeed' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')

    expect(hasLine(text, '1 NAME PRIVATE')).toBe(true)
    expect(hasLine(text, '1 NAME Ahmad /Saeed/')).toBe(true)
  })
})

// ============================================================================
// 19. Pointed data exclusion
// ============================================================================

describe('gedcomDataToGedcom — pointed/synthetic data exclusion', () => {
  it('skips individuals with _pointed: true', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', name: 'Ahmad', givenName: 'Ahmad', _pointed: true }),
      'I2': makeIndividual({ id: 'I2', name: 'Fatima', givenName: 'Fatima' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')

    expect(hasLine(text, '0 @I1@ INDI')).toBe(false)
    expect(hasLine(text, '0 @I2@ INDI')).toBe(true)
  })

  it('skips families with _pointed: true', () => {
    const data = makeData({}, {
      'F1': makeFamily({ id: 'F1', husband: 'I1', wife: 'I2', _pointed: true }),
      'F2': makeFamily({ id: 'F2', husband: 'I3', wife: 'I4' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')

    expect(hasLine(text, '0 @F1@ FAM')).toBe(false)
    expect(hasLine(text, '0 @F2@ FAM')).toBe(true)
  })

  it('does not export pointed individuals in 7.0 either', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', name: 'Ahmad', givenName: 'Ahmad', _pointed: true }),
    })
    const text = gedcomDataToGedcom(data, '7.0')
    expect(hasLine(text, '0 @I1@ INDI')).toBe(false)
  })
})

// ============================================================================
// 20. Edge cases
// ============================================================================

describe('gedcomDataToGedcom — edge cases', () => {
  it('handles individual with all empty fields', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '0 @I1@ INDI')).toBe(true)
    // Should not crash, minimal record
  })

  it('handles family with all empty fields', () => {
    const data = makeData({}, {
      'F1': makeFamily({ id: 'F1' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '0 @F1@ FAM')).toBe(true)
  })

  it('wraps IDs in @ delimiters for INDI record', () => {
    const data = makeData({
      'uuid-123': makeIndividual({ id: 'uuid-123' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '0 @uuid-123@ INDI')).toBe(true)
  })

  it('wraps IDs in @ delimiters for FAM record', () => {
    const data = makeData({}, {
      'uuid-456': makeFamily({ id: 'uuid-456' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '0 @uuid-456@ FAM')).toBe(true)
  })

  it('does not double-wrap IDs that already have @ delimiters', () => {
    const data = makeData({
      '@I1@': makeIndividual({ id: '@I1@' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    // Should be @I1@ not @@I1@@
    expect(hasLine(text, '0 @I1@ INDI')).toBe(true)
    expect(text).not.toContain('@@')
  })

  it('exports BIRT block when only birthPlace exists (no date)', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', birth: '', birthPlace: 'Mecca' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 BIRT')).toBe(true)
    expect(hasLine(text, '2 PLAC Mecca')).toBe(true)
  })

  it('exports BIRT block when only birthNotes exists (no date)', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', birth: '', birthNotes: 'Born early' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 BIRT')).toBe(true)
    expect(hasLine(text, '2 NOTE Born early')).toBe(true)
  })

  it('exports BIRT block when only birthHijriDate exists', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', birth: '', birthHijriDate: '15/01/1410' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '1 BIRT')).toBe(true)
    expect(hasLine(text, '2 DATE @#DHIJRI@ 15 MUHAR 1410')).toBe(true)
  })

  it('omits BIRT entirely when no birth data at all', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', birth: '', birthPlace: '', birthHijriDate: '', birthNotes: '', birthDescription: '' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(linesMatching(text, /BIRT/)).toHaveLength(0)
  })

  it('uses consistent line endings (no mixed \\r\\n and \\n)', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', name: 'Ahmad', givenName: 'Ahmad' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    // GEDCOM standard uses \n (or \r\n); there should be no lone \r
    expect(text).not.toMatch(/\r(?!\n)/)
  })
})

// ============================================================================
// 20b. GEDCOM injection prevention
// ============================================================================

describe('gedcomDataToGedcom — GEDCOM injection prevention', () => {
  it('sanitizes newlines in givenName to prevent record injection', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', givenName: 'محمد\n0 @FAKE@ INDI\n1 NAME Injected', surname: 'السعيد' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    // The injected record should NOT appear as a separate INDI line
    const indiLines = getLines(text).filter((l) => /^0 .+ INDI$/.test(l))
    expect(indiLines).toHaveLength(1) // only the real I1
    // Newlines replaced with spaces, @ stripped
    expect(hasLine(text, '1 NAME محمد 0 FAKE INDI 1 NAME Injected /السعيد/')).toBe(true)
  })

  it('sanitizes newlines in surname', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', givenName: 'Ahmad', surname: 'Test\nInjected' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(text).not.toMatch(/^Injected$/m)
    expect(text).toContain('/Test Injected/')
  })

  it('strips @ characters from names to prevent cross-reference injection', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', givenName: 'Name @F99@ here', surname: '' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(text).not.toContain('@F99@')
    expect(text).toContain('1 NAME Name F99 here')
  })

  it('sanitizes newlines in birthPlace', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', birth: '1990', birthPlace: 'Mecca\n0 @FAKE@ INDI' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(text).not.toContain('0 @FAKE@ INDI')
  })

  it('sanitizes newlines in deathPlace', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', isDeceased: true, death: '2020', deathPlace: 'Place\nInjected' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    const placeLines = getLines(text).filter((l) => l.includes('PLAC'))
    expect(placeLines).toHaveLength(1)
    expect(placeLines[0]).toBe('2 PLAC Place Injected')
  })

  it('sanitizes newlines in birthDescription', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', birth: '1990', birthDescription: 'Desc\nEvil line' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    const causLines = getLines(text).filter((l) => l.includes('CAUS'))
    expect(causLines).toHaveLength(1)
    expect(causLines[0]).toBe('2 CAUS Desc Evil line')
  })

  it('sanitizes newlines in family event description', () => {
    const data = makeData({}, {
      'F1': makeFamily({
        id: 'F1',
        marriageContract: { ...emptyEvent(), description: 'Desc\n0 @FAKE@ FAM' },
      }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(text).not.toContain('0 @FAKE@ FAM')
  })

  it('sanitizes newlines in family event place', () => {
    const data = makeData({}, {
      'F1': makeFamily({
        id: 'F1',
        marriage: { ...emptyEvent(), date: '01/01/2020', place: 'Place\nInjected' },
      }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    const placeLines = getLines(text).filter((l) => l.includes('PLAC'))
    expect(placeLines).toHaveLength(1)
    expect(placeLines[0]).toBe('2 PLAC Place Injected')
  })

  it('sanitizes \\r\\n (CRLF) in names', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', givenName: 'Name\r\nInjected' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(text).toContain('1 NAME Name  Injected')
  })

  it('strips @ from places', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', birth: '1990', birthPlace: 'Place @F99@ ref' }),
    })
    const text = gedcomDataToGedcom(data, '5.5.1')
    expect(hasLine(text, '2 PLAC Place F99 ref')).toBe(true)
    // Verify the @ was stripped from the place value (not checking whole file since IDs use @)
    const placeLines = getLines(text).filter((l) => l.includes('PLAC'))
    expect(placeLines[0]).not.toContain('@')
  })
})

// ============================================================================
// 21. Round-trip test (5.5.1)
// ============================================================================

describe('gedcomDataToGedcom — 5.5.1 round-trip', () => {
  let originalData: GedcomData

  beforeAll(() => {
    const gedcomPath = join(__dirname, 'fixtures/test-family.ged')
    const gedcomText = readFileSync(gedcomPath, 'utf-8')
    originalData = parseGedcom(gedcomText)
  })

  it('round-trips the test fixture: parse → export → parse → compare', () => {
    const exported = gedcomDataToGedcom(originalData, '5.5.1')
    const reparsed = parseGedcom(exported)

    // Same number of individuals
    const origIds = Object.keys(originalData.individuals).sort()
    const reparsedIds = Object.keys(reparsed.individuals).sort()
    expect(reparsedIds).toEqual(origIds)

    // Same number of families
    const origFamIds = Object.keys(originalData.families).sort()
    const reparsedFamIds = Object.keys(reparsed.families).sort()
    expect(reparsedFamIds).toEqual(origFamIds)

    // Compare individual fields
    for (const id of origIds) {
      const orig = originalData.individuals[id]
      const re = reparsed.individuals[id]

      if (orig.isPrivate) {
        // Private individuals are redacted: only structural data survives round-trip
        expect(re.name).toBe('PRIVATE')
        expect(re.isPrivate).toBe(true)
        expect(re.sex).toBe(orig.sex)
        expect(re.familiesAsSpouse.sort()).toEqual(orig.familiesAsSpouse.sort())
        expect(re.familyAsChild).toBe(orig.familyAsChild)
      } else {
        expect(re.name).toBe(orig.name)
        expect(re.givenName).toBe(orig.givenName)
        expect(re.surname).toBe(orig.surname)
        expect(re.sex).toBe(orig.sex)
        expect(re.birth).toBe(orig.birth)
        expect(re.birthPlace).toBe(orig.birthPlace)
        expect(re.death).toBe(orig.death)
        expect(re.deathPlace).toBe(orig.deathPlace)
        expect(re.isDeceased).toBe(orig.isDeceased)
        expect(re.familiesAsSpouse.sort()).toEqual(orig.familiesAsSpouse.sort())
        expect(re.familyAsChild).toBe(orig.familyAsChild)
      }
    }

    // Compare family fields
    for (const id of origFamIds) {
      const orig = originalData.families[id]
      const re = reparsed.families[id]
      expect(re.husband).toBe(orig.husband)
      expect(re.wife).toBe(orig.wife)
      expect(re.children.sort()).toEqual(orig.children.sort())
      expect(re.isDivorced).toBe(orig.isDivorced)
    }
  })
})

// ============================================================================
// 22. Round-trip test with Islamic extensions
// ============================================================================

describe('gedcomDataToGedcom — round-trip with Islamic extensions', () => {
  it('round-trips Hijri dates, MARC/MARR/DIV, and notes', () => {
    const data = makeData(
      {
        'I1': makeIndividual({
          id: 'I1',
          name: 'محمد عبدالله',
          givenName: 'محمد',
          surname: 'عبدالله',
          sex: 'M',
          birth: '15/03/1995',
          birthHijriDate: '14/10/1415',
          birthPlace: 'الرياض',
          death: '',
          isDeceased: false,
          familiesAsSpouse: ['F1'],
        }),
        'I2': makeIndividual({
          id: 'I2',
          name: 'نورة سعد',
          givenName: 'نورة',
          surname: 'سعد',
          sex: 'F',
          birth: '22/09/1998',
          birthHijriDate: '01/06/1419',
          familiesAsSpouse: ['F1'],
        }),
        'I3': makeIndividual({
          id: 'I3',
          name: 'أحمد محمد',
          givenName: 'أحمد',
          surname: 'محمد',
          sex: 'M',
          familyAsChild: 'F1',
        }),
      },
      {
        'F1': makeFamily({
          id: 'F1',
          husband: 'I1',
          wife: 'I2',
          children: ['I3'],
          marriageContract: {
            date: '11/07/2022',
            hijriDate: '12/12/1443',
            place: 'الرياض',
            description: '',
            notes: 'بحضور الشيخ أحمد',
          },
          marriage: {
            date: '27/04/2023',
            hijriDate: '07/10/1444',
            place: 'جدة',
            description: '',
            notes: '',
          },
        }),
      },
    )

    const exported = gedcomDataToGedcom(data, '5.5.1')
    const reparsed = parseGedcom(exported)

    // After export → parse, IDs are wrapped in @...@ by the parser
    expect(reparsed.individuals['@I1@'].birthHijriDate).toBe('14/10/1415')
    expect(reparsed.individuals['@I2@'].birthHijriDate).toBe('01/06/1419')

    // Verify family event dates
    expect(reparsed.families['@F1@'].marriageContract.date).toBe('11/07/2022')
    expect(reparsed.families['@F1@'].marriageContract.hijriDate).toBe('12/12/1443')
    expect(reparsed.families['@F1@'].marriageContract.place).toBe('الرياض')
    expect(reparsed.families['@F1@'].marriageContract.notes).toBe('بحضور الشيخ أحمد')
    expect(reparsed.families['@F1@'].marriage.date).toBe('27/04/2023')
    expect(reparsed.families['@F1@'].marriage.hijriDate).toBe('07/10/1444')
    expect(reparsed.families['@F1@'].marriage.place).toBe('جدة')
  })
})

// ============================================================================
// 23. 7.0-specific output structure verification
// ============================================================================

describe('gedcomDataToGedcom — 7.0 output structure', () => {
  it('produces valid 7.0 structure for a complete family', () => {
    const data = makeData(
      {
        'I1': makeIndividual({ id: 'I1', name: 'Ahmad', givenName: 'Ahmad', sex: 'M', birth: '01/01/1990', familiesAsSpouse: ['F1'] }),
        'I2': makeIndividual({ id: 'I2', name: 'Fatima', givenName: 'Fatima', sex: 'F', familiesAsSpouse: ['F1'] }),
      },
      {
        'F1': makeFamily({ id: 'F1', husband: 'I1', wife: 'I2' }),
      },
    )
    const text = gedcomDataToGedcom(data, '7.0')
    const lines = getLines(text)

    // Basic structure: HEAD, INDI records, FAM records, TRLR
    expect(lines[0]).toBe('0 HEAD')
    expect(lines[lines.length - 1]).toBe('0 TRLR')
    expect(hasLine(text, '2 VERS 7.0')).toBe(true)
    expect(hasLine(text, '0 @I1@ INDI')).toBe(true)
    expect(hasLine(text, '0 @F1@ FAM')).toBe(true)
  })

  it('7.0 uses @#DHIJRI@ for Hijri dates (same as 5.5.1)', () => {
    const data = makeData(
      {
        'I1': makeIndividual({ id: 'I1', birth: '01/01/1990', birthHijriDate: '15/05/1410' }),
      },
      {
        'F1': makeFamily({
          id: 'F1',
          marriageContract: { ...emptyEvent(), date: '11/07/2022', hijriDate: '12/12/1443' },
        }),
      },
    )
    const text = gedcomDataToGedcom(data, '7.0')
    expect(text).toContain('@#DHIJRI@')
  })
})

// ============================================================================
// 24. Both versions produce different output for same data
// ============================================================================

describe('gedcomDataToGedcom — version differences', () => {
  it('5.5.1 and 7.0 produce different headers for same data', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', name: 'Ahmad', givenName: 'Ahmad' }),
    })
    const text551 = gedcomDataToGedcom(data, '5.5.1')
    const text70 = gedcomDataToGedcom(data, '7.0')

    expect(text551).toContain('2 VERS 5.5.1')
    expect(text70).toContain('2 VERS 7.0')
    expect(text551).toContain('1 CHAR UTF-8')
    expect(text70).not.toContain('1 CHAR UTF-8')
  })

  it('both 5.5.1 and 7.0 use @#DHIJRI@ for Hijri dates', () => {
    const data = makeData({
      'I1': makeIndividual({ id: 'I1', birthHijriDate: '15/01/1410' }),
    })
    const text551 = gedcomDataToGedcom(data, '5.5.1')
    const text70 = gedcomDataToGedcom(data, '7.0')

    expect(text551).toContain('@#DHIJRI@')
    expect(text70).toContain('@#DHIJRI@')
  })
})

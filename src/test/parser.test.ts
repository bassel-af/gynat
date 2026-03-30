import { describe, it, expect } from 'vitest'
import { parseGedcom } from '@/lib/gedcom/parser'
import type { FamilyEvent } from '@/lib/gedcom/types'

describe('parseGedcom — birthPlace and deathPlace', () => {
  it('parses PLAC under BIRT as birthPlace', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 BIRT
2 DATE 1 JAN 1950
2 PLAC Mecca
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].birthPlace).toBe('Mecca')
  })

  it('parses PLAC under DEAT as deathPlace', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 DEAT
2 DATE 15 MAR 2020
2 PLAC Jeddah
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].deathPlace).toBe('Jeddah')
  })

  it('defaults birthPlace and deathPlace to empty string', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].birthPlace).toBe('')
    expect(data.individuals['@I1@'].deathPlace).toBe('')
  })

  it('parses both birthPlace and deathPlace on the same individual', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 BIRT
2 DATE 1950
2 PLAC Mecca
1 DEAT
2 DATE 2020
2 PLAC Jeddah
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].birthPlace).toBe('Mecca')
    expect(data.individuals['@I1@'].deathPlace).toBe('Jeddah')
  })

  it('handles PLAC with multi-word values', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 BIRT
2 PLAC Mecca, Saudi Arabia
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].birthPlace).toBe('Mecca, Saudi Arabia')
  })
})

describe('parseGedcom — birthNotes and deathNotes', () => {
  it('parses level 2 NOTE under BIRT as birthNotes', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 BIRT
2 DATE 1 JAN 1950
2 NOTE Born at home
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].birthNotes).toBe('Born at home')
  })

  it('parses level 2 NOTE under DEAT as deathNotes', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 DEAT
2 DATE 15 MAR 2020
2 NOTE Died peacefully
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].deathNotes).toBe('Died peacefully')
  })

  it('handles multi-line birth notes with level 3 CONT/CONC', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 BIRT
2 DATE 1 JAN 1950
2 NOTE First line of birth
3 CONT Second line of birth.
3 CONC And more.
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].birthNotes).toBe('First line of birth\nSecond line of birth.And more.')
  })

  it('handles multi-line death notes with level 3 CONT/CONC', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 DEAT
2 DATE 15 MAR 2020
2 NOTE First line of death
3 CONT Second line of death.
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].deathNotes).toBe('First line of death\nSecond line of death.')
  })

  it('does NOT confuse level 1 NOTE with level 2 NOTE under events', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 BIRT
2 NOTE Birth note here
1 NOTE General note here
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].birthNotes).toBe('Birth note here')
    expect(data.individuals['@I1@'].notes).toBe('General note here')
  })

  it('both birth note and general note coexist on same individual', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 BIRT
2 DATE 1950
2 NOTE Born in the countryside
1 DEAT
2 NOTE Died in city hospital
1 NOTE This is a general note.
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].birthNotes).toBe('Born in the countryside')
    expect(data.individuals['@I1@'].deathNotes).toBe('Died in city hospital')
    expect(data.individuals['@I1@'].notes).toBe('This is a general note.')
  })

  it('defaults birthNotes and deathNotes to empty string', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].birthNotes).toBe('')
    expect(data.individuals['@I1@'].deathNotes).toBe('')
  })

  it('general note CONT/CONC still works alongside birth/death notes', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 BIRT
2 NOTE Birth note
1 NOTE General first line
2 CONT General second line
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].birthNotes).toBe('Birth note')
    expect(data.individuals['@I1@'].notes).toBe('General first line\nGeneral second line')
  })
})

describe('parseGedcom — birthDescription and deathDescription (CAUS tag)', () => {
  it('parses CAUS under BIRT as birthDescription', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 BIRT
2 DATE 1 JAN 1950
2 CAUS Natural birth
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].birthDescription).toBe('Natural birth')
  })

  it('parses CAUS under DEAT as deathDescription', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 DEAT
2 DATE 15 MAR 2020
2 CAUS Heart attack
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].deathDescription).toBe('Heart attack')
  })

  it('defaults birthDescription and deathDescription to empty string when no CAUS', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].birthDescription).toBe('')
    expect(data.individuals['@I1@'].deathDescription).toBe('')
  })
})

describe('parseGedcom — notes', () => {
  it('parses a simple NOTE tag', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 NOTE This is a note about Ahmad.
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].notes).toBe('This is a note about Ahmad.')
  })

  it('defaults notes to empty string when no NOTE tag', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].notes).toBe('')
  })

  it('handles CONT continuation lines (newline + value)', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 NOTE First line.
2 CONT Second line.
2 CONT Third line.
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].notes).toBe('First line.\nSecond line.\nThird line.')
  })

  it('handles CONC continuation lines (concatenation without newline)', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 NOTE This is a long no
2 CONC te that was split.
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].notes).toBe('This is a long note that was split.')
  })

  it('handles mixed CONT and CONC continuation lines', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 NOTE First line start
2 CONC ed here.
2 CONT Second line.
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].notes).toBe('First line started here.\nSecond line.')
  })

  it('handles NOTE with empty value followed by CONT', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 NOTE
2 CONT Content after empty note.
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].notes).toBe('\nContent after empty note.')
  })
})

describe('parseGedcom — standalone NOTE references', () => {
  it('resolves a standalone NOTE reference on an individual', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 NOTE @N1@
0 @N1@ NOTE
1 CONT لم تتزوج
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].notes).toBe('\nلم تتزوج')
  })

  it('resolves standalone NOTE with multiple CONT lines', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 NOTE @N1@
0 @N1@ NOTE
1 CONT First line
1 CONT Second line
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].notes).toBe('\nFirst line\nSecond line')
  })

  it('resolves standalone NOTE with inline text on the NOTE line', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 NOTE @N1@
0 @N1@ NOTE Some initial text
1 CONT and more text
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].notes).toBe('Some initial text\nand more text')
  })

  it('clears notes if standalone NOTE reference is not found', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 NOTE @MISSING@
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].notes).toBe('')
  })

  it('does not confuse inline NOTE text with a reference', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 NOTE Just a normal note
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].notes).toBe('Just a normal note')
  })

  it('standalone NOTE records do not appear as individuals or families', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
0 @N1@ NOTE
1 CONT Some note
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@N1@']).toBeUndefined()
    expect(data.families['@N1@']).toBeUndefined()
  })
})

// ── Family marriage events (MARC/MARR/DIV) ──────────────────────────

describe('parseGedcom — family marriage events (MARC/MARR/DIV)', () => {
  const emptyEvent: FamilyEvent = {
    date: '',
    hijriDate: '',
    place: '',
    description: '',
    notes: '',
  }

  it('parses MARC with DATE and PLAC', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 SEX M
0 @I2@ INDI
1 NAME Fatima
1 SEX F
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARC
2 DATE 11 JUL 2022
2 PLAC Riyadh
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.families['@F1@'].marriageContract.date).toBe('11/07/2022')
    expect(data.families['@F1@'].marriageContract.place).toBe('Riyadh')
  })

  it('parses MARR with DATE and PLAC', () => {
    const gedcom = `
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 15 SEP 2022
2 PLAC Jeddah
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.families['@F1@'].marriage.date).toBe('15/09/2022')
    expect(data.families['@F1@'].marriage.place).toBe('Jeddah')
  })

  it('parses DIV and sets isDivorced to true', () => {
    const gedcom = `
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 DIV
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.families['@F1@'].isDivorced).toBe(true)
  })

  it('captures inline description on MARC (e.g., Hijri date)', () => {
    const gedcom = `
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARC 12/2/1443
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.families['@F1@'].marriageContract.description).toBe('12/2/1443')
  })

  it('captures inline description on MARR', () => {
    const gedcom = `
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR 7/10/1443
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.families['@F1@'].marriage.description).toBe('7/10/1443')
  })

  it('filters Y from DIV description', () => {
    const gedcom = `
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 DIV Y
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.families['@F1@'].isDivorced).toBe(true)
    expect(data.families['@F1@'].divorce.description).toBe('')
  })

  it('captures inline description on DIV (non-Y value)', () => {
    const gedcom = `
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 DIV irreconcilable differences
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.families['@F1@'].isDivorced).toBe(true)
    expect(data.families['@F1@'].divorce.description).toBe('irreconcilable differences')
  })

  it('parses NOTE under MARC/MARR/DIV', () => {
    const gedcom = `
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARC
2 NOTE Contract signed at home
1 MARR
2 NOTE Large celebration
1 DIV
2 NOTE Mutual decision
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.families['@F1@'].marriageContract.notes).toBe('Contract signed at home')
    expect(data.families['@F1@'].marriage.notes).toBe('Large celebration')
    expect(data.families['@F1@'].divorce.notes).toBe('Mutual decision')
  })

  it('handles CONT/CONC in MARC/MARR/DIV notes', () => {
    const gedcom = `
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARC
2 NOTE First line
3 CONT Second line
3 CONC more text
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.families['@F1@'].marriageContract.notes).toBe('First line\nSecond linemore text')
  })

  it('resolves standalone NOTE references in family event notes', () => {
    const gedcom = `
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARC
2 NOTE @N1@
0 @N1@ NOTE Standalone contract note
1 CONT with more details
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.families['@F1@'].marriageContract.notes).toBe('Standalone contract note\nwith more details')
  })

  it('defaults all family event fields to empty strings', () => {
    const gedcom = `
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.families['@F1@'].marriageContract).toEqual(emptyEvent)
    expect(data.families['@F1@'].marriage).toEqual(emptyEvent)
    expect(data.families['@F1@'].divorce).toEqual(emptyEvent)
    expect(data.families['@F1@'].isDivorced).toBe(false)
  })

  it('parses all three events on the same family', () => {
    const gedcom = `
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARC
2 DATE 1 JAN 2020
2 PLAC Riyadh
1 MARR
2 DATE 1 FEB 2020
2 PLAC Jeddah
1 DIV
2 DATE 1 MAR 2021
2 PLAC Dammam
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.families['@F1@'].marriageContract.date).toBe('01/01/2020')
    expect(data.families['@F1@'].marriageContract.place).toBe('Riyadh')
    expect(data.families['@F1@'].marriage.date).toBe('01/02/2020')
    expect(data.families['@F1@'].marriage.place).toBe('Jeddah')
    expect(data.families['@F1@'].divorce.date).toBe('01/03/2021')
    expect(data.families['@F1@'].divorce.place).toBe('Dammam')
    expect(data.families['@F1@'].isDivorced).toBe(true)
  })

  it('parses _HIJR under MARC/MARR/DIV', () => {
    const gedcom = `
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARC
2 _HIJR 12/02/1443
1 MARR
2 _HIJR 07/10/1443
1 DIV
2 _HIJR 15/06/1444
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.families['@F1@'].marriageContract.hijriDate).toBe('12/02/1443')
    expect(data.families['@F1@'].marriage.hijriDate).toBe('07/10/1443')
    expect(data.families['@F1@'].divorce.hijriDate).toBe('15/06/1444')
  })

  it('parses PLAC under MARR', () => {
    const gedcom = `
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 PLAC المدينة المنورة
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.families['@F1@'].marriage.place).toBe('المدينة المنورة')
  })
})

// ── _HIJR (Hijri dates) on individuals — backward compatibility ─────

// These tests verify that the legacy _HIJR tag continues to work.

describe('parseGedcom — _HIJR (Hijri dates)', () => {
  it('parses _HIJR under BIRT as birthHijriDate', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 BIRT
2 DATE 1 JAN 1990
2 _HIJR 15/05/1410
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].birthHijriDate).toBe('15/05/1410')
  })

  it('parses _HIJR under DEAT as deathHijriDate', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 DEAT
2 DATE 15 MAR 2020
2 _HIJR 20/07/1441
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].deathHijriDate).toBe('20/07/1441')
  })

  it('defaults birthHijriDate and deathHijriDate to empty string', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].birthHijriDate).toBe('')
    expect(data.individuals['@I1@'].deathHijriDate).toBe('')
  })

  it('parses _HIJR on same individual as regular dates', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 BIRT
2 DATE 1 JAN 1990
2 _HIJR 15/05/1410
1 DEAT
2 DATE 15 MAR 2020
2 _HIJR 20/07/1441
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].birth).toBe('01/01/1990')
    expect(data.individuals['@I1@'].birthHijriDate).toBe('15/05/1410')
    expect(data.individuals['@I1@'].death).toBe('15/03/2020')
    expect(data.individuals['@I1@'].deathHijriDate).toBe('20/07/1441')
  })
})

// ── @#DHIJRI@ calendar escape (Hijri dates) on individuals ─────────

describe('parseGedcom — @#DHIJRI@ calendar escape on individuals', () => {
  it('parses DATE @#DHIJRI@ under BIRT as birthHijriDate', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 BIRT
2 DATE @#DHIJRI@ 15 MUHAR 1410
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].birthHijriDate).toBe('15/01/1410')
  })

  it('parses DATE @#DHIJRI@ under DEAT as deathHijriDate', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 DEAT
2 DATE @#DHIJRI@ 20 RAJAB 1441
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].deathHijriDate).toBe('20/07/1441')
  })

  it('routes Gregorian DATE and @#DHIJRI@ DATE to separate fields', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 BIRT
2 DATE 1 JAN 1990
2 DATE @#DHIJRI@ 15 JUMAA 1410
2 PLAC مكة المكرمة
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].birth).toBe('01/01/1990')
    expect(data.individuals['@I1@'].birthHijriDate).toBe('15/05/1410')
    expect(data.individuals['@I1@'].birthPlace).toBe('مكة المكرمة')
  })

  it('handles Hijri-only date (no Gregorian)', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 BIRT
2 DATE @#DHIJRI@ 1 RAMAD 1400
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].birth).toBe('')
    expect(data.individuals['@I1@'].birthHijriDate).toBe('01/09/1400')
  })

  it('handles month-year only Hijri date (no day)', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 BIRT
2 DATE @#DHIJRI@ SAFAR 1410
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].birthHijriDate).toBe('02/1410')
  })

  it('handles year-only Hijri date', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 BIRT
2 DATE @#DHIJRI@ 1410
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].birthHijriDate).toBe('1410')
  })

  it('parses both birth and death with @#DHIJRI@ alongside Gregorian', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 BIRT
2 DATE 1 JAN 1990
2 DATE @#DHIJRI@ 15 MUHAR 1410
1 DEAT
2 DATE 15 MAR 2020
2 DATE @#DHIJRI@ 20 RAJAB 1441
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].birth).toBe('01/01/1990')
    expect(data.individuals['@I1@'].birthHijriDate).toBe('15/01/1410')
    expect(data.individuals['@I1@'].death).toBe('15/03/2020')
    expect(data.individuals['@I1@'].deathHijriDate).toBe('20/07/1441')
  })

  it('handles empty date after @#DHIJRI@ prefix', () => {
    const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 BIRT
2 DATE @#DHIJRI@
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].birthHijriDate).toBe('')
  })

  it('parses all 12 Hijri month codes correctly', () => {
    const months = [
      ['MUHAR', '01'], ['SAFAR', '02'], ['RABIA', '03'], ['RABIT', '04'],
      ['JUMAA', '05'], ['JUMAT', '06'], ['RAJAB', '07'], ['SHAAB', '08'],
      ['RAMAD', '09'], ['SHAWW', '10'], ['DHUAQ', '11'], ['DHUAH', '12'],
    ]
    for (const [code, num] of months) {
      const gedcom = `
0 @I1@ INDI
1 NAME Ahmad
1 BIRT
2 DATE @#DHIJRI@ 1 ${code} 1440
`.trim()
      const data = parseGedcom(gedcom)
      expect(data.individuals['@I1@'].birthHijriDate).toBe(`01/${num}/1440`)
    }
  })
})

// ── @#DHIJRI@ calendar escape on family events ─────────────────────

describe('parseGedcom — @#DHIJRI@ calendar escape on family events', () => {
  it('parses DATE @#DHIJRI@ under MARC/MARR/DIV', () => {
    const gedcom = `
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARC
2 DATE @#DHIJRI@ 12 DHUAH 1443
1 MARR
2 DATE @#DHIJRI@ 7 SHAWW 1444
1 DIV
2 DATE @#DHIJRI@ 15 JUMAT 1445
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.families['@F1@'].marriageContract.hijriDate).toBe('12/12/1443')
    expect(data.families['@F1@'].marriage.hijriDate).toBe('07/10/1444')
    expect(data.families['@F1@'].divorce.hijriDate).toBe('15/06/1445')
  })

  it('routes Gregorian and Hijri dates to correct fields on family events', () => {
    const gedcom = `
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARC
2 DATE 11 JUL 2022
2 DATE @#DHIJRI@ 12 DHUAH 1443
2 PLAC الرياض
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.families['@F1@'].marriageContract.date).toBe('11/07/2022')
    expect(data.families['@F1@'].marriageContract.hijriDate).toBe('12/12/1443')
    expect(data.families['@F1@'].marriageContract.place).toBe('الرياض')
  })

  it('handles Hijri-only family event date (no Gregorian)', () => {
    const gedcom = `
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE @#DHIJRI@ 7 SHAWW 1444
`.trim()

    const data = parseGedcom(gedcom)
    expect(data.families['@F1@'].marriage.date).toBe('')
    expect(data.families['@F1@'].marriage.hijriDate).toBe('07/10/1444')
  })
})

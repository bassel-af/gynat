import { describe, it, expect } from 'vitest'
import { parseGedcom } from '@/lib/gedcom/parser'
import { gedcomDataToGedcom } from '@/lib/gedcom/exporter'
import type { RadaFamily } from '@/lib/gedcom/types'

// ============================================================================
// 1. BOM stripping
// ============================================================================

describe('parseGedcom — BOM stripping', () => {
  it('parses file with UTF-8 BOM identically to file without BOM', () => {
    const gedcom = `0 @I1@ INDI
1 NAME Ahmad
1 SEX M
0 @F1@ FAM
1 HUSB @I1@
0 TRLR`

    const withBom = '\uFEFF' + gedcom

    const dataNoBom = parseGedcom(gedcom)
    const dataWithBom = parseGedcom(withBom)

    expect(Object.keys(dataWithBom.individuals)).toEqual(Object.keys(dataNoBom.individuals))
    expect(Object.keys(dataWithBom.families)).toEqual(Object.keys(dataNoBom.families))
    expect(dataWithBom.individuals['@I1@'].name).toBe('Ahmad')
  })
})

// ============================================================================
// 2. _UMM_WALAD parsing on FAM records
// ============================================================================

describe('parseGedcom — _UMM_WALAD on FAM records', () => {
  it('sets isUmmWalad = true when _UMM_WALAD Y is present', () => {
    const gedcom = `0 @I1@ INDI
1 NAME Ahmad
1 SEX M
0 @I2@ INDI
1 NAME Fatima
1 SEX F
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 _UMM_WALAD Y
0 TRLR`

    const data = parseGedcom(gedcom)
    expect(data.families['@F1@'].isUmmWalad).toBe(true)
  })

  it('isUmmWalad is falsy when _UMM_WALAD tag is absent', () => {
    const gedcom = `0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
0 TRLR`

    const data = parseGedcom(gedcom)
    expect(data.families['@F1@'].isUmmWalad).toBeFalsy()
  })

  it('_UMM_WALAD coexists with other FAM tags', () => {
    const gedcom = `0 @I1@ INDI
1 NAME Ahmad
1 SEX M
0 @I2@ INDI
1 NAME Fatima
1 SEX F
0 @I3@ INDI
1 NAME Khalid
1 SEX M
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 _UMM_WALAD Y
1 MARC
2 DATE 1 JAN 2020
0 TRLR`

    const data = parseGedcom(gedcom)
    expect(data.families['@F1@'].isUmmWalad).toBe(true)
    expect(data.families['@F1@'].husband).toBe('@I1@')
    expect(data.families['@F1@'].wife).toBe('@I2@')
    expect(data.families['@F1@'].children).toContain('@I3@')
    // Note: _UMM_WALAD with MARC is an unusual combination but parser should handle it
    expect(data.families['@F1@'].marriageContract.date).toBe('01/01/2020')
  })

  it('sets isUmmWalad = true for bare _UMM_WALAD (no value)', () => {
    const gedcom = `0 @F1@ FAM
1 HUSB @I1@
1 _UMM_WALAD
0 TRLR`

    const data = parseGedcom(gedcom)
    expect(data.families['@F1@'].isUmmWalad).toBe(true)
  })
})

// ============================================================================
// 3. _RADA_FAM record parsing
// ============================================================================

describe('parseGedcom — _RADA_FAM records', () => {
  it('parses _RADA_FAM with _RADA_HUSB, _RADA_WIFE, _RADA_CHIL', () => {
    const gedcom = `0 @I1@ INDI
1 NAME Ahmad
1 SEX M
0 @I2@ INDI
1 NAME Fatima
1 SEX F
0 @I3@ INDI
1 NAME Khalid
1 SEX M
0 @RF1@ _RADA_FAM
1 _RADA_HUSB @I1@
1 _RADA_WIFE @I2@
1 _RADA_CHIL @I3@
0 TRLR`

    const data = parseGedcom(gedcom)
    expect(data.radaFamilies).toBeDefined()
    const rf = data.radaFamilies!['@RF1@']
    expect(rf).toBeDefined()
    expect(rf.type).toBe('_RADA_FAM')
    expect(rf.fosterFather).toBe('@I1@')
    expect(rf.fosterMother).toBe('@I2@')
    expect(rf.children).toContain('@I3@')
  })

  it('parses _RADA_FAM with multiple _RADA_CHIL entries', () => {
    const gedcom = `0 @I3@ INDI
1 NAME Child1
0 @I4@ INDI
1 NAME Child2
0 @I5@ INDI
1 NAME Child3
0 @RF1@ _RADA_FAM
1 _RADA_HUSB @I1@
1 _RADA_WIFE @I2@
1 _RADA_CHIL @I3@
1 _RADA_CHIL @I4@
1 _RADA_CHIL @I5@
0 TRLR`

    const data = parseGedcom(gedcom)
    const rf = data.radaFamilies!['@RF1@']
    expect(rf.children).toHaveLength(3)
    expect(rf.children).toEqual(['@I3@', '@I4@', '@I5@'])
  })

  it('parses NOTE under _RADA_FAM', () => {
    const gedcom = `0 @RF1@ _RADA_FAM
1 _RADA_HUSB @I1@
1 NOTE This is a rada note
0 TRLR`

    const data = parseGedcom(gedcom)
    const rf = data.radaFamilies!['@RF1@']
    expect(rf.notes).toBe('This is a rada note')
  })

  it('parses NOTE with CONT/CONC under _RADA_FAM', () => {
    const gedcom = `0 @RF1@ _RADA_FAM
1 _RADA_HUSB @I1@
1 NOTE First line
2 CONT Second line
2 CONC more text
0 TRLR`

    const data = parseGedcom(gedcom)
    const rf = data.radaFamilies!['@RF1@']
    expect(rf.notes).toBe('First line\nSecond linemore text')
  })

  it('parses _RADA_FAM with only foster mother (no father)', () => {
    const gedcom = `0 @RF1@ _RADA_FAM
1 _RADA_WIFE @I2@
1 _RADA_CHIL @I3@
0 TRLR`

    const data = parseGedcom(gedcom)
    const rf = data.radaFamilies!['@RF1@']
    expect(rf.fosterFather).toBeNull()
    expect(rf.fosterMother).toBe('@I2@')
  })

  it('parses _RADA_FAM with only foster father (no mother)', () => {
    const gedcom = `0 @RF1@ _RADA_FAM
1 _RADA_HUSB @I1@
1 _RADA_CHIL @I3@
0 TRLR`

    const data = parseGedcom(gedcom)
    const rf = data.radaFamilies!['@RF1@']
    expect(rf.fosterFather).toBe('@I1@')
    expect(rf.fosterMother).toBeNull()
  })

  it('parses multiple _RADA_FAM records in same file', () => {
    const gedcom = `0 @RF1@ _RADA_FAM
1 _RADA_HUSB @I1@
1 _RADA_WIFE @I2@
1 _RADA_CHIL @I3@
0 @RF2@ _RADA_FAM
1 _RADA_WIFE @I4@
1 _RADA_CHIL @I5@
1 _RADA_CHIL @I6@
0 TRLR`

    const data = parseGedcom(gedcom)
    expect(Object.keys(data.radaFamilies!)).toHaveLength(2)
    expect(data.radaFamilies!['@RF1@']).toBeDefined()
    expect(data.radaFamilies!['@RF2@']).toBeDefined()
    expect(data.radaFamilies!['@RF2@'].children).toHaveLength(2)
  })

  it('returns empty radaFamilies when no _RADA_FAM records exist', () => {
    const gedcom = `0 @I1@ INDI
1 NAME Ahmad
0 @F1@ FAM
1 HUSB @I1@
0 TRLR`

    const data = parseGedcom(gedcom)
    // radaFamilies should either be undefined or empty
    const radaCount = data.radaFamilies ? Object.keys(data.radaFamilies).length : 0
    expect(radaCount).toBe(0)
  })
})

// ============================================================================
// 4. _RADA_FAMC on INDI records
// ============================================================================

describe('parseGedcom — _RADA_FAMC on INDI records', () => {
  it('parses _RADA_FAMC reference on individual', () => {
    const gedcom = `0 @I1@ INDI
1 NAME Khalid
1 SEX M
1 _RADA_FAMC @RF1@
0 @RF1@ _RADA_FAM
1 _RADA_HUSB @I2@
1 _RADA_CHIL @I1@
0 TRLR`

    const data = parseGedcom(gedcom)
    const indi = data.individuals['@I1@']
    expect(indi.radaFamiliesAsChild).toBeDefined()
    expect(indi.radaFamiliesAsChild).toContain('@RF1@')
  })

  it('parses multiple _RADA_FAMC references on same individual', () => {
    const gedcom = `0 @I1@ INDI
1 NAME Khalid
1 SEX M
1 _RADA_FAMC @RF1@
1 _RADA_FAMC @RF2@
0 TRLR`

    const data = parseGedcom(gedcom)
    const indi = data.individuals['@I1@']
    expect(indi.radaFamiliesAsChild).toHaveLength(2)
    expect(indi.radaFamiliesAsChild).toContain('@RF1@')
    expect(indi.radaFamiliesAsChild).toContain('@RF2@')
  })

  it('individual without _RADA_FAMC has no radaFamiliesAsChild', () => {
    const gedcom = `0 @I1@ INDI
1 NAME Ahmad
1 SEX M
0 TRLR`

    const data = parseGedcom(gedcom)
    const indi = data.individuals['@I1@']
    // Should be undefined or empty array
    const count = indi.radaFamiliesAsChild?.length ?? 0
    expect(count).toBe(0)
  })
})

// ============================================================================
// 5. GEDCOM 7.0 header tolerance
// ============================================================================

describe('parseGedcom — GEDCOM 7.0 header tolerance', () => {
  it('does not crash on GEDCOM 7.0 header', () => {
    const gedcom = `0 HEAD
1 GEDC
2 VERS 7.0
1 SOUR Gynat
2 VERS 1.0
2 NAME Gynat
0 @I1@ INDI
1 NAME Ahmad
1 SEX M
0 TRLR`

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].name).toBe('Ahmad')
  })

  it('ignores SCHMA block with TAG declarations', () => {
    const gedcom = `0 HEAD
1 GEDC
2 VERS 7.0
1 SCHMA
2 TAG _UMM_WALAD https://gynat.com/gedcom/ext/_UMM_WALAD
2 TAG _RADA_FAM https://gynat.com/gedcom/ext/_RADA_FAM
0 @I1@ INDI
1 NAME Ahmad
0 TRLR`

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@']).toBeDefined()
    expect(data.individuals['@I1@'].name).toBe('Ahmad')
  })

  it('handles file without CHAR UTF-8 (GEDCOM 7.0 omits it)', () => {
    const gedcom = `0 HEAD
1 GEDC
2 VERS 7.0
0 @I1@ INDI
1 NAME محمد
1 SEX M
0 TRLR`

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].name).toBe('محمد')
  })
})

// ============================================================================
// 6. Round-trip parity for Islamic extensions
// ============================================================================

describe('parseGedcom — round-trip parity for Islamic extensions', () => {
  it('round-trips _UMM_WALAD: export → parse → compare', () => {
    const data = {
      individuals: {
        'I1': {
          id: 'I1', type: 'INDI' as const,
          name: 'Ahmad', givenName: 'Ahmad', surname: '',
          sex: 'M' as const, birth: '', birthPlace: '', birthDescription: '', birthNotes: '',
          birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '',
          deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
          familiesAsSpouse: ['F1'], familyAsChild: null,
        },
      },
      families: {
        'F1': {
          id: 'F1', type: 'FAM' as const,
          husband: 'I1', wife: null, children: [],
          marriageContract: { date: '', hijriDate: '', place: '', description: '', notes: '' },
          marriage: { date: '', hijriDate: '', place: '', description: '', notes: '' },
          divorce: { date: '', hijriDate: '', place: '', description: '', notes: '' },
          isDivorced: false, isUmmWalad: true,
        },
      },
    }

    const exported = gedcomDataToGedcom(data, '5.5.1')
    const reparsed = parseGedcom(exported)

    // Find the family (IDs get wrapped with @...@ by parser)
    const famKey = Object.keys(reparsed.families)[0]
    expect(reparsed.families[famKey].isUmmWalad).toBe(true)
  })

  it('round-trips rada\'a data: export → parse → compare', () => {
    const data = {
      individuals: {
        'I1': {
          id: 'I1', type: 'INDI' as const,
          name: 'Father', givenName: 'Father', surname: '',
          sex: 'M' as const, birth: '', birthPlace: '', birthDescription: '', birthNotes: '',
          birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '',
          deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
          familiesAsSpouse: [], familyAsChild: null,
        },
        'I2': {
          id: 'I2', type: 'INDI' as const,
          name: 'Mother', givenName: 'Mother', surname: '',
          sex: 'F' as const, birth: '', birthPlace: '', birthDescription: '', birthNotes: '',
          birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '',
          deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
          familiesAsSpouse: [], familyAsChild: null,
        },
        'I3': {
          id: 'I3', type: 'INDI' as const,
          name: 'Child', givenName: 'Child', surname: '',
          sex: 'M' as const, birth: '', birthPlace: '', birthDescription: '', birthNotes: '',
          birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '',
          deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
          familiesAsSpouse: [], familyAsChild: null,
          radaFamiliesAsChild: ['RF1'],
        },
      },
      families: {},
      radaFamilies: {
        'RF1': {
          id: 'RF1', type: '_RADA_FAM' as const,
          fosterFather: 'I1',
          fosterMother: 'I2',
          children: ['I3'],
          notes: 'Rada note',
        } as RadaFamily,
      },
    }

    const exported = gedcomDataToGedcom(data, '5.5.1')
    const reparsed = parseGedcom(exported)

    // Check rada families were reparsed
    expect(reparsed.radaFamilies).toBeDefined()
    const rfKey = Object.keys(reparsed.radaFamilies!)[0]
    const rf = reparsed.radaFamilies![rfKey]
    expect(rf.fosterFather).toBeTruthy()
    expect(rf.fosterMother).toBeTruthy()
    expect(rf.children).toHaveLength(1)
    expect(rf.notes).toBe('Rada note')

    // Check _RADA_FAMC on the individual
    const childKey = Object.keys(reparsed.individuals).find(
      (k) => reparsed.individuals[k].name === 'Child',
    )!
    expect(reparsed.individuals[childKey].radaFamiliesAsChild).toBeDefined()
    expect(reparsed.individuals[childKey].radaFamiliesAsChild!.length).toBeGreaterThan(0)
  })
})

// ============================================================================
// Kunya (_KUNYA tag)
// ============================================================================

describe('parseGedcom — _KUNYA tag', () => {
  it('parses _KUNYA tag as kunya field', () => {
    const gedcom = `0 @I1@ INDI
1 NAME Ahmad /Saeed/
2 GIVN Ahmad
2 SURN Saeed
1 _KUNYA أبو محمد
1 SEX M`

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].kunya).toBe('أبو محمد')
  })

  it('defaults kunya to empty string when not present', () => {
    const gedcom = `0 @I1@ INDI
1 NAME Ahmad
1 SEX M`

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].kunya).toBe('')
  })

  it('round-trips kunya through export and re-import', () => {
    const gedcom = `0 @I1@ INDI
1 NAME Ahmad
1 _KUNYA أبو محمد
1 SEX M`

    const data = parseGedcom(gedcom)
    expect(data.individuals['@I1@'].kunya).toBe('أبو محمد')

    const exported = gedcomDataToGedcom(data, '5.5.1')
    const reparsed = parseGedcom(exported)

    const indKey = Object.keys(reparsed.individuals)[0]
    expect(reparsed.individuals[indKey].kunya).toBe('أبو محمد')
  })
})

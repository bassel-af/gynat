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
          deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false, kunya: '',
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
          deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false, kunya: '',
          familiesAsSpouse: [], familyAsChild: null,
        },
        'I2': {
          id: 'I2', type: 'INDI' as const,
          name: 'Mother', givenName: 'Mother', surname: '',
          sex: 'F' as const, birth: '', birthPlace: '', birthDescription: '', birthNotes: '',
          birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '',
          deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false, kunya: '',
          familiesAsSpouse: [], familyAsChild: null,
        },
        'I3': {
          id: 'I3', type: 'INDI' as const,
          name: 'Child', givenName: 'Child', surname: '',
          sex: 'M' as const, birth: '', birthPlace: '', birthDescription: '', birthNotes: '',
          birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '',
          deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false, kunya: '',
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

// ============================================================================
// Famous name («اسم الشهرة») import — NAME TYPE aka from gynat files only
// ============================================================================

const GYNAT_HEAD = `0 HEAD
1 SOUR Gynat
2 VERS 1.0
2 NAME Gynat
1 GEDC
2 VERS 5.5.1
2 FORM LINEAGE-LINKED
1 CHAR UTF-8`

const FOREIGN_HEAD = `0 HEAD
1 SOUR FTM
2 VERS 24.0
2 NAME Family Tree Maker
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8`

const OWNER_EXAMPLES_BODY = `0 @I1@ INDI
1 NAME شيبة
2 GIVN شيبة
1 NAME عبدالمطلب
2 TYPE aka
1 SEX M
0 @I2@ INDI
1 NAME عمرو
2 GIVN عمرو
1 NAME هاشم
2 TYPE aka
1 SEX M
0 @I3@ INDI
1 NAME عبدمناف
2 GIVN عبدمناف
1 NAME أبو طالب
2 TYPE aka
1 _KUNYA أبو طالب
1 SEX M
0 TRLR`

describe('parseGedcom — famous name (NAME TYPE aka) import', () => {
  it('reads the aka NAME as famousName in a gynat file', () => {
    const data = parseGedcom(`${GYNAT_HEAD}\n${OWNER_EXAMPLES_BODY}`)
    expect([
      data.individuals['@I1@'].famousName,
      data.individuals['@I2@'].famousName,
      data.individuals['@I3@'].famousName,
    ]).toEqual(['عبدالمطلب', 'هاشم', 'أبو طالب'])
  })

  it('keeps the primary names intact in a gynat file with aka NAMEs', () => {
    const data = parseGedcom(`${GYNAT_HEAD}\n${OWNER_EXAMPLES_BODY}`)
    expect([
      data.individuals['@I1@'].givenName,
      data.individuals['@I2@'].givenName,
      data.individuals['@I3@'].givenName,
    ]).toEqual(['شيبة', 'عمرو', 'عبدمناف'])
  })

  it('keeps _KUNYA alongside the famous name when both are written', () => {
    const data = parseGedcom(`${GYNAT_HEAD}\n${OWNER_EXAMPLES_BODY}`)
    expect(data.individuals['@I3@'].kunya).toBe('أبو طالب')
  })

  it('ignores aka NAMEs in a file from another program', () => {
    const data = parseGedcom(`${FOREIGN_HEAD}\n${OWNER_EXAMPLES_BODY}`)
    expect(Object.values(data.individuals).map((i) => i.famousName)).toEqual([
      undefined,
      undefined,
      undefined,
    ])
  })

  it('ignores aka NAMEs in a file without a HEAD', () => {
    const data = parseGedcom(OWNER_EXAMPLES_BODY)
    expect(data.individuals['@I1@'].famousName).toBeUndefined()
  })

  it('matches the 7.0 TYPE AKA case-insensitively', () => {
    const data = parseGedcom(`0 HEAD
1 GEDC
2 VERS 7.0
1 SOUR Gynat
2 VERS 1.0
0 @I1@ INDI
1 NAME شيبة
1 NAME عبدالمطلب
2 TYPE AKA
0 TRLR`)
    expect(data.individuals['@I1@'].famousName).toBe('عبدالمطلب')
  })

  it('strips slashes from the famous name value', () => {
    const data = parseGedcom(`${GYNAT_HEAD}
0 @I1@ INDI
1 NAME شيبة
1 NAME عبدالمطلب /هاشم/
2 TYPE aka
0 TRLR`)
    expect(data.individuals['@I1@'].famousName).toBe('عبدالمطلب هاشم')
  })

  it('takes only the first aka NAME as the famous name', () => {
    const data = parseGedcom(`${GYNAT_HEAD}
0 @I1@ INDI
1 NAME شيبة
1 NAME عبدالمطلب
2 TYPE aka
1 NAME شيبة الحمد
2 TYPE aka
0 TRLR`)
    expect(data.individuals['@I1@'].famousName).toBe('عبدالمطلب')
  })

  it('does not read a later NAME of another TYPE as the famous name', () => {
    const data = parseGedcom(`${GYNAT_HEAD}
0 @I1@ INDI
1 NAME Fatima /Ali/
1 NAME Fatima /Hassan/
2 TYPE married
0 TRLR`)
    expect(data.individuals['@I1@'].famousName).toBeUndefined()
  })

  it('does not read an aka NAME carrying a _KUNYA child as the famous name', () => {
    const data = parseGedcom(`${GYNAT_HEAD}
0 @I1@ INDI
1 NAME أحمد
1 NAME أبو محمد
2 TYPE aka
2 _KUNYA Y
0 TRLR`)
    expect(data.individuals['@I1@'].famousName).toBeUndefined()
  })

  it('ignores NICK in a gynat file', () => {
    const data = parseGedcom(`${GYNAT_HEAD}
0 @I1@ INDI
1 NAME شيبة
1 NICK عبدالمطلب
0 TRLR`)
    expect(data.individuals['@I1@'].famousName).toBeUndefined()
  })

  it('leaves famousNameInNasab undefined when the aka NAME has no _NASAB', () => {
    const data = parseGedcom(`${GYNAT_HEAD}\n${OWNER_EXAMPLES_BODY}`)
    expect(data.individuals['@I1@'].famousNameInNasab).toBeUndefined()
  })

  it('preserves the famous name through export and re-import', () => {
    const data = parseGedcom(`${GYNAT_HEAD}
0 @I1@ INDI
1 NAME شيبة
2 GIVN شيبة
1 SEX M
0 TRLR`)
    data.individuals['@I1@'].famousName = 'عبدالمطلب'

    const reparsed = parseGedcom(gedcomDataToGedcom(data, '5.5.1'))
    expect(reparsed.individuals['@I1@'].famousName).toBe('عبدالمطلب')
  })

  it('preserves the famous name through a 7.0 export and re-import', () => {
    const data = parseGedcom(`${GYNAT_HEAD}
0 @I1@ INDI
1 NAME شيبة
2 GIVN شيبة
1 SEX M
0 TRLR`)
    data.individuals['@I1@'].famousName = 'عبدالمطلب'

    const reparsed = parseGedcom(gedcomDataToGedcom(data, '7.0'))
    expect(reparsed.individuals['@I1@'].famousName).toBe('عبدالمطلب')
  })
})

// ============================================================================
// «يُذكر في النسب باسم» — `2 _NASAB Y|N` under the famous-name NAME
// ============================================================================

/** عبدالله / «ابن الزبير» with the given lines under the aka NAME. */
function zubairFile(akaChildren: string, head: string = GYNAT_HEAD): string {
  return `${head}
0 @I1@ INDI
1 NAME عبدالله
2 GIVN عبدالله
1 NAME ابن الزبير
2 TYPE aka
${akaChildren}
1 SEX M
0 TRLR`
}

describe('parseGedcom — famous-name nasab choice (2 _NASAB) import', () => {
  it('reads _NASAB N under the famous name as false', () => {
    const data = parseGedcom(zubairFile('2 _NASAB N'))
    expect(data.individuals['@I1@'].famousNameInNasab).toBe(false)
  })

  it('reads _NASAB Y under the famous name as true', () => {
    const data = parseGedcom(zubairFile('2 _NASAB Y'))
    expect(data.individuals['@I1@'].famousNameInNasab).toBe(true)
  })

  it('reads lowercase y as true', () => {
    const data = parseGedcom(zubairFile('2 _NASAB y'))
    expect(data.individuals['@I1@'].famousNameInNasab).toBe(true)
  })

  it('reads lowercase n as false', () => {
    const data = parseGedcom(zubairFile('2 _NASAB n'))
    expect(data.individuals['@I1@'].famousNameInNasab).toBe(false)
  })

  it('ignores a _NASAB value other than Y or N', () => {
    const data = parseGedcom(zubairFile('2 _NASAB YES'))
    expect(data.individuals['@I1@'].famousNameInNasab).toBeUndefined()
  })

  it('ignores an empty _NASAB', () => {
    const data = parseGedcom(zubairFile('2 _NASAB'))
    expect(data.individuals['@I1@'].famousNameInNasab).toBeUndefined()
  })

  it('takes the first valid _NASAB when the block repeats it', () => {
    const data = parseGedcom(zubairFile('2 _NASAB N\n2 _NASAB Y'))
    expect(data.individuals['@I1@'].famousNameInNasab).toBe(false)
  })

  it('reads _NASAB written before TYPE in the block', () => {
    const data = parseGedcom(`${GYNAT_HEAD}
0 @I1@ INDI
1 NAME عبدالله
1 NAME ابن الزبير
2 _NASAB N
2 TYPE aka
0 TRLR`)
    expect(data.individuals['@I1@'].famousNameInNasab).toBe(false)
  })

  it('keeps the famous name read when the block carries _NASAB', () => {
    const data = parseGedcom(zubairFile('2 _NASAB N'))
    expect(data.individuals['@I1@'].famousName).toBe('ابن الزبير')
  })

  it('keeps the lines after the block read when it carries _NASAB', () => {
    const data = parseGedcom(zubairFile('2 _NASAB N'))
    expect(data.individuals['@I1@'].sex).toBe('M')
  })

  it('ignores _NASAB under the primary NAME', () => {
    const data = parseGedcom(`${GYNAT_HEAD}
0 @I1@ INDI
1 NAME عبدالله
2 _NASAB N
1 NAME ابن الزبير
2 TYPE aka
0 TRLR`)
    expect(data.individuals['@I1@'].famousNameInNasab).toBeUndefined()
  })

  it('keeps the primary name intact when it carries a _NASAB', () => {
    const data = parseGedcom(`${GYNAT_HEAD}
0 @I1@ INDI
1 NAME عبدالله /الزبير/
2 GIVN عبدالله
2 _NASAB N
2 SURN الزبير
0 TRLR`)
    const indi = data.individuals['@I1@']
    expect({ givenName: indi.givenName, surname: indi.surname }).toEqual({
      givenName: 'عبدالله',
      surname: 'الزبير',
    })
  })

  it('ignores _NASAB in a file from another program', () => {
    const data = parseGedcom(zubairFile('2 _NASAB N', FOREIGN_HEAD))
    expect(data.individuals['@I1@'].famousNameInNasab).toBeUndefined()
  })

  it('ignores _NASAB in a file without a HEAD', () => {
    const data = parseGedcom(`0 @I1@ INDI
1 NAME عبدالله
1 NAME ابن الزبير
2 TYPE aka
2 _NASAB N
0 TRLR`)
    expect(data.individuals['@I1@'].famousNameInNasab).toBeUndefined()
  })

  it('ignores _NASAB under a legacy kunya NAME', () => {
    const data = parseGedcom(zubairFile('2 _KUNYA Y\n2 _NASAB N'))
    expect(data.individuals['@I1@'].famousNameInNasab).toBeUndefined()
  })

  it('still reads the legacy kunya NAME carrying _NASAB as the kunya', () => {
    const data = parseGedcom(zubairFile('2 _KUNYA Y\n2 _NASAB N'))
    expect(data.individuals['@I1@'].kunya).toBe('ابن الزبير')
  })

  it('ignores _NASAB under a second aka NAME', () => {
    const data = parseGedcom(`${GYNAT_HEAD}
0 @I1@ INDI
1 NAME عبدالله
1 NAME ابن الزبير
2 TYPE aka
1 NAME أبو خبيب
2 TYPE aka
2 _NASAB Y
0 TRLR`)
    expect(data.individuals['@I1@'].famousNameInNasab).toBeUndefined()
  })

  it('ignores _NASAB under a NAME of another TYPE', () => {
    const data = parseGedcom(`${GYNAT_HEAD}
0 @I1@ INDI
1 NAME عبدالله
1 NAME ابن الزبير
2 TYPE married
2 _NASAB N
0 TRLR`)
    expect(data.individuals['@I1@'].famousNameInNasab).toBeUndefined()
  })

  it('ignores a person-level 1 _NASAB', () => {
    const data = parseGedcom(`${GYNAT_HEAD}
0 @I1@ INDI
1 NAME عبدالله
1 NAME ابن الزبير
2 TYPE aka
1 _NASAB N
0 TRLR`)
    expect(data.individuals['@I1@'].famousNameInNasab).toBeUndefined()
  })

  describe.each(['5.5.1', '7.0'] as const)('round trip through a %s export', (version) => {
    function roundTrip(famousName: string, inNasab: boolean | undefined): boolean | undefined {
      const data = parseGedcom(`${GYNAT_HEAD}
0 @I1@ INDI
1 NAME عبدالله
2 GIVN عبدالله
1 SEX M
0 TRLR`)
      data.individuals['@I1@'].famousName = famousName
      if (inNasab !== undefined) data.individuals['@I1@'].famousNameInNasab = inNasab
      return parseGedcom(gedcomDataToGedcom(data, version)).individuals['@I1@'].famousNameInNasab
    }

    it('preserves true', () => {
      expect(roundTrip('ابن الزبير', true)).toBe(true)
    })

    // «ابن الزبير» defaults to false, so this also locks an explicit default.
    it('preserves false', () => {
      expect(roundTrip('ابن الزبير', false)).toBe(false)
    })

    it('preserves no choice as undefined', () => {
      expect(roundTrip('ابن الزبير', undefined)).toBeUndefined()
    })

    it('preserves an explicit true that equals the default', () => {
      expect(roundTrip('أبو طالب', true)).toBe(true)
    })
  })
})

describe('parseGedcom — legacy kunya NAME form (2 _KUNYA Y)', () => {
  const LEGACY = `0 @I1@ INDI
1 NAME أحمد /سعيد/
2 GIVN أحمد
2 SURN سعيد
1 NAME أبو أحمد
2 TYPE aka
2 _KUNYA Y
1 SEX M
0 TRLR`

  it('reads the legacy kunya NAME value as the kunya', () => {
    const data = parseGedcom(LEGACY)
    expect(data.individuals['@I1@'].kunya).toBe('أبو أحمد')
  })

  it('reads the legacy kunya NAME in a gynat file as the kunya', () => {
    const data = parseGedcom(`${GYNAT_HEAD}\n${LEGACY}`)
    expect(data.individuals['@I1@'].kunya).toBe('أبو أحمد')
  })

  it('leaves the primary name untouched by the legacy kunya NAME', () => {
    const data = parseGedcom(LEGACY)
    const indi = data.individuals['@I1@']
    expect({ name: indi.name, givenName: indi.givenName, surname: indi.surname })
      .toEqual({ name: 'أحمد سعيد', givenName: 'أحمد', surname: 'سعيد' })
  })

  it('does not let a legacy kunya NAME replace an existing 1 _KUNYA', () => {
    const data = parseGedcom(`0 @I1@ INDI
1 NAME أحمد
1 _KUNYA أبو محمد
1 NAME أبو أحمد
2 TYPE aka
2 _KUNYA Y
0 TRLR`)
    expect(data.individuals['@I1@'].kunya).toBe('أبو محمد')
  })

  it('lets a later 1 _KUNYA win over a legacy kunya NAME', () => {
    const data = parseGedcom(`0 @I1@ INDI
1 NAME أحمد
1 NAME أبو أحمد
2 TYPE aka
2 _KUNYA Y
1 _KUNYA أبو محمد
0 TRLR`)
    expect(data.individuals['@I1@'].kunya).toBe('أبو محمد')
  })

  it('never takes a legacy kunya NAME listed first as the primary name', () => {
    const data = parseGedcom(`0 @I1@ INDI
1 NAME أبو أحمد
2 TYPE aka
2 _KUNYA Y
1 NAME أحمد /سعيد/
0 TRLR`)
    const indi = data.individuals['@I1@']
    expect({ name: indi.name, kunya: indi.kunya })
      .toEqual({ name: 'أحمد سعيد', kunya: 'أبو أحمد' })
  })
})

import { describe, it, expect } from 'vitest'
import type {
  GedcomData,
  Individual,
  Family,
  FamilyEvent,
  AncestryJump,
} from '@/lib/gedcom/types'
import { gedcomDataToGedcom, sanitizeRela } from '@/lib/gedcom/exporter'

// ---------------------------------------------------------------------------
// Builders
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
    kunya: '',
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

function makeJump(overrides: Partial<AncestryJump> & { id: string }): AncestryJump {
  return {
    type: '_ANC_JUMP',
    descendant: '',
    ancestorFamily: '',
    generationsMin: null,
    generationsMax: null,
    notes: '',
    ...overrides,
  }
}

function getLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/).filter((l) => l.trim() !== '')
}

/** Lines of the INDI record with the given id, excluding the `0 @id@ INDI` line. */
function indiBlock(text: string, id: string): string[] {
  const lines = getLines(text)
  const start = lines.indexOf(`0 ${id} INDI`)
  if (start === -1) return []
  const block: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('0 ')) break
    block.push(lines[i])
  }
  return block
}

/**
 * A small عدنان ⇢ إسماعيل × هاجر tree:
 *   - `@ADNAN@` has a jump to the ancestor family `@FISH@`
 *   - `@FISH@` has husband إسماعيل and (optionally) wife هاجر
 */
function makeJumpData(options: {
  withWife?: boolean
  husband?: boolean
  jump?: Partial<AncestryJump>
  descendantOverrides?: Partial<Individual>
  ancestorOverrides?: Partial<Individual>
  wifeOverrides?: Partial<Individual>
} = {}): GedcomData {
  const { withWife = false, husband = true } = options

  const adnan = makeIndividual({
    id: '@ADNAN@',
    name: 'عدنان قريش',
    givenName: 'عدنان',
    surname: 'قريش',
    sex: 'M',
    ancestryJumpAsDescendant: '@J1@',
    ...options.descendantOverrides,
  })
  const ishmael = makeIndividual({
    id: '@ISH@',
    name: 'إسماعيل',
    givenName: 'إسماعيل',
    sex: 'M',
    familiesAsSpouse: ['@FISH@'],
    ...options.ancestorOverrides,
  })
  const hajar = makeIndividual({
    id: '@HAJAR@',
    name: 'هاجر',
    givenName: 'هاجر',
    sex: 'F',
    familiesAsSpouse: ['@FISH@'],
    ...options.wifeOverrides,
  })

  const individuals: Record<string, Individual> = { '@ADNAN@': adnan }
  if (husband) individuals['@ISH@'] = ishmael
  if (withWife) individuals['@HAJAR@'] = hajar

  const family = makeFamily({
    id: '@FISH@',
    husband: husband ? '@ISH@' : null,
    wife: withWife ? '@HAJAR@' : null,
    ancestryJumpsAsAncestor: ['@J1@'],
  })

  return {
    individuals,
    families: { '@FISH@': family },
    ancestryJumps: {
      '@J1@': makeJump({
        id: '@J1@',
        descendant: '@ADNAN@',
        ancestorFamily: '@FISH@',
        ...options.jump,
      }),
    },
  }
}

// ---------------------------------------------------------------------------
// 5.5.1
// ---------------------------------------------------------------------------

describe('ancestry jump — GEDCOM 5.5.1 export', () => {
  it('emits one ASSO pointing at the ancestor family husband with RELA ancestor', () => {
    const data = makeJumpData({ jump: { generationsMin: 4, generationsMax: 40 } })
    const block = indiBlock(gedcomDataToGedcom(data, '5.5.1'), '@ADNAN@')

    expect(block.filter((l) => l.startsWith('1 ASSO '))).toEqual(['1 ASSO @ISH@'])
    expect(block).toContain('2 RELA ancestor')
  })

  it('carries the ancestor couple in _ANC_FAM beside the ASSO', () => {
    const data = makeJumpData({ withWife: true })
    const block = indiBlock(gedcomDataToGedcom(data, '5.5.1'), '@ADNAN@')

    expect(block).toContain('2 _ANC_FAM @FISH@')
  })

  it('still emits exactly one ASSO when the ancestor family is a couple', () => {
    const data = makeJumpData({ withWife: true })
    const block = indiBlock(gedcomDataToGedcom(data, '5.5.1'), '@ADNAN@')

    expect(block.filter((l) => l.startsWith('1 ASSO '))).toEqual(['1 ASSO @ISH@'])
  })

  it('points the ASSO at the wife when she is the only known ancestor', () => {
    const data = makeJumpData({ husband: false, withWife: true })
    const block = indiBlock(gedcomDataToGedcom(data, '5.5.1'), '@ADNAN@')

    expect(block.filter((l) => l.startsWith('1 ASSO '))).toEqual(['1 ASSO @HAJAR@'])
  })

  it('emits _GAP_MIN and _GAP_MAX when the bounds are set', () => {
    const data = makeJumpData({ jump: { generationsMin: 4, generationsMax: 40 } })
    const block = indiBlock(gedcomDataToGedcom(data, '5.5.1'), '@ADNAN@')

    expect(block).toContain('2 _GAP_MIN 4')
    expect(block).toContain('2 _GAP_MAX 40')
  })

  it('omits _GAP_MIN and _GAP_MAX when the bounds are null', () => {
    const data = makeJumpData()
    const block = indiBlock(gedcomDataToGedcom(data, '5.5.1'), '@ADNAN@')

    expect(block.some((l) => l.startsWith('2 _GAP_MIN'))).toBe(false)
    expect(block.some((l) => l.startsWith('2 _GAP_MAX'))).toBe(false)
  })

  it('emits the NOTE even when there are no bounds and no user notes', () => {
    const data = makeJumpData()
    const block = indiBlock(gedcomDataToGedcom(data, '5.5.1'), '@ADNAN@')

    const note = block.find((l) => l.startsWith('2 NOTE '))
    expect(note).toBeDefined()
    expect(note).toContain('قفزة نسب')
  })

  it('names both ends in the NOTE lead, so foreign software shows a self-explanatory line', () => {
    const data = makeJumpData()
    const block = indiBlock(gedcomDataToGedcom(data, '5.5.1'), '@ADNAN@')

    expect(block.find((l) => l.startsWith('2 NOTE '))).toBe(
      '2 NOTE قفزة نسب: عدنان قريش من وَلَد إسماعيل، والأجيال بينهما مطويّة.',
    )
  })

  it('names the wife in the NOTE lead when she is the only known ancestor', () => {
    const data = makeJumpData({ husband: false, withWife: true })
    const block = indiBlock(gedcomDataToGedcom(data, '5.5.1'), '@ADNAN@')

    expect(block.find((l) => l.startsWith('2 NOTE '))).toBe(
      '2 NOTE قفزة نسب: عدنان قريش من وَلَد هاجر، والأجيال بينهما مطويّة.',
    )
  })

  it('keeps a name with a newline on the NOTE lead line', () => {
    const data = makeJumpData({ ancestorOverrides: { name: 'إسماعيل\n1 DEAT Y' } })
    const block = indiBlock(gedcomDataToGedcom(data, '5.5.1'), '@ADNAN@')

    expect(block.find((l) => l.startsWith('2 NOTE '))).toBe(
      '2 NOTE قفزة نسب: عدنان قريش من وَلَد إسماعيل 1 DEAT Y، والأجيال بينهما مطويّة.',
    )
  })

  it('appends the generation range to the NOTE as a CONT line', () => {
    const data = makeJumpData({ jump: { generationsMin: 4, generationsMax: 40 } })
    const block = indiBlock(gedcomDataToGedcom(data, '5.5.1'), '@ADNAN@')

    const contLines = block.filter((l) => l.startsWith('3 CONT '))
    expect(contLines.some((l) => l.includes('4') && l.includes('40'))).toBe(true)
  })

  it("appends the user's own notes to the NOTE as further CONT lines", () => {
    const data = makeJumpData({
      jump: { generationsMin: 4, notes: 'قيل سبعة\nوقيل ثلاثون' },
    })
    const block = indiBlock(gedcomDataToGedcom(data, '5.5.1'), '@ADNAN@')

    expect(block).toContain('3 CONT قيل سبعة')
    expect(block).toContain('3 CONT وقيل ثلاثون')
  })

  it('emits the jump block after FAMC and before _RADA_FAMC', () => {
    const data = makeJumpData()
    // Give the descendant a rada'a reference so both neighbours are present.
    data.individuals['@ADNAN@'].radaFamiliesAsChild = ['@RF1@']
    data.individuals['@ADNAN@'].familiesAsSpouse = ['@FADNAN@']
    data.families['@FADNAN@'] = makeFamily({ id: '@FADNAN@', husband: '@ADNAN@' })

    const block = indiBlock(gedcomDataToGedcom(data, '5.5.1'), '@ADNAN@')
    const famsIndex = block.indexOf('1 FAMS @FADNAN@')
    const assoIndex = block.indexOf('1 ASSO @ISH@')
    const radaIndex = block.indexOf('1 _RADA_FAMC @RF1@')

    expect(famsIndex).toBeGreaterThanOrEqual(0)
    expect(assoIndex).toBeGreaterThan(famsIndex)
    expect(radaIndex).toBeGreaterThan(assoIndex)
  })
})

// ---------------------------------------------------------------------------
// 7.0
// ---------------------------------------------------------------------------

describe('ancestry jump — GEDCOM 7.0 export', () => {
  it('uses ROLE _ANCESTOR with a PHRASE instead of RELA', () => {
    const data = makeJumpData({ jump: { generationsMin: 4, generationsMax: 40 } })
    const block = indiBlock(gedcomDataToGedcom(data, '7.0'), '@ADNAN@')

    expect(block).toContain('2 ROLE _ANCESTOR')
    expect(block.some((l) => l.startsWith('2 RELA'))).toBe(false)
  })

  it('states the range in the ROLE PHRASE when both bounds are set', () => {
    const data = makeJumpData({ jump: { generationsMin: 4, generationsMax: 40 } })
    const block = indiBlock(gedcomDataToGedcom(data, '7.0'), '@ADNAN@')

    const phrase = block.find((l) => l.startsWith('3 PHRASE '))
    expect(phrase).toBeDefined()
    expect(phrase).toContain('4')
    expect(phrase).toContain('40')
  })

  it('states an unspecified range in the ROLE PHRASE when neither bound is set', () => {
    const data = makeJumpData()
    const block = indiBlock(gedcomDataToGedcom(data, '7.0'), '@ADNAN@')

    const phrase = block.find((l) => l.startsWith('3 PHRASE '))
    expect(phrase).toBe('3 PHRASE قفزة نسب — عدد الأجيال بينهما غير محدد')
  })

  it('declares _ANCESTOR and _ANC_FAM in the SCHMA block', () => {
    const lines = getLines(gedcomDataToGedcom(makeJumpData(), '7.0'))

    expect(lines).toContain('1 SCHMA')
    expect(lines).toContain('2 TAG _ANCESTOR https://gynat.com/gedcom/ext/_ANCESTOR')
    expect(lines).toContain('2 TAG _ANC_FAM https://gynat.com/gedcom/ext/_ANC_FAM')
  })

  it('declares _GAP_MIN / _GAP_MAX in SCHMA only when a jump states them', () => {
    const without = getLines(gedcomDataToGedcom(makeJumpData(), '7.0'))
    expect(without.some((l) => l.startsWith('2 TAG _GAP_MIN'))).toBe(false)
    expect(without.some((l) => l.startsWith('2 TAG _GAP_MAX'))).toBe(false)

    const withBounds = getLines(
      gedcomDataToGedcom(
        makeJumpData({ jump: { generationsMin: 4, generationsMax: 40 } }),
        '7.0',
      ),
    )
    expect(withBounds).toContain('2 TAG _GAP_MIN https://gynat.com/gedcom/ext/_GAP_MIN')
    expect(withBounds).toContain('2 TAG _GAP_MAX https://gynat.com/gedcom/ext/_GAP_MAX')
  })

  it('emits the NOTE alongside the extension, as 7.0 §1.5.3 requires', () => {
    const data = makeJumpData()
    const block = indiBlock(gedcomDataToGedcom(data, '7.0'), '@ADNAN@')

    expect(block.some((l) => l.startsWith('2 NOTE '))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Fail-closed rules
// ---------------------------------------------------------------------------

describe('ancestry jump — export skips', () => {
  it('emits nothing for a borrowed (_pointed) descendant', () => {
    const data = makeJumpData({ descendantOverrides: { _pointed: true } })
    const text = gedcomDataToGedcom(data, '5.5.1')

    expect(indiBlock(text, '@ADNAN@')).toEqual([])
    expect(text).not.toContain('_ANC_FAM')
  })

  it('emits nothing for a private descendant', () => {
    const data = makeJumpData({ descendantOverrides: { isPrivate: true } })
    const block = indiBlock(gedcomDataToGedcom(data, '5.5.1'), '@ADNAN@')

    expect(block.some((l) => l.startsWith('1 ASSO'))).toBe(false)
    expect(block.some((l) => l.includes('_ANC_FAM'))).toBe(false)
  })

  it('emits nothing when the ancestor husband is private', () => {
    const data = makeJumpData({ ancestorOverrides: { isPrivate: true } })
    const block = indiBlock(gedcomDataToGedcom(data, '5.5.1'), '@ADNAN@')

    expect(block.some((l) => l.startsWith('1 ASSO'))).toBe(false)
    expect(block.some((l) => l.includes('_ANC_FAM'))).toBe(false)
  })

  it('emits nothing when the ancestor wife is private', () => {
    const data = makeJumpData({ withWife: true, wifeOverrides: { isPrivate: true } })
    const block = indiBlock(gedcomDataToGedcom(data, '5.5.1'), '@ADNAN@')

    expect(block.some((l) => l.startsWith('1 ASSO'))).toBe(false)
    expect(block.some((l) => l.includes('_ANC_FAM'))).toBe(false)
  })

  it('emits nothing when the ancestor family is missing from the data', () => {
    const data = makeJumpData()
    delete data.families['@FISH@']
    const block = indiBlock(gedcomDataToGedcom(data, '5.5.1'), '@ADNAN@')

    expect(block.some((l) => l.startsWith('1 ASSO'))).toBe(false)
  })

  it('emits nothing when the ancestor family has neither spouse', () => {
    const data = makeJumpData({ husband: false })
    const block = indiBlock(gedcomDataToGedcom(data, '5.5.1'), '@ADNAN@')

    expect(block.some((l) => l.startsWith('1 ASSO'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// RELA length guard
// ---------------------------------------------------------------------------

describe('sanitizeRela', () => {
  it('truncates a RELA value to the 25-character GEDCOM 5.5.1 limit', () => {
    expect(sanitizeRela('a'.repeat(40))).toBe('a'.repeat(25))
  })

  it('keeps a short value intact', () => {
    expect(sanitizeRela('ancestor')).toBe('ancestor')
  })

  it('strips cross-reference and newline characters before truncating', () => {
    expect(sanitizeRela('anc@estor\nx')).toBe('ancestor x')
  })
})

// ---------------------------------------------------------------------------
// Read-path lock: the per-workspace «قفزة نسب» toggle (`enableAncestryJumps`)
// gates only the CREATE route. Export is a read path — it takes no workspace
// flag, so an existing jump is always written out, toggle on or off.
// ---------------------------------------------------------------------------

describe('ancestry jump export is independent of the workspace toggle', () => {
  it('emits an existing jump from the data alone (no feature flag is consulted)', () => {
    const out = gedcomDataToGedcom(makeJumpData(), '5.5.1')
    expect(indiBlock(out, '@ADNAN@')).toContain('1 ASSO @ISH@')
  })
})

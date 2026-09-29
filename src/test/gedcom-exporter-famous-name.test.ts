import { describe, it, expect } from 'vitest'
import type { GedcomData, Individual } from '@/lib/gedcom/types'
import { gedcomDataToGedcom } from '@/lib/gedcom/exporter'

// Export of اسم الشهرة as a second `1 NAME` with `2 TYPE aka` (5.5.1) /
// `2 TYPE AKA` (7.0), exactly as documented on /islamic-gedcom.

function makeIndividual(overrides: Partial<Individual> & { id: string }): Individual {
  return {
    type: 'INDI',
    name: '',
    givenName: '',
    surname: '',
    sex: 'M',
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

function dataOf(...people: Individual[]): GedcomData {
  return {
    individuals: Object.fromEntries(people.map((p) => [p.id, p])),
    families: {},
  }
}

/** The lines of one INDI record, from `0 @id@ INDI` up to the next level-0 line. */
function recordLines(text: string, id: string): string[] {
  const lines = text.split('\n')
  const start = lines.indexOf(`0 @${id}@ INDI`)
  if (start === -1) throw new Error(`record ${id} not found`)
  const out = [lines[start]]
  for (let i = start + 1; i < lines.length && !lines[i].startsWith('0 '); i++) {
    out.push(lines[i])
  }
  return out
}

/** Record lines without SEX (the page examples omit it). */
function nameLines(text: string, id: string): string[] {
  return recordLines(text, id).filter((l) => !l.startsWith('1 SEX'))
}

const VERSIONS = [
  ['5.5.1', 'aka'],
  ['7.0', 'AKA'],
] as const

describe.each(VERSIONS)('famous name export — GEDCOM %s', (version, akaType) => {
  it('شيبة / عبدالمطلب matches the documented form', () => {
    const text = gedcomDataToGedcom(
      dataOf(makeIndividual({ id: 'I1', name: 'شيبة', givenName: 'شيبة', famousName: 'عبدالمطلب' })),
      version,
    )
    expect(nameLines(text, 'I1')).toEqual([
      '0 @I1@ INDI',
      '1 NAME شيبة',
      '2 GIVN شيبة',
      '1 NAME عبدالمطلب',
      `2 TYPE ${akaType}`,
    ])
  })

  it('عمرو / هاشم matches the documented form', () => {
    const text = gedcomDataToGedcom(
      dataOf(makeIndividual({ id: 'I2', name: 'عمرو', givenName: 'عمرو', famousName: 'هاشم' })),
      version,
    )
    expect(nameLines(text, 'I2')).toEqual([
      '0 @I2@ INDI',
      '1 NAME عمرو',
      '2 GIVN عمرو',
      '1 NAME هاشم',
      `2 TYPE ${akaType}`,
    ])
  })

  it('عبدمناف / أبو طالب writes both the aka NAME and the _KUNYA', () => {
    const text = gedcomDataToGedcom(
      dataOf(
        makeIndividual({
          id: 'I3',
          name: 'عبدمناف',
          givenName: 'عبدمناف',
          famousName: 'أبو طالب',
          kunya: 'أبو طالب',
        }),
      ),
      version,
    )
    expect(nameLines(text, 'I3')).toEqual([
      '0 @I3@ INDI',
      '1 NAME عبدمناف',
      '2 GIVN عبدمناف',
      '1 NAME أبو طالب',
      `2 TYPE ${akaType}`,
      '1 _KUNYA أبو طالب',
    ])
  })

  it('the real name NAME comes before the famous name NAME (with a surname)', () => {
    const text = gedcomDataToGedcom(
      dataOf(
        makeIndividual({
          id: 'I1',
          name: 'شيبة هاشم',
          givenName: 'شيبة',
          surname: 'هاشم',
          famousName: 'عبدالمطلب',
        }),
      ),
      version,
    )
    const names = recordLines(text, 'I1').filter((l) => l.startsWith('1 NAME'))
    expect(names).toEqual(['1 NAME شيبة /هاشم/', '1 NAME عبدالمطلب'])
  })

  it('writes no aka NAME when the famous name equals the real name', () => {
    const text = gedcomDataToGedcom(
      dataOf(makeIndividual({ id: 'I1', name: 'شيبة', givenName: 'شيبة', famousName: '  شيبة ' })),
      version,
    )
    expect(recordLines(text, 'I1').filter((l) => l.startsWith('1 NAME'))).toEqual(['1 NAME شيبة'])
  })

  it('writes no aka NAME for a whitespace-only famous name', () => {
    const text = gedcomDataToGedcom(
      dataOf(makeIndividual({ id: 'I1', name: 'شيبة', givenName: 'شيبة', famousName: '   ' })),
      version,
    )
    expect(text).not.toContain('TYPE')
  })

  it('trims the famous name', () => {
    const text = gedcomDataToGedcom(
      dataOf(makeIndividual({ id: 'I1', name: 'شيبة', givenName: 'شيبة', famousName: '  عبدالمطلب  ' })),
      version,
    )
    expect(recordLines(text, 'I1')).toContain('1 NAME عبدالمطلب')
  })

  it('strips slashes so the famous name is never read back as a surname', () => {
    const text = gedcomDataToGedcom(
      dataOf(makeIndividual({ id: 'I1', name: 'شيبة', givenName: 'شيبة', famousName: 'عبد/المطلب/' })),
      version,
    )
    const names = recordLines(text, 'I1').filter((l) => l.startsWith('1 NAME'))
    expect(names[1]).toBe('1 NAME عبدالمطلب')
  })

  it('sanitizes newline injection and @ in the famous name', () => {
    const text = gedcomDataToGedcom(
      dataOf(
        makeIndividual({
          id: 'I1',
          name: 'شيبة',
          givenName: 'شيبة',
          famousName: 'عبدالمطلب\r\n0 @X1@ INDI\n1 NAME forged',
        }),
      ),
      version,
    )
    expect(text).not.toMatch(/^0 @X1@ INDI$/m)
    expect(text).not.toMatch(/^1 NAME forged$/m)
    const record = recordLines(text, 'I1')
    expect(record.filter((l) => l.startsWith('1 NAME'))).toHaveLength(2)
    expect(record.join('\n')).not.toContain('@X1@')
  })

  it('a private person gets only `1 NAME PRIVATE` — no aka NAME, no _KUNYA', () => {
    const text = gedcomDataToGedcom(
      dataOf(
        makeIndividual({
          id: 'I3',
          name: 'عبدمناف',
          givenName: 'عبدمناف',
          famousName: 'أبو طالب',
          kunya: 'أبو طالب',
          isPrivate: true,
        }),
      ),
      version,
    )
    expect(nameLines(text, 'I3')).toEqual(['0 @I3@ INDI', '1 NAME PRIVATE'])
    expect(text).not.toContain('أبو طالب')
  })

  it('a person without a famous name exports byte-identically to one with the field absent', () => {
    const base = makeIndividual({
      id: 'I1',
      name: 'عبدمناف',
      givenName: 'عبدمناف',
      surname: 'هاشم',
      kunya: 'أبو طالب',
    })
    const withEmpty = { ...base, famousName: '' }
    const withUndefined = { ...base, famousName: undefined }
    const expected = gedcomDataToGedcom(dataOf(base), version)
    expect(gedcomDataToGedcom(dataOf(withEmpty), version)).toBe(expected)
    expect(gedcomDataToGedcom(dataOf(withUndefined), version)).toBe(expected)
    expect(expected).not.toContain('TYPE')
  })
})

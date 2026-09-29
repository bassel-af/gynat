import { describe, it, expect } from 'vitest'
import type { GedcomData, Individual } from '@/lib/gedcom/types'
import { gedcomDataToGedcom } from '@/lib/gedcom/exporter'

// Export of «يُذكر في النسب باسم» (famousNameInNasab) as `2 _NASAB Y|N` under
// the famous-name aka NAME, exactly as documented on /islamic-gedcom.

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

function nameLines(text: string, id: string): string[] {
  return recordLines(text, id).filter((l) => !l.startsWith('1 SEX'))
}

function ibnZubair(overrides: Partial<Individual> = {}): Individual {
  return makeIndividual({
    id: 'I1',
    name: 'عبدالله',
    givenName: 'عبدالله',
    famousName: 'ابن الزبير',
    ...overrides,
  })
}

const NASAB_SCHMA = '2 TAG _NASAB https://gynat.com/gedcom/ext/_NASAB'

const VERSIONS = [
  ['5.5.1', 'aka'],
  ['7.0', 'AKA'],
] as const

describe.each(VERSIONS)('famousNameInNasab export — GEDCOM %s', (version, akaType) => {
  it('عبدالله / «ابن الزبير» with explicit false writes `2 _NASAB N` under the aka NAME', () => {
    const text = gedcomDataToGedcom(dataOf(ibnZubair({ famousNameInNasab: false })), version)
    expect(nameLines(text, 'I1')).toEqual([
      '0 @I1@ INDI',
      '1 NAME عبدالله',
      '2 GIVN عبدالله',
      '1 NAME ابن الزبير',
      `2 TYPE ${akaType}`,
      '2 _NASAB N',
    ])
  })

  it('explicit true writes `2 _NASAB Y`', () => {
    const text = gedcomDataToGedcom(dataOf(ibnZubair({ famousNameInNasab: true })), version)
    expect(recordLines(text, 'I1')).toContain('2 _NASAB Y')
    expect(text).not.toContain('2 _NASAB N')
  })

  it('writes `_NASAB` before `1 _KUNYA`', () => {
    const text = gedcomDataToGedcom(
      dataOf(ibnZubair({ famousNameInNasab: true, kunya: 'أبو بكر' })),
      version,
    )
    const rec = recordLines(text, 'I1')
    expect(rec.indexOf('2 _NASAB Y')).toBe(rec.indexOf(`2 TYPE ${akaType}`) + 1)
    expect(rec.indexOf('1 _KUNYA أبو بكر')).toBe(rec.indexOf('2 _NASAB Y') + 1)
  })

  it('null / undefined write no `_NASAB` and output is byte-identical to the field absent', () => {
    const base = ibnZubair({ kunya: 'أبو بكر' })
    const expected = gedcomDataToGedcom(dataOf(base), version)
    const withNull = { ...base, famousNameInNasab: null as unknown as boolean }
    const withUndefined = { ...base, famousNameInNasab: undefined }
    expect(gedcomDataToGedcom(dataOf(withNull), version)).toBe(expected)
    expect(gedcomDataToGedcom(dataOf(withUndefined), version)).toBe(expected)
    expect(expected).not.toContain('_NASAB')
  })

  it('a private person writes no `_NASAB` (and no SCHMA entry)', () => {
    const text = gedcomDataToGedcom(
      dataOf(ibnZubair({ famousNameInNasab: false, isPrivate: true })),
      version,
    )
    expect(nameLines(text, 'I1')).toEqual(['0 @I1@ INDI', '1 NAME PRIVATE'])
    expect(text).not.toContain('_NASAB')
  })

  it('no `_NASAB` when no famous name is emitted (famous name equals real name)', () => {
    const text = gedcomDataToGedcom(
      dataOf(ibnZubair({ famousName: 'عبدالله', famousNameInNasab: true })),
      version,
    )
    expect(text).not.toContain('_NASAB')
  })

  it('no `_NASAB` when the famous name is missing', () => {
    const text = gedcomDataToGedcom(
      dataOf(ibnZubair({ famousName: '', famousNameInNasab: false })),
      version,
    )
    expect(text).not.toContain('_NASAB')
  })

  it('no `_NASAB` for a pointed (borrowed) person', () => {
    const text = gedcomDataToGedcom(
      dataOf(ibnZubair({ famousNameInNasab: false, _pointed: true } as Partial<Individual>)),
      version,
    )
    expect(text).not.toContain('_NASAB')
  })
})

describe('famousNameInNasab — 7.0 SCHMA', () => {
  it('declares `_NASAB` in SCHMA when a person emits it', () => {
    const text = gedcomDataToGedcom(dataOf(ibnZubair({ famousNameInNasab: false })), '7.0')
    const lines = text.split('\n')
    expect(lines).toContain('1 SCHMA')
    expect(lines).toContain(NASAB_SCHMA)
  })

  it('declares `_NASAB` alongside `_KUNYA`', () => {
    const text = gedcomDataToGedcom(
      dataOf(ibnZubair({ famousNameInNasab: true, kunya: 'أبو بكر' })),
      '7.0',
    )
    const lines = text.split('\n')
    expect(lines).toContain('2 TAG _KUNYA https://gynat.com/gedcom/ext/_KUNYA')
    expect(lines).toContain(NASAB_SCHMA)
  })

  it('no SCHMA entry when the choice is null', () => {
    const text = gedcomDataToGedcom(dataOf(ibnZubair()), '7.0')
    expect(text).not.toContain('_NASAB')
    expect(text).not.toContain('1 SCHMA')
  })

  it('no SCHMA entry when the choice is set but no famous name is emitted', () => {
    const text = gedcomDataToGedcom(
      dataOf(ibnZubair({ famousName: 'عبدالله', famousNameInNasab: false })),
      '7.0',
    )
    expect(text).not.toContain('_NASAB')
  })

  it('5.5.1 has no SCHMA even when `_NASAB` is written', () => {
    const text = gedcomDataToGedcom(dataOf(ibnZubair({ famousNameInNasab: false })), '5.5.1')
    expect(text).not.toContain('SCHMA')
    expect(text).toContain('2 _NASAB N')
  })
})

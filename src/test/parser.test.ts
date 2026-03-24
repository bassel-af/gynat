import { describe, it, expect } from 'vitest'
import { parseGedcom } from '@/lib/gedcom/parser'

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

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

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseGedcom } from '@/lib/gedcom/parser'
import type { GedcomData } from '@/lib/gedcom/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The single jump in `data`, or `undefined` when there is none. */
function onlyJump(data: GedcomData) {
  const jumps = Object.values(data.ancestryJumps ?? {})
  expect(jumps.length).toBeLessThanOrEqual(1)
  return jumps[0]
}

function ged(body: string): string {
  return ['0 HEAD', '1 GEDC', '2 VERS 5.5.1', body.trim(), '0 TRLR'].join('\n')
}

// ---------------------------------------------------------------------------
// Fixture (5.5.1)
// ---------------------------------------------------------------------------

describe('parseGedcom — ancestry jump fixture (5.5.1)', () => {
  const text = readFileSync(
    join(__dirname, 'fixtures', 'ancestry-jump.ged'),
    'utf-8',
  )
  const data = parseGedcom(text)

  it('produces exactly one ancestry jump', () => {
    expect(Object.keys(data.ancestryJumps ?? {})).toHaveLength(1)
  })

  it('binds the jump to the ASSO owner as descendant', () => {
    expect(onlyJump(data).descendant).toBe('@I-ADNAN@')
  })

  it('binds the jump to the _ANC_FAM family as ancestor', () => {
    expect(onlyJump(data).ancestorFamily).toBe('@F-ISHMAEL@')
  })

  it('reads the generation bounds', () => {
    const jump = onlyJump(data)
    expect(jump.generationsMin).toBe(4)
    expect(jump.generationsMax).toBe(40)
  })

  it('keeps the NOTE and its CONT continuations as the jump notes', () => {
    expect(onlyJump(data).notes).toBe(
      'قفزة نسب\nعدد الأجيال بينهما: بين 4 و40.\nقيل سبعة، وقيل ثلاثون، وقيل أربعون.',
    )
  })

  it('sets the back-reference on the descendant individual', () => {
    expect(data.individuals['@I-ADNAN@'].ancestryJumpAsDescendant).toBe(
      onlyJump(data).id,
    )
  })

  it('sets the back-reference on the ancestor family', () => {
    expect(data.families['@F-ISHMAEL@'].ancestryJumpsAsAncestor).toEqual([
      onlyJump(data).id,
    ])
  })

  it('does not invent a parent-child link for the jump', () => {
    expect(data.individuals['@I-ADNAN@'].familyAsChild).toBeNull()
    expect(data.families['@F-ISHMAEL@'].children).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 7.0 form
// ---------------------------------------------------------------------------

describe('parseGedcom — ancestry jump (7.0 ROLE form)', () => {
  const data = parseGedcom(
    ged(`
0 @I1@ INDI
1 NAME عدنان //
1 SEX M
1 ASSO @I2@
2 ROLE _ANCESTOR
3 PHRASE قفزة نسب — بين 4 و40 جيلاً
2 _ANC_FAM @F1@
2 _GAP_MIN 4
2 _GAP_MAX 40
2 NOTE قفزة نسب
0 @I2@ INDI
1 NAME إسماعيل //
1 SEX M
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I2@
`),
  )

  it('recognises ROLE _ANCESTOR as a jump', () => {
    expect(onlyJump(data)).toBeDefined()
    expect(onlyJump(data).descendant).toBe('@I1@')
    expect(onlyJump(data).ancestorFamily).toBe('@F1@')
  })

  it('reads the bounds from the 7.0 form too', () => {
    expect(onlyJump(data).generationsMin).toBe(4)
    expect(onlyJump(data).generationsMax).toBe(40)
  })

  it('does not store the ROLE PHRASE as the notes', () => {
    expect(onlyJump(data).notes).toBe('قفزة نسب')
  })
})

// ---------------------------------------------------------------------------
// Family resolution order
// ---------------------------------------------------------------------------

describe('parseGedcom — ancestry jump family resolution', () => {
  it('prefers _ANC_FAM over the target FAMS when both are present', () => {
    const data = parseGedcom(
      ged(`
0 @I1@ INDI
1 ASSO @I2@
2 RELA ancestor
2 _ANC_FAM @F2@
0 @I2@ INDI
1 SEX M
1 FAMS @F1@
1 FAMS @F2@
0 @F1@ FAM
1 HUSB @I2@
0 @F2@ FAM
1 HUSB @I2@
`),
    )

    expect(onlyJump(data).ancestorFamily).toBe('@F2@')
  })

  it("falls back to the target's first FAMS family when _ANC_FAM is absent", () => {
    const data = parseGedcom(
      ged(`
0 @I1@ INDI
1 ASSO @I2@
2 RELA ancestor
0 @I2@ INDI
1 SEX M
1 FAMS @F1@
1 FAMS @F2@
0 @F1@ FAM
1 HUSB @I2@
0 @F2@ FAM
1 HUSB @I2@
`),
    )

    expect(onlyJump(data).ancestorFamily).toBe('@F1@')
  })

  it('falls back to FAMS when _ANC_FAM names a family that is not in the file', () => {
    const data = parseGedcom(
      ged(`
0 @I1@ INDI
1 ASSO @I2@
2 RELA ancestor
2 _ANC_FAM @NOPE@
0 @I2@ INDI
1 SEX M
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I2@
`),
    )

    expect(onlyJump(data).ancestorFamily).toBe('@F1@')
  })

  it('synthesizes a one-spouse family with the male target as husband', () => {
    const data = parseGedcom(
      ged(`
0 @I1@ INDI
1 ASSO @I2@
2 RELA ancestor
0 @I2@ INDI
1 NAME إسماعيل //
1 SEX M
`),
    )

    const jump = onlyJump(data)
    const family = data.families[jump.ancestorFamily]
    expect(family).toBeDefined()
    expect(family.husband).toBe('@I2@')
    expect(family.wife).toBeNull()
    expect(family.children).toEqual([])
  })

  it('synthesizes a one-spouse family with the female target as wife', () => {
    const data = parseGedcom(
      ged(`
0 @I1@ INDI
1 ASSO @I2@
2 RELA ancestor
0 @I2@ INDI
1 NAME هاجر //
1 SEX F
`),
    )

    const family = data.families[onlyJump(data).ancestorFamily]
    expect(family.wife).toBe('@I2@')
    expect(family.husband).toBeNull()
  })

  it('gives the target a FAMS back-reference to the synthesized family', () => {
    const data = parseGedcom(
      ged(`
0 @I1@ INDI
1 ASSO @I2@
2 RELA ancestor
0 @I2@ INDI
1 SEX M
`),
    )

    const familyId = onlyJump(data).ancestorFamily
    expect(data.individuals['@I2@'].familiesAsSpouse).toEqual([familyId])
  })
})

// ---------------------------------------------------------------------------
// Drop rules
// ---------------------------------------------------------------------------

describe('parseGedcom — ancestry jump drop rules', () => {
  it('ignores an ASSO with an unrecognised RELA', () => {
    const data = parseGedcom(
      ged(`
0 @I1@ INDI
1 ASSO @I2@
2 RELA godparent
2 _ANC_FAM @F1@
0 @I2@ INDI
1 SEX M
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I2@
`),
    )

    expect(data.ancestryJumps).toBeUndefined()
    expect(data.individuals['@I1@'].ancestryJumpAsDescendant).toBeUndefined()
  })

  it('ignores an ASSO with no RELA and no ROLE', () => {
    const data = parseGedcom(
      ged(`
0 @I1@ INDI
1 ASSO @I2@
0 @I2@ INDI
1 SEX M
`),
    )

    expect(data.ancestryJumps).toBeUndefined()
  })

  it('keeps the first jump and drops a second one for the same person', () => {
    const data = parseGedcom(
      ged(`
0 @I1@ INDI
1 ASSO @I2@
2 RELA ancestor
2 _ANC_FAM @F1@
1 ASSO @I3@
2 RELA ancestor
2 _ANC_FAM @F2@
0 @I2@ INDI
1 SEX M
1 FAMS @F1@
0 @I3@ INDI
1 SEX M
1 FAMS @F2@
0 @F1@ FAM
1 HUSB @I2@
0 @F2@ FAM
1 HUSB @I3@
`),
    )

    expect(Object.keys(data.ancestryJumps ?? {})).toHaveLength(1)
    expect(onlyJump(data).ancestorFamily).toBe('@F1@')
  })

  it('drops a jump on a person who already has a FAMC (parents win)', () => {
    const data = parseGedcom(
      ged(`
0 @I1@ INDI
1 FAMC @F0@
1 ASSO @I2@
2 RELA ancestor
2 _ANC_FAM @F1@
0 @I2@ INDI
1 SEX M
1 FAMS @F1@
0 @F0@ FAM
1 CHIL @I1@
0 @F1@ FAM
1 HUSB @I2@
`),
    )

    expect(data.ancestryJumps).toBeUndefined()
    expect(data.individuals['@I1@'].familyAsChild).toBe('@F0@')
  })

  it('drops a jump whose ASSO target is not in the file', () => {
    const data = parseGedcom(
      ged(`
0 @I1@ INDI
1 ASSO @GHOST@
2 RELA ancestor
`),
    )

    expect(data.ancestryJumps).toBeUndefined()
  })

  it('drops a jump whose _ANC_FAM does not name the ASSO target as a spouse', () => {
    // `_ANC_FAM` must corroborate the `ASSO`. A family that names someone else
    // would render «من وَلَد ‹شخص آخر›» — a claim the file never made.
    const data = parseGedcom(
      ged(`
0 @I1@ INDI
1 ASSO @I2@
2 RELA ancestor
2 _ANC_FAM @F3@
0 @I2@ INDI
1 SEX M
1 FAMS @F1@
0 @I3@ INDI
1 SEX M
1 FAMS @F3@
0 @F1@ FAM
1 HUSB @I2@
0 @F3@ FAM
1 HUSB @I3@
`),
    )

    expect(data.ancestryJumps).toBeUndefined()
    expect(data.individuals['@I1@'].ancestryJumpAsDescendant).toBeUndefined()
  })

  it('leaves ancestryJumps undefined for a file with no jumps', () => {
    const data = parseGedcom(
      ged(`
0 @I1@ INDI
1 NAME أحمد //
`),
    )

    expect(data.ancestryJumps).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Import-path rule enforcement (security review M2)
//
// The POST route rejects these with a 400. A crafted or corrupt file must not
// be able to write state the API forbids, so the parser re-checks every
// assembled jump against the finished payload and drops violators as silently
// as the drop rules above.
// ---------------------------------------------------------------------------

describe('parseGedcom — ancestry jump invariants on the import path', () => {
  it('drops BOTH jumps of an A↔B cycle', () => {
    const data = parseGedcom(
      ged(`
0 @A@ INDI
1 SEX M
1 FAMS @FA@
1 ASSO @B@
2 RELA ancestor
2 _ANC_FAM @FB@
0 @B@ INDI
1 SEX M
1 FAMS @FB@
1 ASSO @A@
2 RELA ancestor
2 _ANC_FAM @FA@
0 @FA@ FAM
1 HUSB @A@
0 @FB@ FAM
1 HUSB @B@
`),
    )

    expect(Object.keys(data.ancestryJumps ?? {})).toHaveLength(0)
    expect(data.individuals['@A@'].ancestryJumpAsDescendant).toBeUndefined()
    expect(data.individuals['@B@'].ancestryJumpAsDescendant).toBeUndefined()
  })

  it('clears the ancestor-family back-reference of a dropped jump', () => {
    const data = parseGedcom(
      ged(`
0 @A@ INDI
1 SEX M
1 FAMS @FA@
1 ASSO @B@
2 RELA ancestor
2 _ANC_FAM @FB@
0 @B@ INDI
1 SEX M
1 FAMS @FB@
1 ASSO @A@
2 RELA ancestor
2 _ANC_FAM @FA@
0 @FA@ FAM
1 HUSB @A@
0 @FB@ FAM
1 HUSB @B@
`),
    )

    expect(data.families['@FA@'].ancestryJumpsAsAncestor).toBeUndefined()
    expect(data.families['@FB@'].ancestryJumpsAsAncestor).toBeUndefined()
  })

  it('drops a jump whose ASSO points at the owner himself', () => {
    const data = parseGedcom(
      ged(`
0 @I1@ INDI
1 SEX M
1 FAMS @F1@
1 ASSO @I1@
2 RELA ancestor
0 @F1@ FAM
1 HUSB @I1@
`),
    )

    expect(data.ancestryJumps).toBeUndefined()
    expect(data.individuals['@I1@'].ancestryJumpAsDescendant).toBeUndefined()
  })

  it('caps the imported notes at 5000 characters', () => {
    const data = parseGedcom(
      ged(`
0 @I1@ INDI
1 ASSO @I2@
2 RELA ancestor
2 NOTE ${'ن'.repeat(6000)}
0 @I2@ INDI
1 SEX M
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I2@
`),
    )

    expect(onlyJump(data).notes).toHaveLength(5000)
  })

  it('still imports a jump that breaks no rule', () => {
    const data = parseGedcom(
      ged(`
0 @I1@ INDI
1 ASSO @I2@
2 RELA ancestor
2 _ANC_FAM @F1@
2 _GAP_MIN 4
2 _GAP_MAX 40
0 @I2@ INDI
1 SEX M
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I2@
`),
    )

    expect(onlyJump(data).descendant).toBe('@I1@')
    expect(onlyJump(data).ancestorFamily).toBe('@F1@')
  })
})

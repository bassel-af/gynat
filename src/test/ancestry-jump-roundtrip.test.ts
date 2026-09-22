import { describe, it, expect } from 'vitest'
import { parseGedcom } from '@/lib/gedcom/parser'
import { gedcomDataToGedcom } from '@/lib/gedcom/exporter'
import type {
  GedcomData,
  Individual,
  Family,
  FamilyEvent,
  AncestryJump,
} from '@/lib/gedcom/types'

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

/** عدنان ⇢ (إسماعيل × هاجر) — the couple case; drop the wife for the single case. */
function makeSource(withWife: boolean, jump: Partial<AncestryJump> = {}): GedcomData {
  const individuals: Record<string, Individual> = {
    '@ADNAN@': makeIndividual({
      id: '@ADNAN@',
      name: 'عدنان قريش',
      givenName: 'عدنان',
      surname: 'قريش',
      sex: 'M',
      ancestryJumpAsDescendant: '@J1@',
    }),
    '@ISH@': makeIndividual({
      id: '@ISH@',
      name: 'إسماعيل',
      givenName: 'إسماعيل',
      sex: 'M',
      familiesAsSpouse: ['@FISH@'],
    }),
  }
  if (withWife) {
    individuals['@HAJAR@'] = makeIndividual({
      id: '@HAJAR@',
      name: 'هاجر',
      givenName: 'هاجر',
      sex: 'F',
      familiesAsSpouse: ['@FISH@'],
    })
  }

  return {
    individuals,
    families: {
      '@FISH@': makeFamily({
        id: '@FISH@',
        husband: '@ISH@',
        wife: withWife ? '@HAJAR@' : null,
        ancestryJumpsAsAncestor: ['@J1@'],
      }),
    },
    ancestryJumps: {
      '@J1@': {
        id: '@J1@',
        type: '_ANC_JUMP',
        descendant: '@ADNAN@',
        ancestorFamily: '@FISH@',
        generationsMin: 4,
        generationsMax: 40,
        notes: 'قيل سبعة، وقيل ثلاثون، وقيل أربعون.',
        ...jump,
      },
    },
  }
}

// ---------------------------------------------------------------------------
// Round trip
// ---------------------------------------------------------------------------

for (const version of ['5.5.1', '7.0'] as const) {
  describe(`ancestry jump round trip — ${version}`, () => {
    for (const [label, withWife] of [
      ['single ancestor', false],
      ['ancestor couple', true],
    ] as const) {
      describe(label, () => {
        const source = makeSource(withWife)
        const reparsed = parseGedcom(gedcomDataToGedcom(source, version))
        const jumps = Object.values(reparsed.ancestryJumps ?? {})

        it('reproduces exactly one jump', () => {
          expect(jumps).toHaveLength(1)
        })

        it('reproduces the descendant and the ancestor family', () => {
          expect(jumps[0].descendant).toBe('@ADNAN@')
          expect(jumps[0].ancestorFamily).toBe('@FISH@')
        })

        it('reproduces the generation bounds', () => {
          expect(jumps[0].generationsMin).toBe(4)
          expect(jumps[0].generationsMax).toBe(40)
        })

        it("carries the user's own notes through", () => {
          expect(jumps[0].notes).toContain('قيل سبعة، وقيل ثلاثون، وقيل أربعون.')
        })

        it('carries the generated NOTE lead, range line and user notes in order', () => {
          expect(jumps[0].notes).toBe(
            [
              'قفزة نسب: عدنان قريش من وَلَد إسماعيل، والأجيال بينهما مطويّة.',
              'عدد الأجيال بينهما: بين 4 و40.',
              'قيل سبعة، وقيل ثلاثون، وقيل أربعون.',
            ].join('\n'),
          )
        })

        it('reproduces the back-references', () => {
          expect(reparsed.individuals['@ADNAN@'].ancestryJumpAsDescendant).toBe(
            jumps[0].id,
          )
          expect(reparsed.families['@FISH@'].ancestryJumpsAsAncestor).toEqual([
            jumps[0].id,
          ])
        })

        it('does not turn the jump into a parent-child link', () => {
          expect(reparsed.individuals['@ADNAN@'].familyAsChild).toBeNull()
          expect(reparsed.families['@FISH@'].children).toEqual([])
        })
      })
    }

    it('round-trips a jump with no bounds', () => {
      const source = makeSource(false, { generationsMin: null, generationsMax: null })
      const jumps = Object.values(
        parseGedcom(gedcomDataToGedcom(source, version)).ancestryJumps ?? {},
      )

      expect(jumps).toHaveLength(1)
      expect(jumps[0].generationsMin).toBeNull()
      expect(jumps[0].generationsMax).toBeNull()
    })
  })
}

// ---------------------------------------------------------------------------
// Note text is DATA, never GEDCOM structure (security review M1)
//
// A bare CR is a line break to this repo's parser (`/\r\n|\r|\n/`) and to most
// genealogy software, and a bare `@` is a cross-reference sigil. Neither may
// survive into an emitted NOTE/CONT line as itself.
// ---------------------------------------------------------------------------

/** A forged record separated by bare CRs, plus a literal at-sign. */
const INJECTION = 'قيل سبعة\r0 @FAKE@ INDI\r1 NAME مزوّر\rبريد: a@b'
/** What the note must read back as: CR normalised to LF, text otherwise intact. */
const INJECTION_NORMALIZED = INJECTION.replace(/\r\n?/g, '\n')

describe('note text never becomes GEDCOM structure', () => {
  describe('jump notes', () => {
    const source = makeSource(false, {
      notes: INJECTION,
      generationsMin: null,
      generationsMax: null,
    })
    const text = gedcomDataToGedcom(source, '5.5.1')
    const reparsed = parseGedcom(text)

    it('forges no extra record', () => {
      expect(reparsed.individuals['@FAKE@']).toBeUndefined()
      expect(Object.keys(reparsed.individuals).sort()).toEqual(['@ADNAN@', '@ISH@'])
    })

    it('splits the bare CR onto its own CONT line', () => {
      expect(text.split('\n')).toContain('3 CONT 1 NAME مزوّر')
    })

    it('doubles every at-sign so no note line reads back as a pointer', () => {
      expect(text).toContain('0 @@FAKE@@ INDI')
      expect(text).toContain('بريد: a@@b')
      expect(text).not.toContain('0 @FAKE@ INDI')
    })

    it('round-trips the note text itself unchanged', () => {
      const jump = Object.values(reparsed.ancestryJumps ?? {})[0]
      expect(jump.notes.endsWith(INJECTION_NORMALIZED)).toBe(true)
    })
  })

  // One shared helper serves every note path, so fixing the jump path must fix
  // the five pre-existing ones with it.
  describe('individual notes (same helper)', () => {
    const source = makeSource(false)
    source.individuals['@ISH@'].notes = INJECTION
    const reparsed = parseGedcom(gedcomDataToGedcom(source, '5.5.1'))

    it('forges no extra record', () => {
      expect(reparsed.individuals['@FAKE@']).toBeUndefined()
    })

    it('round-trips the note text unchanged', () => {
      expect(reparsed.individuals['@ISH@'].notes).toBe(INJECTION_NORMALIZED)
    })
  })
})

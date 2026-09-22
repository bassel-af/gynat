import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import IslamicGedcomPage from '@/app/islamic-gedcom/page'

// The «قفزة نسب» section of the public GEDCOM reference. What can break here is
// the classification of each tag (standard vs custom — readers copy these into
// their own files) and the scholarly framing, which is restricted to one sourced
// line. Prose wording is deliberately not asserted.

let container: HTMLElement

beforeEach(() => {
  container = render(<IslamicGedcomPage />).container
})

function section(): HTMLElement {
  const found = container.querySelector<HTMLElement>('#ancestry-jump')
  if (!found) throw new Error('missing #ancestry-jump section')
  return found
}

// CSS-module class names are hashed at build time, so match on the stable
// author-written part of the generated name.
function badgeTexts(scope: HTMLElement, className: string): string[] {
  return Array.from(scope.querySelectorAll(`[class*="${className}"]`)).map((el) =>
    (el.textContent ?? '').trim(),
  )
}

describe('/islamic-gedcom — «قفزة نسب» section', () => {
  it('renders the section', () => {
    expect(section()).toBeTruthy()
  })

  it('places the section after الرضاعة and before الكنية', () => {
    const ids = Array.from(container.querySelectorAll('section')).map((s) => s.id)

    expect(ids.indexOf('ancestry-jump')).toBeGreaterThan(ids.indexOf('radaa'))
    expect(ids.indexOf('ancestry-jump')).toBeLessThan(ids.indexOf('kunya'))
  })

  it('badges ASSO, RELA, ROLE and NOTE as standard GEDCOM tags', () => {
    const standard = badgeTexts(section(), 'tagBadgeStandard')

    expect(standard).toContain('ASSO')
    expect(standard).toContain('RELA')
    expect(standard).toContain('ROLE')
    expect(standard).toContain('NOTE')
  })

  it('badges _ANCESTOR, _ANC_FAM, _GAP_MIN and _GAP_MAX as custom extensions', () => {
    const custom = badgeTexts(section(), 'tagBadgeCustom')

    expect(custom).toContain('_ANCESTOR')
    expect(custom).toContain('_ANC_FAM')
    expect(custom).toContain('_GAP_MIN')
    expect(custom).toContain('_GAP_MAX')
  })

  it('never badges a standard tag as an extension', () => {
    const custom = badgeTexts(section(), 'tagBadgeCustom')

    for (const standardTag of ['ASSO', 'RELA', 'ROLE', 'NOTE']) {
      expect(custom).not.toContain(standardTag)
    }
  })

  it('shows the worked عدنان → إسماعيل example in both 5.5.1 and 7.0 form', () => {
    const text = section().textContent ?? ''

    expect(text).toContain('2 RELA ancestor')
    expect(text).toContain('2 ROLE _ANCESTOR')
    expect(text).toContain('عدنان')
    expect(text).toContain('إسماعيل')
  })

  it('documents the SCHMA declarations for the 7.0 extensions', () => {
    const text = section().textContent ?? ''

    expect(text).toContain('SCHMA')
    expect(text).toContain('https://gynat.com/gedcom/ext/_ANCESTOR')
  })

  it('states the 25-character RELA limit', () => {
    expect(section().textContent ?? '').toContain('٢٥')
  })

  it('states that a jump requires a person with no recorded father', () => {
    const text = section().textContent ?? ''

    expect(text).toContain('FAMC')
  })

  it('uses only the sourced scholarly line', () => {
    expect(section().textContent ?? '').toContain(
      'الأمر عندنا الإمساك عمّا وراء عدنان إلى إسماعيل',
    )
  })

  it('carries none of the unsourced or fabricated narrations', () => {
    const pageText = container.textContent ?? ''

    expect(pageText).not.toContain('كذب النسابون')
    expect(pageText).not.toContain('فأمسكوا')
    expect(pageText).not.toContain('لا ترفعوني')
  })

  it('lists the jump extensions in the compatibility section', () => {
    const compat = container.querySelector('#compatibility')

    expect(compat?.textContent ?? '').toContain('_ANC_FAM')
  })
})

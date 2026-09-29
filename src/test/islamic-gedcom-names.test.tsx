import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import IslamicGedcomPage from '@/app/islamic-gedcom/page'

// Locks the name-related sections of the public GEDCOM reference to what the
// exporter actually writes (src/lib/gedcom/exporter.ts): kunya is an
// individual-level `1 _KUNYA <text>` line, and the famous name is a second
// standard NAME of type aka (5.5.1) / AKA (7.0).

let container: HTMLElement

beforeEach(() => {
  container = render(<IslamicGedcomPage />).container
})

function section(id: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(`#${id}`)
  if (!found) throw new Error(`missing #${id} section`)
  return found
}

function codeText(scope: HTMLElement): string {
  return Array.from(scope.querySelectorAll('[class*="codeBlock"]'))
    .map((el) => el.textContent ?? '')
    .join('\n')
}

function badgeTexts(scope: HTMLElement, className: string): string[] {
  return Array.from(scope.querySelectorAll(`[class*="${className}"]`)).map((el) =>
    (el.textContent ?? '').trim(),
  )
}

describe('/islamic-gedcom — الكنية section', () => {
  it('documents kunya as an individual-level 1 _KUNYA line', () => {
    const code = codeText(section('kunya'))
    expect(code).toContain('1 _KUNYA أبو أحمد')
    expect(code).toContain('2 TAG _KUNYA https://gynat.com/gedcom/ext/_KUNYA')
  })

  it('no longer documents the old NAME/TYPE aka/_KUNYA Y form', () => {
    const code = codeText(section('kunya'))
    expect(code).not.toContain('2 _KUNYA')
    expect(code).not.toContain('PHRASE')
    expect(code).not.toContain('TYPE')
  })

  it('keeps _KUNYA badged as a custom extension', () => {
    expect(badgeTexts(section('kunya'), 'tagBadgeCustom')).toContain('_KUNYA')
  })
})

describe('/islamic-gedcom — اسم الشهرة section', () => {
  it('renders the famous-name encoding for 5.5.1 and 7.0', () => {
    const code = codeText(section('famous-name'))
    expect(code).toContain('1 NAME عبدمناف')
    expect(code).not.toContain('SURN')
    expect(code).toContain('1 NAME أبو طالب')
    expect(code).toContain('2 TYPE aka')
    expect(code).toContain('2 TYPE AKA')
    expect(code).not.toContain('PHRASE')
  })

  it('leads with عبدالمطلب (شيبة), then هاشم (عمرو), then أبو طالب (عبدمناف)', () => {
    const code = codeText(section('famous-name'))
    const first = code.indexOf('1 NAME شيبة')
    expect(first).toBeGreaterThanOrEqual(0)
    expect(first).toBeLessThan(code.indexOf('1 NAME عمرو'))
    expect(code.indexOf('1 NAME عمرو')).toBeLessThan(code.indexOf('1 NAME عبدمناف'))
    expect(code.indexOf('1 NAME شيبة')).toBeLessThan(code.indexOf('1 NAME عبدالمطلب'))
    expect(code.indexOf('1 NAME عمرو')).toBeLessThan(code.indexOf('1 NAME هاشم'))
  })

  it('writes the real name before the famous name', () => {
    const code = codeText(section('famous-name'))
    expect(code.indexOf('1 NAME عبدمناف')).toBeLessThan(code.indexOf('1 NAME أبو طالب'))
  })

  it('badges NAME/TYPE as standard and only _NASAB as a custom extension', () => {
    const scope = section('famous-name')
    expect(badgeTexts(scope, 'tagBadgeCustom')).toEqual(['_NASAB'])
    expect(badgeTexts(scope, 'tagBadgeStandard')).toEqual(['NAME', 'TYPE'])
  })

  // The per-person «يُذكر في النسب باسم» choice: `2 _NASAB Y|N` under the aka NAME.
  it('documents the nasab choice as 2 _NASAB under the aka NAME, for 5.5.1 and 7.0', () => {
    const code = codeText(section('famous-name'))
    const v551 = '1 NAME عبدالله\n2 GIVN عبدالله\n1 NAME ابن الزبير\n2 TYPE aka\n2 _NASAB N'
    const v70 = '1 NAME عبدالله\n2 GIVN عبدالله\n1 NAME ابن الزبير\n2 TYPE AKA\n2 _NASAB N'
    expect(code).toContain(v551)
    expect(code).toContain(v70)
    expect(code).toContain('2 TAG _NASAB https://gynat.com/gedcom/ext/_NASAB')
    expect(code).not.toContain('1 _NASAB')
  })

  it('adds the nasab-choice example after the three famous-name examples', () => {
    const code = codeText(section('famous-name'))
    const lastExisting = code.lastIndexOf('1 NAME أبو طالب')
    expect(lastExisting).toBeGreaterThan(-1)
    expect(code.indexOf('1 NAME عبدالله')).toBeGreaterThan(lastExisting)
  })

  it('lists _NASAB with the custom tags in the compatibility section', () => {
    const compat = section('compatibility').textContent ?? ''
    expect(compat).toContain('_NASAB')
  })

  it('sits before the kunya section', () => {
    const ids = Array.from(container.querySelectorAll('section')).map((s) => s.id)
    expect(ids.indexOf('famous-name')).toBeGreaterThan(-1)
    expect(ids.indexOf('famous-name')).toBeLessThan(ids.indexOf('kunya'))
  })
})

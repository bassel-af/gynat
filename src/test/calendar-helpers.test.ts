import { describe, it, expect } from 'vitest'
import { getPreferredDate, getSecondaryDate } from '@/lib/calendar-helpers'

describe('getPreferredDate', () => {
  it('returns hijri when preference is hijri and both exist', () => {
    expect(getPreferredDate('1950', '1370', 'hijri')).toBe('1370')
  })

  it('returns gregorian when preference is gregorian and both exist', () => {
    expect(getPreferredDate('1950', '1370', 'gregorian')).toBe('1950')
  })

  it('falls back to gregorian when hijri is empty and preference is hijri', () => {
    expect(getPreferredDate('1950', '', 'hijri')).toBe('1950')
  })

  it('falls back to hijri when gregorian is empty and preference is gregorian', () => {
    expect(getPreferredDate('', '1370', 'gregorian')).toBe('1370')
  })

  it('returns empty when both are empty', () => {
    expect(getPreferredDate('', '', 'hijri')).toBe('')
    expect(getPreferredDate('', '', 'gregorian')).toBe('')
  })
})

describe('getSecondaryDate', () => {
  it('returns gregorian when preference is hijri and both exist', () => {
    expect(getSecondaryDate('1950', '1370', 'hijri')).toBe('1950')
  })

  it('returns hijri when preference is gregorian and both exist', () => {
    expect(getSecondaryDate('1950', '1370', 'gregorian')).toBe('1370')
  })

  it('returns empty when only hijri exists and preference is hijri', () => {
    expect(getSecondaryDate('', '1370', 'hijri')).toBe('')
  })

  it('returns empty when only gregorian exists and preference is gregorian', () => {
    expect(getSecondaryDate('1950', '', 'gregorian')).toBe('')
  })

  it('returns empty when both are empty', () => {
    expect(getSecondaryDate('', '', 'hijri')).toBe('')
    expect(getSecondaryDate('', '', 'gregorian')).toBe('')
  })
})

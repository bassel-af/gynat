import { describe, test, expect } from 'vitest'
import {
  createRadaFamilySchema,
  updateRadaFamilySchema,
} from '@/lib/tree/schemas'
import {
  detectCircularRadaRef,
  detectDuplicateChildren,
} from '@/lib/tree/rada-validators'

const UUID1 = 'a0000000-0000-4000-a000-000000000001'
const UUID2 = 'a0000000-0000-4000-a000-000000000002'
const UUID3 = 'a0000000-0000-4000-a000-000000000003'
const UUID4 = 'a0000000-0000-4000-a000-000000000004'

// ============================================================================
// createRadaFamilySchema
// ============================================================================
describe('createRadaFamilySchema', () => {
  test('accepts valid payload with fosterMotherId and children', () => {
    const result = createRadaFamilySchema.safeParse({
      fosterMotherId: UUID1,
      childrenIds: [UUID2],
    })
    expect(result.success).toBe(true)
  })

  test('accepts valid payload with fosterFatherId and children', () => {
    const result = createRadaFamilySchema.safeParse({
      fosterFatherId: UUID1,
      childrenIds: [UUID2],
    })
    expect(result.success).toBe(true)
  })

  test('accepts valid payload with both foster parents and children', () => {
    const result = createRadaFamilySchema.safeParse({
      fosterFatherId: UUID1,
      fosterMotherId: UUID2,
      childrenIds: [UUID3],
      notes: 'test notes',
    })
    expect(result.success).toBe(true)
  })

  test('accepts payload with only notes and children (no foster parents)', () => {
    const result = createRadaFamilySchema.safeParse({
      childrenIds: [UUID1],
      notes: 'documented rada relationship',
    })
    expect(result.success).toBe(true)
  })

  test('fails refinement when no fosterFatherId, no fosterMotherId, and no notes', () => {
    const result = createRadaFamilySchema.safeParse({
      childrenIds: [UUID1],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        'يجب تحديد المرضعة أو زوجها أو إضافة ملاحظة'
      )
    }
  })

  test('fails refinement when notes is empty string', () => {
    const result = createRadaFamilySchema.safeParse({
      childrenIds: [UUID1],
      notes: '   ',
    })
    expect(result.success).toBe(false)
  })

  test('fails when childrenIds is empty array (min 1)', () => {
    const result = createRadaFamilySchema.safeParse({
      fosterMotherId: UUID1,
      childrenIds: [],
    })
    expect(result.success).toBe(false)
  })

  test('fails when childrenIds has more than 50 items', () => {
    const ids = Array.from({ length: 51 }, (_, i) =>
      `a0000000-0000-4000-a000-${String(i).padStart(12, '0')}`
    )
    const result = createRadaFamilySchema.safeParse({
      fosterMotherId: UUID1,
      childrenIds: ids,
    })
    expect(result.success).toBe(false)
  })

  test('fails when notes exceed 5000 chars', () => {
    const result = createRadaFamilySchema.safeParse({
      fosterMotherId: UUID1,
      childrenIds: [UUID2],
      notes: 'a'.repeat(5001),
    })
    expect(result.success).toBe(false)
  })

  test('fails when childrenIds contains invalid UUID', () => {
    const result = createRadaFamilySchema.safeParse({
      fosterMotherId: UUID1,
      childrenIds: ['not-a-uuid'],
    })
    expect(result.success).toBe(false)
  })

  test('fails when fosterMotherId is invalid UUID', () => {
    const result = createRadaFamilySchema.safeParse({
      fosterMotherId: 'not-a-uuid',
      childrenIds: [UUID2],
    })
    expect(result.success).toBe(false)
  })

  test('accepts null fosterFatherId and fosterMotherId', () => {
    const result = createRadaFamilySchema.safeParse({
      fosterFatherId: null,
      fosterMotherId: UUID1,
      childrenIds: [UUID2],
    })
    expect(result.success).toBe(true)
  })
})

// ============================================================================
// updateRadaFamilySchema
// ============================================================================
describe('updateRadaFamilySchema', () => {
  test('accepts empty object', () => {
    const result = updateRadaFamilySchema.safeParse({})
    expect(result.success).toBe(true)
  })

  test('accepts nullable fosterFatherId', () => {
    const result = updateRadaFamilySchema.safeParse({
      fosterFatherId: null,
    })
    expect(result.success).toBe(true)
  })

  test('accepts nullable fosterMotherId', () => {
    const result = updateRadaFamilySchema.safeParse({
      fosterMotherId: null,
    })
    expect(result.success).toBe(true)
  })

  test('accepts notes update', () => {
    const result = updateRadaFamilySchema.safeParse({
      notes: 'updated notes',
    })
    expect(result.success).toBe(true)
  })

  test('fails when notes exceed 5000 chars', () => {
    const result = updateRadaFamilySchema.safeParse({
      notes: 'a'.repeat(5001),
    })
    expect(result.success).toBe(false)
  })

  test('accepts valid UUID for fosterMotherId', () => {
    const result = updateRadaFamilySchema.safeParse({
      fosterMotherId: UUID1,
    })
    expect(result.success).toBe(true)
  })

  test('rejects invalid UUID for fosterFatherId', () => {
    const result = updateRadaFamilySchema.safeParse({
      fosterFatherId: 'not-a-uuid',
    })
    expect(result.success).toBe(false)
  })
})

// ============================================================================
// Business logic validators (pure functions, no DB)
// ============================================================================
describe('detectCircularRadaRef', () => {
  test('detects fosterFatherId in childrenIds', () => {
    const result = detectCircularRadaRef(UUID1, null, [UUID1, UUID2])
    expect(result).toBe(true)
  })

  test('detects fosterMotherId in childrenIds', () => {
    const result = detectCircularRadaRef(null, UUID2, [UUID1, UUID2])
    expect(result).toBe(true)
  })

  test('returns false when no overlap', () => {
    const result = detectCircularRadaRef(UUID1, UUID2, [UUID3, UUID4])
    expect(result).toBe(false)
  })

  test('returns false when foster parents are null', () => {
    const result = detectCircularRadaRef(null, null, [UUID1])
    expect(result).toBe(false)
  })

  test('returns false when foster parents are undefined', () => {
    const result = detectCircularRadaRef(undefined, undefined, [UUID1])
    expect(result).toBe(false)
  })
})

describe('detectDuplicateChildren', () => {
  test('detects duplicate child IDs', () => {
    expect(detectDuplicateChildren([UUID1, UUID2, UUID1])).toBe(true)
  })

  test('returns false for unique IDs', () => {
    expect(detectDuplicateChildren([UUID1, UUID2, UUID3])).toBe(false)
  })

  test('returns false for single item', () => {
    expect(detectDuplicateChildren([UUID1])).toBe(false)
  })
})

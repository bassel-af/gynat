import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { GedcomData, Individual, Family, FamilyEvent, AncestryJump } from '@/lib/gedcom/types'
import type { PrismaLike } from '@/lib/tree/seed-helpers'
import { seedTreeFromGedcomData } from '@/lib/tree/seed-helpers'
import {
  generateWorkspaceKey,
  wrapKey,
  decryptFieldNullable,
} from '@/lib/crypto/workspace-encryption'
import { getMasterKey } from '@/lib/crypto/master-key'

const TEST_PLAINTEXT_KEY = generateWorkspaceKey()
const TEST_WRAPPED_KEY = wrapKey(TEST_PLAINTEXT_KEY, getMasterKey())

function dec(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (Buffer.isBuffer(value)) return decryptFieldNullable(value, TEST_PLAINTEXT_KEY)
  if (value instanceof Uint8Array) {
    return decryptFieldNullable(Buffer.from(value), TEST_PLAINTEXT_KEY)
  }
  throw new Error(`dec(): unexpected value type: ${typeof value}`)
}

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

function makeJump(overrides: Partial<AncestryJump> & { id: string }): AncestryJump {
  return {
    type: '_ANC_JUMP',
    descendant: '',
    ancestorFamily: '',
    generationsMin: null,
    generationsMax: null,
    notes: '',
    ...overrides,
  }
}

/** عدنان (descendant) ⇢ family of إسماعيل (ancestor). */
function makeJumpData(jump: Partial<AncestryJump> = {}): GedcomData {
  return {
    individuals: {
      '@I1@': makeIndividual({ id: '@I1@', givenName: 'عدنان', sex: 'M' }),
      '@I2@': makeIndividual({
        id: '@I2@',
        givenName: 'إسماعيل',
        sex: 'M',
        familiesAsSpouse: ['@F1@'],
        ancestryJumpAsDescendant: undefined,
      }),
    },
    families: {
      '@F1@': makeFamily({ id: '@F1@', husband: '@I2@' }),
    },
    ancestryJumps: {
      '@J1@': makeJump({
        id: '@J1@',
        descendant: '@I1@',
        ancestorFamily: '@F1@',
        generationsMin: 4,
        generationsMax: 40,
        notes: 'قيل سبعة، وقيل ثلاثون، وقيل أربعون.',
        ...jump,
      }),
    },
  }
}

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockFamilyTreeFindFirst = vi.fn()
const mockFamilyTreeCreate = vi.fn()
const mockIndividualCreateMany = vi.fn()
const mockIndividualCount = vi.fn()
const mockFamilyCreateMany = vi.fn()
const mockFamilyChildCreateMany = vi.fn()
const mockRadaFamilyCreateMany = vi.fn()
const mockRadaFamilyChildCreateMany = vi.fn()
const mockAncestryJumpCreateMany = vi.fn()
const mockTransaction = vi.fn()
const mockWorkspaceFindUnique = vi.fn()
const mockWorkspaceUpdate = vi.fn()

function createMockPrisma(): PrismaLike {
  return { $transaction: mockTransaction }
}

describe('seedTreeFromGedcomData — ancestry jumps', () => {
  const workspaceId = 'workspace-uuid-jump-1'
  const treeId = 'tree-uuid-jump-1'
  let mockPrisma: PrismaLike

  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma = createMockPrisma()

    mockWorkspaceFindUnique.mockResolvedValue({ encryptedKey: TEST_WRAPPED_KEY })
    mockWorkspaceUpdate.mockResolvedValue({})
    mockFamilyTreeFindFirst.mockResolvedValue(null)
    mockFamilyTreeCreate.mockResolvedValue({
      id: treeId,
      workspaceId,
      individuals: [],
      families: [],
    })
    mockIndividualCount.mockResolvedValue(0)
    mockIndividualCreateMany.mockResolvedValue({ count: 2 })
    mockFamilyCreateMany.mockResolvedValue({ count: 1 })
    mockAncestryJumpCreateMany.mockResolvedValue({ count: 1 })

    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        familyTree: {
          findFirst: mockFamilyTreeFindFirst,
          findUnique: mockFamilyTreeFindFirst,
          create: mockFamilyTreeCreate,
        },
        individual: { createMany: mockIndividualCreateMany, count: mockIndividualCount },
        family: { createMany: mockFamilyCreateMany },
        familyChild: { createMany: mockFamilyChildCreateMany },
        radaFamily: { createMany: mockRadaFamilyCreateMany },
        radaFamilyChild: { createMany: mockRadaFamilyChildCreateMany },
        ancestryJump: { createMany: mockAncestryJumpCreateMany },
        workspace: { findUnique: mockWorkspaceFindUnique, update: mockWorkspaceUpdate },
      }),
    )
  })

  test('persists the jump with database ids remapped from the GEDCOM ids', async () => {
    const result = await seedTreeFromGedcomData(workspaceId, makeJumpData(), mockPrisma)

    expect(mockAncestryJumpCreateMany).toHaveBeenCalledTimes(1)
    const rows = mockAncestryJumpCreateMany.mock.calls[0][0].data
    expect(rows).toHaveLength(1)
    expect(rows[0].treeId).toBe(treeId)
    expect(rows[0].gedcomId).toBe('@J1@')
    expect(rows[0].descendantId).toBe(result.gedcomToDbId['@I1@'])
    expect(rows[0].descendantId).not.toBe('@I1@')
    expect(rows[0].ancestorFamilyId).toBeTruthy()
    expect(rows[0].ancestorFamilyId).not.toBe('@F1@')
  })

  test('persists the generation bounds', async () => {
    await seedTreeFromGedcomData(workspaceId, makeJumpData(), mockPrisma)

    const row = mockAncestryJumpCreateMany.mock.calls[0][0].data[0]
    expect(row.generationsMin).toBe(4)
    expect(row.generationsMax).toBe(40)
  })

  test('encrypts the notes with the workspace key', async () => {
    await seedTreeFromGedcomData(workspaceId, makeJumpData(), mockPrisma)

    const row = mockAncestryJumpCreateMany.mock.calls[0][0].data[0]
    expect(row.notes).not.toBe('قيل سبعة، وقيل ثلاثون، وقيل أربعون.')
    expect(dec(row.notes)).toBe('قيل سبعة، وقيل ثلاثون، وقيل أربعون.')
  })

  test('stores null notes when the jump has none', async () => {
    await seedTreeFromGedcomData(workspaceId, makeJumpData({ notes: '' }), mockPrisma)

    expect(mockAncestryJumpCreateMany.mock.calls[0][0].data[0].notes).toBeNull()
  })

  test('returns ancestryJumpCount', async () => {
    const result = await seedTreeFromGedcomData(workspaceId, makeJumpData(), mockPrisma)

    expect(result.ancestryJumpCount).toBe(1)
  })

  test('drops a jump whose ancestor family did not survive the id remap', async () => {
    const data = makeJumpData()
    data.ancestryJumps!['@J1@'].ancestorFamily = '@GHOST@'

    const result = await seedTreeFromGedcomData(workspaceId, data, mockPrisma)

    expect(mockAncestryJumpCreateMany.mock.calls[0][0].data).toHaveLength(0)
    expect(result.ancestryJumpCount).toBe(0)
  })

  test('writes nothing and reports zero when there are no jumps', async () => {
    const data = makeJumpData()
    delete data.ancestryJumps

    const result = await seedTreeFromGedcomData(workspaceId, data, mockPrisma)

    expect(mockAncestryJumpCreateMany).not.toHaveBeenCalled()
    expect(result.ancestryJumpCount).toBe(0)
  })

  test('reports zero jumps when seeding is skipped for a non-empty tree', async () => {
    mockIndividualCount.mockResolvedValue(7)

    const result = await seedTreeFromGedcomData(workspaceId, makeJumpData(), mockPrisma)

    expect(result.skipped).toBe(true)
    expect(result.ancestryJumpCount).toBe(0)
    expect(mockAncestryJumpCreateMany).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// The per-workspace «قفزة نسب» toggle gates ONLY the create route. Import is a
// data-carrying path: a GEDCOM that already holds jumps must round-trip them
// even when the workspace has the button turned off.
// ---------------------------------------------------------------------------

describe('seedTreeFromGedcomData — ancestry jumps with enableAncestryJumps OFF', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWorkspaceFindUnique.mockResolvedValue({
      encryptedKey: TEST_WRAPPED_KEY,
      enableAncestryJumps: false,
    })
    mockWorkspaceUpdate.mockResolvedValue({})
    mockFamilyTreeFindFirst.mockResolvedValue(null)
    mockFamilyTreeCreate.mockResolvedValue({ id: 'tree-off', workspaceId: 'ws-off', individuals: [], families: [] })
    mockIndividualCount.mockResolvedValue(0)
    mockAncestryJumpCreateMany.mockResolvedValue({ count: 1 })
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        familyTree: { findFirst: mockFamilyTreeFindFirst, findUnique: mockFamilyTreeFindFirst, create: mockFamilyTreeCreate },
        individual: { createMany: mockIndividualCreateMany, count: mockIndividualCount },
        family: { createMany: mockFamilyCreateMany },
        familyChild: { createMany: mockFamilyChildCreateMany },
        radaFamily: { createMany: mockRadaFamilyCreateMany },
        radaFamilyChild: { createMany: mockRadaFamilyChildCreateMany },
        ancestryJump: { createMany: mockAncestryJumpCreateMany },
        workspace: { findUnique: mockWorkspaceFindUnique, update: mockWorkspaceUpdate },
      }),
    )
  })

  test('still persists the imported jump', async () => {
    const result = await seedTreeFromGedcomData('ws-off', makeJumpData(), createMockPrisma())
    expect(mockAncestryJumpCreateMany.mock.calls[0][0].data).toHaveLength(1)
    expect(result.ancestryJumpCount).toBe(1)
  })
})

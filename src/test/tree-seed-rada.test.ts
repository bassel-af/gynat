import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { GedcomData, Individual, Family, FamilyEvent, RadaFamily } from '@/lib/gedcom/types'
import type { PrismaLike } from '@/lib/tree/seed-helpers'
import { seedTreeFromGedcomData } from '@/lib/tree/seed-helpers'
import { generateWorkspaceKey, wrapKey, decryptFieldNullable } from '@/lib/crypto/workspace-encryption'
import { getMasterKey } from '@/lib/crypto/master-key'

// Phase 10b: keep both plaintext and wrapped keys so we can decrypt
// captured ciphertext in assertions.
const TEST_PLAINTEXT_KEY = generateWorkspaceKey()
const TEST_WRAPPED_KEY = wrapKey(TEST_PLAINTEXT_KEY, getMasterKey())

function dec(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (Buffer.isBuffer(value)) return decryptFieldNullable(value, TEST_PLAINTEXT_KEY)
  if (value instanceof Uint8Array) return decryptFieldNullable(Buffer.from(value), TEST_PLAINTEXT_KEY)
  throw new Error(`dec(): unexpected value type: ${typeof value}`)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const emptyEvent: FamilyEvent = { date: '', hijriDate: '', place: '', description: '', notes: '' }

function makeTestIndividual(overrides: Partial<Individual> & { id: string }): Individual {
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
    notes: '',
    isDeceased: false,
    isPrivate: false,
    familiesAsSpouse: [],
    familyAsChild: null,
    ...overrides,
  }
}

function makeTestFamily(overrides: Partial<Family> & { id: string }): Family {
  return {
    type: 'FAM',
    husband: null,
    wife: null,
    children: [],
    marriageContract: emptyEvent,
    marriage: emptyEvent,
    divorce: emptyEvent,
    isDivorced: false,
    ...overrides,
  }
}

function makeTestRadaFamily(overrides: Partial<RadaFamily> & { id: string }): RadaFamily {
  return {
    type: '_RADA_FAM',
    fosterFather: null,
    fosterMother: null,
    children: [],
    notes: '',
    ...overrides,
  }
}

function makeGedcomData(overrides?: Partial<GedcomData>): GedcomData {
  return {
    individuals: {},
    families: {},
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Mock Prisma functions
// ---------------------------------------------------------------------------

const mockFamilyTreeFindUnique = vi.fn()
const mockFamilyTreeCreate = vi.fn()
const mockIndividualCreateMany = vi.fn()
const mockFamilyCreateMany = vi.fn()
const mockFamilyChildCreateMany = vi.fn()
const mockIndividualCount = vi.fn()
const mockRadaFamilyCreateMany = vi.fn()
const mockRadaFamilyChildCreateMany = vi.fn()
const mockTransaction = vi.fn()
const mockWorkspaceFindUnique = vi.fn()
const mockWorkspaceUpdate = vi.fn()

function createMockPrisma(): PrismaLike {
  return {
    $transaction: mockTransaction,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('seedTreeFromGedcomData — rada\'a seeding', () => {
  const workspaceId = 'workspace-uuid-rada-1'
  const treeId = 'tree-uuid-rada-1'
  let mockPrisma: PrismaLike

  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma = createMockPrisma()

    // Phase 10b: default workspace mock returns a valid wrapped key.
    mockWorkspaceFindUnique.mockResolvedValue({ encryptedKey: TEST_WRAPPED_KEY })
    mockWorkspaceUpdate.mockResolvedValue({})

    // Default: $transaction executes the callback immediately
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        familyTree: {
          findUnique: mockFamilyTreeFindUnique,
          findFirst: mockFamilyTreeFindUnique,
          create: mockFamilyTreeCreate,
        },
        individual: {
          createMany: mockIndividualCreateMany,
          count: mockIndividualCount,
        },
        family: {
          createMany: mockFamilyCreateMany,
        },
        familyChild: {
          createMany: mockFamilyChildCreateMany,
        },
        radaFamily: {
          createMany: mockRadaFamilyCreateMany,
        },
        radaFamilyChild: {
          createMany: mockRadaFamilyChildCreateMany,
        },
        workspace: {
          findUnique: mockWorkspaceFindUnique,
          update: mockWorkspaceUpdate,
        },
      })
    })
  })

  test('creates RadaFamily and RadaFamilyChild records from gedcomData.radaFamilies', async () => {
    const gedcomData = makeGedcomData({
      individuals: {
        '@I1@': makeTestIndividual({ id: '@I1@', name: 'Father', givenName: 'Father', sex: 'M' }),
        '@I2@': makeTestIndividual({ id: '@I2@', name: 'Mother', givenName: 'Mother', sex: 'F' }),
        '@I3@': makeTestIndividual({ id: '@I3@', name: 'Child', givenName: 'Child', sex: 'M' }),
      },
      radaFamilies: {
        '@RF1@': makeTestRadaFamily({
          id: '@RF1@',
          fosterFather: '@I1@',
          fosterMother: '@I2@',
          children: ['@I3@'],
          notes: 'Rada note',
        }),
      },
    })

    mockFamilyTreeFindUnique.mockResolvedValue(null)
    mockFamilyTreeCreate.mockResolvedValue({ id: treeId, workspaceId, individuals: [], families: [] })
    mockIndividualCount.mockResolvedValue(0)
    mockIndividualCreateMany.mockResolvedValue({ count: 3 })
    mockRadaFamilyCreateMany.mockResolvedValue({ count: 1 })
    mockRadaFamilyChildCreateMany.mockResolvedValue({ count: 1 })

    const result = await seedTreeFromGedcomData(workspaceId, gedcomData, mockPrisma)

    // Should create rada families
    expect(mockRadaFamilyCreateMany).toHaveBeenCalledTimes(1)
    const radaFamilyData = mockRadaFamilyCreateMany.mock.calls[0][0].data
    expect(radaFamilyData).toHaveLength(1)
    expect(radaFamilyData[0].treeId).toBe(treeId)
    expect(radaFamilyData[0].gedcomId).toBe('@RF1@')
    expect(dec(radaFamilyData[0].notes)).toBe('Rada note')

    // Foster parent IDs should be mapped through gedcomToDbId
    expect(radaFamilyData[0].fosterFatherId).toBe(result.gedcomToDbId['@I1@'])
    expect(radaFamilyData[0].fosterMotherId).toBe(result.gedcomToDbId['@I2@'])

    // Should create rada family children
    expect(mockRadaFamilyChildCreateMany).toHaveBeenCalledTimes(1)
    const radaChildData = mockRadaFamilyChildCreateMany.mock.calls[0][0].data
    expect(radaChildData).toHaveLength(1)
    expect(radaChildData[0].individualId).toBe(result.gedcomToDbId['@I3@'])
  })

  test('does not create rada records when radaFamilies is undefined', async () => {
    const gedcomData = makeGedcomData({
      individuals: {
        '@I1@': makeTestIndividual({ id: '@I1@', name: 'Ahmad', givenName: 'Ahmad', sex: 'M' }),
      },
    })

    mockFamilyTreeFindUnique.mockResolvedValue(null)
    mockFamilyTreeCreate.mockResolvedValue({ id: treeId, workspaceId, individuals: [], families: [] })
    mockIndividualCount.mockResolvedValue(0)
    mockIndividualCreateMany.mockResolvedValue({ count: 1 })

    await seedTreeFromGedcomData(workspaceId, gedcomData, mockPrisma)

    expect(mockRadaFamilyCreateMany).not.toHaveBeenCalled()
    expect(mockRadaFamilyChildCreateMany).not.toHaveBeenCalled()
  })

  test('does not create rada records when radaFamilies is empty', async () => {
    const gedcomData = makeGedcomData({
      individuals: {
        '@I1@': makeTestIndividual({ id: '@I1@', name: 'Ahmad', givenName: 'Ahmad', sex: 'M' }),
      },
      radaFamilies: {},
    })

    mockFamilyTreeFindUnique.mockResolvedValue(null)
    mockFamilyTreeCreate.mockResolvedValue({ id: treeId, workspaceId, individuals: [], families: [] })
    mockIndividualCount.mockResolvedValue(0)
    mockIndividualCreateMany.mockResolvedValue({ count: 1 })

    await seedTreeFromGedcomData(workspaceId, gedcomData, mockPrisma)

    expect(mockRadaFamilyCreateMany).not.toHaveBeenCalled()
    expect(mockRadaFamilyChildCreateMany).not.toHaveBeenCalled()
  })

  test('returns radaFamilyCount in result', async () => {
    const gedcomData = makeGedcomData({
      individuals: {
        '@I1@': makeTestIndividual({ id: '@I1@', name: 'Father', givenName: 'Father', sex: 'M' }),
        '@I2@': makeTestIndividual({ id: '@I2@', name: 'Mother', givenName: 'Mother', sex: 'F' }),
        '@I3@': makeTestIndividual({ id: '@I3@', name: 'Child', givenName: 'Child', sex: 'M' }),
      },
      radaFamilies: {
        '@RF1@': makeTestRadaFamily({
          id: '@RF1@',
          fosterFather: '@I1@',
          fosterMother: '@I2@',
          children: ['@I3@'],
        }),
        '@RF2@': makeTestRadaFamily({
          id: '@RF2@',
          fosterMother: '@I2@',
          children: ['@I3@'],
        }),
      },
    })

    mockFamilyTreeFindUnique.mockResolvedValue(null)
    mockFamilyTreeCreate.mockResolvedValue({ id: treeId, workspaceId, individuals: [], families: [] })
    mockIndividualCount.mockResolvedValue(0)
    mockIndividualCreateMany.mockResolvedValue({ count: 3 })
    mockRadaFamilyCreateMany.mockResolvedValue({ count: 2 })
    mockRadaFamilyChildCreateMany.mockResolvedValue({ count: 2 })

    const result = await seedTreeFromGedcomData(workspaceId, gedcomData, mockPrisma)

    // SeedTreeResult should include radaFamilyCount
    expect((result as { radaFamilyCount?: number }).radaFamilyCount).toBe(2)
  })

  test('maps rada family GEDCOM IDs to DB UUIDs correctly', async () => {
    const gedcomData = makeGedcomData({
      individuals: {
        '@I1@': makeTestIndividual({ id: '@I1@', name: 'Father', givenName: 'Father', sex: 'M' }),
        '@I3@': makeTestIndividual({ id: '@I3@', name: 'Child', givenName: 'Child', sex: 'M' }),
      },
      radaFamilies: {
        '@RF1@': makeTestRadaFamily({
          id: '@RF1@',
          fosterFather: '@I1@',
          children: ['@I3@'],
        }),
      },
    })

    mockFamilyTreeFindUnique.mockResolvedValue(null)
    mockFamilyTreeCreate.mockResolvedValue({ id: treeId, workspaceId, individuals: [], families: [] })
    mockIndividualCount.mockResolvedValue(0)
    mockIndividualCreateMany.mockResolvedValue({ count: 2 })
    mockRadaFamilyCreateMany.mockResolvedValue({ count: 1 })
    mockRadaFamilyChildCreateMany.mockResolvedValue({ count: 1 })

    await seedTreeFromGedcomData(workspaceId, gedcomData, mockPrisma)

    // Rada family should have a UUID, not the GEDCOM ID
    const radaFamilyData = mockRadaFamilyCreateMany.mock.calls[0][0].data
    expect(radaFamilyData[0].id).toBeDefined()
    expect(radaFamilyData[0].id).not.toBe('@RF1@')
    // Should be a UUID-like string
    expect(radaFamilyData[0].id).toMatch(/^[0-9a-f-]{36}$/)

    // RadaFamilyChild should reference the correct rada family UUID
    const radaChildData = mockRadaFamilyChildCreateMany.mock.calls[0][0].data
    expect(radaChildData[0].radaFamilyId).toBe(radaFamilyData[0].id)
  })

  test('maps foster parent references through gedcomToDbId', async () => {
    const gedcomData = makeGedcomData({
      individuals: {
        '@I1@': makeTestIndividual({ id: '@I1@', name: 'Foster Father', givenName: 'Foster Father', sex: 'M' }),
        '@I2@': makeTestIndividual({ id: '@I2@', name: 'Foster Mother', givenName: 'Foster Mother', sex: 'F' }),
        '@I3@': makeTestIndividual({ id: '@I3@', name: 'Child', givenName: 'Child', sex: 'M' }),
      },
      radaFamilies: {
        '@RF1@': makeTestRadaFamily({
          id: '@RF1@',
          fosterFather: '@I1@',
          fosterMother: '@I2@',
          children: ['@I3@'],
        }),
      },
    })

    mockFamilyTreeFindUnique.mockResolvedValue(null)
    mockFamilyTreeCreate.mockResolvedValue({ id: treeId, workspaceId, individuals: [], families: [] })
    mockIndividualCount.mockResolvedValue(0)
    mockIndividualCreateMany.mockResolvedValue({ count: 3 })
    mockRadaFamilyCreateMany.mockResolvedValue({ count: 1 })
    mockRadaFamilyChildCreateMany.mockResolvedValue({ count: 1 })

    const result = await seedTreeFromGedcomData(workspaceId, gedcomData, mockPrisma)

    const radaFamilyData = mockRadaFamilyCreateMany.mock.calls[0][0].data[0]

    // Foster parent IDs should be the DB UUIDs, not GEDCOM IDs
    expect(radaFamilyData.fosterFatherId).not.toBe('@I1@')
    expect(radaFamilyData.fosterMotherId).not.toBe('@I2@')
    expect(radaFamilyData.fosterFatherId).toBe(result.gedcomToDbId['@I1@'])
    expect(radaFamilyData.fosterMotherId).toBe(result.gedcomToDbId['@I2@'])
  })

  test('handles rada family with no foster parents (children only)', async () => {
    const gedcomData = makeGedcomData({
      individuals: {
        '@I3@': makeTestIndividual({ id: '@I3@', name: 'Child', givenName: 'Child', sex: 'M' }),
      },
      radaFamilies: {
        '@RF1@': makeTestRadaFamily({
          id: '@RF1@',
          fosterFather: null,
          fosterMother: null,
          children: ['@I3@'],
        }),
      },
    })

    mockFamilyTreeFindUnique.mockResolvedValue(null)
    mockFamilyTreeCreate.mockResolvedValue({ id: treeId, workspaceId, individuals: [], families: [] })
    mockIndividualCount.mockResolvedValue(0)
    mockIndividualCreateMany.mockResolvedValue({ count: 1 })
    mockRadaFamilyCreateMany.mockResolvedValue({ count: 1 })
    mockRadaFamilyChildCreateMany.mockResolvedValue({ count: 1 })

    await seedTreeFromGedcomData(workspaceId, gedcomData, mockPrisma)

    const radaFamilyData = mockRadaFamilyCreateMany.mock.calls[0][0].data[0]
    expect(radaFamilyData.fosterFatherId).toBeNull()
    expect(radaFamilyData.fosterMotherId).toBeNull()
  })

  test('creates multiple rada family children for a single rada family', async () => {
    const gedcomData = makeGedcomData({
      individuals: {
        '@I1@': makeTestIndividual({ id: '@I1@', name: 'Mother', givenName: 'Mother', sex: 'F' }),
        '@I3@': makeTestIndividual({ id: '@I3@', name: 'Child1', givenName: 'Child1', sex: 'M' }),
        '@I4@': makeTestIndividual({ id: '@I4@', name: 'Child2', givenName: 'Child2', sex: 'F' }),
        '@I5@': makeTestIndividual({ id: '@I5@', name: 'Child3', givenName: 'Child3', sex: 'M' }),
      },
      radaFamilies: {
        '@RF1@': makeTestRadaFamily({
          id: '@RF1@',
          fosterMother: '@I1@',
          children: ['@I3@', '@I4@', '@I5@'],
        }),
      },
    })

    mockFamilyTreeFindUnique.mockResolvedValue(null)
    mockFamilyTreeCreate.mockResolvedValue({ id: treeId, workspaceId, individuals: [], families: [] })
    mockIndividualCount.mockResolvedValue(0)
    mockIndividualCreateMany.mockResolvedValue({ count: 4 })
    mockRadaFamilyCreateMany.mockResolvedValue({ count: 1 })
    mockRadaFamilyChildCreateMany.mockResolvedValue({ count: 3 })

    const result = await seedTreeFromGedcomData(workspaceId, gedcomData, mockPrisma)

    const radaChildData = mockRadaFamilyChildCreateMany.mock.calls[0][0].data
    expect(radaChildData).toHaveLength(3)
    expect(radaChildData.map((c: { individualId: string }) => c.individualId).sort()).toEqual(
      ['@I3@', '@I4@', '@I5@'].map((id) => result.gedcomToDbId[id]).sort(),
    )
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockFamilyTreeFindUnique = vi.fn()
const mockFamilyTreeCreate = vi.fn()
const mockIndividualFindFirst = vi.fn()
const mockFamilyFindFirst = vi.fn()
const mockRadaFamilyFindFirst = vi.fn()

vi.mock('@/lib/db', () => ({
  prisma: {
    familyTree: {
      findUnique: (...args: unknown[]) => mockFamilyTreeFindUnique(...args),
      create: (...args: unknown[]) => mockFamilyTreeCreate(...args),
    },
    individual: {
      findFirst: (...args: unknown[]) => mockIndividualFindFirst(...args),
    },
    family: {
      findFirst: (...args: unknown[]) => mockFamilyFindFirst(...args),
    },
    radaFamily: {
      findFirst: (...args: unknown[]) => mockRadaFamilyFindFirst(...args),
    },
  },
}))

import {
  getTreeByWorkspaceId,
  getOrCreateTree,
  getTreeIndividual,
  getTreeFamily,
} from '@/lib/tree/queries'

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const WORKSPACE_ID = 'ws-001'
const TREE_ID = 'tree-001'

const PLACE_SELECT = {
  select: {
    id: true,
    nameAr: true,
    parent: {
      select: {
        nameAr: true,
        parent: {
          select: { nameAr: true },
        },
      },
    },
  },
}

const TREE_INCLUDES = {
  individuals: {
    include: {
      birthPlaceRef: PLACE_SELECT,
      deathPlaceRef: PLACE_SELECT,
    },
  },
  families: {
    include: {
      children: true,
      marriageContractPlaceRef: PLACE_SELECT,
      marriagePlaceRef: PLACE_SELECT,
      divorcePlaceRef: PLACE_SELECT,
    },
  },
  radaFamilies: {
    include: {
      children: true,
    },
  },
}

const fakeDbTree = {
  id: TREE_ID,
  workspaceId: WORKSPACE_ID,
  individuals: [],
  families: [],
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getTreeByWorkspaceId', () => {
  it('returns the tree when it exists', async () => {
    mockFamilyTreeFindUnique.mockResolvedValue(fakeDbTree)

    const result = await getTreeByWorkspaceId(WORKSPACE_ID)

    expect(result).toEqual(fakeDbTree)
    expect(mockFamilyTreeFindUnique).toHaveBeenCalledWith({
      where: { workspaceId: WORKSPACE_ID },
      include: TREE_INCLUDES,
    })
  })

  it('returns null when no tree exists', async () => {
    mockFamilyTreeFindUnique.mockResolvedValue(null)

    const result = await getTreeByWorkspaceId(WORKSPACE_ID)

    expect(result).toBeNull()
  })
})

describe('getOrCreateTree', () => {
  it('returns existing tree without creating', async () => {
    mockFamilyTreeFindUnique.mockResolvedValue(fakeDbTree)

    const result = await getOrCreateTree(WORKSPACE_ID)

    expect(result).toEqual(fakeDbTree)
    expect(mockFamilyTreeCreate).not.toHaveBeenCalled()
  })

  it('creates a new tree when none exists', async () => {
    mockFamilyTreeFindUnique.mockResolvedValueOnce(null)
    mockFamilyTreeCreate.mockResolvedValue(fakeDbTree)

    const result = await getOrCreateTree(WORKSPACE_ID)

    expect(result).toEqual(fakeDbTree)
    expect(mockFamilyTreeCreate).toHaveBeenCalledWith({
      data: { workspaceId: WORKSPACE_ID },
      include: TREE_INCLUDES,
    })
  })
})

describe('getTreeIndividual', () => {
  it('returns the individual when it belongs to the tree', async () => {
    const fakeIndividual = { id: 'ind-1', treeId: TREE_ID, givenName: 'Ahmad' }
    mockIndividualFindFirst.mockResolvedValue(fakeIndividual)

    const result = await getTreeIndividual(TREE_ID, 'ind-1')

    expect(result).toEqual(fakeIndividual)
    expect(mockIndividualFindFirst).toHaveBeenCalledWith({
      where: { id: 'ind-1', treeId: TREE_ID },
    })
  })

  it('returns null when individual does not belong to the tree', async () => {
    mockIndividualFindFirst.mockResolvedValue(null)

    const result = await getTreeIndividual(TREE_ID, 'ind-nonexistent')

    expect(result).toBeNull()
  })
})

describe('getTreeFamily', () => {
  it('returns the family when it belongs to the tree', async () => {
    const fakeFamily = { id: 'fam-1', treeId: TREE_ID, husbandId: 'h-1', wifeId: 'w-1', children: [] }
    mockFamilyFindFirst.mockResolvedValue(fakeFamily)

    const result = await getTreeFamily(TREE_ID, 'fam-1')

    expect(result).toEqual(fakeFamily)
    expect(mockFamilyFindFirst).toHaveBeenCalledWith({
      where: { id: 'fam-1', treeId: TREE_ID },
      include: { children: true },
    })
  })

  it('returns null when family does not belong to the tree', async () => {
    mockFamilyFindFirst.mockResolvedValue(null)

    const result = await getTreeFamily(TREE_ID, 'fam-nonexistent')

    expect(result).toBeNull()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockFamilyTreeFindUnique = vi.fn()
const mockFamilyTreeCreate = vi.fn()
const mockFamilyTreeUpdate = vi.fn()
const mockIndividualFindFirst = vi.fn()
const mockFamilyFindFirst = vi.fn()
const mockRadaFamilyFindFirst = vi.fn()
const mockWorkspaceFindUnique = vi.fn()
const mockWorkspaceUpdate = vi.fn()

vi.mock('@/lib/db', () => ({
  prisma: {
    familyTree: {
      findUnique: (...args: unknown[]) => mockFamilyTreeFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFamilyTreeFindUnique(...args),
      create: (...args: unknown[]) => mockFamilyTreeCreate(...args),
      update: (...args: unknown[]) => mockFamilyTreeUpdate(...args),
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
    workspace: {
      findUnique: (...args: unknown[]) => mockWorkspaceFindUnique(...args),
      update: (...args: unknown[]) => mockWorkspaceUpdate(...args),
    },
  },
}))

import { NextResponse } from 'next/server'
import {
  getTreeByWorkspaceId,
  getOrCreateTree,
  getOrCreateTargetTree,
  resolveTargetTreeOr404,
  getTreeIndividual,
  getTreeFamily,
  getTreeWithKey,
  getTreeIndividualDecrypted,
  getTreeFamilyDecrypted,
  getTreeRadaFamilyDecrypted,
} from '@/lib/tree/queries'
import {
  generateWorkspaceKey,
  wrapKey,
  encryptFieldNullable,
} from '@/lib/crypto/workspace-encryption'
import { getMasterKey } from '@/lib/crypto/master-key'

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
      where: { workspaceId: WORKSPACE_ID, kind: 'main' },
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
      data: { workspaceId: WORKSPACE_ID, kind: 'main' },
      include: TREE_INCLUDES,
    })
  })
})

describe('getOrCreateTargetTree', () => {
  it('returns the main tree (via getOrCreateTree) when treeId is absent', async () => {
    mockFamilyTreeFindUnique.mockResolvedValue(fakeDbTree)

    const result = await getOrCreateTargetTree(WORKSPACE_ID)

    expect(result).toEqual(fakeDbTree)
    // Resolves the workspace MAIN tree — same scoping as getOrCreateTree
    expect(mockFamilyTreeFindUnique).toHaveBeenCalledWith({
      where: { workspaceId: WORKSPACE_ID, kind: 'main' },
      include: TREE_INCLUDES,
    })
    expect(mockFamilyTreeCreate).not.toHaveBeenCalled()
  })

  it('returns the extra tree when treeId matches a tree in the workspace', async () => {
    const extraTree = { ...fakeDbTree, id: 'extra-001', kind: 'extra' }
    mockFamilyTreeFindUnique.mockResolvedValue(extraTree)

    const result = await getOrCreateTargetTree(WORKSPACE_ID, 'extra-001')

    expect(result).toEqual(extraTree)
    // MUST scope by workspaceId + kind (never findUnique by bare id) so a
    // foreign-workspace id cannot resolve.
    expect(mockFamilyTreeFindUnique).toHaveBeenCalledWith({
      where: {
        id: 'extra-001',
        workspaceId: WORKSPACE_ID,
        kind: { in: ['main', 'extra'] },
      },
      include: TREE_INCLUDES,
    })
    expect(mockFamilyTreeCreate).not.toHaveBeenCalled()
  })

  it('returns null when treeId belongs to a different workspace (fail-closed)', async () => {
    // Scoped findFirst returns null because the id is not in WORKSPACE_ID
    mockFamilyTreeFindUnique.mockResolvedValue(null)

    const result = await getOrCreateTargetTree(WORKSPACE_ID, 'foreign-tree-id')

    expect(result).toBeNull()
    // Never lazily creates a tree for an explicit (missing) treeId
    expect(mockFamilyTreeCreate).not.toHaveBeenCalled()
  })
})

describe('resolveTargetTreeOr404', () => {
  it('returns the resolved tree (not a NextResponse) for a same-workspace treeId', async () => {
    const extraTree = { ...fakeDbTree, id: 'extra-001', kind: 'extra' }
    mockFamilyTreeFindUnique.mockResolvedValue(extraTree)

    const result = await resolveTargetTreeOr404(WORKSPACE_ID, 'extra-001')

    expect(result).not.toBeInstanceOf(NextResponse)
    expect(result).toEqual(extraTree)
  })

  it('returns the main tree when treeId is absent', async () => {
    mockFamilyTreeFindUnique.mockResolvedValue(fakeDbTree)

    const result = await resolveTargetTreeOr404(WORKSPACE_ID)

    expect(result).not.toBeInstanceOf(NextResponse)
    expect(result).toEqual(fakeDbTree)
  })

  it('returns a 404 NextResponse when the treeId is foreign/unknown', async () => {
    // Scoped findFirst returns null because the id is not in WORKSPACE_ID
    mockFamilyTreeFindUnique.mockResolvedValue(null)

    const result = await resolveTargetTreeOr404(WORKSPACE_ID, 'foreign-tree-id')

    expect(result).toBeInstanceOf(NextResponse)
    const res = result as NextResponse
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'الشجرة غير موجودة' })
    // Fails closed — never lazily creates a tree for an explicit treeId
    expect(mockFamilyTreeCreate).not.toHaveBeenCalled()
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

// ---------------------------------------------------------------------------
// Phase 10b: workspace-key-aware helpers
// ---------------------------------------------------------------------------

function seededWorkspace(): { plaintextKey: Buffer; wrappedKey: Buffer } {
  const plaintextKey = generateWorkspaceKey()
  const wrappedKey = wrapKey(plaintextKey, getMasterKey())
  return { plaintextKey, wrappedKey }
}

describe('getTreeWithKey', () => {
  it('returns { tree, workspaceKey } with the unwrapped key', async () => {
    const { plaintextKey, wrappedKey } = seededWorkspace()
    mockFamilyTreeFindUnique.mockResolvedValue(fakeDbTree)
    mockWorkspaceFindUnique.mockResolvedValue({ encryptedKey: wrappedKey })

    const result = await getTreeWithKey(WORKSPACE_ID)

    expect(result).not.toBeNull()
    expect(result?.tree).toEqual(fakeDbTree)
    expect(Buffer.isBuffer(result?.workspaceKey)).toBe(true)
    expect(result?.workspaceKey.equals(plaintextKey)).toBe(true)
  })

  it('returns null when the tree does not exist (no key lookup)', async () => {
    mockFamilyTreeFindUnique.mockResolvedValue(null)

    const result = await getTreeWithKey(WORKSPACE_ID)

    expect(result).toBeNull()
    expect(mockWorkspaceFindUnique).not.toHaveBeenCalled()
  })

  it('throws if the workspace row has no encryptedKey (pre-10b rows)', async () => {
    mockFamilyTreeFindUnique.mockResolvedValue(fakeDbTree)
    mockWorkspaceFindUnique.mockResolvedValue({ encryptedKey: null })

    await expect(getTreeWithKey(WORKSPACE_ID)).rejects.toThrow()
  })
})

describe('getTreeIndividualDecrypted', () => {
  it('decrypts the returned row fields', async () => {
    const { plaintextKey, wrappedKey } = seededWorkspace()
    const encryptedIndividual = {
      id: 'ind-1',
      treeId: TREE_ID,
      sex: 'M',
      isPrivate: false,
      isDeceased: false,
      givenName: encryptFieldNullable('أحمد', plaintextKey),
      surname: encryptFieldNullable('الشربك', plaintextKey),
      fullName: null,
      birthDate: encryptFieldNullable('1990-01-01', plaintextKey),
      birthPlace: null,
      birthDescription: null,
      birthNotes: null,
      birthHijriDate: null,
      deathDate: null,
      deathPlace: null,
      deathDescription: null,
      deathNotes: null,
      deathHijriDate: null,
      kunya: null,
      notes: null,
    }

    mockIndividualFindFirst.mockResolvedValue(encryptedIndividual)
    mockWorkspaceFindUnique.mockResolvedValue({ encryptedKey: wrappedKey })

    const result = await getTreeIndividualDecrypted(WORKSPACE_ID, TREE_ID, 'ind-1')

    expect(result).not.toBeNull()
    expect(result?.id).toBe('ind-1')
    expect(result?.sex).toBe('M')
    expect(result?.givenName).toBe('أحمد')
    expect(result?.surname).toBe('الشربك')
    expect(result?.birthDate).toBe('1990-01-01')
    expect(result?.fullName).toBeNull()
  })

  it('returns null when the individual is not in the tree (no key lookup)', async () => {
    mockIndividualFindFirst.mockResolvedValue(null)

    const result = await getTreeIndividualDecrypted(WORKSPACE_ID, TREE_ID, 'missing')

    expect(result).toBeNull()
    expect(mockWorkspaceFindUnique).not.toHaveBeenCalled()
  })
})

describe('getTreeFamilyDecrypted', () => {
  it('decrypts the marriage event fields on the returned row', async () => {
    const { plaintextKey, wrappedKey } = seededWorkspace()
    const encryptedFamily = {
      id: 'fam-1',
      treeId: TREE_ID,
      husbandId: 'h-1',
      wifeId: 'w-1',
      marriageContractPlaceId: null,
      marriagePlaceId: null,
      divorcePlaceId: null,
      isUmmWalad: false,
      isDivorced: false,
      marriageContractDate: null,
      marriageContractHijriDate: null,
      marriageContractPlace: null,
      marriageContractDescription: null,
      marriageContractNotes: null,
      marriageDate: encryptFieldNullable('1990-06-15', plaintextKey),
      marriageHijriDate: null,
      marriagePlace: encryptFieldNullable('Damascus', plaintextKey),
      marriageDescription: null,
      marriageNotes: null,
      divorceDate: null,
      divorceHijriDate: null,
      divorcePlace: null,
      divorceDescription: null,
      divorceNotes: null,
      children: [{ familyId: 'fam-1', individualId: 'c-1' }],
    }
    mockFamilyFindFirst.mockResolvedValue(encryptedFamily)
    mockWorkspaceFindUnique.mockResolvedValue({ encryptedKey: wrappedKey })

    const result = await getTreeFamilyDecrypted(WORKSPACE_ID, TREE_ID, 'fam-1')

    expect(result).not.toBeNull()
    expect(result?.id).toBe('fam-1')
    expect(result?.husbandId).toBe('h-1')
    expect(result?.marriageDate).toBe('1990-06-15')
    expect(result?.marriagePlace).toBe('Damascus')
    expect(result?.marriageNotes).toBeNull()
    // children FK list passes through untouched
    expect(result?.children).toEqual([{ familyId: 'fam-1', individualId: 'c-1' }])
  })

  it('returns null when the family is not in the tree', async () => {
    mockFamilyFindFirst.mockResolvedValue(null)

    const result = await getTreeFamilyDecrypted(WORKSPACE_ID, TREE_ID, 'missing')

    expect(result).toBeNull()
  })
})

describe('getTreeRadaFamilyDecrypted', () => {
  it('decrypts the notes field', async () => {
    const { plaintextKey, wrappedKey } = seededWorkspace()
    const encryptedRada = {
      id: 'rada-1',
      treeId: TREE_ID,
      fosterFatherId: 'f-1',
      fosterMotherId: 'm-1',
      notes: encryptFieldNullable('milk kinship notes', plaintextKey),
      children: [{ radaFamilyId: 'rada-1', individualId: 'c-1' }],
    }
    mockRadaFamilyFindFirst.mockResolvedValue(encryptedRada)
    mockWorkspaceFindUnique.mockResolvedValue({ encryptedKey: wrappedKey })

    const result = await getTreeRadaFamilyDecrypted(WORKSPACE_ID, TREE_ID, 'rada-1')

    expect(result).not.toBeNull()
    expect(result?.id).toBe('rada-1')
    expect(result?.fosterFatherId).toBe('f-1')
    expect(result?.notes).toBe('milk kinship notes')
  })

  it('returns null when the rada family is not in the tree', async () => {
    mockRadaFamilyFindFirst.mockResolvedValue(null)

    const result = await getTreeRadaFamilyDecrypted(WORKSPACE_ID, TREE_ID, 'missing')

    expect(result).toBeNull()
  })
})

import { prisma } from '@/lib/db'

// ---------------------------------------------------------------------------
// Shared include shape for tree queries
// ---------------------------------------------------------------------------

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
} as const

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
} as const

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Returns the FamilyTree for a workspace with all included data
 * (individuals, families with children). Returns null if no tree exists.
 */
export async function getTreeByWorkspaceId(workspaceId: string) {
  return prisma.familyTree.findUnique({
    where: { workspaceId },
    include: TREE_INCLUDES,
  })
}

/**
 * Gets or lazily creates a FamilyTree for a workspace.
 * Returns the tree with all includes.
 */
export async function getOrCreateTree(workspaceId: string) {
  const existing = await getTreeByWorkspaceId(workspaceId)
  if (existing) return existing

  return prisma.familyTree.create({
    data: { workspaceId },
    include: TREE_INCLUDES,
  })
}

/**
 * Update the lastModifiedAt timestamp on the tree for a workspace.
 * Called after any tree mutation to invalidate ETags.
 */
export async function touchTreeTimestamp(treeId: string) {
  return prisma.familyTree.update({
    where: { id: treeId },
    data: { lastModifiedAt: new Date() },
  })
}

/**
 * Get a single individual, verifying it belongs to the specified tree.
 */
export async function getTreeIndividual(treeId: string, individualId: string) {
  return prisma.individual.findFirst({
    where: { id: individualId, treeId },
  })
}

/**
 * Get a single family, verifying it belongs to the specified tree.
 */
export async function getTreeFamily(treeId: string, familyId: string) {
  return prisma.family.findFirst({
    where: { id: familyId, treeId },
    include: { children: true },
  })
}

/**
 * Get a single rada family, verifying it belongs to the specified tree.
 */
export async function getTreeRadaFamily(treeId: string, radaFamilyId: string) {
  return prisma.radaFamily.findFirst({
    where: { id: radaFamilyId, treeId },
    include: { children: true },
  })
}

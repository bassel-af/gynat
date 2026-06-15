import { prisma } from '@/lib/db'
import {
  getWorkspaceKey,
  decryptIndividualRow,
  decryptFamilyRow,
  decryptRadaFamilyRow,
} from '@/lib/tree/encryption'
import type {
  DecryptedIndividual,
  DecryptedFamily,
  DecryptedRadaFamily,
} from '@/lib/tree/mapper'

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

export const TREE_INCLUDES = {
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
 * Returns the MAIN FamilyTree for a workspace with all included data
 * (individuals, families with children). Returns null if no main tree exists.
 *
 * Multi-tree foundation: a workspace can hold one `main` tree plus optional
 * `extra` trees (collections, a later effort). Public Tree v1 only ever uses
 * the main tree, so this resolver always scopes to `kind: 'main'`.
 */
export async function getTreeByWorkspaceId(workspaceId: string) {
  return prisma.familyTree.findFirst({
    where: { workspaceId, kind: 'main' },
    include: TREE_INCLUDES,
  })
}

/**
 * Gets or lazily creates the MAIN FamilyTree for a workspace.
 * Returns the tree with all includes.
 */
export async function getOrCreateTree(workspaceId: string) {
  const existing = await getTreeByWorkspaceId(workspaceId)
  if (existing) return existing

  return prisma.familyTree.create({
    data: { workspaceId, kind: 'main' },
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

// ---------------------------------------------------------------------------
// Phase 10b: workspace-key-aware helpers
//
// These variants return data alongside (or decrypted with) the workspace's
// unwrapped AES-256 data key. Existing callers can migrate incrementally —
// the original helpers above remain unchanged.
// ---------------------------------------------------------------------------

/**
 * Fetch a workspace's family tree AND its unwrapped encryption key in one go.
 * Returns null if the tree does not exist (skipping the key lookup). Throws
 * from `getWorkspaceKey` if the workspace row has no encryptedKey (pre-10b
 * workspace that still needs migration).
 */
export async function getTreeWithKey(workspaceId: string) {
  const tree = await getTreeByWorkspaceId(workspaceId)
  if (!tree) return null
  const workspaceKey = await getWorkspaceKey(workspaceId)
  return { tree, workspaceKey }
}

/**
 * Same as `getOrCreateTree`, but additionally returns the workspace's
 * unwrapped encryption key. Used by mutation routes that need to encrypt new
 * rows before persisting them.
 */
export async function getOrCreateTreeWithKey(workspaceId: string) {
  const tree = await getOrCreateTree(workspaceId)
  const workspaceKey = await getWorkspaceKey(workspaceId)
  return { tree, workspaceKey }
}

/**
 * Fetch a single individual by id AND decrypt all of its encrypted fields in
 * place before returning. Returns null if the individual does not belong to
 * the given tree (no key lookup happens in that case).
 */
export async function getTreeIndividualDecrypted(
  workspaceId: string,
  treeId: string,
  individualId: string,
): Promise<DecryptedIndividual | null> {
  const row = await getTreeIndividual(treeId, individualId)
  if (!row) return null
  const key = await getWorkspaceKey(workspaceId)
  // `decryptIndividualRow` returns the same generic T it was given, so we
  // cast to the plaintext `DecryptedIndividual` here — callers expect
  // string | null on the encrypted fields, not Uint8Array | null.
  return decryptIndividualRow(row, key) as unknown as DecryptedIndividual
}

/**
 * Fetch a single family by id AND decrypt all of its encrypted event fields
 * before returning. Returns null if the family does not belong to the given
 * tree. The `children` relation passes through untouched.
 */
export async function getTreeFamilyDecrypted(
  workspaceId: string,
  treeId: string,
  familyId: string,
): Promise<(DecryptedFamily & { children: { familyId: string; individualId: string }[] }) | null> {
  const row = await getTreeFamily(treeId, familyId)
  if (!row) return null
  const key = await getWorkspaceKey(workspaceId)
  return decryptFamilyRow(row, key) as unknown as DecryptedFamily & {
    children: { familyId: string; individualId: string }[]
  }
}

/**
 * Fetch a single rada family by id AND decrypt its `notes` field before
 * returning. Returns null if the rada family does not belong to the given
 * tree. The `children` relation passes through untouched.
 */
export async function getTreeRadaFamilyDecrypted(
  workspaceId: string,
  treeId: string,
  radaFamilyId: string,
): Promise<(DecryptedRadaFamily & { children: { radaFamilyId: string; individualId: string }[] }) | null> {
  const row = await getTreeRadaFamily(treeId, radaFamilyId)
  if (!row) return null
  const key = await getWorkspaceKey(workspaceId)
  return decryptRadaFamilyRow(row, key) as unknown as DecryptedRadaFamily & {
    children: { radaFamilyId: string; individualId: string }[]
  }
}

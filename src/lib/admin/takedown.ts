/**
 * Public Tree — admin global takedown (PRD §1.11, §7.7).
 *
 * The hard escape hatch for genuine privacy problems: an admin can remove a
 * subtree EVERYWHERE it was copied to, by walking the `CopyProvenance` trail.
 * The provenance rows are KEPT (not deleted) so the trail survives and a repeat
 * takedown stays idempotent. Platform-owner-only; every run is admin-audited
 * by the caller (route) via `logAdminAccess`.
 *
 * This module does the heavy DB work; the `planTakedown` core is pure and
 * tested in isolation.
 */

import { prisma } from '@/lib/db'
import { getWorkspaceKey } from '@/lib/tree/encryption'
import { dbTreeToGedcomData } from '@/lib/tree/mapper'
import { getAllDescendants } from '@/lib/gedcom/graph'
import { TREE_INCLUDES } from '@/lib/tree/queries'

export interface ProvenanceRow {
  id: string
  copiedTreeId: string
  copiedRootId: string
  sourceWorkspaceId: string
  sourceTreeId: string
  sourceRootId: string
  reason: string
}

export interface TakedownTarget {
  copiedTreeId: string
  copiedRootIds: string[]
}

/**
 * Pure: group provenance rows into per-tree takedown targets, deduplicating
 * copied roots within a tree.
 */
export function planTakedown(rows: ProvenanceRow[]): TakedownTarget[] {
  const byTree = new Map<string, Set<string>>()
  for (const r of rows) {
    const set = byTree.get(r.copiedTreeId) ?? new Set<string>()
    set.add(r.copiedRootId)
    byTree.set(r.copiedTreeId, set)
  }
  return [...byTree.entries()].map(([copiedTreeId, roots]) => ({
    copiedTreeId,
    copiedRootIds: [...roots],
  }))
}

export interface TakedownFilter {
  /** Take down everything copied from this source root (preferred — specific). */
  sourceRootId?: string
  /** Take down everything copied from this source workspace (broad). */
  sourceWorkspaceId?: string
}

export interface TakedownResult {
  treesAffected: number
  individualsRemoved: number
}

/**
 * Execute a global takedown for the given filter. For each copied tree, removes
 * the copied root and all of its descendants (the copied subtree), cleaning up
 * the same FK references as a cascade delete. Provenance rows are KEPT.
 */
export async function executeTakedown(
  filter: TakedownFilter,
): Promise<TakedownResult> {
  if (!filter.sourceRootId && !filter.sourceWorkspaceId) {
    throw new Error('executeTakedown requires sourceRootId or sourceWorkspaceId')
  }

  const rows = (await prisma.copyProvenance.findMany({
    where: {
      ...(filter.sourceRootId ? { sourceRootId: filter.sourceRootId } : {}),
      ...(filter.sourceWorkspaceId ? { sourceWorkspaceId: filter.sourceWorkspaceId } : {}),
    },
  })) as ProvenanceRow[]

  const plan = planTakedown(rows)
  let treesAffected = 0
  let individualsRemoved = 0

  for (const target of plan) {
    // Load the copied tree (decrypt only for STRUCTURAL traversal — we never
    // surface the plaintext; we just need the parent/child graph).
    const dbTree = await prisma.familyTree.findUnique({
      where: { id: target.copiedTreeId },
      include: TREE_INCLUDES,
    })
    if (!dbTree) continue

    const workspaceKey = await getWorkspaceKey(dbTree.workspaceId)
    const data = dbTreeToGedcomData(dbTree as never, workspaceKey)

    // Collect the copied root(s) + all descendants present in this tree.
    const idsToRemove = new Set<string>()
    for (const rootId of target.copiedRootIds) {
      if (!data.individuals[rootId]) continue // already gone (idempotent)
      idsToRemove.add(rootId)
      for (const d of getAllDescendants(data, rootId)) idsToRemove.add(d)
    }
    if (idsToRemove.size === 0) continue

    const allDeleteIds = [...idsToRemove]
    await prisma.$transaction(async (tx) => {
      const txp = tx as typeof prisma
      // Same FK cleanup order as cascade delete.
      await txp.branchPointer.updateMany({
        where: {
          OR: [
            { rootIndividualId: { in: allDeleteIds } },
            { selectedIndividualId: { in: allDeleteIds } },
            { anchorIndividualId: { in: allDeleteIds } },
          ],
        },
        data: { status: 'broken' },
      })
      await txp.branchShareToken.updateMany({
        where: { rootIndividualId: { in: allDeleteIds }, isRevoked: false },
        data: { isRevoked: true },
      })
      await txp.radaFamily.updateMany({
        where: { fosterFatherId: { in: allDeleteIds } },
        data: { fosterFatherId: null },
      })
      await txp.radaFamily.updateMany({
        where: { fosterMotherId: { in: allDeleteIds } },
        data: { fosterMotherId: null },
      })
      await txp.userTreeLink.deleteMany({ where: { individualId: { in: allDeleteIds } } })
      await txp.workspaceInvitation.updateMany({
        where: { individualId: { in: allDeleteIds } },
        data: { individualId: null },
      })
      await txp.family.updateMany({
        where: { husbandId: { in: allDeleteIds } },
        data: { husbandId: null },
      })
      await txp.family.updateMany({
        where: { wifeId: { in: allDeleteIds } },
        data: { wifeId: null },
      })
      // FamilyChild + RadaFamilyChild auto-cascade on individual delete.
      await txp.individual.deleteMany({ where: { id: { in: allDeleteIds } } })
      // Clean up emptied families in this tree.
      await txp.family.deleteMany({
        where: {
          treeId: target.copiedTreeId,
          husbandId: null,
          wifeId: null,
          children: { none: {} },
        },
      })
    })

    treesAffected++
    individualsRemoved += allDeleteIds.length
  }

  // Provenance rows are intentionally KEPT (the trail must survive).
  return { treesAffected, individualsRemoved }
}

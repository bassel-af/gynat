/**
 * Public Tree — going-private dependent freeze (PRD §1.11, §7.7).
 *
 * When a previously-public tree is made private, any LIVE branch pointers that
 * borrow FROM this tree must not silently break the collections that rely on
 * them. Instead we freeze each one into a deep copy in its target workspace
 * (the "left-pad" lesson), then mark the pointer `broken`. Every copy records
 * a `CopyProvenance` row so the report→admin global takedown can still reach it.
 *
 * Reuses the same deep-copy primitives as the token-revoke auto-copy path.
 */

import { prisma } from '@/lib/db'
import { getTreeByWorkspaceId, getOrCreateTree } from '@/lib/tree/queries'
import { getWorkspaceKey } from '@/lib/tree/encryption'
import { dbTreeToGedcomData } from '@/lib/tree/mapper'
import { extractPointedSubtree } from '@/lib/tree/branch-pointer-merge'
import { prepareDeepCopy, persistDeepCopy } from '@/lib/tree/branch-pointer-deep-copy'
import { logSwallowedAuditError } from '@/lib/api/swallowed-error-log'

export interface FreezeResult {
  frozen: number
  failed: number
}

/**
 * Freeze every active branch pointer whose SOURCE is `sourceWorkspaceId` into a
 * deep copy in its target workspace, then mark the pointer `broken`. Best-effort
 * per pointer — one failure does not abort the rest. Returns counts.
 */
export async function freezeDependentPointers(
  sourceWorkspaceId: string,
): Promise<FreezeResult> {
  const activePointers = await prisma.branchPointer.findMany({
    where: { sourceWorkspaceId, status: 'active' },
  })
  if (activePointers.length === 0) return { frozen: 0, failed: 0 }

  // Source tree fetched once (all these pointers share the same source).
  const sourceKey = await getWorkspaceKey(sourceWorkspaceId)
  const sourceTree = await getTreeByWorkspaceId(sourceWorkspaceId)
  const sourceData = sourceTree ? dbTreeToGedcomData(sourceTree, sourceKey) : null

  let frozen = 0
  let failed = 0

  for (const pointer of activePointers) {
    try {
      if (!sourceData || !sourceTree) {
        // Source gone — break the pointer without a copy (nothing to copy).
        await prisma.branchPointer.update({
          where: { id: pointer.id },
          data: { status: 'broken' },
        })
        frozen++
        continue
      }

      const pointedSubtree = extractPointedSubtree(sourceData, {
        rootIndividualId: pointer.rootIndividualId,
        depthLimit: pointer.depthLimit,
        includeGrafts: pointer.includeGrafts,
      })

      const copyResult = prepareDeepCopy(pointedSubtree, {
        anchorIndividualId: pointer.anchorIndividualId,
        relationship: pointer.relationship as 'child' | 'sibling' | 'spouse' | 'parent',
        pointerId: pointer.id,
      })

      const targetTree = await getOrCreateTree(pointer.targetWorkspaceId)
      const targetKey = await getWorkspaceKey(pointer.targetWorkspaceId)
      const copiedRootId =
        copyResult.idMap.get(pointer.rootIndividualId) ?? pointer.rootIndividualId

      await prisma.$transaction(async (tx) => {
        const txPrisma = tx as typeof prisma
        await persistDeepCopy(txPrisma, targetTree.id, copyResult, targetKey, {
          reason: 'going_private',
          sourceWorkspaceId,
          sourceTreeId: sourceTree.id,
          sourceRootId: pointer.rootIndividualId,
          copiedRootId,
        })
        await txPrisma.branchPointer.update({
          where: { id: pointer.id },
          data: { status: 'broken' },
        })
      })

      frozen++
    } catch (err) {
      logSwallowedAuditError('going_private_freeze', { pointerId: pointer.id }, err)
      failed++
    }
  }

  return { frozen, failed }
}

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
  // EXCLUDE anchor-less collection-link pointers (S20). The freeze is for REAL
  // anchored branch pointers only — stitching a collection borrow into the
  // target's MAIN tree would corrupt it. We leave the collection pointer
  // completely untouched (no stitch, no mark-broken, no copy). Its safety on a
  // source going private is the SERVE-TIME reuse-gate (S11): shapeCollectionItem
  // re-checks LIVE source visibility deny-by-default, so a now-private source
  // hides the borrow in every collection consumer.
  //
  // TODO(Chunk 4 / PRD §2.10): the full PRESERVATION path — convert a live
  // collection link into a frozen extra-tree copy and re-point
  // CollectionItem.branchPointerId → treeId when the source goes private/revokes
  // — lives with collection public serving + going-private freeze-repoint. Until
  // then the borrow stays a live link (hidden while the source is private,
  // reappears if the source returns public). Takedown reachability is unaffected
  // (admin/takedown + CopyProvenance query unfiltered).
  const activePointers = await prisma.branchPointer.findMany({
    where: { sourceWorkspaceId, status: 'active', isCollectionLink: false },
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
      // Defensive narrow: collection-link pointers are already excluded by the
      // WHERE above, so a real anchored pointer always has a non-null
      // anchor/relationship here. Skip (don't stitch) anything that somehow
      // doesn't — fail-closed, never feed a null anchor to prepareDeepCopy.
      if (pointer.anchorIndividualId == null || pointer.relationship == null) {
        failed++
        continue
      }

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

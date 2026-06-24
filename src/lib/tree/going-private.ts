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
import { prepareDeepCopy, persistDeepCopy, computeAnchorReuse } from '@/lib/tree/branch-pointer-deep-copy'
import { isStitchablePointer } from '@/lib/tree/branch-pointer-guards'
import { logSwallowedAuditError } from '@/lib/api/swallowed-error-log'
import { copyBorrowedBranchIntoNewExtraTree } from '@/lib/collections/copy-borrowed'
import type { ResolvedLinkSource } from '@/lib/collections/resolve-link'

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
      if (!isStitchablePointer(pointer)) {
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

      const targetTree = await getOrCreateTree(pointer.targetWorkspaceId)
      const targetKey = await getWorkspaceKey(pointer.targetWorkspaceId)

      // Mirror the live-merge reuse so the frozen copy shows both parents.
      const relationship = pointer.relationship as 'child' | 'sibling' | 'spouse' | 'parent'
      const targetData = dbTreeToGedcomData(targetTree, targetKey)
      const pointedRootSex = pointedSubtree.individuals[pointer.rootIndividualId]?.sex ?? 'M'
      const anchorReuse = computeAnchorReuse(
        targetData,
        pointer.anchorIndividualId,
        relationship,
        pointedRootSex,
      )

      const copyResult = prepareDeepCopy(pointedSubtree, {
        anchorIndividualId: pointer.anchorIndividualId,
        relationship,
        pointerId: pointer.id,
        anchorReuse,
      })
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

/**
 * Freeze every active COLLECTION-LINK pointer whose SOURCE is `sourceWorkspaceId`
 * into a frozen extra-tree copy in its TARGET (borrowing) workspace, then re-point
 * the dependent `CollectionItem`s (`branchPointerId → treeId`, `linkMode:'copied'`)
 * and mark the pointer broken. The Chunk-4 PRESERVATION path (PRD §2.10).
 *
 * SEPARATE from {@link freezeDependentPointers}: a collection-link pointer is
 * ANCHOR-LESS, so there is NO main-tree stitch — it is a standalone snapshot
 * (REUSES `copyBorrowedBranchIntoNewExtraTree`, the two-key cross-workspace
 * deep-copy that also writes `CopyProvenance` for takedown reachability).
 *
 * Best-effort per pointer — one failure does not abort the rest. Returns counts.
 */
export async function freezeCollectionLinks(
  sourceWorkspaceId: string,
): Promise<FreezeResult> {
  const pointers = await prisma.branchPointer.findMany({
    where: { sourceWorkspaceId, status: 'active', isCollectionLink: true },
    select: {
      id: true,
      sourceWorkspaceId: true,
      targetWorkspaceId: true,
      rootIndividualId: true,
      depthLimit: true,
      includeGrafts: true,
      // The leaf tree the borrow lives in (owns the pointer's root individual)
      // — its id is the snapshot source for the two-key deep copy, and its LIVE
      // visibility + allowReuse decide whether the borrow would still serve
      // publicly (S19: skip the freeze if so — see the loop below).
      rootIndividual: {
        select: {
          tree: { select: { id: true, visibility: true, allowReuse: true } },
        },
      },
      // The dependent collection items to re-point onto the frozen copy.
      collectionItems: { select: { id: true, titleAr: true } },
    },
  })
  if (pointers.length === 0) return { frozen: 0, failed: 0 }

  let frozen = 0
  let failed = 0

  for (const pointer of pointers) {
    try {
      const leaf = pointer.rootIndividual?.tree ?? null
      const sourceTreeId = leaf?.id ?? null
      if (!sourceTreeId) {
        // No source leaf tree to copy → fail-closed (leave it; the serve-time
        // reuse-gate already hides a now-private borrow).
        failed++
        continue
      }

      // S19: this freeze is WORKSPACE-scoped — it sees EVERY collection-link
      // pointer sourced from this workspace, not just ones rooting in the tree
      // that went private. A borrow whose leaf tree is STILL public + reusable
      // would keep serving publicly (same gate as the serve path:
      // resolveEffectiveVisibility(branchPointer) non-private AND leaf.allowReuse),
      // so freezing it would prematurely snapshot a live borrow. Skip it —
      // leave the live link intact. Only freeze borrows that are no longer
      // publicly reusable (private leaf, or allowReuse off).
      const stillPubliclyReusable =
        leaf.visibility !== 'private' && leaf.allowReuse === true
      if (stillPubliclyReusable) continue

      // Build the ResolvedLinkSource the two-key copier consumes. A collection
      // link is inherently a cross-workspace borrow; `allowReuse`/`isPublic`
      // don't gate the freeze (the owner is preserving an existing borrow).
      const source: ResolvedLinkSource = {
        type: 'public-slug',
        sourceWorkspaceId: pointer.sourceWorkspaceId,
        sourceTreeId,
        rootIndividualId: pointer.rootIndividualId,
        depthLimit: pointer.depthLimit,
        includeGrafts: pointer.includeGrafts,
        isPublic: true,
        shareTokenId: null,
        allowReuse: true,
      }

      const nameAr = pointer.collectionItems[0]?.titleAr ?? 'فرع محفوظ'
      const { newTreeId } = await copyBorrowedBranchIntoNewExtraTree({
        addingWorkspaceId: pointer.targetWorkspaceId,
        source,
        nameAr,
      })

      // Re-point the dependent items onto the frozen copy + break the pointer,
      // atomically. (`copyBorrowedBranchIntoNewExtraTree` already committed the
      // copy + provenance in its own transaction; this is the cheap re-point.)
      await prisma.$transaction(async (tx) => {
        const txPrisma = tx as typeof prisma
        await txPrisma.collectionItem.updateMany({
          where: { branchPointerId: pointer.id },
          data: { treeId: newTreeId, branchPointerId: null, linkMode: 'copied' },
        })
        await txPrisma.branchPointer.update({
          where: { id: pointer.id },
          data: { status: 'broken' },
        })
      })

      frozen++
    } catch (err) {
      logSwallowedAuditError('going_private_freeze_collection_link', { pointerId: pointer.id }, err)
      failed++
    }
  }

  return { frozen, failed }
}

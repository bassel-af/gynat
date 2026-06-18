/**
 * Collections Chunk 3 — cross-workspace deep-copy of a BORROWED branch into a
 * new extra tree (Slice A, `linkMode:'copied'`).
 *
 * This is the TWO-KEY counterpart to `copy.ts` (which is single-key, same-
 * workspace only): the source lives in ANOTHER workspace, so the source data is
 * decrypted with the SOURCE key and re-encrypted with the TARGET key before any
 * write. No ciphertext — and no plaintext under the source key — ever crosses
 * the workspace boundary at rest. Modeled on
 * `branch-pointers/[pointerId]/copy/route.ts`.
 *
 * A standalone collection snapshot has NO anchor to graft onto, so it reuses
 * `prepareTreeSnapshot` (no stitch family). A `CopyProvenance` row (reason
 * `collection_link_copy`) is written in the SAME transaction so the admin global
 * takedown can still find the copy (S13).
 */

import { prisma } from '@/lib/db';
import { getTreeByIdWithIncludes } from '@/lib/tree/queries';
import { dbTreeToGedcomData } from '@/lib/tree/mapper';
import { getWorkspaceKey } from '@/lib/tree/encryption';
import { extractPointedSubtree } from '@/lib/tree/branch-pointer-merge';
import { persistDeepCopy } from '@/lib/tree/branch-pointer-deep-copy';
import { prepareTreeSnapshot } from '@/lib/collections/copy';
import { assertExtraTreeCapacity } from '@/lib/collections/extra-tree-cap';
import { WHOLE_TREE_ROOT, type ResolvedLinkSource } from '@/lib/collections/resolve-link';
import type { GedcomData } from '@/lib/gedcom/types';

export interface CopyBorrowedInput {
  addingWorkspaceId: string;
  source: ResolvedLinkSource;
  nameAr: string;
}

/**
 * Deep-copy a resolved borrowed source into a brand-new extra tree in the
 * ADDING workspace. Returns the new tree id. Throws (fail-closed) when the
 * source tree can't be loaded.
 */
export async function copyBorrowedBranchIntoNewExtraTree(
  input: CopyBorrowedInput,
): Promise<{ newTreeId: string; peopleCount: number }> {
  const { addingWorkspaceId, source, nameAr } = input;

  // Minting another extra tree in the ADDING workspace — reject at the cap before
  // any decrypt/copy work (same limit the extra-trees POST route enforces).
  await assertExtraTreeCapacity(addingWorkspaceId);

  // Source key decrypts; target key re-encrypts. Resolve both BEFORE the tx so
  // the master-key unwrap stays off the DB lock (matches the pointer-copy route).
  const [sourceTree, sourceKey, targetKey] = await Promise.all([
    // Fetch the SPECIFIC published tree (main OR extra) by id, scoped to the
    // source workspace — copies the actual borrowed tree, not always the main.
    getTreeByIdWithIncludes(source.sourceWorkspaceId, source.sourceTreeId),
    getWorkspaceKey(source.sourceWorkspaceId),
    getWorkspaceKey(addingWorkspaceId),
  ]);
  if (!sourceTree) {
    throw new Error('source tree not available');
  }

  const sourceData = dbTreeToGedcomData(sourceTree, sourceKey);

  // Whole-tree (public slug) → snapshot everything. Branch (private token) →
  // extract the pointed subtree first, then snapshot that.
  const toCopy: GedcomData =
    source.rootIndividualId === WHOLE_TREE_ROOT
      ? sourceData
      : extractPointedSubtree(sourceData, {
          rootIndividualId: source.rootIndividualId,
          depthLimit: source.depthLimit,
          includeGrafts: source.includeGrafts,
        });

  const snapshot = prepareTreeSnapshot(toCopy);
  const peopleCount = Object.keys(snapshot.individuals).length;

  const sourceRootId =
    source.rootIndividualId === WHOLE_TREE_ROOT
      ? (Object.keys(toCopy.individuals)[0] ?? source.sourceTreeId)
      : source.rootIndividualId;
  const copiedRootId = snapshot.idMap.get(sourceRootId) ?? sourceRootId;

  // Create the new extra tree AND persist the re-encrypted snapshot + provenance
  // in ONE transaction (a crash can't leave an empty orphan tree behind).
  const newTreeId = await prisma.$transaction(async (tx) => {
    const newTree = await tx.familyTree.create({
      data: { workspaceId: addingWorkspaceId, kind: 'extra', nameAr },
      select: { id: true },
    });
    await persistDeepCopy(tx, newTree.id, snapshot, targetKey, {
      reason: 'collection_link_copy',
      sourceWorkspaceId: source.sourceWorkspaceId,
      sourceTreeId: source.sourceTreeId,
      sourceRootId,
      copiedRootId,
    });
    return newTree.id;
  });

  return { newTreeId, peopleCount };
}

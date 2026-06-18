import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { TREE_INCLUDES } from '@/lib/tree/queries';
import { dbTreeToGedcomData } from '@/lib/tree/mapper';
import { getWorkspaceKey } from '@/lib/tree/encryption';
import { persistDeepCopy } from '@/lib/tree/branch-pointer-deep-copy';
import type { DeepCopyResult } from '@/lib/tree/branch-pointer-deep-copy';
import { assertExtraTreeCapacity } from '@/lib/collections/extra-tree-cap';
import type { GedcomData, Individual, Family } from '@/lib/gedcom/types';

// ---------------------------------------------------------------------------
// Collections — copy an OWN tree (main or extra) into a brand-new extra tree.
//
// This is the `linkMode:'copied'` branch for a `kind:'tree'` collection item
// that points at a tree inside the SAME workspace: the source data is snapshot
// into an independent extra tree so later edits to the original don't leak in.
// A hidden `CopyProvenance` row (reason 'manual_copy') is written so the admin
// global takedown can still find the copy. Same workspace ⇒ one key for both
// decrypt and re-encrypt.
// ---------------------------------------------------------------------------

/**
 * Prepare a deep copy of a whole tree into a new extra tree — fresh UUIDs for
 * every individual/family, all cross-references rewritten, and NO stitch family
 * (a standalone snapshot has no anchor to graft onto). Pure: does not touch the
 * DB.
 */
export function prepareTreeSnapshot(source: GedcomData): DeepCopyResult {
  const idMap = new Map<string, string>();
  for (const id of Object.keys(source.individuals)) idMap.set(id, crypto.randomUUID());
  for (const id of Object.keys(source.families)) idMap.set(id, crypto.randomUUID());

  const individuals: Record<string, Individual> = {};
  for (const [oldId, ind] of Object.entries(source.individuals)) {
    const newId = idMap.get(oldId)!;
    const copied: Individual = {
      ...ind,
      id: newId,
      familiesAsSpouse: ind.familiesAsSpouse
        .map((famId) => idMap.get(famId))
        .filter((id): id is string => id !== undefined),
      familyAsChild: ind.familyAsChild ? (idMap.get(ind.familyAsChild) ?? null) : null,
    };
    delete copied.birthPlaceId;
    delete copied.deathPlaceId;
    delete copied._pointed;
    delete copied._sourceWorkspaceId;
    individuals[newId] = copied;
  }

  const families: Record<string, Family> = {};
  for (const [oldId, fam] of Object.entries(source.families)) {
    const newId = idMap.get(oldId)!;
    const copied: Family = {
      ...fam,
      id: newId,
      husband: fam.husband ? (idMap.get(fam.husband) ?? null) : null,
      wife: fam.wife ? (idMap.get(fam.wife) ?? null) : null,
      children: fam.children
        .map((childId) => idMap.get(childId))
        .filter((id): id is string => id !== undefined),
    };
    delete copied._pointed;
    delete copied._sourceWorkspaceId;
    families[newId] = copied;
  }

  return { individuals, families, idMap, stitchFamily: null };
}

/**
 * Deep-copy a source tree (own main/extra, by id) into a NEW extra tree in the
 * SAME workspace, recording provenance. Returns the new tree id. Throws if the
 * source tree isn't found in the workspace.
 */
export async function copyTreeIntoNewExtraTree(input: {
  workspaceId: string;
  sourceTreeId: string;
  nameAr: string;
}): Promise<{ newTreeId: string; nameAr: string; peopleCount: number }> {
  // Minting another extra tree — reject when the workspace is at the cap before
  // doing any decrypt/copy work (same limit the extra-trees POST route enforces).
  await assertExtraTreeCapacity(input.workspaceId);

  const sourceTree = await prisma.familyTree.findFirst({
    where: { id: input.sourceTreeId, workspaceId: input.workspaceId },
    include: TREE_INCLUDES,
  });
  if (!sourceTree) {
    throw new Error('source tree not found in workspace');
  }

  // Same workspace ⇒ one key decrypts the source AND re-encrypts the copy.
  const key = await getWorkspaceKey(input.workspaceId);
  const sourceData = dbTreeToGedcomData(sourceTree, key);
  const snapshot = prepareTreeSnapshot(sourceData);

  const sourceRootId = Object.keys(sourceData.individuals)[0] ?? input.sourceTreeId;
  const copiedRootId = snapshot.idMap.get(sourceRootId) ?? sourceRootId;
  // The snapshot already holds every copied individual — count it in memory
  // instead of a follow-up query.
  const peopleCount = Object.keys(snapshot.individuals).length;

  // Create the new extra tree AND persist the snapshot in ONE transaction, so a
  // crash between the two can't leave an empty orphan tree behind.
  const newTreeId = await prisma.$transaction(async (tx) => {
    const newTree = await tx.familyTree.create({
      data: { workspaceId: input.workspaceId, kind: 'extra', nameAr: input.nameAr },
      select: { id: true },
    });
    await persistDeepCopy(tx, newTree.id, snapshot, key, {
      reason: 'manual_copy',
      sourceWorkspaceId: input.workspaceId,
      sourceTreeId: input.sourceTreeId,
      sourceRootId,
      copiedRootId,
    });
    return newTree.id;
  });

  return { newTreeId, nameAr: input.nameAr, peopleCount };
}

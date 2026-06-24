import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireWorkspaceAdmin, isErrorResponse } from '@/lib/api/workspace-auth';
import { getTreeByWorkspaceId, getOrCreateTree, touchTreeTimestamp } from '@/lib/tree/queries';
import { dbTreeToGedcomData } from '@/lib/tree/mapper';
import { getWorkspaceKey, encryptSnapshot } from '@/lib/tree/encryption';
import { extractPointedSubtree } from '@/lib/tree/branch-pointer-merge';
import { prepareDeepCopy, persistDeepCopy, computeAnchorReuse } from '@/lib/tree/branch-pointer-deep-copy';
import { snapshotBranchPointer, encryptAuditDescription } from '@/lib/tree/audit';

type RouteParams = { params: Promise<{ id: string; pointerId: string }> };

// POST /api/workspaces/[id]/branch-pointers/[pointerId]/copy — Deep copy pointed branch (keep pointer active)
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, pointerId } = await params;

  const result = await requireWorkspaceAdmin(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const pointer = await prisma.branchPointer.findUnique({
    where: { id: pointerId },
  });

  console.log('[branch-copy] pointerId:', pointerId, 'found:', !!pointer, 'status:', pointer?.status, 'targetWorkspaceId:', pointer?.targetWorkspaceId, 'requestWorkspaceId:', workspaceId);

  if (!pointer || pointer.targetWorkspaceId !== workspaceId) {
    console.log('[branch-copy] 404 — pointer not found or workspace mismatch');
    return NextResponse.json(
      { error: 'الرابط غير موجود' },
      { status: 404 },
    );
  }

  if (pointer.status !== 'active') {
    console.log('[branch-copy] 400 — pointer status is', pointer.status, '(not active)');
    return NextResponse.json(
      { error: 'الرابط غير نشط' },
      { status: 400 },
    );
  }

  // Collection-link pointers are not member-tree branch links and are never
  // surfaced in the incoming-branches list — this member copy/stitch path must
  // refuse them (defense-in-depth; also narrows the nullable anchor below).
  if (pointer.isCollectionLink || pointer.anchorIndividualId == null || pointer.relationship == null) {
    return NextResponse.json({ error: 'الرابط غير موجود' }, { status: 404 });
  }

  // Phase 10b: fetch source tree + source key (to decrypt) AND target key
  // (to re-encrypt before the write). Keys are workspace-scoped so we MUST
  // use the target's when persisting.
  const [sourceTree, sourceKey, targetKey] = await Promise.all([
    getTreeByWorkspaceId(pointer.sourceWorkspaceId),
    getWorkspaceKey(pointer.sourceWorkspaceId),
    getWorkspaceKey(workspaceId),
  ]);
  if (!sourceTree) {
    return NextResponse.json(
      { error: 'شجرة المصدر غير متوفرة' },
      { status: 404 },
    );
  }

  const sourceData = dbTreeToGedcomData(sourceTree, sourceKey);
  const pointedSubtree = extractPointedSubtree(sourceData, {
    rootIndividualId: pointer.rootIndividualId,
    depthLimit: pointer.depthLimit,
    includeGrafts: pointer.includeGrafts,
  });

  const targetTree = await getOrCreateTree(workspaceId);

  // Mirror the live-merge reuse: a child/parent copy attaches into the anchor's
  // existing real family (both parents) when unambiguous — so the frozen copy
  // matches what the GET-tree merge showed.
  const relationship = pointer.relationship as 'child' | 'sibling' | 'spouse' | 'parent';
  const targetData = dbTreeToGedcomData(targetTree, targetKey);
  const pointedRootSex = pointedSubtree.individuals[pointer.rootIndividualId]?.sex ?? 'M';
  const anchorReuse = computeAnchorReuse(
    targetData,
    pointer.anchorIndividualId,
    relationship,
    pointedRootSex,
  );

  const copyResult = prepareDeepCopy(pointedSubtree, {
    anchorIndividualId: pointer.anchorIndividualId,
    relationship,
    pointerId: pointer.id,
    anchorReuse,
  });

  await prisma.$transaction(async (tx) => {
    const txPrisma = tx as typeof prisma;

    await persistDeepCopy(txPrisma, targetTree.id, copyResult, targetKey);

    // Mark pointer as broken (deep copy replaces the live link)
    await txPrisma.branchPointer.update({
      where: { id: pointerId },
      data: { status: 'broken' },
    });

    await txPrisma.treeEditLog.create({
      data: {
        treeId: targetTree.id,
        userId: result.user.id,
        action: 'deep_copy',
        entityType: 'branch_pointer',
        entityId: pointerId,
        snapshotBefore: encryptSnapshot(snapshotBranchPointer(pointer), targetKey),
        snapshotAfter: encryptSnapshot(snapshotBranchPointer({ ...pointer, status: 'broken' }), targetKey),
        description: encryptAuditDescription('deep_copy', 'branch_pointer', null, targetKey),
      } as unknown as Parameters<typeof txPrisma.treeEditLog.create>[0]['data'],
    });

  });

  await touchTreeTimestamp(targetTree.id);

  return NextResponse.json({
    data: {
      copiedIndividuals: Object.keys(copyResult.individuals).length,
      copiedFamilies: Object.keys(copyResult.families).length,
      status: 'broken',
    },
  });
}

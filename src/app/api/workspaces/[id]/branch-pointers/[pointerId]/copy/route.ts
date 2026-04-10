import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireWorkspaceAdmin, isErrorResponse } from '@/lib/api/workspace-auth';
import { getTreeByWorkspaceId, getOrCreateTree, touchTreeTimestamp } from '@/lib/tree/queries';
import { dbTreeToGedcomData } from '@/lib/tree/mapper';
import { getWorkspaceKey, encryptSnapshot } from '@/lib/tree/encryption';
import { extractPointedSubtree } from '@/lib/tree/branch-pointer-merge';
import { prepareDeepCopy, persistDeepCopy } from '@/lib/tree/branch-pointer-deep-copy';
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

  const copyResult = prepareDeepCopy(pointedSubtree, {
    anchorIndividualId: pointer.anchorIndividualId,
    relationship: pointer.relationship as 'child' | 'sibling' | 'spouse' | 'parent',
    pointerId: pointer.id,
  });

  const targetTree = await getOrCreateTree(workspaceId);

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

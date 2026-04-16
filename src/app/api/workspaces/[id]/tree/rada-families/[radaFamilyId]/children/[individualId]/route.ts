import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { getOrCreateTree, getTreeRadaFamily, touchTreeTimestamp } from '@/lib/tree/queries';
import { getWorkspaceKey } from '@/lib/tree/encryption';
import { isUndoRequest } from '@/lib/api/undo-header';
import { encryptAuditDescription, JSON_NULL } from '@/lib/tree/audit';

type RouteParams = { params: Promise<{ id: string; radaFamilyId: string; individualId: string }> };

// DELETE /api/workspaces/[id]/tree/rada-families/[radaFamilyId]/children/[individualId] — Remove a child from a rada'a family
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, radaFamilyId, individualId } = await params;

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  // Feature flag check
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { enableRadaa: true },
  });
  if (!workspace?.enableRadaa) {
    return NextResponse.json(
      { error: 'ميزة الرضاعة غير مفعّلة في هذه المساحة' },
      { status: 400 },
    );
  }

  const tree = await getOrCreateTree(workspaceId);
  const workspaceKey = await getWorkspaceKey(workspaceId);
  const radaFamily = await getTreeRadaFamily(tree.id, radaFamilyId);
  if (!radaFamily) {
    return NextResponse.json(
      { error: 'عائلة الرضاعة غير موجودة في هذه الشجرة' },
      { status: 404 },
    );
  }

  const childLink = await prisma.radaFamilyChild.findUnique({
    where: {
      radaFamilyId_individualId: {
        radaFamilyId,
        individualId,
      },
    },
  });

  if (!childLink) {
    return NextResponse.json(
      { error: 'الطفل غير موجود في عائلة الرضاعة هذه' },
      { status: 404 },
    );
  }

  await prisma.radaFamilyChild.delete({
    where: {
      radaFamilyId_individualId: {
        radaFamilyId,
        individualId,
      },
    },
  });

  // If no children remain, delete the entire rada'a family
  const remainingChildren = await prisma.radaFamilyChild.count({
    where: { radaFamilyId },
  });

  if (remainingChildren === 0) {
    await prisma.radaFamily.delete({
      where: { id: radaFamilyId },
    });
  }

  await Promise.all([
    prisma.treeEditLog.create({
      data: {
        treeId: tree.id,
        userId: result.user.id,
        action: 'delete',
        entityType: 'rada_family_child',
        entityId: radaFamilyId,
        snapshotBefore: { radaFamilyId, individualId },
        snapshotAfter: JSON_NULL,
        description: encryptAuditDescription('delete', 'rada_family_child', null, workspaceKey, { isUndo: isUndoRequest(request) }),
      } as unknown as Parameters<typeof prisma.treeEditLog.create>[0]['data'],
    }),
    touchTreeTimestamp(tree.id),
  ]);

  return new NextResponse(null, { status: 204 });
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { resolveTargetTreeOr404, getTreeFamily, touchTreeTimestamp } from '@/lib/tree/queries';
import { getWorkspaceKey } from '@/lib/tree/encryption';
import { parseTreeIdFromBody } from '@/lib/api/route-helpers';
import { isUndoRequest } from '@/lib/api/undo-header';
import { encryptAuditDescription, JSON_NULL } from '@/lib/tree/audit';
import { isSyntheticFamilyId } from '@/lib/tree/branch-pointer-guards';

type RouteParams = { params: Promise<{ id: string; familyId: string; individualId: string }> };

// DELETE /api/workspaces/[id]/tree/families/[familyId]/children/[individualId] — Remove a child
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, familyId, individualId } = await params;

  // Synthetic pointer family ids (`ptr-{id}-fam`) are not UUIDs — reject before
  // they reach Prisma (would throw P2007 → empty 500 body on the client).
  if (isSyntheticFamilyId(familyId)) {
    return NextResponse.json(
      { error: 'معرف العائلة غير صالح' },
      { status: 400 },
    );
  }

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  // Optional body carries `treeId` to target a same-workspace extra tree.
  const treeId = await parseTreeIdFromBody(request);

  const tree = await resolveTargetTreeOr404(workspaceId, treeId);
  if (isErrorResponse(tree)) return tree;
  const workspaceKey = await getWorkspaceKey(workspaceId);
  const family = await getTreeFamily(tree.id, familyId);
  if (!family) {
    return NextResponse.json(
      { error: 'العائلة غير موجودة في هذه الشجرة' },
      { status: 404 },
    );
  }

  const childLink = await prisma.familyChild.findUnique({
    where: {
      familyId_individualId: {
        familyId,
        individualId,
      },
    },
  });

  if (!childLink) {
    return NextResponse.json(
      { error: 'الطفل غير موجود في هذه العائلة' },
      { status: 404 },
    );
  }

  await prisma.familyChild.delete({
    where: {
      familyId_individualId: {
        familyId,
        individualId,
      },
    },
  });

  await Promise.all([
    prisma.treeEditLog.create({
      data: {
        treeId: tree.id,
        userId: result.user.id,
        action: 'delete',
        entityType: 'family_child',
        entityId: familyId,
        snapshotBefore: { familyId, individualId },
        snapshotAfter: JSON_NULL,
        description: encryptAuditDescription('delete', 'family_child', null, workspaceKey, { isUndo: isUndoRequest(request) }),
      } as unknown as Parameters<typeof prisma.treeEditLog.create>[0]['data'],
    }),
    touchTreeTimestamp(tree.id),
  ]);

  return new NextResponse(null, { status: 204 });
}

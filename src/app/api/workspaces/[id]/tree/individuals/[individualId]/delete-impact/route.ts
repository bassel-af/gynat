import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { cascadePreviewLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { resolveTargetTreeOr404, getTreeIndividual } from '@/lib/tree/queries';
import { dbTreeToGedcomData } from '@/lib/tree/mapper';
import { getWorkspaceKey } from '@/lib/tree/encryption';
import { computeDeleteImpact, computeVersionHash } from '@/lib/tree/cascade-delete';

type RouteParams = { params: Promise<{ id: string; individualId: string }> };

// GET /api/workspaces/[id]/tree/individuals/[individualId]/delete-impact
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, individualId } = await params;

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = cascadePreviewLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  const targetTreeId = request.nextUrl.searchParams.get('treeId') ?? undefined;
  const tree = await resolveTargetTreeOr404(workspaceId, targetTreeId);
  if (isErrorResponse(tree)) return tree;
  const existing = await getTreeIndividual(tree.id, individualId);
  if (!existing) {
    return NextResponse.json(
      { error: 'الشخص غير موجود في هذه الشجرة' },
      { status: 404 },
    );
  }

  const workspaceKey = await getWorkspaceKey(workspaceId);
  const gedcomData = dbTreeToGedcomData(tree, workspaceKey);
  const impact = computeDeleteImpact(gedcomData, individualId);
  const versionHash = computeVersionHash(tree.lastModifiedAt);

  // All IDs that will be deleted (target + affected)
  const allDeleteIds = [individualId, ...impact.affectedIds];

  // Count ALL branch pointers affected (any status — broken/revoked still hold FK refs)
  const branchPointerCount = await prisma.branchPointer.count({
    where: {
      OR: [
        { rootIndividualId: { in: allDeleteIds } },
        { selectedIndividualId: { in: allDeleteIds } },
        { anchorIndividualId: { in: allDeleteIds } },
      ],
    },
  });

  return NextResponse.json({
    data: {
      hasImpact: impact.hasImpact,
      affectedCount: impact.affectedIds.size,
      affectedNames: impact.affectedNames,
      truncated: impact.truncated,
      branchPointerCount,
      versionHash,
    },
  });
}

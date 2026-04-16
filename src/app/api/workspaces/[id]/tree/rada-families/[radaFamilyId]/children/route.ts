import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { getOrCreateTree, getTreeIndividual, getTreeRadaFamily, touchTreeTimestamp } from '@/lib/tree/queries';
import { getWorkspaceKey } from '@/lib/tree/encryption';
import { z } from 'zod';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';
import { isUndoRequest } from '@/lib/api/undo-header';
import { encryptAuditDescription, JSON_NULL } from '@/lib/tree/audit';

type RouteParams = { params: Promise<{ id: string; radaFamilyId: string }> };

const addRadaChildSchema = z.object({
  individualId: z.string().uuid(),
});

// POST /api/workspaces/[id]/tree/rada-families/[radaFamilyId]/children — Add a child to a rada'a family
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, radaFamilyId } = await params;

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

  const parsed = await parseValidatedBody(request, addRadaChildSchema);
  if (isParseError(parsed)) return parsed;

  const tree = await getOrCreateTree(workspaceId);
  const workspaceKey = await getWorkspaceKey(workspaceId);
  const radaFamily = await getTreeRadaFamily(tree.id, radaFamilyId);
  if (!radaFamily) {
    return NextResponse.json(
      { error: 'عائلة الرضاعة غير موجودة في هذه الشجرة' },
      { status: 404 },
    );
  }

  const individual = await getTreeIndividual(tree.id, parsed.data.individualId);
  if (!individual) {
    return NextResponse.json(
      { error: 'الشخص غير موجود في هذه الشجرة' },
      { status: 400 },
    );
  }

  // Check for duplicate
  const existing = await prisma.radaFamilyChild.findUnique({
    where: {
      radaFamilyId_individualId: {
        radaFamilyId,
        individualId: parsed.data.individualId,
      },
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: 'هذا الشخص مسجل كابن/ابنة رضاعة في هذه العائلة بالفعل' },
      { status: 409 },
    );
  }

  const radaFamilyChild = await prisma.radaFamilyChild.create({
    data: {
      radaFamilyId,
      individualId: parsed.data.individualId,
    },
  });

  await Promise.all([
    prisma.treeEditLog.create({
      data: {
        treeId: tree.id,
        userId: result.user.id,
        action: 'create',
        entityType: 'rada_family_child',
        entityId: radaFamilyId,
        snapshotBefore: JSON_NULL,
        snapshotAfter: { radaFamilyId, individualId: parsed.data.individualId },
        description: encryptAuditDescription('create', 'rada_family_child', null, workspaceKey, { isUndo: isUndoRequest(request) }),
      } as unknown as Parameters<typeof prisma.treeEditLog.create>[0]['data'],
    }),
    touchTreeTimestamp(tree.id),
  ]);

  return NextResponse.json({ data: radaFamilyChild }, { status: 201 });
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { getOrCreateTree, getTreeFamily, getTreeIndividual, touchTreeTimestamp } from '@/lib/tree/queries';
import { z } from 'zod';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';

type RouteParams = { params: Promise<{ id: string; familyId: string }> };

const addChildSchema = z.object({
  individualId: z.string().uuid(),
});

// POST /api/workspaces/[id]/tree/families/[familyId]/children — Add a child to a family
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, familyId } = await params;

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  const parsed = await parseValidatedBody(request, addChildSchema);
  if (isParseError(parsed)) return parsed;

  const tree = await getOrCreateTree(workspaceId);
  const family = await getTreeFamily(tree.id, familyId);
  if (!family) {
    return NextResponse.json(
      { error: 'العائلة غير موجودة في هذه الشجرة' },
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
  const existing = await prisma.familyChild.findUnique({
    where: {
      familyId_individualId: {
        familyId,
        individualId: parsed.data.individualId,
      },
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: 'هذا الشخص مسجل كابن/ابنة في هذه العائلة بالفعل' },
      { status: 409 },
    );
  }

  const familyChild = await prisma.familyChild.create({
    data: {
      familyId,
      individualId: parsed.data.individualId,
    },
  });

  await Promise.all([
    prisma.treeEditLog.create({
      data: {
        treeId: tree.id,
        userId: result.user.id,
        action: 'create',
        entityType: 'family_child',
        entityId: familyId,
      },
    }),
    touchTreeTimestamp(tree.id),
  ]);

  return NextResponse.json({ data: familyChild }, { status: 201 });
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { getOrCreateTree, getTreeFamily } from '@/lib/tree/queries';
import { z } from 'zod';

type RouteParams = {
  params: Promise<{ id: string; familyId: string; individualId: string }>;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const moveChildSchema = z.object({
  targetFamilyId: z.string().uuid(),
});

// POST /api/workspaces/[id]/tree/families/[familyId]/children/[individualId]/move
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, familyId, individualId } = await params;

  // 1. Auth
  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  // 2. Rate limit
  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  // 3. Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = moveChildSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const { targetFamilyId } = parsed.data;

  // 4. Validate source familyId is UUID
  if (!UUID_REGEX.test(familyId)) {
    return NextResponse.json(
      { error: 'معرّف العائلة المصدر غير صالح' },
      { status: 400 },
    );
  }

  // 5. Validate individualId is UUID
  if (!UUID_REGEX.test(individualId)) {
    return NextResponse.json(
      { error: 'معرّف الشخص غير صالح' },
      { status: 400 },
    );
  }

  // 6. Verify source != target
  if (familyId === targetFamilyId) {
    return NextResponse.json(
      { error: 'العائلة المصدر والهدف متطابقتان' },
      { status: 400 },
    );
  }

  try {
    // 7. Resolve tree
    const tree = await getOrCreateTree(workspaceId);

    // 8. Verify source family belongs to tree
    const sourceFamily = await getTreeFamily(tree.id, familyId);
    if (!sourceFamily) {
      return NextResponse.json(
        { error: 'العائلة المصدر غير موجودة في هذه الشجرة' },
        { status: 404 },
      );
    }

    // 9. Verify target family belongs to tree
    const targetFamily = await getTreeFamily(tree.id, targetFamilyId);
    if (!targetFamily) {
      return NextResponse.json(
        { error: 'العائلة الهدف غير موجودة في هذه الشجرة' },
        { status: 404 },
      );
    }

    // 10. Verify child exists in source family
    const childInSource = await prisma.familyChild.findUnique({
      where: {
        familyId_individualId: {
          familyId,
          individualId,
        },
      },
    });
    if (!childInSource) {
      return NextResponse.json(
        { error: 'الشخص ليس ابنًا/ابنة في العائلة المصدر' },
        { status: 404 },
      );
    }

    // 11. Verify child does NOT exist in target family
    const childInTarget = await prisma.familyChild.findUnique({
      where: {
        familyId_individualId: {
          familyId: targetFamilyId,
          individualId,
        },
      },
    });
    if (childInTarget) {
      return NextResponse.json(
        { error: 'هذا الشخص مسجل كابن/ابنة في العائلة الهدف بالفعل' },
        { status: 409 },
      );
    }

    // 12. Atomic transaction: delete from source, create in target, audit log
    await prisma.$transaction(async (tx: {
      familyChild: {
        delete: typeof prisma.familyChild.delete;
        create: typeof prisma.familyChild.create;
      };
      treeEditLog: {
        create: typeof prisma.treeEditLog.create;
      };
    }) => {
      await tx.familyChild.delete({
        where: {
          familyId_individualId: {
            familyId,
            individualId,
          },
        },
      });

      await tx.familyChild.create({
        data: {
          familyId: targetFamilyId,
          individualId,
        },
      });

      // 13. Audit log
      await tx.treeEditLog.create({
        data: {
          treeId: tree.id,
          userId: result.user.id,
          action: 'MOVE_CHILD',
          entityType: 'family_child',
          entityId: individualId,
          payload: {
            sourceFamilyId: familyId,
            targetFamilyId,
            individualId,
          },
        },
      });
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    // 14. Generic error handling
    return NextResponse.json(
      { error: 'حدث خطأ غير متوقع' },
      { status: 500 },
    );
  }
}

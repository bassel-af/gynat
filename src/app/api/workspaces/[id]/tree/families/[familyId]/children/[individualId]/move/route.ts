import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { getOrCreateTree, getTreeFamily, touchTreeTimestamp } from '@/lib/tree/queries';
import { z } from 'zod';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';
import { isUndoRequest } from '@/lib/api/undo-header';
import { isSyntheticFamilyId } from '@/lib/tree/branch-pointer-guards';
import { isPointedIndividualInWorkspace } from '@/lib/tree/branch-pointer-queries';
import { encryptAuditDescription, encryptAuditPayload } from '@/lib/tree/audit';
import { getWorkspaceKey } from '@/lib/tree/encryption';

type RouteParams = {
  params: Promise<{ id: string; familyId: string; individualId: string }>;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const moveSubtreeSchema = z.object({
  targetFamilyId: z.string().uuid(),
});

/** Sentinel error for cycle detection inside transactions */
class CycleError extends Error {
  constructor() { super('Cycle detected'); }
}

/** Max BFS depth to prevent runaway on corrupt data */
const MAX_BFS_DEPTH = 50;

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
  const parsed = await parseValidatedBody(request, moveSubtreeSchema);
  if (isParseError(parsed)) return parsed;

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

  // 7. Reject mutations on synthetic pointer families
  if (isSyntheticFamilyId(familyId)) {
    return NextResponse.json(
      { error: 'معرف العائلة غير صالح' },
      { status: 400 },
    );
  }
  if (isSyntheticFamilyId(targetFamilyId)) {
    return NextResponse.json(
      { error: 'معرف العائلة غير صالح' },
      { status: 400 },
    );
  }

  // 8. Reject move of pointed (read-only) individuals
  const isPointed = await isPointedIndividualInWorkspace(individualId, workspaceId);
  if (isPointed) {
    return NextResponse.json(
      { error: 'لا يمكن نقل شخص مرتبط من مساحة أخرى' },
      { status: 403 },
    );
  }

  try {
    // 9. Resolve tree
    const tree = await getOrCreateTree(workspaceId);
    const workspaceKey = await getWorkspaceKey(workspaceId);

    // 10. Verify source family belongs to tree
    const sourceFamily = await getTreeFamily(tree.id, familyId);
    if (!sourceFamily) {
      return NextResponse.json(
        { error: 'العائلة المصدر غير موجودة في هذه الشجرة' },
        { status: 404 },
      );
    }

    // 11. Verify target family belongs to tree
    const targetFamily = await getTreeFamily(tree.id, targetFamilyId);
    if (!targetFamily) {
      return NextResponse.json(
        { error: 'العائلة الهدف غير موجودة في هذه الشجرة' },
        { status: 404 },
      );
    }

    // 12. Verify child exists in source family
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

    // 13. Verify child does NOT exist in target family
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

    // 14. Cycle detection + atomic move inside transaction
    await prisma.$transaction(async (tx) => {
      // Compute descendants of individualId via level-order BFS
      const descendants = new Set<string>();
      let queue = [individualId];
      let depth = 0;

      while (queue.length > 0 && depth < MAX_BFS_DEPTH) {
        const batch = [...queue];
        queue = [];
        const families = await (tx as typeof prisma).family.findMany({
          where: {
            treeId: tree.id,
            OR: [
              { husbandId: { in: batch } },
              { wifeId: { in: batch } },
            ],
          },
          select: { children: { select: { individualId: true } } },
        });
        for (const fam of families) {
          for (const child of fam.children) {
            if (!descendants.has(child.individualId)) {
              descendants.add(child.individualId);
              queue.push(child.individualId);
            }
          }
        }
        depth++;
      }

      // Build full subtree set (person + all descendants)
      const subtreeIds = new Set(descendants);
      subtreeIds.add(individualId);

      // Verify target family's parents are not inside the subtree (cycle prevention)
      if (targetFamily.husbandId && subtreeIds.has(targetFamily.husbandId)) {
        throw new CycleError();
      }
      if (targetFamily.wifeId && subtreeIds.has(targetFamily.wifeId)) {
        throw new CycleError();
      }

      // Atomic move: delete from source, create in target
      await (tx as typeof prisma).familyChild.delete({
        where: {
          familyId_individualId: {
            familyId,
            individualId,
          },
        },
      });

      await (tx as typeof prisma).familyChild.create({
        data: {
          familyId: targetFamilyId,
          individualId,
        },
      });

      // Audit log
      await (tx as typeof prisma).treeEditLog.create({
        data: {
          treeId: tree.id,
          userId: result.user.id,
          action: 'MOVE_SUBTREE',
          entityType: 'family_child',
          entityId: individualId,
          payload: encryptAuditPayload(
            {
              sourceFamilyId: familyId,
              targetFamilyId,
              individualId,
              descendantCount: descendants.size,
            },
            workspaceKey,
          ),
          snapshotBefore: { familyId, individualId },
          snapshotAfter: { familyId: targetFamilyId, individualId },
          description: encryptAuditDescription('MOVE_SUBTREE', 'family_child', null, workspaceKey, { isUndo: isUndoRequest(request) }),
        } as unknown as Parameters<typeof prisma.treeEditLog.create>[0]['data'],
      });
    });

    await touchTreeTimestamp(tree.id);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    if (err instanceof CycleError) {
      return NextResponse.json(
        { error: 'لا يمكن النقل: الوالد الهدف من ذرية هذا الشخص' },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: 'حدث خطأ غير متوقع' },
      { status: 500 },
    );
  }
}

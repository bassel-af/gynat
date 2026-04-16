import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { getOrCreateTree, getTreeIndividual, touchTreeTimestamp } from '@/lib/tree/queries';
import { createRadaFamilySchema } from '@/lib/tree/schemas';
import { detectCircularRadaRef, detectDuplicateChildren } from '@/lib/tree/rada-validators';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';
import { isUndoRequest } from '@/lib/api/undo-header';
import { snapshotRadaFamily, encryptAuditDescription, JSON_NULL } from '@/lib/tree/audit';
import { getWorkspaceKey, encryptRadaFamilyInput, encryptSnapshot } from '@/lib/tree/encryption';

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/workspaces/[id]/tree/rada-families — Create a new rada'a family
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

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

  const parsed = await parseValidatedBody(request, createRadaFamilySchema);
  if (isParseError(parsed)) return parsed;

  const { fosterFatherId, fosterMotherId, childrenIds, notes } = parsed.data;

  // Circular reference check
  if (detectCircularRadaRef(fosterFatherId, fosterMotherId, childrenIds)) {
    return NextResponse.json(
      { error: 'لا يمكن أن يكون المرضع/المرضعة من ضمن الأبناء' },
      { status: 400 },
    );
  }

  // Duplicate children check
  if (detectDuplicateChildren(childrenIds)) {
    return NextResponse.json(
      { error: 'قائمة الأبناء تحتوي على تكرار' },
      { status: 400 },
    );
  }

  const tree = await getOrCreateTree(workspaceId);

  // Verify foster father belongs to this tree and is not female
  if (fosterFatherId) {
    const father = await getTreeIndividual(tree.id, fosterFatherId);
    if (!father) {
      return NextResponse.json(
        { error: 'زوج المرضعة غير موجود في هذه الشجرة' },
        { status: 400 },
      );
    }
    if (father.sex === 'F') {
      return NextResponse.json(
        { error: 'لا يمكن تعيين أنثى في خانة زوج المرضعة' },
        { status: 400 },
      );
    }
  }

  // Verify foster mother belongs to this tree and is not male
  if (fosterMotherId) {
    const mother = await getTreeIndividual(tree.id, fosterMotherId);
    if (!mother) {
      return NextResponse.json(
        { error: 'المرضعة غير موجودة في هذه الشجرة' },
        { status: 400 },
      );
    }
    if (mother.sex === 'M') {
      return NextResponse.json(
        { error: 'لا يمكن تعيين ذكر في خانة المرضعة' },
        { status: 400 },
      );
    }
  }

  // Verify all children belong to this tree
  for (const cId of childrenIds) {
    const child = await getTreeIndividual(tree.id, cId);
    if (!child) {
      return NextResponse.json(
        { error: `الطفل ${cId} غير موجود في هذه الشجرة` },
        { status: 400 },
      );
    }
  }

  // Phase 10b: encrypt the `notes` field before writing.
  const workspaceKey = await getWorkspaceKey(workspaceId);
  const { notes: encryptedNotes } = encryptRadaFamilyInput(
    { notes: notes ?? null },
    workspaceKey,
  );

  const radaFamily = await prisma.radaFamily.create({
    // Cast via unknown — Buffer vs Uint8Array<ArrayBuffer>.
    data: {
      treeId: tree.id,
      fosterFatherId: fosterFatherId ?? null,
      fosterMotherId: fosterMotherId ?? null,
      notes: encryptedNotes ?? null,
      children: {
        create: childrenIds.map((individualId) => ({ individualId })),
      },
    } as unknown as Parameters<typeof prisma.radaFamily.create>[0]['data'],
    include: { children: true },
  });

  await Promise.all([
    prisma.treeEditLog.create({
      data: {
        treeId: tree.id,
        userId: result.user.id,
        action: 'create',
        entityType: 'rada_family',
        entityId: radaFamily.id,
        snapshotBefore: JSON_NULL,
        // Phase 10b: encrypted envelope.
        snapshotAfter: encryptSnapshot(
          snapshotRadaFamily({
            id: radaFamily.id,
            fosterFatherId: radaFamily.fosterFatherId,
            fosterMotherId: radaFamily.fosterMotherId,
            children: radaFamily.children,
            notes: notes ?? null,
          }),
          workspaceKey,
        ),
        description: encryptAuditDescription('create', 'rada_family', null, workspaceKey, { isUndo: isUndoRequest(request) }),
      } as unknown as Parameters<typeof prisma.treeEditLog.create>[0]['data'],
    }),
    touchTreeTimestamp(tree.id),
  ]);

  return NextResponse.json({ data: radaFamily }, { status: 201 });
}

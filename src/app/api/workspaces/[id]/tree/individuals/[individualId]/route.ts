import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { getOrCreateTree, getTreeIndividual } from '@/lib/tree/queries';
import { updateIndividualSchema } from '@/lib/tree/schemas';

type RouteParams = { params: Promise<{ id: string; individualId: string }> };

// PATCH /api/workspaces/[id]/tree/individuals/[individualId] — Update an individual
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, individualId } = await params;

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = updateIndividualSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const tree = await getOrCreateTree(workspaceId);
  const existing = await getTreeIndividual(tree.id, individualId);
  if (!existing) {
    return NextResponse.json(
      { error: 'الشخص غير موجود في هذه الشجرة' },
      { status: 404 },
    );
  }

  const individual = await prisma.individual.update({
    where: { id: individualId },
    data: parsed.data,
  });

  await prisma.treeEditLog.create({
    data: {
      treeId: tree.id,
      userId: result.user.id,
      action: 'update',
      entityType: 'individual',
      entityId: individualId,
      payload: parsed.data,
    },
  });

  return NextResponse.json({ data: individual });
}

// DELETE /api/workspaces/[id]/tree/individuals/[individualId] — Delete an individual
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, individualId } = await params;

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  const tree = await getOrCreateTree(workspaceId);
  const existing = await getTreeIndividual(tree.id, individualId);
  if (!existing) {
    return NextResponse.json(
      { error: 'الشخص غير موجود في هذه الشجرة' },
      { status: 404 },
    );
  }

  // Clean up family references and delete in a single transaction
  await prisma.$transaction(async (tx: {
    familyChild: { deleteMany: typeof prisma.familyChild.deleteMany };
    family: { updateMany: typeof prisma.family.updateMany };
    individual: { delete: typeof prisma.individual.delete };
  }) => {
    await tx.familyChild.deleteMany({
      where: { individualId },
    });
    await tx.family.updateMany({
      where: { husbandId: individualId },
      data: { husbandId: null },
    });
    await tx.family.updateMany({
      where: { wifeId: individualId },
      data: { wifeId: null },
    });
    await tx.individual.delete({
      where: { id: individualId },
    });
  });

  await prisma.treeEditLog.create({
    data: {
      treeId: tree.id,
      userId: result.user.id,
      action: 'delete',
      entityType: 'individual',
      entityId: individualId,
    },
  });

  return new NextResponse(null, { status: 204 });
}

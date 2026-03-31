import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { getOrCreateTree, getTreeIndividual, getTreeRadaFamily, touchTreeTimestamp } from '@/lib/tree/queries';
import { updateRadaFamilySchema } from '@/lib/tree/schemas';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';

type RouteParams = { params: Promise<{ id: string; radaFamilyId: string }> };

// PATCH /api/workspaces/[id]/tree/rada-families/[radaFamilyId] — Update a rada'a family
export async function PATCH(request: NextRequest, { params }: RouteParams) {
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

  const parsed = await parseValidatedBody(request, updateRadaFamilySchema);
  if (isParseError(parsed)) return parsed;

  const tree = await getOrCreateTree(workspaceId);
  const existing = await getTreeRadaFamily(tree.id, radaFamilyId);
  if (!existing) {
    return NextResponse.json(
      { error: 'عائلة الرضاعة غير موجودة في هذه الشجرة' },
      { status: 404 },
    );
  }

  // Verify new foster father if provided
  if (parsed.data.fosterFatherId !== undefined && parsed.data.fosterFatherId !== null) {
    const father = await getTreeIndividual(tree.id, parsed.data.fosterFatherId);
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

  // Verify new foster mother if provided
  if (parsed.data.fosterMotherId !== undefined && parsed.data.fosterMotherId !== null) {
    const mother = await getTreeIndividual(tree.id, parsed.data.fosterMotherId);
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

  const radaFamily = await prisma.radaFamily.update({
    where: { id: radaFamilyId },
    data: parsed.data,
    include: { children: true },
  });

  await Promise.all([
    prisma.treeEditLog.create({
      data: {
        treeId: tree.id,
        userId: result.user.id,
        action: 'update',
        entityType: 'rada_family',
        entityId: radaFamilyId,
        payload: parsed.data,
      },
    }),
    touchTreeTimestamp(tree.id),
  ]);

  return NextResponse.json({ data: radaFamily });
}

// DELETE /api/workspaces/[id]/tree/rada-families/[radaFamilyId] — Delete a rada'a family
export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

  const tree = await getOrCreateTree(workspaceId);
  const existing = await getTreeRadaFamily(tree.id, radaFamilyId);
  if (!existing) {
    return NextResponse.json(
      { error: 'عائلة الرضاعة غير موجودة في هذه الشجرة' },
      { status: 404 },
    );
  }

  // Cascade delete is handled by Prisma (RadaFamilyChild onDelete: Cascade)
  await prisma.radaFamily.delete({
    where: { id: radaFamilyId },
  });

  await Promise.all([
    prisma.treeEditLog.create({
      data: {
        treeId: tree.id,
        userId: result.user.id,
        action: 'delete',
        entityType: 'rada_family',
        entityId: radaFamilyId,
      },
    }),
    touchTreeTimestamp(tree.id),
  ]);

  return new NextResponse(null, { status: 204 });
}

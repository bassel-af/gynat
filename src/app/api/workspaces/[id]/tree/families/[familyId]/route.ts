import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { getOrCreateTree, getTreeFamily, getTreeIndividual } from '@/lib/tree/queries';
import { updateFamilySchema } from '@/lib/tree/schemas';

type RouteParams = { params: Promise<{ id: string; familyId: string }> };

// PATCH /api/workspaces/[id]/tree/families/[familyId] — Update a family
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, familyId } = await params;

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

  const parsed = updateFamilySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const tree = await getOrCreateTree(workspaceId);
  const existing = await getTreeFamily(tree.id, familyId);
  if (!existing) {
    return NextResponse.json(
      { error: 'العائلة غير موجودة في هذه الشجرة' },
      { status: 404 },
    );
  }

  // Verify new husband if provided (not null — null means "remove")
  if (parsed.data.husbandId !== undefined) {
    if (parsed.data.husbandId !== null) {
      // Check if slot is already occupied by a different person
      if (existing.husbandId !== null && existing.husbandId !== parsed.data.husbandId) {
        return NextResponse.json(
          { error: 'هذا الشخص لديه والدان بالفعل' },
          { status: 409 },
        );
      }
      const husband = await getTreeIndividual(tree.id, parsed.data.husbandId);
      if (!husband) {
        return NextResponse.json(
          { error: 'الزوج غير موجود في هذه الشجرة' },
          { status: 400 },
        );
      }
    }
  }

  // Verify new wife if provided (not null — null means "remove")
  if (parsed.data.wifeId !== undefined) {
    if (parsed.data.wifeId !== null) {
      // Check if slot is already occupied by a different person
      if (existing.wifeId !== null && existing.wifeId !== parsed.data.wifeId) {
        return NextResponse.json(
          { error: 'هذا الشخص لديه والدان بالفعل' },
          { status: 409 },
        );
      }
      const wife = await getTreeIndividual(tree.id, parsed.data.wifeId);
      if (!wife) {
        return NextResponse.json(
          { error: 'الزوجة غير موجودة في هذه الشجرة' },
          { status: 400 },
        );
      }
    }
  }

  const family = await prisma.family.update({
    where: { id: familyId },
    data: parsed.data,
    include: { children: true },
  });

  await prisma.treeEditLog.create({
    data: {
      treeId: tree.id,
      userId: result.user.id,
      action: 'update',
      entityType: 'family',
      entityId: familyId,
      payload: parsed.data,
    },
  });

  return NextResponse.json({ data: family });
}

// DELETE /api/workspaces/[id]/tree/families/[familyId] — Delete a family
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, familyId } = await params;

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  const tree = await getOrCreateTree(workspaceId);
  const existing = await getTreeFamily(tree.id, familyId);
  if (!existing) {
    return NextResponse.json(
      { error: 'العائلة غير موجودة في هذه الشجرة' },
      { status: 404 },
    );
  }

  // Delete child associations first
  await prisma.familyChild.deleteMany({
    where: { familyId },
  });

  await prisma.family.delete({
    where: { id: familyId },
  });

  await prisma.treeEditLog.create({
    data: {
      treeId: tree.id,
      userId: result.user.id,
      action: 'delete',
      entityType: 'family',
      entityId: familyId,
    },
  });

  return new NextResponse(null, { status: 204 });
}

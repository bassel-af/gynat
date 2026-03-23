import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { getOrCreateTree, getTreeIndividual } from '@/lib/tree/queries';
import { z } from 'zod';

type RouteParams = { params: Promise<{ id: string; individualId: string }> };

const updateIndividualSchema = z.object({
  givenName: z.string().optional(),
  surname: z.string().optional(),
  fullName: z.string().optional(),
  sex: z.enum(['M', 'F']).optional(),
  birthDate: z.string().optional(),
  birthPlace: z.string().optional(),
  deathDate: z.string().optional(),
  deathPlace: z.string().optional(),
  isPrivate: z.boolean().optional(),
});

// PATCH /api/workspaces/[id]/tree/individuals/[individualId] — Update an individual
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, individualId } = await params;

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

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

  const tree = await getOrCreateTree(workspaceId);
  const existing = await getTreeIndividual(tree.id, individualId);
  if (!existing) {
    return NextResponse.json(
      { error: 'الشخص غير موجود في هذه الشجرة' },
      { status: 404 },
    );
  }

  // Clean up family references before deleting
  await prisma.familyChild.deleteMany({
    where: { individualId },
  });
  await prisma.family.updateMany({
    where: { husbandId: individualId },
    data: { husbandId: null },
  });
  await prisma.family.updateMany({
    where: { wifeId: individualId },
    data: { wifeId: null },
  });

  await prisma.individual.delete({
    where: { id: individualId },
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

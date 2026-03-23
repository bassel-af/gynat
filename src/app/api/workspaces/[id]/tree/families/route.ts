import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { getOrCreateTree, getTreeIndividual } from '@/lib/tree/queries';
import { z } from 'zod';

type RouteParams = { params: Promise<{ id: string }> };

const createFamilySchema = z.object({
  husbandId: z.string().uuid().optional(),
  wifeId: z.string().uuid().optional(),
  childrenIds: z.array(z.string().uuid()).optional(),
});

// POST /api/workspaces/[id]/tree/families — Create a new family
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = createFamilySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const tree = await getOrCreateTree(workspaceId);
  const { husbandId, wifeId, childrenIds } = parsed.data;

  // Verify husband belongs to this tree
  if (husbandId) {
    const husband = await getTreeIndividual(tree.id, husbandId);
    if (!husband) {
      return NextResponse.json(
        { error: 'الزوج غير موجود في هذه الشجرة' },
        { status: 400 },
      );
    }
  }

  // Verify wife belongs to this tree
  if (wifeId) {
    const wife = await getTreeIndividual(tree.id, wifeId);
    if (!wife) {
      return NextResponse.json(
        { error: 'الزوجة غير موجودة في هذه الشجرة' },
        { status: 400 },
      );
    }
  }

  // Verify all children belong to this tree
  if (childrenIds) {
    for (const cId of childrenIds) {
      const child = await getTreeIndividual(tree.id, cId);
      if (!child) {
        return NextResponse.json(
          { error: `الابن/الابنة ${cId} غير موجود في هذه الشجرة` },
          { status: 400 },
        );
      }
    }
  }

  const family = await prisma.family.create({
    data: {
      treeId: tree.id,
      husbandId: husbandId ?? null,
      wifeId: wifeId ?? null,
      children: childrenIds
        ? {
            create: childrenIds.map((individualId) => ({ individualId })),
          }
        : undefined,
    },
    include: { children: true },
  });

  await prisma.treeEditLog.create({
    data: {
      treeId: tree.id,
      userId: result.user.id,
      action: 'create',
      entityType: 'family',
      entityId: family.id,
    },
  });

  return NextResponse.json({ data: family }, { status: 201 });
}

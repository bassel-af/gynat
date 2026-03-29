import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { getOrCreateTree, getTreeIndividual } from '@/lib/tree/queries';
import { createFamilySchema } from '@/lib/tree/schemas';
import { validateFamilyGender } from '@/lib/tree/family-validators';

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/workspaces/[id]/tree/families — Create a new family
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

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

  const parsed = createFamilySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const tree = await getOrCreateTree(workspaceId);
  const { husbandId, wifeId, childrenIds, ...eventFields } = parsed.data;

  // Guard: isUmmWalad requires workspace enableUmmWalad
  if (eventFields.isUmmWalad) {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { enableUmmWalad: true } });
    if (!workspace?.enableUmmWalad) {
      return NextResponse.json(
        { error: 'ميزة أم ولد غير مفعّلة في هذه المساحة' },
        { status: 400 },
      );
    }
  }

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

  // Validate gender consistency for husband/wife roles
  const genderCheck = await validateFamilyGender(husbandId ?? null, wifeId ?? null, tree.id);
  if (!genderCheck.valid) {
    return NextResponse.json({ error: genderCheck.error }, { status: 400 });
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
      ...eventFields,
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

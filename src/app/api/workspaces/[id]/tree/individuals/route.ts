import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { getOrCreateTree } from '@/lib/tree/queries';
import { z } from 'zod';

type RouteParams = { params: Promise<{ id: string }> };

const createIndividualSchema = z.object({
  givenName: z.string().optional(),
  surname: z.string().optional(),
  fullName: z.string().optional(),
  sex: z.enum(['M', 'F']).optional(),
  birthDate: z.string().optional(),
  birthPlace: z.string().optional(),
  deathDate: z.string().optional(),
  deathPlace: z.string().optional(),
  isDeceased: z.boolean().optional(),
  isPrivate: z.boolean().optional().default(false),
}).refine(
  (data) => data.givenName || data.fullName,
  { message: 'يجب تقديم الاسم الأول أو الاسم الكامل' },
);

// POST /api/workspaces/[id]/tree/individuals — Create a new individual
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

  const parsed = createIndividualSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const tree = await getOrCreateTree(workspaceId);
  const { isPrivate, isDeceased, ...fields } = parsed.data;

  const individual = await prisma.individual.create({
    data: {
      treeId: tree.id,
      ...fields,
      isDeceased: isDeceased ?? (fields.deathDate != null),
      isPrivate,
      createdById: result.user.id,
    },
  });

  await prisma.treeEditLog.create({
    data: {
      treeId: tree.id,
      userId: result.user.id,
      action: 'create',
      entityType: 'individual',
      entityId: individual.id,
    },
  });

  return NextResponse.json({ data: individual }, { status: 201 });
}

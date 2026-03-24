import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { getOrCreateTree } from '@/lib/tree/queries';
import { z } from 'zod';

type RouteParams = { params: Promise<{ id: string }> };

const createIndividualSchema = z.object({
  givenName: z.string().max(200).optional(),
  surname: z.string().max(200).optional(),
  fullName: z.string().max(200).optional(),
  sex: z.enum(['M', 'F']).optional(),
  birthDate: z.string().max(50).optional(),
  birthPlace: z.string().max(500).optional(),
  deathDate: z.string().max(50).optional(),
  deathPlace: z.string().max(500).optional(),
  isDeceased: z.boolean().optional(),
  isPrivate: z.boolean().optional().default(false),
  notes: z.string().max(5000).optional(),
}).refine(
  (data) => data.givenName || data.fullName,
  { message: 'يجب تقديم الاسم الأول أو الاسم الكامل' },
);

// POST /api/workspaces/[id]/tree/individuals — Create a new individual
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

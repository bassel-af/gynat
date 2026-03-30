import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { getOrCreateTree, touchTreeTimestamp } from '@/lib/tree/queries';
import { createIndividualSchema } from '@/lib/tree/schemas';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/workspaces/[id]/tree/individuals — Create a new individual
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  const parsed = await parseValidatedBody(request, createIndividualSchema);
  if (isParseError(parsed)) return parsed;

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

  await Promise.all([
    prisma.treeEditLog.create({
      data: {
        treeId: tree.id,
        userId: result.user.id,
        action: 'create',
        entityType: 'individual',
        entityId: individual.id,
      },
    }),
    touchTreeTimestamp(tree.id),
  ]);

  return NextResponse.json({ data: individual }, { status: 201 });
}

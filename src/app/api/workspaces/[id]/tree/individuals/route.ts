import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { resolveTargetTreeOr404, touchTreeTimestamp } from '@/lib/tree/queries';
import { createIndividualSchema } from '@/lib/tree/schemas';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';
import { isUndoRequest } from '@/lib/api/undo-header';
import { getWorkspaceKey, decryptIndividualRow } from '@/lib/tree/encryption';
import { createIndividual } from '@/lib/tree/create-individual';
import { nameFeatureFlags, NAME_FEATURE_SELECT } from '@/lib/tree/feature-strip';
import { writeTreeEditLog } from '@/lib/tree/audit';

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

  // Resolve the target tree (main when treeId absent, else a same-workspace
  // main/extra tree). A foreign/unknown treeId fails closed → 404 before any
  // write. Strip `treeId` so it never reaches the Individual row.
  const { treeId, ...data } = parsed.data;
  const tree = await resolveTargetTreeOr404(workspaceId, treeId);
  if (isErrorResponse(tree)) return tree;

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: NAME_FEATURE_SELECT,
  });
  const workspaceKey = await getWorkspaceKey(workspaceId);

  const { individual, auditEntry } = await createIndividual(prisma, {
    treeId: tree.id,
    userId: result.user.id,
    input: data,
    workspaceKey,
    features: nameFeatureFlags(workspace),
    isUndo: isUndoRequest(request),
  });
  await Promise.all([writeTreeEditLog(prisma, auditEntry), touchTreeTimestamp(tree.id)]);

  // Plaintext DTO — never serialize the ciphertext Bytes columns.
  return NextResponse.json({ data: decryptIndividualRow(individual, workspaceKey) }, { status: 201 });
}

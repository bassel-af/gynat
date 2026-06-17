import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  requireCollectionEditor,
  requireWorkspaceMember,
  requireCollectionsEnabled,
  isErrorResponse,
} from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';
import { createExtraTreeSchema } from '@/lib/collections/schemas';
import { createExtraTree, peopleCountByTree } from '@/lib/collections/queries';

type RouteParams = { params: Promise<{ id: string }> };

/** Hard cap on the number of extra trees a single workspace may hold. */
export const MAX_EXTRA_TREES_PER_WORKSPACE = 50;

// POST /api/workspaces/[id]/extra-trees — Create an extra (collections) tree
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  // Collections off → 404 (deny-by-default; no existence leak). But only after
  // we know the caller is authenticated/authorized would leak less — the gate
  // intentionally runs first per the contract.
  const gate = await requireCollectionsEnabled(workspaceId);
  if (gate) return gate;

  const result = await requireCollectionEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  const parsed = await parseValidatedBody(request, createExtraTreeSchema);
  if (isParseError(parsed)) return parsed;

  // Enforce the per-workspace cap on extra trees.
  const existingCount = await prisma.familyTree.count({
    where: { workspaceId, kind: 'extra' },
  });
  if (existingCount >= MAX_EXTRA_TREES_PER_WORKSPACE) {
    return rateLimitResponse(0);
  }

  const tree = await createExtraTree({ workspaceId, nameAr: parsed.data.nameAr });

  return NextResponse.json(
    {
      data: {
        id: tree.id,
        nameAr: tree.nameAr,
        kind: tree.kind,
        visibility: tree.visibility,
        peopleCount: 0,
      },
    },
    { status: 201 },
  );
}

// GET /api/workspaces/[id]/extra-trees — List extra trees + the main tree
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  const gate = await requireCollectionsEnabled(workspaceId);
  if (gate) return gate;

  const result = await requireWorkspaceMember(request, workspaceId);
  if (isErrorResponse(result)) return result;

  // Both the main tree and the extra trees are listable here.
  const trees = await prisma.familyTree.findMany({
    where: { workspaceId },
    orderBy: { lastModifiedAt: 'desc' },
  });

  const countByTree = await peopleCountByTree(trees.map((t) => t.id));

  const data = trees.map((t) => ({
    id: t.id,
    nameAr: t.nameAr,
    kind: t.kind,
    visibility: t.visibility,
    peopleCount: countByTree.get(t.id) ?? 0,
  }));

  return NextResponse.json({ data });
}

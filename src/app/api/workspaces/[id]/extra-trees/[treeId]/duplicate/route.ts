import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  requireCollectionEditor,
  requireCollectionsEnabled,
  isErrorResponse,
} from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { copyTreeIntoNewExtraTree } from '@/lib/collections/copy';
import { MAX_EXTRA_TREES_PER_WORKSPACE } from '@/lib/collections/extra-tree-cap';

type RouteParams = { params: Promise<{ id: string; treeId: string }> };

// POST /api/workspaces/[id]/extra-trees/[treeId]/duplicate
// Deep-copy any tree in this workspace (main OR extra) into a NEW extra tree —
// a clean, owner-facing "make me a frozen snapshot" action. The copy is named
// «{name} (نسخة)» — a suffix so the new tree sorts next to its source and reads
// obviously as the copy; the main tree carries a null name, so it falls back to
// the workspace name. The copy reuses `copyTreeIntoNewExtraTree`, which
// re-encrypts under the same workspace key and records a `manual_copy`
// CopyProvenance row.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, treeId } = await params;

  const gate = await requireCollectionsEnabled(workspaceId);
  if (gate) return gate;

  const result = await requireCollectionEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  // The source may be the main tree or any extra tree — but it must live here.
  const source = await prisma.familyTree.findFirst({
    where: { id: treeId, workspaceId },
    select: { id: true, kind: true, nameAr: true },
  });
  if (!source) {
    return NextResponse.json({ error: 'غير موجود' }, { status: 404 });
  }

  // The copy is always an extra tree, so enforce the per-workspace extra cap.
  const existingCount = await prisma.familyTree.count({
    where: { workspaceId, kind: 'extra' },
  });
  if (existingCount >= MAX_EXTRA_TREES_PER_WORKSPACE) {
    return rateLimitResponse(0);
  }

  // The main tree has a null name — fall back to the workspace name.
  let baseName = source.nameAr;
  if (!baseName) {
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { nameAr: true },
    });
    baseName = ws?.nameAr ?? 'الشجرة';
  }
  const nameAr = `${baseName} (نسخة)`;

  const { newTreeId, peopleCount } = await copyTreeIntoNewExtraTree({
    workspaceId,
    sourceTreeId: treeId,
    nameAr,
  });

  // A fresh copy is always an extra tree, private, with the name we just set —
  // copyTreeIntoNewExtraTree already knows the people count, so no follow-up reads.
  return NextResponse.json(
    {
      data: {
        id: newTreeId,
        nameAr,
        kind: 'extra',
        visibility: 'private',
        peopleCount,
      },
    },
    { status: 201 },
  );
}

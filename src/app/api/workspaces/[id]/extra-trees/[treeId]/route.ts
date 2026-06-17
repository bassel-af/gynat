import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  requireCollectionEditor,
  requireCollectionsEnabled,
  isErrorResponse,
} from '@/lib/api/workspace-auth';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';
import { createExtraTreeSchema } from '@/lib/collections/schemas';
import { renameExtraTree, deleteExtraTree } from '@/lib/collections/queries';

type RouteParams = { params: Promise<{ id: string; treeId: string }> };

// PATCH /api/workspaces/[id]/extra-trees/[treeId] — Rename an extra tree
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, treeId } = await params;

  const gate = await requireCollectionsEnabled(workspaceId);
  if (gate) return gate;

  const result = await requireCollectionEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const parsed = await parseValidatedBody(request, createExtraTreeSchema);
  if (isParseError(parsed)) return parsed;

  const tree = await renameExtraTree(workspaceId, treeId, parsed.data.nameAr);
  if (!tree) {
    return NextResponse.json({ error: 'غير موجود' }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      id: tree.id,
      nameAr: tree.nameAr,
      kind: tree.kind,
      visibility: tree.visibility,
    },
  });
}

// DELETE /api/workspaces/[id]/extra-trees/[treeId] — Delete an extra tree
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, treeId } = await params;

  const gate = await requireCollectionsEnabled(workspaceId);
  if (gate) return gate;

  const result = await requireCollectionEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  // Look up the tree first so we can refuse deleting the main tree (409) and
  // distinguish "not found" (404) cleanly.
  const tree = await prisma.familyTree.findFirst({
    where: { id: treeId, workspaceId },
    select: { id: true, kind: true },
  });
  if (!tree) {
    return NextResponse.json({ error: 'غير موجود' }, { status: 404 });
  }
  if (tree.kind === 'main') {
    return NextResponse.json(
      { error: 'لا يمكن حذف الشجرة الرئيسية' },
      { status: 409 },
    );
  }

  await deleteExtraTree(workspaceId, treeId);
  return NextResponse.json({ data: { id: treeId } });
}

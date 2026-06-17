import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  requireCollectionEditor,
  requireCollectionsEnabled,
  isErrorResponse,
} from '@/lib/api/workspace-auth';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';
import { updateItemSchema } from '@/lib/collections/schemas';
import { updateItem, removeItem } from '@/lib/collections/queries';

type RouteParams = { params: Promise<{ id: string; collectionId: string; itemId: string }> };

/**
 * Prove the collection lives in THIS workspace before touching its items.
 * Without this, the route authorizes the URL's `[id]` workspace but never
 * checks that `collectionId` belongs to it — a cross-tenant IDOR. Returns a
 * 404 NextResponse when the collection is not in-workspace, else null.
 */
async function requireCollectionInWorkspace(workspaceId: string, collectionId: string) {
  const collection = await prisma.collection.findFirst({
    where: { id: collectionId, workspaceId },
    select: { id: true },
  });
  if (!collection) {
    return NextResponse.json({ error: 'غير موجود' }, { status: 404 });
  }
  return null;
}

// PATCH /api/workspaces/[id]/collections/[collectionId]/items/[itemId]
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, collectionId, itemId } = await params;

  const gate = await requireCollectionsEnabled(workspaceId);
  if (gate) return gate;

  const result = await requireCollectionEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const scope = await requireCollectionInWorkspace(workspaceId, collectionId);
  if (scope) return scope;

  const parsed = await parseValidatedBody(request, updateItemSchema);
  if (isParseError(parsed)) return parsed;

  const item = await updateItem(collectionId, itemId, parsed.data);
  if (!item) {
    return NextResponse.json({ error: 'غير موجود' }, { status: 404 });
  }

  return NextResponse.json({ data: item });
}

// DELETE /api/workspaces/[id]/collections/[collectionId]/items/[itemId]
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, collectionId, itemId } = await params;

  const gate = await requireCollectionsEnabled(workspaceId);
  if (gate) return gate;

  const result = await requireCollectionEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const scope = await requireCollectionInWorkspace(workspaceId, collectionId);
  if (scope) return scope;

  const removed = await removeItem(collectionId, itemId);
  if (!removed) {
    return NextResponse.json({ error: 'غير موجود' }, { status: 404 });
  }

  return NextResponse.json({ data: { id: itemId } });
}

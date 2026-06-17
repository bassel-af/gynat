import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  requireCollectionEditor,
  requireWorkspaceMember,
  requireCollectionsEnabled,
  isErrorResponse,
} from '@/lib/api/workspace-auth';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';
import { updateCollectionSchema } from '@/lib/collections/schemas';
import {
  getCollection,
  updateCollection,
  deleteCollection,
  shapeCollectionItem,
  peopleCountByTree,
  type ShapeItemLookups,
  type ReferencedTree,
  type ReferencedPointer,
  type ReferencedCollection,
  type TreeVisibility,
} from '@/lib/collections/queries';

type RouteParams = { params: Promise<{ id: string; collectionId: string }> };

// GET /api/workspaces/[id]/collections/[collectionId] — Collection + shaped items
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, collectionId } = await params;

  const gate = await requireCollectionsEnabled(workspaceId);
  if (gate) return gate;

  const result = await requireWorkspaceMember(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const collection = await getCollection(workspaceId, collectionId);
  if (!collection) {
    return NextResponse.json({ error: 'غير موجود' }, { status: 404 });
  }

  const items = collection.items; // already ordered by sortOrder asc

  // Collect every referenced id so the live lookups are batched.
  const treeIds = [...new Set(items.map((i) => i.treeId).filter((x): x is string => x != null))];
  const pointerIds = [...new Set(items.map((i) => i.branchPointerId).filter((x): x is string => x != null))];
  const childCollectionIds = [...new Set(items.map((i) => i.childCollectionId).filter((x): x is string => x != null))];

  const lookups = await buildItemLookups(treeIds, pointerIds, childCollectionIds);

  const shaped = items.map((item) =>
    shapeCollectionItem(
      {
        id: item.id,
        kind: item.kind as 'tree' | 'collection',
        titleAr: item.titleAr,
        descriptionAr: item.descriptionAr,
        linkMode: item.linkMode as 'linked' | 'copied' | null,
        treeId: item.treeId,
        branchPointerId: item.branchPointerId,
        childCollectionId: item.childCollectionId,
      },
      lookups,
    ),
  );

  return NextResponse.json({
    collection: {
      id: collection.id,
      titleAr: collection.titleAr,
      descriptionAr: collection.descriptionAr,
      visibility: collection.visibility,
      publicCode: collection.publicSlug,
    },
    items: shaped,
  });
}

/** Build the live tree / pointer / child-collection lookup maps for shaping. */
async function buildItemLookups(
  treeIds: string[],
  pointerIds: string[],
  childCollectionIds: string[],
): Promise<ShapeItemLookups> {
  const trees = new Map<string, ReferencedTree>();
  const pointers = new Map<string, ReferencedPointer>();
  const collections = new Map<string, ReferencedCollection>();

  if (treeIds.length > 0) {
    const treeRows = await prisma.familyTree.findMany({
      where: { id: { in: treeIds } },
      select: { id: true, kind: true, nameAr: true, visibility: true },
    });
    const countByTree = await peopleCountByTree(treeIds);
    for (const t of treeRows) {
      trees.set(t.id, {
        kind: t.kind as 'main' | 'extra',
        nameAr: t.nameAr,
        visibility: t.visibility as TreeVisibility,
        peopleCount: countByTree.get(t.id) ?? 0,
      });
    }
  }

  if (childCollectionIds.length > 0) {
    const childRows = await prisma.collection.findMany({
      where: { id: { in: childCollectionIds } },
      select: { id: true, titleAr: true, visibility: true },
    });
    for (const c of childRows) {
      collections.set(c.id, { titleAr: c.titleAr, visibility: c.visibility as TreeVisibility });
    }
  }

  // Branch-pointer-backed items are Chunk 2; map stays empty in Chunk 1 unless
  // such rows already exist. Left intentionally unpopulated here.
  void pointerIds;
  void pointers;

  return { trees, pointers, collections };
}

// PATCH /api/workspaces/[id]/collections/[collectionId] — Re-title / re-describe
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, collectionId } = await params;

  const gate = await requireCollectionsEnabled(workspaceId);
  if (gate) return gate;

  const result = await requireCollectionEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const parsed = await parseValidatedBody(request, updateCollectionSchema);
  if (isParseError(parsed)) return parsed;

  const collection = await updateCollection(workspaceId, collectionId, parsed.data);
  if (!collection) {
    return NextResponse.json({ error: 'غير موجود' }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      id: collection.id,
      titleAr: collection.titleAr,
      descriptionAr: collection.descriptionAr,
      visibility: collection.visibility,
      publicCode: collection.publicSlug,
    },
  });
}

// DELETE /api/workspaces/[id]/collections/[collectionId] — Delete collection
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, collectionId } = await params;

  const gate = await requireCollectionsEnabled(workspaceId);
  if (gate) return gate;

  const result = await requireCollectionEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const deleted = await deleteCollection(workspaceId, collectionId);
  if (!deleted) {
    return NextResponse.json({ error: 'غير موجود' }, { status: 404 });
  }

  return NextResponse.json({ data: { id: collectionId } });
}

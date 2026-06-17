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
import { createCollectionSchema } from '@/lib/collections/schemas';
import { createCollection, filterTopLevelCollections } from '@/lib/collections/queries';

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/workspaces/[id]/collections — Create a (private) collection
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  const gate = await requireCollectionsEnabled(workspaceId);
  if (gate) return gate;

  const result = await requireCollectionEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  const parsed = await parseValidatedBody(request, createCollectionSchema);
  if (isParseError(parsed)) return parsed;

  const collection = await createCollection({
    workspaceId,
    titleAr: parsed.data.titleAr,
    descriptionAr: parsed.data.descriptionAr ?? null,
    createdById: result.user.id,
  });

  return NextResponse.json(
    {
      data: {
        id: collection.id,
        titleAr: collection.titleAr,
        descriptionAr: collection.descriptionAr,
        visibility: collection.visibility,
        publicCode: collection.publicSlug,
      },
    },
    { status: 201 },
  );
}

// GET /api/workspaces/[id]/collections?scope=top|all — List collections
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  const gate = await requireCollectionsEnabled(workspaceId);
  if (gate) return gate;

  const result = await requireWorkspaceMember(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const scope = new URL(request.url).searchParams.get('scope') === 'all' ? 'all' : 'top';

  const collections = await prisma.collection.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
  });

  // Pull every nesting reference in this workspace once: it serves both the
  // top-level filter AND the per-collection item count.
  const items = await prisma.collectionItem.findMany({
    where: { collection: { workspaceId } },
    select: { collectionId: true, childCollectionId: true },
  });

  const countByCollection = new Map<string, number>();
  const referenced = new Set<string>();
  for (const it of items) {
    countByCollection.set(it.collectionId, (countByCollection.get(it.collectionId) ?? 0) + 1);
    if (it.childCollectionId) referenced.add(it.childCollectionId);
  }

  const visible =
    scope === 'top'
      ? filterTopLevelCollections(collections, referenced)
      : collections;

  const data = visible.map((c) => ({
    id: c.id,
    titleAr: c.titleAr,
    descriptionAr: c.descriptionAr,
    visibility: c.visibility,
    publicCode: c.publicSlug,
    itemCount: countByCollection.get(c.id) ?? 0,
  }));

  return NextResponse.json({ data });
}

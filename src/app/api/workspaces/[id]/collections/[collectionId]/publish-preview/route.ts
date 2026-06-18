import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireWorkspaceAdmin, isErrorResponse } from '@/lib/api/workspace-auth'
import { requireCollectionsEnabled } from '@/lib/api/workspace-auth'
import { countPublishableTrees } from '@/lib/collections/public-serve'

type RouteParams = { params: Promise<{ id: string; collectionId: string }> }

/**
 * GET /api/workspaces/[id]/collections/[collectionId]/publish-preview —
 * admin-only publish checkpoint for a collection. Behind enableCollections.
 *
 * Returns the collection's DIRECT items split into what WOULD be served vs
 * withheld if published (each classified LIVE, deny-by-default), plus the
 * current visibility + public slug for display. Mirrors the tree publish-preview.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, collectionId } = await params

  const gate = await requireCollectionsEnabled(workspaceId)
  if (gate) return gate

  const auth = await requireWorkspaceAdmin(request, workspaceId)
  if (isErrorResponse(auth)) return auth

  // Scope by workspace (404, no existence leak on a foreign id).
  const collection = await prisma.collection.findFirst({
    where: { id: collectionId, workspaceId },
    select: { id: true, visibility: true, publicSlug: true },
  })
  if (!collection) {
    return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
  }

  const { withheldTrees, publishableCount } = await countPublishableTrees(
    collectionId,
    workspaceId,
  )

  return NextResponse.json({
    data: {
      withheldTrees,
      publishableCount,
      publicSlug: collection.publicSlug,
      currentVisibility: collection.visibility,
    },
  })
}

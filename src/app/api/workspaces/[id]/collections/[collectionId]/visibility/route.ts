import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireWorkspaceAdmin, isErrorResponse } from '@/lib/api/workspace-auth'
import { requireCollectionsEnabled } from '@/lib/api/workspace-auth'
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit'
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers'
import { generateUniqueCollectionSlug } from '@/lib/collections/queries'

type RouteParams = { params: Promise<{ id: string; collectionId: string }> }

/** Collection visibility ladder — the THREE DB values, set directly. */
const collectionVisibilitySchema = z.object({
  visibility: z.enum(['private', 'public_link', 'public_listed']),
})

/**
 * PATCH /api/workspaces/[id]/collections/[collectionId]/visibility — set a
 * collection's public visibility. ADMIN-ONLY (publishing is never delegated to
 * collection_editor), behind enableCollections (404 when off, before auth).
 *
 * Mints an unguessable public slug on first publish; KEEPS the slug across a
 * private round-trip (the public address is stable — owner's decision, §7.11).
 * No collection-link freeze runs here: a collection going private flips no source
 * tree's visibility, so there is nothing to preserve (that path is driven by a
 * TREE going private — see freezeCollectionLinks in tree/going-private.ts).
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, collectionId } = await params

  // Deny-by-default feature gate FIRST (404 when collections are off).
  const gate = await requireCollectionsEnabled(workspaceId)
  if (gate) return gate

  const auth = await requireWorkspaceAdmin(request, workspaceId)
  if (isErrorResponse(auth)) return auth

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(auth.user.id)
  if (!allowed) return rateLimitResponse(retryAfterSeconds)

  const parsed = await parseValidatedBody(request, collectionVisibilitySchema)
  if (isParseError(parsed)) return parsed
  const { visibility } = parsed.data

  // Scope the lookup by workspace so a foreign id is indistinguishable from a
  // missing one (404, no existence leak).
  const collection = await prisma.collection.findFirst({
    where: { id: collectionId, workspaceId },
    select: { id: true, visibility: true, publicSlug: true },
  })
  if (!collection) {
    return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
  }

  const data: Record<string, unknown> = { visibility }
  if (visibility !== 'private') {
    // Going public (or switching public levels): ensure a slug exists; keep the
    // existing one (re-publish / link<->listed never regenerates it).
    if (!collection.publicSlug) {
      data.publicSlug = await generateUniqueCollectionSlug()
      data.publishedAt = new Date()
      data.publishedById = auth.user.id
    }
  }
  // Going private deliberately KEEPS publicSlug (stable address across a
  // round-trip — the serving route denies-by-default on private visibility).

  const updated = await prisma.collection.update({
    where: { id: collection.id },
    data,
    select: { visibility: true, publicSlug: true },
  })

  // NOTE: a collection going private changes NO source tree's visibility, so the
  // collection-link freeze-repoint does NOT run here — it is driven by a TREE
  // going private (see freezeCollectionLinks in tree/going-private.ts), the only
  // event that actually flips a borrowed source's reuse/visibility.

  return NextResponse.json({
    data: { visibility: updated.visibility, publicSlug: updated.publicSlug },
  })
}

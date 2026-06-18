import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireWorkspaceAdmin, isErrorResponse } from '@/lib/api/workspace-auth'
import { requireCollectionsEnabled } from '@/lib/api/workspace-auth'
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit'
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers'
import {
  generateUniqueCollectionSlug,
  promoteOwnTreesToListed,
} from '@/lib/collections/queries'
import { collectionVisibilityPatchSchema } from '@/lib/collections/schemas'
import { getCollectionListingReadinessById } from '@/lib/collections/public-serve'

type RouteParams = { params: Promise<{ id: string; collectionId: string }> }

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

  const parsed = await parseValidatedBody(request, collectionVisibilityPatchSchema)
  if (isParseError(parsed)) return parsed
  const { visibility, promoteOwnTreesToListed: promote } = parsed.data

  // Scope the lookup by workspace so a foreign id is indistinguishable from a
  // missing one (404, no existence leak).
  const collection = await prisma.collection.findFirst({
    where: { id: collectionId, workspaceId },
    select: { id: true, visibility: true, publicSlug: true },
  })
  if (!collection) {
    return NextResponse.json({ error: 'غير موجود' }, { status: 404 })
  }

  // Going public mints an unguessable slug on first publish; the address is
  // STABLE thereafter (kept across a private round-trip, never regenerated).
  // Build the publish fields once, applied by whichever write path runs below.
  const publishFields: Record<string, unknown> = {}
  if (visibility !== 'private' && !collection.publicSlug) {
    publishFields.publicSlug = await generateUniqueCollectionSlug()
    publishFields.publishedAt = new Date()
    publishFields.publishedById = auth.user.id
  }
  // Going private deliberately KEEPS publicSlug (stable address across a
  // round-trip — the serving route denies-by-default on private visibility).

  // -------------------------------------------------------------------------
  // public_listed — the privacy-sensitive case. A collection may be search-
  // listed ONLY when every servable leaf tree is itself public_listed; a
  // link-only family must never be surfaced in search against its owner's
  // choice. We may promote the CALLER's own public_link trees to listed (their
  // own /family page also becomes indexed — the modal warns the owner). We can
  // NEVER touch another workspace's tree, so a still-not-listed BORROWED tree
  // blocks listing: we publish public_link instead and report it.
  //
  // Readiness is computed by COLLECTION ID (the id-keyed admin variant) so a
  // still-private collection with no slug yet evaluates correctly.
  // -------------------------------------------------------------------------
  if (visibility === 'public_listed') {
    const readiness = await getCollectionListingReadinessById(collection.id)
    const ownNotListed = readiness?.notListedOwnTrees ?? []
    const borrowedNotListed = readiness?.notListedBorrowedTrees ?? []

    // A still-not-listed borrowed tree is the owner's to resolve out-of-band
    // (ask the source family, or remove it) — listing is blocked. Publish
    // public_link instead and report what blocked it.
    if (borrowedNotListed.length > 0) {
      const updated = await prisma.collection.update({
        where: { id: collection.id },
        data: { ...publishFields, visibility: 'public_link' },
        select: { visibility: true, publicSlug: true },
      })
      return NextResponse.json({
        data: {
          visibility: updated.visibility,
          publicSlug: updated.publicSlug,
          listedBlocked: true,
          blockingBorrowed: borrowedNotListed,
        },
      })
    }

    // Nothing borrowed blocks. Flip the caller's own public_link leaves to
    // listed (only when opted in) and list the collection — atomically.
    const updated = await prisma.$transaction(async (tx) => {
      if (promote && ownNotListed.length > 0) {
        await promoteOwnTreesToListed(
          ownNotListed.map((t) => t.treeId),
          workspaceId,
          tx,
        )
      }
      return tx.collection.update({
        where: { id: collection.id },
        data: { ...publishFields, visibility: 'public_listed' },
        select: { visibility: true, publicSlug: true },
      })
    })

    return NextResponse.json({
      data: { visibility: updated.visibility, publicSlug: updated.publicSlug },
    })
  }

  // private / public_link — set directly, applying any first-publish slug.
  const updated = await prisma.collection.update({
    where: { id: collection.id },
    data: { ...publishFields, visibility },
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

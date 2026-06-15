import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireWorkspaceAdmin, isErrorResponse } from '@/lib/api/workspace-auth'
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit'
import { getOrCreateTree, touchTreeTimestamp } from '@/lib/tree/queries'
import { getWorkspaceKey } from '@/lib/tree/encryption'
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers'
import { visibilityPatchSchema } from '@/lib/tree/publish-schemas'
import {
  mapUiLevelToVisibility,
  validateConfirmationPhrase,
} from '@/lib/tree/publish'
import { generatePublicSlug } from '@/lib/tree/public-slug'
import { JSON_NULL, encryptAuditDescription } from '@/lib/tree/audit'
import { freezeDependentPointers } from '@/lib/tree/going-private'

type RouteParams = { params: Promise<{ id: string }> }

/**
 * PATCH /api/workspaces/[id]/tree/visibility — set the main tree's public
 * visibility level. Admin-only. Going public requires the typed confirmation
 * phrase (validated server-side) and generates the auto public slug. Every
 * change is audited.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params

  const auth = await requireWorkspaceAdmin(request, workspaceId)
  if (isErrorResponse(auth)) return auth

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(auth.user.id)
  if (!allowed) return rateLimitResponse(retryAfterSeconds)

  const parsed = await parseValidatedBody(request, visibilityPatchSchema)
  if (isParseError(parsed)) return parsed
  const { level, confirmationPhrase, allowReuse } = parsed.data

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { nameAr: true },
  })
  if (!workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }

  const tree = await getOrCreateTree(workspaceId)
  const targetVisibility = mapUiLevelToVisibility(level)
  const previousVisibility = tree.visibility
  const familyName = tree.nameAr || workspace.nameAr

  const goingPublic =
    targetVisibility !== 'private' && previousVisibility === 'private'
  const goingPrivate =
    targetVisibility === 'private' && previousVisibility !== 'private'

  // Going public (private → public_*): require the typed confirmation phrase
  // (PRD §1.3, §7.2) — something the admin recognizes (family name / chosen
  // title), independent of the link. `goingPublic` already implies non-private.
  // (The living-set is recomputed at the preview endpoint; the gate here is the
  // typed phrase.) public↔public switches skip this entirely.
  if (goingPublic) {
    if (!validateConfirmationPhrase(confirmationPhrase ?? '', familyName)) {
      return NextResponse.json(
        { error: 'عبارة التأكيد غير صحيحة' },
        { status: 400 },
      )
    }
  }

  // Build the update.
  const data: Record<string, unknown> = { visibility: targetVisibility }
  if (allowReuse !== undefined) data.allowReuse = allowReuse

  if (targetVisibility === 'private') {
    // Going private: setting visibility=private is the serving gate (the public
    // route denies-by-default 404 on private). We deliberately KEEP publicSlug
    // and the publish stamps so the public address is stable across a private
    // round-trip — re-publishing reuses the same slug (owner's decision, §7.11).
    // The dependent auto-copy + provenance (PRD §1.11) runs separately below.
  } else {
    // Going public (or switching between public levels): ensure a slug exists.
    // Re-publishing keeps the existing slug (guard below); switching link<->listed
    // never regenerates it.
    if (!tree.publicSlug) {
      data.publicSlug = await generateUniquePublicSlug()
    }
    if (!tree.publishedAt) {
      data.publishedAt = new Date()
      data.publishedById = auth.user.id
    }
  }

  const updated = await prisma.familyTree.update({
    where: { id: tree.id },
    data,
    select: { id: true, visibility: true, publicSlug: true, allowReuse: true, publishedAt: true },
  })

  // Going private must not silently break dependent collections (PRD §1.11):
  // freeze every live branch pointer borrowing FROM this tree into a deep copy
  // (with provenance), then mark the pointer broken. Best-effort.
  if (goingPrivate) {
    try {
      await freezeDependentPointers(workspaceId)
    } catch (e) {
      console.error('[visibility] dependent freeze failed', { errorType: (e as Error)?.name })
    }
  }

  // Audit (best-effort — never fail the visibility change on a logging error).
  try {
    const workspaceKey = await getWorkspaceKey(workspaceId)
    const action =
      targetVisibility === 'private'
        ? 'unpublish'
        : goingPublic
          ? 'publish'
          : 'change_visibility'
    await prisma.treeEditLog.create({
      data: {
        treeId: tree.id,
        userId: auth.user.id,
        action,
        entityType: 'tree',
        entityId: tree.id,
        snapshotBefore: JSON_NULL,
        snapshotAfter: JSON_NULL,
        description: encryptAuditDescription(action, 'tree', familyName, workspaceKey),
      } as unknown as Parameters<typeof prisma.treeEditLog.create>[0]['data'],
    })
  } catch (e) {
    console.error('[visibility] audit write failed', { errorType: (e as Error)?.name })
  }

  await touchTreeTimestamp(tree.id)

  return NextResponse.json({
    data: {
      visibility: updated.visibility,
      publicSlug: updated.publicSlug,
      allowReuse: updated.allowReuse,
      publishedAt: updated.publishedAt,
    },
  })
}

/** Generate a public slug and retry on the (rare) unique collision. */
async function generateUniquePublicSlug(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generatePublicSlug()
    const existing = await prisma.familyTree.findUnique({
      where: { publicSlug: candidate },
      select: { id: true },
    })
    if (!existing) return candidate
  }
  // Extremely unlikely after 5 tries; one more random code.
  return generatePublicSlug()
}

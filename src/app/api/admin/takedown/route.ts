import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePlatformOwner } from '@/lib/api/admin-auth'
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers'
import { executeTakedown } from '@/lib/admin/takedown'
import { logAdminAccess } from '@/lib/audit/admin-access'

const takedownSchema = z
  .object({
    sourceRootId: z.string().uuid().optional(),
    sourceWorkspaceId: z.string().uuid().optional(),
  })
  .refine((d) => d.sourceRootId || d.sourceWorkspaceId, {
    message: 'sourceRootId or sourceWorkspaceId is required',
  })

/**
 * POST /api/admin/takedown — platform-owner-only global takedown (PRD §1.11).
 * Removes a subtree everywhere it was copied (walking CopyProvenance), keeping
 * the provenance trail. Every run is admin-audited. Reports never trigger this
 * automatically — it is a deliberate owner action after review.
 */
export async function POST(request: NextRequest) {
  const auth = await requirePlatformOwner(request)
  if (auth instanceof NextResponse) return auth

  const parsed = await parseValidatedBody(request, takedownSchema)
  if (isParseError(parsed)) return parsed

  const result = await executeTakedown({
    sourceRootId: parsed.data.sourceRootId,
    sourceWorkspaceId: parsed.data.sourceWorkspaceId,
  })

  // Audit the takedown (best-effort, never throws).
  await logAdminAccess({
    userId: auth.user.id,
    action: 'global_takedown',
    entityType: 'tree',
    entityId: parsed.data.sourceRootId ?? parsed.data.sourceWorkspaceId ?? null,
    reason: `removed ${result.individualsRemoved} individuals across ${result.treesAffected} trees`,
    ipAddress: request.headers.get('x-forwarded-for'),
    userAgent: request.headers.get('user-agent'),
  })

  return NextResponse.json({ data: result })
}

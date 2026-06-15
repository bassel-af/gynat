import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers'
import { reportSchema } from '@/lib/tree/report-schemas'
import {
  publicReportLimiter,
  rateLimitResponse,
  clientIpKey,
} from '@/lib/api/rate-limit'
import { loadPublicTreeBySlug } from '@/lib/tree/public-serve'

type RouteParams = { params: Promise<{ slug: string }> }

/**
 * POST /api/family/[slug]/report — public, no-account report of a published
 * tree (PRD §1.5, §7.7). Rate-limited per IP. Stores the report by notifying
 * the workspace's admins; an admin reviews and decides whether to unpublish.
 * NEVER auto-takes-down — that requires a deliberate admin action.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { slug } = await params

  const rl = publicReportLimiter.check(clientIpKey(request))
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterSeconds)

  const parsed = await parseValidatedBody(request, reportSchema)
  if (isParseError(parsed)) return parsed

  const record = await loadPublicTreeBySlug(slug)
  // Only public trees can be reported (deny-by-default mirrors the viewer).
  if (!record) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Notify the workspace admins (they own the unpublish action, PRD §1.9).
  const admins = await prisma.workspaceMembership.findMany({
    where: { workspaceId: record.workspaceId, role: 'workspace_admin' },
    select: { userId: true },
  })

  if (admins.length > 0) {
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.userId,
        type: 'public_tree_report',
        payload: {
          publicSlug: record.publicSlug,
          treeId: record.treeId,
          reason: parsed.data.reason,
          reporterContact: parsed.data.reporterContact ?? null,
        },
      })),
    })
  }

  // Always return a neutral success — don't reveal admin count or processing.
  return NextResponse.json({ ok: true }, { status: 201 })
}

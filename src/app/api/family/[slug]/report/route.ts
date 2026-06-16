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
import { sendEmail } from '@/lib/email/transport'
import { buildReportEmail } from '@/lib/email/templates/report'
import { SITE_CONTACT_EMAIL } from '@/lib/site'

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

  const familyName = record.nameAr || record.workspaceNameAr

  // Record the report against the workspace admins (a durable trail, PRD §1.9).
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

  // Email the platform inbox so a human can review and act manually in the
  // backend (PRD §8.2). Best-effort: a mail failure must never fail the report.
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:4000'
    const email = buildReportEmail({
      familyName,
      reason: parsed.data.reason,
      reporterContact: parsed.data.reporterContact ?? null,
      publicUrl: `${siteUrl}/family/${record.publicSlug}`,
      publicSlug: record.publicSlug,
      treeId: record.treeId,
      workspaceId: record.workspaceId,
    })
    await sendEmail({ to: SITE_CONTACT_EMAIL, ...email })
  } catch (error) {
    console.error('Failed to send public-tree report email:', error)
  }

  // Always return a neutral success — don't reveal admin count or processing.
  return NextResponse.json({ ok: true }, { status: 201 })
}

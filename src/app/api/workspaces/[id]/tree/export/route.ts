import { NextRequest, NextResponse } from 'next/server'
import { requireWorkspaceMember, isErrorResponse } from '@/lib/api/workspace-auth'
import { treeExportLimiter, rateLimitResponse } from '@/lib/api/rate-limit'
import { resolveTargetTreeOr404, getTreeByWorkspaceId } from '@/lib/tree/queries'
import { dbTreeToGedcomData, redactPrivateIndividuals } from '@/lib/tree/mapper'
import { getWorkspaceKey } from '@/lib/tree/encryption'
import { getActivePointersForWorkspace } from '@/lib/tree/branch-pointer-queries'
import { extractPointedSubtree, mergePointedSubtree } from '@/lib/tree/branch-pointer-merge'
import { gedcomDataToGedcom } from '@/lib/gedcom/exporter'
import { prisma } from '@/lib/db'
import type { GedcomData } from '@/lib/gedcom/types'
import { z } from 'zod'

type RouteParams = { params: Promise<{ id: string }> }

const versionSchema = z.enum(['5.5.1', '7.0'])

// GET /api/workspaces/[id]/tree/export — Export workspace family tree as GEDCOM file
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params

  const result = await requireWorkspaceMember(request, workspaceId)
  if (isErrorResponse(result)) return result

  // Rate limit
  const { allowed, retryAfterSeconds } = treeExportLimiter.check(result.user.id)
  if (!allowed) return rateLimitResponse(retryAfterSeconds)

  // Load export-permission toggles + slug in a single query.
  // This is the server trust boundary — UI hiding elsewhere is purely UX.
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { slug: true, enableTreeExport: true, allowMemberExport: true },
  })
  if (!workspace || !workspace.enableTreeExport) {
    return NextResponse.json(
      { error: 'تصدير الشجرة غير متاح في هذه المساحة' },
      { status: 403 },
    )
  }
  const isAdmin = result.membership.role === 'workspace_admin'
  if (!isAdmin && !workspace.allowMemberExport) {
    return NextResponse.json(
      { error: 'ليس لديك صلاحية تصدير الشجرة' },
      { status: 403 },
    )
  }

  // Validate version query param
  const versionParam = request.nextUrl.searchParams.get('version') ?? '5.5.1'
  const parsed = versionSchema.safeParse(versionParam)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid version. Must be "5.5.1" or "7.0".' },
      { status: 400 },
    )
  }
  const version = parsed.data

  // Fetch tree data. Optional ?treeId= targets a same-workspace extra (or
  // main) tree; absent → the workspace main tree. A foreign/unknown id fails
  // closed → 404. Branch pointers only anchor to the main tree, so the merge
  // below is gated on the main-tree path.
  const targetTreeId = request.nextUrl.searchParams.get('treeId') ?? undefined
  const tree = await resolveTargetTreeOr404(workspaceId, targetTreeId)
  if (isErrorResponse(tree)) return tree
  const isMainTree = !targetTreeId
  // Phase 10b: unwrap this workspace's data key once and reuse it for the
  // tree and every downstream decrypt call below.
  const workspaceKey = await getWorkspaceKey(workspaceId)
  let gedcomData: GedcomData = dbTreeToGedcomData(tree, workspaceKey)

  // Merge pointed subtrees (so cross-references in native data are consistent)
  const pointers = isMainTree ? await getActivePointersForWorkspace(workspaceId) : []

  const uniqueSourceIds = [...new Set(pointers.map((p) => p.sourceWorkspaceId))]

  // Security (C3): before we decrypt any source workspace's tree, look up
  // each source's `enableTreeExport` flag. A source workspace that has
  // disabled export must not have its pointed subtree serialized into an
  // exported GEDCOM of another workspace. The pointer is still valid for
  // live canvas display — but serializing it out is a distinct capability
  // that must be consented to by the source. Skipping with a `continue`
  // below mirrors the existing "source tree missing" fallback, so the
  // export still succeeds with the caller's native data + any remaining
  // pointers whose source does allow export.
  const sourceWorkspaceFlags = uniqueSourceIds.length
    ? await prisma.workspace.findMany({
        where: { id: { in: uniqueSourceIds } },
        select: { id: true, enableTreeExport: true },
      })
    : []
  const exportAllowedBySource = new Map(
    sourceWorkspaceFlags.map((w) => [w.id, w.enableTreeExport]),
  )
  const allowedSourceIds = uniqueSourceIds.filter((wsId) =>
    exportAllowedBySource.get(wsId) === true,
  )

  const sourceTreeMap = new Map<string, GedcomData>()
  const sourceTreeEntries = await Promise.all(
    allowedSourceIds.map(async (wsId) => {
      const [srcTree, sourceKey] = await Promise.all([
        getTreeByWorkspaceId(wsId),
        getWorkspaceKey(wsId),
      ])
      if (!srcTree) return null
      return [wsId, dbTreeToGedcomData(srcTree, sourceKey)] as const
    }),
  )
  for (const entry of sourceTreeEntries) {
    if (entry) sourceTreeMap.set(entry[0], entry[1])
  }

  for (const pointer of pointers) {
    // Drop pointers whose source has export disabled (C3) — keeps behavior
    // identical to "source tree missing": the pointed subtree is simply
    // absent from the exported GEDCOM.
    if (!exportAllowedBySource.get(pointer.sourceWorkspaceId)) continue
    const sourceData = sourceTreeMap.get(pointer.sourceWorkspaceId)
    if (!sourceData) continue

    const pointedSubtree = extractPointedSubtree(sourceData, {
      rootIndividualId: pointer.rootIndividualId,
      depthLimit: pointer.depthLimit,
      includeGrafts: pointer.includeGrafts,
    })

    gedcomData = mergePointedSubtree(gedcomData, pointedSubtree, {
      pointerId: pointer.id,
      anchorIndividualId: pointer.anchorIndividualId,
      selectedIndividualId: pointer.selectedIndividualId,
      relationship: pointer.relationship,
      sourceWorkspaceId: pointer.sourceWorkspaceId,
      linkChildrenToAnchor: pointer.linkChildrenToAnchor,
    })
  }

  // Redact private individuals
  const safeData = redactPrivateIndividuals(gedcomData)

  // Serialize to GEDCOM (exporter skips _pointed records internally)
  const gedcomText = gedcomDataToGedcom(safeData, version)

  const slug = workspace.slug ?? 'family-tree'

  return new NextResponse(gedcomText, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}.ged"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

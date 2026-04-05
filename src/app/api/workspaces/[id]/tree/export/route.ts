import { NextRequest, NextResponse } from 'next/server'
import { requireWorkspaceMember, isErrorResponse } from '@/lib/api/workspace-auth'
import { treeExportLimiter, rateLimitResponse } from '@/lib/api/rate-limit'
import { getOrCreateTree, getTreeByWorkspaceId } from '@/lib/tree/queries'
import { dbTreeToGedcomData, redactPrivateIndividuals } from '@/lib/tree/mapper'
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

  // Fetch tree data
  const tree = await getOrCreateTree(workspaceId)
  let gedcomData: GedcomData = dbTreeToGedcomData(tree)

  // Merge pointed subtrees (so cross-references in native data are consistent)
  const pointers = await getActivePointersForWorkspace(workspaceId)

  const uniqueSourceIds = [...new Set(pointers.map((p) => p.sourceWorkspaceId))]
  const sourceTreeMap = new Map<string, GedcomData>()
  const sourceTreeEntries = await Promise.all(
    uniqueSourceIds.map(async (wsId) => {
      const srcTree = await getTreeByWorkspaceId(wsId)
      if (!srcTree) return null
      return [wsId, dbTreeToGedcomData(srcTree)] as const
    }),
  )
  for (const entry of sourceTreeEntries) {
    if (entry) sourceTreeMap.set(entry[0], entry[1])
  }

  for (const pointer of pointers) {
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

  // Fetch workspace slug for filename
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { slug: true },
  })
  const slug = workspace?.slug ?? 'family-tree'
  const filename = `${slug}.ged`

  return new NextResponse(gedcomText, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

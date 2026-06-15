import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireWorkspaceAdmin, isErrorResponse } from '@/lib/api/workspace-auth'
import { getOrCreateTreeWithKey } from '@/lib/tree/queries'
import { dbTreeToGedcomData } from '@/lib/tree/mapper'
import { computeLivingForCheckpoint } from '@/lib/tree/public-visibility'
import { getWithheldBorrowedBranches } from '@/lib/tree/public-serve'
import { mapVisibilityToUiLevel } from '@/lib/tree/publish'

type RouteParams = { params: Promise<{ id: string }> }

/**
 * GET /api/workspaces/[id]/tree/publish-preview — admin-only publish checkpoint.
 *
 * Returns the living-people checkpoint (recomputed server-side, never trusting
 * the client) plus the list of borrowed branches that WILL be withheld because
 * their source tree is not public (PRD §1.3, §1.8, §7.2). The confirmation
 * phrase the admin must type is the family name (returned here for display).
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params

  const auth = await requireWorkspaceAdmin(request, workspaceId)
  if (isErrorResponse(auth)) return auth

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { nameAr: true },
  })
  if (!workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }

  const { tree, workspaceKey } = await getOrCreateTreeWithKey(workspaceId)
  const home = dbTreeToGedcomData(tree, workspaceKey)

  // Recompute the living set server-side — the going-public PATCH never trusts
  // a client-supplied list.
  const checkpoint = computeLivingForCheckpoint(home, new Date())
  const withheldBranches = await getWithheldBorrowedBranches(workspaceId)

  const familyName = tree.nameAr || workspace.nameAr

  return NextResponse.json({
    checkpoint,
    withheldBranches,
    confirmationPhrase: familyName,
    currentLevel: mapVisibilityToUiLevel(tree.visibility),
    publicSlug: tree.publicSlug,
    allowReuse: tree.allowReuse,
  })
}

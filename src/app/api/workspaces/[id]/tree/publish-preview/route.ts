import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireWorkspaceAdmin, isErrorResponse } from '@/lib/api/workspace-auth'
import { resolveTargetTreeOr404 } from '@/lib/tree/queries'
import { getWorkspaceKey } from '@/lib/tree/encryption'
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
 *
 * treeId-aware (unified publish flow): no `?treeId` → the workspace MAIN tree;
 * `?treeId=…` → that scoped `extra` tree (same resolver the visibility PATCH
 * uses, so a foreign/unknown id fails closed → 404). For an extra tree the
 * phrase is its OWN name and there are no withheld borrowed branches (extra
 * trees are home-only — borrowing is a main-tree concept).
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

  const treeId = new URL(request.url).searchParams.get('treeId') ?? undefined

  // Resolve the publish target (MAIN when treeId absent, else the scoped extra
  // tree). The resolver fails closed → 404 for a foreign/unknown id.
  const tree = await resolveTargetTreeOr404(workspaceId, treeId)
  if (isErrorResponse(tree)) return tree

  const workspaceKey = await getWorkspaceKey(workspaceId)
  const home = dbTreeToGedcomData(tree, workspaceKey)

  // Recompute the living set server-side — the going-public PATCH never trusts
  // a client-supplied list.
  const checkpoint = computeLivingForCheckpoint(home, new Date())

  // Withheld borrowed branches are a MAIN-tree concept (an extra tree can't
  // borrow), so the workspace-scoped query runs only for the main tree.
  const withheldBranches =
    tree.kind === 'main' ? await getWithheldBorrowedBranches(workspaceId) : []

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

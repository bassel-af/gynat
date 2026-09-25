import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireWorkspaceAdmin, isErrorResponse } from '@/lib/api/workspace-auth';
import { NO_STORE_HEADERS, resolveSourceTreeOr404 } from '@/lib/tree/source-entry-route-helpers';

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/workspaces/[id]/tree/sources/publish-summary?treeId= — admins only.
//
// Feeds the publish flow's «المصادر في الشجرة المنشورة» step:
//   - `pendingIds`: EVERY person entry of the tree not yet at the public level
//     (ids only — nothing decrypted). The list route's `matchedIds` is capped
//     at the bulk limit, so «كلها» needs this uncapped list; the client sends
//     it to `POST sources/bulk` in batches.
//   - `publicCount`: person entries already visible to visitors.
//   - `treeEntry`: the tree-wide entry's id + level (it is excluded from the
//     list and from bulk by design; the step offers it separately).
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  const result = await requireWorkspaceAdmin(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const tree = await resolveSourceTreeOr404(workspaceId, request.nextUrl.searchParams.get('treeId'));
  if (isErrorResponse(tree)) return tree;

  const [rows, treeEntry] = await Promise.all([
    prisma.sourceEntry.findMany({
      where: { treeId: tree.id, individualId: { not: null } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, visibility: true },
    }),
    prisma.sourceEntry.findFirst({
      where: { treeId: tree.id, individualId: null },
      select: { id: true, visibility: true },
    }),
  ]);

  const pendingIds = rows.filter((r) => r.visibility !== 'public').map((r) => r.id);
  const publicCount = rows.length - pendingIds.length;

  return NextResponse.json(
    {
      data: {
        pendingIds,
        publicCount,
        treeEntry: treeEntry ? { id: treeEntry.id, visibility: treeEntry.visibility } : null,
      },
    },
    { headers: NO_STORE_HEADERS },
  );
}

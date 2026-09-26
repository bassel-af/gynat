import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireWorkspaceAdmin, isErrorResponse } from '@/lib/api/workspace-auth';
import { NO_STORE_HEADERS, resolveSourceTreeOr404 } from '@/lib/tree/source-entry-route-helpers';
import { getWorkspaceKey } from '@/lib/tree/encryption';
import { isLinkedPersonShown } from '@/lib/tree/source-link-shown';

interface PublicSourceLinksRow {
  links: {
    individualId: string;
    individual: {
      treeId: string;
      isPrivate: boolean;
      isDeceased: boolean;
      birthDate: Uint8Array | Buffer | null;
    } | null;
  }[];
}

/**
 * Distinct people linked to a level-3 source of this tree whom the published
 * tree shows in full — the SAME rule the form warning uses
 * (`isShownOnPublicTree`, parity-tested against `redactForPublic`). Only the
 * living-status inputs are read; the birth date is decrypted in memory and
 * never leaves this function. Tree-wide and orphan sources add nobody.
 */
async function countPublicPeople(workspaceId: string, treeId: string): Promise<number> {
  const rows = (await prisma.sourceEntry.findMany({
    where: { treeId, isTreeWide: false, visibility: 'public' },
    select: {
      links: {
        select: {
          individualId: true,
          individual: { select: { treeId: true, isPrivate: true, isDeceased: true, birthDate: true } },
        },
      },
    },
  })) as unknown as PublicSourceLinksRow[];

  const candidates = new Map<string, NonNullable<PublicSourceLinksRow['links'][number]['individual']>>();
  for (const row of rows) {
    for (const link of row.links ?? []) {
      // A link's person is always in the source's tree (app-enforced); fail closed if not.
      if (link.individual && link.individual.treeId === treeId) candidates.set(link.individualId, link.individual);
    }
  }
  if (candidates.size === 0) return 0;

  const key = await getWorkspaceKey(workspaceId);
  const now = new Date();
  let shown = 0;
  for (const person of candidates.values()) {
    if (isLinkedPersonShown(person, key, now)) shown += 1;
  }
  return shown;
}

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/workspaces/[id]/tree/sources/publish-summary?treeId= — admins only.
//
// Feeds the publish flow's «المصادر في الشجرة المنشورة» step:
//   - `pendingIds`: EVERY person entry of the tree not yet at the public level
//     (ids only — nothing decrypted). The list route's `matchedIds` is capped
//     at the bulk limit, so «كلها» needs this uncapped list; the client sends
//     it to `POST sources/bulk` in batches.
//   - `publicCount`: person entries already visible to visitors.
//   - `publicPeopleCount`: distinct people those public entries show on in
//     the published tree (counts only — never names or ids).
//   - `treeEntry`: the tree-wide entry's id + level (it is excluded from the
//     list and from bulk by design; the step offers it separately).
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  const result = await requireWorkspaceAdmin(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const tree = await resolveSourceTreeOr404(workspaceId, request.nextUrl.searchParams.get('treeId'));
  if (isErrorResponse(tree)) return tree;

  const [rows, treeEntry, publicPeopleCount] = await Promise.all([
    prisma.sourceEntry.findMany({
      where: { treeId: tree.id, isTreeWide: false },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, visibility: true },
    }),
    prisma.sourceEntry.findFirst({
      where: { treeId: tree.id, isTreeWide: true },
      select: { id: true, visibility: true },
    }),
    countPublicPeople(workspaceId, tree.id),
  ]);

  const pendingIds = rows.filter((r) => r.visibility !== 'public').map((r) => r.id);
  const publicCount = rows.length - pendingIds.length;

  return NextResponse.json(
    {
      data: {
        pendingIds,
        publicCount,
        publicPeopleCount,
        treeEntry: treeEntry ? { id: treeEntry.id, visibility: treeEntry.visibility } : null,
      },
    },
    { headers: NO_STORE_HEADERS },
  );
}

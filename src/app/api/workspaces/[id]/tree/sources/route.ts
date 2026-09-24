import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireWorkspaceAdmin, isErrorResponse } from '@/lib/api/workspace-auth';
import {
  listSourceEntriesQuerySchema,
  MAX_BULK_IDS,
  SOURCE_SCAN_CAP,
} from '@/lib/tree/source-entry-schemas';
import {
  SOURCE_ENTRY_SELECT,
  NO_STORE_HEADERS,
  sourceEntryDto,
  decryptEntryText,
  individualDisplayName,
  resolveSourceTreeOr404,
  type SourceEntryDto,
  type SourceEntryRow,
} from '@/lib/tree/source-entry-route-helpers';
import { getWorkspaceKey, decryptIndividualRow } from '@/lib/tree/encryption';
import { matchesSearch } from '@/lib/utils/search';

type RouteParams = { params: Promise<{ id: string }> };

type ListRow = SourceEntryRow & {
  individual: { givenName: unknown; surname: unknown; fullName: unknown } | null;
  _count: { files: number };
};

interface SourceListItem extends SourceEntryDto {
  /** Null for the tree-wide entry. Admin-only route: private names are fine. */
  personName: string | null;
  fileCount: number;
}

// GET /api/workspaces/[id]/tree/sources?treeId=&q=&visibility=&cursor=&limit=
//
// «المصادر» page backend — admins only. Newest first.
//
// «تحديد الكل»: the response carries `matchedIds` — the ids of EVERY entry the
// current search/filter matched (not just this page), capped at the bulk limit
// (`matchedIdsTruncated` when more matched). The page sends those ids to
// `POST sources/bulk`, which re-scopes them to the tree. Chosen over a
// "bulk by query" endpoint: the bulk action only ever touches explicit ids the
// admin saw counted, and the server never re-runs a search whose result could
// have shifted between the preview and the action.
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  const result = await requireWorkspaceAdmin(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const parsed = listSourceEntriesQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { treeId, q, visibility, cursor = 0, limit } = parsed.data;

  const tree = await resolveSourceTreeOr404(workspaceId, treeId);
  if (isErrorResponse(tree)) return tree;

  const rows = (await prisma.sourceEntry.findMany({
    where: { treeId: tree.id, ...(visibility ? { visibility } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: SOURCE_SCAN_CAP + 1,
    select: {
      ...SOURCE_ENTRY_SELECT,
      individual: { select: { givenName: true, surname: true, fullName: true } },
      _count: { select: { files: true } },
    },
  })) as unknown as ListRow[];

  const scanTruncated = rows.length > SOURCE_SCAN_CAP;
  const key = await getWorkspaceKey(workspaceId);

  const items: SourceListItem[] = [];
  for (const row of rows.slice(0, SOURCE_SCAN_CAP)) {
    const text = decryptEntryText(row, key);
    if (q && q.trim() && !matchesSearch(text ?? '', q)) continue;
    items.push({
      ...sourceEntryDto(row, text),
      personName: row.individual
        ? individualDisplayName(
            decryptIndividualRow(row.individual, key) as unknown as {
              givenName: string | null;
              surname: string | null;
              fullName: string | null;
            },
          )
        : null,
      fileCount: row._count?.files ?? 0,
    });
  }

  const page = items.slice(cursor, cursor + limit);
  const nextCursor = cursor + limit < items.length ? cursor + limit : null;

  return NextResponse.json(
    {
      data: {
        entries: page,
        total: items.length,
        nextCursor,
        matchedIds: items.slice(0, MAX_BULK_IDS).map((i) => i.id),
        matchedIdsTruncated: items.length > MAX_BULK_IDS,
        scanTruncated,
      },
    },
    { headers: NO_STORE_HEADERS },
  );
}

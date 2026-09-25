import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import {
  sourceSuggestionsQuerySchema,
  SOURCE_SCAN_CAP,
  MAX_SOURCE_SUGGESTIONS,
} from '@/lib/tree/source-entry-schemas';
import {
  NO_STORE_HEADERS,
  decryptEntryText,
  viewerFor,
  resolveSourceTreeOr404,
} from '@/lib/tree/source-entry-route-helpers';
import { canViewSourceAnywhere, type SourceVisibilityLevel } from '@/lib/tree/source-visibility';
import {
  SOURCE_LINKS_WITH_NAMES_SELECT,
  linkContexts,
  sourceSummaryDto,
  type NamedLinkRow,
  type SourceSummaryDto,
} from '@/lib/tree/source-links';
import { getWorkspaceKey } from '@/lib/tree/encryption';
import { matchesSearch } from '@/lib/utils/search';

type RouteParams = { params: Promise<{ id: string }> };

type SuggestionRow = {
  id: string;
  visibility: SourceVisibilityLevel;
  text: Uint8Array | Buffer | null;
  isTreeWide: boolean;
  links: NamedLinkRow[];
  _count: { files: number };
};

// GET /api/workspaces/[id]/tree/sources/suggestions?treeId=&q= — tree editors.
//
// «المصدر» typing help: up to 10 SOURCES of the resolved tree (a source can
// only be linked to people of its own tree), most recently touched first,
// matched diacritic-insensitively on their text. Each is a
// `SourceSummaryDto`: every candidate passes the ONE gate for this viewer
// (admins also get sources linked to nobody), and `peopleCount` /
// `firstPersonName` count only the people this viewer may see it on. The
// tree-wide source is never offered (it is never linked to people).
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const parsed = sourceSuggestionsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const q = parsed.data.q ?? '';

  const tree = await resolveSourceTreeOr404(workspaceId, parsed.data.treeId);
  if (isErrorResponse(tree)) return tree;

  const rows = (await prisma.sourceEntry.findMany({
    where: { treeId: tree.id, isTreeWide: false },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: SOURCE_SCAN_CAP,
    select: {
      id: true,
      visibility: true,
      text: true,
      isTreeWide: true,
      links: SOURCE_LINKS_WITH_NAMES_SELECT,
      _count: { select: { files: true } },
    },
  })) as unknown as SuggestionRow[];

  const viewer = viewerFor(result.membership);
  const key = rows.length > 0 ? await getWorkspaceKey(workspaceId) : null;
  const suggestions: SourceSummaryDto[] = [];

  for (const row of rows) {
    if (suggestions.length >= MAX_SOURCE_SUGGESTIONS) break;
    // Gate FIRST, decrypt only what passed.
    if (!canViewSourceAnywhere(row, linkContexts(row.links), viewer)) continue;
    const text = decryptEntryText(row, key!);
    if (!matchesSearch(text ?? '', q)) continue;
    suggestions.push(sourceSummaryDto(row, text, row._count?.files ?? 0, key!, viewer));
  }

  return NextResponse.json({ data: { suggestions } }, { headers: NO_STORE_HEADERS });
}

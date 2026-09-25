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
  SOURCE_LINKS_SELECT,
  decryptEntryText,
  viewerFor,
  linkedPeople,
  type SourceLinkRow,
} from '@/lib/tree/source-entry-route-helpers';
import { canViewSourceAnywhere, type SourceVisibilityLevel } from '@/lib/tree/source-visibility';
import { getWorkspaceKey } from '@/lib/tree/encryption';
import { matchesSearch } from '@/lib/utils/search';

type RouteParams = { params: Promise<{ id: string }> };

type SuggestionRow = {
  visibility: SourceVisibilityLevel;
  text: Uint8Array | Buffer | null;
  isTreeWide: boolean;
  links: SourceLinkRow[];
};

// GET /api/workspaces/[id]/tree/sources/suggestions?q= — tree editors.
//
// «المصدر» typing help: up to 10 distinct texts already used across the
// WORKSPACE's trees (main + extra), most recent first, matched
// diacritic-insensitively. Text only — never the level, person or entry id.
// Every candidate still passes the ONE gate for this viewer, so a non-admin
// editor is never offered the text of an entry hidden from them. `treeId` is
// accepted for symmetry but the scope is the whole workspace.
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

  const rows = (await prisma.sourceEntry.findMany({
    where: { tree: { workspaceId }, text: { not: null } },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: SOURCE_SCAN_CAP,
    select: {
      visibility: true,
      text: true,
      isTreeWide: true,
      links: SOURCE_LINKS_SELECT,
    },
  })) as unknown as SuggestionRow[];

  const viewer = viewerFor(result.membership);
  const key = rows.length > 0 ? await getWorkspaceKey(workspaceId) : null;
  const seen = new Set<string>();
  const suggestions: string[] = [];

  for (const row of rows) {
    if (suggestions.length >= MAX_SOURCE_SUGGESTIONS) break;
    if (!canViewSourceAnywhere(row, linkedPeople(row), viewer)) continue;
    const text = decryptEntryText(row, key!);
    if (!text || seen.has(text) || !matchesSearch(text, q)) continue;
    seen.add(text);
    suggestions.push(text);
  }

  return NextResponse.json({ data: { suggestions } }, { headers: NO_STORE_HEADERS });
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireWorkspaceMember, isErrorResponse } from '@/lib/api/workspace-auth';
import {
  SOURCE_ENTRY_WITH_FILES_SELECT,
  NO_STORE_HEADERS,
  sourceEntryDto,
  decryptEntryText,
  sourceNotFound,
  isUuid,
  viewerFor,
  resolveSourceTreeOr404,
  type SourceEntryRow,
} from '@/lib/tree/source-entry-route-helpers';
import {
  canViewSourceAnywhere,
  filterEntriesForViewer,
  inheritedTreeEntry,
} from '@/lib/tree/source-visibility';
import {
  SOURCE_LINKS_WITH_NAMES_SELECT,
  linkContexts,
  loadHouseholdIds,
  namedPeopleFromLinks,
  pickFamilyHints,
  sourceSummaryDto,
  visibleCount,
  type NamedLinkRow,
  type PersonSourceDto,
  type SourceSummaryDto,
} from '@/lib/tree/source-links';
import { getWorkspaceKey } from '@/lib/tree/encryption';
import { sourceFileDtos } from '@/lib/tree/source-file-helpers';

type RouteParams = { params: Promise<{ id: string; individualId: string }> };

/** «مشترك مع» names per row; `sharedCount` stays the real (visible) total. */
const SHARED_NAMES_CAP = 20;

type Row = Omit<SourceEntryRow, 'links'> & { links: NamedLinkRow[] };

const WITH_NAMES_SELECT = { ...SOURCE_ENTRY_WITH_FILES_SELECT, links: SOURCE_LINKS_WITH_NAMES_SELECT };

// GET /api/workspaces/[id]/tree/individuals/[individualId]/sources?treeId=
//
// Any member. `{ entries, inherited, familyHints? }`. What each viewer sees —
// and whose names and counts — is decided ONLY by source-visibility.ts: a
// person hidden from this viewer never adds a name or a count.
// `familyHints` («مصادر أسرته»): tree editors only, only when this person has
// no visible source; ≤ 2 sources linked to a household member.
// Sources are never in the tree payload, so this route is the one member read
// path: `private, no-store`, no ETag.
//
// (The per-person POST was replaced by `POST sources` with `personIds`.)
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, individualId } = await params;

  const result = await requireWorkspaceMember(request, workspaceId);
  if (isErrorResponse(result)) return result;

  if (!isUuid(individualId)) return sourceNotFound();

  const treeId = request.nextUrl.searchParams.get('treeId');
  const tree = await resolveSourceTreeOr404(workspaceId, treeId);
  if (isErrorResponse(tree)) return tree;

  const person = await prisma.individual.findFirst({
    where: { id: individualId, treeId: tree.id },
    select: { id: true, isPrivate: true },
  });
  if (!person) return sourceNotFound();

  const [ownRows, treeRow] = await Promise.all([
    prisma.sourceEntry.findMany({
      where: { treeId: tree.id, isTreeWide: false, links: { some: { individualId } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: WITH_NAMES_SELECT,
    }) as unknown as Promise<Row[]>,
    prisma.sourceEntry.findFirst({
      where: { treeId: tree.id, isTreeWide: true },
      select: SOURCE_ENTRY_WITH_FILES_SELECT,
    }) as unknown as Promise<SourceEntryRow | null>,
  ]);

  const viewer = viewerFor(result.membership);
  const context = { isPrivate: person.isPrivate };
  // Gate FIRST (per source, on THIS person), decrypt only what passed.
  const visible = filterEntriesForViewer(ownRows, context, viewer);
  const inherited = inheritedTreeEntry(ownRows, treeRow, context, viewer);

  const isEditor =
    result.membership.role === 'workspace_admin' || result.membership.permissions.includes('tree_editor');
  // Hints only where this viewer may see sources on this person at all.
  const wantsHints =
    isEditor && visible.length === 0 && (viewer.kind === 'admin' || person.isPrivate === false);

  const hintRows = wantsHints ? await loadHintRows(tree.id, individualId) : [];
  const needsKey = visible.length > 0 || inherited || hintRows.length > 0;
  const key = needsKey ? await getWorkspaceKey(workspaceId) : null;

  const entries: PersonSourceDto[] = visible.map((row) => {
    const people = namedPeopleFromLinks(row, row.links, key!, viewer, {
      excludeId: individualId,
      limit: SHARED_NAMES_CAP,
    });
    return {
      ...sourceEntryDto(row, decryptEntryText(row, key!), sourceFileDtos(row.files, key!), individualId),
      people,
      sharedCount: visibleCount(row, row.links, viewer, individualId),
    };
  });

  let familyHints: SourceSummaryDto[] | undefined;
  if (wantsHints) {
    const candidates = hintRows
      .filter((row) => canViewSourceAnywhere(row, linkContexts(row.links), viewer))
      .map((row) => ({
        row,
        createdAt: row.createdAt,
        peopleCount: visibleCount(row, row.links, viewer),
        linkedToPerson: row.links.some((l) => l.individualId === individualId),
      }));
    familyHints = pickFamilyHints(candidates).map(({ row }) =>
      sourceSummaryDto(row, decryptEntryText(row, key!), row.files?.length ?? 0, key!, viewer),
    );
  }

  return NextResponse.json(
    {
      data: {
        entries,
        inherited: inherited ? sourceEntryDto(inherited, decryptEntryText(inherited, key!), sourceFileDtos(inherited.files, key!), null) : null,
        ...(familyHints ? { familyHints } : {}),
      },
    },
    { headers: NO_STORE_HEADERS },
  );
}

/** Sources linked to anyone in the person's household (gate applied by the caller). */
async function loadHintRows(treeId: string, individualId: string): Promise<Row[]> {
  const household = await loadHouseholdIds(prisma, treeId, individualId);
  if (household.size === 0) return [];
  return (await prisma.sourceEntry.findMany({
    where: { treeId, isTreeWide: false, links: { some: { individualId: { in: [...household] } } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: WITH_NAMES_SELECT,
  })) as unknown as Row[];
}

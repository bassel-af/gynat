import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireWorkspaceAdmin, requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';
import { isUndoRequest } from '@/lib/api/undo-header';
import {
  createSourceSchema,
  listSourceEntriesQuerySchema,
  MAX_BULK_IDS,
  SOURCE_SCAN_CAP,
} from '@/lib/tree/source-entry-schemas';
import {
  SOURCE_ENTRY_SELECT,
  SOURCE_ENTRY_WITH_FILES_SELECT,
  NO_STORE_HEADERS,
  sourceEntryDto,
  decryptEntryText,
  viewerFor,
  isWorkspaceAdmin,
  adminOnlyVisibility,
  resolveSourceTreeOr404,
  type SourceEntryDto,
  type SourceEntryRow,
} from '@/lib/tree/source-entry-route-helpers';
import {
  SOURCE_LINKS_WITH_NAMES_SELECT,
  INVALID_LINK_TARGETS_MESSAGE,
  namedPeopleFromLinks,
  validateLinkTargets,
  type NamedLinkRow,
} from '@/lib/tree/source-links';
import {
  snapshotSourceEntry,
  encryptAuditDescription,
  encryptAuditPayload,
  writeTreeEditLog,
  JSON_NULL,
} from '@/lib/tree/audit';
import { getWorkspaceKey, encryptSourceEntryInput, encryptSnapshot } from '@/lib/tree/encryption';
import { matchesSearch } from '@/lib/utils/search';
import {
  attachStagedFiles,
  sourceFileDtos,
  sourceFileErrorResponse,
  fileAuditMeta,
} from '@/lib/tree/source-file-helpers';

type RouteParams = { params: Promise<{ id: string }> };

/** Names shown per admin-list row; `peopleCount` stays the real total. */
const LIST_NAMES_CAP = 20;

type ListRow = Omit<SourceEntryRow, 'links'> & { links: NamedLinkRow[] };

interface SourceListItem extends SourceEntryDto {
  /** The first people, real names (admin-only route: private names are fine). */
  people: { id: string; name: string }[];
  peopleCount: number;
  fileCount: number;
  /**
   * Compatibility for today's «المصادر» page until R6 reads `people`: the
   * first person's name, null for a source linked to nobody.
   */
  personName: string | null;
}

// GET /api/workspaces/[id]/tree/sources?treeId=&q=&visibility=&scope=&filter=&cursor=&limit=
//
// «المصادر» page backend — admins only. ONE row per source, newest first.
// Tabs: `filter=shared` (≥ 2 people) / `filter=unlinked` («ليس مصدرًا لأحد»);
// `counts` gives every tab's size for the current search/level, whatever tab
// is open.
//
// «تحديد الكل»: the response carries `matchedIds` — the ids of EVERY source the
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
  const { treeId, q, visibility, scope, filter, cursor = 0, limit } = parsed.data;

  const tree = await resolveSourceTreeOr404(workspaceId, treeId);
  if (isErrorResponse(tree)) return tree;

  const rows = (await prisma.sourceEntry.findMany({
    // Not the tree-wide source: it has its own card and never joins «تحديد الكل».
    where: {
      treeId: tree.id,
      isTreeWide: false,
      ...(visibility ? { visibility } : {}),
      ...(scope === 'pending' ? { AND: [{ visibility: { not: 'public' as const } }] } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: SOURCE_SCAN_CAP + 1,
    select: { ...SOURCE_ENTRY_WITH_FILES_SELECT, links: SOURCE_LINKS_WITH_NAMES_SELECT },
  })) as unknown as ListRow[];

  const scanTruncated = rows.length > SOURCE_SCAN_CAP;
  const key = await getWorkspaceKey(workspaceId);
  const viewer = viewerFor(result.membership);

  const matched: { row: ListRow; text: string | null }[] = [];
  for (const row of rows.slice(0, SOURCE_SCAN_CAP)) {
    const text = decryptEntryText(row, key);
    if (q && q.trim() && !matchesSearch(text ?? '', q)) continue;
    matched.push({ row, text });
  }

  const linkCount = (row: ListRow) => row.links?.length ?? 0;
  const counts = {
    all: matched.length,
    shared: matched.filter((m) => linkCount(m.row) >= 2).length,
    unlinked: matched.filter((m) => linkCount(m.row) === 0).length,
  };
  const inTab = matched.filter((m) =>
    filter === 'shared' ? linkCount(m.row) >= 2 : filter === 'unlinked' ? linkCount(m.row) === 0 : true,
  );

  const page: SourceListItem[] = inTab.slice(cursor, cursor + limit).map(({ row, text }) => {
    const people = namedPeopleFromLinks(row, row.links, key, viewer, { limit: LIST_NAMES_CAP });
    return {
      ...sourceEntryDto(row, text, sourceFileDtos(row.files, key)),
      people,
      peopleCount: linkCount(row),
      fileCount: row.files?.length ?? 0,
      personName: people[0]?.name ?? null,
    };
  });
  const nextCursor = cursor + limit < inTab.length ? cursor + limit : null;

  return NextResponse.json(
    {
      data: {
        entries: page,
        total: inTab.length,
        nextCursor,
        counts,
        matchedIds: inTab.slice(0, MAX_BULK_IDS).map((m) => m.row.id),
        matchedIdsTruncated: inTab.length > MAX_BULK_IDS,
        scanTruncated,
      },
    },
    { headers: NO_STORE_HEADERS },
  );
}

// POST /api/workspaces/[id]/tree/sources
// `{ treeId?, text?, fileIds?, visibility?, personIds (1..500) }`
//
// Tree editors. ONE source «مصدر لـ» every chosen person, in one transaction
// with its staged files. `personIds[0]` is the starting person: the answer's
// `people` / `sharedCount` are the OTHERS this viewer may see. Every person
// must be a person of THIS tree (a borrowed-branch person has no row here);
// a non-admin may not link a private person. Every refusal is the same 400.
// The level defaults to «المشرفون فقط»; any other level needs an admin.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  const parsed = await parseValidatedBody(request, createSourceSchema);
  if (isParseError(parsed)) return parsed;
  const { treeId, text, fileIds } = parsed.data;
  const personIds = [...new Set(parsed.data.personIds)];
  const visibility = parsed.data.visibility ?? 'admins';

  if (visibility !== 'admins' && !isWorkspaceAdmin(result.membership)) {
    return adminOnlyVisibility();
  }

  const tree = await resolveSourceTreeOr404(workspaceId, treeId);
  if (isErrorResponse(tree)) return tree;

  const viewer = viewerFor(result.membership);
  const targets = await validateLinkTargets(prisma, tree.id, personIds, viewer);
  if (!targets.ok) {
    return NextResponse.json({ error: INVALID_LINK_TARGETS_MESSAGE }, { status: 400 });
  }

  const key = await getWorkspaceKey(workspaceId);
  try {
    const { row, files } = await prisma.$transaction(async (tx) => {
      const created = (await tx.sourceEntry.create({
        data: {
          treeId: tree.id,
          isTreeWide: false,
          visibility,
          ...encryptSourceEntryInput({ text }, key),
          createdById: result.user.id,
        } as unknown as Parameters<typeof prisma.sourceEntry.create>[0]['data'],
        select: { id: true },
      })) as { id: string };

      await tx.sourceLink.createMany({
        data: personIds.map((individualId) => ({
          sourceId: created.id,
          individualId,
          treeId: tree.id,
          createdById: result.user.id,
        })),
      });

      const files = await attachStagedFiles(tx, {
        entryId: created.id,
        treeId: tree.id,
        userId: result.user.id,
        fileIds,
      });

      // No touchTreeTimestamp: sources are not part of the tree payload.
      await writeTreeEditLog(tx, {
        treeId: tree.id,
        userId: result.user.id,
        action: 'create',
        entityType: 'source_entry',
        entityId: created.id,
        snapshotBefore: JSON_NULL,
        snapshotAfter: encryptSnapshot(
          snapshotSourceEntry({
            id: created.id,
            visibility,
            text,
            personIds,
            ...(files.length > 0 ? { fileCount: files.length } : {}),
          }),
          key,
        ),
        description: encryptAuditDescription('create', 'source_entry', null, key, {
          isUndo: isUndoRequest(request),
        }),
        ...(files.length > 0
          ? { payload: encryptAuditPayload({ filesAdded: fileAuditMeta(files) }, key) }
          : {}),
      });

      const row = (await tx.sourceEntry.findFirst({
        where: { id: created.id },
        select: { ...SOURCE_ENTRY_SELECT, links: SOURCE_LINKS_WITH_NAMES_SELECT },
      })) as unknown as ListRow;
      return { row, files };
    });

    const starting = personIds[0];
    const people = namedPeopleFromLinks(row, row.links, key, viewer, { excludeId: starting });
    return NextResponse.json(
      {
        data: {
          ...sourceEntryDto(row, text, sourceFileDtos(files, key), starting),
          people,
          sharedCount: people.length,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const response = sourceFileErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  requireWorkspaceMember,
  requireTreeEditor,
  isErrorResponse,
} from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { parseValidatedBody, isParseError } from '@/lib/api/route-helpers';
import { isUndoRequest } from '@/lib/api/undo-header';
import { createSourceEntrySchema } from '@/lib/tree/source-entry-schemas';
import {
  SOURCE_ENTRY_SELECT,
  SOURCE_ENTRY_WITH_FILES_SELECT,
  NO_STORE_HEADERS,
  sourceEntryDto,
  decryptEntryText,
  sourceNotFound,
  isUuid,
  viewerFor,
  isWorkspaceAdmin,
  adminOnlyVisibility,
  resolveSourceTreeOr404,
  type SourceEntryRow,
} from '@/lib/tree/source-entry-route-helpers';
import { filterEntriesForViewer, inheritedTreeEntry } from '@/lib/tree/source-visibility';
import {
  snapshotSourceEntry,
  encryptAuditDescription,
  encryptAuditPayload,
  writeTreeEditLog,
  JSON_NULL,
} from '@/lib/tree/audit';
import { getWorkspaceKey, encryptSourceEntryInput, encryptSnapshot } from '@/lib/tree/encryption';
import {
  attachStagedFiles,
  sourceFileDtos,
  sourceFileErrorResponse,
  fileAuditMeta,
} from '@/lib/tree/source-file-helpers';

type RouteParams = { params: Promise<{ id: string; individualId: string }> };

// GET /api/workspaces/[id]/tree/individuals/[individualId]/sources?treeId=
//
// Any member. What each viewer sees is decided ONLY by source-visibility.ts.
// Sources are never in the tree payload, so this route is the one member
// read path: `private, no-store`, no ETag.
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
      select: SOURCE_ENTRY_WITH_FILES_SELECT,
    }) as unknown as Promise<SourceEntryRow[]>,
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

  const key = visible.length > 0 || inherited ? await getWorkspaceKey(workspaceId) : null;
  const toDto = (row: SourceEntryRow, personId: string | null) =>
    sourceEntryDto(row, decryptEntryText(row, key!), sourceFileDtos(row.files, key!), personId);

  return NextResponse.json(
    {
      data: {
        entries: visible.map((row) => toDto(row, individualId)),
        inherited: inherited ? toDto(inherited, null) : null,
      },
    },
    { headers: NO_STORE_HEADERS },
  );
}

// POST /api/workspaces/[id]/tree/individuals/[individualId]/sources
//
// Tree editors. The level defaults to «المشرفون فقط»; any other level needs a
// workspace admin.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, individualId } = await params;

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  if (!isUuid(individualId)) return sourceNotFound();

  const parsed = await parseValidatedBody(request, createSourceEntrySchema);
  if (isParseError(parsed)) return parsed;
  const { treeId, text, fileIds } = parsed.data;
  const visibility = parsed.data.visibility ?? 'admins';

  if (visibility !== 'admins' && !isWorkspaceAdmin(result.membership)) {
    return adminOnlyVisibility();
  }

  const tree = await resolveSourceTreeOr404(workspaceId, treeId);
  if (isErrorResponse(tree)) return tree;

  const person = await prisma.individual.findFirst({
    where: { id: individualId, treeId: tree.id },
    select: { id: true },
  });
  if (!person) return sourceNotFound();

  const key = await getWorkspaceKey(workspaceId);
  try {
    // One transaction: the entry and its attached files land together, or
    // not at all (a bad file id leaves no text-less, file-less entry behind).
    const { row, files } = await prisma.$transaction(async (tx) => {
      const row = (await tx.sourceEntry.create({
        data: {
          treeId: tree.id,
          isTreeWide: false,
          visibility,
          ...encryptSourceEntryInput({ text }, key),
          createdById: result.user.id,
        } as unknown as Parameters<typeof prisma.sourceEntry.create>[0]['data'],
        select: SOURCE_ENTRY_SELECT,
      })) as unknown as SourceEntryRow;

      // «مصدر لـ»: this one person (same tree, checked above).
      await tx.sourceLink.create({
        data: { sourceId: row.id, individualId, treeId: tree.id, createdById: result.user.id },
      });

      const files = await attachStagedFiles(tx, {
        entryId: row.id,
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
        entityId: row.id,
        snapshotBefore: JSON_NULL,
        snapshotAfter: encryptSnapshot(
          snapshotSourceEntry({
            id: row.id,
            individualId,
            visibility,
            text,
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
      return { row, files };
    });

    return NextResponse.json(
      { data: sourceEntryDto(row, text, sourceFileDtos(files, key), individualId) },
      { status: 201 },
    );
  } catch (error) {
    const response = sourceFileErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

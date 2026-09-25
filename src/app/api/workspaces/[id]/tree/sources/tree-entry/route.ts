import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  requireWorkspaceMember,
  requireWorkspaceAdmin,
  isErrorResponse,
} from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { parseValidatedBody, isParseError, parseTreeIdFromBody } from '@/lib/api/route-helpers';
import { isUndoRequest } from '@/lib/api/undo-header';
import { putTreeEntrySchema } from '@/lib/tree/source-entry-schemas';
import {
  SOURCE_ENTRY_SELECT,
  SOURCE_ENTRY_WITH_FILES_SELECT,
  NO_STORE_HEADERS,
  sourceEntryDto,
  decryptEntryText,
  sourceNotFound,
  viewerFor,
  resolveSourceTreeOr404,
  isUniqueViolation,
  type SourceEntryRow,
} from '@/lib/tree/source-entry-route-helpers';
import { canViewSourceEntry } from '@/lib/tree/source-visibility';
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
  SourceFileRequestError,
  ENTRY_NEEDS_TEXT_OR_FILES_MESSAGE,
} from '@/lib/tree/source-file-helpers';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * The tree-wide source («مصدر الشجرة») — the explicit `isTreeWide` flag, at
 * most one per tree (partial unique index). Never linked to anyone.
 */
async function loadTreeEntry(
  treeId: string,
  db: Pick<typeof prisma, 'sourceEntry'> = prisma,
): Promise<SourceEntryRow | null> {
  return (await db.sourceEntry.findFirst({
    where: { treeId, isTreeWide: true },
    select: SOURCE_ENTRY_WITH_FILES_SELECT,
  })) as unknown as SourceEntryRow | null;
}

// GET /api/workspaces/[id]/tree/sources/tree-entry?treeId= — members; the gate
// runs with person = null.
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  const result = await requireWorkspaceMember(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const tree = await resolveSourceTreeOr404(workspaceId, request.nextUrl.searchParams.get('treeId'));
  if (isErrorResponse(tree)) return tree;

  const row = await loadTreeEntry(tree.id);
  const visible = row && canViewSourceEntry(row, null, viewerFor(result.membership)) ? row : null;
  const key = visible ? await getWorkspaceKey(workspaceId) : null;
  const entry = visible
    ? sourceEntryDto(visible, decryptEntryText(visible, key!), sourceFileDtos(visible.files, key!))
    : null;

  return NextResponse.json({ data: { entry } }, { headers: NO_STORE_HEADERS });
}

// PUT /api/workspaces/[id]/tree/sources/tree-entry — admin only; upsert.
//
// `text` omitted keeps the stored text; `null` / `''` clears it. `fileIds`
// attaches the admin's staged files. The entry must end with text or files.
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  const result = await requireWorkspaceAdmin(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  const parsed = await parseValidatedBody(request, putTreeEntrySchema);
  if (isParseError(parsed)) return parsed;
  const { treeId, visibility, fileIds } = parsed.data;

  const tree = await resolveSourceTreeOr404(workspaceId, treeId);
  if (isErrorResponse(tree)) return tree;

  const key = await getWorkspaceKey(workspaceId);

  // One transaction: create-or-update, attach, check, audit. Two admins
  // racing to CREATE: the partial unique index fails the loser's whole
  // transaction, which then re-runs once and takes the update path.
  const run = () =>
    prisma.$transaction(async (tx) => {
      const existing = await loadTreeEntry(tree.id, tx);
      const beforeText = existing ? decryptEntryText(existing, key) : null;
      const text = parsed.data.text !== undefined ? parsed.data.text : beforeText;
      const data = { visibility, ...encryptSourceEntryInput({ text }, key) };

      const base = existing
        ? existing
        : ((await tx.sourceEntry.create({
            data: {
              treeId: tree.id,
              isTreeWide: true,
              createdById: result.user.id,
              ...data,
            } as unknown as Parameters<typeof prisma.sourceEntry.create>[0]['data'],
            select: SOURCE_ENTRY_SELECT,
          })) as unknown as SourceEntryRow);

      const attached = await attachStagedFiles(tx, {
        entryId: base.id,
        treeId: tree.id,
        userId: result.user.id,
        fileIds,
      });
      const fileCount = await tx.sourceFile.count({ where: { entryId: base.id } });
      if (text === null && fileCount === 0) {
        throw new SourceFileRequestError(ENTRY_NEEDS_TEXT_OR_FILES_MESSAGE, 400);
      }

      const row = (await tx.sourceEntry.update({
        where: { id: base.id },
        data: data as unknown as Parameters<typeof prisma.sourceEntry.update>[0]['data'],
        select: SOURCE_ENTRY_WITH_FILES_SELECT,
      })) as unknown as SourceEntryRow;

      const created = !existing;
      const withFiles = (n: number) => (fileCount > 0 || attached.length > 0 ? { fileCount: n } : {});
      // No touchTreeTimestamp: sources are not part of the tree payload.
      await writeTreeEditLog(tx, {
        treeId: tree.id,
        userId: result.user.id,
        action: created ? 'create' : 'update',
        entityType: 'source_entry',
        entityId: row.id,
        snapshotBefore: existing
          ? encryptSnapshot(
              snapshotSourceEntry({
                ...existing,
                individualId: null,
                text: beforeText,
                ...withFiles(fileCount - attached.length),
              }),
              key,
            )
          : JSON_NULL,
        snapshotAfter: encryptSnapshot(
          snapshotSourceEntry({ id: row.id, individualId: null, visibility, text, ...withFiles(fileCount) }),
          key,
        ),
        description: encryptAuditDescription(created ? 'create' : 'update', 'source_entry', null, key, {
          isUndo: isUndoRequest(request),
        }),
        ...(attached.length > 0
          ? { payload: encryptAuditPayload({ filesAdded: fileAuditMeta(attached) }, key) }
          : {}),
      });
      return { row, text, created };
    });

  try {
    let out;
    try {
      out = await run();
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      out = await run();
    }
    return NextResponse.json(
      { data: sourceEntryDto(out.row, out.text, sourceFileDtos(out.row.files, key)) },
      { status: out.created ? 201 : 200 },
    );
  } catch (error) {
    const response = sourceFileErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

// DELETE /api/workspaces/[id]/tree/sources/tree-entry — admin only; `{ treeId? }`.
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  const result = await requireWorkspaceAdmin(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  const tree = await resolveSourceTreeOr404(workspaceId, await parseTreeIdFromBody(request));
  if (isErrorResponse(tree)) return tree;

  const existing = await loadTreeEntry(tree.id);
  if (!existing) return sourceNotFound();

  const key = await getWorkspaceKey(workspaceId);
  const text = decryptEntryText(existing, key);
  await prisma.sourceEntry.delete({ where: { id: existing.id } });

  await writeTreeEditLog(prisma, {
    treeId: tree.id,
    userId: result.user.id,
    action: 'delete',
    entityType: 'source_entry',
    entityId: existing.id,
    snapshotBefore: encryptSnapshot(snapshotSourceEntry({ ...existing, individualId: null, text }), key),
    snapshotAfter: JSON_NULL,
    description: encryptAuditDescription('delete', 'source_entry', null, key, {
      isUndo: isUndoRequest(request),
    }),
  });

  return new NextResponse(null, { status: 204 });
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { parseValidatedBody, isParseError, parseTreeIdFromBody } from '@/lib/api/route-helpers';
import { isUndoRequest } from '@/lib/api/undo-header';
import { updateSourceEntrySchema } from '@/lib/tree/source-entry-schemas';
import {
  SOURCE_ENTRY_SELECT,
  SOURCE_ENTRY_WITH_FILES_SELECT,
  sourceEntryDto,
  decryptEntryText,
  sourceNotFound,
  isUuid,
  viewerFor,
  isWorkspaceAdmin,
  adminOnlyVisibility,
  resolveSourceTreeOr404,
  linkedPeople,
  primaryIndividualId,
  type SourceEntryRow,
} from '@/lib/tree/source-entry-route-helpers';
import { canViewSourceAnywhere } from '@/lib/tree/source-visibility';
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

type RouteParams = { params: Promise<{ id: string; entryId: string }> };

/**
 * A non-tree-wide source of the resolved tree (with its links), or null.
 * Scoped by `{ id, treeId }` and `isTreeWide: false` — the tree-wide source
 * has its own admin-only route, so reaching it here reads as not found.
 */
async function loadPersonEntry(treeId: string, entryId: string): Promise<SourceEntryRow | null> {
  return (await prisma.sourceEntry.findFirst({
    where: { id: entryId, treeId, isTreeWide: false },
    select: SOURCE_ENTRY_SELECT,
  })) as unknown as SourceEntryRow | null;
}

/** Admin: always; others: at least one linked person they may see it on. */
function visibleTo(entry: SourceEntryRow, membership: { role: string }): boolean {
  return canViewSourceAnywhere(entry, linkedPeople(entry), viewerFor(membership));
}

// PATCH /api/workspaces/[id]/tree/sources/[entryId] — text, level and/or
// attach staged files (`fileIds`).
//
// The editor must be able to SEE the entry (else the same 404 as a missing
// one). Changing the level at all is admin only; re-sending the current level
// is not a change. `text: null` / `''` clears the text, allowed only while the
// entry keeps at least one file.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, entryId } = await params;

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  if (!isUuid(entryId)) return sourceNotFound();

  const parsed = await parseValidatedBody(request, updateSourceEntrySchema);
  if (isParseError(parsed)) return parsed;
  const { treeId, text, visibility, fileIds } = parsed.data;

  const tree = await resolveSourceTreeOr404(workspaceId, treeId);
  if (isErrorResponse(tree)) return tree;

  const existing = await loadPersonEntry(tree.id, entryId);
  if (!existing || !visibleTo(existing, result.membership)) return sourceNotFound();

  const levelChanges = visibility !== undefined && visibility !== existing.visibility;
  if (levelChanges && !isWorkspaceAdmin(result.membership)) return adminOnlyVisibility();

  const key = await getWorkspaceKey(workspaceId);
  const beforeText = decryptEntryText(existing, key);
  const patch: Record<string, unknown> = {};
  if (text !== undefined) Object.assign(patch, encryptSourceEntryInput({ text }, key));
  if (visibility !== undefined) patch.visibility = visibility;

  const afterText = text !== undefined ? text : beforeText;
  const afterLevel = visibility ?? existing.visibility;

  try {
    const row = await prisma.$transaction(async (tx) => {
      const attached = await attachStagedFiles(tx, {
        entryId: existing.id,
        treeId: tree.id,
        userId: result.user.id,
        fileIds,
      });

      const touchesFiles = attached.length > 0 || afterText === null;
      const fileCount = touchesFiles
        ? await tx.sourceFile.count({ where: { entryId: existing.id } })
        : undefined;
      // Never leave an entry with neither text nor files.
      if (afterText === null && fileCount === 0) {
        throw new SourceFileRequestError(ENTRY_NEEDS_TEXT_OR_FILES_MESSAGE, 400);
      }

      const row = (await tx.sourceEntry.update({
        where: { id: existing.id },
        data: patch as unknown as Parameters<typeof prisma.sourceEntry.update>[0]['data'],
        select: SOURCE_ENTRY_WITH_FILES_SELECT,
      })) as unknown as SourceEntryRow;

      const counts =
        fileCount === undefined
          ? { before: {}, after: {} }
          : { before: { fileCount: fileCount - attached.length }, after: { fileCount } };

      // No touchTreeTimestamp: sources are not part of the tree payload.
      await writeTreeEditLog(tx, {
        treeId: tree.id,
        userId: result.user.id,
        action: 'update',
        entityType: 'source_entry',
        entityId: existing.id,
        snapshotBefore: encryptSnapshot(
          snapshotSourceEntry({
            ...existing,
            individualId: primaryIndividualId(existing),
            text: beforeText,
            ...counts.before,
          }),
          key,
        ),
        snapshotAfter: encryptSnapshot(
          snapshotSourceEntry({
            ...existing,
            individualId: primaryIndividualId(existing),
            visibility: afterLevel,
            text: afterText,
            ...counts.after,
          }),
          key,
        ),
        description: encryptAuditDescription('update', 'source_entry', null, key, {
          isUndo: isUndoRequest(request),
        }),
        payload: encryptAuditPayload(
          {
            text,
            visibility,
            ...(attached.length > 0 ? { filesAdded: fileAuditMeta(attached) } : {}),
          },
          key,
        ),
      });
      return row;
    });

    return NextResponse.json({ data: sourceEntryDto(row, afterText, sourceFileDtos(row.files, key)) });
  } catch (error) {
    const response = sourceFileErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

// DELETE /api/workspaces/[id]/tree/sources/[entryId] — optional `{ treeId }`.
//
// Allowed when the editor can see the entry, OR wrote it: a non-admin editor's
// own entry sits at «المشرفون فقط» (the only level they may set), which they
// cannot see — without this, undoing their own create would always fail.
// Deleting reveals nothing they did not already write.
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, entryId } = await params;

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  if (!isUuid(entryId)) return sourceNotFound();

  const treeId = await parseTreeIdFromBody(request);
  const tree = await resolveSourceTreeOr404(workspaceId, treeId);
  if (isErrorResponse(tree)) return tree;

  const existing = await loadPersonEntry(tree.id, entryId);
  if (
    !existing ||
    (!visibleTo(existing, result.membership) && existing.createdById !== result.user.id)
  ) {
    return sourceNotFound();
  }

  const key = await getWorkspaceKey(workspaceId);
  const text = decryptEntryText(existing, key);

  await prisma.sourceEntry.delete({ where: { id: existing.id } });

  await writeTreeEditLog(prisma, {
    treeId: tree.id,
    userId: result.user.id,
    action: 'delete',
    entityType: 'source_entry',
    entityId: existing.id,
    snapshotBefore: encryptSnapshot(
      snapshotSourceEntry({ ...existing, individualId: primaryIndividualId(existing), text }),
      key,
    ),
    snapshotAfter: JSON_NULL,
    description: encryptAuditDescription('delete', 'source_entry', null, key, {
      isUndo: isUndoRequest(request),
    }),
  });

  return new NextResponse(null, { status: 204 });
}

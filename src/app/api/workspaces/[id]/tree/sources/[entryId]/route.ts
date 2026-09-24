import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { parseValidatedBody, isParseError, parseTreeIdFromBody } from '@/lib/api/route-helpers';
import { isUndoRequest } from '@/lib/api/undo-header';
import { updateSourceEntrySchema } from '@/lib/tree/source-entry-schemas';
import {
  SOURCE_ENTRY_SELECT,
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
import { canViewSourceEntry } from '@/lib/tree/source-visibility';
import {
  snapshotSourceEntry,
  encryptAuditDescription,
  encryptAuditPayload,
  writeTreeEditLog,
  JSON_NULL,
} from '@/lib/tree/audit';
import { getWorkspaceKey, encryptSourceEntryInput, encryptSnapshot } from '@/lib/tree/encryption';

type RouteParams = { params: Promise<{ id: string; entryId: string }> };

type EntryWithPerson = SourceEntryRow & { individual: { isPrivate: boolean } | null };

/**
 * A PERSON entry of the resolved tree, or null. Scoped by `{ id, treeId }` and
 * `individualId: not null` — the tree-wide entry has its own admin-only route,
 * so reaching it here reads as not found.
 */
async function loadPersonEntry(treeId: string, entryId: string): Promise<EntryWithPerson | null> {
  return (await prisma.sourceEntry.findFirst({
    where: { id: entryId, treeId, individualId: { not: null } },
    select: { ...SOURCE_ENTRY_SELECT, individual: { select: { isPrivate: true } } },
  })) as EntryWithPerson | null;
}

function visibleTo(entry: EntryWithPerson, membership: { role: string }): boolean {
  return canViewSourceEntry(
    entry,
    { isPrivate: entry.individual?.isPrivate ?? true },
    viewerFor(membership),
  );
}

// PATCH /api/workspaces/[id]/tree/sources/[entryId] — text and/or level.
//
// The editor must be able to SEE the entry (else the same 404 as a missing
// one). Changing the level at all is admin only; re-sending the current level
// is not a change.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, entryId } = await params;

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  if (!isUuid(entryId)) return sourceNotFound();

  const parsed = await parseValidatedBody(request, updateSourceEntrySchema);
  if (isParseError(parsed)) return parsed;
  const { treeId, text, visibility } = parsed.data;

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

  const row = (await prisma.sourceEntry.update({
    where: { id: existing.id },
    data: patch as unknown as Parameters<typeof prisma.sourceEntry.update>[0]['data'],
    select: SOURCE_ENTRY_SELECT,
  })) as SourceEntryRow;

  const afterText = text ?? beforeText;
  const afterLevel = visibility ?? existing.visibility;

  // No touchTreeTimestamp: sources are not part of the tree payload.
  await writeTreeEditLog(prisma, {
    treeId: tree.id,
    userId: result.user.id,
    action: 'update',
    entityType: 'source_entry',
    entityId: existing.id,
    snapshotBefore: encryptSnapshot(
      snapshotSourceEntry({ ...existing, text: beforeText }),
      key,
    ),
    snapshotAfter: encryptSnapshot(
      snapshotSourceEntry({ ...existing, visibility: afterLevel, text: afterText }),
      key,
    ),
    description: encryptAuditDescription('update', 'source_entry', null, key, {
      isUndo: isUndoRequest(request),
    }),
    payload: encryptAuditPayload({ text, visibility }, key),
  });

  return NextResponse.json({ data: sourceEntryDto(row, afterText) });
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
    snapshotBefore: encryptSnapshot(snapshotSourceEntry({ ...existing, text }), key),
    snapshotAfter: JSON_NULL,
    description: encryptAuditDescription('delete', 'source_entry', null, key, {
      isUndo: isUndoRequest(request),
    }),
  });

  return new NextResponse(null, { status: 204 });
}

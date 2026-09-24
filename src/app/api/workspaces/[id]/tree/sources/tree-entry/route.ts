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
import { snapshotSourceEntry, encryptAuditDescription, writeTreeEditLog, JSON_NULL } from '@/lib/tree/audit';
import { getWorkspaceKey, encryptSourceEntryInput, encryptSnapshot } from '@/lib/tree/encryption';

type RouteParams = { params: Promise<{ id: string }> };

/** The tree-wide entry («مصدر الشجرة») — at most one per tree (partial unique index). */
async function loadTreeEntry(treeId: string): Promise<SourceEntryRow | null> {
  return (await prisma.sourceEntry.findFirst({
    where: { treeId, individualId: null },
    select: SOURCE_ENTRY_SELECT,
  })) as SourceEntryRow | null;
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
  const entry = visible
    ? sourceEntryDto(visible, decryptEntryText(visible, await getWorkspaceKey(workspaceId)))
    : null;

  return NextResponse.json({ data: { entry } }, { headers: NO_STORE_HEADERS });
}

// PUT /api/workspaces/[id]/tree/sources/tree-entry — admin only; upsert.
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId } = await params;

  const result = await requireWorkspaceAdmin(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  const parsed = await parseValidatedBody(request, putTreeEntrySchema);
  if (isParseError(parsed)) return parsed;
  const { treeId, text, visibility } = parsed.data;

  const tree = await resolveSourceTreeOr404(workspaceId, treeId);
  if (isErrorResponse(tree)) return tree;

  const key = await getWorkspaceKey(workspaceId);
  const data = { visibility, ...encryptSourceEntryInput({ text }, key) };

  let existing = await loadTreeEntry(tree.id);
  let createdRow: SourceEntryRow | null = null;
  if (!existing) {
    try {
      createdRow = (await prisma.sourceEntry.create({
        data: {
          treeId: tree.id,
          individualId: null,
          createdById: result.user.id,
          ...data,
        } as unknown as Parameters<typeof prisma.sourceEntry.create>[0]['data'],
        select: SOURCE_ENTRY_SELECT,
      })) as SourceEntryRow;
    } catch (error) {
      // Two admins racing: the partial unique index let the other one win.
      // Fall through to an update of the row that now exists.
      if (!isUniqueViolation(error)) throw error;
      existing = await loadTreeEntry(tree.id);
      if (!existing) throw error;
    }
  }

  const created = createdRow !== null;
  const beforeText = existing ? decryptEntryText(existing, key) : null;
  const row: SourceEntryRow =
    createdRow ??
    ((await prisma.sourceEntry.update({
      where: { id: existing!.id },
      data: data as unknown as Parameters<typeof prisma.sourceEntry.update>[0]['data'],
      select: SOURCE_ENTRY_SELECT,
    })) as SourceEntryRow);

  // No touchTreeTimestamp: sources are not part of the tree payload.
  await writeTreeEditLog(prisma, {
    treeId: tree.id,
    userId: result.user.id,
    action: created ? 'create' : 'update',
    entityType: 'source_entry',
    entityId: row.id,
    snapshotBefore: !created && existing
      ? encryptSnapshot(snapshotSourceEntry({ ...existing, text: beforeText }), key)
      : JSON_NULL,
    snapshotAfter: encryptSnapshot(
      snapshotSourceEntry({ id: row.id, individualId: null, visibility, text }),
      key,
    ),
    description: encryptAuditDescription(created ? 'create' : 'update', 'source_entry', null, key, {
      isUndo: isUndoRequest(request),
    }),
  });

  return NextResponse.json({ data: sourceEntryDto(row, text) }, { status: created ? 201 : 200 });
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
    snapshotBefore: encryptSnapshot(snapshotSourceEntry({ ...existing, text }), key),
    snapshotAfter: JSON_NULL,
    description: encryptAuditDescription('delete', 'source_entry', null, key, {
      isUndo: isUndoRequest(request),
    }),
  });

  return new NextResponse(null, { status: 204 });
}

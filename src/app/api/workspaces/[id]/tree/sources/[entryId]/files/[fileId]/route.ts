import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  requireWorkspaceMember,
  requireTreeEditor,
  isErrorResponse,
} from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { parseTreeIdFromBody } from '@/lib/api/route-helpers';
import { decryptBytes } from '@/lib/crypto/workspace-encryption';
import { getWorkspaceKey, encryptSnapshot } from '@/lib/tree/encryption';
import {
  SOURCE_NOT_FOUND_MESSAGE,
  NO_STORE_HEADERS,
  decryptEntryText,
  isUuid,
  viewerFor,
  isWorkspaceAdmin,
  creatorMayDeleteHidden,
  linkedPeople,
  primaryIndividualId,
  SOURCE_LINKS_SELECT,
  type SourceLinkRow,
} from '@/lib/tree/source-entry-route-helpers';
import { canViewSourceAnywhere, type SourceVisibilityLevel } from '@/lib/tree/source-visibility';
import { contentDispositionFor } from '@/lib/tree/source-file-processing';
import { isSourceFileMime } from '@/lib/tree/source-file-types';
import { decryptFileName, fileAuditMeta } from '@/lib/tree/source-file-helpers';
import {
  snapshotSourceEntry,
  encryptAuditDescription,
  encryptAuditPayload,
  writeTreeEditLog,
  JSON_NULL,
} from '@/lib/tree/audit';

type RouteParams = { params: Promise<{ id: string; entryId: string; fileId: string }> };

interface FileWithEntry {
  id: string;
  mimeType: string;
  sizeBytes: number;
  fileName: Uint8Array | Buffer;
  entry: {
    id: string;
    treeId: string;
    isTreeWide: boolean;
    visibility: SourceVisibilityLevel;
    text: Uint8Array | Buffer | null;
    createdById: string | null;
    links: (SourceLinkRow & { createdById: string | null })[];
    /** Authors only — for the creator delete bypass. */
    files: { createdById: string | null }[];
  } | null;
}

/**
 * The ONE "not visible" answer for files: nonexistent, malformed, staged,
 * another entry's, another tree's or workspace's, and gated-out all read the
 * same — and none of them reads or decrypts the bytes.
 */
function fileNotFound(): NextResponse {
  return NextResponse.json({ error: SOURCE_NOT_FOUND_MESSAGE }, { status: 404, headers: NO_STORE_HEADERS });
}

/**
 * One scoped lookup: file → its entry → the tree → the workspace. The tree is
 * the workspace main tree unless `treeId` names one of its trees. A staged
 * file (no entry) never matches: `entryId` must equal the path's entry.
 */
async function loadFile(
  workspaceId: string,
  treeId: string | null | undefined,
  entryId: string,
  fileId: string,
): Promise<FileWithEntry | null> {
  if (!isUuid(entryId) || !isUuid(fileId)) return null;
  if (treeId !== undefined && treeId !== null && !isUuid(treeId)) return null;
  const tree = treeId
    ? { id: treeId, workspaceId, kind: { in: ['main' as const, 'extra' as const] } }
    : { workspaceId, kind: 'main' as const };
  const row = (await prisma.sourceFile.findFirst({
    where: { id: fileId, entryId, tree, entry: { tree } },
    select: {
      id: true,
      mimeType: true,
      sizeBytes: true,
      fileName: true,
      entry: {
        select: {
          id: true,
          treeId: true,
          isTreeWide: true,
          visibility: true,
          text: true,
          createdById: true,
          links: { ...SOURCE_LINKS_SELECT, select: { ...SOURCE_LINKS_SELECT.select, createdById: true } },
          files: { select: { createdById: true } },
        },
      },
    },
  })) as FileWithEntry | null;
  return row && row.entry ? row : null;
}

/**
 * The gate for a source's files: admin always; the tree-wide gate for the
 * tree-wide source; otherwise at least one linked person the viewer may see
 * the source on.
 */
function visibleTo(entry: NonNullable<FileWithEntry['entry']>, membership: { role: string }): boolean {
  return canViewSourceAnywhere(entry, linkedPeople(entry), viewerFor(membership));
}

// GET /api/workspaces/[id]/tree/sources/[entryId]/files/[fileId]?treeId=
//
// Any member who may see the entry. The bytes are decrypted only after the
// gate passed. Served with locked-down headers: a sandboxing CSP, nosniff,
// same-origin CORP, never cached, images inline and PDFs as a download.
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, entryId, fileId } = await params;

  const result = await requireWorkspaceMember(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const file = await loadFile(workspaceId, request.nextUrl.searchParams.get('treeId'), entryId, fileId);
  if (!file || !file.entry || !visibleTo(file.entry, result.membership)) return fileNotFound();
  if (!isSourceFileMime(file.mimeType)) return fileNotFound();

  const stored = await prisma.sourceFileData.findUnique({ where: { fileId: file.id }, select: { data: true } });
  if (!stored) return fileNotFound();

  const key = await getWorkspaceKey(workspaceId);
  const bytes = decryptBytes(Buffer.from(stored.data), key);
  const name = decryptFileName(file.fileName, key);

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': file.mimeType,
      'Content-Length': String(bytes.length),
      'Content-Disposition': contentDispositionFor(file.mimeType, name),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      'Cross-Origin-Resource-Policy': 'same-origin',
      ...NO_STORE_HEADERS,
    },
  });
}

// DELETE /api/workspaces/[id]/tree/sources/[entryId]/files/[fileId] — `{ treeId? }`.
//
// Tree editors, on an entry they can see, or wrote and nobody else touched
// (`creatorMayDeleteHidden` — same rule as deleting the entry); the tree-wide entry's files are admin only. Removing the last file
// of an entry without text deletes the entry too — an entry never ends with
// neither. NOT undoable (files are never restored). The audit row holds
// counts, the MIME type and the size only.
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, entryId, fileId } = await params;

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  const treeId = await parseTreeIdFromBody(request);
  const file = await loadFile(workspaceId, treeId, entryId, fileId);
  const entry = file?.entry;
  if (!file || !entry) return fileNotFound();

  const allowedToDelete =
    entry.isTreeWide
      ? isWorkspaceAdmin(result.membership)
      : visibleTo(entry, result.membership) || creatorMayDeleteHidden(entry, result.user.id);
  if (!allowedToDelete) return fileNotFound();

  const key = await getWorkspaceKey(workspaceId);
  const text = decryptEntryText(entry, key);

  const entryDeleted = await prisma.$transaction(async (tx) => {
    await tx.sourceFile.delete({ where: { id: file.id } }); // bytes cascade
    const remaining = await tx.sourceFile.count({ where: { entryId: entry.id } });
    const deleteEntry = remaining === 0 && text === null;
    if (deleteEntry) await tx.sourceEntry.delete({ where: { id: entry.id } });

    const snap = (fileCount: number) =>
      encryptSnapshot(
        snapshotSourceEntry({ ...entry, individualId: primaryIndividualId(entry), text, fileCount }),
        key,
      );
    await writeTreeEditLog(tx, {
      treeId: entry.treeId,
      userId: result.user.id,
      action: deleteEntry ? 'delete' : 'update',
      entityType: 'source_entry',
      entityId: entry.id,
      snapshotBefore: snap(remaining + 1),
      snapshotAfter: deleteEntry ? JSON_NULL : snap(remaining),
      description: encryptAuditDescription(deleteEntry ? 'delete' : 'update', 'source_entry', null, key),
      payload: encryptAuditPayload({ fileRemoved: fileAuditMeta([file])[0] }, key),
    });
    return deleteEntry;
  });

  return NextResponse.json({ data: { entryDeleted } });
}

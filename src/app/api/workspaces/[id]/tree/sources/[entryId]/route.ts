import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireTreeEditor, isErrorResponse } from '@/lib/api/workspace-auth';
import { treeMutateLimiter, rateLimitResponse } from '@/lib/api/rate-limit';
import { parseValidatedBody, isParseError, parseTreeIdFromBody } from '@/lib/api/route-helpers';
import { isUndoRequest } from '@/lib/api/undo-header';
import { updateSourceEntrySchema, MAX_LINKS_PER_SOURCE } from '@/lib/tree/source-entry-schemas';
import {
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
import { canViewSourceAnywhere, canViewSourceEntry, type SourceViewer } from '@/lib/tree/source-visibility';
import {
  SOURCE_LINKS_WITH_NAMES_SELECT,
  INVALID_LINK_TARGETS_MESSAGE,
  LAST_LINK_MESSAGE,
  TOO_MANY_LINKS_MESSAGE,
  TREE_WIDE_LINK_MESSAGE,
  SourceLinkRequestError,
  sourceLinkErrorResponse,
  lastLinkOutcome,
  linkContexts,
  namedPeopleFromLinks,
  planLinkChange,
  planViewerDelete,
  validateLinkTargets,
  visibleCount,
  type NamedLinkRow,
  type SourceWithPeopleDto,
} from '@/lib/tree/source-links';
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

type Row = Omit<SourceEntryRow, 'links'> & { links: NamedLinkRow[] };

const WITH_NAMES_SELECT = { ...SOURCE_ENTRY_WITH_FILES_SELECT, links: SOURCE_LINKS_WITH_NAMES_SELECT };

/** A source of the resolved tree (with its links and files), or null. */
async function loadSource(treeId: string, entryId: string): Promise<Row | null> {
  return (await prisma.sourceEntry.findFirst({
    where: { id: entryId, treeId },
    select: WITH_NAMES_SELECT,
  })) as unknown as Row | null;
}

/** Admin: always (orphans too); others: at least one linked person they may see it on. */
function visibleTo(entry: Row, viewer: SourceViewer): boolean {
  return canViewSourceAnywhere(entry, linkContexts(entry.links), viewer);
}

/** A source as a viewer sees it: its visible people and their count. */
function withPeople(row: Row, text: string | null, key: Buffer, viewer: SourceViewer): SourceWithPeopleDto {
  return {
    ...sourceEntryDto(row, text, sourceFileDtos(row.files, key)),
    people: namedPeopleFromLinks(row, row.links, key, viewer, { limit: MAX_LINKS_PER_SOURCE }),
    peopleCount: visibleCount(row, row.links, viewer),
  };
}

// GET /api/workspaces/[id]/tree/sources/[entryId]?treeId= — «معاينة المصدر».
//
// Tree editors (the preview sits inside the reuse flow). The source must be
// visible to this viewer somewhere (`canViewSourceAnywhere`); the people are
// the ones this viewer may see it on. The tree-wide source has its own route
// and reads as not found here.
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, entryId } = await params;

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  if (!isUuid(entryId)) return sourceNotFound();

  const tree = await resolveSourceTreeOr404(workspaceId, request.nextUrl.searchParams.get('treeId'));
  if (isErrorResponse(tree)) return tree;

  const viewer = viewerFor(result.membership);
  const row = await loadSource(tree.id, entryId);
  if (!row || row.isTreeWide || !visibleTo(row, viewer)) return sourceNotFound();

  const key = await getWorkspaceKey(workspaceId);
  return NextResponse.json(
    { data: withPeople(row, decryptEntryText(row, key), key, viewer) },
    { headers: NO_STORE_HEADERS },
  );
}

// PATCH /api/workspaces/[id]/tree/sources/[entryId]
// `{ treeId?, text?, fileIds?, visibility?, addPersonIds?, removePersonIds?, onLastLink? }`
//
// The editor must be able to SEE the source (else the same 404 as a missing
// one). Changing the level at all is admin only; re-sending the current level
// is not a change. `text: null` / `''` clears the text, allowed only while the
// source keeps at least one file.
//
// People: adds must be people of this tree (a non-admin never a private one —
// one generic 400); already linked adds and not-linked removes are no-ops; a
// non-admin's remove never touches a person hidden from them. The source row
// is locked `FOR UPDATE` so two edits cannot both "remove the last person".
// Removing the LAST person needs `onLastLink`: absent → 409 `last_link`
// (nothing changes), `delete` → the source and its files are deleted
// (`{ data: null, deleted: true }`), `keep` → it stays, linked to nobody.
// Link ops on the tree-wide source → 400. ONE audit row per request.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id: workspaceId, entryId } = await params;

  const result = await requireTreeEditor(request, workspaceId);
  if (isErrorResponse(result)) return result;

  const { allowed, retryAfterSeconds } = treeMutateLimiter.check(result.user.id);
  if (!allowed) return rateLimitResponse(retryAfterSeconds);

  if (!isUuid(entryId)) return sourceNotFound();

  const parsed = await parseValidatedBody(request, updateSourceEntrySchema);
  if (isParseError(parsed)) return parsed;
  const { treeId, text, visibility, fileIds, onLastLink } = parsed.data;
  const addPersonIds = parsed.data.addPersonIds ?? [];
  const removePersonIds = parsed.data.removePersonIds ?? [];
  const touchesLinks = addPersonIds.length > 0 || removePersonIds.length > 0;

  const tree = await resolveSourceTreeOr404(workspaceId, treeId);
  if (isErrorResponse(tree)) return tree;

  const viewer = viewerFor(result.membership);
  const existing = await loadSource(tree.id, entryId);
  if (!existing) return sourceNotFound();
  if (existing.isTreeWide) {
    // Its content has its own admin route; people never attach to it.
    if (touchesLinks && canViewSourceEntry(existing, null, viewer)) {
      return NextResponse.json({ error: TREE_WIDE_LINK_MESSAGE }, { status: 400 });
    }
    return sourceNotFound();
  }
  if (!visibleTo(existing, viewer)) return sourceNotFound();

  const levelChanges = visibility !== undefined && visibility !== existing.visibility;
  if (levelChanges && !isWorkspaceAdmin(result.membership)) return adminOnlyVisibility();

  if (addPersonIds.length > 0) {
    const targets = await validateLinkTargets(prisma, tree.id, addPersonIds, viewer);
    if (!targets.ok) return NextResponse.json({ error: INVALID_LINK_TARGETS_MESSAGE }, { status: 400 });
  }

  const key = await getWorkspaceKey(workspaceId);
  const beforeText = decryptEntryText(existing, key);
  const patch: Record<string, unknown> = {};
  if (text !== undefined) Object.assign(patch, encryptSourceEntryInput({ text }, key));
  if (visibility !== undefined) patch.visibility = visibility;

  const afterText = text !== undefined ? text : beforeText;
  const afterLevel = visibility ?? existing.visibility;
  const isUndo = isUndoRequest(request);

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      // Links are re-read under the row lock: the last-person decision must
      // see every concurrent edit.
      let linked = linkContexts(existing.links);
      let change = { toAdd: [] as string[], toRemove: [] as string[] };
      if (touchesLinks) {
        await tx.$queryRaw`SELECT 1 FROM source_entries WHERE id = ${existing.id}::uuid FOR UPDATE`;
        const fresh = (await tx.sourceLink.findMany({
          where: { sourceId: existing.id },
          select: { individualId: true, individual: { select: { isPrivate: true } } },
          orderBy: [{ createdAt: 'asc' }, { individualId: 'asc' }],
        })) as unknown as NamedLinkRow[];
        linked = linkContexts(fresh);
        const plan = planLinkChange({ linked, add: addPersonIds, remove: removePersonIds, viewer });
        if (plan.linksAfter > MAX_LINKS_PER_SOURCE) {
          throw new SourceLinkRequestError(TOO_MANY_LINKS_MESSAGE, 400);
        }
        const last = lastLinkOutcome({
          isTreeWide: false,
          linksBefore: plan.linksBefore,
          linksAfter: plan.linksAfter,
          onLastLink,
        });
        if (last === 'ask') throw new SourceLinkRequestError(LAST_LINK_MESSAGE, 409, 'last_link');
        if (last === 'delete') {
          await tx.sourceEntry.delete({ where: { id: existing.id } });
          await writeTreeEditLog(tx, {
            treeId: tree.id,
            userId: result.user.id,
            action: 'delete',
            entityType: 'source_entry',
            entityId: existing.id,
            snapshotBefore: encryptSnapshot(
              snapshotSourceEntry({
                ...existing,
                text: beforeText,
                personIds: linked.map((l) => l.id),
                fileCount: existing.files?.length ?? 0,
              }),
              key,
            ),
            snapshotAfter: JSON_NULL,
            description: encryptAuditDescription('delete', 'source_entry', null, key, { isUndo }),
            payload: encryptAuditPayload({ linksRemoved: plan.toRemove, lastLink: 'delete' }, key),
          });
          return { deleted: true as const };
        }
        change = plan;
        if (plan.toRemove.length > 0) {
          await tx.sourceLink.deleteMany({
            where: { sourceId: existing.id, individualId: { in: plan.toRemove } },
          });
        }
        if (plan.toAdd.length > 0) {
          await tx.sourceLink.createMany({
            data: plan.toAdd.map((individualId) => ({
              sourceId: existing.id,
              individualId,
              treeId: tree.id,
              createdById: result.user.id,
            })),
            skipDuplicates: true,
          });
        }
      }

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
      // Never leave a source with neither text nor files.
      if (afterText === null && fileCount === 0) {
        throw new SourceFileRequestError(ENTRY_NEEDS_TEXT_OR_FILES_MESSAGE, 400);
      }

      const row = (await tx.sourceEntry.update({
        where: { id: existing.id },
        data: patch as unknown as Parameters<typeof prisma.sourceEntry.update>[0]['data'],
        select: WITH_NAMES_SELECT,
      })) as unknown as Row;

      const counts =
        fileCount === undefined
          ? { before: {}, after: {} }
          : { before: { fileCount: fileCount - attached.length }, after: { fileCount } };
      const beforeIds = linked.map((l) => l.id);
      const removed = new Set(change.toRemove);
      const afterIds = [...beforeIds.filter((id) => !removed.has(id)), ...change.toAdd];

      // No touchTreeTimestamp: sources are not part of the tree payload.
      await writeTreeEditLog(tx, {
        treeId: tree.id,
        userId: result.user.id,
        action: 'update',
        entityType: 'source_entry',
        entityId: existing.id,
        snapshotBefore: encryptSnapshot(
          snapshotSourceEntry({ ...existing, text: beforeText, personIds: beforeIds, ...counts.before }),
          key,
        ),
        snapshotAfter: encryptSnapshot(
          snapshotSourceEntry({
            ...existing,
            visibility: afterLevel,
            text: afterText,
            personIds: afterIds,
            ...counts.after,
          }),
          key,
        ),
        description: encryptAuditDescription('update', 'source_entry', null, key, { isUndo }),
        payload: encryptAuditPayload(
          {
            text,
            visibility,
            ...(attached.length > 0 ? { filesAdded: fileAuditMeta(attached) } : {}),
            ...(change.toAdd.length > 0 ? { linksAdded: change.toAdd } : {}),
            ...(change.toRemove.length > 0 ? { linksRemoved: change.toRemove } : {}),
          },
          key,
        ),
      });
      return { deleted: false as const, row };
    });

    if (outcome.deleted) return NextResponse.json({ data: null, deleted: true });
    return NextResponse.json({ data: withPeople(outcome.row, afterText, key, viewer) });
  } catch (error) {
    const response = sourceLinkErrorResponse(error) ?? sourceFileErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

// DELETE /api/workspaces/[id]/tree/sources/[entryId] — optional `{ treeId }`.
//
// Allowed when the editor can see the source, OR wrote it: a non-admin
// editor's own source sits at «المشرفون فقط» (the only level they may set),
// which they cannot see — without this, undoing their own create would always
// fail. Deleting reveals nothing they did not already write.
//
// An admin deletes the source, its links and files (204). A non-admin whose
// source is also linked to people hidden from them (private) removes only
// the people they can see; the source stays for the rest (200
// `{ data: { deleted: false } }`).
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

  const viewer = viewerFor(result.membership);
  const existing = await loadSource(tree.id, entryId);
  if (
    !existing ||
    existing.isTreeWide ||
    (!visibleTo(existing, viewer) && existing.createdById !== result.user.id)
  ) {
    return sourceNotFound();
  }

  const key = await getWorkspaceKey(workspaceId);
  const text = decryptEntryText(existing, key);
  const linked = linkContexts(existing.links);
  const personIds = linked.map((l) => l.id);
  const plan = planViewerDelete(linked, viewer);
  const isUndo = isUndoRequest(request);

  if (plan.mode === 'unlink') {
    await prisma.$transaction(async (tx) => {
      await tx.sourceLink.deleteMany({ where: { sourceId: existing.id, individualId: { in: plan.ids } } });
      const gone = new Set(plan.ids);
      await writeTreeEditLog(tx, {
        treeId: tree.id,
        userId: result.user.id,
        action: 'update',
        entityType: 'source_entry',
        entityId: existing.id,
        snapshotBefore: encryptSnapshot(snapshotSourceEntry({ ...existing, text, personIds }), key),
        snapshotAfter: encryptSnapshot(
          snapshotSourceEntry({ ...existing, text, personIds: personIds.filter((id) => !gone.has(id)) }),
          key,
        ),
        description: encryptAuditDescription('update', 'source_entry', null, key, { isUndo }),
        payload: encryptAuditPayload({ linksRemoved: plan.ids }, key),
      });
    });
    return NextResponse.json({ data: { deleted: false } });
  }

  await prisma.sourceEntry.delete({ where: { id: existing.id } });

  await writeTreeEditLog(prisma, {
    treeId: tree.id,
    userId: result.user.id,
    action: 'delete',
    entityType: 'source_entry',
    entityId: existing.id,
    snapshotBefore: encryptSnapshot(snapshotSourceEntry({ ...existing, text, personIds }), key),
    snapshotAfter: JSON_NULL,
    description: encryptAuditDescription('delete', 'source_entry', null, key, { isUndo }),
  });

  return new NextResponse(null, { status: 204 });
}

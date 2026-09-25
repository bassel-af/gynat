/**
 * Sources («المصادر») — the undo entries the person UI pushes, built on the
 * inverse builders (docs/sources-v1-goal.md §6).
 *
 * - Create: undoable; redo re-creates the source for EVERY person it was for.
 *   Created WITH files → `undoOnly` (undo deletes the files for good).
 * - Link (reuse «ربطه بهذا الشخص»): undo removes exactly those people and
 *   KEEPS the source (an orphan that was linked goes back to being one).
 * - Update: text / level / people are undoable (one PATCH each way); adding
 *   files is not.
 * - Unlink («إزالته عن … فقط»): undo links the person again. When the
 *   removal deleted the source, only a text-only one can come back.
 * - Delete: a text-only source comes back for its people; one with files
 *   cannot. A partial delete (the source stayed for people hidden from the
 *   actor) is undone by re-linking the same source.
 *
 * Sources are not in the tree payload, so every undo/redo tells the mounted
 * source lists to refetch. Labels never contain the source text (PII).
 */
import type { UndoEntry } from '@/lib/undo/types';
import {
  buildCreateSourceEntryInverse,
  buildUpdateSourceEntryInverse,
  buildDeleteSourceEntryInverse,
  buildPartialSourceDeleteInverse,
  type Inverse,
  type SourcePatchBody,
} from '@/lib/tree/undo-builders';
import { buildUndoLabel } from '@/lib/tree/undo-label';
import { notifySourcesChanged } from '@/hooks/usePersonSources';
import type { SourceEntryDto } from '@/lib/tree/source-entries-api';
import type { SourceVisibilityLevel } from '@/lib/tree/source-visibility';

function withRefresh(inverse: Inverse): Inverse {
  return {
    undo: async () => {
      await inverse.undo();
      notifySourcesChanged();
    },
    redo: async () => {
      await inverse.redo();
      notifySourcesChanged();
    },
  };
}

/** A non-admin may only create at «المشرفون فقط», so their re-create uses it. */
const restoreLevel = (source: SourceEntryDto, isAdmin: boolean): SourceVisibilityLevel =>
  isAdmin ? source.visibility : 'admins';

// ---------------------------------------------------------------------------
// Inverses (also composed into the person form's one undo step)
// ---------------------------------------------------------------------------

/** Undo of a create (redo re-creates it from its text: use it for text-only work, or `undoOnly`). */
export function sourceCreateInverse({
  workspaceId,
  created,
  personIds,
  treeId,
}: {
  workspaceId: string;
  created: SourceEntryDto;
  personIds: readonly string[];
  treeId?: string;
}): Inverse {
  return buildCreateSourceEntryInverse({
    workspaceId,
    createdId: created.id,
    createPayload: { text: created.text ?? '', visibility: created.visibility, personIds: [...personIds] },
    treeId,
  });
}

/** People added to an existing source: undo removes them (keeping the source). */
export function sourceLinkInverse({
  workspaceId,
  sourceId,
  personIds,
  treeId,
}: {
  workspaceId: string;
  sourceId: string;
  personIds: readonly string[];
  treeId?: string;
}): Inverse {
  return buildUpdateSourceEntryInverse({
    workspaceId,
    entryId: sourceId,
    before: { removePersonIds: [...personIds], onLastLink: 'keep' },
    after: { addPersonIds: [...personIds] },
    treeId,
  });
}

export interface SourceEntryPatch {
  text?: string | null;
  visibility?: SourceVisibilityLevel;
  fileIds?: string[];
}

/** Undo of an edit (text / level / people); `null` when nothing undoable changed. */
export function sourceUpdateInverse({
  workspaceId,
  before,
  patch,
  addPersonIds = [],
  removePersonIds = [],
  treeId,
}: {
  workspaceId: string;
  before: SourceEntryDto;
  patch: SourceEntryPatch;
  addPersonIds?: readonly string[];
  removePersonIds?: readonly string[];
  treeId?: string;
}): Inverse | null {
  const undoBody: SourcePatchBody = {};
  const redoBody: SourcePatchBody = {};
  if (patch.text !== undefined && patch.text !== before.text) {
    undoBody.text = before.text;
    redoBody.text = patch.text;
  }
  if (patch.visibility !== undefined && patch.visibility !== before.visibility) {
    undoBody.visibility = before.visibility;
    redoBody.visibility = patch.visibility;
  }
  if (removePersonIds.length > 0) undoBody.addPersonIds = [...removePersonIds];
  if (addPersonIds.length > 0) {
    undoBody.removePersonIds = [...addPersonIds];
    // An undo never deletes the source (the starting person stays anyway).
    undoBody.onLastLink = 'keep';
    redoBody.addPersonIds = [...addPersonIds];
  }
  if (removePersonIds.length > 0) redoBody.removePersonIds = [...removePersonIds];
  if (Object.keys(undoBody).length === 0) return null;
  return buildUpdateSourceEntryInverse({ workspaceId, entryId: before.id, before: undoBody, after: redoBody, treeId });
}

export type SourceUnlinkOutcome = 'unlinked' | 'kept' | 'deleted';

/** Undo of «إزالته عن … فقط»; `null` when it deleted a source with files. */
export function sourceUnlinkInverse({
  workspaceId,
  before,
  personId,
  outcome,
  isAdmin,
  treeId,
}: {
  workspaceId: string;
  before: SourceEntryDto;
  personId: string;
  outcome: SourceUnlinkOutcome;
  isAdmin: boolean;
  treeId?: string;
}): Inverse | null {
  if (outcome === 'deleted') {
    if (before.files.length > 0 || !before.text) return null;
    return buildDeleteSourceEntryInverse({
      workspaceId,
      deletedId: before.id,
      snapshot: { text: before.text, visibility: restoreLevel(before, isAdmin), personIds: [personId] },
      treeId,
    });
  }
  return buildUpdateSourceEntryInverse({
    workspaceId,
    entryId: before.id,
    before: { addPersonIds: [personId] },
    after: { removePersonIds: [personId], ...(outcome === 'kept' ? { onLastLink: 'keep' as const } : {}) },
    treeId,
  });
}

/**
 * Undo of a delete. `deletedAll: false` = the source stayed for people hidden
 * from the actor: re-link the same source. Else a text-only source is
 * re-created for `personIds`; one with files cannot come back (`null`).
 */
export function sourceDeleteInverse({
  workspaceId,
  deleted,
  personIds,
  deletedAll,
  isAdmin,
  treeId,
}: {
  workspaceId: string;
  deleted: SourceEntryDto;
  personIds: readonly string[];
  deletedAll: boolean;
  isAdmin: boolean;
  treeId?: string;
}): Inverse | null {
  if (!deletedAll) {
    return buildPartialSourceDeleteInverse({ workspaceId, sourceId: deleted.id, personIds: [...personIds], treeId });
  }
  if (deleted.files.length > 0 || !deleted.text || personIds.length === 0) return null;
  return buildDeleteSourceEntryInverse({
    workspaceId,
    deletedId: deleted.id,
    snapshot: { text: deleted.text, visibility: restoreLevel(deleted, isAdmin), personIds: [...personIds] },
    treeId,
  });
}

// ---------------------------------------------------------------------------
// Undo entries (the sidebar and the standalone form)
// ---------------------------------------------------------------------------

export function sourceCreateUndoEntry({
  workspaceId,
  created,
  personIds,
  treeId,
}: {
  workspaceId: string;
  created: SourceEntryDto;
  personIds: readonly string[];
  treeId?: string;
}): UndoEntry {
  const inverse = withRefresh(sourceCreateInverse({ workspaceId, created, personIds, treeId }));
  return {
    label: buildUndoLabel({ kind: 'createSourceEntry', people: personIds.length }),
    workspaceId,
    ...inverse,
    ...(created.files.length > 0 ? { undoOnly: true } : {}),
  };
}

export function sourceLinkUndoEntry({
  workspaceId,
  sourceId,
  personIds,
  treeId,
}: {
  workspaceId: string;
  sourceId: string;
  personIds: readonly string[];
  treeId?: string;
}): UndoEntry {
  const inverse = withRefresh(sourceLinkInverse({ workspaceId, sourceId, personIds, treeId }));
  return {
    label: buildUndoLabel({ kind: 'createSourceEntry', people: personIds.length }),
    workspaceId,
    ...inverse,
  };
}

export function sourceUpdateUndoEntry({
  workspaceId,
  before,
  patch,
  addPersonIds,
  removePersonIds,
  people,
  treeId,
}: {
  workspaceId: string;
  before: SourceEntryDto;
  patch: SourceEntryPatch;
  addPersonIds?: readonly string[];
  removePersonIds?: readonly string[];
  /** How many people the source is for after the edit (the label). */
  people?: number;
  treeId?: string;
}): UndoEntry | null {
  const inverse = sourceUpdateInverse({ workspaceId, before, patch, addPersonIds, removePersonIds, treeId });
  if (!inverse) return null;
  return { label: buildUndoLabel({ kind: 'updateSourceEntry', people }), workspaceId, ...withRefresh(inverse) };
}

export function sourceUnlinkUndoEntry({
  workspaceId,
  before,
  personId,
  personName,
  outcome,
  isAdmin,
  treeId,
}: {
  workspaceId: string;
  before: SourceEntryDto;
  personId: string;
  personName?: string;
  outcome: SourceUnlinkOutcome;
  isAdmin: boolean;
  treeId?: string;
}): UndoEntry | null {
  const inverse = sourceUnlinkInverse({ workspaceId, before, personId, outcome, isAdmin, treeId });
  if (!inverse) return null;
  return { label: buildUndoLabel({ kind: 'unlinkSource', name: personName }), workspaceId, ...withRefresh(inverse) };
}

export function sourceDeleteUndoEntry({
  workspaceId,
  deleted,
  personIds,
  deletedAll,
  isAdmin,
  treeId,
}: {
  workspaceId: string;
  deleted: SourceEntryDto;
  personIds: readonly string[];
  deletedAll: boolean;
  isAdmin: boolean;
  treeId?: string;
}): UndoEntry | null {
  const inverse = sourceDeleteInverse({ workspaceId, deleted, personIds, deletedAll, isAdmin, treeId });
  if (!inverse) return null;
  return { label: buildUndoLabel({ kind: 'deleteSourceEntry' }), workspaceId, ...withRefresh(inverse) };
}

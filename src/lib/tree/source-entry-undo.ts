/**
 * Sources («المصادر») — the undo entries the person UI pushes (step 6a),
 * built on the step-4 inverse builders.
 *
 * - Create: undoable. When the entry was created WITH files, undo deletes the
 *   files for good, so it is `undoOnly` (no redo that could not work).
 * - Update: only a text / level change is undoable; adding files is not.
 * - Delete: a text-only entry is undoable; an entry with files is not.
 *
 * Sources are not in the tree payload, so every undo/redo tells the mounted
 * source lists to refetch.
 */
import type { UndoEntry } from '@/lib/undo/types';
import {
  buildCreateSourceEntryInverse,
  buildUpdateSourceEntryInverse,
  buildDeleteSourceEntryInverse,
  type Inverse,
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

export function sourceCreateUndoEntry({
  workspaceId,
  individualId,
  created,
  treeId,
}: {
  workspaceId: string;
  individualId: string;
  created: SourceEntryDto;
  treeId?: string;
}): UndoEntry {
  const inverse = withRefresh(
    buildCreateSourceEntryInverse({
      workspaceId,
      individualId,
      createdId: created.id,
      createPayload: { text: created.text ?? '', visibility: created.visibility },
      treeId,
    }),
  );
  return {
    label: buildUndoLabel({ kind: 'createSourceEntry' }),
    workspaceId,
    ...inverse,
    ...(created.files.length > 0 ? { undoOnly: true } : {}),
  };
}

export interface SourceEntryPatch {
  text?: string | null;
  visibility?: SourceVisibilityLevel;
  fileIds?: string[];
}

export function sourceUpdateUndoEntry({
  workspaceId,
  before,
  patch,
  treeId,
}: {
  workspaceId: string;
  before: SourceEntryDto;
  patch: SourceEntryPatch;
  treeId?: string;
}): UndoEntry | null {
  const undoFields: { text?: string | null; visibility?: string } = {};
  const redoFields: { text?: string | null; visibility?: string } = {};
  if (patch.text !== undefined && patch.text !== before.text) {
    undoFields.text = before.text;
    redoFields.text = patch.text;
  }
  if (patch.visibility !== undefined && patch.visibility !== before.visibility) {
    undoFields.visibility = before.visibility;
    redoFields.visibility = patch.visibility;
  }
  if (Object.keys(undoFields).length === 0) return null;
  const inverse = withRefresh(
    buildUpdateSourceEntryInverse({ workspaceId, entryId: before.id, before: undoFields, after: redoFields, treeId }),
  );
  return { label: buildUndoLabel({ kind: 'updateSourceEntry' }), workspaceId, ...inverse };
}

export function sourceDeleteUndoEntry({
  workspaceId,
  deleted,
  isAdmin,
  treeId,
}: {
  workspaceId: string;
  deleted: SourceEntryDto;
  isAdmin: boolean;
  treeId?: string;
}): UndoEntry | null {
  if (deleted.files.length > 0 || !deleted.text || !deleted.individualId) return null;
  const inverse = withRefresh(
    buildDeleteSourceEntryInverse({
      workspaceId,
      individualId: deleted.individualId,
      deletedId: deleted.id,
      // A non-admin may only create at «المشرفون فقط».
      snapshot: { text: deleted.text, visibility: isAdmin ? deleted.visibility : 'admins' },
      treeId,
    }),
  );
  return { label: buildUndoLabel({ kind: 'deleteSourceEntry' }), workspaceId, ...inverse };
}

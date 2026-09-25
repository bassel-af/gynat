/**
 * Sources («المصادر») — persist the person form's staged plan (see
 * source-staging.ts) in order: creates → updates (text / level, then file
 * removals) → deletes. Every operation is tried; a failure never stops the
 * others. The result says what saved (so a retry repeats nothing) and carries
 * the inverses of the REVERSIBLE work only — text-only creates, text / level
 * changes, deletes of text-only entries. File work cannot be redone after an
 * undo; `involvedFiles` tells the caller to mark its undo entry `undoOnly`.
 *
 * PII: entry texts may name living people — never log them.
 */
import {
  createSourceEntry,
  updateSourceEntry,
  deleteSourceEntry,
  deleteSourceFile,
  type SourceEntryDto,
} from '@/lib/tree/source-entries-api';
import {
  buildCreateSourceEntryInverse,
  buildUpdateSourceEntryInverse,
  buildDeleteSourceEntryInverse,
  type Inverse,
} from '@/lib/tree/undo-builders';
import type { SourcePlan, SourcePlanResult } from '@/lib/tree/source-staging';

export interface AppliedSourcePlan {
  result: SourcePlanResult;
  /** Inverses of the reversible work that saved, in the order it ran. */
  inverses: Inverse[];
  /** Some file work saved (attached, removed, or deleted with its entry). */
  involvedFiles: boolean;
  /** Operations that did not fully save. */
  failedCount: number;
  /** Entries saved at «المشرفون فقط» by this call. */
  createdAdminsOnly: number;
  /** Entries created by this call. */
  createdCount: number;
}

export async function applySourcePlan({
  workspaceId,
  individualId,
  treeId,
  isAdmin,
  plan,
}: {
  workspaceId: string;
  individualId: string;
  treeId?: string;
  isAdmin: boolean;
  plan: SourcePlan;
}): Promise<AppliedSourcePlan> {
  const result: SourcePlanResult = {
    created: {},
    failedCreates: [],
    updated: {},
    failedUpdates: [],
    removedFileIds: {},
    deleted: [],
    failedDeletes: [],
  };
  const inverses: Inverse[] = [];
  let involvedFiles = false;
  let createdAdminsOnly = 0;

  for (const create of plan.creates) {
    try {
      const created = await createSourceEntry(
        workspaceId,
        individualId,
        {
          text: create.text,
          ...(create.fileIds.length > 0 ? { fileIds: create.fileIds } : {}),
          visibility: create.visibility,
        },
        treeId,
      );
      result.created[create.key] = created;
      if (created.visibility === 'admins') createdAdminsOnly++;
      if (create.fileIds.length > 0) {
        involvedFiles = true;
      } else if (created.text) {
        inverses.push(
          buildCreateSourceEntryInverse({
            workspaceId,
            individualId,
            createdId: created.id,
            createPayload: { text: created.text, visibility: created.visibility },
            treeId,
          }),
        );
      }
    } catch {
      result.failedCreates.push(create.key);
    }
  }

  for (const update of plan.updates) {
    const { id, before, patch, removeFileIds } = update;
    let ok = true;
    if (Object.keys(patch).length > 0) {
      try {
        const updated = await updateSourceEntry(workspaceId, id, patch, treeId);
        result.updated[id] = updated;
        if ((patch.fileIds?.length ?? 0) > 0) involvedFiles = true;
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
        if (Object.keys(undoFields).length > 0) {
          inverses.push(
            buildUpdateSourceEntryInverse({ workspaceId, entryId: id, before: undoFields, after: redoFields, treeId }),
          );
        }
      } catch {
        ok = false;
      }
    }
    // File removals only after the text / level landed (never half an edit).
    if (ok) {
      for (const fileId of removeFileIds) {
        try {
          const { entryDeleted } = await deleteSourceFile(workspaceId, id, fileId, treeId);
          involvedFiles = true;
          (result.removedFileIds![id] ??= []).push(fileId);
          if (entryDeleted) {
            // The last file of an entry without text — the entry went with it.
            result.deleted.push(id);
            break;
          }
        } catch {
          ok = false;
          break;
        }
      }
    }
    if (!ok) result.failedUpdates.push(id);
  }

  for (const del of plan.deletes) {
    try {
      await deleteSourceEntry(workspaceId, del.id, treeId);
      result.deleted.push(del.id);
      const inverse = deleteInverse(workspaceId, del.before, isAdmin, treeId);
      if (inverse) inverses.push(inverse);
      else if (del.before.files.length > 0) involvedFiles = true;
    } catch {
      result.failedDeletes.push(del.id);
    }
  }

  return {
    result,
    inverses,
    involvedFiles,
    failedCount: result.failedCreates.length + result.failedUpdates.length + result.failedDeletes.length,
    createdAdminsOnly,
    createdCount: Object.keys(result.created).length,
  };
}

/** A text-only entry can be re-created by undo; one with files cannot. */
function deleteInverse(
  workspaceId: string,
  deleted: SourceEntryDto,
  isAdmin: boolean,
  treeId?: string,
): Inverse | null {
  if (deleted.files.length > 0 || !deleted.text || !deleted.individualId) return null;
  return buildDeleteSourceEntryInverse({
    workspaceId,
    individualId: deleted.individualId,
    deletedId: deleted.id,
    // A non-admin may only create at «المشرفون فقط».
    snapshot: { text: deleted.text, visibility: isAdmin ? deleted.visibility : 'admins' },
    treeId,
  });
}

/** Undo runs the inverses newest-first; redo replays them in order. */
export function composeInverses(inverses: readonly Inverse[]): Inverse {
  return {
    undo: async () => {
      for (const inverse of [...inverses].reverse()) await inverse.undo();
    },
    redo: async () => {
      for (const inverse of inverses) await inverse.redo();
    },
  };
}

/**
 * Sources («المصادر») — persist the person form's staged plan (see
 * source-staging.ts) in order: creates → links → updates (content + people,
 * then file removals) → unlinks → deletes. `SOURCE_SELF` becomes the person's
 * id here. Every operation is tried; a failure never stops the others. The
 * result says what saved (so a retry repeats nothing) and carries the
 * inverses of the REVERSIBLE work — text-only creates, links, text / level /
 * people changes, unlinks, deletes of text-only sources. File work cannot be
 * redone after an undo; `involvedFiles` tells the caller to mark its undo
 * entry `undoOnly`, and `undoOnlyInverses` undo the file-bearing creates
 * (for a person-create undo, which must not leave orphans behind).
 *
 * PII: source texts may name living people — never log them.
 */
import {
  createSource,
  fetchSourcePreview,
  patchSource,
  deleteSourceEntry,
  deleteSourceFile,
  type SourceWithPeopleDto,
} from '@/lib/tree/source-entries-api';
import type { Inverse } from '@/lib/tree/undo-builders';
import {
  sourceCreateInverse,
  sourceDeleteInverse,
  sourceLinkInverse,
  sourceUnlinkInverse,
  sourceUpdateInverse,
} from '@/lib/tree/source-entry-undo';
import {
  SOURCE_SELF,
  type SourcePlan,
  type SourcePlanResult,
  type StagedEntry,
} from '@/lib/tree/source-staging';

export interface AppliedSourcePlan {
  result: SourcePlanResult;
  /** Inverses of the reversible work that saved, in the order it ran. */
  inverses: Inverse[];
  /** Undo-only inverses of the file-bearing creates (undo deletes them for good). */
  undoOnlyInverses: Inverse[];
  /** Some file work saved (attached, removed, or deleted with its source). */
  involvedFiles: boolean;
  /** Operations that did not fully save. */
  failedCount: number;
  /** Sources saved at «المشرفون فقط» by this call. */
  createdAdminsOnly: number;
  /** Sources created or linked by this call. */
  createdCount: number;
}

/**
 * Reuse («ربطه بهذا الشخص»): link people to an existing source. Returns the
 * source and the people it did NOT have before — the only ones an undo may
 * take off again (re-linking someone already linked is a no-op on the
 * server, and its undo must not remove them).
 */
export async function linkPeopleToSource({
  workspaceId,
  sourceId,
  personIds,
  treeId,
}: {
  workspaceId: string;
  sourceId: string;
  personIds: readonly string[];
  treeId?: string;
}): Promise<{ source: SourceWithPeopleDto | null; added: string[] }> {
  let before = new Set<string>();
  try {
    const preview = await fetchSourcePreview(workspaceId, sourceId, treeId);
    before = new Set(preview.people.map((p) => p.id));
  } catch {
    // Unknown: treat every person as new.
  }
  const source = await patchSource(workspaceId, sourceId, { addPersonIds: [...personIds] }, treeId);
  return { source, added: personIds.filter((id) => !before.has(id)) };
}

/** A source as seen from `individualId`: the others it is for. */
function asStagedEntry(source: SourceWithPeopleDto, individualId: string): StagedEntry {
  const people = source.people.filter((p) => p.id !== individualId);
  const self = source.people.length - people.length;
  return { ...source, people, sharedCount: Math.max(0, source.peopleCount - self) };
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
  const undoOnlyInverses: Inverse[] = [];
  let involvedFiles = false;
  let createdAdminsOnly = 0;
  const resolve = (ids: readonly string[]) => ids.map((id) => (id === SOURCE_SELF ? individualId : id));

  for (const create of plan.creates) {
    const personIds = resolve(create.personIds);
    try {
      const created = await createSource(
        workspaceId,
        {
          text: create.text,
          ...(create.fileIds.length > 0 ? { fileIds: create.fileIds } : {}),
          visibility: create.visibility,
          personIds,
        },
        treeId,
      );
      result.created[create.key] = created;
      if (created.visibility === 'admins') createdAdminsOnly++;
      const inverse = sourceCreateInverse({ workspaceId, created, personIds, treeId });
      if (create.fileIds.length > 0) {
        involvedFiles = true;
        undoOnlyInverses.push(inverse);
      } else if (created.text) {
        inverses.push(inverse);
      }
    } catch {
      result.failedCreates.push(create.key);
    }
  }

  for (const link of plan.links) {
    const personIds = resolve(link.personIds);
    try {
      const { source: linked, added } = await linkPeopleToSource({
        workspaceId,
        sourceId: link.sourceId,
        personIds,
        treeId,
      });
      if (linked) {
        result.created[link.key] = asStagedEntry(linked, individualId);
        if (linked.visibility === 'admins') createdAdminsOnly++;
      }
      if (added.length > 0) {
        inverses.push(sourceLinkInverse({ workspaceId, sourceId: link.sourceId, personIds: added, treeId }));
      }
    } catch {
      result.failedCreates.push(link.key);
    }
  }

  for (const update of plan.updates) {
    const { id, before, patch, removeFileIds, addPersonIds, removePersonIds } = update;
    const body = {
      ...patch,
      ...(addPersonIds.length > 0 ? { addPersonIds } : {}),
      ...(removePersonIds.length > 0 ? { removePersonIds } : {}),
    };
    let ok = true;
    if (Object.keys(body).length > 0) {
      try {
        // The starting person always stays, so this never removes the last person.
        const updated = await patchSource(workspaceId, id, body, treeId);
        if (updated) result.updated[id] = asStagedEntry(updated, individualId);
        if ((patch.fileIds?.length ?? 0) > 0) involvedFiles = true;
        const inverse = sourceUpdateInverse({ workspaceId, before, patch, addPersonIds, removePersonIds, treeId });
        if (inverse) inverses.push(inverse);
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
            // The last file of a source without text — the source went with it.
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

  for (const unlink of plan.unlinks) {
    try {
      await patchSource(
        workspaceId,
        unlink.id,
        { removePersonIds: [individualId], ...(unlink.onLastLink ? { onLastLink: unlink.onLastLink } : {}) },
        treeId,
      );
      result.deleted.push(unlink.id);
      const inverse = sourceUnlinkInverse({
        workspaceId,
        before: unlink.before,
        personId: individualId,
        outcome: unlink.onLastLink === 'keep' ? 'kept' : 'unlinked',
        isAdmin,
        treeId,
      });
      if (inverse) inverses.push(inverse);
    } catch {
      result.failedDeletes.push(unlink.id);
    }
  }

  for (const del of plan.deletes) {
    try {
      const { deleted } = await deleteSourceEntry(workspaceId, del.id, treeId);
      result.deleted.push(del.id);
      const inverse = sourceDeleteInverse({
        workspaceId,
        deleted: del.before,
        personIds: [individualId, ...(del.before.people ?? []).map((p) => p.id)],
        deletedAll: deleted,
        isAdmin,
        treeId,
      });
      if (inverse) inverses.push(inverse);
      else if (del.before.files.length > 0) involvedFiles = true;
    } catch {
      result.failedDeletes.push(del.id);
    }
  }

  return {
    result,
    inverses,
    undoOnlyInverses,
    involvedFiles,
    failedCount: result.failedCreates.length + result.failedUpdates.length + result.failedDeletes.length,
    createdAdminsOnly,
    createdCount: Object.keys(result.created).length,
  };
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

/**
 * Sources («المصادر») inside the person edit form — the STAGED list model.
 *
 * Nothing here talks to the server. The form keeps a list of rows (the
 * person's saved entries plus drafts), the user adds / edits / marks rows for
 * deletion, and «حفظ» turns the list into ONE plan (`buildSourcePlan`) that
 * `usePersonActions` persists in order: creates → updates → deletes. After a
 * partly-failed save `applyPlanResult` drops what succeeded, so the retry
 * never repeats a create.
 *
 * PII: texts may name living people — never log them.
 */
import type { SourceEntryDto } from '@/lib/tree/source-entries-api';
import type { SourceVisibilityLevel } from '@/lib/tree/source-visibility';
import type { SourceEntryPatch } from '@/lib/tree/source-entry-undo';

/** A file uploaded (staged on the server) in the deferred form, not yet attached. */
export interface DraftFile {
  id: string;
  name: string;
  isImage: boolean;
  /** Local object URL for an image preview — owned by the list, revoked by it. */
  previewUrl: string | null;
}

/** What the deferred «إضافة مصدر» / «تعديل المصدر» form hands back on «حفظ». */
export interface SourceDraft {
  text: string;
  visibility: SourceVisibilityLevel;
  addFiles: DraftFile[];
  /** Saved files of the entry to delete on the parent «حفظ». */
  removeFileIds: string[];
}

export interface StagedSource {
  key: string;
  /** The saved entry; absent for a row added in this form. */
  entry?: SourceEntryDto;
  /** Pending changes (always set for an added row). */
  draft?: SourceDraft;
  markedForDeletion?: boolean;
  /** The last «حفظ» could not save this row. */
  failed?: boolean;
}

export type SourceRowState = 'saved' | 'added' | 'edited' | 'deleted';

export interface SourcePlanCreate {
  key: string;
  text: string | null;
  visibility: SourceVisibilityLevel;
  fileIds: string[];
}

export interface SourcePlanUpdate {
  id: string;
  before: SourceEntryDto;
  patch: SourceEntryPatch;
  removeFileIds: string[];
}

export interface SourcePlanDelete {
  id: string;
  before: SourceEntryDto;
}

export interface SourcePlan {
  creates: SourcePlanCreate[];
  updates: SourcePlanUpdate[];
  deletes: SourcePlanDelete[];
}

/** What a (partly) failed save did, for `applyPlanResult`. */
export interface SourcePlanResult {
  /** Create key → the saved entry. */
  created: Record<string, SourceEntryDto>;
  failedCreates: string[];
  /** Entry id → the entry after its PATCH (the PATCH itself succeeded). */
  updated: Record<string, SourceEntryDto>;
  /** Entry id of every update not fully saved (its PATCH or a file removal failed). */
  failedUpdates: string[];
  /** Entry id → the files removed before a later removal failed. */
  removedFileIds?: Record<string, string[]>;
  deleted: string[];
  failedDeletes: string[];
}

export const EMPTY_SOURCE_PLAN: SourcePlan = { creates: [], updates: [], deletes: [] };

let keyCounter = 0;
const nextKey = () => `staged-source-${++keyCounter}`;

export function stagedFromEntries(entries: readonly SourceEntryDto[]): StagedSource[] {
  return entries.map((entry) => ({ key: `saved-${entry.id}`, entry }));
}

export function addDraft(items: readonly StagedSource[], draft: SourceDraft): StagedSource[] {
  return [...items, { key: nextKey(), draft }];
}

export function replaceDraft(items: readonly StagedSource[], key: string, draft: SourceDraft): StagedSource[] {
  return items.map((item) => (item.key === key ? { ...item, draft, failed: false } : item));
}

/** Mark a saved row for deletion (or restore it); an added row is removed outright. */
export function toggleDelete(items: readonly StagedSource[], key: string): StagedSource[] {
  const item = items.find((i) => i.key === key);
  if (!item) return [...items];
  if (!item.entry) return items.filter((i) => i.key !== key);
  return items.map((i) => (i.key === key ? { ...i, markedForDeletion: !i.markedForDeletion, failed: false } : i));
}

const normText = (text: string | null | undefined): string | null => {
  const t = (text ?? '').trim();
  return t === '' ? null : t;
};

/** The PATCH body a saved entry's draft needs (text / level / new files). */
function patchOf(entry: SourceEntryDto, draft: SourceDraft): SourceEntryPatch {
  const patch: SourceEntryPatch = {};
  const text = normText(draft.text);
  if (text !== (entry.text ?? null)) patch.text = text;
  if (draft.visibility !== entry.visibility) patch.visibility = draft.visibility;
  if (draft.addFiles.length > 0) patch.fileIds = draft.addFiles.map((f) => f.id);
  return patch;
}

function isEdited(entry: SourceEntryDto, draft: SourceDraft | undefined): boolean {
  if (!draft) return false;
  return Object.keys(patchOf(entry, draft)).length > 0 || draft.removeFileIds.length > 0;
}

export function rowState(item: StagedSource): SourceRowState {
  if (!item.entry) return 'added';
  if (item.markedForDeletion) return 'deleted';
  return isEdited(item.entry, item.draft) ? 'edited' : 'saved';
}

/** «المصادر (N)» — the rows as they will be after saving. */
export function stagedCount(items: readonly StagedSource[]): number {
  return items.filter((i) => rowState(i) !== 'deleted').length;
}

export function hasStagedChanges(items: readonly StagedSource[]): boolean {
  return items.some((i) => rowState(i) !== 'saved');
}

export function buildSourcePlan(items: readonly StagedSource[]): SourcePlan {
  const plan: SourcePlan = { creates: [], updates: [], deletes: [] };
  for (const item of items) {
    const state = rowState(item);
    if (state === 'added' && item.draft) {
      plan.creates.push({
        key: item.key,
        text: normText(item.draft.text),
        visibility: item.draft.visibility,
        fileIds: item.draft.addFiles.map((f) => f.id),
      });
    } else if (state === 'edited' && item.entry && item.draft) {
      plan.updates.push({
        id: item.entry.id,
        before: item.entry,
        patch: patchOf(item.entry, item.draft),
        removeFileIds: [...item.draft.removeFileIds],
      });
    } else if (state === 'deleted' && item.entry) {
      plan.deletes.push({ id: item.entry.id, before: item.entry });
    }
  }
  return plan;
}

export function isPlanEmpty(plan: SourcePlan): boolean {
  return plan.creates.length + plan.updates.length + plan.deletes.length === 0;
}

/** Any file work — none of it can be redone after an undo. */
export function planInvolvesFiles(plan: SourcePlan): boolean {
  return (
    plan.creates.some((c) => c.fileIds.length > 0) ||
    plan.updates.some((u) => u.removeFileIds.length > 0 || (u.patch.fileIds?.length ?? 0) > 0) ||
    plan.deletes.some((d) => d.before.files.length > 0)
  );
}

export function applyPlanResult(items: readonly StagedSource[], result: SourcePlanResult): StagedSource[] {
  const failedCreates = new Set(result.failedCreates);
  const failedUpdates = new Set(result.failedUpdates);
  const failedDeletes = new Set(result.failedDeletes);
  const deleted = new Set(result.deleted);
  const next: StagedSource[] = [];
  for (const item of items) {
    const created = result.created[item.key];
    if (!item.entry) {
      if (created) next.push({ key: item.key, entry: created });
      else next.push(failedCreates.has(item.key) ? { ...item, failed: true } : item);
      continue;
    }
    const id = item.entry.id;
    if (deleted.has(id)) continue;
    if (failedDeletes.has(id)) {
      next.push({ ...item, failed: true });
      continue;
    }
    const updated = result.updated[id];
    const removed = new Set(result.removedFileIds?.[id] ?? []);
    if (updated || removed.size > 0) {
      const base = updated ?? item.entry;
      const entry = { ...base, files: base.files.filter((f) => !removed.has(f.id)) };
      if (!failedUpdates.has(id)) {
        next.push({ key: item.key, entry });
        continue;
      }
      // The PATCH landed; only the file removals that failed are left.
      const remaining = (item.draft?.removeFileIds ?? []).filter((fid) => !removed.has(fid));
      const draft: SourceDraft | undefined = updated
        ? { text: updated.text ?? '', visibility: updated.visibility, addFiles: [], removeFileIds: remaining }
        : item.draft && { ...item.draft, removeFileIds: remaining };
      next.push({ key: item.key, entry, draft, failed: true });
      continue;
    }
    next.push(failedUpdates.has(id) ? { ...item, failed: true } : item);
  }
  return next;
}

/** Every local preview URL the list holds (to revoke when the form goes away). */
export function draftFileUrls(items: readonly StagedSource[]): string[] {
  return items.flatMap((i) => (i.draft?.addFiles ?? []).map((f) => f.previewUrl).filter((u): u is string => !!u));
}

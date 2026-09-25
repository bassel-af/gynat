/**
 * Sources («المصادر») inside the person edit form — the STAGED list model.
 *
 * Nothing here talks to the server. The form keeps a list of rows (the
 * person's saved sources plus drafts), the user adds / edits / removes rows,
 * and «حفظ» turns the list into ONE plan (`buildSourcePlan`) that
 * `usePersonActions` persists in order: creates → links → updates → unlinks
 * → deletes. The starting person appears in a plan as `SOURCE_SELF` (a new
 * person has no id until it is created). After a partly-failed save
 * `applyPlanResult` drops what succeeded, so the retry never repeats a create.
 *
 * PII: texts may name living people — never log them.
 */
import type { PersonSourceDto, SourceEntryDto } from '@/lib/tree/source-entries-api';
import type { SourceVisibilityLevel } from '@/lib/tree/source-visibility';
import type { SourceEntryPatch } from '@/lib/tree/source-entry-undo';
import type { SourceSummaryDto } from '@/lib/tree/source-links';

/** A file uploaded (staged on the server) in the deferred form, not yet attached. */
export interface DraftFile {
  id: string;
  name: string;
  isImage: boolean;
  /** Local object URL for an image preview — owned by the list, revoked by it. */
  previewUrl: string | null;
}

/** A person on the form's «مصدر لـ» line (name as shown on the chip). */
export interface SourceDraftPerson {
  id: string;
  name: string;
}

/** What the deferred «إضافة مصدر» / «تعديل المصدر» form hands back on «حفظ». */
export interface SourceDraft {
  text: string;
  visibility: SourceVisibilityLevel;
  addFiles: DraftFile[];
  /** Saved files of the entry to delete on the parent «حفظ». */
  removeFileIds: string[];
  /**
   * «مصدر لـ»: the OTHER people on the line as the form left them — never
   * the starting person (a create adds them, or the SELF placeholder for a
   * new person). Absent ⇒ the form had no «مصدر لـ» line.
   */
  people?: SourceDraftPerson[];
  /** Edit: people to link / unlink against the saved source (never the starting person). */
  addPersonIds?: string[];
  removePersonIds?: string[];
  /**
   * Reuse («ربطه بهذا الشخص»): link this existing source to the starting
   * person (and `people`) instead of creating one. Text, files and level are
   * the source's own and are not changed.
   */
  linkSource?: SourceSummaryDto;
}

/** The starting person in a plan's `personIds` (resolved when the plan is saved). */
export const SOURCE_SELF = 'self';

/**
 * A saved source as the person route sends it: with the OTHER people this
 * viewer may see (`people` capped, `sharedCount` not).
 */
export type StagedEntry = SourceEntryDto & Partial<Pick<PersonSourceDto, 'people' | 'sharedCount'>>;

/**
 * How a saved row leaves this person: `unlink` = «إزالته عن … فقط» (the
 * source stays for the others; `onLastLink: 'keep'` = the answer to
 * «هذا آخر شخص لهذا المصدر»), `delete` = the source goes.
 */
export type SourceRemoval = { kind: 'delete' } | { kind: 'unlink'; onLastLink?: 'keep' };

export interface StagedSource {
  key: string;
  /** The saved source; absent for a row added in this form. */
  entry?: StagedEntry;
  /** Pending changes (always set for an added row). */
  draft?: SourceDraft;
  removal?: SourceRemoval;
  /** The last «حفظ» could not save this row. */
  failed?: boolean;
}

export type SourceRowState = 'saved' | 'added' | 'edited' | 'unlinked' | 'deleted';

export interface SourcePlanCreate {
  key: string;
  text: string | null;
  visibility: SourceVisibilityLevel;
  fileIds: string[];
  /** `SOURCE_SELF` first, then the other people. */
  personIds: string[];
}

/** Reuse: an existing source gains the starting person (and the others). */
export interface SourcePlanLink {
  key: string;
  sourceId: string;
  personIds: string[];
}

export interface SourcePlanUpdate {
  id: string;
  before: StagedEntry;
  patch: SourceEntryPatch;
  removeFileIds: string[];
  addPersonIds: string[];
  removePersonIds: string[];
}

export interface SourcePlanUnlink {
  id: string;
  before: StagedEntry;
  onLastLink?: 'keep';
}

export interface SourcePlanDelete {
  id: string;
  before: StagedEntry;
}

export interface SourcePlan {
  creates: SourcePlanCreate[];
  links: SourcePlanLink[];
  updates: SourcePlanUpdate[];
  unlinks: SourcePlanUnlink[];
  deletes: SourcePlanDelete[];
}

/** What a (partly) failed save did, for `applyPlanResult`. */
export interface SourcePlanResult {
  /** Create / link key → the saved source. */
  created: Record<string, StagedEntry>;
  failedCreates: string[];
  /** Source id → the source after its PATCH (the PATCH itself succeeded). */
  updated: Record<string, StagedEntry>;
  /** Source id of every update not fully saved (its PATCH or a file removal failed). */
  failedUpdates: string[];
  /** Source id → the files removed before a later removal failed. */
  removedFileIds?: Record<string, string[]>;
  /** Sources that left this person (unlinked or deleted). */
  deleted: string[];
  failedDeletes: string[];
}

export const EMPTY_SOURCE_PLAN: SourcePlan = { creates: [], links: [], updates: [], unlinks: [], deletes: [] };

let keyCounter = 0;
const nextKey = () => `staged-source-${++keyCounter}`;

export function stagedFromEntries(entries: readonly StagedEntry[]): StagedSource[] {
  return entries.map((entry) => ({ key: `saved-${entry.id}`, entry }));
}

export function addDraft(items: readonly StagedSource[], draft: SourceDraft): StagedSource[] {
  return [...items, { key: nextKey(), draft }];
}

export function replaceDraft(items: readonly StagedSource[], key: string, draft: SourceDraft): StagedSource[] {
  return items.map((item) => (item.key === key ? { ...item, draft, failed: false } : item));
}

/**
 * Remove a saved row from this person (or restore it when already removed);
 * an added row is removed outright.
 */
export function toggleRemoval(
  items: readonly StagedSource[],
  key: string,
  removal: SourceRemoval = { kind: 'delete' },
): StagedSource[] {
  const item = items.find((i) => i.key === key);
  if (!item) return [...items];
  if (!item.entry) return items.filter((i) => i.key !== key);
  return items.map((i) => (i.key === key ? { ...i, removal: i.removal ? undefined : removal, failed: false } : i));
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
  return (
    Object.keys(patchOf(entry, draft)).length > 0 ||
    draft.removeFileIds.length > 0 ||
    (draft.addPersonIds?.length ?? 0) > 0 ||
    (draft.removePersonIds?.length ?? 0) > 0
  );
}

export function rowState(item: StagedSource): SourceRowState {
  if (!item.entry) return 'added';
  if (item.removal) return item.removal.kind === 'delete' ? 'deleted' : 'unlinked';
  return isEdited(item.entry, item.draft) ? 'edited' : 'saved';
}

const isGone = (state: SourceRowState) => state === 'deleted' || state === 'unlinked';

/** «المصادر (N)» — the rows as they will be after saving. */
export function stagedCount(items: readonly StagedSource[]): number {
  return items.filter((i) => !isGone(rowState(i))).length;
}

/** How many OTHER people the row's source will be for after saving («مشترك مع …»). */
export function stagedSharedCount(item: StagedSource): number {
  const draft = item.draft;
  if (!item.entry) return (draft?.people?.length ?? 0) + (draft?.linkSource?.peopleCount ?? 0);
  const added = draft?.addPersonIds?.length ?? 0;
  const removed = draft?.removePersonIds?.length ?? 0;
  return Math.max(0, (item.entry.sharedCount ?? 0) + added - removed);
}

const othersOf = (draft: SourceDraft) => (draft.people ?? []).map((p) => p.id);

export function hasStagedChanges(items: readonly StagedSource[]): boolean {
  return items.some((i) => rowState(i) !== 'saved');
}

export function buildSourcePlan(items: readonly StagedSource[]): SourcePlan {
  const plan: SourcePlan = { creates: [], links: [], updates: [], unlinks: [], deletes: [] };
  for (const item of items) {
    const state = rowState(item);
    const { entry, draft } = item;
    if (state === 'added' && draft) {
      const personIds = [SOURCE_SELF, ...othersOf(draft)];
      if (draft.linkSource) {
        plan.links.push({ key: item.key, sourceId: draft.linkSource.id, personIds });
      } else {
        plan.creates.push({
          key: item.key,
          text: normText(draft.text),
          visibility: draft.visibility,
          fileIds: draft.addFiles.map((f) => f.id),
          personIds,
        });
      }
    } else if (state === 'edited' && entry && draft) {
      plan.updates.push({
        id: entry.id,
        before: entry,
        patch: patchOf(entry, draft),
        removeFileIds: [...draft.removeFileIds],
        addPersonIds: [...(draft.addPersonIds ?? [])],
        removePersonIds: [...(draft.removePersonIds ?? [])],
      });
    } else if (state === 'unlinked' && entry && item.removal?.kind === 'unlink') {
      plan.unlinks.push({
        id: entry.id,
        before: entry,
        ...(item.removal.onLastLink ? { onLastLink: item.removal.onLastLink } : {}),
      });
    } else if (state === 'deleted' && entry) {
      plan.deletes.push({ id: entry.id, before: entry });
    }
  }
  return plan;
}

export function isPlanEmpty(plan: SourcePlan): boolean {
  return (
    plan.creates.length + plan.links.length + plan.updates.length + plan.unlinks.length + plan.deletes.length === 0
  );
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

/**
 * Sources inside the person edit form — the staged list model (pure): what a
 * row is (saved / added / edited / marked for deletion), what «حفظ» must send,
 * and how a partly-failed save leaves the list for a retry.
 */
import { describe, it, expect } from 'vitest';
import {
  stagedFromEntries,
  addDraft,
  replaceDraft,
  toggleDelete,
  rowState,
  stagedCount,
  hasStagedChanges,
  buildSourcePlan,
  planInvolvesFiles,
  applyPlanResult,
  draftFileUrls,
  type SourceDraft,
} from '@/lib/tree/source-staging';
import type { SourceEntryDto } from '@/lib/tree/source-entries-api';

function entry(id: string, over: Partial<SourceEntryDto> = {}): SourceEntryDto {
  return { id, individualId: 'P1', text: `نص ${id}`, visibility: 'members', createdAt: '', updatedAt: '', files: [], ...over };
}

const pdf = { id: 'f1', mimeType: 'application/pdf' as const, sizeBytes: 1, fileName: 'd.pdf' };

function draft(over: Partial<SourceDraft> = {}): SourceDraft {
  return { text: 'جديد', visibility: 'admins', addFiles: [], removeFileIds: [], ...over };
}

describe('rows', () => {
  it('saved entries start unchanged and nothing is staged', () => {
    const items = stagedFromEntries([entry('a'), entry('b')]);
    expect(items.map(rowState)).toEqual(['saved', 'saved']);
    expect(stagedCount(items)).toBe(2);
    expect(hasStagedChanges(items)).toBe(false);
  });

  it('an added draft is a new row', () => {
    const items = addDraft(stagedFromEntries([entry('a')]), draft());
    expect(rowState(items[1])).toBe('added');
    expect(stagedCount(items)).toBe(2);
    expect(hasStagedChanges(items)).toBe(true);
  });

  it('a saved entry with a different draft is edited; an identical draft is not', () => {
    const items = stagedFromEntries([entry('a')]);
    const key = items[0].key;
    const same = replaceDraft(items, key, draft({ text: 'نص a', visibility: 'members' }));
    expect(rowState(same[0])).toBe('saved');
    const edited = replaceDraft(items, key, draft({ text: 'نص آخر', visibility: 'members' }));
    expect(rowState(edited[0])).toBe('edited');
  });

  it('marking for deletion drops it from the count; toggling again restores it', () => {
    const items = stagedFromEntries([entry('a'), entry('b')]);
    const marked = toggleDelete(items, items[0].key);
    expect(rowState(marked[0])).toBe('deleted');
    expect(stagedCount(marked)).toBe(1);
    const restored = toggleDelete(marked, items[0].key);
    expect(rowState(restored[0])).toBe('saved');
    expect(hasStagedChanges(restored)).toBe(false);
  });

  it('deleting an added row removes it outright', () => {
    const items = addDraft([], draft());
    expect(toggleDelete(items, items[0].key)).toEqual([]);
  });
});

describe('buildSourcePlan', () => {
  it('creates, updates (with file removals) and deletes', () => {
    let items = stagedFromEntries([entry('a'), entry('b', { files: [pdf] }), entry('c')]);
    items = addDraft(items, draft({ addFiles: [{ id: 'up1', name: 'x.png', isImage: true, previewUrl: 'blob:1' }] }));
    items = replaceDraft(items, items[1].key, draft({ text: 'نص b', visibility: 'public', removeFileIds: ['f1'] }));
    items = toggleDelete(items, items[2].key);
    const plan = buildSourcePlan(items);
    expect(plan.creates).toEqual([
      { key: items[3].key, text: 'جديد', visibility: 'admins', fileIds: ['up1'] },
    ]);
    expect(plan.updates).toEqual([
      { id: 'b', before: items[1].entry, patch: { visibility: 'public' }, removeFileIds: ['f1'] },
    ]);
    expect(plan.deletes).toEqual([{ id: 'c', before: items[2].entry }]);
  });

  it('sends an empty text as null and new uploads as fileIds', () => {
    let items = stagedFromEntries([entry('a')]);
    items = replaceDraft(
      items,
      items[0].key,
      draft({ text: '  ', visibility: 'members', addFiles: [{ id: 'up', name: 'p.pdf', isImage: false, previewUrl: null }] }),
    );
    expect(buildSourcePlan(items).updates[0].patch).toEqual({ text: null, fileIds: ['up'] });
  });

  it('is empty when nothing changed', () => {
    expect(buildSourcePlan(stagedFromEntries([entry('a')]))).toEqual({ creates: [], updates: [], deletes: [] });
  });
});

describe('planInvolvesFiles', () => {
  it('is false for text-only work', () => {
    let items = addDraft(stagedFromEntries([entry('a'), entry('b')]), draft());
    items = toggleDelete(items, items[1].key);
    expect(planInvolvesFiles(buildSourcePlan(items))).toBe(false);
  });

  it('is true for a create with files, a delete of an entry with files, or a file removal', () => {
    const withUpload = addDraft([], draft({ addFiles: [{ id: 'u', name: 'u', isImage: false, previewUrl: null }] }));
    expect(planInvolvesFiles(buildSourcePlan(withUpload))).toBe(true);
    const items = stagedFromEntries([entry('b', { files: [pdf] })]);
    expect(planInvolvesFiles(buildSourcePlan(toggleDelete(items, items[0].key)))).toBe(true);
    const removal = replaceDraft(items, items[0].key, draft({ text: 'نص b', visibility: 'members', removeFileIds: ['f1'] }));
    expect(planInvolvesFiles(buildSourcePlan(removal))).toBe(true);
  });
});

describe('applyPlanResult (after a partly-failed save)', () => {
  it('drops what succeeded and flags what failed, so a retry never re-creates a saved entry', () => {
    let items = stagedFromEntries([entry('a'), entry('b')]);
    items = addDraft(items, draft({ text: 'أول' }));
    items = addDraft(items, draft({ text: 'ثان' }));
    items = replaceDraft(items, items[0].key, draft({ text: 'معدل', visibility: 'members' }));
    items = toggleDelete(items, items[1].key);
    const [kA, kB, k1, k2] = items.map((i) => i.key);

    const next = applyPlanResult(items, {
      created: { [k1]: entry('S-NEW', { text: 'أول', visibility: 'admins' }) },
      failedCreates: [k2],
      updated: {},
      failedUpdates: ['a'],
      deleted: ['b'],
      failedDeletes: [],
    });

    expect(next.find((i) => i.key === kB)).toBeUndefined();
    expect(rowState(next.find((i) => i.key === k1)!)).toBe('saved');
    expect(next.find((i) => i.key === k2)!.failed).toBe(true);
    expect(next.find((i) => i.key === kA)!.failed).toBe(true);

    const retry = buildSourcePlan(next);
    expect(retry.creates.map((c) => c.text)).toEqual(['ثان']);
    expect(retry.updates.map((u) => u.id)).toEqual(['a']);
    expect(retry.deletes).toEqual([]);
  });

  it('a patched entry whose file removal failed keeps only the removal', () => {
    let items = stagedFromEntries([entry('b', { files: [pdf, { ...pdf, id: 'f2' }] })]);
    items = replaceDraft(items, items[0].key, draft({ text: 'جديد', visibility: 'members', removeFileIds: ['f1', 'f2'] }));
    const next = applyPlanResult(items, {
      created: {},
      failedCreates: [],
      updated: { b: entry('b', { text: 'جديد', files: [pdf, { ...pdf, id: 'f2' }] }) },
      failedUpdates: ['b'],
      removedFileIds: { b: ['f1'] },
      deleted: [],
      failedDeletes: [],
    });
    const plan = buildSourcePlan(next);
    expect(plan.updates).toEqual([{ id: 'b', before: next[0].entry, patch: {}, removeFileIds: ['f2'] }]);
  });
});

describe('draftFileUrls', () => {
  it('lists the local previews the list owns', () => {
    const items = addDraft([], draft({ addFiles: [{ id: 'u', name: 'u', isImage: true, previewUrl: 'blob:u' }] }));
    expect(draftFileUrls(items)).toEqual(['blob:u']);
  });
});

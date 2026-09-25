/**
 * Sources inside the person edit form — the staged list model (pure): what a
 * row is (saved / added / edited / removed from this person / deleted), what «حفظ» must send,
 * and how a partly-failed save leaves the list for a retry.
 */
import { describe, it, expect } from 'vitest';
import {
  stagedFromEntries,
  addDraft,
  replaceDraft,
  toggleRemoval,
  stagedSharedCount,
  SOURCE_SELF,
  rowState,
  stagedCount,
  hasStagedChanges,
  buildSourcePlan,
  planInvolvesFiles,
  applyPlanResult,
  draftFileUrls,
  type SourceDraft,
} from '@/lib/tree/source-staging';
import type { StagedEntry } from '@/lib/tree/source-staging';

function entry(id: string, over: Partial<StagedEntry> = {}): StagedEntry {
  return { id, individualId: 'P1', text: `نص ${id}`, visibility: 'members', createdAt: '', updatedAt: '', files: [], people: [], sharedCount: 0, ...over };
}

const summary = { id: 'S-DAFTAR', text: 'دفتر العائلة', visibility: 'members' as const, fileCount: 3, peopleCount: 10, firstPersonName: null };

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
    const marked = toggleRemoval(items, items[0].key);
    expect(rowState(marked[0])).toBe('deleted');
    expect(stagedCount(marked)).toBe(1);
    const restored = toggleRemoval(marked, items[0].key);
    expect(rowState(restored[0])).toBe('saved');
    expect(hasStagedChanges(restored)).toBe(false);
  });

  it('deleting an added row removes it outright', () => {
    const items = addDraft([], draft());
    expect(toggleRemoval(items, items[0].key)).toEqual([]);
  });
});

describe('buildSourcePlan', () => {
  it('creates, updates (with file removals) and deletes', () => {
    let items = stagedFromEntries([entry('a'), entry('b', { files: [pdf] }), entry('c')]);
    items = addDraft(items, draft({ addFiles: [{ id: 'up1', name: 'x.png', isImage: true, previewUrl: 'blob:1' }] }));
    items = replaceDraft(items, items[1].key, draft({ text: 'نص b', visibility: 'public', removeFileIds: ['f1'] }));
    items = toggleRemoval(items, items[2].key);
    const plan = buildSourcePlan(items);
    expect(plan.creates).toEqual([
      { key: items[3].key, text: 'جديد', visibility: 'admins', fileIds: ['up1'], personIds: [SOURCE_SELF] },
    ]);
    expect(plan.updates).toEqual([
      { id: 'b', before: items[1].entry, patch: { visibility: 'public' }, removeFileIds: ['f1'], addPersonIds: [], removePersonIds: [] },
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
    expect(buildSourcePlan(stagedFromEntries([entry('a')]))).toEqual({
      creates: [], links: [], updates: [], unlinks: [], deletes: [],
    });
  });

  it('a new source for several people carries the starting person (SELF) first, then the others', () => {
    const items = addDraft([], draft({ people: [{ id: 'P2', name: 'فاطمة' }, { id: 'P3', name: 'أحمد' }] }));
    expect(buildSourcePlan(items).creates[0].personIds).toEqual([SOURCE_SELF, 'P2', 'P3']);
  });

  it('a reused source is a LINK, never a create', () => {
    const items = addDraft([], draft({ text: '', linkSource: summary, people: [{ id: 'P2', name: 'فاطمة' }] }));
    const plan = buildSourcePlan(items);
    expect(plan.creates).toEqual([]);
    expect(plan.links).toEqual([{ key: items[0].key, sourceId: 'S-DAFTAR', personIds: [SOURCE_SELF, 'P2'] }]);
  });

  it('a people-only edit is an update with the deltas and no content patch', () => {
    const items = stagedFromEntries([entry('a', { sharedCount: 2 })]);
    const edited = replaceDraft(items, items[0].key, draft({
      text: 'نص a', visibility: 'members', addPersonIds: ['P4'], removePersonIds: ['P2'],
    }));
    expect(rowState(edited[0])).toBe('edited');
    expect(buildSourcePlan(edited).updates).toEqual([
      { id: 'a', before: edited[0].entry, patch: {}, removeFileIds: [], addPersonIds: ['P4'], removePersonIds: ['P2'] },
    ]);
  });

  it('removing the source from this person only is an unlink; the answer to the last-person question travels with it', () => {
    const items = stagedFromEntries([entry('a', { sharedCount: 3 }), entry('b')]);
    let next = toggleRemoval(items, items[0].key, { kind: 'unlink' });
    next = toggleRemoval(next, items[1].key, { kind: 'unlink', onLastLink: 'keep' });
    expect(next.map(rowState)).toEqual(['unlinked', 'unlinked']);
    expect(stagedCount(next)).toBe(0);
    const plan = buildSourcePlan(next);
    expect(plan.unlinks).toEqual([
      { id: 'a', before: items[0].entry },
      { id: 'b', before: items[1].entry, onLastLink: 'keep' },
    ]);
    expect(plan.deletes).toEqual([]);
  });
});

describe('stagedSharedCount («مشترك مع …» on a row)', () => {
  it('a saved row counts its other people after the staged edit', () => {
    const items = stagedFromEntries([entry('a', { sharedCount: 3 })]);
    expect(stagedSharedCount(items[0])).toBe(3);
    const edited = replaceDraft(items, items[0].key, draft({ text: 'نص a', visibility: 'members', addPersonIds: ['P9'], removePersonIds: ['P2', 'P3'] }));
    expect(stagedSharedCount(edited[0])).toBe(2);
  });

  it('an added row counts the people picked; a reused source adds its own people', () => {
    expect(stagedSharedCount(addDraft([], draft({ people: [{ id: 'P2', name: 'x' }] }))[0])).toBe(1);
    expect(stagedSharedCount(addDraft([], draft({ linkSource: summary }))[0])).toBe(10);
  });
});

describe('planInvolvesFiles', () => {
  it('is false for text-only work', () => {
    let items = addDraft(stagedFromEntries([entry('a'), entry('b')]), draft());
    items = toggleRemoval(items, items[1].key);
    expect(planInvolvesFiles(buildSourcePlan(items))).toBe(false);
  });

  it('is true for a create with files, a delete of an entry with files, or a file removal', () => {
    const withUpload = addDraft([], draft({ addFiles: [{ id: 'u', name: 'u', isImage: false, previewUrl: null }] }));
    expect(planInvolvesFiles(buildSourcePlan(withUpload))).toBe(true);
    const items = stagedFromEntries([entry('b', { files: [pdf] })]);
    expect(planInvolvesFiles(buildSourcePlan(toggleRemoval(items, items[0].key)))).toBe(true);
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
    items = toggleRemoval(items, items[1].key);
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
    expect(plan.updates).toEqual([
      { id: 'b', before: next[0].entry, patch: {}, removeFileIds: ['f2'], addPersonIds: [], removePersonIds: [] },
    ]);
  });
});

describe('draftFileUrls', () => {
  it('lists the local previews the list owns', () => {
    const items = addDraft([], draft({ addFiles: [{ id: 'u', name: 'u', isImage: true, previewUrl: 'blob:u' }] }));
    expect(draftFileUrls(items)).toEqual(['blob:u']);
  });
});

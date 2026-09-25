/**
 * Sources («المصادر») — which UI mutations push an undo entry, what
 * that entry restores, and that it can be redone only when redo can work.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));
const mockNotify = vi.fn();
vi.mock('@/hooks/usePersonSources', () => ({ notifySourcesChanged: () => mockNotify() }));

import { apiFetch } from '@/lib/api/client';
import {
  sourceCreateUndoEntry,
  sourceUpdateUndoEntry,
  sourceDeleteUndoEntry,
  sourceLinkUndoEntry,
  sourceUnlinkUndoEntry,
} from '@/lib/tree/source-entry-undo';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

function ok(data: unknown = {}) {
  return { ok: true, status: 200, json: () => Promise.resolve({ data }) } as unknown as Response;
}

function entry(over: Record<string, unknown> = {}) {
  return {
    id: 'S1',
    individualId: 'P1',
    text: 'طبقات ابن سعد',
    visibility: 'members' as const,
    createdAt: '',
    updatedAt: '',
    files: [] as { id: string; mimeType: 'image/png'; sizeBytes: number; fileName: string }[],
    ...over,
  };
}

const FILE = { id: 'F1', mimeType: 'image/png' as const, sizeBytes: 1, fileName: 'a.png' };

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockResolvedValue(ok({ id: 'S2' }));
});

const body = (n: number) => JSON.parse(mockApiFetch.mock.calls[n][1].body);
const url = (n: number) => mockApiFetch.mock.calls[n][0];
const method = (n: number) => mockApiFetch.mock.calls[n][1].method;

describe('sourceCreateUndoEntry', () => {
  test('a text source for many people is undoable, and redo re-creates it for all of them', async () => {
    const e = sourceCreateUndoEntry({ workspaceId: 'ws', created: entry(), personIds: ['P1', 'P2', 'P3'] });
    expect(e.label).toBe('إضافة مصدر لـ ٣ أشخاص');
    expect(e.undoOnly).toBeFalsy();
    await e.undo();
    expect(url(0)).toBe('/api/workspaces/ws/tree/sources/S1');
    expect(method(0)).toBe('DELETE');
    expect(mockNotify).toHaveBeenCalledTimes(1);
    await e.redo();
    expect(url(1)).toBe('/api/workspaces/ws/tree/sources');
    expect(body(1)).toEqual({ text: 'طبقات ابن سعد', visibility: 'members', personIds: ['P1', 'P2', 'P3'] });
    expect(mockNotify).toHaveBeenCalledTimes(2);
  });

  test('a one-person source reads «إضافة مصدر»', () => {
    expect(sourceCreateUndoEntry({ workspaceId: 'ws', created: entry(), personIds: ['P1'] }).label).toBe('إضافة مصدر');
  });

  test('a source created with files can be undone but never redone', () => {
    const e = sourceCreateUndoEntry({ workspaceId: 'ws', created: entry({ files: [FILE] }), personIds: ['P1'] });
    expect(e.undoOnly).toBe(true);
  });
});

describe('sourceLinkUndoEntry (reuse: «ربطه بهذا الشخص»)', () => {
  test('undo removes exactly the linked people and keeps the source; redo links them again', async () => {
    const e = sourceLinkUndoEntry({ workspaceId: 'ws', sourceId: 'S1', personIds: ['P1', 'P2'], treeId: 'T' });
    expect(e.label).toBe('إضافة مصدر لـ شخصين');
    expect(e.undoOnly).toBeFalsy();
    await e.undo();
    expect(url(0)).toBe('/api/workspaces/ws/tree/sources/S1');
    expect(method(0)).toBe('PATCH');
    // An orphan that was linked goes back to being an orphan, never deleted.
    expect(body(0)).toEqual({ removePersonIds: ['P1', 'P2'], onLastLink: 'keep', treeId: 'T' });
    await e.redo();
    expect(body(1)).toEqual({ addPersonIds: ['P1', 'P2'], treeId: 'T' });
    expect(mockNotify).toHaveBeenCalledTimes(2);
  });
});

describe('sourceUpdateUndoEntry', () => {
  test('restores only the fields that changed', async () => {
    const e = sourceUpdateUndoEntry({
      workspaceId: 'ws',
      before: entry(),
      patch: { text: 'طبقات ابن سعد، ص ٩٠' },
      treeId: 'T',
    });
    expect(e).not.toBeNull();
    await e!.undo();
    expect(body(0)).toEqual({ text: 'طبقات ابن سعد', treeId: 'T' });
    await e!.redo();
    expect(body(1)).toEqual({ text: 'طبقات ابن سعد، ص ٩٠', treeId: 'T' });
  });

  test('a cleared text comes back on undo', async () => {
    const e = sourceUpdateUndoEntry({ workspaceId: 'ws', before: entry({ files: [FILE] }), patch: { text: null } });
    await e!.undo();
    expect(body(0)).toEqual({ text: 'طبقات ابن سعد' });
  });

  test('adding files only pushes nothing (file uploads are not undoable)', () => {
    expect(sourceUpdateUndoEntry({ workspaceId: 'ws', before: entry(), patch: { fileIds: ['F9'] } })).toBeNull();
  });

  test('a people-only change is undoable in ONE PATCH each way', async () => {
    const e = sourceUpdateUndoEntry({
      workspaceId: 'ws',
      before: entry(),
      patch: {},
      addPersonIds: ['P4'],
      removePersonIds: ['P2'],
      people: 3,
    });
    expect(e!.label).toBe('تعديل مصدر لـ ٣ أشخاص');
    await e!.undo();
    expect(body(0)).toEqual({ addPersonIds: ['P2'], removePersonIds: ['P4'], onLastLink: 'keep' });
    await e!.redo();
    expect(body(1)).toEqual({ addPersonIds: ['P4'], removePersonIds: ['P2'] });
  });

  test('text and people changed together travel in the same PATCH', async () => {
    const e = sourceUpdateUndoEntry({
      workspaceId: 'ws',
      before: entry(),
      patch: { text: 'جديد' },
      addPersonIds: ['P4'],
    });
    await e!.undo();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(body(0)).toEqual({ text: 'طبقات ابن سعد', removePersonIds: ['P4'], onLastLink: 'keep' });
  });
});

describe('sourceUnlinkUndoEntry («إزالته عن … فقط»)', () => {
  test('a plain removal: undo links the person again, redo removes them', async () => {
    const e = sourceUnlinkUndoEntry({
      workspaceId: 'ws', before: entry(), personId: 'P1', personName: 'أحمد', outcome: 'unlinked', isAdmin: true,
    });
    expect(e!.label).toBe('إزالة مصدر عن أحمد');
    await e!.undo();
    expect(body(0)).toEqual({ addPersonIds: ['P1'] });
    await e!.redo();
    expect(body(1)).toEqual({ removePersonIds: ['P1'] });
  });

  test('kept as «ليس مصدرًا لأحد»: redo repeats the same answer', async () => {
    const e = sourceUnlinkUndoEntry({
      workspaceId: 'ws', before: entry(), personId: 'P1', personName: 'أحمد', outcome: 'kept', isAdmin: true,
    });
    await e!.redo();
    expect(body(0)).toEqual({ removePersonIds: ['P1'], onLastLink: 'keep' });
  });

  test('deleted with its last person: a text-only source is re-created for that person', async () => {
    const e = sourceUnlinkUndoEntry({
      workspaceId: 'ws', before: entry(), personId: 'P1', personName: 'أحمد', outcome: 'deleted', isAdmin: true,
    });
    await e!.undo();
    expect(url(0)).toBe('/api/workspaces/ws/tree/sources');
    expect(body(0)).toEqual({ text: 'طبقات ابن سعد', visibility: 'members', personIds: ['P1'] });
    await e!.redo();
    expect(url(1)).toBe('/api/workspaces/ws/tree/sources/S2');
    expect(method(1)).toBe('DELETE');
  });

  test('deleted with its files: not undoable', () => {
    expect(
      sourceUnlinkUndoEntry({
        workspaceId: 'ws', before: entry({ files: [FILE] }), personId: 'P1', personName: 'أحمد', outcome: 'deleted', isAdmin: true,
      }),
    ).toBeNull();
  });
});

describe('sourceDeleteUndoEntry', () => {
  test('a text-only source comes back for EVERY person it was for', async () => {
    const e = sourceDeleteUndoEntry({
      workspaceId: 'ws', deleted: entry(), personIds: ['P1', 'P2'], deletedAll: true, isAdmin: true,
    });
    await e!.undo();
    expect(url(0)).toBe('/api/workspaces/ws/tree/sources');
    expect(body(0)).toEqual({ text: 'طبقات ابن سعد', visibility: 'members', personIds: ['P1', 'P2'] });
  });

  test('a non-admin restore uses «المشرفون فقط» (the only level they may create)', async () => {
    const e = sourceDeleteUndoEntry({
      workspaceId: 'ws', deleted: entry(), personIds: ['P1'], deletedAll: true, isAdmin: false,
    });
    await e!.undo();
    expect(body(0).visibility).toBe('admins');
  });

  test('a source with files is not undoable', () => {
    expect(
      sourceDeleteUndoEntry({ workspaceId: 'ws', deleted: entry({ files: [FILE] }), personIds: ['P1'], deletedAll: true, isAdmin: true }),
    ).toBeNull();
  });

  test('a partial delete (the source stayed for hidden people) is undone by re-linking the same source', async () => {
    const e = sourceDeleteUndoEntry({
      workspaceId: 'ws', deleted: entry({ files: [FILE] }), personIds: ['P1', 'P2'], deletedAll: false, isAdmin: false,
    });
    await e!.undo();
    expect(url(0)).toBe('/api/workspaces/ws/tree/sources/S1');
    expect(body(0)).toEqual({ addPersonIds: ['P1', 'P2'] });
    await e!.redo();
    expect(url(1)).toBe('/api/workspaces/ws/tree/sources/S1');
    expect(method(1)).toBe('DELETE');
  });
});

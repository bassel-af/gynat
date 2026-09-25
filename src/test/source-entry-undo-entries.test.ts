/**
 * Sources («المصادر») step 6a — which UI mutations push an undo entry, what
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

describe('sourceCreateUndoEntry', () => {
  test('a text entry is undoable and redoable', async () => {
    const e = sourceCreateUndoEntry({ workspaceId: 'ws', individualId: 'P1', created: entry() });
    expect(e.label).toBe('إضافة مصدر');
    expect(e.undoOnly).toBeFalsy();
    await e.undo();
    expect(mockApiFetch.mock.calls[0][0]).toBe('/api/workspaces/ws/tree/sources/S1');
    expect(mockApiFetch.mock.calls[0][1].method).toBe('DELETE');
    expect(mockNotify).toHaveBeenCalledTimes(1);
    await e.redo();
    expect(JSON.parse(mockApiFetch.mock.calls[1][1].body)).toEqual({ text: 'طبقات ابن سعد', visibility: 'members' });
    expect(mockNotify).toHaveBeenCalledTimes(2);
  });

  test('an entry created with files can be undone but never redone', () => {
    const e = sourceCreateUndoEntry({
      workspaceId: 'ws',
      individualId: 'P1',
      created: entry({ files: [FILE] }),
    });
    expect(e.undoOnly).toBe(true);
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
    expect(JSON.parse(mockApiFetch.mock.calls[0][1].body)).toEqual({ text: 'طبقات ابن سعد', treeId: 'T' });
    await e!.redo();
    expect(JSON.parse(mockApiFetch.mock.calls[1][1].body)).toEqual({ text: 'طبقات ابن سعد، ص ٩٠', treeId: 'T' });
  });

  test('a cleared text comes back on undo', async () => {
    const e = sourceUpdateUndoEntry({ workspaceId: 'ws', before: entry({ files: [FILE] }), patch: { text: null } });
    await e!.undo();
    expect(JSON.parse(mockApiFetch.mock.calls[0][1].body)).toEqual({ text: 'طبقات ابن سعد' });
  });

  test('adding files only pushes nothing (file uploads are not undoable)', () => {
    expect(sourceUpdateUndoEntry({ workspaceId: 'ws', before: entry(), patch: { fileIds: ['F9'] } })).toBeNull();
  });
});

describe('sourceDeleteUndoEntry', () => {
  test('a text-only entry comes back at its level for an admin', async () => {
    const e = sourceDeleteUndoEntry({ workspaceId: 'ws', deleted: entry(), isAdmin: true });
    await e!.undo();
    expect(JSON.parse(mockApiFetch.mock.calls[0][1].body)).toEqual({ text: 'طبقات ابن سعد', visibility: 'members' });
  });

  test('a non-admin restore uses «المشرفون فقط» (the only level they may create)', async () => {
    const e = sourceDeleteUndoEntry({ workspaceId: 'ws', deleted: entry(), isAdmin: false });
    await e!.undo();
    expect(JSON.parse(mockApiFetch.mock.calls[0][1].body).visibility).toBe('admins');
  });

  test('an entry with files is not undoable', () => {
    expect(sourceDeleteUndoEntry({ workspaceId: 'ws', deleted: entry({ files: [FILE] }), isAdmin: true })).toBeNull();
  });
});

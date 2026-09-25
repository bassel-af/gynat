/**
 * Sources («المصادر») step 4 — undo/redo inverse builders, labels, and the
 * person-delete undo that restores a person's text entries.
 *
 * What can break: the URL, the method, the body, `treeId` propagation, the
 * id re-capture across undo/redo, and `isUndo: true` on every call.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '@/lib/api/client';
import {
  buildCreateSourceEntryInverse,
  buildUpdateSourceEntryInverse,
  buildDeleteSourceEntryInverse,
  buildDeleteIndividualInverse,
} from '@/lib/tree/undo-builders';
import { buildUndoLabel } from '@/lib/tree/undo-label';
import { restorableSourceEntries } from '@/lib/tree/source-entries-api';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

const WS = 'ws-1';
const TREE = 'tree-extra-1';

function okJson(data: unknown) {
  return { ok: true, status: 201, json: () => Promise.resolve({ data }) } as unknown as Response;
}

function call(n: number): [string, Record<string, unknown>] {
  const [path, init] = mockApiFetch.mock.calls[n] as [string, Record<string, unknown>];
  return [path, init ?? {}];
}

function bodyOf(n: number): Record<string, unknown> {
  return JSON.parse(call(n)[1].body as string);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockResolvedValue(okJson({ id: 'S-NEW' }));
});

describe('buildCreateSourceEntryInverse', () => {
  const params = {
    workspaceId: WS,
    individualId: 'P1',
    createdId: 'S1',
    createPayload: { text: 'طبقات', visibility: 'admins' as const },
    treeId: TREE,
  };

  test('undo deletes the created entry in the target tree', async () => {
    await buildCreateSourceEntryInverse(params).undo();
    const [path, init] = call(0);
    expect(path).toBe(`/api/workspaces/${WS}/tree/sources/S1`);
    expect(init).toMatchObject({ method: 'DELETE', isUndo: true });
    expect(bodyOf(0)).toEqual({ treeId: TREE });
  });

  test('redo re-creates on the person and the next undo deletes the NEW id', async () => {
    const inv = buildCreateSourceEntryInverse(params);
    await inv.undo();
    await inv.redo();
    expect(call(1)[0]).toBe(`/api/workspaces/${WS}/tree/individuals/P1/sources`);
    expect(bodyOf(1)).toEqual({ text: 'طبقات', visibility: 'admins', treeId: TREE });
    await inv.undo();
    expect(call(2)[0]).toBe(`/api/workspaces/${WS}/tree/sources/S-NEW`);
  });
});

describe('buildUpdateSourceEntryInverse', () => {
  test('undo PATCHes the before values, redo the after values', async () => {
    const inv = buildUpdateSourceEntryInverse({
      workspaceId: WS,
      entryId: 'S1',
      before: { text: 'قديم' },
      after: { text: 'جديد' },
    });
    await inv.undo();
    await inv.redo();
    expect(call(0)[0]).toBe(`/api/workspaces/${WS}/tree/sources/S1`);
    expect(call(0)[1]).toMatchObject({ method: 'PATCH', isUndo: true });
    expect(bodyOf(0)).toEqual({ text: 'قديم' });
    expect(bodyOf(1)).toEqual({ text: 'جديد' });
  });
});

describe('buildDeleteSourceEntryInverse', () => {
  test('undo re-creates with the same text and level; redo deletes the new id', async () => {
    const inv = buildDeleteSourceEntryInverse({
      workspaceId: WS,
      individualId: 'P1',
      deletedId: 'S1',
      snapshot: { text: 'طبقات', visibility: 'members' },
    });
    await inv.undo();
    expect(call(0)[0]).toBe(`/api/workspaces/${WS}/tree/individuals/P1/sources`);
    expect(call(0)[1]).toMatchObject({ method: 'POST', isUndo: true });
    expect(bodyOf(0)).toEqual({ text: 'طبقات', visibility: 'members' });
    await inv.redo();
    expect(call(1)[0]).toBe(`/api/workspaces/${WS}/tree/sources/S-NEW`);
    expect(call(1)[1]).toMatchObject({ method: 'DELETE' });
  });
});

describe('person-delete undo restores text entries', () => {
  const entries = [
    { text: 'أ', visibility: 'admins' as const },
    { text: 'ب', visibility: 'members' as const },
  ];

  test('undo re-creates the person, then each entry under the NEW person id', async () => {
    mockApiFetch.mockResolvedValue(okJson({ id: 'P-NEW' }));
    const inv = buildDeleteIndividualInverse({
      workspaceId: WS,
      deletedId: 'P1',
      snapshot: { givenName: 'علي' },
      sourceEntries: entries,
      treeId: TREE,
    });
    await inv.undo();
    expect(call(0)[0]).toBe(`/api/workspaces/${WS}/tree/individuals`);
    const entryCalls = mockApiFetch.mock.calls.slice(1).map((c) => c[0]);
    expect(entryCalls).toEqual([
      `/api/workspaces/${WS}/tree/individuals/P-NEW/sources`,
      `/api/workspaces/${WS}/tree/individuals/P-NEW/sources`,
    ]);
    expect([bodyOf(1), bodyOf(2)]).toEqual([
      { text: 'أ', visibility: 'admins', treeId: TREE },
      { text: 'ب', visibility: 'members', treeId: TREE },
    ]);
  });

  test('a failed entry restore does not fail the person restore', async () => {
    mockApiFetch
      .mockResolvedValueOnce(okJson({ id: 'P-NEW' }))
      .mockResolvedValueOnce({ ok: false, status: 403, json: () => Promise.resolve({}) } as unknown as Response)
      .mockResolvedValueOnce(okJson({ id: 'S2' }));
    const inv = buildDeleteIndividualInverse({
      workspaceId: WS,
      deletedId: 'P1',
      snapshot: {},
      sourceEntries: entries,
    });
    await expect(inv.undo()).resolves.toBeUndefined();
  });

  test('without entries the undo is the single person POST', async () => {
    await buildDeleteIndividualInverse({ workspaceId: WS, deletedId: 'P1', snapshot: {} }).undo();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });
});

describe('restorableSourceEntries', () => {
  const dto = (text: string | null, visibility: 'admins' | 'members' | 'public') => ({
    id: 'x',
    individualId: 'P1',
    text,
    visibility,
    createdAt: '',
    updatedAt: '',
    files: [],
  });

  test('an admin keeps every level', () => {
    expect(restorableSourceEntries([dto('أ', 'public')], true)).toEqual([{ text: 'أ', visibility: 'public' }]);
  });

  test('a non-admin restores at «المشرفون فقط» (the only level they may set)', () => {
    expect(restorableSourceEntries([dto('أ', 'members')], false)).toEqual([{ text: 'أ', visibility: 'admins' }]);
  });

  test('file-only entries (no text) are not restorable', () => {
    expect(restorableSourceEntries([dto(null, 'admins')], true)).toEqual([]);
  });
});

describe('labels', () => {
  test.each([
    ['createSourceEntry', 'إضافة مصدر'],
    ['updateSourceEntry', 'تعديل مصدر'],
    ['deleteSourceEntry', 'حذف مصدر'],
  ] as const)('%s → %s', (kind, label) => {
    expect(buildUndoLabel({ kind })).toBe(label);
  });
});

/**
 * Sources («المصادر») step 4 — undo/redo inverse builders, labels, and the
 * person-delete undo that re-links a person's sources.
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
    createdId: 'S1',
    createPayload: { text: 'دفتر العائلة', visibility: 'admins' as const, personIds: ['P1', 'P2', 'P3'] },
    treeId: TREE,
  };

  test('undo deletes the created source in the target tree', async () => {
    await buildCreateSourceEntryInverse(params).undo();
    const [path, init] = call(0);
    expect(path).toBe(`/api/workspaces/${WS}/tree/sources/S1`);
    expect(init).toMatchObject({ method: 'DELETE', isUndo: true });
    expect(bodyOf(0)).toEqual({ treeId: TREE });
  });

  test('redo re-creates the source for EVERY person, and the next undo deletes the NEW id', async () => {
    const inv = buildCreateSourceEntryInverse(params);
    await inv.undo();
    await inv.redo();
    expect(call(1)[0]).toBe(`/api/workspaces/${WS}/tree/sources`);
    expect(call(1)[1]).toMatchObject({ method: 'POST', isUndo: true });
    expect(bodyOf(1)).toEqual({ text: 'دفتر العائلة', visibility: 'admins', personIds: ['P1', 'P2', 'P3'], treeId: TREE });
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
  test('undo re-creates with the same text, level and people through POST sources; redo deletes the new id', async () => {
    const inv = buildDeleteSourceEntryInverse({
      workspaceId: WS,
      deletedId: 'S1',
      snapshot: { text: 'طبقات', visibility: 'members', personIds: ['P1', 'P2'] },
    });
    await inv.undo();
    expect(call(0)[0]).toBe(`/api/workspaces/${WS}/tree/sources`);
    expect(call(0)[1]).toMatchObject({ method: 'POST', isUndo: true });
    expect(bodyOf(0)).toEqual({ text: 'طبقات', visibility: 'members', personIds: ['P1', 'P2'] });
    await inv.redo();
    expect(call(1)[0]).toBe(`/api/workspaces/${WS}/tree/sources/S-NEW`);
    expect(call(1)[1]).toMatchObject({ method: 'DELETE' });
  });
});

describe('person-delete undo RE-LINKS the existing sources (never duplicates them)', () => {
  test('undo re-creates the person, then links each captured source to the NEW person id', async () => {
    mockApiFetch.mockResolvedValue(okJson({ id: 'P-NEW' }));
    const inv = buildDeleteIndividualInverse({
      workspaceId: WS,
      deletedId: 'P1',
      snapshot: { givenName: 'علي' },
      sourceIds: ['S1', 'S2'],
      treeId: TREE,
    });
    await inv.undo();
    expect(call(0)[0]).toBe(`/api/workspaces/${WS}/tree/individuals`);
    expect(mockApiFetch.mock.calls.slice(1).map((c) => [c[0], (c[1] as { method: string }).method])).toEqual([
      [`/api/workspaces/${WS}/tree/sources/S1`, 'PATCH'],
      [`/api/workspaces/${WS}/tree/sources/S2`, 'PATCH'],
    ]);
    expect([bodyOf(1), bodyOf(2)]).toEqual([
      { addPersonIds: ['P-NEW'], treeId: TREE },
      { addPersonIds: ['P-NEW'], treeId: TREE },
    ]);
    expect(call(1)[1]).toMatchObject({ isUndo: true });
  });

  test('a source deleted since (404) is skipped: the next one is still linked and the undo succeeds', async () => {
    mockApiFetch
      .mockResolvedValueOnce(okJson({ id: 'P-NEW' }))
      .mockResolvedValueOnce({ ok: false, status: 404, json: () => Promise.resolve({}) } as unknown as Response)
      .mockResolvedValueOnce(okJson({ id: 'S2' }));
    const inv = buildDeleteIndividualInverse({ workspaceId: WS, deletedId: 'P1', snapshot: {}, sourceIds: ['S1', 'S2'] });
    await expect(inv.undo()).resolves.toBeUndefined();
    expect(call(2)[0]).toBe(`/api/workspaces/${WS}/tree/sources/S2`);
  });

  test('redo deletes the re-created person; a second undo links the sources to the newest id', async () => {
    mockApiFetch.mockResolvedValueOnce(okJson({ id: 'P-2' })).mockResolvedValue(okJson({}));
    const inv = buildDeleteIndividualInverse({ workspaceId: WS, deletedId: 'P1', snapshot: {}, sourceIds: ['S1'] });
    await inv.undo();
    await inv.redo();
    expect(call(2)[0]).toBe(`/api/workspaces/${WS}/tree/individuals/P-2`);
    mockApiFetch.mockResolvedValueOnce(okJson({ id: 'P-3' }));
    await inv.undo();
    expect(bodyOf(4)).toEqual({ addPersonIds: ['P-3'] });
  });

  test('without sources the undo is the single person POST', async () => {
    await buildDeleteIndividualInverse({ workspaceId: WS, deletedId: 'P1', snapshot: {} }).undo();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });
});

describe('labels', () => {
  test.each([
    [{ kind: 'createSourceEntry' }, 'إضافة مصدر'],
    [{ kind: 'createSourceEntry', people: 1 }, 'إضافة مصدر'],
    [{ kind: 'createSourceEntry', people: 10 }, 'إضافة مصدر لـ ١٠ أشخاص'],
    [{ kind: 'updateSourceEntry' }, 'تعديل مصدر'],
    [{ kind: 'updateSourceEntry', people: 2 }, 'تعديل مصدر لـ شخصين'],
    [{ kind: 'unlinkSource', name: 'أحمد' }, 'إزالة مصدر عن أحمد'],
    [{ kind: 'deleteSourceEntry' }, 'حذف مصدر'],
  ] as const)('%o → %s', (action, label) => {
    expect(buildUndoLabel(action)).toBe(label);
  });
});

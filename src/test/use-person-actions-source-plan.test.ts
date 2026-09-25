/**
 * The person form's «حفظ» with staged sources («المصادر»):
 *  - edit: person PATCH first, then creates → updates (text/level, then file
 *    removals) → deletes; ONE composite undo entry per press (undoOnly when
 *    files were involved); a partly-failed save keeps the form open and a
 *    retry never repeats what saved.
 *  - create modes: the person first, then the queued entries under the new
 *    id; the form always closes; failures surface as a toast; the person-create
 *    undo is undoOnly when sources were saved with it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Individual, GedcomData } from '@/lib/gedcom/types';
import type { UndoEntry } from '@/lib/undo/types';
import type { IndividualFormData } from '@/components/tree/IndividualForm/IndividualForm';
import type { SourcePlan, SourcePlanResult } from '@/lib/tree/source-staging';
import type { SourceEntryDto } from '@/lib/tree/source-entries-api';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));
const mockNotify = vi.fn();
vi.mock('@/hooks/usePersonSources', () => ({ notifySourcesChanged: () => mockNotify() }));

import { usePersonActions } from '@/hooks/usePersonActions';
import { apiFetch } from '@/lib/api/client';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

const PID = 'cccccccc-0000-4000-8000-000000000001';
const WS = 'ws-1';

function person(): Individual {
  return {
    id: PID, type: 'INDI', name: 'علي', givenName: 'علي', surname: '', sex: 'M',
    birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
    death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
    kunya: '', notes: '', isDeceased: false, isPrivate: false, familiesAsSpouse: [], familyAsChild: null,
  };
}

function formData(over: Partial<IndividualFormData> = {}): IndividualFormData {
  return {
    givenName: 'علي', surname: '', sex: 'M', birthDate: '', birthPlace: '', birthDescription: '', birthNotes: '',
    birthHijriDate: '', deathDate: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
    kunya: '', isDeceased: false, isPrivate: false, notes: 'جديد', ...over,
  };
}

function entry(id: string, over: Partial<SourceEntryDto> = {}): SourceEntryDto {
  return { id, individualId: PID, text: `نص ${id}`, visibility: 'members', createdAt: '', updatedAt: '', files: [], ...over };
}

const pdf = { id: 'F1', mimeType: 'application/pdf' as const, sizeBytes: 1, fileName: 'd.pdf' };

const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status });
const fail = (status = 500) => new Response(JSON.stringify({ error: 'x' }), { status });

type Rule = (path: string, method: string, body: unknown) => Response | undefined;

/** Routes apiFetch; `rules` win over the defaults. */
function route(...rules: Rule[]) {
  mockApiFetch.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body) : undefined;
    for (const rule of rules) {
      const res = rule(path, method, body);
      if (res) return res;
    }
    if (method === 'DELETE' && path.includes('/files/')) return ok({ entryDeleted: false });
    if (method === 'DELETE') return new Response(null, { status: 204 });
    if (path.endsWith('/tree/individuals') && method === 'POST') return ok({ id: 'P-NEW' }, 201);
    if (path.endsWith('/tree/families') && method === 'POST') return ok({ id: 'FAM-NEW' }, 201);
    if (path.endsWith('/sources') && method === 'POST') {
      return ok(entry('S-NEW', { individualId: body?.personIds?.[0], text: body?.text ?? null, visibility: body?.visibility, files: (body?.fileIds ?? []).map((id: string) => ({ ...pdf, id })) }), 201);
    }
    if (/\/sources\/[^/]+$/.test(path) && method === 'PATCH') {
      return ok(entry(path.split('/').slice(-1)[0], { text: body?.text ?? 'نص', visibility: body?.visibility ?? 'members' }));
    }
    return ok({});
  });
}

/** Shared sources (R2): a create is `POST /sources` with `personIds` — shown as `POST /sources [ids]`. */
const calls = () =>
  mockApiFetch.mock.calls.map(([p, i]) => {
    const init = i as { method?: string; body?: string } | undefined;
    const method = init?.method ?? 'GET';
    const path = String(p).replace(`/api/workspaces/${WS}/tree`, '');
    if (method === 'POST' && path === '/sources') {
      const ids = (JSON.parse(init?.body ?? '{}') as { personIds?: string[] }).personIds ?? [];
      return `POST /sources [${ids.join(',')}]`;
    }
    return `${method} ${path}`;
  });

function setup(opts: { isAdmin?: boolean; formKind?: 'edit' | 'addChild' | 'addSpouse' | 'addParent' | 'addSibling' } = {}) {
  const onPushUndo = vi.fn<(e: UndoEntry) => void>();
  const onNotice = vi.fn<(m: string) => void>();
  const p = person();
  const data: GedcomData = { individuals: { [PID]: p }, families: {} };
  const hook = renderHook(() =>
    usePersonActions({
      personId: PID,
      workspace: { workspaceId: WS, canEdit: true, isAdmin: opts.isAdmin ?? true, refreshTree: vi.fn().mockResolvedValue(undefined) },
      person: p,
      data,
      setSelectedPersonId: vi.fn(),
      onPushUndo,
      onNotice,
    }),
  );
  const kind = opts.formKind ?? 'edit';
  act(() =>
    hook.result.current.setFormMode(kind === 'addSibling' ? { kind, targetFamilyId: 'FAM-1' } : { kind }),
  );
  return { ...hook, onPushUndo, onNotice };
}

function plan(over: Partial<SourcePlan> = {}): SourcePlan {
  return { creates: [], updates: [], deletes: [], ...over };
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockNotify.mockReset();
});

describe('edit «حفظ» with a sources plan', () => {
  it('PATCHes the person first, then creates → updates → file removals → deletes, and closes', async () => {
    route();
    const { result } = setup();
    const b = entry('b', { files: [pdf] });
    await act(async () => {
      await result.current.handleEditSubmit(
        formData(),
        plan({
          creates: [{ key: 'k1', text: 'جديد', visibility: 'members', fileIds: [] }],
          updates: [{ id: 'b', before: b, patch: { text: 'معدل' }, removeFileIds: ['F1'] }],
          deletes: [{ id: 'c', before: entry('c') }],
        }),
      );
    });
    expect(calls()).toEqual([
      `PATCH /individuals/${PID}`,
      `POST /sources [${PID}]`,
      'PATCH /sources/b',
      'DELETE /sources/b/files/F1',
      'DELETE /sources/c',
    ]);
    expect(result.current.formMode).toBeNull();
    expect(mockNotify).toHaveBeenCalled();
  });

  it('makes no source call when the person PATCH fails', async () => {
    route((path, method) => (path.endsWith(`/individuals/${PID}`) && method === 'PATCH' ? fail(400) : undefined));
    const { result, onPushUndo } = setup();
    let ret: SourcePlanResult | void = undefined;
    await act(async () => {
      ret = await result.current.handleEditSubmit(formData(), plan({ creates: [{ key: 'k1', text: 'x', visibility: 'members', fileIds: [] }] }));
    });
    expect(calls()).toEqual([`PATCH /individuals/${PID}`]);
    expect(ret).toBeUndefined();
    expect(result.current.formMode).toEqual({ kind: 'edit' });
    expect(onPushUndo).not.toHaveBeenCalled();
  });

  it('pushes ONE undo entry for the whole press; undo reverts the person and the text-only source work', async () => {
    route();
    const { result, onPushUndo } = setup();
    await act(async () => {
      await result.current.handleEditSubmit(
        formData(),
        plan({
          creates: [{ key: 'k1', text: 'جديد', visibility: 'members', fileIds: [] }],
          updates: [{ id: 'b', before: entry('b'), patch: { visibility: 'public' }, removeFileIds: [] }],
          deletes: [{ id: 'c', before: entry('c', { text: 'قديم' }) }],
        }),
      );
    });
    expect(onPushUndo).toHaveBeenCalledTimes(1);
    const undo = onPushUndo.mock.calls[0][0];
    expect(undo.undoOnly).toBeFalsy();
    mockApiFetch.mockClear();
    await undo.undo();
    const undone = calls();
    expect(undone).toContain(`PATCH /individuals/${PID}`);
    expect(undone).toContain('DELETE /sources/S-NEW');
    expect(undone).toContain('PATCH /sources/b');
    expect(undone).toContain(`POST /individuals/${PID}/sources`);
    // Reverse order: the delete is restored first, the person reverted last.
    expect(undone[undone.length - 1]).toBe(`PATCH /individuals/${PID}`);
  });

  it('marks the entry undoOnly when files were involved, and still undoes the text parts only', async () => {
    route();
    const { result, onPushUndo } = setup();
    await act(async () => {
      await result.current.handleEditSubmit(
        formData(),
        plan({
          creates: [{ key: 'k1', text: 'صورة', visibility: 'members', fileIds: ['UP1'] }],
          deletes: [{ id: 'c', before: entry('c', { files: [pdf] }) }],
        }),
      );
    });
    const undo = onPushUndo.mock.calls[0][0];
    expect(undo.undoOnly).toBe(true);
    mockApiFetch.mockClear();
    await undo.undo();
    // Only the person is reverted: the file-bearing create stays, the deleted files are gone for good.
    expect(calls()).toEqual([`PATCH /individuals/${PID}`]);
  });

  it('a partly-failed save keeps the form open, reports what failed, and the retry repeats nothing that saved', async () => {
    let createAttempts = 0;
    route((path, method, body) => {
      if (path.endsWith('/sources') && method === 'POST' && (body as { personIds?: string[] }).personIds?.[0] === PID) {
        createAttempts++;
        if ((body as { text: string }).text === 'ثان' && createAttempts <= 2) return fail();
      }
      return undefined;
    });
    const { result, onPushUndo } = setup();
    let first: SourcePlanResult | void = undefined;
    await act(async () => {
      first = await result.current.handleEditSubmit(
        formData(),
        plan({
          creates: [
            { key: 'k1', text: 'أول', visibility: 'members', fileIds: [] },
            { key: 'k2', text: 'ثان', visibility: 'members', fileIds: [] },
          ],
        }),
      );
    });
    expect(result.current.formMode).toEqual({ kind: 'edit' });
    expect(result.current.formError).toBe('حُفظت بيانات الشخص، وتعذّر حفظ بعض المصادر. اضغط «حفظ» لإعادة المحاولة.');
    expect(first).toMatchObject({ failedCreates: ['k2'] });
    expect(Object.keys((first as unknown as SourcePlanResult).created)).toEqual(['k1']);
    expect(onPushUndo).toHaveBeenCalledTimes(1);

    // The retry carries only the failed create (the form dropped the rest).
    mockApiFetch.mockClear();
    await act(async () => {
      await result.current.handleEditSubmit(formData(), plan({ creates: [{ key: 'k2', text: 'ثان', visibility: 'members', fileIds: [] }] }));
    });
    // The person already saved — not PATCHed again.
    expect(calls()).toEqual([`POST /sources [${PID}]`]);
    expect(result.current.formMode).toBeNull();
    expect(onPushUndo).toHaveBeenCalledTimes(2);
    mockApiFetch.mockClear();
    await onPushUndo.mock.calls[1][0].undo();
    expect(calls()).toEqual(['DELETE /sources/S-NEW']);
  });

  it('tells a non-admin once that «المشرفون فقط» entries are hidden from them', async () => {
    route();
    const { result, onNotice } = setup({ isAdmin: false });
    await act(async () => {
      await result.current.handleEditSubmit(
        formData(),
        plan({
          creates: [
            { key: 'k1', text: 'أ', visibility: 'admins', fileIds: [] },
            { key: 'k2', text: 'ب', visibility: 'admins', fileIds: [] },
          ],
        }),
      );
    });
    expect(onNotice).toHaveBeenCalledTimes(1);
    expect(onNotice).toHaveBeenCalledWith('أُضيف المصدر، ويراه المشرفون فقط.');
  });

  it('without sources the person undo stays redoable (regression)', async () => {
    route();
    const { result, onPushUndo } = setup();
    await act(async () => {
      await result.current.handleEditSubmit(formData(), plan());
    });
    expect(onPushUndo).toHaveBeenCalledTimes(1);
    expect(onPushUndo.mock.calls[0][0].undoOnly).toBeFalsy();
    expect(calls()).toEqual([`PATCH /individuals/${PID}`]);
  });
});

describe('create modes with queued sources', () => {
  it('saves the entries under the new person id after the person is created; the undo is undoOnly', async () => {
    route();
    const { result, onPushUndo } = setup({ formKind: 'addChild' });
    await act(async () => {
      await result.current.handleAddChildSubmit(
        formData({ givenName: 'حسن' }),
        plan({ creates: [{ key: 'k1', text: 'ابن سعد', visibility: 'members', fileIds: [] }] }),
      );
    });
    const all = calls();
    expect(all.indexOf('POST /sources [P-NEW]')).toBeGreaterThan(all.indexOf('POST /individuals'));
    expect(result.current.formMode).toBeNull();
    expect(onPushUndo).toHaveBeenCalledTimes(1);
    expect(onPushUndo.mock.calls[0][0].undoOnly).toBe(true);
  });

  it('closes anyway and toasts how many failed', async () => {
    route((path, method, body) =>
      path.endsWith('/sources') && method === 'POST' && (body as { personIds?: string[] }).personIds?.[0] === 'P-NEW' ? fail() : undefined,
    );
    const { result, onNotice, onPushUndo } = setup({ formKind: 'addChild' });
    await act(async () => {
      await result.current.handleAddChildSubmit(
        formData({ givenName: 'حسن' }),
        plan({
          creates: [
            { key: 'k1', text: 'أ', visibility: 'members', fileIds: [] },
            { key: 'k2', text: 'ب', visibility: 'members', fileIds: [] },
          ],
        }),
      );
    });
    expect(result.current.formMode).toBeNull();
    expect(onNotice).toHaveBeenCalledWith('أُضيف الشخص، وتعذّر حفظ ٢ من المصادر. أضِفها من لوحة الشخص.');
    // Nothing was saved with the person: the undo stays redoable.
    expect(onPushUndo.mock.calls[0][0].undoOnly).toBeFalsy();
  });

  it.each([
    ['addSpouse', 'handleAddSpouseSubmit'],
    ['addParent', 'handleAddParentSubmit'],
    ['addSibling', 'handleAddSiblingSubmit'],
  ] as const)('%s saves the queued entries on the new person too', async (kind, handler) => {
    route();
    const { result, onPushUndo } = setup({ formKind: kind });
    await act(async () => {
      await result.current[handler](
        formData({ givenName: 'حسن', sex: kind === 'addSpouse' ? 'F' : 'M' }),
        plan({ creates: [{ key: 'k1', text: 'ابن سعد', visibility: 'members', fileIds: [] }] }),
      );
    });
    expect(calls()).toContain('POST /sources [P-NEW]');
    expect(onPushUndo.mock.calls[0][0].undoOnly).toBe(true);
  });
});

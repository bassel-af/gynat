/**
 * Sources («المصادر») step 4 — undoing a person delete restores their text
 * entries. The hook captures the entries (via the member GET route, so only
 * what the actor can see) BEFORE the delete cascades them away, and the undo
 * re-creates them under the person's new id.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Individual, GedcomData } from '@/lib/gedcom/types';
import type { UndoEntry } from '@/lib/undo/types';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

import { usePersonActions } from '@/hooks/usePersonActions';
import { apiFetch } from '@/lib/api/client';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

const PID = 'cccccccc-0000-4000-8000-000000000001';

function person(): Individual {
  return {
    id: PID, type: 'INDI', name: 'علي', givenName: 'علي', surname: '', sex: 'M',
    birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
    death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
    kunya: '', notes: '', isDeceased: false, isPrivate: false, familiesAsSpouse: [], familyAsChild: null,
  };
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), { status });

const SOURCES = {
  entries: [
    { id: 'S1', individualId: PID, text: 'طبقات', visibility: 'members', createdAt: '', updatedAt: '' },
  ],
  inherited: { id: 'T', individualId: null, text: 'مصدر الشجرة', visibility: 'members', createdAt: '', updatedAt: '' },
};

/** Route every apiFetch by URL + method; records calls in order. */
function routeFetch(sourcesResponse: () => Response) {
  mockApiFetch.mockImplementation(async (path: string, init?: { method?: string }) => {
    const method = init?.method ?? 'GET';
    if (path.endsWith('/delete-impact')) return json({ hasImpact: false });
    if (path.includes('/sources') && method === 'GET') return sourcesResponse();
    if (method === 'DELETE') return new Response(null, { status: 204 });
    if (path.endsWith('/tree/individuals') && method === 'POST') return json({ id: 'P-NEW' }, 201);
    if (path.endsWith('/sources') && method === 'POST') return json({ id: 'S-NEW' }, 201);
    return json({});
  });
}

async function deleteAndGetUndo(isAdmin: boolean, onPushUndo: Mock<(e: UndoEntry) => void>) {
  const p = person();
  const data: GedcomData = { individuals: { [PID]: p }, families: {} };
  const { result } = renderHook(() =>
    usePersonActions({
      personId: PID,
      workspace: { workspaceId: 'ws-1', canEdit: true, isAdmin, refreshTree: vi.fn().mockResolvedValue(undefined) },
      person: p,
      data,
      setSelectedPersonId: vi.fn(),
      onPushUndo,
    }),
  );
  await act(async () => { await result.current.handleDeleteClick(); });
  await act(async () => { await result.current.handleCascadeConfirm(); });
  return onPushUndo.mock.calls[0][0] as UndoEntry;
}

function sourcePosts() {
  return mockApiFetch.mock.calls.filter(
    ([path, init]) => String(path).endsWith('/sources') && (init as { method?: string })?.method === 'POST',
  );
}

describe('usePersonActions — person-delete undo restores sources', () => {
  let onPushUndo: Mock<(e: UndoEntry) => void>;
  beforeEach(() => {
    mockApiFetch.mockReset();
    onPushUndo = vi.fn<(e: UndoEntry) => void>();
  });

  it('captures the entries before the DELETE fires', async () => {
    routeFetch(() => json(SOURCES));
    await deleteAndGetUndo(true, onPushUndo);
    const paths = mockApiFetch.mock.calls.map(([p, i]) => `${(i as { method?: string })?.method ?? 'GET'} ${p}`);
    const getIdx = paths.findIndex((p) => p.startsWith('GET') && p.includes('/sources'));
    const delIdx = paths.findIndex((p) => p.startsWith('DELETE'));
    expect(getIdx).toBeGreaterThanOrEqual(0);
    expect(getIdx).toBeLessThan(delIdx);
  });

  it('undo re-creates the own entries (not the inherited tree entry) under the new id', async () => {
    routeFetch(() => json(SOURCES));
    const entry = await deleteAndGetUndo(true, onPushUndo);
    await entry.undo();
    const posts = sourcePosts();
    expect(posts).toHaveLength(1);
    expect(posts[0][0]).toBe('/api/workspaces/ws-1/tree/individuals/P-NEW/sources');
    expect(JSON.parse((posts[0][1] as { body: string }).body)).toEqual({ text: 'طبقات', visibility: 'members' });
  });

  it('a non-admin editor restores at «المشرفون فقط»', async () => {
    routeFetch(() => json(SOURCES));
    const entry = await deleteAndGetUndo(false, onPushUndo);
    await entry.undo();
    expect(JSON.parse((sourcePosts()[0][1] as { body: string }).body).visibility).toBe('admins');
  });

  it('a failed sources fetch does not block the delete or its undo entry', async () => {
    routeFetch(() => new Response('{}', { status: 500 }));
    const entry = await deleteAndGetUndo(true, onPushUndo);
    expect(entry.label).toBe('حذف: علي');
    await entry.undo();
    expect(sourcePosts()).toHaveLength(0);
  });
});

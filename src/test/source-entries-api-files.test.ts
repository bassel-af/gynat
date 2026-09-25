/**
 * Sources («المصادر») step 5 — client wrappers for files. What can break: a
 * JSON Content-Type forced onto a multipart upload (the browser must set the
 * boundary), the treeId landing in the wrong place, and the file URL.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockApiFetch = vi.fn();
vi.mock('@/lib/api/client', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));

import {
  uploadSourceFile,
  deleteSourceFile,
  sourceFileUrl,
  fetchSourceFileBlob,
} from '@/lib/tree/source-entries-api';

const ok = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => mockApiFetch.mockReset());

describe('uploadSourceFile', () => {
  test('posts one file as multipart without a hand-set Content-Type', async () => {
    mockApiFetch.mockResolvedValue(ok({ id: 'f1', mimeType: 'image/png', sizeBytes: 3, fileName: 'a.png' }, 201));
    const file = new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' });
    const dto = await uploadSourceFile('ws', file, 'tree-9');
    expect(dto.id).toBe('f1');
    const [url, init] = mockApiFetch.mock.calls[0];
    expect(url).toBe('/api/workspaces/ws/tree/sources/uploads?treeId=tree-9');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).getAll('file')).toHaveLength(1);
    expect(init.headers?.['Content-Type']).toBeUndefined();
  });

  test('surfaces the server\'s Arabic error message', async () => {
    mockApiFetch.mockResolvedValue(new Response(JSON.stringify({ error: 'نوع الملف غير مدعوم' }), { status: 400 }));
    await expect(uploadSourceFile('ws', new File(['x'], 'x.svg'))).rejects.toThrow('نوع الملف غير مدعوم');
  });
});

describe('file URL and delete', () => {
  test('builds the file URL, with treeId only when given', () => {
    expect(sourceFileUrl('ws', 'e1', 'f1')).toBe('/api/workspaces/ws/tree/sources/e1/files/f1');
    expect(sourceFileUrl('ws', 'e1', 'f1', 't1')).toBe('/api/workspaces/ws/tree/sources/e1/files/f1?treeId=t1');
  });

  test('fetches the file as a Blob through the authenticated fetch', async () => {
    mockApiFetch.mockResolvedValue(new Response(new Uint8Array([9]), { status: 200, headers: { 'content-type': 'image/png' } }));
    const blob = await fetchSourceFileBlob('ws', 'e1', 'f1');
    expect(blob.size).toBe(1);
    expect(mockApiFetch.mock.calls[0][0]).toBe('/api/workspaces/ws/tree/sources/e1/files/f1');
  });

  test('delete reports whether the entry went too', async () => {
    mockApiFetch.mockResolvedValue(ok({ entryDeleted: true }));
    expect(await deleteSourceFile('ws', 'e1', 'f1', 't1')).toEqual({ entryDeleted: true });
    const [url, init] = mockApiFetch.mock.calls[0];
    expect(url).toBe('/api/workspaces/ws/tree/sources/e1/files/f1');
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(init.body)).toEqual({ treeId: 't1' });
  });
});

// ===========================================================================
// R2 — shared-source wrappers
// ===========================================================================

import {
  createSource,
  createSourceEntry,
  patchSource,
  deleteSourceEntry,
  fetchSourcePreview,
  fetchSourceSuggestions,
  fetchSourceSuggestionSummaries,
  LastLinkError,
} from '@/lib/tree/source-entries-api';

describe('shared-source wrappers', () => {
  test('createSource posts the people with the content', async () => {
    mockApiFetch.mockResolvedValue(ok({ id: 's1', people: [], sharedCount: 0 }, 201));
    await createSource('ws', { text: 'دفتر', personIds: ['p1', 'p2'] }, 't1');
    const [url, init] = mockApiFetch.mock.calls[0];
    expect(url).toBe('/api/workspaces/ws/tree/sources');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ text: 'دفتر', personIds: ['p1', 'p2'], treeId: 't1' });
  });

  test('createSourceEntry (one person) goes through POST sources with that person', async () => {
    mockApiFetch.mockResolvedValue(ok({ id: 's1' }, 201));
    await createSourceEntry('ws', 'p1', { text: 'x' });
    const [url, init] = mockApiFetch.mock.calls[0];
    expect(url).toBe('/api/workspaces/ws/tree/sources');
    expect(JSON.parse(init.body)).toEqual({ text: 'x', personIds: ['p1'] });
  });

  test('patchSource sends link deltas and returns the source', async () => {
    mockApiFetch.mockResolvedValue(ok({ id: 's1', people: [], peopleCount: 0 }));
    const res = await patchSource('ws', 's1', { addPersonIds: ['p2'], removePersonIds: ['p3'] });
    expect(res).toMatchObject({ id: 's1' });
    const [url, init] = mockApiFetch.mock.calls[0];
    expect(url).toBe('/api/workspaces/ws/tree/sources/s1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ addPersonIds: ['p2'], removePersonIds: ['p3'] });
  });

  test('patchSource returns null when the last person was removed with delete', async () => {
    mockApiFetch.mockResolvedValue(new Response(JSON.stringify({ data: null, deleted: true }), { status: 200 }));
    expect(await patchSource('ws', 's1', { removePersonIds: ['p1'], onLastLink: 'delete' })).toBeNull();
  });

  test('patchSource throws LastLinkError on the last-person 409', async () => {
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'هذا آخر شخص لهذا المصدر', code: 'last_link' }), { status: 409 }),
    );
    await expect(patchSource('ws', 's1', { removePersonIds: ['p1'] })).rejects.toBeInstanceOf(LastLinkError);
  });

  test('deleteSourceEntry tells a full delete from a partial one', async () => {
    mockApiFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await deleteSourceEntry('ws', 's1')).toEqual({ deleted: true });
    mockApiFetch.mockResolvedValueOnce(ok({ deleted: false }));
    expect(await deleteSourceEntry('ws', 's1')).toEqual({ deleted: false });
  });

  test('fetchSourcePreview reads one source with treeId in the query', async () => {
    mockApiFetch.mockResolvedValue(ok({ id: 's1', people: [], peopleCount: 0 }));
    await fetchSourcePreview('ws', 's1', 't1');
    expect(mockApiFetch.mock.calls[0][0]).toBe('/api/workspaces/ws/tree/sources/s1?treeId=t1');
  });

  test('suggestion summaries come back whole; the text-only helper keeps distinct texts', async () => {
    const rows = [
      { id: 'a', text: 'طبقات', visibility: 'members', fileCount: 0, peopleCount: 1, firstPersonName: 'محمد' },
      { id: 'b', text: 'طبقات', visibility: 'members', fileCount: 0, peopleCount: 1, firstPersonName: 'علي' },
      { id: 'c', text: null, visibility: 'members', fileCount: 2, peopleCount: 3, firstPersonName: null },
    ];
    mockApiFetch.mockResolvedValue(ok({ suggestions: rows }));
    expect(await fetchSourceSuggestionSummaries('ws', 'ط', 't1')).toEqual(rows);
    expect(mockApiFetch.mock.calls[0][0]).toBe('/api/workspaces/ws/tree/sources/suggestions?q=%D8%B7&treeId=t1');
    mockApiFetch.mockResolvedValue(ok({ suggestions: rows }));
    expect(await fetchSourceSuggestions('ws', 'ط')).toEqual(['طبقات']);
  });
});

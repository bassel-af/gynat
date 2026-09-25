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

/**
 * SourceEntryForm in DEFERRED mode (`onDraft`) — opened from the person edit
 * form. «حفظ» makes no entry API call: it validates and hands the draft back.
 * Uploads still go up at once (staged files); removing a saved file is only
 * staged (crossed out, «تراجع» brings it back). The parent owns the previews.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const api = {
  createSourceEntry: vi.fn(),
  updateSourceEntry: vi.fn(),
  uploadSourceFile: vi.fn(),
  deleteSourceFile: vi.fn(),
  fetchSourceSuggestions: vi.fn(),
  fetchSourceFileBlob: vi.fn(),
  putTreeEntry: vi.fn(),
};
vi.mock('@/lib/tree/source-entries-api', () => ({
  createSourceEntry: (...a: unknown[]) => api.createSourceEntry(...a),
  updateSourceEntry: (...a: unknown[]) => api.updateSourceEntry(...a),
  uploadSourceFile: (...a: unknown[]) => api.uploadSourceFile(...a),
  deleteSourceFile: (...a: unknown[]) => api.deleteSourceFile(...a),
  fetchSourceSuggestions: (...a: unknown[]) => api.fetchSourceSuggestions(...a),
  fetchSourceFileBlob: (...a: unknown[]) => api.fetchSourceFileBlob(...a),
  putTreeEntry: (...a: unknown[]) => api.putTreeEntry(...a),
}));
vi.mock('@/hooks/useTreePublishLevel', () => ({ useTreePublishLevel: () => 'private' }));
vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

import { SourceEntryForm } from '@/components/sources/SourceEntryForm';
import type { SourceEntryDto } from '@/lib/tree/source-entries-api';

const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();

const pdf = { id: 'F1', mimeType: 'application/pdf' as const, sizeBytes: 3, fileName: 'deed.pdf' };
const saved: SourceEntryDto = {
  id: 'S1', individualId: 'P1', text: 'طبقات', visibility: 'members', createdAt: '', updatedAt: '', files: [pdf],
};

function renderDeferred(props: Record<string, unknown> = {}) {
  const onDraft = vi.fn();
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const utils = render(
    <SourceEntryForm
      mode="create"
      workspaceId="ws"
      individualId="P1"
      isAdmin
      onSaved={onSaved}
      onClose={onClose}
      onDraft={onDraft}
      {...props}
    />,
  );
  return { ...utils, onDraft, onClose, onSaved };
}

const textbox = () => screen.getByLabelText('المصدر') as HTMLTextAreaElement;
const save = () => fireEvent.click(screen.getByRole('button', { name: 'حفظ' }));
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset());
  api.fetchSourceSuggestions.mockResolvedValue([]);
  api.fetchSourceFileBlob.mockResolvedValue(new Blob(['x']));
  createObjectURL.mockReset().mockReturnValue('blob:preview');
  revokeObjectURL.mockReset();
  Object.assign(URL, { createObjectURL, revokeObjectURL });
});

describe('SourceEntryForm — deferred (onDraft)', () => {
  it('«حفظ» hands back the draft and makes no entry API call', async () => {
    const { onDraft, onClose } = renderDeferred();
    fireEvent.change(textbox(), { target: { value: ' ابن سعد ' } });
    save();
    await waitFor(() => expect(onDraft).toHaveBeenCalled());
    expect(onDraft).toHaveBeenCalledWith({ text: 'ابن سعد', visibility: 'admins', addFiles: [], removeFileIds: [] });
    expect(onClose).toHaveBeenCalled();
    expect(api.createSourceEntry).not.toHaveBeenCalled();
    expect(api.updateSourceEntry).not.toHaveBeenCalled();
  });

  it('still validates: text or a file', async () => {
    const { onDraft } = renderDeferred();
    save();
    expect(await screen.findByText('أضف نصًا أو ملفًا')).toBeInTheDocument();
    expect(onDraft).not.toHaveBeenCalled();
  });

  it('focuses «المصدر» on open', () => {
    renderDeferred();
    expect(document.activeElement).toBe(textbox());
  });

  it('uploads at once and returns the staged file with its preview, never revoking it', async () => {
    api.uploadSourceFile.mockResolvedValue({ id: 'UP1', mimeType: 'image/png', sizeBytes: 3, fileName: 'a.png' });
    const { onDraft, unmount } = renderDeferred();
    fireEvent.change(fileInput(), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    await waitFor(() => expect(api.uploadSourceFile).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'إزالة a.png' })).toBeInTheDocument());
    save();
    await waitFor(() => expect(onDraft).toHaveBeenCalled());
    expect(onDraft.mock.calls[0][0].addFiles).toEqual([
      { id: 'UP1', name: 'a.png', isImage: true, previewUrl: 'blob:preview' },
    ]);
    unmount();
    expect(revokeObjectURL).not.toHaveBeenCalledWith('blob:preview');
  });

  it('removing a saved file is staged: crossed out, «تراجع» restores it, and no deleteSourceFile call', async () => {
    const { onDraft } = renderDeferred({ mode: 'edit', entry: saved });
    fireEvent.click(screen.getByRole('button', { name: 'حذف deed.pdf' }));
    expect(api.deleteSourceFile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'تراجع' }));
    fireEvent.click(screen.getByRole('button', { name: 'حذف deed.pdf' }));
    save();
    await waitFor(() => expect(onDraft).toHaveBeenCalled());
    expect(onDraft.mock.calls[0][0]).toEqual({ text: 'طبقات', visibility: 'members', addFiles: [], removeFileIds: ['F1'] });
    expect(api.deleteSourceFile).not.toHaveBeenCalled();
  });

  it('reopens with the staged draft (text, level, removals, new uploads)', async () => {
    const { onDraft } = renderDeferred({
      mode: 'edit',
      entry: saved,
      initialDraft: {
        text: 'معدل',
        visibility: 'admins',
        addFiles: [{ id: 'UP9', name: 'n.pdf', isImage: false, previewUrl: null }],
        removeFileIds: ['F1'],
      },
    });
    expect(textbox().value).toBe('معدل');
    expect(screen.getByRole('button', { name: 'تراجع' })).toBeInTheDocument();
    expect(screen.getByText('n.pdf')).toBeInTheDocument();
    save();
    await waitFor(() => expect(onDraft).toHaveBeenCalled());
    expect(onDraft.mock.calls[0][0]).toEqual({
      text: 'معدل',
      visibility: 'admins',
      addFiles: [{ id: 'UP9', name: 'n.pdf', isImage: false, previewUrl: null }],
      removeFileIds: ['F1'],
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const api = {
  createSource: vi.fn(),
  patchSource: vi.fn(),
  uploadSourceFile: vi.fn(),
  deleteSourceFile: vi.fn(),
  fetchSourceSuggestionSummaries: vi.fn(),
  fetchSourceFileBlob: vi.fn(),
};
vi.mock('@/lib/tree/source-entries-api', () => ({
  createSource: (...a: unknown[]) => api.createSource(...a),
  patchSource: (...a: unknown[]) => api.patchSource(...a),
  uploadSourceFile: (...a: unknown[]) => api.uploadSourceFile(...a),
  deleteSourceFile: (...a: unknown[]) => api.deleteSourceFile(...a),
  fetchSourceSuggestionSummaries: (...a: unknown[]) => api.fetchSourceSuggestionSummaries(...a),
  fetchSourceFileBlob: (...a: unknown[]) => api.fetchSourceFileBlob(...a),
}));
vi.mock('@/hooks/useTreePublishLevel', () => ({ useTreePublishLevel: () => 'private' }));
vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

import { SourceEntryForm } from '@/components/sources/SourceEntryForm';

const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();

function created(over: Record<string, unknown> = {}) {
  return { id: 'S1', individualId: 'P1', text: 'نص', visibility: 'admins', createdAt: '', updatedAt: '', files: [], ...over };
}

function renderCreate(props: Record<string, unknown> = {}) {
  const onSaved = vi.fn();
  const onPushUndo = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <SourceEntryForm
      mode="create"
      workspaceId="ws"
      individualId="P1"
      isAdmin
      onSaved={onSaved}
      onPushUndo={onPushUndo}
      onClose={onClose}
      {...props}
    />,
  );
  return { ...utils, onSaved, onPushUndo, onClose };
}

const textbox = () => screen.getByLabelText('المصدر') as HTMLTextAreaElement;
const save = () => fireEvent.click(screen.getByRole('button', { name: 'حفظ' }));
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset());
  api.fetchSourceSuggestionSummaries.mockResolvedValue([]);
  createObjectURL.mockReset().mockReturnValue('blob:preview');
  revokeObjectURL.mockReset();
  Object.assign(URL, { createObjectURL, revokeObjectURL });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SourceEntryForm — create', () => {
  it('requires text or a file', async () => {
    renderCreate();
    fireEvent.change(textbox(), { target: { value: '   ' } });
    save();
    expect(await screen.findByText('أضف نصًا أو ملفًا')).toBeInTheDocument();
    expect(api.createSource).not.toHaveBeenCalled();
  });

  it('saves a text entry at «المشرفون فقط» by default and pushes a redoable undo', async () => {
    api.createSource.mockResolvedValue(created());
    const { onSaved, onPushUndo } = renderCreate({ treeId: 'T' });
    fireEvent.change(textbox(), { target: { value: ' طبقات ابن سعد ' } });
    save();
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.createSource).toHaveBeenCalledWith('ws', { text: 'طبقات ابن سعد', visibility: 'admins', personIds: ['P1'] }, 'T');
    expect(onPushUndo).toHaveBeenCalledTimes(1);
    expect(onPushUndo.mock.calls[0][0].undoOnly).toBeFalsy();
  });

  it('uploads a file at once and sends its id on save; the undo cannot be redone', async () => {
    api.uploadSourceFile.mockResolvedValue({ id: 'F1', mimeType: 'image/png', sizeBytes: 3, fileName: 'a.png' });
    api.createSource.mockResolvedValue(created({ text: null, files: [{ id: 'F1' }] }));
    const { onPushUndo } = renderCreate();
    const file = new File(['abc'], 'a.png', { type: 'image/png' });
    fireEvent.change(fileInput(), { target: { files: [file] } });
    await waitFor(() => expect(api.uploadSourceFile).toHaveBeenCalledWith('ws', file, undefined));
    await screen.findByRole('button', { name: 'إزالة a.png' });
    save();
    await waitFor(() =>
      expect(api.createSource).toHaveBeenCalledWith('ws', { text: null, fileIds: ['F1'], visibility: 'admins', personIds: ['P1'] }, undefined),
    );
    expect(onPushUndo.mock.calls[0][0].undoOnly).toBe(true);
  });

  it('refuses a file over 8 MB before uploading', async () => {
    renderCreate();
    const big = new File(['x'], 'big.jpg', { type: 'image/jpeg' });
    Object.defineProperty(big, 'size', { value: 8 * 1024 * 1024 + 1 });
    fireEvent.change(fileInput(), { target: { files: [big] } });
    expect(await screen.findByText('الملف أكبر من ٨ م.ب')).toBeInTheDocument();
    expect(api.uploadSourceFile).not.toHaveBeenCalled();
  });

  it('shows the server upload message verbatim', async () => {
    api.uploadSourceFile.mockRejectedValue(new Error('نوع الملف غير مدعوم'));
    renderCreate();
    fireEvent.change(fileInput(), { target: { files: [new File(['a'], 'a.gif', { type: 'image/gif' })] } });
    expect(await screen.findByText('نوع الملف غير مدعوم')).toBeInTheDocument();
  });

  it('revokes local previews when closed', async () => {
    api.uploadSourceFile.mockResolvedValue({ id: 'F1', mimeType: 'image/png', sizeBytes: 3, fileName: 'a.png' });
    const { unmount } = renderCreate();
    fireEvent.change(fileInput(), { target: { files: [new File(['a'], 'a.png', { type: 'image/png' })] } });
    await screen.findByRole('button', { name: 'إزالة a.png' });
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('suggests texts already used; picking one copies the text only', async () => {
    vi.useFakeTimers();
    api.fetchSourceSuggestionSummaries.mockResolvedValue([
      { id: 'S0', text: 'طبقات ابن سعد، ص ٩٠', visibility: 'admins', fileCount: 0, peopleCount: 0, firstPersonName: null },
    ]);
    api.createSource.mockResolvedValue(created());
    renderCreate();
    fireEvent.change(textbox(), { target: { value: 'طبقات' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(api.fetchSourceSuggestionSummaries).toHaveBeenCalledWith('ws', 'طبقات', undefined);
    vi.useRealTimers();
    fireEvent.click(await screen.findByRole('button', { name: 'طبقات ابن سعد، ص ٩٠' }));
    expect(textbox().value).toBe('طبقات ابن سعد، ص ٩٠');
    expect(screen.queryByRole('list', { name: 'مصادر مستعملة' })).toBeNull();
    save();
    await waitFor(() =>
      expect(api.createSource).toHaveBeenCalledWith('ws', { text: 'طبقات ابن سعد، ص ٩٠', visibility: 'admins', personIds: ['P1'] }, undefined),
    );
  });

  it('shows the files warning for the public level once a file is attached', async () => {
    api.uploadSourceFile.mockResolvedValue({ id: 'F1', mimeType: 'image/png', sizeBytes: 3, fileName: 'a.png' });
    renderCreate();
    fireEvent.click(screen.getByRole('radio', { name: /وزوار الشجرة المنشورة/ }));
    expect(screen.queryByText(/تأكد أن الملفات/)).toBeNull();
    fireEvent.change(fileInput(), { target: { files: [new File(['a'], 'a.png', { type: 'image/png' })] } });
    expect(await screen.findByText(/تأكد أن الملفات/)).toBeInTheDocument();
  });
});

describe('SourceEntryForm — edit', () => {
  const existing = {
    id: 'S1',
    individualId: 'P1',
    text: 'قديم',
    visibility: 'members' as const,
    createdAt: '',
    updatedAt: '',
    files: [{ id: 'F0', mimeType: 'application/pdf' as const, sizeBytes: 5, fileName: 'deed.pdf' }],
  };

  function renderEdit() {
    const onSaved = vi.fn();
    const onPushUndo = vi.fn();
    const onClose = vi.fn();
    render(
      <SourceEntryForm
        mode="edit"
        workspaceId="ws"
        individualId="P1"
        entry={existing}
        isAdmin
        onSaved={onSaved}
        onPushUndo={onPushUndo}
        onClose={onClose}
      />,
    );
    return { onSaved, onPushUndo, onClose };
  }

  it('sends only what changed and pushes an update undo', async () => {
    api.patchSource.mockResolvedValue({ ...existing, text: 'جديد' });
    const { onSaved, onPushUndo } = renderEdit();
    expect(textbox().value).toBe('قديم');
    fireEvent.change(textbox(), { target: { value: 'جديد' } });
    save();
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.patchSource).toHaveBeenCalledWith('ws', 'S1', { text: 'جديد' }, undefined);
    expect(onPushUndo).toHaveBeenCalledTimes(1);
  });

  it('deletes an existing file only after confirming, without saving the form', async () => {
    api.deleteSourceFile.mockResolvedValue({ entryDeleted: false });
    const { onSaved, onClose } = renderEdit();
    fireEvent.click(screen.getByRole('button', { name: 'حذف deed.pdf' }));
    expect(api.deleteSourceFile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'نعم، احذف الملف' }));
    await waitFor(() => expect(api.deleteSourceFile).toHaveBeenCalledWith('ws', 'S1', 'F0', undefined));
    await waitFor(() => expect(screen.queryByText('deed.pdf')).toBeNull());
    expect(api.patchSource).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

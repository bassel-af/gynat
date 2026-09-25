/**
 * SourceEntryForm — shared sources (rework R4): the «مصدر لـ» line with the
 * locked starting person, the people picker, the shared-edit banner and
 * «حفظ عند N أشخاص», reuse suggestions ([ربطه بهذا الشخص] / [نسخ النص فقط]
 * / «عرض»), and the draft a deferred form hands back.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';

const api = {
  createSource: vi.fn(),
  patchSource: vi.fn(),
  uploadSourceFile: vi.fn(),
  deleteSourceFile: vi.fn(),
  fetchSourceSuggestionSummaries: vi.fn(),
  fetchSourcePreview: vi.fn(),
  fetchSourceFileBlob: vi.fn(),
  putTreeEntry: vi.fn(),
};
vi.mock('@/lib/tree/source-entries-api', () => ({
  createSource: (...a: unknown[]) => api.createSource(...a),
  patchSource: (...a: unknown[]) => api.patchSource(...a),
  uploadSourceFile: (...a: unknown[]) => api.uploadSourceFile(...a),
  deleteSourceFile: (...a: unknown[]) => api.deleteSourceFile(...a),
  fetchSourceSuggestionSummaries: (...a: unknown[]) => api.fetchSourceSuggestionSummaries(...a),
  fetchSourcePreview: (...a: unknown[]) => api.fetchSourcePreview(...a),
  fetchSourceFileBlob: (...a: unknown[]) => api.fetchSourceFileBlob(...a),
  putTreeEntry: (...a: unknown[]) => api.putTreeEntry(...a),
}));
vi.mock('@/hooks/useTreePublishLevel', () => ({ useTreePublishLevel: () => 'private' }));
vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

import { SourceEntryForm } from '@/components/sources/SourceEntryForm';
import { buildPickerFamily } from './helpers/source-people-fixture';

const data = buildPickerFamily();

function dto(over: Record<string, unknown> = {}) {
  return { id: 'S1', individualId: 'M', text: 'نص', visibility: 'admins', createdAt: '', updatedAt: '', files: [], people: [], sharedCount: 0, ...over };
}

function renderForm(props: Record<string, unknown> = {}) {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  const onPushUndo = vi.fn();
  render(
    <SourceEntryForm
      mode="create"
      workspaceId="ws"
      treeId="T"
      individualId="M"
      data={data}
      isAdmin
      onSaved={onSaved}
      onClose={onClose}
      onPushUndo={onPushUndo}
      {...props}
    />,
  );
  return { onSaved, onClose, onPushUndo };
}

const textbox = () => screen.getByLabelText('المصدر') as HTMLTextAreaElement;
const line = () => screen.getByRole('group', { name: 'مصدر لـ:' });
const save = (name: string | RegExp = 'حفظ') => fireEvent.click(screen.getByRole('button', { name }));

async function pickWholeFamily() {
  fireEvent.click(screen.getByRole('button', { name: '＋ أشخاص آخرون' }));
  fireEvent.click(await screen.findByRole('button', { name: 'الأسرة كلها (٦)' }));
  fireEvent.click(screen.getByRole('button', { name: 'تم' }));
}

async function typeAndSuggest(value: string) {
  vi.useFakeTimers();
  fireEvent.change(textbox(), { target: { value } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
  vi.useRealTimers();
}

const bookSummary = { id: 'S9', text: 'دفتر العائلة', visibility: 'members', fileCount: 3, peopleCount: 10, firstPersonName: null };
const oneBook = { id: 'S8', text: 'طبقات ابن سعد، ص ٩٠', visibility: 'admins', fileCount: 0, peopleCount: 1, firstPersonName: 'سعاد' };

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset());
  api.fetchSourceSuggestionSummaries.mockResolvedValue([]);
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
});

describe('«مصدر لـ» — create', () => {
  it('starts with the locked starting person, who has no remove button', () => {
    renderForm();
    expect(within(line()).getByText('محمد')).toBeInTheDocument();
    expect(within(line()).getByText('· أضفته من صفحته')).toBeInTheDocument();
    expect(within(line()).queryByRole('button', { name: /إزالة/ })).toBeNull();
  });

  it('a one-person source saves for the starting person only', async () => {
    api.createSource.mockResolvedValue(dto());
    const { onSaved } = renderForm();
    fireEvent.change(textbox(), { target: { value: 'جواز سفر' } });
    save();
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.createSource).toHaveBeenCalledWith('ws', { text: 'جواز سفر', visibility: 'admins', personIds: ['M'] }, 'T');
  });

  it('the picker fills the line (nothing saved), long lists collapse, and one «حفظ» saves for everyone', async () => {
    api.createSource.mockResolvedValue(dto());
    renderForm();
    await pickWholeFamily();
    expect(api.createSource).not.toHaveBeenCalled();
    const more = within(line()).getByRole('button', { name: /وشخصان آخران/ });
    expect(within(line()).getAllByRole('button', { name: /^إزالة / })).toHaveLength(3);
    fireEvent.click(more);
    expect(within(line()).getAllByRole('button', { name: /^إزالة / })).toHaveLength(5);
    fireEvent.change(textbox(), { target: { value: 'دفتر العائلة' } });
    save();
    await waitFor(() => expect(api.createSource).toHaveBeenCalledTimes(1));
    const [, body] = api.createSource.mock.calls[0];
    expect(body.personIds[0]).toBe('M');
    expect([...body.personIds].sort()).toEqual(['K1', 'K2', 'K3', 'M', 'W1', 'W2']);
  });

  it('× takes a person off the line', async () => {
    api.createSource.mockResolvedValue(dto());
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: '＋ أشخاص آخرون' }));
    fireEvent.click(await screen.findByRole('button', { name: 'الزوجة: فاطمة' }));
    fireEvent.click(screen.getByRole('button', { name: 'تم' }));
    fireEvent.click(within(line()).getByRole('button', { name: /^إزالة فاطمة/ }));
    fireEvent.change(textbox(), { target: { value: 'نص' } });
    save();
    await waitFor(() => expect(api.createSource).toHaveBeenCalled());
    expect(api.createSource.mock.calls[0][1].personIds).toEqual(['M']);
  });

  it('a new person reads «هذا الشخص (جديد)»', () => {
    renderForm({ individualId: undefined, newPerson: true, onDraft: vi.fn() });
    expect(within(line()).getByText('هذا الشخص (جديد)')).toBeInTheDocument();
  });

  it('there is no «مصدر لـ» line without a starting person in the tree', () => {
    renderForm({ data: undefined });
    expect(screen.queryByRole('group', { name: 'مصدر لـ:' })).toBeNull();
  });

  it('the files warning at the public level counts the people the published tree shows', async () => {
    api.uploadSourceFile.mockResolvedValue({ id: 'F1', mimeType: 'image/png', sizeBytes: 3, fileName: 'a.png' });
    renderForm();
    await pickWholeFamily();
    fireEvent.click(screen.getByRole('radio', { name: /وزوار الشجرة المنشورة/ }));
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [new File(['a'], 'a.png', { type: 'image/png' })] },
    });
    expect(await screen.findByText(/هذا المصدر لـ ٦ أشخاص، ويظهر على الأشخاص الظاهرين في الشجرة المنشورة \(٠ من ٦\)/)).toBeInTheDocument();
  });
});

describe('«مصدر لـ» — edit a shared source', () => {
  const shared = dto({
    text: 'دفتر العائلة',
    visibility: 'members',
    people: [
      { id: 'W1', name: 'فاطمة بنت …' },
      { id: 'K1', name: 'أحمد بن محمد العطار' },
    ],
    sharedCount: 2,
  });

  it('warns that an edit shows for everyone, and names the count on «حفظ» once the content changes', async () => {
    api.patchSource.mockResolvedValue({ ...shared, text: 'دفتر العائلة ١٩٧٤', peopleCount: 3 });
    const { onSaved } = renderForm({ mode: 'edit', entry: shared });
    expect(screen.getByText('هذا المصدر لـ ٣ أشخاص. أي تعديل هنا يظهر عندهم جميعًا.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حفظ' })).toBeInTheDocument();
    fireEvent.change(textbox(), { target: { value: 'دفتر العائلة ١٩٧٤' } });
    save('حفظ عند ٣ أشخاص');
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.patchSource).toHaveBeenCalledWith('ws', 'S1', { text: 'دفتر العائلة ١٩٧٤' }, 'T');
  });

  it('changing only the people keeps «حفظ» and sends the people changes', async () => {
    api.patchSource.mockResolvedValue({ ...shared, peopleCount: 2 });
    renderForm({ mode: 'edit', entry: shared });
    fireEvent.click(within(line()).getByRole('button', { name: /^إزالة أحمد/ }));
    save('حفظ');
    await waitFor(() => expect(api.patchSource).toHaveBeenCalledWith('ws', 'S1', { removePersonIds: ['K1'] }, 'T'));
  });

  it('a one-person source shows no banner', () => {
    renderForm({ mode: 'edit', entry: dto() });
    expect(screen.queryByText(/أي تعديل هنا يظهر عندهم جميعًا/)).toBeNull();
  });

  it('loads every person when the entry carries only the first names', async () => {
    api.fetchSourcePreview.mockResolvedValue({
      ...shared,
      people: [{ id: 'M', name: 'محمد' }, ...shared.people, { id: 'K2', name: 'سعاد بنت محمد العطار' }],
      peopleCount: 4,
    });
    renderForm({ mode: 'edit', entry: { ...shared, sharedCount: 3 } });
    fireEvent.click(await within(line()).findByRole('button', { name: /^إزالة سعاد/ }));
    expect(api.fetchSourcePreview).toHaveBeenCalledWith('ws', 'S1', 'T');
  });
});

describe('reuse — typing suggestions', () => {
  it('asks for this tree’s sources and labels shared or filed ones with their people and files', async () => {
    api.fetchSourceSuggestionSummaries.mockResolvedValue([bookSummary, oneBook]);
    renderForm();
    await typeAndSuggest('دفتر');
    expect(api.fetchSourceSuggestionSummaries).toHaveBeenCalledWith('ws', 'دفتر', 'T');
    expect(await screen.findByText('· مصدر لـ ١٠ أشخاص · ٣ ملفات')).toBeInTheDocument();
    expect(screen.getByText('سعاد: طبقات ابن سعد، ص ٩٠')).toBeInTheDocument();
  });

  it('[ربطه بهذا الشخص] links the existing source on «حفظ» — no new source, no upload', async () => {
    api.fetchSourceSuggestionSummaries.mockResolvedValue([bookSummary]);
    api.patchSource.mockResolvedValue({ ...dto({ id: 'S9' }), peopleCount: 11 });
    const { onSaved } = renderForm();
    await typeAndSuggest('دفتر');
    fireEvent.click(await screen.findByRole('button', { name: /^دفتر العائلة/ }));
    fireEvent.click(screen.getByRole('button', { name: 'ربطه بهذا الشخص' }));
    expect(api.patchSource).not.toHaveBeenCalled();
    expect(screen.queryByText('ملفات')).toBeNull();
    save();
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.patchSource).toHaveBeenCalledWith('ws', 'S9', { addPersonIds: ['M'] }, 'T');
    expect(api.createSource).not.toHaveBeenCalled();
  });

  it('[نسخ النص فقط] copies the text into a new source', async () => {
    api.fetchSourceSuggestionSummaries.mockResolvedValue([bookSummary]);
    renderForm();
    await typeAndSuggest('دفتر');
    fireEvent.click(await screen.findByRole('button', { name: /^دفتر العائلة/ }));
    fireEvent.click(screen.getByRole('button', { name: 'نسخ النص فقط' }));
    expect(textbox().value).toBe('دفتر العائلة');
    expect(screen.queryByRole('button', { name: 'ربطه بهذا الشخص' })).toBeNull();
  });

  it('a one-person text source only copies its text', async () => {
    api.fetchSourceSuggestionSummaries.mockResolvedValue([oneBook]);
    renderForm();
    await typeAndSuggest('طبقات');
    fireEvent.click(await screen.findByRole('button', { name: 'سعاد: طبقات ابن سعد، ص ٩٠' }));
    expect(textbox().value).toBe('طبقات ابن سعد، ص ٩٠');
  });

  it('«عرض» opens the preview, and linking from it stages the link', async () => {
    api.fetchSourceSuggestionSummaries.mockResolvedValue([bookSummary]);
    api.fetchSourcePreview.mockResolvedValue({ ...dto({ id: 'S9', text: 'دفتر العائلة كاملًا' }), people: [], peopleCount: 10 });
    renderForm();
    await typeAndSuggest('دفتر');
    fireEvent.click(await screen.findByRole('button', { name: 'عرض دفتر العائلة' }));
    const preview = await screen.findByRole('dialog', { name: 'معاينة المصدر' });
    await within(preview).findByText('دفتر العائلة كاملًا');
    fireEvent.click(within(preview).getByRole('button', { name: 'ربطه بهذا الشخص' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'معاينة المصدر' })).toBeNull());
    expect(screen.getByRole('button', { name: 'إلغاء الربط' })).toBeInTheDocument();
  });

  it('edit mode never offers to link another source', async () => {
    api.fetchSourceSuggestionSummaries.mockResolvedValue([bookSummary]);
    renderForm({ mode: 'edit', entry: dto() });
    await typeAndSuggest('دفتر');
    fireEvent.click(await screen.findByRole('button', { name: /^دفتر العائلة/ }));
    expect(screen.queryByRole('button', { name: 'ربطه بهذا الشخص' })).toBeNull();
    expect(textbox().value).toBe('دفتر العائلة');
  });
});

describe('deferred mode (inside the person form)', () => {
  it('hands back the other people on the line', async () => {
    const onDraft = vi.fn();
    renderForm({ onDraft });
    fireEvent.click(screen.getByRole('button', { name: '＋ أشخاص آخرون' }));
    fireEvent.click(await screen.findByRole('button', { name: 'الزوجة: فاطمة' }));
    fireEvent.click(screen.getByRole('button', { name: 'تم' }));
    fireEvent.change(textbox(), { target: { value: 'دفتر' } });
    save();
    expect(onDraft).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'دفتر', people: [{ id: 'W1', name: 'فاطمة' }] }),
    );
    expect(api.createSource).not.toHaveBeenCalled();
  });

  it('hands back a reuse link instead of a new source', async () => {
    const onDraft = vi.fn();
    api.fetchSourceSuggestionSummaries.mockResolvedValue([bookSummary]);
    renderForm({ onDraft });
    await typeAndSuggest('دفتر');
    fireEvent.click(await screen.findByRole('button', { name: /^دفتر العائلة/ }));
    fireEvent.click(screen.getByRole('button', { name: 'ربطه بهذا الشخص' }));
    save();
    expect(onDraft).toHaveBeenCalledWith(expect.objectContaining({ linkSource: bookSummary, people: [] }));
  });

  it('an edit hands back the people changes', async () => {
    const onDraft = vi.fn();
    const shared = dto({ people: [{ id: 'W1', name: 'فاطمة' }], sharedCount: 1 });
    renderForm({ onDraft, mode: 'edit', entry: shared });
    fireEvent.click(within(line()).getByRole('button', { name: /^إزالة فاطمة/ }));
    save();
    expect(onDraft).toHaveBeenCalledWith(expect.objectContaining({ removePersonIds: ['W1'], addPersonIds: [] }));
  });
});

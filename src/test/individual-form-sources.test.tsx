/**
 * «المصادر» inside the person form (IndividualForm). The form makes no API
 * call for sources: rows are staged, and «حفظ» hands the parent ONE plan
 * (`onSubmit(data, sourcePlan)`). The stacked «إضافة مصدر» form is deferred.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';

const api = {
  createSourceEntry: vi.fn(),
  updateSourceEntry: vi.fn(),
  deleteSourceEntry: vi.fn(),
  uploadSourceFile: vi.fn(),
  deleteSourceFile: vi.fn(),
  fetchSourceSuggestions: vi.fn(),
  fetchSourceFileBlob: vi.fn(),
  putTreeEntry: vi.fn(),
};
vi.mock('@/lib/tree/source-entries-api', () => ({
  createSourceEntry: (...a: unknown[]) => api.createSourceEntry(...a),
  updateSourceEntry: (...a: unknown[]) => api.updateSourceEntry(...a),
  deleteSourceEntry: (...a: unknown[]) => api.deleteSourceEntry(...a),
  uploadSourceFile: (...a: unknown[]) => api.uploadSourceFile(...a),
  deleteSourceFile: (...a: unknown[]) => api.deleteSourceFile(...a),
  fetchSourceSuggestions: (...a: unknown[]) => api.fetchSourceSuggestions(...a),
  fetchSourceFileBlob: (...a: unknown[]) => api.fetchSourceFileBlob(...a),
  putTreeEntry: (...a: unknown[]) => api.putTreeEntry(...a),
}));
vi.mock('@/hooks/useTreePublishLevel', () => ({ useTreePublishLevel: () => 'private' }));
vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

import { IndividualForm } from '@/components/tree/IndividualForm/IndividualForm';
import type { SourceEntryDto } from '@/lib/tree/source-entries-api';

const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();

function entry(id: string, over: Partial<SourceEntryDto> = {}): SourceEntryDto {
  return { id, individualId: 'P1', text: `نص ${id}`, visibility: 'members', createdAt: '', updatedAt: '', files: [], ...over };
}

const pdf = { id: 'F1', mimeType: 'application/pdf' as const, sizeBytes: 1, fileName: 'deed.pdf' };

function renderForm(
  props: Partial<React.ComponentProps<typeof IndividualForm>> = {},
  sources: Partial<NonNullable<React.ComponentProps<typeof IndividualForm>['sources']>> = {},
) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const utils = render(
    <IndividualForm
      mode="edit"
      initialData={{ givenName: 'علي', sex: 'M' }}
      onSubmit={onSubmit}
      onClose={onClose}
      sources={{ workspaceId: 'ws', isAdmin: true, entries: [], inherited: null, ...sources }}
      {...props}
    />,
  );
  return { ...utils, onSubmit, onClose };
}

const section = () => screen.getByRole('region', { name: /المصادر/ });
const submit = () => fireEvent.submit(document.getElementById('individual-form')!);

async function addTextSource(text: string) {
  fireEvent.click(within(section()).getByRole('button', { name: 'إضافة مصدر' }));
  const dialog = screen.getByRole('dialog', { name: 'إضافة مصدر' });
  fireEvent.change(within(dialog).getByLabelText('المصدر'), { target: { value: text } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'إضافة مصدر' })).toBeNull());
}

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset());
  api.fetchSourceSuggestions.mockResolvedValue([]);
  api.fetchSourceFileBlob.mockResolvedValue(new Blob(['x']));
  createObjectURL.mockReset().mockReturnValue('blob:preview');
  revokeObjectURL.mockReset();
  Object.assign(URL, { createObjectURL, revokeObjectURL });
});

describe('IndividualForm — sources section visibility', () => {
  it('has no sources section without the `sources` prop', () => {
    render(<IndividualForm mode="create" onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole('region', { name: /المصادر/ })).toBeNull();
  });

  it('hides the section in branch-link mode', () => {
    renderForm({ mode: 'create', allowBranchLink: true, onBranchLink: vi.fn(), workspaceId: 'ws' });
    expect(section()).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('ربط من مساحة أخرى'));
    expect(screen.queryByRole('region', { name: /المصادر/ })).toBeNull();
  });

  it('edit mode lists the entries and the inherited tree-wide row (read-only)', () => {
    renderForm({}, { entries: [entry('a')], inherited: entry('t', { individualId: null, text: 'كتاب العائلة' }) });
    expect(within(section()).getByText('نص a')).toBeInTheDocument();
    expect(within(section()).getByText('كتاب العائلة')).toBeInTheDocument();
    expect(within(section()).getByText('— من مصدر الشجرة')).toBeInTheDocument();
    expect(within(section()).getAllByRole('button', { name: 'تعديل المصدر' })).toHaveLength(1);
  });

  it('create modes show the inherited row too', () => {
    renderForm({ mode: 'create' }, { inherited: entry('t', { individualId: null, text: 'كتاب العائلة' }) });
    expect(within(section()).getByText('كتاب العائلة')).toBeInTheDocument();
  });

  it('shows the empty state with the add button', () => {
    renderForm();
    expect(within(section()).getByText('لا مصدر لهذا الشخص')).toBeInTheDocument();
    expect(within(section()).getByRole('button', { name: 'إضافة مصدر' })).toBeInTheDocument();
  });
});

describe('IndividualForm — staging', () => {
  it('«إضافة مصدر» → «حفظ» makes no API call and adds a row tagged «جديد»', async () => {
    renderForm();
    await addTextSource('ابن سعد');
    expect(within(section()).getByText('ابن سعد')).toBeInTheDocument();
    expect(within(section()).getByText('جديد')).toBeInTheDocument();
    expect(screen.getByText('أُضيف المصدر إلى القائمة')).toBeInTheDocument();
    expect(screen.getByText('تغييرات المصادر تُحفظ عند الضغط على «حفظ»')).toBeInTheDocument();
    expect(api.createSourceEntry).not.toHaveBeenCalled();
  });

  it('in create modes an added row says it is saved with the person', async () => {
    renderForm({ mode: 'create' });
    await addTextSource('ابن سعد');
    expect(within(section()).getByText('يُحفظ مع الشخص')).toBeInTheDocument();
    // The hint names the button the user actually sees in create modes.
    expect(screen.getByText('تغييرات المصادر تُحفظ عند الضغط على «إضافة»')).toBeInTheDocument();
  });

  it('deleting marks the row «سيُحذف» and drops the count; «تراجع» restores it; no API call', () => {
    renderForm({}, { entries: [entry('a'), entry('b')] });
    expect(within(section()).getByRole('heading', { name: 'المصادر (٢)' })).toBeInTheDocument();
    fireEvent.click(within(section()).getAllByRole('button', { name: 'حذف المصدر' })[0]);
    expect(within(section()).getByText('سيُحذف')).toBeInTheDocument();
    expect(within(section()).getByRole('heading', { name: 'المصادر (١)' })).toBeInTheDocument();
    fireEvent.click(within(section()).getByRole('button', { name: 'تراجع عن حذف المصدر' }));
    expect(within(section()).queryByText('سيُحذف')).toBeNull();
    expect(api.deleteSourceEntry).not.toHaveBeenCalled();
  });

  it('an entry with files says it goes with its files', () => {
    renderForm({}, { entries: [entry('a', { files: [pdf] })] });
    fireEvent.click(within(section()).getByRole('button', { name: 'حذف المصدر' }));
    expect(within(section()).getByText('سيُحذف مع ملفاته')).toBeInTheDocument();
  });

  it('editing a row marks it «مُعدَّل»', async () => {
    renderForm({}, { entries: [entry('a')] });
    fireEvent.click(within(section()).getByRole('button', { name: 'تعديل المصدر' }));
    const dialog = screen.getByRole('dialog', { name: 'تعديل المصدر' });
    fireEvent.change(within(dialog).getByLabelText('المصدر'), { target: { value: 'نص جديد' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ' }));
    await waitFor(() => expect(within(section()).getByText('مُعدَّل')).toBeInTheDocument());
    expect(api.updateSourceEntry).not.toHaveBeenCalled();
  });
});

describe('IndividualForm — «حفظ»', () => {
  it('hands the parent the person data and ONE source plan', async () => {
    const { onSubmit } = renderForm({}, { entries: [entry('a'), entry('b')] });
    await addTextSource('ابن سعد');
    fireEvent.click(within(section()).getAllByRole('button', { name: 'حذف المصدر' })[1]);
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const [data, plan] = onSubmit.mock.calls[0];
    expect(data.givenName).toBe('علي');
    expect(plan.creates).toEqual([expect.objectContaining({ text: 'ابن سعد', visibility: 'admins', fileIds: [] })]);
    expect(plan.updates).toEqual([]);
    expect(plan.deletes).toEqual([expect.objectContaining({ id: 'b' })]);
  });

  it('after a partly-failed save flags the failed rows and keeps the saved ones out of the retry', async () => {
    const { onSubmit } = renderForm({}, { entries: [entry('a')] });
    await addTextSource('أول');
    await addTextSource('ثان');
    onSubmit.mockImplementationOnce(async (_d: unknown, plan: { creates: { key: string }[] }) => ({
      created: { [plan.creates[0].key]: entry('S-NEW', { text: 'أول', visibility: 'admins' }) },
      failedCreates: [plan.creates[1].key],
      updated: {},
      failedUpdates: [],
      deleted: [],
      failedDeletes: [],
    }));
    submit();
    await waitFor(() => expect(within(section()).getByText('تعذّر الحفظ')).toBeInTheDocument());
    expect(within(section()).getAllByText('جديد')).toHaveLength(1);
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1][1].creates.map((c: { text: string }) => c.text)).toEqual(['ثان']);
  });
});

describe('IndividualForm — cancel', () => {
  it('closes at once when nothing is staged', () => {
    const { onClose } = renderForm({}, { entries: [entry('a')] });
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('with staged changes shows the discard bar; «متابعة التعديل» keeps editing', async () => {
    const { onClose } = renderForm();
    await addTextSource('ابن سعد');
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء' }));
    expect(screen.getByText('ستُفقد تغييرات المصادر. تجاهلها؟')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'متابعة التعديل' }));
    expect(screen.queryByText('ستُفقد تغييرات المصادر. تجاهلها؟')).toBeNull();
    // Esc on the person form asks too.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByText('ستُفقد تغييرات المصادر. تجاهلها؟')).toBeInTheDocument();
  });

  it('«تجاهل» closes the form and revokes the local previews', async () => {
    api.uploadSourceFile.mockResolvedValue({ id: 'UP1', mimeType: 'image/png', sizeBytes: 3, fileName: 'a.png' });
    const { onClose, unmount } = renderForm();
    fireEvent.click(within(section()).getByRole('button', { name: 'إضافة مصدر' }));
    const dialog = screen.getByRole('dialog', { name: 'إضافة مصدر' });
    const input = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'إزالة a.png' })).toBeInTheDocument());
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'إضافة مصدر' })).toBeNull());
    expect(revokeObjectURL).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء' }));
    fireEvent.click(screen.getByRole('button', { name: 'تجاهل' }));
    expect(onClose).toHaveBeenCalled();
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });
});

describe('IndividualForm — stacked form', () => {
  it('Esc closes only the stacked form and focus returns to «إضافة مصدر»', () => {
    const { onClose } = renderForm();
    const add = within(section()).getByRole('button', { name: 'إضافة مصدر' });
    act(() => add.focus());
    fireEvent.click(add);
    expect(screen.getByRole('dialog', { name: 'إضافة مصدر' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'إضافة مصدر' })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: /تعديل بيانات/ })).toBeInTheDocument();
    expect(document.activeElement).toBe(add);
  });
});

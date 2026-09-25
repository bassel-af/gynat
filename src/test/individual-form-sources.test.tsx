/**
 * «المصادر» inside the person form (IndividualForm). The form makes no API
 * call for sources: rows are staged, and «حفظ» hands the parent ONE plan
 * (`onSubmit(data, sourcePlan)`). The stacked «إضافة مصدر» form is deferred.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';

const api = {
  createSource: vi.fn(),
  patchSource: vi.fn(),
  deleteSourceEntry: vi.fn(),
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
  deleteSourceEntry: (...a: unknown[]) => api.deleteSourceEntry(...a),
  uploadSourceFile: (...a: unknown[]) => api.uploadSourceFile(...a),
  deleteSourceFile: (...a: unknown[]) => api.deleteSourceFile(...a),
  fetchSourceSuggestionSummaries: (...a: unknown[]) => api.fetchSourceSuggestionSummaries(...a),
  fetchSourcePreview: (...a: unknown[]) => api.fetchSourcePreview(...a),
  fetchSourceFileBlob: (...a: unknown[]) => api.fetchSourceFileBlob(...a),
  putTreeEntry: (...a: unknown[]) => api.putTreeEntry(...a),
}));
vi.mock('@/hooks/useTreePublishLevel', () => ({ useTreePublishLevel: () => 'private' }));
vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));
// The «مصدر لـ» line reads the loaded tree from the TreeProvider.
const tree = vi.hoisted(() => ({ data: null as unknown }));
vi.mock('@/context/TreeContext', () => ({ useOptionalTree: () => ({ data: tree.data }) }));

import { IndividualForm } from '@/components/tree/IndividualForm/IndividualForm';
import type { SourceEntryDto } from '@/lib/tree/source-entries-api';
import { SOURCE_SELF } from '@/lib/tree/source-staging';
import { buildPickerFamily } from './helpers/source-people-fixture';

const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();

type Entry = SourceEntryDto & { people: { id: string; name: string }[]; sharedCount: number };

function entry(id: string, over: Partial<Entry> = {}): Entry {
  return { id, individualId: 'M', text: `نص ${id}`, visibility: 'members', createdAt: '', updatedAt: '', files: [], people: [], sharedCount: 0, ...over };
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
  tree.data = null;
  Object.values(api).forEach((m) => m.mockReset());
  api.fetchSourceSuggestionSummaries.mockResolvedValue([]);
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
    expect(api.createSource).not.toHaveBeenCalled();
  });

  it('in create modes an added row says it is saved with the person', async () => {
    renderForm({ mode: 'create' });
    await addTextSource('ابن سعد');
    expect(within(section()).getByText('يُحفظ مع الشخص')).toBeInTheDocument();
    // The hint names the button the user actually sees in create modes.
    expect(screen.getByText('تغييرات المصادر تُحفظ عند الضغط على «إضافة»')).toBeInTheDocument();
  });

  it('deleting a one-person source asks «هذا آخر شخص لهذا المصدر»; «حذف» marks it «سيُحذف»; «تراجع» restores it; no API call', () => {
    renderForm({}, { entries: [entry('a'), entry('b')] });
    expect(within(section()).getByRole('heading', { name: 'المصادر (٢)' })).toBeInTheDocument();
    fireEvent.click(within(section()).getAllByRole('button', { name: 'حذف المصدر' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'حذف المصدر وملفاته' }));
    expect(within(section()).getByText('سيُحذف')).toBeInTheDocument();
    expect(within(section()).getByRole('heading', { name: 'المصادر (١)' })).toBeInTheDocument();
    fireEvent.click(within(section()).getByRole('button', { name: 'تراجع عن حذف المصدر' }));
    expect(within(section()).queryByText('سيُحذف')).toBeNull();
    expect(api.deleteSourceEntry).not.toHaveBeenCalled();
  });

  it('an entry with files says it goes with its files', () => {
    renderForm({}, { entries: [entry('a', { files: [pdf] })] });
    fireEvent.click(within(section()).getByRole('button', { name: 'حذف المصدر' }));
    fireEvent.click(screen.getByRole('button', { name: 'حذف المصدر وملفاته' }));
    expect(within(section()).getByText('سيُحذف مع ملفاته')).toBeInTheDocument();
  });

  it('editing a row marks it «مُعدَّل»', async () => {
    renderForm({}, { entries: [entry('a')] });
    fireEvent.click(within(section()).getByRole('button', { name: 'تعديل المصدر' }));
    const dialog = screen.getByRole('dialog', { name: 'تعديل المصدر' });
    fireEvent.change(within(dialog).getByLabelText('المصدر'), { target: { value: 'نص جديد' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ' }));
    await waitFor(() => expect(within(section()).getByText('مُعدَّل')).toBeInTheDocument());
    expect(api.patchSource).not.toHaveBeenCalled();
  });
});

describe('IndividualForm — shared sources (R5)', () => {
  beforeEach(() => {
    tree.data = buildPickerFamily();
  });

  const shared = () => entry('d', { text: 'دفتر العائلة', people: [{ id: 'W1', name: 'فاطمة' }, { id: 'K1', name: 'أحمد' }], sharedCount: 2 });

  it('a shared row carries «مشترك مع …»', () => {
    renderForm({}, { individualId: 'M', entries: [shared()] });
    expect(within(section()).getByText('مشترك مع شخصين آخرين')).toBeInTheDocument();
  });

  it('removing a shared source takes it off this person only — no question, the others keep it', async () => {
    const { onSubmit } = renderForm({}, { individualId: 'M', entries: [shared()] });
    fireEvent.click(within(section()).getByRole('button', { name: 'إزالة المصدر عن هذا الشخص' }));
    expect(screen.queryByText('هذا آخر شخص لهذا المصدر')).toBeNull();
    expect(within(section()).getByText('سيُزال عن هذا الشخص')).toBeInTheDocument();
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const plan = onSubmit.mock.calls[0][1];
    expect(plan.unlinks).toEqual([expect.objectContaining({ id: 'd' })]);
    expect(plan.deletes).toEqual([]);
  });

  it('«إبقاؤه في صفحة المصادر» stages a removal that keeps the source linked to nobody', async () => {
    const { onSubmit } = renderForm({}, { individualId: 'M', entries: [entry('a')] });
    fireEvent.click(within(section()).getByRole('button', { name: 'حذف المصدر' }));
    fireEvent.click(screen.getByRole('button', { name: 'إبقاؤه في صفحة المصادر' }));
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][1].unlinks).toEqual([{ id: 'a', before: expect.anything(), onLastLink: 'keep' }]);
  });

  it('closing the last-person question stages nothing', () => {
    renderForm({}, { individualId: 'M', entries: [entry('a')] });
    fireEvent.click(within(section()).getByRole('button', { name: 'حذف المصدر' }));
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق' }));
    expect(screen.queryByText('هذا آخر شخص لهذا المصدر')).toBeNull();
    expect(within(section()).queryByText(/سيُحذف|سيُزال/)).toBeNull();
  });

  it('edit mode: the stacked form locks this person on «مصدر لـ», and picked people go into the plan', async () => {
    const { onSubmit } = renderForm({}, { individualId: 'M' });
    fireEvent.click(within(section()).getByRole('button', { name: 'إضافة مصدر' }));
    const dialog = screen.getByRole('dialog', { name: 'إضافة مصدر' });
    const line = within(dialog).getByRole('group', { name: 'مصدر لـ:' });
    expect(within(line).getByText('· أضفته من صفحته')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '＋ أشخاص آخرون' }));
    fireEvent.click(await screen.findByRole('button', { name: 'الزوجة: فاطمة' }));
    fireEvent.click(screen.getByRole('button', { name: 'تم' }));
    fireEvent.change(within(dialog).getByLabelText('المصدر'), { target: { value: 'دفتر العائلة' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'إضافة مصدر' })).toBeNull());
    expect(within(section()).getByText('مشترك مع شخص آخر')).toBeInTheDocument();
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][1].creates[0].personIds).toEqual([SOURCE_SELF, 'W1']);
  });

  it('create modes: the locked chip reads «هذا الشخص (جديد)»', () => {
    renderForm({ mode: 'create' });
    fireEvent.click(within(section()).getByRole('button', { name: 'إضافة مصدر' }));
    const dialog = screen.getByRole('dialog', { name: 'إضافة مصدر' });
    expect(within(within(dialog).getByRole('group', { name: 'مصدر لـ:' })).getByText('هذا الشخص (جديد)')).toBeInTheDocument();
  });

  it('«مصادر أسرته» → «إضافة» stages a link to the same source (no API call)', async () => {
    const hint = { id: 'S-D', text: 'دفتر العائلة', visibility: 'members' as const, fileCount: 3, peopleCount: 10, firstPersonName: null };
    const { onSubmit } = renderForm({}, { individualId: 'M', familyHints: [hint] });
    expect(within(section()).getByText('مصادر أسرته:')).toBeInTheDocument();
    fireEvent.click(within(section()).getByRole('button', { name: 'إضافة' }));
    expect(api.patchSource).not.toHaveBeenCalled();
    expect(within(section()).getByText('دفتر العائلة')).toBeInTheDocument();
    expect(within(section()).queryByText('مصادر أسرته:')).toBeNull();
    submit();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][1].links).toEqual([expect.objectContaining({ sourceId: 'S-D', personIds: [SOURCE_SELF] })]);
  });
});

describe('IndividualForm — «حفظ»', () => {
  it('hands the parent the person data and ONE source plan', async () => {
    const { onSubmit } = renderForm({}, { entries: [entry('a'), entry('b')] });
    await addTextSource('ابن سعد');
    fireEvent.click(within(section()).getAllByRole('button', { name: 'حذف المصدر' })[1]);
    fireEvent.click(screen.getByRole('button', { name: 'حذف المصدر وملفاته' }));
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

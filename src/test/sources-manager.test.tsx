import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';

const api = {
  listTreeSources: vi.fn(),
  bulkSources: vi.fn(),
  fetchSourceFileBlob: vi.fn(),
  patchSource: vi.fn(),
  fetchSourcePreview: vi.fn(),
};
vi.mock('@/lib/tree/source-entries-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tree/source-entries-api')>()),
  listTreeSources: (...a: unknown[]) => api.listTreeSources(...a),
  bulkSources: (...a: unknown[]) => api.bulkSources(...a),
  fetchSourceFileBlob: (...a: unknown[]) => api.fetchSourceFileBlob(...a),
  patchSource: (...a: unknown[]) => api.patchSource(...a),
  fetchSourcePreview: (...a: unknown[]) => api.fetchSourcePreview(...a),
}));
vi.mock('@/hooks/useTreePublishLevel', () => ({ useTreePublishLevel: () => 'private' }));
const apiFetch = vi.fn();
vi.mock('@/lib/api/client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));
const showToast = vi.fn();
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ showToast }) }));
const notifySourcesChanged = vi.fn();
vi.mock('@/hooks/usePersonSources', () => ({ notifySourcesChanged: () => notifySourcesChanged() }));

import { SourcesManager } from '@/components/sources/SourcesManager';
import { LastLinkError } from '@/lib/tree/source-entries-api';
import { buildPickerFamily } from './helpers/source-people-fixture';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function item(n: number, over: Record<string, unknown> = {}) {
  return {
    id: ID(n),
    individualId: `P${n}`,
    text: `مصدر ${n}`,
    visibility: 'admins',
    createdAt: '',
    updatedAt: '',
    files: [],
    people: [{ id: `P${n}`, name: `شخص ${n}` }],
    peopleCount: 1,
    fileCount: 0,
    ...over,
  };
}

function page(over: Record<string, unknown> = {}) {
  return {
    entries: [item(1), item(2)],
    total: 3,
    nextCursor: 2,
    matchedIds: [ID(1), ID(2), ID(3)],
    matchedIdsTruncated: false,
    scanTruncated: false,
    counts: { all: 3, shared: 1, unlinked: 1 },
    ...over,
  };
}

function renderManager(props: Record<string, unknown> = {}) {
  return render(<SourcesManager workspaceId="ws" slug="fam" {...props} />);
}

const lastListParams = () => api.listTreeSources.mock.calls[api.listTreeSources.mock.calls.length - 1][1];

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset());
  apiFetch.mockReset();
  showToast.mockReset();
  notifySourcesChanged.mockReset();
  api.listTreeSources.mockResolvedValue(page());
  api.bulkSources.mockResolvedValue({ updated: 3 });
  api.patchSource.mockResolvedValue({});
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ data: buildPickerFamily() }) });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SourcesManager — list', () => {
  it('loads the first page of the tree (treeId passed through)', async () => {
    renderManager({ treeId: 'T1' });
    expect(await screen.findByText('مصدر 1')).toBeInTheDocument();
    expect(api.listTreeSources).toHaveBeenCalledWith('ws', expect.objectContaining({ treeId: 'T1' }));
  });

  it('shows who each source is for as a short names list', async () => {
    api.listTreeSources.mockResolvedValue(
      page({
        entries: [
          item(1, {
            people: [
              { id: 'M', name: 'محمد' },
              { id: 'W1', name: 'فاطمة' },
              { id: 'K1', name: 'أحمد' },
            ],
            peopleCount: 10,
          }),
        ],
      }),
    );
    renderManager();
    expect(await screen.findByText(/محمد، فاطمة و٨ آخرون/)).toBeInTheDocument();
  });

  it('«عرض المزيد» fetches the next page from the cursor and appends it', async () => {
    renderManager();
    await screen.findByText('مصدر 1');
    api.listTreeSources.mockResolvedValue(page({ entries: [item(3)], nextCursor: null }));
    fireEvent.click(screen.getByRole('button', { name: 'عرض المزيد' }));
    expect(await screen.findByText('مصدر 3')).toBeInTheDocument();
    expect(screen.getByText('مصدر 1')).toBeInTheDocument();
    expect(lastListParams()).toEqual(expect.objectContaining({ cursor: 2 }));
    expect(screen.queryByRole('button', { name: 'عرض المزيد' })).toBeNull();
  });

  it('shows «لا توجد مصادر في هذه الشجرة» when the tree has no entries', async () => {
    api.listTreeSources.mockResolvedValue(page({ entries: [], total: 0, nextCursor: null, matchedIds: [] }));
    renderManager();
    expect(await screen.findByText('لا توجد مصادر في هذه الشجرة')).toBeInTheDocument();
  });

  it('shows «لا نتائج مطابقة» when a search matches nothing', async () => {
    renderManager();
    await screen.findByText('مصدر 1');
    api.listTreeSources.mockResolvedValue(page({ entries: [], total: 0, nextCursor: null, matchedIds: [] }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'لا شيء' } });
    expect(await screen.findByText('لا نتائج مطابقة')).toBeInTheDocument();
  });
});

describe('SourcesManager — search and filter', () => {
  it('debounces the search and sends it as q', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderManager();
    await screen.findByText('مصدر 1');
    const calls = api.listTreeSources.mock.calls.length;
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ابن سعد' } });
    expect(api.listTreeSources.mock.calls.length).toBe(calls);
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    await waitFor(() => expect(lastListParams()).toEqual(expect.objectContaining({ q: 'ابن سعد', cursor: 0 })));
  });

  it('a level chip sends visibility; «الكل» clears it', async () => {
    renderManager();
    await screen.findByText('مصدر 1');
    fireEvent.click(screen.getByRole('button', { name: 'أعضاء مساحة العائلة' }));
    await waitFor(() => expect(lastListParams()).toEqual(expect.objectContaining({ visibility: 'members' })));
    fireEvent.click(screen.getByRole('button', { name: 'زوار الشجرة المنشورة' }));
    await waitFor(() => expect(lastListParams()).toEqual(expect.objectContaining({ visibility: 'public' })));
    fireEvent.click(screen.getByRole('button', { name: 'الكل' }));
    await waitFor(() => expect(lastListParams().visibility).toBeUndefined());
  });
});

describe('SourcesManager — selection', () => {
  it('«تحديد الكل» selects every matched id, not only the loaded page', async () => {
    renderManager();
    await screen.findByText('مصدر 1');
    fireEvent.click(screen.getByRole('checkbox', { name: 'تحديد الكل' }));
    expect(screen.getByText('تم تحديد ٣')).toBeInTheDocument();
  });

  it('notes when only the first 500 matches could be selected', async () => {
    api.listTreeSources.mockResolvedValue(page({ matchedIdsTruncated: true }));
    renderManager();
    await screen.findByText('مصدر 1');
    fireEvent.click(screen.getByRole('checkbox', { name: 'تحديد الكل' }));
    expect(screen.getByText(/أول ٥٠٠/)).toBeInTheDocument();
  });

  it('a row checkbox selects that one entry', async () => {
    renderManager();
    await screen.findByText('مصدر 1');
    fireEvent.click(screen.getByRole('checkbox', { name: 'تحديد مصدر 2' }));
    expect(screen.getByText('تم تحديد ١')).toBeInTheDocument();
  });
});

describe('SourcesManager — bulk actions', () => {
  async function selectAll() {
    renderManager({ treeId: 'T1' });
    await screen.findByText('مصدر 1');
    fireEvent.click(screen.getByRole('checkbox', { name: 'تحديد الكل' }));
  }

  it('«تغيير من يرى» sends every selected id with the chosen level', async () => {
    await selectAll();
    fireEvent.click(screen.getByRole('button', { name: 'تغيير من يرى' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByLabelText('أعضاء مساحة العائلة'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'تطبيق' }));
    await waitFor(() =>
      expect(api.bulkSources).toHaveBeenCalledWith(
        'ws',
        { ids: [ID(1), ID(2), ID(3)], action: 'setVisibility', visibility: 'members' },
        'T1',
      ),
    );
    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(notifySourcesChanged).toHaveBeenCalled();
    expect(screen.queryByText(/تم تحديد/)).toBeNull();
  });

  it('warns about files when raising entries with files to the public level', async () => {
    api.listTreeSources.mockResolvedValue(page({ entries: [item(1, { fileCount: 2 }), item(2)], matchedIds: [ID(1), ID(2)] }));
    await selectAll();
    fireEvent.click(screen.getByRole('button', { name: 'تغيير من يرى' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText(/بيانات شخصية لأحياء/)).toBeNull();
    fireEvent.click(within(dialog).getByRole('radio', { name: /وزوار الشجرة المنشورة/ }));
    expect(within(dialog).getByText(/بيانات شخصية لأحياء/)).toBeInTheDocument();
  });

  it('no files warning when no selected entry has files', async () => {
    api.listTreeSources.mockResolvedValue(page({ matchedIds: [ID(1), ID(2)] }));
    await selectAll();
    fireEvent.click(screen.getByRole('button', { name: 'تغيير من يرى' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('radio', { name: /وزوار الشجرة المنشورة/ }));
    expect(within(dialog).queryByText(/بيانات شخصية لأحياء/)).toBeNull();
  });

  it('«حذف» asks for confirmation with the count before deleting', async () => {
    api.bulkSources.mockResolvedValue({ deleted: 3 });
    await selectAll();
    fireEvent.click(screen.getByRole('button', { name: 'حذف' }));
    expect(api.bulkSources).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('سيُحذف ٣ مصادر مع ملفاتها، ولا يمكن التراجع')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'حذف' }));
    await waitFor(() =>
      expect(api.bulkSources).toHaveBeenCalledWith('ws', { ids: [ID(1), ID(2), ID(3)], action: 'delete' }, 'T1'),
    );
    await waitFor(() => expect(notifySourcesChanged).toHaveBeenCalled());
  });

  it('cancelling the delete confirmation sends nothing', async () => {
    await selectAll();
    fireEvent.click(screen.getByRole('button', { name: 'حذف' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'إلغاء' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.bulkSources).not.toHaveBeenCalled();
  });

  it('refetches the list after a bulk action', async () => {
    await selectAll();
    const calls = api.listTreeSources.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'حذف' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'حذف' }));
    await waitFor(() => expect(api.listTreeSources.mock.calls.length).toBeGreaterThan(calls));
  });
});

describe('SourcesManager — tabs', () => {
  it('shows every tab with its count from the server', async () => {
    renderManager();
    await screen.findByText('مصدر 1');
    expect(screen.getByRole('button', { name: 'الكل (٣)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'مشترك (١)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ليس مصدرًا لأحد (١)' })).toBeInTheDocument();
  });

  it('«مشترك» and «ليس مصدرًا لأحد» send their filter; «الكل» clears it', async () => {
    renderManager();
    await screen.findByText('مصدر 1');
    fireEvent.click(screen.getByRole('button', { name: 'مشترك (١)' }));
    await waitFor(() => expect(lastListParams()).toEqual(expect.objectContaining({ filter: 'shared', cursor: 0 })));
    fireEvent.click(screen.getByRole('button', { name: 'ليس مصدرًا لأحد (١)' }));
    await waitFor(() => expect(lastListParams()).toEqual(expect.objectContaining({ filter: 'unlinked' })));
    fireEvent.click(screen.getByRole('button', { name: 'الكل (٣)' }));
    await waitFor(() => expect(lastListParams().filter).toBeUndefined());
  });
});

describe('SourcesManager — «مصدر لـ» names', () => {
  const shared = () =>
    item(1, {
      people: [
        { id: 'M', name: 'محمد' },
        { id: 'W1', name: 'فاطمة' },
      ],
      peopleCount: 2,
    });

  async function expandFirst(entries = [shared()]) {
    api.listTreeSources.mockResolvedValue(page({ entries }));
    renderManager({ treeId: 'T1' });
    fireEvent.click(await screen.findByRole('button', { name: /محمد وفاطمة/ }));
  }

  it('expanding lists every name, each linking to the tree focused on that person', async () => {
    await expandFirst();
    expect(screen.getByRole('link', { name: 'فاطمة' })).toHaveAttribute('href', '/workspaces/fam/tree?treeId=T1&focus=W1');
    expect(screen.getByRole('button', { name: 'إزالة محمد' })).toBeInTheDocument();
  });

  it('fetches the full list when the row carries only the first names', async () => {
    api.fetchSourcePreview.mockResolvedValue({
      ...shared(),
      people: [
        { id: 'M', name: 'محمد' },
        { id: 'W1', name: 'فاطمة' },
        { id: 'K1', name: 'أحمد' },
      ],
      peopleCount: 3,
    });
    api.listTreeSources.mockResolvedValue(page({ entries: [{ ...shared(), peopleCount: 3 }] }));
    renderManager({ treeId: 'T1' });
    fireEvent.click(await screen.findByRole('button', { name: /محمد، فاطمة وشخص آخر/ }));
    expect(await screen.findByRole('link', { name: 'أحمد' })).toBeInTheDocument();
    expect(api.fetchSourcePreview).toHaveBeenCalledWith('ws', ID(1), 'T1');
  });

  it('× removes that one person and refreshes the list', async () => {
    await expandFirst();
    const calls = api.listTreeSources.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'إزالة فاطمة' }));
    await waitFor(() =>
      expect(api.patchSource).toHaveBeenCalledWith('ws', ID(1), { removePersonIds: ['W1'] }, 'T1'),
    );
    await waitFor(() => expect(api.listTreeSources.mock.calls.length).toBeGreaterThan(calls));
    expect(notifySourcesChanged).toHaveBeenCalled();
  });

  it('× on the last person asks «هذا آخر شخص لهذا المصدر»; «إبقاؤه» keeps the source', async () => {
    const single = item(1, { people: [{ id: 'M', name: 'محمد' }], peopleCount: 1 });
    api.listTreeSources.mockResolvedValue(page({ entries: [single] }));
    api.patchSource.mockRejectedValueOnce(new LastLinkError()).mockResolvedValueOnce({ ...single, people: [], peopleCount: 0 });
    renderManager({ treeId: 'T1' });
    fireEvent.click(await screen.findByRole('button', { name: /^محمد/ }));
    fireEvent.click(screen.getByRole('button', { name: 'إزالة محمد' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('ماذا تريد أن تفعل بالمصدر وملفاته؟')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'إبقاؤه في صفحة المصادر' }));
    await waitFor(() =>
      expect(api.patchSource).toHaveBeenLastCalledWith(
        'ws',
        ID(1),
        { removePersonIds: ['M'], onLastLink: 'keep' },
        'T1',
      ),
    );
  });

  it('cancelling the last-person question changes nothing', async () => {
    const single = item(1, { people: [{ id: 'M', name: 'محمد' }], peopleCount: 1 });
    api.listTreeSources.mockResolvedValue(page({ entries: [single] }));
    api.patchSource.mockRejectedValueOnce(new LastLinkError());
    renderManager();
    fireEvent.click(await screen.findByRole('button', { name: /^محمد/ }));
    fireEvent.click(screen.getByRole('button', { name: 'إزالة محمد' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'إغلاق' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.patchSource).toHaveBeenCalledTimes(1);
    expect(notifySourcesChanged).not.toHaveBeenCalled();
  });

  it('«＋ إضافة أشخاص» opens the people picker (search only, nobody locked) and adds the new ones', async () => {
    await expandFirst();
    fireEvent.click(screen.getByRole('button', { name: '＋ إضافة أشخاص' }));
    const picker = await screen.findByRole('dialog', { name: 'اختيار الأشخاص' });
    expect(apiFetch).toHaveBeenCalledWith('/api/workspaces/ws/tree?treeId=T1', expect.anything());
    expect(within(picker).queryByRole('group', { name: 'اختيار سريع' })).toBeNull();
    fireEvent.change(within(picker).getByRole('searchbox'), { target: { value: 'أحمد' } });
    fireEvent.click(within(picker).getByRole('checkbox', { name: /^أحمد/ }));
    fireEvent.click(within(picker).getByRole('button', { name: 'تم' }));
    await waitFor(() =>
      expect(api.patchSource).toHaveBeenCalledWith('ws', ID(1), { addPersonIds: ['K1'] }, 'T1'),
    );
    expect(screen.queryByRole('dialog', { name: 'اختيار الأشخاص' })).toBeNull();
  });

  it('adding only people already on the source sends nothing', async () => {
    await expandFirst();
    fireEvent.click(screen.getByRole('button', { name: '＋ إضافة أشخاص' }));
    const picker = await screen.findByRole('dialog', { name: 'اختيار الأشخاص' });
    fireEvent.change(within(picker).getByRole('searchbox'), { target: { value: 'فاطمة' } });
    fireEvent.click(within(picker).getByRole('checkbox', { name: /^فاطمة/ }));
    fireEvent.click(within(picker).getByRole('button', { name: 'تم' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'اختيار الأشخاص' })).toBeNull());
    expect(api.patchSource).not.toHaveBeenCalled();
  });
});

describe('SourcesManager — «ليس مصدرًا لأحد» rows', () => {
  const orphan = () => item(4, { individualId: null, people: [], peopleCount: 0 });

  it('an orphan row says «ليس مصدرًا لأحد» and «ربط بأشخاص» adds people', async () => {
    api.listTreeSources.mockResolvedValue(page({ entries: [orphan()] }));
    renderManager();
    const row = (await screen.findByText('مصدر 4')).closest('li') as HTMLElement;
    expect(within(row).getByText('ليس مصدرًا لأحد')).toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: 'ربط بأشخاص' }));
    const picker = await screen.findByRole('dialog', { name: 'اختيار الأشخاص' });
    fireEvent.change(within(picker).getByRole('searchbox'), { target: { value: 'خالد' } });
    fireEvent.click(within(picker).getByRole('checkbox', { name: /^خالد/ }));
    fireEvent.click(within(picker).getByRole('button', { name: 'تم' }));
    await waitFor(() =>
      expect(api.patchSource).toHaveBeenCalledWith('ws', ID(4), { addPersonIds: ['K3'] }, undefined),
    );
  });

  it('an orphan row\'s «حذف» deletes that one source after confirming', async () => {
    api.listTreeSources.mockResolvedValue(page({ entries: [orphan()] }));
    api.bulkSources.mockResolvedValue({ deleted: 1 });
    renderManager();
    const row = (await screen.findByText('مصدر 4')).closest('li') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'حذف' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('سيُحذف مصدر واحد مع ملفاته، ولا يمكن التراجع')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'حذف' }));
    await waitFor(() => expect(api.bulkSources).toHaveBeenCalledWith('ws', { ids: [ID(4)], action: 'delete' }, undefined));
  });
});

describe('SourcesManager — selection-only mode (publish flow)', () => {
  it('has no tabs and no people actions', async () => {
    api.listTreeSources.mockResolvedValue(
      page({ entries: [item(1, { people: [{ id: 'M', name: 'محمد' }, { id: 'W1', name: 'فاطمة' }], peopleCount: 2 }), item(4, { people: [], peopleCount: 0 })] }),
    );
    renderManager({ selection: { selected: new Set(), onChange: vi.fn() } });
    await screen.findByText('مصدر 1');
    expect(screen.getByText('محمد وفاطمة')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /مشترك/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /محمد وفاطمة/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'ربط بأشخاص' })).toBeNull();
    expect(lastListParams()).toEqual(expect.objectContaining({ scope: 'pending' }));
  });
});

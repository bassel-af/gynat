import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';

const api = {
  listTreeSources: vi.fn(),
  bulkSources: vi.fn(),
  fetchSourceFileBlob: vi.fn(),
};
vi.mock('@/lib/tree/source-entries-api', () => ({
  listTreeSources: (...a: unknown[]) => api.listTreeSources(...a),
  bulkSources: (...a: unknown[]) => api.bulkSources(...a),
  fetchSourceFileBlob: (...a: unknown[]) => api.fetchSourceFileBlob(...a),
}));
vi.mock('@/hooks/useTreePublishLevel', () => ({ useTreePublishLevel: () => 'private' }));
vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));
const showToast = vi.fn();
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ showToast }) }));
const notifySourcesChanged = vi.fn();
vi.mock('@/hooks/usePersonSources', () => ({ notifySourcesChanged: () => notifySourcesChanged() }));

import { SourcesManager } from '@/components/sources/SourcesManager';

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
    personName: `شخص ${n}`,
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
    ...over,
  };
}

function renderManager(props: Record<string, unknown> = {}) {
  return render(<SourcesManager workspaceId="ws" slug="fam" {...props} />);
}

const lastListParams = () => api.listTreeSources.mock.calls[api.listTreeSources.mock.calls.length - 1][1];

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset());
  showToast.mockReset();
  notifySourcesChanged.mockReset();
  api.listTreeSources.mockResolvedValue(page());
  api.bulkSources.mockResolvedValue({ updated: 3 });
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

  it('links a person to the tree canvas focused on them, keeping treeId', async () => {
    renderManager({ treeId: 'T1' });
    const link = await screen.findByRole('link', { name: 'شخص 1' });
    expect(link).toHaveAttribute('href', '/workspaces/fam/tree?treeId=T1&focus=P1');
  });

  it('links a person without treeId on the main tree', async () => {
    renderManager();
    const link = await screen.findByRole('link', { name: 'شخص 2' });
    expect(link).toHaveAttribute('href', '/workspaces/fam/tree?focus=P2');
  });

  it('shows the tree-wide entry row without a person link', async () => {
    api.listTreeSources.mockResolvedValue(
      page({ entries: [item(9, { individualId: null, personName: null })], total: 1, nextCursor: null, matchedIds: [ID(9)] }),
    );
    renderManager();
    expect(await screen.findByText('مصدر 9')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
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
    fireEvent.click(screen.getByRole('checkbox', { name: 'تحديد شخص 2' }));
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

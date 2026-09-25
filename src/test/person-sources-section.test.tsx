import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const api = {
  deleteSourceEntry: vi.fn(),
  fetchSourceFileBlob: vi.fn(),
  patchSource: vi.fn(),
  fetchSourcePreview: vi.fn(),
};
const { LastLinkError } = vi.hoisted(() => ({ LastLinkError: class LastLinkError extends Error {} }));
vi.mock('@/lib/tree/source-entries-api', () => ({
  deleteSourceEntry: (...a: unknown[]) => api.deleteSourceEntry(...a),
  fetchSourceFileBlob: (...a: unknown[]) => api.fetchSourceFileBlob(...a),
  patchSource: (...a: unknown[]) => api.patchSource(...a),
  fetchSourcePreview: (...a: unknown[]) => api.fetchSourcePreview(...a),
  LastLinkError,
}));
vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));
const mockNotify = vi.fn();
vi.mock('@/hooks/usePersonSources', () => ({ notifySourcesChanged: () => mockNotify() }));
// The form has its own tests; here it only has to open.
vi.mock('@/components/sources/SourceEntryForm', () => ({
  SourceEntryForm: ({ mode }: { mode: string }) => <div data-testid="source-form">{mode}</div>,
}));

import { PersonSourcesSection } from '@/components/sources/PersonSourcesSection';
import type { PersonSourcesState } from '@/hooks/usePersonSources';

type Entry = PersonSourcesState['entries'][number];

function entry(id: string, over: Partial<Entry> = {}): Entry {
  return { id, individualId: 'P1', text: `نص ${id}`, visibility: 'members', createdAt: '', updatedAt: '', files: [], people: [], sharedCount: 0, ...over };
}

function sources(over: Partial<PersonSourcesState> = {}): PersonSourcesState {
  return { entries: [], inherited: null, familyHints: [], loaded: true, error: false, refetch: vi.fn().mockResolvedValue(undefined), ...over };
}

const others = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `O${i}`, name: `شخص ${i}` }));
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'خيارات المصدر' }));

function renderSection(props: Partial<React.ComponentProps<typeof PersonSourcesSection>> = {}) {
  const onPushUndo = vi.fn();
  const utils = render(
    <PersonSourcesSection
      workspaceId="ws"
      individualId="P1"
      personName="أحمد"
      personSex="M"
      canEdit={false}
      isAdmin={false}
      sources={sources()}
      onPushUndo={onPushUndo}
      {...props}
    />,
  );
  return { ...utils, onPushUndo };
}

beforeEach(() => {
  mockNotify.mockReset();
  api.patchSource.mockReset().mockResolvedValue({ ...entry('a'), peopleCount: 1 });
  api.fetchSourcePreview.mockReset().mockResolvedValue({ ...entry('a'), people: [], peopleCount: 0 });
  api.deleteSourceEntry.mockReset().mockResolvedValue({ deleted: true });
  api.fetchSourceFileBlob.mockReset().mockResolvedValue(new Blob(['x']));
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
});

describe('PersonSourcesSection — who sees what', () => {
  it('hides the whole section from a viewer when nothing is visible', () => {
    const { container } = renderSection();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing until the first answer arrives', () => {
    const { container } = renderSection({ canEdit: true, sources: sources({ loaded: false }) });
    expect(container).toBeEmptyDOMElement();
  });

  it('shows an editor a quiet empty line and the add button', () => {
    renderSection({ canEdit: true });
    expect(screen.getByText('لا مصدر لهذا الشخص')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إضافة مصدر' })).toBeInTheDocument();
  });

  it('shows a viewer the entries with a count, without add / edit / delete', () => {
    renderSection({ sources: sources({ entries: [entry('a'), entry('b')] }) });
    expect(screen.getByRole('button', { name: /المصادر \(٢\)/ })).toBeInTheDocument();
    expect(screen.getByText('نص a')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'إضافة مصدر' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'خيارات المصدر' })).toBeNull();
  });

  it('shows the inherited tree-wide entry to a viewer, muted and not editable', () => {
    renderSection({ canEdit: true, sources: sources({ inherited: entry('t', { individualId: null, text: 'كتاب العائلة' }) }) });
    expect(screen.getByText('كتاب العائلة')).toBeInTheDocument();
    expect(screen.getByText('— من مصدر الشجرة')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'خيارات المصدر' })).toBeNull();
    expect(screen.queryByText('لا مصدر لهذا الشخص')).toBeNull();
  });

  it('puts the lock badge only on «المشرفون فقط» rows', () => {
    renderSection({
      isAdmin: true,
      sources: sources({ entries: [entry('a', { visibility: 'admins' }), entry('b', { visibility: 'public' })] }),
    });
    expect(screen.getAllByText('للمشرفين')).toHaveLength(1);
  });

  it('keeps multi-line text', () => {
    renderSection({ sources: sources({ entries: [entry('a', { text: 'سطر١\nسطر٢' })] }) });
    expect(screen.getByText((_, el) => el?.textContent === 'سطر١\nسطر٢' && el.tagName === 'P')).toBeInTheDocument();
  });

  it('can be collapsed', () => {
    renderSection({ sources: sources({ entries: [entry('a')] }) });
    fireEvent.click(screen.getByRole('button', { name: /المصادر/ }));
    expect(screen.queryByText('نص a')).toBeNull();
  });
});

describe('PersonSourcesSection — editing', () => {
  it('opens the add form', () => {
    renderSection({ canEdit: true });
    fireEvent.click(screen.getByRole('button', { name: 'إضافة مصدر' }));
    expect(screen.getByTestId('source-form')).toHaveTextContent('create');
  });

  it('opens the edit form from the row menu', () => {
    renderSection({ canEdit: true, sources: sources({ entries: [entry('a')] }) });
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'تعديل' }));
    expect(screen.getByTestId('source-form')).toHaveTextContent('edit');
  });

  it('a one-person source: the menu reads «حذف المصدر»; confirming deletes, pushes an undo and refetches', async () => {
    const { onPushUndo } = renderSection({ canEdit: true, sources: sources({ entries: [entry('a')] }), treeId: 'T' });
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'حذف المصدر' }));
    expect(api.deleteSourceEntry).not.toHaveBeenCalled();
    expect(screen.getByText('حذف هذا المصدر؟')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'نعم، احذف' }));
    await waitFor(() => expect(api.deleteSourceEntry).toHaveBeenCalledWith('ws', 'a', 'T'));
    await waitFor(() => expect(mockNotify).toHaveBeenCalled());
    expect(onPushUndo).toHaveBeenCalledTimes(1);
  });

  it('says a delete with files cannot be undone, and pushes no undo', async () => {
    const files = [{ id: 'f', mimeType: 'application/pdf' as const, sizeBytes: 1, fileName: 'd.pdf' }];
    const { onPushUndo } = renderSection({ canEdit: true, sources: sources({ entries: [entry('a', { files })] }) });
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'حذف المصدر' }));
    expect(screen.getByText('يُحذف المصدر وملفاته، ولا يمكن التراجع عن ذلك.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'نعم، احذف' }));
    await waitFor(() => expect(api.deleteSourceEntry).toHaveBeenCalled());
    expect(onPushUndo).not.toHaveBeenCalled();
  });
});

describe('PersonSourcesSection — shared sources', () => {
  it.each([
    [0, null],
    [1, 'مشترك مع شخص آخر'],
    [2, 'مشترك مع شخصين آخرين'],
    [9, 'مشترك مع ٩ آخرين'],
  ] as const)('a source shared with %i others is tagged %s', (k, tag) => {
    renderSection({ sources: sources({ entries: [entry('a', { people: others(Math.min(k, 3)), sharedCount: k })] }) });
    if (tag) expect(screen.getByText(tag)).toBeInTheDocument();
    else expect(screen.queryByText(/مشترك مع/)).toBeNull();
  });

  it('the menu offers edit, removing it from this person only, and deleting it from everyone', () => {
    renderSection({ canEdit: true, sources: sources({ entries: [entry('a', { people: others(3), sharedCount: 9 })] }) });
    openMenu();
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      'تعديل',
      'إزالته عن أحمد فقط',
      'حذف المصدر من الجميع (١٠)',
    ]);
  });

  it('«إزالته عن … فقط» removes only this person and pushes «إزالة مصدر عن …»', async () => {
    const { onPushUndo } = renderSection({
      canEdit: true, treeId: 'T', sources: sources({ entries: [entry('a', { people: others(2), sharedCount: 2 })] }),
    });
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'إزالته عن أحمد فقط' }));
    await waitFor(() => expect(api.patchSource).toHaveBeenCalledWith('ws', 'a', { removePersonIds: ['P1'] }, 'T'));
    await waitFor(() => expect(onPushUndo).toHaveBeenCalledTimes(1));
    expect(onPushUndo.mock.calls[0][0].label).toBe('إزالة مصدر عن أحمد');
    expect(mockNotify).toHaveBeenCalled();
  });

  it('removing the last person asks first; «إبقاؤه في صفحة المصادر» keeps it linked to nobody', async () => {
    api.patchSource.mockRejectedValueOnce(new LastLinkError()).mockResolvedValueOnce({ ...entry('a'), people: [], peopleCount: 0 });
    const { onPushUndo } = renderSection({ canEdit: true, sources: sources({ entries: [entry('a')] }) });
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'إزالته عن أحمد فقط' }));
    fireEvent.click(await screen.findByRole('button', { name: 'إبقاؤه في صفحة المصادر' }));
    await waitFor(() =>
      expect(api.patchSource).toHaveBeenLastCalledWith('ws', 'a', { removePersonIds: ['P1'], onLastLink: 'keep' }, undefined),
    );
    await waitFor(() => expect(onPushUndo).toHaveBeenCalledTimes(1));
  });

  it('deleting from everyone names how many people lose it, and the undo brings it back for all of them', async () => {
    api.fetchSourcePreview.mockResolvedValue({ ...entry('a'), people: [{ id: 'P1', name: 'أحمد' }, ...others(24)], peopleCount: 25 });
    const { onPushUndo } = renderSection({
      canEdit: true, isAdmin: true, sources: sources({ entries: [entry('a', { people: others(20), sharedCount: 24 })] }),
    });
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'حذف المصدر من الجميع (٢٥)' }));
    expect(screen.getByText('سيُحذف المصدر وملفاته من ٢٥ شخصًا.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'نعم، احذف' }));
    await waitFor(() => expect(onPushUndo).toHaveBeenCalledTimes(1));
    // The names were capped at 20: every id is read before the delete.
    expect(api.fetchSourcePreview.mock.invocationCallOrder[0]).toBeLessThan(api.deleteSourceEntry.mock.invocationCallOrder[0]);
    const { apiFetch } = await import('@/lib/api/client');
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue(new Response(JSON.stringify({ data: { id: 'S2' } })));
    await onPushUndo.mock.calls[0][0].undo();
    const body = JSON.parse(((apiFetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as { body: string }).body);
    expect(body.personIds).toHaveLength(25);
    expect(body.personIds[0]).toBe('P1');
  });

  it('a viewer never gets the menu', () => {
    renderSection({ sources: sources({ entries: [entry('a', { people: others(2), sharedCount: 2 })] }) });
    expect(screen.queryByRole('button', { name: 'خيارات المصدر' })).toBeNull();
  });
});

describe('PersonSourcesSection — «مصادر أسرته»', () => {
  const hint = { id: 'S-D', text: 'دفتر العائلة', visibility: 'members' as const, fileCount: 3, peopleCount: 10, firstPersonName: null };

  it('offers the household\'s sources to an editor of a person with none', () => {
    renderSection({ canEdit: true, sources: sources({ familyHints: [hint] }) });
    expect(screen.getByText('مصادر أسرته:')).toBeInTheDocument();
    expect(screen.getByText('دفتر العائلة · مصدر لـ ١٠ أشخاص')).toBeInTheDocument();
  });

  it('reads «مصادر أسرتها» for a woman', () => {
    renderSection({ canEdit: true, personSex: 'F', sources: sources({ familyHints: [hint] }) });
    expect(screen.getByText('مصادر أسرتها:')).toBeInTheDocument();
  });

  it('«إضافة» links the source to this person at once, with an undo', async () => {
    const { onPushUndo } = renderSection({ canEdit: true, treeId: 'T', sources: sources({ familyHints: [hint] }) });
    fireEvent.click(screen.getByRole('button', { name: 'إضافة' }));
    await waitFor(() => expect(api.patchSource).toHaveBeenCalledWith('ws', 'S-D', { addPersonIds: ['P1'] }, 'T'));
    await waitFor(() => expect(onPushUndo).toHaveBeenCalledTimes(1));
    expect(mockNotify).toHaveBeenCalled();
  });

  it('«عرض» opens the read-only preview', async () => {
    renderSection({ canEdit: true, sources: sources({ familyHints: [hint] }) });
    fireEvent.click(screen.getByRole('button', { name: /^عرض/ }));
    expect(await screen.findByText('معاينة المصدر')).toBeInTheDocument();
  });

  it('a viewer gets no hints', () => {
    const { container } = renderSection({ sources: sources({ familyHints: [hint] }) });
    expect(container).toBeEmptyDOMElement();
  });
});

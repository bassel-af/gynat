import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const api = {
  deleteSourceEntry: vi.fn(),
  fetchSourceFileBlob: vi.fn(),
};
vi.mock('@/lib/tree/source-entries-api', () => ({
  deleteSourceEntry: (...a: unknown[]) => api.deleteSourceEntry(...a),
  fetchSourceFileBlob: (...a: unknown[]) => api.fetchSourceFileBlob(...a),
}));
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
  return { id, individualId: 'P1', text: `نص ${id}`, visibility: 'members', createdAt: '', updatedAt: '', files: [], ...over };
}

function sources(over: Partial<PersonSourcesState> = {}): PersonSourcesState {
  return { entries: [], inherited: null, loaded: true, error: false, refetch: vi.fn().mockResolvedValue(undefined), ...over };
}

function renderSection(props: Partial<React.ComponentProps<typeof PersonSourcesSection>> = {}) {
  const onPushUndo = vi.fn();
  const utils = render(
    <PersonSourcesSection
      workspaceId="ws"
      individualId="P1"
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
  api.deleteSourceEntry.mockReset().mockResolvedValue(undefined);
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
    expect(screen.queryByRole('button', { name: 'تعديل المصدر' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'حذف المصدر' })).toBeNull();
  });

  it('shows the inherited tree-wide entry to a viewer, muted and not editable', () => {
    renderSection({ canEdit: true, sources: sources({ inherited: entry('t', { individualId: null, text: 'كتاب العائلة' }) }) });
    expect(screen.getByText('كتاب العائلة')).toBeInTheDocument();
    expect(screen.getByText('— من مصدر الشجرة')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تعديل المصدر' })).toBeNull();
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

  it('opens the edit form from a row', () => {
    renderSection({ canEdit: true, sources: sources({ entries: [entry('a')] }) });
    fireEvent.click(screen.getByRole('button', { name: 'تعديل المصدر' }));
    expect(screen.getByTestId('source-form')).toHaveTextContent('edit');
  });

  it('deletes a text entry after confirming, pushes an undo and refetches', async () => {
    const s = sources({ entries: [entry('a')] });
    const { onPushUndo } = renderSection({ canEdit: true, sources: s, treeId: 'T' });
    fireEvent.click(screen.getByRole('button', { name: 'حذف المصدر' }));
    expect(api.deleteSourceEntry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'نعم، احذف' }));
    await waitFor(() => expect(api.deleteSourceEntry).toHaveBeenCalledWith('ws', 'a', 'T'));
    await waitFor(() => expect(mockNotify).toHaveBeenCalled());
    expect(onPushUndo).toHaveBeenCalledTimes(1);
  });

  it('says a delete with files cannot be undone, and pushes no undo', async () => {
    const files = [{ id: 'f', mimeType: 'application/pdf' as const, sizeBytes: 1, fileName: 'd.pdf' }];
    const { onPushUndo } = renderSection({ canEdit: true, sources: sources({ entries: [entry('a', { files })] }) });
    fireEvent.click(screen.getByRole('button', { name: 'حذف المصدر' }));
    expect(screen.getByText('يُحذف المصدر وملفاته، ولا يمكن التراجع عن ذلك.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'نعم، احذف' }));
    await waitFor(() => expect(api.deleteSourceEntry).toHaveBeenCalled());
    expect(onPushUndo).not.toHaveBeenCalled();
  });
});

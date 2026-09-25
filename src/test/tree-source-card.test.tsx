import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const api = vi.hoisted(() => ({
  fetchTreeEntry: vi.fn(),
  putTreeEntry: vi.fn(),
  deleteTreeEntry: vi.fn(),
  createSourceEntry: vi.fn(),
  updateSourceEntry: vi.fn(),
  uploadSourceFile: vi.fn(),
  deleteSourceFile: vi.fn(),
  fetchSourceSuggestions: vi.fn(),
  fetchSourceFileBlob: vi.fn(),
}));
vi.mock('@/lib/tree/source-entries-api', () =>
  Object.fromEntries(Object.keys(api).map((k) => [k, (...a: unknown[]) => api[k as keyof typeof api](...a)])),
);
vi.mock('@/hooks/useTreePublishLevel', () => ({ useTreePublishLevel: () => 'private' }));
vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));
const showToast = vi.fn();
vi.mock('@/context/ToastContext', () => ({ useToast: () => ({ showToast }) }));
const notifySourcesChanged = vi.fn();
vi.mock('@/hooks/usePersonSources', () => ({ notifySourcesChanged: () => notifySourcesChanged() }));

import { TreeSourceCard } from '@/components/sources/TreeSourceCard';

function entry(over: Record<string, unknown> = {}) {
  return {
    id: 'TE',
    individualId: null,
    text: 'سجلات العائلة',
    visibility: 'members',
    createdAt: '',
    updatedAt: '',
    files: [],
    ...over,
  };
}

const textbox = () => screen.getByLabelText('المصدر') as HTMLTextAreaElement;

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset());
  api.fetchSourceSuggestions.mockResolvedValue([]);
  showToast.mockReset();
  notifySourcesChanged.mockReset();
});

describe('TreeSourceCard', () => {
  it('shows the empty state with the add action and hint', async () => {
    api.fetchTreeEntry.mockResolvedValue(null);
    render(<TreeSourceCard workspaceId="ws" treeId="T1" />);
    expect(await screen.findByRole('button', { name: 'إضافة مصدر للشجرة' })).toBeInTheDocument();
    expect(screen.getByText('يظهر عند كل شخص ليس له مصدر خاص')).toBeInTheDocument();
    expect(api.fetchTreeEntry).toHaveBeenCalledWith('ws', 'T1');
  });

  it('adds a tree-wide entry through PUT tree-entry', async () => {
    api.fetchTreeEntry.mockResolvedValue(null);
    api.putTreeEntry.mockResolvedValue(entry({ visibility: 'admins', text: 'كتاب الأنساب' }));
    render(<TreeSourceCard workspaceId="ws" treeId="T1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'إضافة مصدر للشجرة' }));
    fireEvent.change(textbox(), { target: { value: ' كتاب الأنساب ' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ' }));
    await waitFor(() =>
      expect(api.putTreeEntry).toHaveBeenCalledWith('ws', { text: 'كتاب الأنساب', visibility: 'admins' }, 'T1'),
    );
    expect(api.createSourceEntry).not.toHaveBeenCalled();
    expect(await screen.findByText('كتاب الأنساب')).toBeInTheDocument();
    expect(notifySourcesChanged).toHaveBeenCalled();
  });

  it('shows the existing entry with its level', async () => {
    api.fetchTreeEntry.mockResolvedValue(entry());
    render(<TreeSourceCard workspaceId="ws" />);
    expect(await screen.findByText('سجلات العائلة')).toBeInTheDocument();
    expect(screen.getByText('أعضاء مساحة العائلة')).toBeInTheDocument();
  });

  it('edits the entry through PUT tree-entry, prefilled', async () => {
    api.fetchTreeEntry.mockResolvedValue(entry());
    api.putTreeEntry.mockResolvedValue(entry({ text: 'سجلات مصححة' }));
    render(<TreeSourceCard workspaceId="ws" />);
    fireEvent.click(await screen.findByRole('button', { name: 'تعديل' }));
    expect(textbox().value).toBe('سجلات العائلة');
    fireEvent.change(textbox(), { target: { value: 'سجلات مصححة' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ' }));
    await waitFor(() =>
      expect(api.putTreeEntry).toHaveBeenCalledWith('ws', { text: 'سجلات مصححة', visibility: 'members' }, undefined),
    );
    expect(api.updateSourceEntry).not.toHaveBeenCalled();
  });

  it('removes the entry only after confirmation', async () => {
    api.fetchTreeEntry.mockResolvedValue(entry());
    api.deleteTreeEntry.mockResolvedValue(undefined);
    render(<TreeSourceCard workspaceId="ws" treeId="T1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'إزالة' }));
    expect(api.deleteTreeEntry).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'إزالة' }));
    await waitFor(() => expect(api.deleteTreeEntry).toHaveBeenCalledWith('ws', 'T1'));
    expect(await screen.findByRole('button', { name: 'إضافة مصدر للشجرة' })).toBeInTheDocument();
    expect(notifySourcesChanged).toHaveBeenCalled();
  });
});

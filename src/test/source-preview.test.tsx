/**
 * Sources («المصادر») — `SourcePreview` («معاينة المصدر»): a read-only look
 * at an existing source before linking it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const api = { fetchSourcePreview: vi.fn(), fetchSourceFileBlob: vi.fn() };
vi.mock('@/lib/tree/source-entries-api', () => ({
  fetchSourcePreview: (...a: unknown[]) => api.fetchSourcePreview(...a),
  fetchSourceFileBlob: (...a: unknown[]) => api.fetchSourceFileBlob(...a),
}));
vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

import { SourcePreview } from '@/components/sources/SourcePreview';

function source(over: Record<string, unknown> = {}) {
  return {
    id: 'S1',
    individualId: 'P1',
    text: 'دفتر العائلة — السجل المدني بحمص',
    visibility: 'members',
    createdAt: '',
    updatedAt: '',
    files: [
      { id: 'F1', fileName: 'a.png', mimeType: 'image/png', sizeBytes: 3 },
      { id: 'F2', fileName: 'b.pdf', mimeType: 'application/pdf', sizeBytes: 3 },
    ],
    people: [
      { id: 'P1', name: 'محمد' },
      { id: 'P2', name: 'فاطمة' },
      { id: 'P3', name: 'أحمد' },
      { id: 'P4', name: 'سعاد' },
    ],
    peopleCount: 10,
    ...over,
  };
}

beforeEach(() => {
  api.fetchSourcePreview.mockReset();
  api.fetchSourceFileBlob.mockReset().mockResolvedValue(new Blob(['x']));
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
});

function renderPreview(props: Partial<React.ComponentProps<typeof SourcePreview>> = {}) {
  const onLink = vi.fn();
  const onBack = vi.fn();
  render(<SourcePreview workspaceId="ws" treeId="T" sourceId="S1" onLink={onLink} onBack={onBack} {...props} />);
  return { onLink, onBack };
}

describe('SourcePreview', () => {
  it('loads the source of this tree and shows its text, level and people', async () => {
    api.fetchSourcePreview.mockResolvedValue(source());
    renderPreview();
    expect(await screen.findByText('دفتر العائلة — السجل المدني بحمص')).toBeInTheDocument();
    expect(api.fetchSourcePreview).toHaveBeenCalledWith('ws', 'S1', 'T');
    expect(screen.getByText('للقراءة فقط')).toBeInTheDocument();
    expect(screen.getByText('من يرى هذا المصدر: أعضاء مساحة العائلة')).toBeInTheDocument();
    expect(screen.getByText('محمد، فاطمة و٨ آخرون')).toBeInTheDocument();
  });

  it('opens a thumbnail in the full-screen viewer', async () => {
    api.fetchSourcePreview.mockResolvedValue(source());
    renderPreview();
    expect(await screen.findByText('اضغط على أي صورة لفتحها في العارض بملء الشاشة.')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('a.png'));
    expect(await screen.findByRole('dialog', { name: /a.png|عارض/ })).toBeInTheDocument();
  });

  it('a text-only source shows the text only', async () => {
    api.fetchSourcePreview.mockResolvedValue(source({ files: [], text: 'دفتر خدمة العسكرية' }));
    renderPreview();
    expect(await screen.findByText('دفتر خدمة العسكرية')).toBeInTheDocument();
    expect(screen.queryByText(/من يرى هذا المصدر/)).toBeNull();
    expect(screen.queryByText(/مصدر لـ/)).toBeNull();
  });

  it('[ربطه بهذا الشخص] hands the source back; [رجوع] closes', async () => {
    const s = source();
    api.fetchSourcePreview.mockResolvedValue(s);
    const { onLink, onBack } = renderPreview();
    fireEvent.click(await screen.findByRole('button', { name: 'ربطه بهذا الشخص' }));
    expect(onLink).toHaveBeenCalledWith(s);
    fireEvent.click(screen.getByRole('button', { name: 'رجوع' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('without `onLink` there is only [رجوع]', async () => {
    api.fetchSourcePreview.mockResolvedValue(source());
    renderPreview({ onLink: undefined });
    await screen.findByText('دفتر العائلة — السجل المدني بحمص');
    expect(screen.queryByRole('button', { name: 'ربطه بهذا الشخص' })).toBeNull();
  });

  it('says so when the source cannot be loaded', async () => {
    api.fetchSourcePreview.mockRejectedValue(new Error('404'));
    renderPreview();
    expect(await screen.findByRole('alert')).toHaveTextContent('تعذّر فتح المصدر');
  });
});

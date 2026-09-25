import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';

const mockFetchPersonSources = vi.fn();
vi.mock('@/lib/tree/source-entries-api', () => ({
  fetchPersonSources: (...a: unknown[]) => mockFetchPersonSources(...a),
  fetchSourceFileBlob: vi.fn().mockResolvedValue(new Blob(['x'])),
}));

import { PersonSourcesCard } from '@/components/sources/PersonSourcesCard';

function entry(id: string, text: string | null, over: Record<string, unknown> = {}) {
  return { id, individualId: 'P1', text, visibility: 'members', createdAt: '', updatedAt: '', files: [], ...over };
}

beforeEach(() => {
  mockFetchPersonSources.mockReset();
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
});

describe('PersonSourcesCard (member person page)', () => {
  it('numbers the entries as footnotes and lists the inherited entry last', async () => {
    mockFetchPersonSources.mockResolvedValue({
      entries: [entry('a', 'طبقات ابن سعد'), entry('b', 'سجل مدني')],
      inherited: entry('t', 'كتاب العائلة', { individualId: null }),
    });
    render(<PersonSourcesCard workspaceId="ws" treeId="T" individualId="P1" />);
    const list = await screen.findByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('١');
    expect(items[0]).toHaveTextContent('طبقات ابن سعد');
    expect(items[1]).toHaveTextContent('٢');
    expect(items[2]).toHaveTextContent('كتاب العائلة');
    expect(items[2]).toHaveTextContent('من مصدر الشجرة');
    expect(mockFetchPersonSources).toHaveBeenCalledWith('ws', 'P1', 'T');
  });

  it('is read-only', async () => {
    mockFetchPersonSources.mockResolvedValue({ entries: [entry('a', 'نص')], inherited: null });
    render(<PersonSourcesCard workspaceId="ws" individualId="P1" />);
    await screen.findByText('نص');
    expect(screen.queryByRole('button', { name: /إضافة|تعديل|حذف/ })).toBeNull();
  });

  it('renders nothing when the viewer has nothing to see', async () => {
    mockFetchPersonSources.mockResolvedValue({ entries: [], inherited: null });
    const { container } = render(<PersonSourcesCard workspaceId="ws" individualId="P1" />);
    await waitFor(() => expect(mockFetchPersonSources).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

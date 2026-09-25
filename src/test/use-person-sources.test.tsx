import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const mockFetchPersonSources = vi.fn();
vi.mock('@/lib/tree/source-entries-api', () => ({
  fetchPersonSources: (...a: unknown[]) => mockFetchPersonSources(...a),
}));

import { usePersonSources, notifySourcesChanged } from '@/hooks/usePersonSources';

function entry(id: string) {
  return { id, individualId: 'p1', text: `t-${id}`, visibility: 'members', createdAt: '', updatedAt: '', files: [] };
}

beforeEach(() => {
  mockFetchPersonSources.mockReset();
});

describe('usePersonSources', () => {
  it('loads the person sources for the tree', async () => {
    mockFetchPersonSources.mockResolvedValue({ entries: [entry('e1')], inherited: null });
    const { result } = renderHook(() => usePersonSources('ws', 'tree-x', 'p1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(mockFetchPersonSources).toHaveBeenCalledWith('ws', 'p1', 'tree-x');
    expect(result.current.entries.map((e) => e.id)).toEqual(['e1']);
    expect(result.current.inherited).toBeNull();
  });

  it('does not fetch while disabled (e.g. a borrowed person)', () => {
    renderHook(() => usePersonSources('ws', undefined, 'p1', { enabled: false }));
    expect(mockFetchPersonSources).not.toHaveBeenCalled();
  });

  it('never shows the previous person entries after switching people', async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    mockFetchPersonSources
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce({ entries: [entry('b1')], inherited: null });
    const { result, rerender } = renderHook(({ id }) => usePersonSources('ws', undefined, id), {
      initialProps: { id: 'pA' },
    });
    rerender({ id: 'pB' });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => resolveFirst({ entries: [entry('a1')], inherited: null }));
    expect(result.current.entries.map((e) => e.id)).toEqual(['b1']);
  });

  it('refetches when sources change elsewhere (e.g. an undo)', async () => {
    mockFetchPersonSources.mockResolvedValue({ entries: [], inherited: null });
    const { result } = renderHook(() => usePersonSources('ws', undefined, 'p1'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(mockFetchPersonSources).toHaveBeenCalledTimes(1);
    mockFetchPersonSources.mockResolvedValue({ entries: [entry('n1')], inherited: null });
    act(() => notifySourcesChanged());
    await waitFor(() => expect(result.current.entries.map((e) => e.id)).toEqual(['n1']));
  });

  it('reports a failed load without entries', async () => {
    mockFetchPersonSources.mockRejectedValue(new Error('sources API error: 500'));
    const { result } = renderHook(() => usePersonSources('ws', undefined, 'p1'));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.entries).toEqual([]);
  });
});

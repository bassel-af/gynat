import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { useEffect } from 'react';
import { UndoStackProvider, useUndoStack } from '@/context/UndoStackContext';
import type { UndoEntry } from '@/lib/undo/types';

function makeEntry(label: string, workspaceId = 'ws-1', undo = vi.fn(), redo = vi.fn()): UndoEntry {
  return { label, workspaceId, undo, redo };
}

function Consumer({ capture }: { capture: (api: ReturnType<typeof useUndoStack>) => void }) {
  const api = useUndoStack();
  useEffect(() => {
    capture(api);
  });
  return null;
}

describe('UndoStackContext', () => {
  it('push exposes canUndo and stores the entry label', () => {
    let api!: ReturnType<typeof useUndoStack>;
    render(
      <UndoStackProvider workspaceId="ws-1">
        <Consumer capture={(a) => { api = a; }} />
      </UndoStackProvider>,
    );
    expect(api.canUndo).toBe(false);
    expect(api.canRedo).toBe(false);
    act(() => {
      api.push(makeEntry('A'));
    });
    expect(api.canUndo).toBe(true);
    expect(api.canRedo).toBe(false);
    expect(api.topUndoLabel).toBe('A');
  });

  it('undo() invokes entry.undo and moves entry to redo', async () => {
    let api!: ReturnType<typeof useUndoStack>;
    render(
      <UndoStackProvider workspaceId="ws-1">
        <Consumer capture={(a) => { api = a; }} />
      </UndoStackProvider>,
    );
    const undoFn = vi.fn().mockResolvedValue(undefined);
    const entry = makeEntry('A', 'ws-1', undoFn);
    act(() => api.push(entry));
    await act(async () => { await api.undo(); });
    expect(undoFn).toHaveBeenCalledOnce();
    expect(api.canUndo).toBe(false);
    expect(api.canRedo).toBe(true);
    expect(api.topRedoLabel).toBe('A');
  });

  it('rejects entries from a different workspaceId on dispatch', async () => {
    let api!: ReturnType<typeof useUndoStack>;
    render(
      <UndoStackProvider workspaceId="ws-1">
        <Consumer capture={(a) => { api = a; }} />
      </UndoStackProvider>,
    );
    const undoFn = vi.fn();
    const entry = makeEntry('alien', 'ws-OTHER', undoFn);
    // Forcibly push cross-workspace (e.g., a stale closure); dispatch must refuse to fire it.
    act(() => api.push(entry));
    await act(async () => { await api.undo(); });
    expect(undoFn).not.toHaveBeenCalled();
    // Stack should be cleared as a safety reaction.
    expect(api.canUndo).toBe(false);
    expect(api.canRedo).toBe(false);
  });

  it('clear() empties both past and future', async () => {
    let api!: ReturnType<typeof useUndoStack>;
    render(
      <UndoStackProvider workspaceId="ws-1">
        <Consumer capture={(a) => { api = a; }} />
      </UndoStackProvider>,
    );
    act(() => {
      api.push(makeEntry('A'));
      api.push(makeEntry('B'));
    });
    await act(async () => { await api.undo(); });
    expect(api.canUndo).toBe(true);
    expect(api.canRedo).toBe(true);
    act(() => api.clear());
    expect(api.canUndo).toBe(false);
    expect(api.canRedo).toBe(false);
  });

  it('isInFlight flips synchronously when undo is called and resets in finally', async () => {
    let api!: ReturnType<typeof useUndoStack>;
    render(
      <UndoStackProvider workspaceId="ws-1">
        <Consumer capture={(a) => { api = a; }} />
      </UndoStackProvider>,
    );
    let resolveUndo!: () => void;
    const entry = makeEntry('A', 'ws-1', () => new Promise<void>((r) => { resolveUndo = r; }));
    act(() => api.push(entry));
    let promise!: Promise<void>;
    act(() => {
      promise = api.undo();
    });
    expect(api.isInFlight).toBe(true);
    await act(async () => {
      resolveUndo();
      await promise;
    });
    expect(api.isInFlight).toBe(false);
  });

  it('workspaceId change remounts provider and clears stack', () => {
    let api!: ReturnType<typeof useUndoStack>;
    const { rerender } = render(
      <UndoStackProvider workspaceId="ws-1" key="ws-1">
        <Consumer capture={(a) => { api = a; }} />
      </UndoStackProvider>,
    );
    act(() => api.push(makeEntry('A')));
    expect(api.canUndo).toBe(true);
    rerender(
      <UndoStackProvider workspaceId="ws-2" key="ws-2">
        <Consumer capture={(a) => { api = a; }} />
      </UndoStackProvider>,
    );
    expect(api.canUndo).toBe(false);
  });
});

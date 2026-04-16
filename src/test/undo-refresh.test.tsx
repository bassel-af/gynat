import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { useEffect } from 'react';
import { UndoStackProvider, useUndoStack } from '@/context/UndoStackContext';
import type { UndoEntry } from '@/lib/undo/types';

function Consumer({ capture }: { capture: (api: ReturnType<typeof useUndoStack>) => void }) {
  const api = useUndoStack();
  useEffect(() => {
    capture(api);
  });
  return null;
}

describe('UndoStackContext — refreshTree integration (regression)', () => {
  it('calls refreshTree exactly once after undo() resolves', async () => {
    const refreshTree = vi.fn().mockResolvedValue(undefined);
    let api!: ReturnType<typeof useUndoStack>;
    render(
      <UndoStackProvider workspaceId="ws-1" refreshTree={refreshTree}>
        <Consumer capture={(a) => { api = a; }} />
      </UndoStackProvider>,
    );
    const undoFn = vi.fn().mockResolvedValue(undefined);
    const entry: UndoEntry = { label: 'A', workspaceId: 'ws-1', undo: undoFn, redo: vi.fn() };
    act(() => { api.push(entry); });
    await act(async () => { await api.undo(); });
    expect(undoFn).toHaveBeenCalledOnce();
    expect(refreshTree).toHaveBeenCalledOnce();
  });

  it('calls refreshTree exactly once after redo() resolves', async () => {
    const refreshTree = vi.fn().mockResolvedValue(undefined);
    let api!: ReturnType<typeof useUndoStack>;
    render(
      <UndoStackProvider workspaceId="ws-1" refreshTree={refreshTree}>
        <Consumer capture={(a) => { api = a; }} />
      </UndoStackProvider>,
    );
    const redoFn = vi.fn().mockResolvedValue(undefined);
    const entry: UndoEntry = { label: 'A', workspaceId: 'ws-1', undo: vi.fn(), redo: redoFn };
    act(() => { api.push(entry); });
    await act(async () => { await api.undo(); });
    // refresh from undo — clear mock so we only count redo's refresh
    refreshTree.mockClear();
    await act(async () => { await api.redo(); });
    expect(redoFn).toHaveBeenCalledOnce();
    expect(refreshTree).toHaveBeenCalledOnce();
  });

  it('does NOT call refreshTree when undo() is called with an empty stack', async () => {
    const refreshTree = vi.fn().mockResolvedValue(undefined);
    let api!: ReturnType<typeof useUndoStack>;
    render(
      <UndoStackProvider workspaceId="ws-1" refreshTree={refreshTree}>
        <Consumer capture={(a) => { api = a; }} />
      </UndoStackProvider>,
    );
    await act(async () => { await api.undo(); });
    expect(refreshTree).not.toHaveBeenCalled();
  });

  it('drops both stacks and surfaces conflict when refreshTree throws', async () => {
    const refreshTree = vi.fn().mockRejectedValue(new Error('500'));
    let api!: ReturnType<typeof useUndoStack>;
    render(
      <UndoStackProvider workspaceId="ws-1" refreshTree={refreshTree}>
        <Consumer capture={(a) => { api = a; }} />
      </UndoStackProvider>,
    );
    const entry: UndoEntry = {
      label: 'A',
      workspaceId: 'ws-1',
      undo: vi.fn().mockResolvedValue(undefined),
      redo: vi.fn().mockResolvedValue(undefined),
    };
    act(() => { api.push(entry); });
    await act(async () => { await api.undo(); });
    expect(refreshTree).toHaveBeenCalledOnce();
    expect(api.conflict).not.toBeNull();
    expect(api.canUndo).toBe(false);
    expect(api.canRedo).toBe(false);
  });

  it('existing tests still see the provider working when refreshTree is omitted (back-compat)', async () => {
    let api!: ReturnType<typeof useUndoStack>;
    render(
      <UndoStackProvider workspaceId="ws-1">
        <Consumer capture={(a) => { api = a; }} />
      </UndoStackProvider>,
    );
    const undoFn = vi.fn().mockResolvedValue(undefined);
    act(() => { api.push({ label: 'A', workspaceId: 'ws-1', undo: undoFn, redo: vi.fn() }); });
    await act(async () => { await api.undo(); });
    expect(undoFn).toHaveBeenCalledOnce();
  });
});

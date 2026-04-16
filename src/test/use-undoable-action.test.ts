import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUndoableAction } from '@/hooks/useUndoableAction';
import type { Inverse } from '@/lib/tree/undo-builders';

interface StackApi {
  push: ReturnType<typeof vi.fn>;
}

describe('useUndoableAction', () => {
  let stack: StackApi;
  let refresh: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    stack = { push: vi.fn() };
    refresh = vi.fn().mockResolvedValue(undefined);
  });

  function makeInverse(): Inverse {
    return { undo: vi.fn().mockResolvedValue(undefined), redo: vi.fn().mockResolvedValue(undefined) };
  }

  it('runs action, awaits refresh, then pushes entry with label + workspaceId', async () => {
    const { result } = renderHook(() =>
      useUndoableAction({
        stackPush: stack.push,
        refreshTree: refresh,
        workspaceId: 'ws-1',
      }),
    );
    const order: string[] = [];
    const action = vi.fn(async () => { order.push('action'); });
    refresh.mockImplementation(async () => { order.push('refresh'); });
    const inverse = makeInverse();
    await act(async () => {
      await result.current.run({
        label: 'تعديل: أحمد',
        action,
        buildInverse: () => inverse,
      });
    });
    expect(action).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
    expect(order).toEqual(['action', 'refresh']);
    expect(stack.push).toHaveBeenCalledOnce();
    const pushed = stack.push.mock.calls[0][0];
    expect(pushed.label).toBe('تعديل: أحمد');
    expect(pushed.workspaceId).toBe('ws-1');
    expect(pushed.undo).toBe(inverse.undo);
    expect(pushed.redo).toBe(inverse.redo);
  });

  it('does NOT push when action rejects', async () => {
    const { result } = renderHook(() =>
      useUndoableAction({
        stackPush: stack.push,
        refreshTree: refresh,
        workspaceId: 'ws-1',
      }),
    );
    const action = vi.fn().mockRejectedValue(new Error('boom'));
    await act(async () => {
      await expect(
        result.current.run({
          label: 'x',
          action,
          buildInverse: () => makeInverse(),
        }),
      ).rejects.toThrow('boom');
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(stack.push).not.toHaveBeenCalled();
  });

  it('does NOT push when refresh rejects', async () => {
    const { result } = renderHook(() =>
      useUndoableAction({
        stackPush: stack.push,
        refreshTree: refresh,
        workspaceId: 'ws-1',
      }),
    );
    refresh.mockRejectedValueOnce(new Error('refresh failed'));
    const action = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      await expect(
        result.current.run({
          label: 'x',
          action,
          buildInverse: () => makeInverse(),
        }),
      ).rejects.toThrow('refresh failed');
    });
    expect(action).toHaveBeenCalledOnce();
    expect(stack.push).not.toHaveBeenCalled();
  });

  it('does NOT push when buildInverse returns null (action type not undoable)', async () => {
    const { result } = renderHook(() =>
      useUndoableAction({
        stackPush: stack.push,
        refreshTree: refresh,
        workspaceId: 'ws-1',
      }),
    );
    const action = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      await result.current.run({
        label: 'x',
        action,
        buildInverse: () => null,
      });
    });
    expect(action).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
    expect(stack.push).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardUndoRedo } from '@/hooks/useKeyboardUndoRedo';

function fireKey(opts: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
  isComposing?: boolean;
  target?: EventTarget;
  defaultPrevented?: boolean;
}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: opts.key,
    ctrlKey: opts.ctrlKey ?? false,
    metaKey: opts.metaKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    repeat: opts.repeat ?? false,
    isComposing: opts.isComposing ?? false,
    bubbles: true,
    cancelable: true,
  });
  // JSDOM Event target is read-only; redefine to supply focus context.
  if (opts.target) {
    Object.defineProperty(event, 'target', { value: opts.target, configurable: true });
  }
  if (opts.defaultPrevented) {
    event.preventDefault();
  }
  document.dispatchEvent(event);
  return event;
}

describe('useKeyboardUndoRedo', () => {
  let onUndo: ReturnType<typeof vi.fn>;
  let onRedo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onUndo = vi.fn();
    onRedo = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fires onUndo on Ctrl+Z', () => {
    renderHook(() => useKeyboardUndoRedo({ onUndo, onRedo, enabled: true }));
    fireKey({ key: 'z', ctrlKey: true });
    expect(onUndo).toHaveBeenCalledOnce();
    expect(onRedo).not.toHaveBeenCalled();
  });

  it('fires onRedo on Ctrl+Shift+Z', () => {
    renderHook(() => useKeyboardUndoRedo({ onUndo, onRedo, enabled: true }));
    fireKey({ key: 'z', ctrlKey: true, shiftKey: true });
    expect(onRedo).toHaveBeenCalledOnce();
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('fires onUndo on Cmd+Z (Mac)', () => {
    renderHook(() => useKeyboardUndoRedo({ onUndo, onRedo, enabled: true }));
    fireKey({ key: 'z', metaKey: true });
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it('fires onRedo on Cmd+Shift+Z (Mac)', () => {
    renderHook(() => useKeyboardUndoRedo({ onUndo, onRedo, enabled: true }));
    fireKey({ key: 'z', metaKey: true, shiftKey: true });
    expect(onRedo).toHaveBeenCalledOnce();
  });

  it('suppresses when target is an INPUT', () => {
    renderHook(() => useKeyboardUndoRedo({ onUndo, onRedo, enabled: true }));
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireKey({ key: 'z', ctrlKey: true, target: input });
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('suppresses when target is a TEXTAREA', () => {
    renderHook(() => useKeyboardUndoRedo({ onUndo, onRedo, enabled: true }));
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    fireKey({ key: 'z', ctrlKey: true, target: ta });
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('suppresses when target is contenteditable', () => {
    renderHook(() => useKeyboardUndoRedo({ onUndo, onRedo, enabled: true }));
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    document.body.appendChild(div);
    fireKey({ key: 'z', ctrlKey: true, target: div });
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('suppresses when event.repeat is true (auto-repeat)', () => {
    renderHook(() => useKeyboardUndoRedo({ onUndo, onRedo, enabled: true }));
    fireKey({ key: 'z', ctrlKey: true, repeat: true });
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('suppresses when event.isComposing is true (IME composition)', () => {
    renderHook(() => useKeyboardUndoRedo({ onUndo, onRedo, enabled: true }));
    fireKey({ key: 'z', ctrlKey: true, isComposing: true });
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('suppresses when event.defaultPrevented is true', () => {
    renderHook(() => useKeyboardUndoRedo({ onUndo, onRedo, enabled: true }));
    fireKey({ key: 'z', ctrlKey: true, defaultPrevented: true });
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('does nothing when enabled is false', () => {
    renderHook(() => useKeyboardUndoRedo({ onUndo, onRedo, enabled: false }));
    fireKey({ key: 'z', ctrlKey: true });
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('ignores unrelated keys', () => {
    renderHook(() => useKeyboardUndoRedo({ onUndo, onRedo, enabled: true }));
    fireKey({ key: 'a', ctrlKey: true });
    fireKey({ key: 'z' });
    expect(onUndo).not.toHaveBeenCalled();
    expect(onRedo).not.toHaveBeenCalled();
  });

  it('calls preventDefault on handled events', () => {
    renderHook(() => useKeyboardUndoRedo({ onUndo, onRedo, enabled: true }));
    const event = fireKey({ key: 'z', ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
  });

  it('cleans up listener on unmount', () => {
    const { unmount } = renderHook(() =>
      useKeyboardUndoRedo({ onUndo, onRedo, enabled: true }),
    );
    unmount();
    fireKey({ key: 'z', ctrlKey: true });
    expect(onUndo).not.toHaveBeenCalled();
  });
});

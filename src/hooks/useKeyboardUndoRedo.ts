'use client';

import { useEffect, useRef } from 'react';

interface UseKeyboardUndoRedoParams {
  onUndo: () => void;
  onRedo: () => void;
  enabled: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
  if ((target as HTMLElement).isContentEditable) return true;
  if (target.closest?.('[contenteditable="true"]')) return true;
  return false;
}

/**
 * Session Undo (Phase 15a) — keyboard listener for Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z.
 *
 * Suppressed when: auto-repeat, IME composition, editable target focus,
 * previously-handled event, or hook disabled.
 *
 * Listens on `document` so iframes stay isolated.
 */
export function useKeyboardUndoRedo({
  onUndo,
  onRedo,
  enabled,
}: UseKeyboardUndoRedoParams): void {
  const onUndoRef = useRef(onUndo);
  const onRedoRef = useRef(onRedo);

  useEffect(() => {
    onUndoRef.current = onUndo;
    onRedoRef.current = onRedo;
  }, [onUndo, onRedo]);

  useEffect(() => {
    if (!enabled) return;

    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.repeat) return;
      if (event.isComposing) return;
      if (isEditableTarget(event.target)) return;

      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;
      if (event.key !== 'z' && event.key !== 'Z') return;

      event.preventDefault();
      if (event.shiftKey) {
        onRedoRef.current();
      } else {
        onUndoRef.current();
      }
    };

    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
    };
  }, [enabled]);
}

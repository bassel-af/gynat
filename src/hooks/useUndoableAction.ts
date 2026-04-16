'use client';

import { useCallback } from 'react';
import type { UndoEntry } from '@/lib/undo/types';
import type { Inverse } from '@/lib/tree/undo-builders';

interface UseUndoableActionParams {
  stackPush: (entry: UndoEntry) => void;
  refreshTree: () => Promise<void>;
  workspaceId: string;
}

interface RunParams {
  label: string;
  action: () => Promise<void>;
  /** Build the inverse. Return null for operations that are not undoable. */
  buildInverse: () => Inverse | null;
}

/**
 * Session Undo (Phase 15a) — wraps a tree mutation so that on success the
 * inverse is pushed onto the undo stack. Push ONLY after `action` and
 * `refreshTree` both succeed; a failure at either step leaves the stack
 * untouched.
 */
export function useUndoableAction({
  stackPush,
  refreshTree,
  workspaceId,
}: UseUndoableActionParams) {
  const run = useCallback(
    async ({ label, action, buildInverse }: RunParams): Promise<void> => {
      await action();
      await refreshTree();
      const inverse = buildInverse();
      if (!inverse) return;
      stackPush({
        label,
        workspaceId,
        undo: inverse.undo,
        redo: inverse.redo,
      });
    },
    [stackPush, refreshTree, workspaceId],
  );

  return { run };
}

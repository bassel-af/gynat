'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  emptyStack,
  pushEntry as pushReducer,
  popUndo as popUndoReducer,
  popRedo as popRedoReducer,
} from '@/lib/undo/stack';
import type { UndoEntry, UndoStackState } from '@/lib/undo/types';

export interface ConflictInfo {
  kind: 'stale' | 'auth';
}

export interface UndoStackApi {
  canUndo: boolean;
  canRedo: boolean;
  topUndoLabel: string | null;
  topRedoLabel: string | null;
  isInFlight: boolean;
  conflict: ConflictInfo | null;
  push: (entry: UndoEntry) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  clear: () => void;
  dismissConflict: () => void;
}

const UndoStackContext = createContext<UndoStackApi | null>(null);

interface UndoStackProviderProps {
  children: ReactNode;
  workspaceId: string;
  /** Phase 15a regression fix: invoked after each successful undo/redo so the
   *  visible tree re-reads fresh server state. Optional — omit in tests that
   *  don't exercise refresh behavior. */
  refreshTree?: () => Promise<void>;
}

const STALE_STATUS_CODES = new Set([401, 403, 404, 409, 410]);

export function UndoStackProvider({ children, workspaceId, refreshTree }: UndoStackProviderProps) {
  const [state, setStateRaw] = useState<UndoStackState>(() => emptyStack());
  const stateRef = useRef<UndoStackState>(state);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const inFlightRef = useRef(false);
  const [isInFlight, setIsInFlight] = useState(false);

  const setState = useCallback((next: UndoStackState) => {
    stateRef.current = next;
    setStateRaw(next);
  }, []);

  const setInFlight = useCallback((v: boolean) => {
    inFlightRef.current = v;
    setIsInFlight(v);
  }, []);

  const push = useCallback((entry: UndoEntry) => {
    setState(pushReducer(stateRef.current, entry));
  }, [setState]);

  const clear = useCallback(() => {
    setState(emptyStack());
  }, [setState]);

  const dismissConflict = useCallback(() => {
    setConflict(null);
  }, []);

  const handleFailure = useCallback((err: unknown) => {
    const message = err instanceof Error ? err.message : '';
    const match = message.match(/\b(\d{3})\b/);
    const code = match ? parseInt(match[1], 10) : 0;
    if (code === 401 || code === 403) {
      setConflict({ kind: 'auth' });
    } else if (STALE_STATUS_CODES.has(code)) {
      setConflict({ kind: 'stale' });
    } else {
      setConflict({ kind: 'stale' });
    }
    setState(emptyStack());
  }, [setState]);

  const undo = useCallback(async () => {
    if (inFlightRef.current) return;
    const { entry, next } = popUndoReducer(stateRef.current);
    if (!entry) return;
    if (entry.workspaceId !== workspaceId) {
      setState(emptyStack());
      return;
    }
    setInFlight(true);
    setState(next);
    try {
      await entry.undo();
      if (refreshTree) await refreshTree();
    } catch (err) {
      handleFailure(err);
    } finally {
      setInFlight(false);
    }
  }, [workspaceId, setInFlight, setState, handleFailure, refreshTree]);

  const redo = useCallback(async () => {
    if (inFlightRef.current) return;
    const { entry, next } = popRedoReducer(stateRef.current);
    if (!entry) return;
    if (entry.workspaceId !== workspaceId) {
      setState(emptyStack());
      return;
    }
    setInFlight(true);
    setState(next);
    try {
      await entry.redo();
      if (refreshTree) await refreshTree();
    } catch (err) {
      handleFailure(err);
    } finally {
      setInFlight(false);
    }
  }, [workspaceId, setInFlight, setState, handleFailure, refreshTree]);

  const api = useMemo<UndoStackApi>(() => ({
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    topUndoLabel: state.past.length > 0 ? state.past[state.past.length - 1].label : null,
    topRedoLabel: state.future.length > 0 ? state.future[state.future.length - 1].label : null,
    isInFlight,
    conflict,
    push,
    undo,
    redo,
    clear,
    dismissConflict,
  }), [state, isInFlight, conflict, push, undo, redo, clear, dismissConflict]);

  return <UndoStackContext.Provider value={api}>{children}</UndoStackContext.Provider>;
}

export function useUndoStack(): UndoStackApi {
  const ctx = useContext(UndoStackContext);
  if (!ctx) {
    throw new Error('useUndoStack must be used within UndoStackProvider');
  }
  return ctx;
}

export function useOptionalUndoStack(): UndoStackApi | null {
  return useContext(UndoStackContext);
}

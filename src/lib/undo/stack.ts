import type { UndoEntry, UndoStackState } from './types';

export type { UndoEntry, UndoStackState } from './types';

export const MAX_STACK_SIZE = 100;

export function emptyStack(): UndoStackState {
  return { past: [], future: [] };
}

export function pushEntry(state: UndoStackState, entry: UndoEntry): UndoStackState {
  const nextPast = [...state.past, entry];
  const trimmed = nextPast.length > MAX_STACK_SIZE
    ? nextPast.slice(nextPast.length - MAX_STACK_SIZE)
    : nextPast;
  return { past: trimmed, future: [] };
}

export function popUndo(state: UndoStackState): { entry: UndoEntry | null; next: UndoStackState } {
  if (state.past.length === 0) {
    return { entry: null, next: state };
  }
  const entry = state.past[state.past.length - 1];
  return {
    entry,
    next: {
      past: state.past.slice(0, -1),
      future: [...state.future, entry],
    },
  };
}

export function popRedo(state: UndoStackState): { entry: UndoEntry | null; next: UndoStackState } {
  if (state.future.length === 0) {
    return { entry: null, next: state };
  }
  const entry = state.future[state.future.length - 1];
  return {
    entry,
    next: {
      past: [...state.past, entry],
      future: state.future.slice(0, -1),
    },
  };
}

export function clearStack(_state: UndoStackState): UndoStackState {
  return emptyStack();
}

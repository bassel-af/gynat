import { describe, it, expect } from 'vitest';
import {
  emptyStack,
  pushEntry,
  popUndo,
  popRedo,
  clearStack,
  MAX_STACK_SIZE,
  type UndoEntry,
  type UndoStackState,
} from '@/lib/undo/stack';

function makeEntry(label: string, workspaceId = 'ws-1'): UndoEntry {
  return {
    label,
    workspaceId,
    undo: async () => {},
    redo: async () => {},
  };
}

describe('undo stack reducer', () => {
  describe('emptyStack()', () => {
    it('returns an empty past and empty future', () => {
      const state = emptyStack();
      expect(state.past).toEqual([]);
      expect(state.future).toEqual([]);
    });
  });

  describe('pushEntry()', () => {
    it('appends the new entry to past', () => {
      const state = pushEntry(emptyStack(), makeEntry('A'));
      expect(state.past.map((e) => e.label)).toEqual(['A']);
    });

    it('clears the future (redo stack) on any new push', () => {
      let state: UndoStackState = pushEntry(emptyStack(), makeEntry('A'));
      state = popUndo(state).next;
      expect(state.future).toHaveLength(1);
      state = pushEntry(state, makeEntry('B'));
      expect(state.future).toEqual([]);
      expect(state.past.map((e) => e.label)).toEqual(['B']);
    });

    it('evicts the oldest entry when past exceeds MAX_STACK_SIZE', () => {
      let state: UndoStackState = emptyStack();
      for (let i = 0; i < MAX_STACK_SIZE + 1; i++) {
        state = pushEntry(state, makeEntry(`E${i}`));
      }
      expect(state.past).toHaveLength(MAX_STACK_SIZE);
      expect(state.past[0].label).toBe('E1');
      expect(state.past[state.past.length - 1].label).toBe(`E${MAX_STACK_SIZE}`);
    });
  });

  describe('popUndo()', () => {
    it('returns the top entry and moves it to future', () => {
      let state: UndoStackState = pushEntry(emptyStack(), makeEntry('A'));
      state = pushEntry(state, makeEntry('B'));
      const { entry, next } = popUndo(state);
      expect(entry?.label).toBe('B');
      expect(next.past.map((e) => e.label)).toEqual(['A']);
      expect(next.future.map((e) => e.label)).toEqual(['B']);
    });

    it('returns null entry when past is empty', () => {
      const { entry, next } = popUndo(emptyStack());
      expect(entry).toBeNull();
      expect(next.past).toEqual([]);
      expect(next.future).toEqual([]);
    });
  });

  describe('popRedo()', () => {
    it('returns the top redo entry and moves it back to past', () => {
      let state: UndoStackState = pushEntry(emptyStack(), makeEntry('A'));
      state = popUndo(state).next;
      const { entry, next } = popRedo(state);
      expect(entry?.label).toBe('A');
      expect(next.past.map((e) => e.label)).toEqual(['A']);
      expect(next.future).toEqual([]);
    });

    it('returns null entry when future is empty', () => {
      const { entry, next } = popRedo(emptyStack());
      expect(entry).toBeNull();
      expect(next.past).toEqual([]);
      expect(next.future).toEqual([]);
    });
  });

  describe('clearStack()', () => {
    it('empties both past and future', () => {
      let state: UndoStackState = pushEntry(emptyStack(), makeEntry('A'));
      state = pushEntry(state, makeEntry('B'));
      state = popUndo(state).next;
      const cleared = clearStack(state);
      expect(cleared.past).toEqual([]);
      expect(cleared.future).toEqual([]);
    });
  });

  describe('invariants', () => {
    it('MAX_STACK_SIZE is 100', () => {
      expect(MAX_STACK_SIZE).toBe(100);
    });

    it('entries carry a workspaceId for cross-workspace guard', () => {
      const entry = makeEntry('A', 'ws-42');
      expect(entry.workspaceId).toBe('ws-42');
    });
  });
});

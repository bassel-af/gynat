import { describe, test, expect } from 'vitest';
import { idsToPublish, shouldAskAboutSources, chunk, DEFAULT_PUBLISH_SOURCES_CHOICE } from '@/lib/tree/publish-sources';

const summary = { pendingIds: ['a', 'b', 'c'], publicCount: 1, treeEntry: null };

describe('publish flow sources helpers', () => {
  test('«لا شيء» publishes no ids', () => {
    expect(idsToPublish(DEFAULT_PUBLISH_SOURCES_CHOICE, summary)).toEqual([]);
  });

  test('«أختار بنفسي» never sends an id outside the pending list', () => {
    const choice = { mode: 'pick' as const, pickedIds: ['b', 'zzz', 'b'], includeTreeEntry: false };
    expect(idsToPublish(choice, summary)).toEqual(['b']);
  });

  test('asks only when something could change for visitors', () => {
    expect(shouldAskAboutSources(null)).toBe(false);
    expect(shouldAskAboutSources({ pendingIds: [], publicCount: 3, treeEntry: null })).toBe(false);
    expect(shouldAskAboutSources({ pendingIds: [], publicCount: 0, treeEntry: { id: 't', visibility: 'public' } })).toBe(false);
    expect(shouldAskAboutSources({ pendingIds: [], publicCount: 0, treeEntry: { id: 't', visibility: 'admins' } })).toBe(true);
    expect(shouldAskAboutSources(summary)).toBe(true);
    // A malformed answer (e.g. an error body) skips the step — nothing changes.
    expect(shouldAskAboutSources({} as never)).toBe(false);
  });

  test('chunks at the bulk limit', () => {
    expect(chunk(Array.from({ length: 1001 }, (_, i) => i)).map((c) => c.length)).toEqual([500, 500, 1]);
  });
});

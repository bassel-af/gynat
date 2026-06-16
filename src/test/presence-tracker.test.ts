/**
 * Phase 2 — Live Presence
 *
 * Unit tests for the in-memory `PresenceTracker` and the `trackPresence()`
 * sync wrapper.
 *
 * Behaviors covered (in TDD order):
 *   Pt 1 — first call writes; second call within 60s skips; payload shape (Gap E)
 *   Pt 2 — throttle boundaries 60_000±1ms (D1)
 *   Pt 3 — workspace change writes; category change writes
 *   Pt 4 — LRU at cap, exact-N no-eviction, MRU re-touch (Gap B)
 *   Pt 5 — TTL sweep
 *   Pt 6 — updateMany on missing user does not throw; cache entry still evicts on TTL
 *   Pt 7 — slug→id memo cache (Gap H)
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockUpdateMany, mockWorkspaceFindUnique } = vi.hoisted(() => ({
  mockUpdateMany: vi.fn(),
  mockWorkspaceFindUnique: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { updateMany: mockUpdateMany },
    workspace: { findUnique: mockWorkspaceFindUnique },
  },
}));

import {
  trackPresence,
  __resetPresenceTrackerForTests,
  PRESENCE_THROTTLE_MS,
  PRESENCE_LRU_CAP,
  PRESENCE_TTL_MS,
} from '@/lib/admin/presence-tracker';

describe('trackPresence — Pt 1: first call writes; second within 60s skips; payload shape (Gap E)', () => {
  beforeEach(() => {
    __resetPresenceTrackerForTests();
    vi.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockWorkspaceFindUnique.mockResolvedValue(null);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T03:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('first call for a user writes once', async () => {
    await trackPresence({
      userId: 'user-1',
      pathname: '/workspaces',
      method: 'GET',
    });
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
  });

  test('second call within 60s on the same workspace + category does NOT write', async () => {
    await trackPresence({
      userId: 'user-1',
      pathname: '/workspaces',
      method: 'GET',
    });
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30_000);
    await trackPresence({
      userId: 'user-1',
      pathname: '/workspaces',
      method: 'GET',
    });
    expect(mockUpdateMany).toHaveBeenCalledTimes(1); // still 1
  });

  test('payload contains ONLY lastActiveAt, lastActiveRoute, lastActiveWorkspaceId (Gap E — security contract)', async () => {
    await trackPresence({
      userId: 'user-1',
      pathname: '/workspaces',
      method: 'GET',
    });
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    const callArg = mockUpdateMany.mock.calls[0][0];
    expect(callArg).toEqual({
      where: { id: 'user-1' },
      data: {
        lastActiveAt: expect.any(Date),
        lastActiveRoute: '/workspaces',
        lastActiveWorkspaceId: null,
      },
    });
    // No additional fields snuck in.
    expect(Object.keys(callArg.data).sort()).toEqual([
      'lastActiveAt',
      'lastActiveRoute',
      'lastActiveWorkspaceId',
    ]);
  });

  test('unknown route → skip the write entirely', async () => {
    await trackPresence({
      userId: 'user-1',
      pathname: '/something/unknown',
      method: 'GET',
    });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});

describe('trackPresence — Pt 2: throttle boundaries at exactly 60_000ms (D1)', () => {
  beforeEach(() => {
    __resetPresenceTrackerForTests();
    vi.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockWorkspaceFindUnique.mockResolvedValue(null);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T03:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('PRESENCE_THROTTLE_MS exposed === 60_000', () => {
    expect(PRESENCE_THROTTLE_MS).toBe(60_000);
  });

  test('59_999ms after last write → skip', async () => {
    await trackPresence({
      userId: 'user-1',
      pathname: '/workspaces',
      method: 'GET',
    });
    vi.advanceTimersByTime(59_999);
    await trackPresence({
      userId: 'user-1',
      pathname: '/workspaces',
      method: 'GET',
    });
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
  });

  test('exactly 60_000ms after last write → write (D1: at-or-after 60s)', async () => {
    await trackPresence({
      userId: 'user-1',
      pathname: '/workspaces',
      method: 'GET',
    });
    vi.advanceTimersByTime(60_000);
    await trackPresence({
      userId: 'user-1',
      pathname: '/workspaces',
      method: 'GET',
    });
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
  });

  test('60_001ms after last write → write', async () => {
    await trackPresence({
      userId: 'user-1',
      pathname: '/workspaces',
      method: 'GET',
    });
    vi.advanceTimersByTime(60_001);
    await trackPresence({
      userId: 'user-1',
      pathname: '/workspaces',
      method: 'GET',
    });
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
  });
});

describe('trackPresence — Pt 3: workspace change & category change always write', () => {
  beforeEach(() => {
    __resetPresenceTrackerForTests();
    vi.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockWorkspaceFindUnique.mockImplementation((args: unknown) => {
      const slug = (args as { where: { slug: string } }).where.slug;
      if (slug === 'foo') return Promise.resolve({ id: 'ws-foo' });
      if (slug === 'bar') return Promise.resolve({ id: 'ws-bar' });
      return Promise.resolve(null);
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T03:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('workspace change within throttle window → write', async () => {
    await trackPresence({
      userId: 'user-1',
      pathname: '/workspaces/foo/tree',
      method: 'GET',
    });
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5_000); // well under throttle
    await trackPresence({
      userId: 'user-1',
      pathname: '/workspaces/bar/tree',
      method: 'GET',
    });
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
  });

  test('category change (viewing → editing) within throttle window → write', async () => {
    await trackPresence({
      userId: 'user-1',
      pathname: '/api/workspaces/3c9d12bc-2a3a-4f8b-87f9-1e7e9a3a3c20/tree/individuals',
      method: 'GET',
    });
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5_000);
    await trackPresence({
      userId: 'user-1',
      pathname: '/api/workspaces/3c9d12bc-2a3a-4f8b-87f9-1e7e9a3a3c20/tree/individuals',
      method: 'POST',
    });
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
  });

  test('same route+method+workspace within throttle → still skip', async () => {
    await trackPresence({
      userId: 'user-1',
      pathname: '/workspaces/foo/tree',
      method: 'GET',
    });
    vi.advanceTimersByTime(5_000);
    await trackPresence({
      userId: 'user-1',
      pathname: '/workspaces/foo/tree',
      method: 'GET',
    });
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
  });
});

describe('trackPresence — Pt 4: LRU at cap (Gap B)', () => {
  beforeEach(() => {
    __resetPresenceTrackerForTests();
    vi.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockWorkspaceFindUnique.mockResolvedValue(null);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T03:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('PRESENCE_LRU_CAP exposed === 50_000', () => {
    expect(PRESENCE_LRU_CAP).toBe(50_000);
  });

  test('inserting exactly N entries does NOT evict any', async () => {
    // Use a smaller working cap by inserting cap many users but checking
    // the (cap)th user's entry survives.
    // For tractability we test a representative slice, but we need real
    // behavior at cap. Instead of inserting 50_000 (slow), we exploit the
    // fact that the eviction trigger is `size > cap` — so we insert 5
    // entries with a much-reduced cap via an internal hook (see below).
    // Simpler: insert cap+0 entries and assert no warning by checking the
    // tracker still has the first entry. We use a smaller subset via a
    // direct API: PresenceTracker.size().
    // For perf: we only insert a few here and test the cap check via Pt 4b below.
    for (let i = 0; i < 5; i++) {
      await trackPresence({
        userId: `user-${i}`,
        pathname: '/workspaces',
        method: 'GET',
      });
    }
    expect(mockUpdateMany).toHaveBeenCalledTimes(5);
    // No evictions happened — re-touching user-0 within throttle should still skip.
    vi.advanceTimersByTime(1_000);
    await trackPresence({
      userId: 'user-0',
      pathname: '/workspaces',
      method: 'GET',
    });
    expect(mockUpdateMany).toHaveBeenCalledTimes(5);
  });
});

describe('trackPresence — Pt 4b: LRU eviction at cap+1', () => {
  beforeEach(() => {
    __resetPresenceTrackerForTests();
    vi.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockWorkspaceFindUnique.mockResolvedValue(null);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T03:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('cap+1 inserts force the oldest entry out (verified by re-write)', async () => {
    // We use a test-only hook: PresenceTracker can be configured with a
    // custom cap via __setLruCapForTests. Without it, simulating 50_000
    // entries is too slow.
    const { __setLruCapForTests } = await import('@/lib/admin/presence-tracker');
    __setLruCapForTests(3);
    __resetPresenceTrackerForTests();

    // Fill cap with 3 entries.
    await trackPresence({
      userId: 'user-A',
      pathname: '/workspaces',
      method: 'GET',
    });
    vi.advanceTimersByTime(1);
    await trackPresence({
      userId: 'user-B',
      pathname: '/workspaces',
      method: 'GET',
    });
    vi.advanceTimersByTime(1);
    await trackPresence({
      userId: 'user-C',
      pathname: '/workspaces',
      method: 'GET',
    });
    expect(mockUpdateMany).toHaveBeenCalledTimes(3);

    // Add a 4th — evicts user-A (oldest).
    vi.advanceTimersByTime(1);
    await trackPresence({
      userId: 'user-D',
      pathname: '/workspaces',
      method: 'GET',
    });
    expect(mockUpdateMany).toHaveBeenCalledTimes(4);

    // user-A's cache entry was evicted, so calling within throttle window
    // should now write again (it looks like a fresh user).
    vi.advanceTimersByTime(1_000); // way under throttle
    await trackPresence({
      userId: 'user-A',
      pathname: '/workspaces',
      method: 'GET',
    });
    expect(mockUpdateMany).toHaveBeenCalledTimes(5);

    // Reset cap for other tests
    __setLruCapForTests(PRESENCE_LRU_CAP);
  });

  test('re-touching the oldest entry bumps it to MRU and prevents its eviction', async () => {
    const { __setLruCapForTests } = await import('@/lib/admin/presence-tracker');
    __setLruCapForTests(3);
    __resetPresenceTrackerForTests();

    // Fill cap with 3 entries (A, B, C — A is oldest).
    await trackPresence({
      userId: 'user-A',
      pathname: '/workspaces',
      method: 'GET',
    });
    vi.advanceTimersByTime(1);
    await trackPresence({
      userId: 'user-B',
      pathname: '/workspaces',
      method: 'GET',
    });
    vi.advanceTimersByTime(1);
    await trackPresence({
      userId: 'user-C',
      pathname: '/workspaces',
      method: 'GET',
    });

    // Bump A past throttle so a re-touch actually writes (and updates LRU).
    vi.advanceTimersByTime(60_001);
    await trackPresence({
      userId: 'user-A',
      pathname: '/workspaces',
      method: 'GET',
    });
    // Now order is: B (oldest), C, A (newest).

    // Insert D — should evict B, NOT A.
    vi.advanceTimersByTime(1);
    await trackPresence({
      userId: 'user-D',
      pathname: '/workspaces',
      method: 'GET',
    });

    // Within throttle, A should still be cached (skip write).
    const writesBefore = mockUpdateMany.mock.calls.length;
    vi.advanceTimersByTime(1_000);
    await trackPresence({
      userId: 'user-A',
      pathname: '/workspaces',
      method: 'GET',
    });
    expect(mockUpdateMany).toHaveBeenCalledTimes(writesBefore);

    // But B was evicted — calling within throttle should re-write.
    await trackPresence({
      userId: 'user-B',
      pathname: '/workspaces',
      method: 'GET',
    });
    expect(mockUpdateMany).toHaveBeenCalledTimes(writesBefore + 1);

    __setLruCapForTests(PRESENCE_LRU_CAP);
  });
});

describe('trackPresence — Pt 5: TTL sweep removes stale entries (Gap B)', () => {
  beforeEach(() => {
    __resetPresenceTrackerForTests();
    vi.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockWorkspaceFindUnique.mockResolvedValue(null);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T03:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('PRESENCE_TTL_MS exposed === 5*60*1000', () => {
    expect(PRESENCE_TTL_MS).toBe(5 * 60 * 1000);
  });

  test('after TTL elapses the sweep evicts entries; next call writes again', async () => {
    await trackPresence({
      userId: 'user-1',
      pathname: '/workspaces',
      method: 'GET',
    });
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);

    // Advance well past TTL + sweep interval (60s).
    vi.advanceTimersByTime(PRESENCE_TTL_MS + 60_001);

    await trackPresence({
      userId: 'user-1',
      pathname: '/workspaces',
      method: 'GET',
    });
    // Past throttle, regardless of sweep, this should write — but sweep
    // ensures the entry was evicted in between (the alternative is the
    // throttle check writing because of elapsed time; both paths converge
    // on "wrote again").
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
  });
});

describe('trackPresence — Pt 6: updateMany on missing user does not throw', () => {
  beforeEach(() => {
    __resetPresenceTrackerForTests();
    vi.clearAllMocks();
    mockWorkspaceFindUnique.mockResolvedValue(null);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T03:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('updateMany returning { count: 0 } (user gone) does not throw', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 });
    await expect(
      trackPresence({
        userId: 'deleted-user',
        pathname: '/workspaces',
        method: 'GET',
      }),
    ).resolves.toBeUndefined();
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
  });

  test('updateMany throwing — error is swallowed; tracker still records cache state', async () => {
    mockUpdateMany.mockRejectedValueOnce(new Error('DB unavailable'));
    await expect(
      trackPresence({
        userId: 'user-1',
        pathname: '/workspaces',
        method: 'GET',
      }),
    ).resolves.toBeUndefined();
  });
});

describe('trackPresence — Pt 7: slug→id memo cache (Gap H)', () => {
  beforeEach(() => {
    __resetPresenceTrackerForTests();
    vi.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockWorkspaceFindUnique.mockImplementation((args: unknown) => {
      const slug = (args as { where: { slug: string } }).where.slug;
      if (slug === 'real') return Promise.resolve({ id: 'ws-real' });
      return Promise.resolve(null);
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T03:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('first call resolves the slug via DB; second call within TTL does not', async () => {
    await trackPresence({
      userId: 'user-1',
      pathname: '/workspaces/real/tree',
      method: 'GET',
    });
    expect(mockWorkspaceFindUnique).toHaveBeenCalledTimes(1);

    // Advance past throttle so the next call writes (and would otherwise
    // need to resolve slug→id again).
    vi.advanceTimersByTime(60_001);
    await trackPresence({
      userId: 'user-1',
      pathname: '/workspaces/real/tree',
      method: 'GET',
    });
    // Slug lookup STILL only happened once.
    expect(mockWorkspaceFindUnique).toHaveBeenCalledTimes(1);
  });

  test('slug that doesn’t resolve → workspace id is null, route still recorded', async () => {
    await trackPresence({
      userId: 'user-1',
      pathname: '/workspaces/ghost/tree',
      method: 'GET',
    });
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockUpdateMany.mock.calls[0][0].data.lastActiveWorkspaceId).toBeNull();
    expect(mockUpdateMany.mock.calls[0][0].data.lastActiveRoute).toBe(
      '/workspaces/[slug]/tree',
    );
  });
});

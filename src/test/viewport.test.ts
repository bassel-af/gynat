import { describe, it, expect, afterEach, vi } from 'vitest';
import { shouldCollapseDrawerOnPersonView, isDrawerViewport } from '@/lib/utils/viewport';

// ---------------------------------------------------------------------------
// The drawer breakpoints are measured with `window.matchMedia` (NOT
// `window.innerWidth`) — innerWidth disagrees with the CSS layout width when a
// desktop browser shows a scrollbar gutter, and that mismatch was the PRIMARY
// source of the intermittent drawer close on a narrow desktop window.
//
// Final contract:
//   - shouldCollapseDrawerOnPersonView() → true ONLY on a TABLET (601–768px).
//       PHONE (≤600) keeps the drawer open; DESKTOP (>768) has no drawer.
//   - isDrawerViewport() → true whenever an overlay drawer exists at all (≤768).
//
// We mock matchMedia with a viewport width and evaluate the standard
// min-width/max-width queries this module uses.
// ---------------------------------------------------------------------------

function mockMatchMedia(width: number) {
  vi.stubGlobal('matchMedia', (query: string) => {
    // Evaluate `(min-width: Npx)` and `(max-width: Npx)` clauses against `width`.
    const matches = query.split(' and ').every((clause) => {
      const min = clause.match(/min-width:\s*(\d+)px/);
      if (min) return width >= Number(min[1]);
      const max = clause.match(/max-width:\s*(\d+)px/);
      if (max) return width <= Number(max[1]);
      return true;
    });
    return { matches } as MediaQueryList;
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shouldCollapseDrawerOnPersonView — phone ≤600 keep open, tablet 601–768 close', () => {
  it('PHONE (≤600px) → false: the drawer stays open', () => {
    mockMatchMedia(320); expect(shouldCollapseDrawerOnPersonView()).toBe(false);
    mockMatchMedia(390); expect(shouldCollapseDrawerOnPersonView()).toBe(false);
    mockMatchMedia(600); expect(shouldCollapseDrawerOnPersonView()).toBe(false);
  });

  it('TABLET (601–768px) → true: the drawer collapses', () => {
    mockMatchMedia(601); expect(shouldCollapseDrawerOnPersonView()).toBe(true);
    mockMatchMedia(700); expect(shouldCollapseDrawerOnPersonView()).toBe(true);
    mockMatchMedia(768); expect(shouldCollapseDrawerOnPersonView()).toBe(true);
  });

  it('DESKTOP (>768px) → false: there is no overlay drawer', () => {
    mockMatchMedia(769); expect(shouldCollapseDrawerOnPersonView()).toBe(false);
    mockMatchMedia(1280); expect(shouldCollapseDrawerOnPersonView()).toBe(false);
  });
});

describe('isDrawerViewport — true wherever an overlay drawer exists (≤768)', () => {
  it('PHONE + TABLET (≤768px) → true', () => {
    mockMatchMedia(320); expect(isDrawerViewport()).toBe(true);
    mockMatchMedia(600); expect(isDrawerViewport()).toBe(true);
    mockMatchMedia(768); expect(isDrawerViewport()).toBe(true);
  });

  it('DESKTOP (>768px) → false', () => {
    mockMatchMedia(769); expect(isDrawerViewport()).toBe(false);
    mockMatchMedia(1280); expect(isDrawerViewport()).toBe(false);
  });
});

describe('SSR safety (no window.matchMedia)', () => {
  it('both predicates return false when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(shouldCollapseDrawerOnPersonView()).toBe(false);
    expect(isDrawerViewport()).toBe(false);
  });
});

describe('THE intermittent bug — decision follows matchMedia, NOT innerWidth', () => {
  // The exact regression: on a narrow desktop window the scrollbar gutter makes
  // innerWidth a few px WIDER than the CSS layout width matchMedia evaluates. The
  // old `innerWidth <= 768`-style checks flipped on that gap; the matchMedia
  // predicates must not. We set a CONFLICTING innerWidth and prove it's ignored.
  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true, writable: true });
  });

  it('media says PHONE (600) but innerWidth would say TABLET (615) → stays open (false)', () => {
    mockMatchMedia(600);
    Object.defineProperty(window, 'innerWidth', { value: 615, configurable: true, writable: true });
    expect(shouldCollapseDrawerOnPersonView()).toBe(false);
  });

  it('media says TABLET (768) but innerWidth would say DESKTOP (783) → still closes (true)', () => {
    mockMatchMedia(768);
    Object.defineProperty(window, 'innerWidth', { value: 783, configurable: true, writable: true });
    expect(shouldCollapseDrawerOnPersonView()).toBe(true);
  });
});

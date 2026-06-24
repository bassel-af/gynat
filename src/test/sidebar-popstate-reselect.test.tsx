import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import type { GedcomData } from '@/lib/gedcom/types';

// ---------------------------------------------------------------------------
// REGRESSION (3rd cause): the Sidebar back-button popstate effect.
//
// THE BUG (reselect-close race): the effect was keyed on `selectedPersonId`, so
// reselecting a person (X→Y) while the drawer is open on the canvas re-ran it.
// The previous run's cleanup calls `history.back()`; the new run re-`pushState`s
// + registers a FRESH popstate handler — and the async pop from the cleanup's
// own back() is caught by that fresh handler → setMobileSidebarOpen(false). The
// drawer closes on a particular click. (jsdom doesn't fire popstate on
// history.back(), so the faithful, deterministic assertion is: across a reselect
// the effect must NOT call `history.back()` at all — no teardown + re-arm.)
//
// THE FIX (drop-gate): the effect is keyed on `[isMobileSidebarOpen, isPersonView,
// setMobileSidebarOpen]` ONLY — selectedPersonId is GONE (no dep, no gate). The
// back-interception arms whenever the drawer is OPEN on the canvas (list OR
// detail), so:
//   - a reselect (X→Y) doesn't re-run → no teardown → no self-back → no race;
//   - it arms even with NO person selected (list view) → fixes the earlier
//     "only arm in detail" regression (case D).
// ---------------------------------------------------------------------------

const setMobileSidebarOpen = vi.fn();

// Mutable selection so a rerender drives the reselect (X→Y) or list→detail.
let selectedPersonId: string | null = '@X@';

function makeData(): GedcomData {
  const base = {
    type: 'INDI' as const, surname: '', birth: '', birthPlace: '', birthDescription: '',
    birthNotes: '', birthHijriDate: '', death: '', deathPlace: '', deathDescription: '',
    deathNotes: '', deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
    kunya: '', familyAsChild: null as string | null, familiesAsSpouse: [] as string[],
  };
  return {
    individuals: {
      '@X@': { ...base, id: '@X@', name: 'سعيد', givenName: 'سعيد', sex: 'M' },
      '@Y@': { ...base, id: '@Y@', name: 'علي', givenName: 'علي', sex: 'M' },
    },
    families: {},
  };
}
const DATA = makeData();

vi.mock('@/context/TreeContext', () => ({
  useTree: () => ({
    data: DATA,
    rootsList: [],
    selectedRootId: '@X@',
    setSelectedRootId: vi.fn(),
    focusPersonId: null,
    setFocusPersonId: vi.fn(),
    selectedPersonId,
    setSelectedPersonId: vi.fn(),
    setHighlightedPersonId: vi.fn(),
    visiblePersonIds: new Set(['@X@', '@Y@']),
    graftPersonIds: new Set<string>(),
    panelScopeIds: new Set(['@X@', '@Y@']),
    isMobileSidebarOpen: true,
    setMobileSidebarOpen,
  }),
}));

vi.mock('@/context/WorkspaceTreeContext', () => ({
  useWorkspaceTree: () => ({
    description: '', hideBirthDateForFemale: false, hideBirthDateForMale: false, activeTreeId: undefined,
  }),
}));

// PersonDetail is a heavy subtree; the effect under test lives in Sidebar, so
// stub it out to keep the mount focused.
vi.mock('@/components/ui/Sidebar/PersonDetail', () => ({
  PersonDetail: ({ personId }: { personId: string }) => <div data-testid="person-detail">{personId}</div>,
}));

// Canvas pathname (NOT person view) so the effect's isPersonView early-return
// does not fire.
vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'test' }),
  usePathname: () => '/workspaces/test/tree',
  useRouter: () => ({ push: vi.fn() }),
}));

import { Sidebar } from '@/components/ui/Sidebar/Sidebar';

// Phone-width matchMedia so isDrawerViewport() (max-width:768) is true.
function stubMatchMediaPhone() {
  vi.stubGlobal('matchMedia', (query: string) => {
    const matches = query.split(' and ').every((clause) => {
      const min = clause.match(/min-width:\s*(\d+)px/);
      if (min) return 390 >= Number(min[1]);
      const max = clause.match(/max-width:\s*(\d+)px/);
      if (max) return 390 <= Number(max[1]);
      return true;
    });
    return { matches } as MediaQueryList;
  });
}

function sentinelPushes(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.filter(
    (c) => (c[0] as { mobileSidebarDetail?: boolean } | null)?.mobileSidebarDetail === true,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  selectedPersonId = '@X@';
  stubMatchMediaPhone();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Sidebar back-intercept (drop-gate)', () => {
  // A — the bug: a detail→detail reselect must not tear down + self-back.
  it('A: reselecting a person (X→Y) does NOT call history.back() or close the drawer', () => {
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});

    const { rerender } = render(<Sidebar />);
    selectedPersonId = '@Y@';
    rerender(<Sidebar />);

    expect(backSpy).not.toHaveBeenCalled();
    expect(setMobileSidebarOpen).not.toHaveBeenCalledWith(false);

    backSpy.mockRestore();
  });

  // B — feature intact: a genuine browser back closes the open drawer.
  it('B: a real browser back (popstate) closes the open drawer', () => {
    render(<Sidebar />);
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(setMobileSidebarOpen).toHaveBeenCalledWith(false);
  });

  // C — hygiene: one sentinel pushState per open; reselect does not push again.
  it('C: arms exactly once per drawer-open (single sentinel pushState across a reselect)', () => {
    const pushSpy = vi.spyOn(window.history, 'pushState');

    const { rerender } = render(<Sidebar />);
    selectedPersonId = '@Y@';
    rerender(<Sidebar />);

    expect(sentinelPushes(pushSpy)).toHaveLength(1);
    pushSpy.mockRestore();
  });

  // D — the regression fixed: arms even with NO person selected (list view), so a
  // back-press closes a list-only open drawer too.
  it('D: arms even with NO person selected — list-view open + real back closes', () => {
    selectedPersonId = null;
    const pushSpy = vi.spyOn(window.history, 'pushState');

    render(<Sidebar />);
    // Armed despite no detail: the sentinel was pushed.
    expect(sentinelPushes(pushSpy)).toHaveLength(1);

    // And a real back closes it.
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(setMobileSidebarOpen).toHaveBeenCalledWith(false);

    pushSpy.mockRestore();
  });
});

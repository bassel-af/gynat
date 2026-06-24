import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, within } from '@testing-library/react';
import type { Individual, GedcomData } from '@/lib/gedcom/types';

// ---------------------------------------------------------------------------
// REGRESSION: drawer must STAY OPEN on a PHONE for every person/navigation
// interaction inside PersonDetail. The PO hit this on a narrow desktop Safari
// window — `innerWidth` (used by the old checks) disagreed with the CSS layout
// width by the scrollbar gutter, so the drawer closed intermittently.
//
// Final contract (measured with window.matchMedia, NOT innerWidth):
//   - PHONE  (≤600px)   → person interactions KEEP the drawer open.
//   - TABLET (601–768px)→ person interactions CLOSE the drawer.
//
// Covered here:
//   - handlePersonClick — the 3 person-row branches (default-focus / graft /
//     isPersonView). Already routed through the helper; pinned phone-safe.
//   - handleFocusInTree — the "التركيز في الشجرة" button (always present).
//   - handleViewFamilyTree — the "عرض شجرة عائلته" button (external-family
//     person only = the intermittent per-person path).
//
// matchMedia is mocked from a per-test viewport width; the mocks read mutable
// module vars so each test can flip the branch (graft set, pathname) first.
// ---------------------------------------------------------------------------

const setMobileSidebarOpen = vi.fn();
const setFocusPersonId = vi.fn();
const setSelectedRootId = vi.fn();
const setSelectedPersonId = vi.fn();
const setHighlightedPersonId = vi.fn();
const routerPush = vi.fn();

let graftIds = new Set<string>();
let pathname = '/workspaces/test/tree';

// @SUBJECT@ is married into the root tree via @F1@ (visible spouse @SPOUSE@),
// but his own father @SPOUSEDAD@ lives OUTSIDE the root descendants → he has an
// external family → the "view family tree" button renders.
function makeData(): GedcomData {
  const base = {
    type: 'INDI' as const, surname: '', birth: '', birthPlace: '', birthDescription: '',
    birthNotes: '', birthHijriDate: '', death: '', deathPlace: '', deathDescription: '',
    deathNotes: '', deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
    kunya: '', familyAsChild: null as string | null,
  };
  const subject: Individual = { ...base, id: '@SUBJECT@', name: 'الزوج', givenName: 'الزوج', sex: 'M', familiesAsSpouse: ['@F1@'], familyAsChild: '@SPOUSEFAM@' };
  const spouse: Individual = { ...base, id: '@SPOUSE@', name: 'الزوجة', givenName: 'الزوجة', sex: 'F', familiesAsSpouse: ['@F1@'], familyAsChild: '@ROOTFAM@' };
  const root: Individual = { ...base, id: '@ROOT@', name: 'الجد', givenName: 'الجد', sex: 'M', familiesAsSpouse: ['@ROOTFAM@'] };
  const spouseDad: Individual = { ...base, id: '@SPOUSEDAD@', name: 'والد الزوج', givenName: 'والد الزوج', sex: 'M', familiesAsSpouse: ['@SPOUSEFAM@'] };
  const e = () => ({ date: '', hijriDate: '', place: '', description: '', notes: '' });
  return {
    individuals: { '@SUBJECT@': subject, '@SPOUSE@': spouse, '@ROOT@': root, '@SPOUSEDAD@': spouseDad },
    families: {
      '@F1@': { id: '@F1@', type: 'FAM', husband: '@SUBJECT@', wife: '@SPOUSE@', children: [], marriageContract: e(), marriage: e(), divorce: e(), isDivorced: false },
      '@ROOTFAM@': { id: '@ROOTFAM@', type: 'FAM', husband: '@ROOT@', wife: null, children: ['@SPOUSE@'], marriageContract: e(), marriage: e(), divorce: e(), isDivorced: false },
      '@SPOUSEFAM@': { id: '@SPOUSEFAM@', type: 'FAM', husband: '@SPOUSEDAD@', wife: null, children: ['@SUBJECT@'], marriageContract: e(), marriage: e(), divorce: e(), isDivorced: false },
    },
  };
}

const DATA = makeData();

// Root is @ROOT@ so @SUBJECT@ is married-in (external family). @SUBJECT@,
// @SPOUSE@, @ROOT@ are all visible/clickable.
vi.mock('@/context/TreeContext', () => ({
  useTree: () => ({
    data: DATA,
    selectedRootId: '@ROOT@',
    visiblePersonIds: new Set(['@ROOT@', '@SPOUSE@', '@SUBJECT@']),
    graftPersonIds: graftIds,
    setSelectedPersonId,
    setSelectedRootId,
    setFocusPersonId,
    setHighlightedPersonId,
    setMobileSidebarOpen,
  }),
}));

vi.mock('@/context/WorkspaceTreeContext', () => ({
  useOptionalWorkspaceTree: () => null,
}));

vi.mock('@/context/UndoStackContext', () => ({
  useOptionalUndoStack: () => null,
}));

vi.mock('@/hooks/useCalendarPreference', () => ({
  useCalendarPreference: () => ({ preference: 'hijri', setPreference: vi.fn(), loading: false }),
}));

vi.mock('@/hooks/usePersonActions', () => ({
  usePersonActions: () => ({
    formMode: null, setFormMode: vi.fn(),
    formLoading: false,
    formError: '', setFormError: vi.fn(),
    deleteState: { kind: 'idle' }, setDeleteState: vi.fn(),
    handleEditSubmit: vi.fn(), handleAddChildSubmit: vi.fn(), handleAddSpouseSubmit: vi.fn(),
    handleLinkExistingSpouse: vi.fn(), handleAddParentSubmit: vi.fn(), handleAddSiblingSubmit: vi.fn(),
    handleFamilyEventSubmit: vi.fn(), unlinkSpouse: vi.fn(), handleRadaaSubmit: vi.fn(),
    handleRadaaDelete: vi.fn(), handleDeleteClick: vi.fn(), handleCascadeConfirm: vi.fn(),
    moveSubtree: vi.fn(),
  }),
}));

vi.mock('@/hooks/usePointerActions', () => ({
  usePointerActions: () => ({ breakPointer: vi.fn(), copyPointer: vi.fn(), isLoading: false }),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'test' }),
  usePathname: () => pathname,
  useRouter: () => ({ push: routerPush }),
}));

import { PersonDetail } from '@/components/ui/Sidebar/PersonDetail';

// Mock matchMedia from a viewport width (evaluate min-/max-width clauses).
function setViewport(width: number) {
  vi.stubGlobal('matchMedia', (query: string) => {
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

function clickRelativeRow(container: HTMLElement, label: string) {
  const btn = within(container).getAllByRole('button').find((b) => b.textContent?.includes(label));
  if (!btn) throw new Error(`relationship row "${label}" not found`);
  fireEvent.click(btn);
}

beforeEach(() => {
  vi.clearAllMocks();
  graftIds = new Set<string>();
  pathname = '/workspaces/test/tree';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ===========================================================================
// The two "go to the tree" buttons (the un-held culprits).
// ===========================================================================
describe('PersonDetail buttons — drawer rule (phone keep-open, tablet close)', () => {
  it('PHONE (390): "focus in tree" does NOT close the drawer', () => {
    setViewport(390);
    const { getByTitle } = render(<PersonDetail personId="@SUBJECT@" />);
    fireEvent.click(getByTitle('التركيز في الشجرة'));
    expect(setMobileSidebarOpen).not.toHaveBeenCalledWith(false);
  });

  it('PHONE (600 boundary): "focus in tree" does NOT close the drawer', () => {
    setViewport(600);
    const { getByTitle } = render(<PersonDetail personId="@SUBJECT@" />);
    fireEvent.click(getByTitle('التركيز في الشجرة'));
    expect(setMobileSidebarOpen).not.toHaveBeenCalledWith(false);
  });

  it('TABLET (601 boundary): "focus in tree" DOES close the drawer', () => {
    setViewport(601);
    const { getByTitle } = render(<PersonDetail personId="@SUBJECT@" />);
    fireEvent.click(getByTitle('التركيز في الشجرة'));
    expect(setMobileSidebarOpen).toHaveBeenCalledWith(false);
  });

  it('TABLET (768): "focus in tree" DOES close the drawer', () => {
    setViewport(768);
    const { getByTitle } = render(<PersonDetail personId="@SUBJECT@" />);
    fireEvent.click(getByTitle('التركيز في الشجرة'));
    expect(setMobileSidebarOpen).toHaveBeenCalledWith(false);
  });

  it('PHONE (390): "view family tree" (external-family person) does NOT close the drawer', () => {
    setViewport(390);
    const { getByTitle } = render(<PersonDetail personId="@SUBJECT@" />);
    fireEvent.click(getByTitle('عرض شجرة عائلته'));
    expect(setMobileSidebarOpen).not.toHaveBeenCalledWith(false);
  });

  it('TABLET (768): "view family tree" (external-family person) DOES close the drawer', () => {
    setViewport(768);
    const { getByTitle } = render(<PersonDetail personId="@SUBJECT@" />);
    fireEvent.click(getByTitle('عرض شجرة عائلته'));
    expect(setMobileSidebarOpen).toHaveBeenCalledWith(false);
  });
});

// ===========================================================================
// The person-row path (handlePersonClick) — already helper-routed; pin it.
// ===========================================================================
describe('PersonDetail.handlePersonClick — drawer rule per branch', () => {
  it('PHONE (390) default-focus: clicking a visible relative does NOT close the drawer', () => {
    setViewport(390);
    const { container } = render(<PersonDetail personId="@SUBJECT@" />);
    clickRelativeRow(container, 'الزوجة');
    expect(setMobileSidebarOpen).not.toHaveBeenCalledWith(false);
  });

  it('TABLET (768) default-focus: clicking a visible relative DOES close the drawer', () => {
    setViewport(768);
    const { container } = render(<PersonDetail personId="@SUBJECT@" />);
    clickRelativeRow(container, 'الزوجة');
    expect(setMobileSidebarOpen).toHaveBeenCalledWith(false);
  });

  it('PHONE (390) graft: clicking an in-law graft relative does NOT close the drawer', () => {
    setViewport(390);
    graftIds = new Set(['@SPOUSE@']);
    const { container } = render(<PersonDetail personId="@SUBJECT@" />);
    clickRelativeRow(container, 'الزوجة');
    expect(setMobileSidebarOpen).not.toHaveBeenCalledWith(false);
  });

  it('TABLET (768) graft: clicking an in-law graft relative DOES close the drawer', () => {
    setViewport(768);
    graftIds = new Set(['@SPOUSE@']);
    const { container } = render(<PersonDetail personId="@SUBJECT@" />);
    clickRelativeRow(container, 'الزوجة');
    expect(setMobileSidebarOpen).toHaveBeenCalledWith(false);
  });

  it('PHONE (390) person-view nav: clicking a relative does NOT close the drawer', () => {
    setViewport(390);
    pathname = '/workspaces/test/tree/person/@SUBJECT@';
    const { container } = render(<PersonDetail personId="@SUBJECT@" />);
    clickRelativeRow(container, 'الزوجة');
    expect(setMobileSidebarOpen).not.toHaveBeenCalledWith(false);
  });

  it('TABLET (768) person-view nav: clicking a relative DOES close the drawer', () => {
    setViewport(768);
    pathname = '/workspaces/test/tree/person/@SUBJECT@';
    const { container } = render(<PersonDetail personId="@SUBJECT@" />);
    clickRelativeRow(container, 'الزوجة');
    expect(setMobileSidebarOpen).toHaveBeenCalledWith(false);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GedcomData } from '@/lib/gedcom/types';

// ---------------------------------------------------------------------------
// The collapsed-drawer button (tablet/phone).
//
// On the CANVAS it carries a search icon, so it must always land on the search
// list — even with a person selected. The selection itself must SURVIVE: the tree
// card's «التفاصيل» button only renders while its person is selected, so clearing
// it would strand the member. On the PERSON PAGE there are no cards, so the
// button is the ONLY way into that person's panel (edit actions): it shows the
// details and is labelled as such, not as search.
// ---------------------------------------------------------------------------

const setMobileSidebarOpen = vi.fn();
const setSelectedPersonId = vi.fn();
let pathname = '/workspaces/test/tree';

const base = {
  type: 'INDI' as const, surname: '', birth: '', birthPlace: '', birthDescription: '',
  birthNotes: '', birthHijriDate: '', death: '', deathPlace: '', deathDescription: '',
  deathNotes: '', deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
  kunya: '', familyAsChild: null as string | null, familiesAsSpouse: [] as string[],
};
const DATA: GedcomData = {
  individuals: { '@X@': { ...base, id: '@X@', name: 'سعيد', givenName: 'سعيد', sex: 'M' } },
  families: {},
};

vi.mock('@/context/TreeContext', () => ({
  useTree: () => ({
    data: DATA,
    rootsList: [],
    selectedRootId: '@X@',
    setSelectedRootId: vi.fn(),
    focusPersonId: null,
    setFocusPersonId: vi.fn(),
    selectedPersonId: '@X@',
    setSelectedPersonId,
    setHighlightedPersonId: vi.fn(),
    visiblePersonIds: new Set(['@X@']),
    graftPersonIds: new Set<string>(),
    panelScopeIds: new Set(['@X@']),
    isMobileSidebarOpen: false,
    setMobileSidebarOpen,
  }),
}));

vi.mock('@/context/WorkspaceTreeContext', () => ({
  useWorkspaceTree: () => ({
    description: '', hideBirthDateForFemale: false, hideBirthDateForMale: false, activeTreeId: undefined,
  }),
}));

vi.mock('@/components/ui/Sidebar/PersonDetail', () => ({
  PersonDetail: ({ personId }: { personId: string }) => <div data-testid="person-detail">{personId}</div>,
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'test' }),
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
}));

import { Sidebar } from '@/components/ui/Sidebar/Sidebar';

beforeEach(() => {
  vi.clearAllMocks();
  pathname = '/workspaces/test/tree';
});

describe('Sidebar collapsed-drawer button', () => {
  it('canvas: is a search button that lands on the search list WITHOUT dropping the selection', () => {
    render(<Sidebar />);
    // A person is selected, so before the tap the panel holds their details.
    expect(screen.getByTestId('person-detail')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'البحث في العائلة' }));

    expect(setMobileSidebarOpen).toHaveBeenCalledWith(true);
    expect(setSelectedPersonId).not.toHaveBeenCalled();
    expect(screen.queryByTestId('person-detail')).toBeNull();
    expect(screen.getByPlaceholderText('ابحث عن شخص في العائلة...')).toBeTruthy();
  });

  it('canvas: picking the already-selected person from the list switches back to their details', () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: 'البحث في العائلة' }));
    fireEvent.click(screen.getByText('سعيد'));

    expect(screen.getByTestId('person-detail')).toBeTruthy();
  });

  it('person page: opens that person\'s details panel (the only way in)', () => {
    pathname = '/workspaces/test/tree/person/@X@';
    render(<Sidebar />);

    expect(screen.queryByRole('button', { name: 'البحث في العائلة' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'عرض تفاصيل الشخص' }));

    expect(setMobileSidebarOpen).toHaveBeenCalledWith(true);
    expect(screen.getByTestId('person-detail')).toBeTruthy();
  });
});

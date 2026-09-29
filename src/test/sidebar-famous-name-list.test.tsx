import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GedcomData, RootAncestor } from '@/lib/gedcom/types';

// ---------------------------------------------------------------------------
// Sidebar rows and the root-ancestor dropdown show a person's other name on a
// grey line under the main name («واسمه شيبة» under عبدالمطلب), highlight the
// search in it, and strengthen it when only the grey line matched.
// ---------------------------------------------------------------------------

const base = {
  type: 'INDI' as const, surname: '', birth: '', birthPlace: '', birthDescription: '',
  birthNotes: '', birthHijriDate: '', death: '', deathPlace: '', deathDescription: '',
  deathNotes: '', deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
  kunya: '', familyAsChild: null as string | null, familiesAsSpouse: [] as string[],
};
const DATA: GedcomData = {
  individuals: {
    '@S@': { ...base, id: '@S@', name: 'شيبة', givenName: 'شيبة', famousName: 'عبدالمطلب', sex: 'M' },
    '@X@': { ...base, id: '@X@', name: 'سعيد', givenName: 'سعيد', sex: 'M', birth: '1900' },
  },
  families: {},
};
const ROOTS: RootAncestor[] = [
  { id: '@S@', text: 'عبدالمطلب', searchText: 'عبدالمطلب شيبة', alternate: 'واسمه شيبة' },
  { id: '@X@', text: 'سعيد', searchText: 'سعيد' },
];

vi.mock('@/context/TreeContext', () => ({
  useTree: () => ({
    data: DATA,
    rootsList: ROOTS,
    selectedRootId: '@X@',
    setSelectedRootId: vi.fn(),
    focusPersonId: null,
    setFocusPersonId: vi.fn(),
    selectedPersonId: null,
    setSelectedPersonId: vi.fn(),
    setHighlightedPersonId: vi.fn(),
    visiblePersonIds: new Set(['@S@', '@X@']),
    graftPersonIds: new Set<string>(),
    panelScopeIds: new Set(['@S@', '@X@']),
    isMobileSidebarOpen: true,
    setMobileSidebarOpen: vi.fn(),
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
  usePathname: () => '/workspaces/test/tree',
  useRouter: () => ({ push: vi.fn() }),
}));

import { Sidebar } from '@/components/ui/Sidebar/Sidebar';

function rowOf(name: string): HTMLLIElement {
  return screen.getByText(name).closest('li') as HTMLLIElement;
}

function openRootDropdown(query = '') {
  fireEvent.click(screen.getByRole('button', { name: /خيارات متقدمة/ }));
  const rootInput = screen.getByPlaceholderText('اكتب للبحث...');
  fireEvent.focus(rootInput);
  if (query) fireEvent.change(rootInput, { target: { value: query } });
  return rootInput;
}

describe('Sidebar people list — other-name grey line', () => {
  it('shows «واسمه شيبة» in the عبدالمطلب row', () => {
    render(<Sidebar />);
    expect(rowOf('عبدالمطلب').textContent).toContain('واسمه شيبة');
  });

  it('searching «شيبة» highlights the match inside the grey line', () => {
    render(<Sidebar />);
    fireEvent.change(screen.getByPlaceholderText('ابحث عن شخص في العائلة...'), { target: { value: 'شيبة' } });
    const mark = rowOf('عبدالمطلب').querySelector('mark');
    expect(mark?.textContent).toBe('شيبة');
  });

  it('searching «شيبة» strengthens the grey line (matched only there)', () => {
    render(<Sidebar />);
    fireEvent.change(screen.getByPlaceholderText('ابحث عن شخص في العائلة...'), { target: { value: 'شيبة' } });
    expect(rowOf('عبدالمطلب').querySelector('[data-hit="true"]')?.textContent).toBe('واسمه شيبة');
  });

  it('a person without a famous name has no grey line and keeps name + dates', () => {
    render(<Sidebar />);
    const row = rowOf('سعيد');
    expect(row.querySelector('[data-hit]')).toBeNull();
    expect(row.textContent).toBe('سعيد1900');
  });
});

describe('Sidebar root dropdown — other-name grey line', () => {
  it('shows the root\'s grey line under its text', () => {
    render(<Sidebar />);
    const input = openRootDropdown();
    const item = [...input.parentElement!.querySelectorAll('li')].find((li) => li.textContent?.startsWith('عبدالمطلب'));
    expect(item?.textContent).toBe('عبدالمطلبواسمه شيبة');
  });

  it('highlights the root filter inside the grey line', () => {
    render(<Sidebar />);
    const input = openRootDropdown('شيبة');
    const hit = input.parentElement!.querySelector('[data-hit="true"]');
    expect(hit?.querySelector('mark')?.textContent).toBe('شيبة');
  });
});

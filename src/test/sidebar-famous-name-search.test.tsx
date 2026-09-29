import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GedcomData, RootAncestor } from '@/lib/gedcom/types';

// ---------------------------------------------------------------------------
// The sidebar people search matches every name a person goes by: a person whose
// famous name leads the row («عبدالمطلب») is still found by the real name.
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
    '@X@': { ...base, id: '@X@', name: 'سعيد', givenName: 'سعيد', sex: 'M' },
  },
  families: {},
};
const ROOTS: RootAncestor[] = [
  { id: '@S@', text: 'عبدالمطلب', searchText: 'عبدالمطلب شيبة' },
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

describe('Sidebar search by any name', () => {
  it('the people search finds a famous-name-led person by the real name', () => {
    render(<Sidebar />);
    fireEvent.change(screen.getByPlaceholderText('ابحث عن شخص في العائلة...'), { target: { value: 'شيبة' } });
    expect(screen.getByText('عبدالمطلب')).toBeTruthy();
    expect(screen.queryByText('سعيد')).toBeNull();
  });

  it('the root filter matches the root search text, not only the shown text', () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: /خيارات متقدمة/ }));
    const rootInput = screen.getByPlaceholderText('اكتب للبحث...');
    fireEvent.focus(rootInput);
    fireEvent.change(rootInput, { target: { value: 'شيبة' } });
    const texts = [...rootInput.parentElement!.querySelectorAll('li')].map((li) => li.textContent);
    expect(texts).toContain('عبدالمطلب');
    expect(texts).not.toContain('لا توجد نتائج');
  });
});

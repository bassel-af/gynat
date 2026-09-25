/**
 * Sources («المصادر») step 7 — the public tree viewer's person panel.
 *
 * The anonymous viewer reuses `PersonDetail` under a `WorkspaceTreeProvider`
 * with `workspaceId="public"`. With a `publicSlug` in that context the panel
 * shows the read-only PUBLIC sources (anonymous route) and never calls the
 * member sources API.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Individual, GedcomData } from '@/lib/gedcom/types';

const P = 'cccccccc-0000-4000-8000-000000000001';

function makeData(): GedcomData {
  const person: Individual = {
    type: 'INDI', id: P, name: 'سعيد', givenName: 'سعيد', surname: '', sex: 'M',
    birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
    death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
    notes: '', isDeceased: true, isPrivate: false, kunya: '', familiesAsSpouse: [], familyAsChild: null,
  };
  return { individuals: { [P]: person }, families: {} };
}
const DATA = makeData();

vi.mock('@/context/TreeContext', () => ({
  useTree: () => ({
    data: DATA,
    selectedRootId: P,
    visiblePersonIds: new Set([P]),
    graftPersonIds: new Set<string>(),
    setSelectedPersonId: vi.fn(),
    setSelectedRootId: vi.fn(),
    setFocusPersonId: vi.fn(),
    setHighlightedPersonId: vi.fn(),
    setMobileSidebarOpen: vi.fn(),
  }),
}));

let workspace: Record<string, unknown> | null = null;
vi.mock('@/context/WorkspaceTreeContext', () => ({
  useOptionalWorkspaceTree: () => workspace,
}));
vi.mock('@/context/UndoStackContext', () => ({ useOptionalUndoStack: () => null }));
vi.mock('@/hooks/useCalendarPreference', () => ({
  useCalendarPreference: () => ({ preference: 'hijri', setPreference: vi.fn(), loading: false }),
}));
vi.mock('@/hooks/usePersonActions', () => ({
  usePersonActions: () => ({
    formMode: null, setFormMode: vi.fn(), formLoading: false, formError: '', setFormError: vi.fn(),
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
  useParams: () => ({ slug: 'abc' }),
  usePathname: () => '/family/abc',
  useRouter: () => ({ push: vi.fn() }),
}));

const mockApiFetch = vi.fn(async () => new Response(JSON.stringify({ data: { entries: [], inherited: null } })));
vi.mock('@/lib/api/client', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...(a as [])) }));

import { PersonDetail } from '@/components/ui/Sidebar/PersonDetail';

const fetchMock = vi.fn();

beforeEach(() => {
  mockApiFetch.mockClear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ data: { entries: [{ id: 'e1', text: 'طبقات ابن سعد', files: [] }], inherited: null } })),
  );
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('matchMedia', () => ({ matches: false }) as MediaQueryList);
  workspace = {
    workspaceId: 'public', publicSlug: 'abc', canEdit: false, isAdmin: false, refreshTree: async () => undefined,
  };
});
afterEach(() => vi.unstubAllGlobals());

describe('public tree viewer — person panel sources', () => {
  it('shows the public entries from the anonymous route', async () => {
    render(<PersonDetail personId={P} />);
    expect(await screen.findByText('طبقات ابن سعد')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(`/api/family/abc/person/${P}/sources`, expect.anything());
  });

  it('never calls the member sources API and offers no editing', async () => {
    render(<PersonDetail personId={P} />);
    await screen.findByText('طبقات ابن سعد');
    const memberCalls = mockApiFetch.mock.calls.filter((c) => /sources/.test(String((c as unknown[])[0])));
    expect(memberCalls).toEqual([]);
    expect(screen.queryByRole('button', { name: /إضافة مصدر/ })).toBeNull();
  });
});

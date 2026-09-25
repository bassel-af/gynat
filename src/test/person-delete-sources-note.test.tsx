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
    deleteState: { kind: 'simpleConfirm' }, setDeleteState: vi.fn(),
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
  usePathname: () => '/workspaces/abc/tree',
  useRouter: () => ({ push: vi.fn() }),
}));

let personSources: unknown = { entries: [], inherited: null };
const mockApiFetch = vi.fn(async () => new Response(JSON.stringify({ data: personSources })));
vi.mock('@/lib/api/client', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...(a as [])) }));

import { PersonDetail } from '@/components/ui/Sidebar/PersonDetail';

const KEPT_NOTE = 'المصادر التي ليست لغيره تبقى في صفحة «المصادر» تحت «ليس مصدرًا لأحد».';

function source(id: string, sharedCount: number, files: unknown[] = []) {
  return {
    id, individualId: P, text: `نص ${id}`, visibility: 'members', createdAt: '', updatedAt: '', files,
    people: Array.from({ length: sharedCount }, (_, i) => ({ id: `O${i}`, name: `شخص ${i}` })), sharedCount,
  };
}

beforeEach(() => {
  mockApiFetch.mockClear();
  vi.stubGlobal('matchMedia', () => ({ matches: false }) as MediaQueryList);
  workspace = { workspaceId: 'ws', canEdit: true, isAdmin: true, refreshTree: async () => undefined };
});
afterEach(() => vi.unstubAllGlobals());

/**
 * Sources («المصادر») — the person delete confirm (§2.6). Sources survive a
 * person delete and an undo re-links them, so the old «files never come
 * back» line is gone; an admin learns instead where a source only this person
 * had ends up.
 */
describe('person delete confirm — sources note', () => {
  it('tells an admin that sources only this person had stay under «ليس مصدرًا لأحد»', async () => {
    personSources = { entries: [source('a', 0, [{ id: 'f', mimeType: 'application/pdf', sizeBytes: 1, fileName: 'd.pdf' }]), source('b', 3)], inherited: null };
    render(<PersonDetail personId={P} />);
    expect(await screen.findByText(KEPT_NOTE)).toBeInTheDocument();
    expect(screen.queryByText(/لا تعود عند التراجع/)).toBeNull();
  });

  it('says nothing when every source is shared with someone else', async () => {
    personSources = { entries: [source('b', 3)], inherited: null };
    render(<PersonDetail personId={P} />);
    await screen.findByText('نص b');
    expect(screen.queryByText(KEPT_NOTE)).toBeNull();
  });

  it('says nothing to a non-admin editor (the «المصادر» page is admins only)', async () => {
    workspace = { workspaceId: 'ws', canEdit: true, isAdmin: false, refreshTree: async () => undefined };
    personSources = { entries: [source('a', 0)], inherited: null };
    render(<PersonDetail personId={P} />);
    await screen.findByText('نص a');
    expect(screen.queryByText(KEPT_NOTE)).toBeNull();
  });
});

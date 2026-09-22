import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import type { AncestryJump, Family, GedcomData, Individual } from '@/lib/gedcom/types';
import type { IndividualFormData } from '@/components/tree/IndividualForm/IndividualForm';
import type { UndoEntry } from '@/lib/undo/types';

// ---------------------------------------------------------------------------
// «قفزة نسب» — the UI entry point (spec §10.4).
//
// Three things can break here and nothing else would catch them:
//   1. WHO is offered the action (a viewer, a borrowed person, or someone who
//      already has parents must never see it);
//   2. the «شخص جديد» path is three API calls that must collapse into ONE undo
//      entry, or Ctrl+Z leaves a half-built ancestor behind;
//   3. the «شخص موجود» path must ask which couple only when there IS a choice.
// ---------------------------------------------------------------------------

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

// PersonDetail is behind a login, which is no reason to leave its gating to a
// manual browser check — the panel is rendered here with the contexts stubbed.
let panelData: GedcomData;
let panelCanEdit = true;

vi.mock('@/context/TreeContext', () => ({
  useTree: () => ({
    data: panelData,
    selectedRootId: '@ADNAN@',
    visiblePersonIds: new Set(Object.keys(panelData.individuals)),
    graftPersonIds: new Set<string>(),
    setSelectedPersonId: vi.fn(),
    setSelectedRootId: vi.fn(),
    setFocusPersonId: vi.fn(),
    setHighlightedPersonId: vi.fn(),
    setMobileSidebarOpen: vi.fn(),
  }),
}));
vi.mock('@/context/WorkspaceTreeContext', () => ({
  useOptionalWorkspaceTree: () => ({
    workspaceId: 'ws-1',
    canEdit: panelCanEdit,
    isAdmin: false,
    enableRadaa: false,
    refreshTree: vi.fn(),
    pointers: [],
  }),
  useWorkspaceTree: () => ({ workspaceId: 'ws-1', canEdit: panelCanEdit }),
}));
vi.mock('@/context/UndoStackContext', () => ({ useOptionalUndoStack: () => null }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'test' }),
  usePathname: () => '/workspaces/test/tree',
  useRouter: () => ({ push: vi.fn() }),
}));

import { apiFetch } from '@/lib/api/client';
import { PersonDetail } from '@/components/ui/Sidebar/PersonDetail';
import { usePersonActions } from '@/hooks/usePersonActions';
import { getAncestryJumpAction } from '@/lib/person-detail-helpers';
import { AncestryJumpForm } from '@/components/tree/AncestryJumpForm';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeIndividual(overrides: Partial<Individual> = {}): Individual {
  return {
    id: '@I@',
    type: 'INDI',
    name: 'Test',
    givenName: 'Test',
    surname: '',
    sex: 'M',
    birth: '',
    birthPlace: '',
    birthDescription: '',
    birthNotes: '',
    birthHijriDate: '',
    death: '',
    deathPlace: '',
    deathDescription: '',
    deathNotes: '',
    deathHijriDate: '',
    notes: '',
    isDeceased: false,
    isPrivate: false,
    familiesAsSpouse: [],
    kunya: '',
    familyAsChild: null,
    ...overrides,
  };
}

function makeFamily(overrides: Partial<Family> = {}): Family {
  const empty = { date: '', hijriDate: '', place: '', description: '', notes: '' };
  return {
    id: '@F@',
    type: 'FAM',
    husband: null,
    wife: null,
    children: [],
    marriageContract: { ...empty },
    marriage: { ...empty },
    divorce: { ...empty },
    isDivorced: false,
    ...overrides,
  };
}

const JUMP: AncestryJump = {
  id: 'jump-1',
  type: '_ANC_JUMP',
  descendant: '@ADNAN@',
  ancestorFamily: '@F-ISHMAEL@',
  generationsMin: 4,
  generationsMax: 40,
  notes: 'قيل سبعة، وقيل أربعون.',
};

const ADNAN = makeIndividual({ id: '@ADNAN@', name: 'عدنان', givenName: 'عدنان' });

/** عدنان alone, plus إسماعيل (who has a couple) and a lone قحطان (who has none). */
function makeData(overrides: { adnan?: Partial<Individual> } = {}): GedcomData {
  return {
    individuals: {
      '@ADNAN@': { ...ADNAN, ...overrides.adnan },
      '@ISHMAEL@': makeIndividual({
        id: '@ISHMAEL@', name: 'إسماعيل', givenName: 'إسماعيل', familiesAsSpouse: ['@F-ISHMAEL@'],
      }),
      '@HAJAR@': makeIndividual({
        id: '@HAJAR@', name: 'هاجر', givenName: 'هاجر', sex: 'F', familiesAsSpouse: ['@F-ISHMAEL@'],
      }),
      '@QAHTAN@': makeIndividual({ id: '@QAHTAN@', name: 'قحطان', givenName: 'قحطان' }),
    },
    families: {
      '@F-ISHMAEL@': makeFamily({ id: '@F-ISHMAEL@', husband: '@ISHMAEL@', wife: '@HAJAR@' }),
    },
  };
}

function withJump(): GedcomData {
  const data = makeData();
  data.individuals['@ADNAN@'] = { ...data.individuals['@ADNAN@'], ancestryJumpAsDescendant: JUMP.id };
  data.families['@F-ISHMAEL@'].ancestryJumpsAsAncestor = [JUMP.id];
  data.ancestryJumps = { [JUMP.id]: JUMP };
  return data;
}

// ---------------------------------------------------------------------------
// 1. Who is offered the action
// ---------------------------------------------------------------------------

describe('«قفزة نسب» — who is offered the action', () => {
  it('offers it to an editor on a person with no parents', () => {
    expect(getAncestryJumpAction(ADNAN, makeData(), true)).toBe('create');
  });

  it('is hidden for a viewer', () => {
    expect(getAncestryJumpAction(ADNAN, makeData(), false)).toBeNull();
  });

  it('is hidden on a borrowed (pointed) person — borrowed data is read-only', () => {
    const pointed = { ...ADNAN, _pointed: true };
    expect(getAncestryJumpAction(pointed, makeData({ adnan: { _pointed: true } }), true)).toBeNull();
  });

  it('is hidden on a person who already has parents — a jump sits at the TOP of a known line', () => {
    const withParents = { ...ADNAN, familyAsChild: '@F-ISHMAEL@' };
    expect(getAncestryJumpAction(withParents, makeData({ adnan: { familyAsChild: '@F-ISHMAEL@' } }), true))
      .toBeNull();
  });

  it('switches to edit once the person already has a jump', () => {
    const data = withJump();
    expect(getAncestryJumpAction(data.individuals['@ADNAN@'], data, true)).toBe('edit');
  });
});

describe('«قفزة نسب» — the button in the person panel', () => {
  const renderPanel = (data: GedcomData, canEdit = true) => {
    panelData = data;
    panelCanEdit = canEdit;
    render(<PersonDetail personId="@ADNAN@" />);
  };
  const jumpButton = () => screen.queryByRole('button', { name: /قفزة/ });

  it('appears for an editor on a person with no parents', () => {
    renderPanel(makeData());
    expect(jumpButton()?.textContent).toBe('قفزة نسب');
  });

  it('is absent for a viewer', () => {
    renderPanel(makeData(), false);
    expect(jumpButton()).toBeNull();
  });

  it('is absent on a borrowed person', () => {
    renderPanel(makeData({ adnan: { _pointed: true } }));
    expect(jumpButton()).toBeNull();
  });

  it('is absent on a person who already has parents', () => {
    renderPanel(makeData({ adnan: { familyAsChild: '@F-ISHMAEL@' } }));
    expect(jumpButton()).toBeNull();
  });

  it('becomes the edit action once the person already has a jump', () => {
    renderPanel(withJump());
    expect(jumpButton()?.textContent).toBe('تعديل قفزة النسب');
  });

  it('opens the sheet on click', () => {
    renderPanel(makeData());
    fireEvent.click(jumpButton()!);
    expect(screen.getByRole('button', { name: 'شخص موجود في الشجرة' })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 2. The two-path sheet
// ---------------------------------------------------------------------------

function renderForm(data: GedcomData, props: Partial<React.ComponentProps<typeof AncestryJumpForm>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(
    <AncestryJumpForm
      mode="create"
      person={data.individuals['@ADNAN@']}
      data={data}
      onSubmit={onSubmit}
      onCancel={vi.fn()}
      {...props}
    />,
  );
  return { onSubmit };
}

/** Type into the person combo-box and click the named result. */
function pickPerson(name: string) {
  fireEvent.change(screen.getByPlaceholderText('ابحث عن شخص...'), { target: { value: name } });
  fireEvent.mouseDown(screen.getByText(name));
}

describe('«قفزة نسب» — the two-path sheet', () => {
  it('offers both paths', () => {
    renderForm(makeData());
    expect(screen.getByRole('button', { name: 'شخص جديد' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'شخص موجود في الشجرة' })).toBeTruthy();
  });

  it('asks which couple when the chosen ancestor already has a family', async () => {
    renderForm(makeData());
    fireEvent.click(screen.getByRole('button', { name: 'شخص موجود في الشجرة' }));
    pickPerson('إسماعيل');

    await waitFor(() => expect(screen.getByText('اختر العائلة')).toBeTruthy());
  });

  it('skips straight past the couple question when the chosen ancestor has none', async () => {
    renderForm(makeData());
    fireEvent.click(screen.getByRole('button', { name: 'شخص موجود في الشجرة' }));
    pickPerson('قحطان');

    await waitFor(() => expect(screen.getByLabelText('من')).toBeTruthy());
    expect(screen.queryByText('اختر العائلة')).toBeNull();
  });

  it('opens the new-ancestor form with a BLANK family name', () => {
    // Every other create mode seeds the patrilineal family name. A «قفزة نسب»
    // ancestor is from a different house, so seeding the descendant's name
    // would stamp عدنان's family onto إسماعيل — the same falsehood the nasab
    // surname freeze exists to prevent.
    const data = makeData({ adnan: { surname: 'قريش' } });
    renderForm(data);
    fireEvent.click(screen.getByRole('button', { name: 'شخص جديد' }));

    expect((screen.getByLabelText('اسم العائلة') as HTMLInputElement).value).toBe('');
  });

  it('never offers the subject himself as his own distant ancestor', () => {
    renderForm(makeData());
    fireEvent.click(screen.getByRole('button', { name: 'شخص موجود في الشجرة' }));
    fireEvent.change(screen.getByPlaceholderText('ابحث عن شخص...'), { target: { value: 'عدنان' } });

    expect(screen.queryByText('عدنان')).toBeNull();
  });

  it('submits the stated range and notes with the chosen existing couple', async () => {
    const { onSubmit } = renderForm(makeData());
    fireEvent.click(screen.getByRole('button', { name: 'شخص موجود في الشجرة' }));
    pickPerson('إسماعيل');
    await waitFor(() => screen.getByText('اختر العائلة'));
    fireEvent.click(screen.getByRole('radio'));
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));

    fireEvent.change(await screen.findByLabelText('من'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('إلى'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('ملاحظات'), { target: { value: 'قيل أربعون.' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      source: 'existingFamily',
      ancestorFamilyId: '@F-ISHMAEL@',
      generationsMin: 4,
      generationsMax: 40,
      notes: 'قيل أربعون.',
    });
  });

  it('shows the resulting nasab so the editor sees what he is about to claim', async () => {
    renderForm(makeData());
    fireEvent.click(screen.getByRole('button', { name: 'شخص موجود في الشجرة' }));
    pickPerson('قحطان');

    await waitFor(() => screen.getByLabelText('من'));
    expect(screen.getByText(/عدنان، من وَلَد قحطان/)).toBeTruthy();
  });

  it('in edit mode it opens on the stated range and offers deletion', () => {
    const data = withJump();
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <AncestryJumpForm
        mode="edit"
        person={data.individuals['@ADNAN@']}
        data={data}
        initialData={{ generationsMin: 4, generationsMax: 40, notes: JUMP.notes }}
        onSubmit={vi.fn()}
        onDelete={onDelete}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('تعديل قفزة النسب')).toBeTruthy();
    expect((screen.getByLabelText('من') as HTMLInputElement).value).toBe('4');
    expect((screen.getByLabelText('إلى') as HTMLInputElement).value).toBe('40');
    expect(screen.getByRole('button', { name: 'حذف قفزة النسب' })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 3. The «شخص جديد» composite: three calls, ONE undo entry
// ---------------------------------------------------------------------------

function makeFormData(overrides: Partial<IndividualFormData> = {}): IndividualFormData {
  return {
    givenName: 'إسماعيل',
    surname: '',
    sex: 'M',
    birthDate: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
    deathDate: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
    kunya: '', isDeceased: false, isPrivate: false, notes: '',
    ...overrides,
  };
}

const workspace = { workspaceId: 'ws-1', canEdit: true, refreshTree: vi.fn().mockResolvedValue(undefined) };

function ok(data: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve({ data }) } as unknown as Response;
}

const newUndoSpy = () => vi.fn<(entry: UndoEntry) => void>();

function renderActions(data: GedcomData, onPushUndo: Mock<(entry: UndoEntry) => void>) {
  return renderHook(() =>
    usePersonActions({
      personId: '@ADNAN@',
      workspace,
      person: data.individuals['@ADNAN@'],
      data,
      setSelectedPersonId: vi.fn(),
      onPushUndo,
    }),
  );
}

describe('«قفزة نسب» — the «شخص جديد» composite', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates the person, his couple and the jump, and pushes exactly ONE undo entry', async () => {
    mockApiFetch
      .mockResolvedValueOnce(ok({ id: 'new-ind' }))
      .mockResolvedValueOnce(ok({ id: 'new-fam' }))
      .mockResolvedValueOnce(ok({ id: 'new-jump' }));
    const onPushUndo = newUndoSpy();
    const { result } = renderActions(makeData(), onPushUndo);

    await act(async () => {
      await result.current.handleAncestryJumpSubmit({
        source: 'newPerson',
        individual: makeFormData(),
        generationsMin: 4,
        generationsMax: 40,
        notes: '',
      });
    });

    const urls = mockApiFetch.mock.calls.map((c) => c[0] as string);
    expect(urls).toEqual([
      '/api/workspaces/ws-1/tree/individuals',
      '/api/workspaces/ws-1/tree/families',
      '/api/workspaces/ws-1/tree/ancestry-jumps',
    ]);
    expect(onPushUndo).toHaveBeenCalledTimes(1);

    const jumpBody = JSON.parse(mockApiFetch.mock.calls[2][1].body as string);
    expect(jumpBody).toMatchObject({
      descendantId: '@ADNAN@',
      ancestorFamilyId: 'new-fam',
      generationsMin: 4,
      generationsMax: 40,
    });
  });

  it('undoes all three in reverse — jump, then couple, then person', async () => {
    mockApiFetch
      .mockResolvedValueOnce(ok({ id: 'new-ind' }))
      .mockResolvedValueOnce(ok({ id: 'new-fam' }))
      .mockResolvedValueOnce(ok({ id: 'new-jump' }));
    const onPushUndo = newUndoSpy();
    const { result } = renderActions(makeData(), onPushUndo);

    await act(async () => {
      await result.current.handleAncestryJumpSubmit({
        source: 'newPerson', individual: makeFormData(),
        generationsMin: null, generationsMax: null, notes: '',
      });
    });

    mockApiFetch.mockClear();
    mockApiFetch.mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve({}) } as unknown as Response);
    await act(async () => { await onPushUndo.mock.calls[0][0].undo(); });

    expect(mockApiFetch.mock.calls.map((c) => [c[1].method, c[0]])).toEqual([
      ['DELETE', '/api/workspaces/ws-1/tree/ancestry-jumps/new-jump'],
      ['DELETE', '/api/workspaces/ws-1/tree/families/new-fam'],
      ['DELETE', '/api/workspaces/ws-1/tree/individuals/new-ind'],
    ]);
  });

  it('mints a one-spouse couple for an existing ancestor who has no family', async () => {
    mockApiFetch
      .mockResolvedValueOnce(ok({ id: 'minted-fam' }))
      .mockResolvedValueOnce(ok({ id: 'new-jump' }));
    const onPushUndo = newUndoSpy();
    const { result } = renderActions(makeData(), onPushUndo);

    await act(async () => {
      await result.current.handleAncestryJumpSubmit({
        source: 'existingPerson', ancestorPersonId: '@QAHTAN@',
        generationsMin: null, generationsMax: null, notes: '',
      });
    });

    expect(JSON.parse(mockApiFetch.mock.calls[0][1].body as string)).toEqual({ husbandId: '@QAHTAN@' });
    expect(onPushUndo).toHaveBeenCalledTimes(1);
  });

  it('links an existing couple with a single call', async () => {
    mockApiFetch.mockResolvedValueOnce(ok({ id: 'new-jump' }));
    const onPushUndo = newUndoSpy();
    const { result } = renderActions(makeData(), onPushUndo);

    await act(async () => {
      await result.current.handleAncestryJumpSubmit({
        source: 'existingFamily', ancestorFamilyId: '@F-ISHMAEL@',
        generationsMin: null, generationsMax: null, notes: '',
      });
    });

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch.mock.calls[0][0]).toBe('/api/workspaces/ws-1/tree/ancestry-jumps');
    expect(onPushUndo).toHaveBeenCalledTimes(1);
  });

  it('does nothing at all for a borrowed person', async () => {
    const data = makeData({ adnan: { _pointed: true } });
    const onPushUndo = newUndoSpy();
    const { result } = renderActions(data, onPushUndo);

    await act(async () => {
      await result.current.handleAncestryJumpSubmit({
        source: 'existingFamily', ancestorFamilyId: '@F-ISHMAEL@',
        generationsMin: null, generationsMax: null, notes: '',
      });
    });

    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(onPushUndo).not.toHaveBeenCalled();
  });
});

describe('«قفزة نسب» — editing and deleting', () => {
  beforeEach(() => vi.clearAllMocks());

  it('patches only the range and notes, and pushes one undo entry', async () => {
    mockApiFetch.mockResolvedValue(ok({ id: JUMP.id }));
    const onPushUndo = newUndoSpy();
    const { result } = renderActions(withJump(), onPushUndo);

    await act(async () => {
      await result.current.handleAncestryJumpUpdate(JUMP.id, {
        generationsMin: 7, generationsMax: 7, notes: 'قيل سبعة.',
      });
    });

    expect(mockApiFetch.mock.calls[0][0]).toBe(`/api/workspaces/ws-1/tree/ancestry-jumps/${JUMP.id}`);
    expect(mockApiFetch.mock.calls[0][1].method).toBe('PATCH');
    expect(JSON.parse(mockApiFetch.mock.calls[0][1].body as string)).toEqual({
      generationsMin: 7, generationsMax: 7, notes: 'قيل سبعة.',
    });
    expect(onPushUndo).toHaveBeenCalledTimes(1);
  });

  it('deletes the jump row only — never the ancestor or his couple', async () => {
    mockApiFetch.mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve({}) } as unknown as Response);
    const onPushUndo = newUndoSpy();
    const { result } = renderActions(withJump(), onPushUndo);

    await act(async () => { await result.current.handleAncestryJumpDelete(JUMP.id); });

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch.mock.calls[0][0]).toBe(`/api/workspaces/ws-1/tree/ancestry-jumps/${JUMP.id}`);
    expect(mockApiFetch.mock.calls[0][1].method).toBe('DELETE');
    expect(onPushUndo).toHaveBeenCalledTimes(1);
  });
});

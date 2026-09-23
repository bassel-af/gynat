import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import type { AncestryJump, Family, GedcomData, Individual } from '@/lib/gedcom/types';
import type { IndividualFormData } from '@/components/tree/IndividualForm/IndividualForm';
import type { UndoEntry } from '@/lib/undo/types';

// ---------------------------------------------------------------------------
// «قفزة نسب» — adding a FATHER to a person who carries a jump (client side).
//
//   - «إضافة والد/والدة» on such a person opens an explanation dialog first:
//     «نقل القفزة إلى الأب الجديد» (primary) or «إلغاء»; the text says plainly
//     that adding a mother / removing the jump needs a manual delete first.
//   - The primary action opens the parent form LOCKED to male; its submit is
//     ONE call to the move route and ONE undo entry.
//   - «تعيين والدين موجودين» is refused before any API call.
// ---------------------------------------------------------------------------

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

let panelData: GedcomData;
vi.mock('@/context/TreeContext', () => ({
  useTree: () => ({
    data: panelData,
    selectedRootId: '@ISHMAEL@',
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
    canEdit: true,
    isAdmin: false,
    enableRadaa: false,
    enableAncestryJumps: false,
    refreshTree: vi.fn(),
    pointers: [],
  }),
  useWorkspaceTree: () => ({ workspaceId: 'ws-1', canEdit: true }),
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
import { buildUndoLabel } from '@/lib/tree/undo-label';
import { buildMoveJumpToNewFatherInverse } from '@/lib/tree/undo-builders';
import { AncestryJumpMoveDialog } from '@/components/tree/AncestryJumpMoveDialog';
import { JUMP_BLOCKS_PARENTS_MESSAGE } from '@/lib/tree/ancestry-jump-validators';
import { buildTreeData } from '@/components/tree/FamilyTree/buildTreeData';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

function ind(o: Partial<Individual> & { id: string }): Individual {
  return {
    type: 'INDI', name: o.id, givenName: o.id, surname: '', sex: 'M',
    birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
    death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
    notes: '', isDeceased: false, isPrivate: false, familiesAsSpouse: [], kunya: '',
    familyAsChild: null, ...o,
  };
}
const EV = { date: '', hijriDate: '', place: '', description: '', notes: '' };
function fam(o: Partial<Family> & { id: string }): Family {
  return { type: 'FAM', husband: null, wife: null, children: [], marriageContract: EV, marriage: EV, divorce: EV, isDivorced: false, ...o };
}

const JUMP: AncestryJump = {
  id: 'jump-1', type: '_ANC_JUMP', descendant: '@ADNAN@', ancestorFamily: '@F-ISHMAEL@',
  generationsMin: 5, generationsMax: 40, notes: '',
};

/** عدنان carries a jump to إسماعيل's couple; قحطان is a free-standing man in the tree. */
function withJump(): GedcomData {
  return {
    individuals: {
      '@ADNAN@': ind({ id: '@ADNAN@', name: 'عدنان', givenName: 'عدنان', ancestryJumpAsDescendant: JUMP.id }),
      '@ISHMAEL@': ind({ id: '@ISHMAEL@', name: 'إسماعيل', givenName: 'إسماعيل', familiesAsSpouse: ['@F-ISHMAEL@'] }),
      '@QAHTAN@': ind({ id: '@QAHTAN@', name: 'قحطان', givenName: 'قحطان' }),
    },
    families: {
      '@F-ISHMAEL@': fam({ id: '@F-ISHMAEL@', husband: '@ISHMAEL@', ancestryJumpsAsAncestor: [JUMP.id] }),
    },
    ancestryJumps: { [JUMP.id]: JUMP },
  };
}

function formData(o: Partial<IndividualFormData> = {}): IndividualFormData {
  return {
    givenName: 'محمد', surname: '', sex: 'M',
    birthDate: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
    deathDate: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
    kunya: '', isDeceased: false, isPrivate: false, notes: '', ...o,
  };
}

function ok(data: unknown, status = 200) {
  return { ok: true, status, json: () => Promise.resolve({ data }) } as unknown as Response;
}

const MOVE_RESULT = {
  individual: { id: 'F1' },
  family: { id: 'FAM1' },
  jump: { id: JUMP.id, generationsMin: 4, generationsMax: 39 },
};

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// Undo label + inverse
// ---------------------------------------------------------------------------

describe('undo label', () => {
  it('names the new father', () => {
    expect(buildUndoLabel({ kind: 'moveAncestryJumpToFather', name: 'محمد' })).toBe('نقل قفزة النسب إلى محمد');
  });
});

describe('buildMoveJumpToNewFatherInverse', () => {
  const inverse = () =>
    buildMoveJumpToNewFatherInverse({
      workspaceId: 'ws-1',
      jumpId: JUMP.id,
      fatherId: 'F1',
      familyId: 'FAM1',
      childId: '@ADNAN@',
      fatherPayload: { givenName: 'محمد', sex: 'M' },
      preMoveRange: { generationsMin: 5, generationsMax: 40 },
    });

  it('undo = ONE move-back call with the current ids and the pre-move range', async () => {
    mockApiFetch.mockResolvedValue(ok({}));
    await inverse().undo();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockApiFetch.mock.calls[0];
    expect(url).toBe(`/api/workspaces/ws-1/tree/ancestry-jumps/${JUMP.id}/move-back`);
    expect(JSON.parse(init.body)).toEqual({
      fatherId: 'F1', familyId: 'FAM1', childId: '@ADNAN@', generationsMin: 5, generationsMax: 40,
    });
    expect(init.isUndo).toBe(true);
  });

  it('redo = ONE move call with the saved father, then later undo targets the NEW ids', async () => {
    const inv = inverse();
    mockApiFetch.mockResolvedValueOnce(ok({ individual: { id: 'F2' }, family: { id: 'FAM2' } }, 201));
    await inv.redo();
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch.mock.calls[0][0]).toBe(`/api/workspaces/ws-1/tree/ancestry-jumps/${JUMP.id}/move-to-new-father`);
    expect(JSON.parse(mockApiFetch.mock.calls[0][1].body)).toEqual({ father: { givenName: 'محمد', sex: 'M' } });

    mockApiFetch.mockResolvedValueOnce(ok({}));
    await inv.undo();
    expect(JSON.parse(mockApiFetch.mock.calls[1][1].body)).toMatchObject({ fatherId: 'F2', familyId: 'FAM2' });
  });

  it('a refused undo throws (never silently succeeds)', async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 409, json: () => Promise.resolve({}) } as unknown as Response);
    await expect(inverse().undo()).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

const workspace = { workspaceId: 'ws-1', canEdit: true, refreshTree: vi.fn().mockResolvedValue(undefined) };

function renderActions(data: GedcomData, onPushUndo = vi.fn<(e: UndoEntry) => void>()) {
  const hook = renderHook(() =>
    usePersonActions({
      personId: '@ADNAN@',
      workspace,
      person: data.individuals['@ADNAN@'],
      data,
      setSelectedPersonId: vi.fn(),
      onPushUndo,
    }),
  );
  return { ...hook, onPushUndo };
}

describe('usePersonActions — add father with a jump', () => {
  it('submits ONE move call and pushes ONE undo entry labelled with the father', async () => {
    mockApiFetch.mockResolvedValueOnce(ok(MOVE_RESULT, 201));
    const { result, onPushUndo } = renderActions(withJump());
    act(() => result.current.setFormMode({ kind: 'addParent', lockedSex: 'M', moveJumpId: JUMP.id }));
    await act(async () => { await result.current.handleAddParentSubmit(formData()); });

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch.mock.calls[0][0]).toBe(`/api/workspaces/ws-1/tree/ancestry-jumps/${JUMP.id}/move-to-new-father`);
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body.father).toMatchObject({ givenName: 'محمد', sex: 'M' });
    expect(onPushUndo).toHaveBeenCalledTimes(1);
    expect(onPushUndo.mock.calls[0][0].label).toBe('نقل قفزة النسب إلى محمد');
    expect(result.current.formMode).toBeNull();
  });

  it('undo runs move-back ONCE; redo runs the move ONCE', async () => {
    mockApiFetch.mockResolvedValueOnce(ok(MOVE_RESULT, 201));
    const { result, onPushUndo } = renderActions(withJump());
    act(() => result.current.setFormMode({ kind: 'addParent', lockedSex: 'M', moveJumpId: JUMP.id }));
    await act(async () => { await result.current.handleAddParentSubmit(formData()); });
    const entry = onPushUndo.mock.calls[0][0];

    mockApiFetch.mockClear();
    mockApiFetch.mockResolvedValueOnce(ok({}));
    await entry.undo();
    expect(mockApiFetch.mock.calls.map((c) => c[0])).toEqual([
      `/api/workspaces/ws-1/tree/ancestry-jumps/${JUMP.id}/move-back`,
    ]);
    expect(JSON.parse(mockApiFetch.mock.calls[0][1].body)).toEqual({
      fatherId: 'F1', familyId: 'FAM1', childId: '@ADNAN@', generationsMin: 5, generationsMax: 40,
    });

    mockApiFetch.mockClear();
    mockApiFetch.mockResolvedValueOnce(ok(MOVE_RESULT, 201));
    await entry.redo();
    expect(mockApiFetch.mock.calls.map((c) => c[0])).toEqual([
      `/api/workspaces/ws-1/tree/ancestry-jumps/${JUMP.id}/move-to-new-father`,
    ]);
  });

  it('a refused move pushes no undo entry and shows the server message', async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: false, status: 409, json: () => Promise.resolve({ error: 'تغيّرت الشجرة' }),
    } as unknown as Response);
    const { result, onPushUndo } = renderActions(withJump());
    act(() => result.current.setFormMode({ kind: 'addParent', lockedSex: 'M', moveJumpId: JUMP.id }));
    await act(async () => { await result.current.handleAddParentSubmit(formData()); });
    expect(onPushUndo).not.toHaveBeenCalled();
    expect(result.current.formError).toBe('تغيّرت الشجرة');
  });

  it('«تعيين والدين موجودين» is refused before any API call', async () => {
    const { result } = renderActions(withJump());
    await act(async () => {
      await result.current.moveSubtree({ kind: 'individual', individualId: '@QAHTAN@', sex: 'M' } as never);
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(result.current.formError).toBe(JUMP_BLOCKS_PARENTS_MESSAGE);
  });
});

// ---------------------------------------------------------------------------
// The dialog
// ---------------------------------------------------------------------------

describe('AncestryJumpMoveDialog', () => {
  it('offers both actions and says how to add a mother / remove the jump instead', () => {
    render(
      <AncestryJumpMoveDialog personName="عدنان" ancestorName="إسماعيل" onMove={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'نقل القفزة إلى الأب الجديد' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'إلغاء' })).toBeTruthy();
    expect(document.body.textContent).toContain('إسماعيل');
    expect(document.body.textContent).toContain('احذف قفزة النسب يدويًا أولًا ثم أضف الأب');
  });
});

// ---------------------------------------------------------------------------
// The person panel
// ---------------------------------------------------------------------------

describe('PersonDetail — «إضافة والد/والدة» on a person with a jump', () => {
  const open = () => {
    panelData = withJump();
    render(<PersonDetail personId="@ADNAN@" />);
    fireEvent.click(screen.getByRole('button', { name: /إضافة والد\/والدة/ }));
  };

  it('opens the explanation dialog, not the form', () => {
    open();
    expect(screen.getByRole('button', { name: 'نقل القفزة إلى الأب الجديد' })).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: 'الجنس' })).toBeNull();
  });

  it('«إلغاء» closes it and opens nothing', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء' }));
    expect(screen.queryByRole('button', { name: 'نقل القفزة إلى الأب الجديد' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'الجنس' })).toBeNull();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('the primary action opens the parent form locked to male', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'نقل القفزة إلى الأب الجديد' }));
    const male = screen.getByLabelText('ذكر') as HTMLInputElement;
    const female = screen.getByLabelText('أنثى') as HTMLInputElement;
    expect(male.checked).toBe(true);
    expect(male.disabled).toBe(true);
    expect(female.disabled).toBe(true);
  });

  it('a person WITHOUT a jump still opens the form directly', () => {
    const data = withJump();
    delete data.individuals['@ADNAN@'].ancestryJumpAsDescendant;
    data.ancestryJumps = {};
    panelData = data;
    render(<PersonDetail personId="@ADNAN@" />);
    fireEvent.click(screen.getByRole('button', { name: /إضافة والد\/والدة/ }));
    expect(screen.queryByRole('button', { name: 'نقل القفزة إلى الأب الجديد' })).toBeNull();
    expect(screen.getByRole('radiogroup', { name: 'الجنس' })).toBeTruthy();
  });

  it('«تعيين والدين موجودين» shows the block message and calls nothing', () => {
    panelData = withJump();
    render(<PersonDetail personId="@ADNAN@" />);
    fireEvent.click(screen.getByRole('button', { name: /تعيين والدين موجودين/ }));
    expect(document.body.textContent).toContain(JUMP_BLOCKS_PARENTS_MESSAGE);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The canvas after a move
// ---------------------------------------------------------------------------

describe('canvas after a move', () => {
  it('the jump edge now lands on F, and F is P’s ordinary father', () => {
    const data = withJump();
    data.individuals['@ADNAN@'] = { ...data.individuals['@ADNAN@'], familyAsChild: '@F-NEW@', ancestryJumpAsDescendant: undefined };
    data.individuals['@F@'] = ind({ id: '@F@', name: 'محمد', givenName: 'محمد', familiesAsSpouse: ['@F-NEW@'], ancestryJumpAsDescendant: JUMP.id });
    data.families['@F-NEW@'] = fam({ id: '@F-NEW@', husband: '@F@', children: ['@ADNAN@'] });
    data.ancestryJumps = { [JUMP.id]: { ...JUMP, descendant: '@F@', generationsMin: 4, generationsMax: 39 } };

    const { edges } = buildTreeData(
      data, '@ISHMAEL@', 10, '',
      { ancestors: new Set<string>(), descendants: new Set<string>(), highlightedId: null },
      null,
      { onPersonClick: vi.fn(), onOpenSidebar: vi.fn(), onRerootToAncestor: vi.fn() },
    );
    const jumpEdges = edges.filter((e) => e.className === 'ancestry-jump');
    expect(jumpEdges).toHaveLength(1);
    expect(jumpEdges[0].source).toBe('@ISHMAEL@');
    expect(jumpEdges[0].target).toBe('@F@');
    expect(edges.some((e) => e.source === '@F@' && e.target === '@ADNAN@' && e.className !== 'ancestry-jump')).toBe(true);
  });
});

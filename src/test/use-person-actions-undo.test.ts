import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Individual, GedcomData, Family, FamilyEvent } from '@/lib/gedcom/types';
import type { IndividualFormData } from '@/components/tree/IndividualForm/IndividualForm';
import type { UndoEntry } from '@/lib/undo/types';

vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

import { usePersonActions } from '@/hooks/usePersonActions';
import { apiFetch } from '@/lib/api/client';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

function makeEmptyEvent(): FamilyEvent {
  return { date: '', hijriDate: '', place: '', description: '', notes: '' };
}

function makeIndividual(overrides: Partial<Individual> = {}): Individual {
  return {
    id: '@I1@',
    type: 'INDI',
    name: 'أحمد',
    givenName: 'أحمد',
    surname: 'السعيد',
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
    kunya: '',
    notes: '',
    isDeceased: false,
    isPrivate: false,
    familiesAsSpouse: [],
    familyAsChild: null,
    ...overrides,
  };
}

function makeFamily(overrides: Partial<Family> = {}): Family {
  return {
    id: '@F1@',
    type: 'FAM',
    husband: null,
    wife: null,
    children: [],
    marriageContract: makeEmptyEvent(),
    marriage: makeEmptyEvent(),
    divorce: makeEmptyEvent(),
    isDivorced: false,
    ...overrides,
  };
}

function makeFormData(overrides: Partial<IndividualFormData> = {}): IndividualFormData {
  return {
    givenName: 'أحمد',
    surname: 'السعيد',
    sex: 'M',
    birthDate: '',
    birthPlace: '',
    birthDescription: '',
    birthNotes: '',
    birthHijriDate: '',
    deathDate: '',
    deathPlace: '',
    deathDescription: '',
    deathNotes: '',
    deathHijriDate: '',
    isDeceased: false,
    isPrivate: false,
    notes: '',
    ...overrides,
  };
}

describe('usePersonActions — undo integration', () => {
  let refreshTree: ReturnType<typeof vi.fn>;
  let onPushUndo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockApiFetch.mockReset();
    refreshTree = vi.fn().mockResolvedValue(undefined);
    onPushUndo = vi.fn();
  });

  it('handleEditSubmit pushes undo entry with "تعديل: <name>" label after refresh success', async () => {
    mockApiFetch.mockResolvedValue(new Response('{}', { status: 200 }));
    const person = makeIndividual({ name: 'أحمد' });
    const data: GedcomData = { individuals: { '@I1@': person }, families: {} };
    const { result } = renderHook(() =>
      usePersonActions({
        personId: '@I1@',
        workspace: { workspaceId: 'ws-1', canEdit: true, refreshTree },
        person,
        data,
        setSelectedPersonId: vi.fn(),
        onPushUndo,
      }),
    );
    await act(async () => {
      await result.current.handleEditSubmit(makeFormData({ givenName: 'محمد' }));
    });
    expect(onPushUndo).toHaveBeenCalledOnce();
    const entry = onPushUndo.mock.calls[0][0] as UndoEntry;
    expect(entry.workspaceId).toBe('ws-1');
    expect(entry.label).toBe('تعديل: أحمد');
    expect(typeof entry.undo).toBe('function');
    expect(typeof entry.redo).toBe('function');
  });

  it('does NOT push when edit API call fails', async () => {
    mockApiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'bad' }), { status: 400 }),
    );
    const person = makeIndividual();
    const data: GedcomData = { individuals: { '@I1@': person }, families: {} };
    const { result } = renderHook(() =>
      usePersonActions({
        personId: '@I1@',
        workspace: { workspaceId: 'ws-1', canEdit: true, refreshTree },
        person,
        data,
        setSelectedPersonId: vi.fn(),
        onPushUndo,
      }),
    );
    await act(async () => {
      await result.current.handleEditSubmit(makeFormData({ givenName: 'X' }));
    });
    expect(onPushUndo).not.toHaveBeenCalled();
  });

  it('works without onPushUndo (hook is backward-compatible)', async () => {
    mockApiFetch.mockResolvedValue(new Response('{}', { status: 200 }));
    const person = makeIndividual();
    const data: GedcomData = { individuals: { '@I1@': person }, families: {} };
    const { result } = renderHook(() =>
      usePersonActions({
        personId: '@I1@',
        workspace: { workspaceId: 'ws-1', canEdit: true, refreshTree },
        person,
        data,
        setSelectedPersonId: vi.fn(),
      }),
    );
    await act(async () => {
      await result.current.handleEditSubmit(makeFormData());
    });
    // no crash, no assertions on onPushUndo (undefined)
    expect(refreshTree).toHaveBeenCalled();
  });

  it('handleAddChildSubmit pushes "إضافة ابن: <name>" undo entry; undo DELETEs the new individual', async () => {
    mockApiFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: '@I99@' } }), { status: 201 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const person = makeIndividual({
      name: 'الأب',
      sex: 'M',
      familiesAsSpouse: ['@F1@'],
    });
    const data: GedcomData = {
      individuals: { '@I1@': person },
      families: { '@F1@': makeFamily({ husband: '@I1@' }) },
    };
    const { result } = renderHook(() =>
      usePersonActions({
        personId: '@I1@',
        workspace: { workspaceId: 'ws-1', canEdit: true, refreshTree },
        person,
        data,
        setSelectedPersonId: vi.fn(),
        onPushUndo,
      }),
    );
    await act(async () => {
      await result.current.handleAddChildSubmit(makeFormData({ givenName: 'يوسف' }));
    });
    expect(onPushUndo).toHaveBeenCalledOnce();
    const entry = onPushUndo.mock.calls[0][0] as UndoEntry;
    expect(entry.label).toBe('إضافة ابن: يوسف');
    expect(entry.workspaceId).toBe('ws-1');
    mockApiFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await entry.undo();
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/api/workspaces/ws-1/tree/individuals/@I99@',
      expect.objectContaining({ method: 'DELETE', isUndo: true }),
    );
  });

  it('handleCascadeConfirm (simple-delete) pushes "حذف: <name>"; undo re-POSTs the individual', async () => {
    // 1st apiFetch = delete-impact (hasImpact false → simpleConfirm)
    mockApiFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { hasImpact: false } }), { status: 200 }))
      // 2nd apiFetch = DELETE individual
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const person = makeIndividual({ name: 'علي', givenName: 'علي' });
    const data: GedcomData = { individuals: { '@I1@': person }, families: {} };
    const { result } = renderHook(() =>
      usePersonActions({
        personId: '@I1@',
        workspace: { workspaceId: 'ws-1', canEdit: true, refreshTree },
        person,
        data,
        setSelectedPersonId: vi.fn(),
        onPushUndo,
      }),
    );
    await act(async () => {
      await result.current.handleDeleteClick();
    });
    // Now in simpleConfirm state — execute delete
    await act(async () => {
      await result.current.handleCascadeConfirm();
    });
    expect(onPushUndo).toHaveBeenCalledOnce();
    const entry = onPushUndo.mock.calls[0][0] as UndoEntry;
    expect(entry.label).toBe('حذف: علي');
    mockApiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { id: '@I99@' } }), { status: 201 }),
    );
    await entry.undo();
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/api/workspaces/ws-1/tree/individuals',
      expect.objectContaining({ method: 'POST', isUndo: true }),
    );
  });

  it('handleAddSpouseSubmit pushes "إضافة زوجة: <name>" (M subject) with undo that deletes the family and the new individual', async () => {
    // createIndividual → @I99@, createFamily → @F99@
    mockApiFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: '@I99@' } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: '@F99@' } }), { status: 201 }));
    const person = makeIndividual({ sex: 'M', name: 'الزوج' });
    const data: GedcomData = { individuals: { '@I1@': person }, families: {} };
    const { result } = renderHook(() =>
      usePersonActions({
        personId: '@I1@',
        workspace: { workspaceId: 'ws-1', canEdit: true, refreshTree },
        person,
        data,
        setSelectedPersonId: vi.fn(),
        onPushUndo,
      }),
    );
    await act(async () => {
      await result.current.handleAddSpouseSubmit(makeFormData({ givenName: 'فاطمة', sex: 'F' }));
    });
    expect(onPushUndo).toHaveBeenCalledOnce();
    const entry = onPushUndo.mock.calls[0][0] as UndoEntry;
    expect(entry.label).toBe('إضافة زوجة: فاطمة');
    // undo should DELETE the family first, then the individual
    mockApiFetch
      .mockResolvedValueOnce(new Response(null, { status: 204 }))  // DELETE family
      .mockResolvedValueOnce(new Response(null, { status: 204 })); // DELETE individual
    await entry.undo();
    const calls = mockApiFetch.mock.calls.slice(-2);
    expect(calls[0][0]).toBe('/api/workspaces/ws-1/tree/families/@F99@');
    expect(calls[0][1]).toMatchObject({ method: 'DELETE', isUndo: true });
    expect(calls[1][0]).toBe('/api/workspaces/ws-1/tree/individuals/@I99@');
    expect(calls[1][1]).toMatchObject({ method: 'DELETE', isUndo: true });
  });

  it('handleLinkExistingSpouse pushes "ربط زوجة: <name>"; undo DELETEs the new family', async () => {
    // createFamily → @F55@
    mockApiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { id: '@F55@' } }), { status: 201 }),
    );
    const existing = makeIndividual({ id: '@I2@', name: 'فاطمة', sex: 'F' });
    const person = makeIndividual({ sex: 'M', name: 'الزوج' });
    const data: GedcomData = {
      individuals: { '@I1@': person, '@I2@': existing },
      families: {},
    };
    const { result } = renderHook(() =>
      usePersonActions({
        personId: '@I1@',
        workspace: { workspaceId: 'ws-1', canEdit: true, refreshTree },
        person,
        data,
        setSelectedPersonId: vi.fn(),
        onPushUndo,
      }),
    );
    await act(async () => {
      await result.current.handleLinkExistingSpouse('@I2@');
    });
    expect(onPushUndo).toHaveBeenCalledOnce();
    const entry = onPushUndo.mock.calls[0][0] as UndoEntry;
    expect(entry.label).toBe('ربط زوجة: فاطمة');
    mockApiFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await entry.undo();
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/api/workspaces/ws-1/tree/families/@F55@',
      expect.objectContaining({ method: 'DELETE', isUndo: true }),
    );
  });

  it('handleAddParentSubmit (existing-family path) pushes "إضافة والد: <name>"; undo PATCHes family back', async () => {
    // createIndividual → @I99@; patchFamily → 200
    mockApiFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: '@I99@' } }), { status: 201 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const child = makeIndividual({ id: '@I1@', name: 'الطفل', familyAsChild: '@F1@' });
    const data: GedcomData = {
      individuals: { '@I1@': child },
      families: { '@F1@': makeFamily({ wife: '@I2@', children: ['@I1@'] }) },
    };
    const { result } = renderHook(() =>
      usePersonActions({
        personId: '@I1@',
        workspace: { workspaceId: 'ws-1', canEdit: true, refreshTree },
        person: child,
        data,
        setSelectedPersonId: vi.fn(),
        onPushUndo,
      }),
    );
    await act(async () => {
      await result.current.handleAddParentSubmit(makeFormData({ givenName: 'محمد', sex: 'M' }));
    });
    expect(onPushUndo).toHaveBeenCalledOnce();
    const entry = onPushUndo.mock.calls[0][0] as UndoEntry;
    expect(entry.label).toBe('إضافة والد: محمد');
    // undo: PATCH family reverting husbandId to null, then DELETE the new individual
    mockApiFetch
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))  // PATCH family
      .mockResolvedValueOnce(new Response(null, { status: 204 })); // DELETE individual
    await entry.undo();
    const lastTwo = mockApiFetch.mock.calls.slice(-2);
    expect(lastTwo[0][0]).toBe('/api/workspaces/ws-1/tree/families/@F1@');
    expect(lastTwo[0][1]).toMatchObject({
      method: 'PATCH',
      isUndo: true,
      body: JSON.stringify({ husbandId: null }),
    });
    expect(lastTwo[1][0]).toBe('/api/workspaces/ws-1/tree/individuals/@I99@');
    expect(lastTwo[1][1]).toMatchObject({ method: 'DELETE', isUndo: true });
  });

  it('handleAddSiblingSubmit pushes "إضافة ابن: <name>"; undo DELETEs the new individual', async () => {
    mockApiFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: '@I99@' } }), { status: 201 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const person = makeIndividual({ familyAsChild: '@F1@' });
    const data: GedcomData = {
      individuals: { '@I1@': person },
      families: { '@F1@': makeFamily({ children: ['@I1@'] }) },
    };
    const { result } = renderHook(() =>
      usePersonActions({
        personId: '@I1@',
        workspace: { workspaceId: 'ws-1', canEdit: true, refreshTree },
        person,
        data,
        setSelectedPersonId: vi.fn(),
        onPushUndo,
      }),
    );
    act(() => { result.current.setFormMode({ kind: 'addSibling', targetFamilyId: '@F1@' }); });
    await act(async () => {
      await result.current.handleAddSiblingSubmit(makeFormData({ givenName: 'خالد' }));
    });
    expect(onPushUndo).toHaveBeenCalledOnce();
    const entry = onPushUndo.mock.calls[0][0] as UndoEntry;
    expect(entry.label).toBe('إضافة ابن: خالد');
    mockApiFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await entry.undo();
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/api/workspaces/ws-1/tree/individuals/@I99@',
      expect.objectContaining({ method: 'DELETE', isUndo: true }),
    );
  });

  it('handleFamilyEventSubmit pushes "تعديل زواج"; undo PATCHes family back to prior event fields', async () => {
    mockApiFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const person = makeIndividual({ familiesAsSpouse: ['@F1@'] });
    const data: GedcomData = {
      individuals: { '@I1@': person },
      families: { '@F1@': makeFamily({ husband: '@I1@' }) },
    };
    const { result } = renderHook(() =>
      usePersonActions({
        personId: '@I1@',
        workspace: { workspaceId: 'ws-1', canEdit: true, refreshTree },
        person,
        data,
        setSelectedPersonId: vi.fn(),
        onPushUndo,
      }),
    );
    act(() => { result.current.setFormMode({ kind: 'editFamilyEvent', familyId: '@F1@' }); });
    await act(async () => {
      await result.current.handleFamilyEventSubmit({
        isUmmWalad: false,
        marriageContractDate: '',
        marriageContractHijriDate: '',
        marriageContractPlace: '',
        marriageContractPlaceId: null,
        marriageContractDescription: '',
        marriageContractNotes: '',
        marriageDate: '2000-01-01',
        marriageHijriDate: '',
        marriagePlace: 'Damascus',
        marriagePlaceId: null,
        marriageDescription: '',
        marriageNotes: '',
        isDivorced: false,
        divorceDate: '',
        divorceHijriDate: '',
        divorcePlace: '',
        divorcePlaceId: null,
        divorceDescription: '',
        divorceNotes: '',
      });
    });
    expect(onPushUndo).toHaveBeenCalledOnce();
    const entry = onPushUndo.mock.calls[0][0] as UndoEntry;
    expect(entry.label).toBe('تعديل زواج');
    mockApiFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await entry.undo();
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/api/workspaces/ws-1/tree/families/@F1@',
      expect.objectContaining({ method: 'PATCH', isUndo: true }),
    );
  });

  it('unlinkSpouse (childless family) pushes "فصل الزوجة"; undo re-POSTs the family', async () => {
    mockApiFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const person = makeIndividual({ sex: 'M', familiesAsSpouse: ['@F1@'] });
    const data: GedcomData = {
      individuals: { '@I1@': person, '@I2@': makeIndividual({ id: '@I2@', sex: 'F' }) },
      families: { '@F1@': makeFamily({ husband: '@I1@', wife: '@I2@' }) },
    };
    const { result } = renderHook(() =>
      usePersonActions({
        personId: '@I1@',
        workspace: { workspaceId: 'ws-1', canEdit: true, refreshTree },
        person,
        data,
        setSelectedPersonId: vi.fn(),
        onPushUndo,
      }),
    );
    await act(async () => {
      await result.current.unlinkSpouse('@F1@');
    });
    expect(onPushUndo).toHaveBeenCalledOnce();
    const entry = onPushUndo.mock.calls[0][0] as UndoEntry;
    // subject is male, so the spouse removed is the wife → "فصل الزوجة"
    expect(entry.label).toBe('فصل الزوجة');
    mockApiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { id: '@F7@' } }), { status: 201 }),
    );
    await entry.undo();
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/api/workspaces/ws-1/tree/families',
      expect.objectContaining({ method: 'POST', isUndo: true }),
    );
  });

  it('unlinkSpouse (family-with-children) PATCHes clearing slot; undo PATCHes the slot back', async () => {
    mockApiFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const person = makeIndividual({ sex: 'F', familiesAsSpouse: ['@F1@'] });
    const data: GedcomData = {
      individuals: { '@I1@': person },
      families: { '@F1@': makeFamily({ husband: '@I2@', wife: '@I1@', children: ['@I3@'] }) },
    };
    const { result } = renderHook(() =>
      usePersonActions({
        personId: '@I1@',
        workspace: { workspaceId: 'ws-1', canEdit: true, refreshTree },
        person,
        data,
        setSelectedPersonId: vi.fn(),
        onPushUndo,
      }),
    );
    await act(async () => {
      await result.current.unlinkSpouse('@F1@');
    });
    expect(onPushUndo).toHaveBeenCalledOnce();
    const entry = onPushUndo.mock.calls[0][0] as UndoEntry;
    // subject is female; removed spouse slot is the wife → "فصل الزوج"
    expect(entry.label).toBe('فصل الزوج');
    mockApiFetch.mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await entry.undo();
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/api/workspaces/ws-1/tree/families/@F1@',
      expect.objectContaining({
        method: 'PATCH',
        isUndo: true,
        body: JSON.stringify({ wifeId: '@I1@' }),
      }),
    );
  });

  it('handleRadaaSubmit (create) pushes "إضافة أسرة رضاعة"; undo DELETEs the rada family', async () => {
    mockApiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { id: '@R99@' } }), { status: 201 }),
    );
    const person = makeIndividual();
    const data: GedcomData = { individuals: { '@I1@': person }, families: {} };
    const { result } = renderHook(() =>
      usePersonActions({
        personId: '@I1@',
        workspace: { workspaceId: 'ws-1', canEdit: true, refreshTree },
        person,
        data,
        setSelectedPersonId: vi.fn(),
        onPushUndo,
      }),
    );
    act(() => { result.current.setFormMode({ kind: 'addRadaa' }); });
    await act(async () => {
      await result.current.handleRadaaSubmit({
        fosterFatherId: '@I2@',
        fosterMotherId: null,
        childrenIds: ['@I1@'],
        notes: '',
      });
    });
    expect(onPushUndo).toHaveBeenCalledOnce();
    const entry = onPushUndo.mock.calls[0][0] as UndoEntry;
    expect(entry.label).toBe('إضافة أسرة رضاعة');
    mockApiFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await entry.undo();
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/api/workspaces/ws-1/tree/rada-families/@R99@',
      expect.objectContaining({ method: 'DELETE', isUndo: true }),
    );
  });

  it('handleRadaaDelete pushes "حذف أسرة رضاعة"; undo re-POSTs', async () => {
    mockApiFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const person = makeIndividual();
    const data: GedcomData = {
      individuals: { '@I1@': person },
      families: {},
      radaFamilies: {
        '@R1@': {
          id: '@R1@',
          type: '_RADA_FAM',
          fosterFather: '@I2@',
          fosterMother: null,
          children: ['@I1@'],
          notes: '',
        },
      },
    };
    const { result } = renderHook(() =>
      usePersonActions({
        personId: '@I1@',
        workspace: { workspaceId: 'ws-1', canEdit: true, refreshTree },
        person,
        data,
        setSelectedPersonId: vi.fn(),
        onPushUndo,
      }),
    );
    await act(async () => {
      await result.current.handleRadaaDelete('@R1@');
    });
    expect(onPushUndo).toHaveBeenCalledOnce();
    const entry = onPushUndo.mock.calls[0][0] as UndoEntry;
    expect(entry.label).toBe('حذف أسرة رضاعة');
    mockApiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { id: '@R7@' } }), { status: 201 }),
    );
    await entry.undo();
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/api/workspaces/ws-1/tree/rada-families',
      expect.objectContaining({ method: 'POST', isUndo: true }),
    );
  });

  it('moveSubtree pushes "نقل ابن: <name>" undo entry on success', async () => {
    mockApiFetch.mockResolvedValue(new Response('{}', { status: 200 }));
    const person = makeIndividual({
      name: 'يوسف',
      familyAsChild: '@F1@',
    });
    const data: GedcomData = {
      individuals: { '@I1@': person },
      families: { '@F1@': makeFamily({ children: ['@I1@'] }) },
    };
    const { result } = renderHook(() =>
      usePersonActions({
        personId: '@I1@',
        workspace: { workspaceId: 'ws-1', canEdit: true, refreshTree },
        person,
        data,
        setSelectedPersonId: vi.fn(),
        onPushUndo,
      }),
    );
    await act(async () => {
      await result.current.moveSubtree('@F2@');
    });
    expect(onPushUndo).toHaveBeenCalledOnce();
    const entry = onPushUndo.mock.calls[0][0] as UndoEntry;
    expect(entry.label).toBe('نقل ابن: يوسف');
  });
});

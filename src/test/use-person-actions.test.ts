import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Individual, GedcomData, FamilyEvent } from '@/lib/gedcom/types';
import type { IndividualFormData } from '@/components/tree/IndividualForm/IndividualForm';
import type { FamilyEventFormData } from '@/components/tree/FamilyEventForm/FamilyEventForm';

// Mock apiFetch — must be before importing the hook
vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

import { usePersonActions } from '@/hooks/usePersonActions';
import { apiFetch } from '@/lib/api/client';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmptyEvent(): FamilyEvent {
  return { date: '', hijriDate: '', place: '', description: '', notes: '' };
}

function makeIndividual(overrides: Partial<Individual> = {}): Individual {
  return {
    id: '@I1@',
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
    familyAsChild: null,
    ...overrides,
  };
}

function makeGedcomData(
  individuals: Record<string, Individual> = {},
  families: GedcomData['families'] = {},
): GedcomData {
  return { individuals, families };
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

function makeFamilyEventFormData(overrides: Partial<FamilyEventFormData> = {}): FamilyEventFormData {
  return {
    marriageContractDate: '',
    marriageContractHijriDate: '',
    marriageContractPlace: '',
    marriageContractDescription: '',
    marriageContractNotes: '',
    marriageDate: '',
    marriageHijriDate: '',
    marriagePlace: '',
    marriageDescription: '',
    marriageNotes: '',
    isDivorced: false,
    divorceDate: '',
    divorceHijriDate: '',
    divorcePlace: '',
    divorceDescription: '',
    divorceNotes: '',
    ...overrides,
  };
}

const mockWorkspace = {
  workspaceId: 'ws-123',
  canEdit: true,
  refreshTree: vi.fn().mockResolvedValue(undefined),
};

const mockSetSelectedPersonId = vi.fn();

function okResponse(data: unknown) {
  return { ok: true, json: () => Promise.resolve({ data }) } as unknown as Response;
}

function errorResponse(error: string, status = 400) {
  return { ok: false, status, json: () => Promise.resolve({ error }) } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePersonActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  it('returns initial state with no form mode and no loading', () => {
    const person = makeIndividual();
    const data = makeGedcomData({ [person.id]: person });

    const { result } = renderHook(() =>
      usePersonActions({
        personId: person.id,
        workspace: mockWorkspace,
        person,
        data,
        setSelectedPersonId: mockSetSelectedPersonId,
      }),
    );

    expect(result.current.formMode).toBeNull();
    expect(result.current.formLoading).toBe(false);
    expect(result.current.formError).toBe('');
    expect(result.current.deleteConfirm).toBe(false);
    expect(result.current.deleteLoading).toBe(false);
  });

  // -----------------------------------------------------------------------
  // handleEditSubmit
  // -----------------------------------------------------------------------

  it('handleEditSubmit patches the individual and refreshes tree', async () => {
    const person = makeIndividual();
    const data = makeGedcomData({ [person.id]: person });
    mockApiFetch.mockResolvedValueOnce(okResponse(undefined));

    const { result } = renderHook(() =>
      usePersonActions({
        personId: person.id,
        workspace: mockWorkspace,
        person,
        data,
        setSelectedPersonId: mockSetSelectedPersonId,
      }),
    );

    // Set form mode to 'edit' first
    act(() => {
      result.current.setFormMode({ kind: 'edit' });
    });

    const formData = makeFormData({ givenName: 'محمد' });

    await act(async () => {
      await result.current.handleEditSubmit(formData);
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/workspaces/ws-123/tree/individuals/@I1@',
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(mockWorkspace.refreshTree).toHaveBeenCalled();
    expect(result.current.formMode).toBeNull();
    expect(result.current.formLoading).toBe(false);
  });

  it('handleEditSubmit sets formError on API failure', async () => {
    const person = makeIndividual();
    const data = makeGedcomData({ [person.id]: person });
    mockApiFetch.mockResolvedValueOnce(errorResponse('خطأ في البيانات'));

    const { result } = renderHook(() =>
      usePersonActions({
        personId: person.id,
        workspace: mockWorkspace,
        person,
        data,
        setSelectedPersonId: mockSetSelectedPersonId,
      }),
    );

    await act(async () => {
      await result.current.handleEditSubmit(makeFormData());
    });

    expect(result.current.formError).toBe('خطأ في البيانات');
    expect(result.current.formLoading).toBe(false);
  });

  // -----------------------------------------------------------------------
  // handleAddChildSubmit
  // -----------------------------------------------------------------------

  it('handleAddChildSubmit creates individual and adds to existing family', async () => {
    const person = makeIndividual({ familiesAsSpouse: ['@F1@'] });
    const data = makeGedcomData(
      { [person.id]: person },
      {
        '@F1@': {
          id: '@F1@', type: 'FAM', husband: '@I1@', wife: null, children: [],
          marriageContract: makeEmptyEvent(), marriage: makeEmptyEvent(),
          divorce: makeEmptyEvent(), isDivorced: false,
        },
      },
    );

    // First call: create individual; second call: add child to family
    mockApiFetch
      .mockResolvedValueOnce(okResponse({ id: '@I99@' }))
      .mockResolvedValueOnce(okResponse(undefined));

    const { result } = renderHook(() =>
      usePersonActions({
        personId: person.id,
        workspace: mockWorkspace,
        person,
        data,
        setSelectedPersonId: mockSetSelectedPersonId,
      }),
    );

    // Set form mode to addChild
    act(() => {
      result.current.setFormMode({ kind: 'addChild' });
    });

    await act(async () => {
      await result.current.handleAddChildSubmit(makeFormData());
    });

    // Should have created individual then added to family
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(mockApiFetch).toHaveBeenNthCalledWith(
      1,
      '/api/workspaces/ws-123/tree/individuals',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(mockApiFetch).toHaveBeenNthCalledWith(
      2,
      '/api/workspaces/ws-123/tree/families/@F1@/children',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.current.formMode).toBeNull();
  });

  it('handleAddChildSubmit creates family when person has no families', async () => {
    const person = makeIndividual({ sex: 'M', familiesAsSpouse: [] });
    const data = makeGedcomData({ [person.id]: person });

    // First: create individual; second: create family
    mockApiFetch
      .mockResolvedValueOnce(okResponse({ id: '@I99@' }))
      .mockResolvedValueOnce(okResponse({ id: '@F99@' }));

    const { result } = renderHook(() =>
      usePersonActions({
        personId: person.id,
        workspace: mockWorkspace,
        person,
        data,
        setSelectedPersonId: mockSetSelectedPersonId,
      }),
    );

    act(() => {
      result.current.setFormMode({ kind: 'addChild' });
    });

    await act(async () => {
      await result.current.handleAddChildSubmit(makeFormData());
    });

    // Second call should be create family with husbandId and childrenIds
    const secondCallBody = JSON.parse(
      (mockApiFetch.mock.calls[1][1] as RequestInit).body as string,
    );
    expect(secondCallBody).toEqual({
      husbandId: '@I1@',
      childrenIds: ['@I99@'],
    });
  });

  // -----------------------------------------------------------------------
  // handleAddSpouseSubmit
  // -----------------------------------------------------------------------

  it('handleAddSpouseSubmit creates individual, family, and opens family event form', async () => {
    const person = makeIndividual({ sex: 'M' });
    const data = makeGedcomData({ [person.id]: person });

    // Create individual, create family
    mockApiFetch
      .mockResolvedValueOnce(okResponse({ id: '@I99@' }))
      .mockResolvedValueOnce(okResponse({ id: '@F99@' }));

    const { result } = renderHook(() =>
      usePersonActions({
        personId: person.id,
        workspace: mockWorkspace,
        person,
        data,
        setSelectedPersonId: mockSetSelectedPersonId,
      }),
    );

    await act(async () => {
      await result.current.handleAddSpouseSubmit(makeFormData({ sex: 'F' }));
    });

    // Should transition to editFamilyEvent mode with the new family ID
    expect(result.current.formMode).toEqual({
      kind: 'editFamilyEvent',
      familyId: '@F99@',
    });
    expect(mockWorkspace.refreshTree).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // handleAddParentSubmit
  // -----------------------------------------------------------------------

  it('handleAddParentSubmit creates individual and new family when no familyAsChild', async () => {
    const person = makeIndividual({ familyAsChild: null });
    const data = makeGedcomData({ [person.id]: person });

    mockApiFetch
      .mockResolvedValueOnce(okResponse({ id: '@I99@' }))
      .mockResolvedValueOnce(okResponse({ id: '@F99@' }));

    const { result } = renderHook(() =>
      usePersonActions({
        personId: person.id,
        workspace: mockWorkspace,
        person,
        data,
        setSelectedPersonId: mockSetSelectedPersonId,
      }),
    );

    await act(async () => {
      await result.current.handleAddParentSubmit(makeFormData({ sex: 'M' }));
    });

    // Second call is create family with husbandId + childrenIds
    const secondCallBody = JSON.parse(
      (mockApiFetch.mock.calls[1][1] as RequestInit).body as string,
    );
    expect(secondCallBody).toEqual({
      husbandId: '@I99@',
      childrenIds: ['@I1@'],
    });
    expect(result.current.formMode).toBeNull();
  });

  it('handleAddParentSubmit patches existing family when familyAsChild exists', async () => {
    const person = makeIndividual({ familyAsChild: '@F1@' });
    const data = makeGedcomData(
      { [person.id]: person },
      {
        '@F1@': {
          id: '@F1@', type: 'FAM', husband: '@I2@', wife: null, children: ['@I1@'],
          marriageContract: makeEmptyEvent(), marriage: makeEmptyEvent(),
          divorce: makeEmptyEvent(), isDivorced: false,
        },
      },
    );

    mockApiFetch
      .mockResolvedValueOnce(okResponse({ id: '@I99@' }))
      .mockResolvedValueOnce(okResponse(undefined));

    const { result } = renderHook(() =>
      usePersonActions({
        personId: person.id,
        workspace: mockWorkspace,
        person,
        data,
        setSelectedPersonId: mockSetSelectedPersonId,
      }),
    );

    await act(async () => {
      await result.current.handleAddParentSubmit(makeFormData({ sex: 'F' }));
    });

    // Second call patches existing family with wifeId
    expect(mockApiFetch).toHaveBeenNthCalledWith(
      2,
      '/api/workspaces/ws-123/tree/families/@F1@',
      expect.objectContaining({ method: 'PATCH' }),
    );
    const secondCallBody = JSON.parse(
      (mockApiFetch.mock.calls[1][1] as RequestInit).body as string,
    );
    expect(secondCallBody).toEqual({ wifeId: '@I99@' });
  });

  // -----------------------------------------------------------------------
  // handleFamilyEventSubmit
  // -----------------------------------------------------------------------

  it('handleFamilyEventSubmit patches family with event data', async () => {
    const person = makeIndividual({ familiesAsSpouse: ['@F1@'] });
    const data = makeGedcomData(
      { [person.id]: person },
      {
        '@F1@': {
          id: '@F1@', type: 'FAM', husband: '@I1@', wife: null, children: [],
          marriageContract: makeEmptyEvent(), marriage: makeEmptyEvent(),
          divorce: makeEmptyEvent(), isDivorced: false,
        },
      },
    );

    mockApiFetch.mockResolvedValueOnce(okResponse(undefined));

    const { result } = renderHook(() =>
      usePersonActions({
        personId: person.id,
        workspace: mockWorkspace,
        person,
        data,
        setSelectedPersonId: mockSetSelectedPersonId,
      }),
    );

    // Must be in editFamilyEvent mode
    act(() => {
      result.current.setFormMode({ kind: 'editFamilyEvent', familyId: '@F1@' });
    });

    const eventData = makeFamilyEventFormData({ marriageDate: '1990-01-01' });
    await act(async () => {
      await result.current.handleFamilyEventSubmit(eventData);
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/workspaces/ws-123/tree/families/@F1@',
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(result.current.formMode).toBeNull();
  });

  it('handleFamilyEventSubmit does nothing when not in editFamilyEvent mode', async () => {
    const person = makeIndividual();
    const data = makeGedcomData({ [person.id]: person });

    const { result } = renderHook(() =>
      usePersonActions({
        personId: person.id,
        workspace: mockWorkspace,
        person,
        data,
        setSelectedPersonId: mockSetSelectedPersonId,
      }),
    );

    await act(async () => {
      await result.current.handleFamilyEventSubmit(makeFamilyEventFormData());
    });

    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // handleDelete
  // -----------------------------------------------------------------------

  it('handleDelete deletes individual and clears selection', async () => {
    const person = makeIndividual();
    const data = makeGedcomData({ [person.id]: person });

    mockApiFetch.mockResolvedValueOnce({ ok: true, status: 204 } as Response);

    const { result } = renderHook(() =>
      usePersonActions({
        personId: person.id,
        workspace: mockWorkspace,
        person,
        data,
        setSelectedPersonId: mockSetSelectedPersonId,
      }),
    );

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/workspaces/ws-123/tree/individuals/@I1@',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(mockSetSelectedPersonId).toHaveBeenCalledWith(null);
    expect(mockWorkspace.refreshTree).toHaveBeenCalled();
  });

  it('handleDelete resets deleteConfirm on error', async () => {
    const person = makeIndividual();
    const data = makeGedcomData({ [person.id]: person });

    mockApiFetch.mockRejectedValueOnce(new Error('network error'));

    const { result } = renderHook(() =>
      usePersonActions({
        personId: person.id,
        workspace: mockWorkspace,
        person,
        data,
        setSelectedPersonId: mockSetSelectedPersonId,
      }),
    );

    // Set deleteConfirm to true first
    act(() => {
      result.current.setDeleteConfirm(true);
    });
    expect(result.current.deleteConfirm).toBe(true);

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(result.current.deleteConfirm).toBe(false);
    expect(result.current.deleteLoading).toBe(false);
  });

  // -----------------------------------------------------------------------
  // moveChild
  // -----------------------------------------------------------------------

  it('moveChild calls move API and refreshes tree', async () => {
    const person = makeIndividual({ familyAsChild: '@F1@' });
    const data = makeGedcomData(
      { [person.id]: person },
      {
        '@F1@': {
          id: '@F1@', type: 'FAM', husband: '@I2@', wife: null, children: ['@I1@'],
          marriageContract: makeEmptyEvent(), marriage: makeEmptyEvent(),
          divorce: makeEmptyEvent(), isDivorced: false,
        },
      },
    );

    mockApiFetch.mockResolvedValueOnce(okResponse(undefined));

    const { result } = renderHook(() =>
      usePersonActions({
        personId: person.id,
        workspace: mockWorkspace,
        person,
        data,
        setSelectedPersonId: mockSetSelectedPersonId,
      }),
    );

    await act(async () => {
      await result.current.moveChild('@F2@');
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/workspaces/ws-123/tree/families/@F1@/children/@I1@/move',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ targetFamilyId: '@F2@' }),
      }),
    );
    expect(mockWorkspace.refreshTree).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // No workspace
  // -----------------------------------------------------------------------

  it('does nothing when workspace is null', async () => {
    const person = makeIndividual();
    const data = makeGedcomData({ [person.id]: person });

    const { result } = renderHook(() =>
      usePersonActions({
        personId: person.id,
        workspace: null,
        person,
        data,
        setSelectedPersonId: mockSetSelectedPersonId,
      }),
    );

    await act(async () => {
      await result.current.handleEditSubmit(makeFormData());
    });

    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

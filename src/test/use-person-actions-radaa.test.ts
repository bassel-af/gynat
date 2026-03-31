import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Individual, GedcomData, FamilyEvent } from '@/lib/gedcom/types';

// Mock apiFetch
vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

import { usePersonActions } from '@/hooks/usePersonActions';
import { apiFetch } from '@/lib/api/client';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const mockWorkspace = {
  workspaceId: 'ws-123',
  canEdit: true,
  refreshTree: vi.fn().mockResolvedValue(undefined),
};

const mockSetSelectedPersonId = vi.fn();

function okResponse(data: unknown) {
  return { ok: true, json: () => Promise.resolve({ data }) } as unknown as Response;
}

function errorResponse(error: string) {
  return { ok: false, status: 400, json: () => Promise.resolve({ error }) } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Tests — Rada'a extensions
// ---------------------------------------------------------------------------

describe('usePersonActions — rada\'a', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets addRadaa form mode', () => {
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

    act(() => {
      result.current.setFormMode({ kind: 'addRadaa' });
    });

    expect(result.current.formMode).toEqual({ kind: 'addRadaa' });
  });

  it('sets editRadaa form mode with radaFamilyId', () => {
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

    act(() => {
      result.current.setFormMode({ kind: 'editRadaa', radaFamilyId: 'rf-1' });
    });

    expect(result.current.formMode).toEqual({ kind: 'editRadaa', radaFamilyId: 'rf-1' });
  });

  it('handleRadaaSubmit POSTs to rada-families endpoint in create mode', async () => {
    mockApiFetch.mockResolvedValueOnce(okResponse({ id: 'rf-new' }));

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

    act(() => {
      result.current.setFormMode({ kind: 'addRadaa' });
    });

    await act(async () => {
      await result.current.handleRadaaSubmit({
        fosterMotherId: '@I2@',
        fosterFatherId: null,
        childrenIds: ['@I1@'],
        notes: '',
      });
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/workspaces/ws-123/tree/rada-families',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(mockWorkspace.refreshTree).toHaveBeenCalled();
    expect(result.current.formMode).toBeNull();
  });

  it('handleRadaaSubmit PATCHes in edit mode', async () => {
    mockApiFetch.mockResolvedValueOnce(okResponse({}));

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

    act(() => {
      result.current.setFormMode({ kind: 'editRadaa', radaFamilyId: 'rf-1' });
    });

    await act(async () => {
      await result.current.handleRadaaSubmit({
        fosterMotherId: '@I2@',
        fosterFatherId: null,
        childrenIds: ['@I1@'],
        notes: 'ملاحظة',
      });
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/workspaces/ws-123/tree/rada-families/rf-1',
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(mockWorkspace.refreshTree).toHaveBeenCalled();
  });

  it('handleRadaaDelete calls DELETE and refreshes tree', async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: true, status: 204 } as unknown as Response);

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
      await result.current.handleRadaaDelete('rf-1');
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/workspaces/ws-123/tree/rada-families/rf-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(mockWorkspace.refreshTree).toHaveBeenCalled();
  });

  it('handleRadaaSubmit sets error on API failure', async () => {
    mockApiFetch.mockResolvedValueOnce(errorResponse('خطأ في الإدخال'));

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

    act(() => {
      result.current.setFormMode({ kind: 'addRadaa' });
    });

    await act(async () => {
      await result.current.handleRadaaSubmit({
        fosterMotherId: null,
        fosterFatherId: null,
        childrenIds: ['@I1@'],
        notes: 'test',
      });
    });

    expect(result.current.formError).toBe('خطأ في الإدخال');
    // formMode should still be set (not cleared on error)
    expect(result.current.formMode).not.toBeNull();
  });

  it('blocks addRadaa for pointed individuals', () => {
    const person = makeIndividual({ _pointed: true });
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

    act(() => {
      result.current.setFormMode({ kind: 'addRadaa' });
    });

    // Pointed guard prevents setting form mode
    expect(result.current.formMode).toBeNull();
  });
});

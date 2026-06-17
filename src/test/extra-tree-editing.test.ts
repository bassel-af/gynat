/**
 * Collections Chunk 2 — Slice B (UI wiring) tests.
 *
 * Covers the behavior that can break when threading an optional `treeId`
 * through the member tree editor so the same editor can mutate an `extra`
 * tree by id:
 *   1. useWorkspaceTreeData appends `?treeId=` to the GET fetch when an
 *      active tree id is set, and omits it for the default (main) tree.
 *   2. usePersonActions includes `treeId` in mutation bodies when an extra
 *      tree is active, and omits it for the main tree.
 *   3. undo-builders include `treeId` in the mutation bodies they build.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Individual, GedcomData, FamilyEvent } from '@/lib/gedcom/types';
import type { IndividualFormData } from '@/components/tree/IndividualForm/IndividualForm';

vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

// TreeContext is consumed by useWorkspaceTreeData via useTree(); stub it so the
// hook can run outside a provider.
const setData = vi.fn();
const setError = vi.fn();
vi.mock('@/context/TreeContext', () => ({
  useTree: () => ({ setData, setError }),
}));

import { apiFetch } from '@/lib/api/client';
import { useWorkspaceTreeData } from '@/hooks/useWorkspaceTreeData';
import { usePersonActions } from '@/hooks/usePersonActions';
import { buildUpdateIndividualInverse, buildCreateIndividualInverse } from '@/lib/tree/undo-builders';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

function okResponse(data: unknown) {
  return { ok: true, json: () => Promise.resolve({ data }) } as unknown as Response;
}

function treeResponse() {
  return {
    ok: true,
    json: () => Promise.resolve({ data: { individuals: {}, families: {} } }),
  } as unknown as Response;
}

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
    kunya: '',
    familyAsChild: null,
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
    kunya: '',
    isDeceased: false,
    isPrivate: false,
    notes: '',
    ...overrides,
  };
}

const mockSetSelectedPersonId = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. useWorkspaceTreeData read query param
// ---------------------------------------------------------------------------

describe('useWorkspaceTreeData treeId query param', () => {
  it('omits ?treeId when no active tree id (default = main tree)', async () => {
    mockApiFetch.mockResolvedValue(treeResponse());

    await act(async () => {
      renderHook(() => useWorkspaceTreeData('ws-123'));
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/workspaces/ws-123/tree',
      expect.anything(),
    );
  });

  it('appends ?treeId= to the GET fetch when an active tree id is set', async () => {
    mockApiFetch.mockResolvedValue(treeResponse());

    await act(async () => {
      renderHook(() => useWorkspaceTreeData('ws-123', 'extra-tree-9'));
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/workspaces/ws-123/tree?treeId=extra-tree-9',
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// 2. usePersonActions mutation bodies carry treeId
// ---------------------------------------------------------------------------

describe('usePersonActions treeId in mutation bodies', () => {
  it('omits treeId from the PATCH body when editing the main tree', async () => {
    const person = makeIndividual();
    const data: GedcomData = { individuals: { [person.id]: person }, families: {} };
    mockApiFetch.mockResolvedValueOnce(okResponse(undefined));

    const workspace = {
      workspaceId: 'ws-123',
      canEdit: true,
      refreshTree: vi.fn().mockResolvedValue(undefined),
    };

    const { result } = renderHook(() =>
      usePersonActions({
        personId: person.id,
        workspace,
        person,
        data,
        setSelectedPersonId: mockSetSelectedPersonId,
      }),
    );

    act(() => {
      result.current.setFormMode({ kind: 'edit' });
    });

    await act(async () => {
      await result.current.handleEditSubmit(makeFormData({ givenName: 'محمد' }));
    });

    const body = JSON.parse(
      (mockApiFetch.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body).not.toHaveProperty('treeId');
  });

  it('includes treeId in the PATCH body when editing an extra tree', async () => {
    const person = makeIndividual();
    const data: GedcomData = { individuals: { [person.id]: person }, families: {} };
    mockApiFetch.mockResolvedValueOnce(okResponse(undefined));

    const workspace = {
      workspaceId: 'ws-123',
      canEdit: true,
      refreshTree: vi.fn().mockResolvedValue(undefined),
      activeTreeId: 'extra-tree-9',
    };

    const { result } = renderHook(() =>
      usePersonActions({
        personId: person.id,
        workspace,
        person,
        data,
        setSelectedPersonId: mockSetSelectedPersonId,
      }),
    );

    act(() => {
      result.current.setFormMode({ kind: 'edit' });
    });

    await act(async () => {
      await result.current.handleEditSubmit(makeFormData({ givenName: 'محمد' }));
    });

    const body = JSON.parse(
      (mockApiFetch.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.treeId).toBe('extra-tree-9');
  });

  it('includes treeId in the create-individual POST body when an extra tree is active', async () => {
    const person = makeIndividual({ familiesAsSpouse: ['@F1@'] });
    const data: GedcomData = {
      individuals: { [person.id]: person },
      families: {
        '@F1@': {
          id: '@F1@', type: 'FAM', husband: '@I1@', wife: null, children: [],
          marriageContract: makeEmptyEvent(), marriage: makeEmptyEvent(),
          divorce: makeEmptyEvent(), isDivorced: false,
        },
      },
    };
    mockApiFetch
      .mockResolvedValueOnce(okResponse({ id: '@I99@' }))
      .mockResolvedValueOnce(okResponse(undefined));

    const workspace = {
      workspaceId: 'ws-123',
      canEdit: true,
      refreshTree: vi.fn().mockResolvedValue(undefined),
      activeTreeId: 'extra-tree-9',
    };

    const { result } = renderHook(() =>
      usePersonActions({
        personId: person.id,
        workspace,
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

    // First call = create individual; second = add child to family.
    const createBody = JSON.parse(
      (mockApiFetch.mock.calls[0][1] as RequestInit).body as string,
    );
    const childBody = JSON.parse(
      (mockApiFetch.mock.calls[1][1] as RequestInit).body as string,
    );
    expect(createBody.treeId).toBe('extra-tree-9');
    expect(childBody.treeId).toBe('extra-tree-9');
  });
});

// ---------------------------------------------------------------------------
// 3. undo-builders carry treeId in their bodies
// ---------------------------------------------------------------------------

describe('undo-builders treeId in bodies', () => {
  beforeEach(() => {
    mockApiFetch.mockResolvedValue(okResponse(undefined));
  });

  it('omits treeId from the PATCH bodies when no treeId is given (main tree)', async () => {
    const { undo } = buildUpdateIndividualInverse({
      workspaceId: 'ws-1',
      individualId: '@I1@',
      before: { givenName: 'أحمد' },
      after: { givenName: 'محمد' },
    });
    await undo();
    const body = JSON.parse(
      (mockApiFetch.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body).not.toHaveProperty('treeId');
  });

  it('includes treeId in the PATCH bodies when a treeId is given (extra tree)', async () => {
    const { undo, redo } = buildUpdateIndividualInverse({
      workspaceId: 'ws-1',
      individualId: '@I1@',
      before: { givenName: 'أحمد' },
      after: { givenName: 'محمد' },
      treeId: 'extra-tree-9',
    });
    await undo();
    await redo();
    const undoBody = JSON.parse(
      (mockApiFetch.mock.calls[0][1] as RequestInit).body as string,
    );
    const redoBody = JSON.parse(
      (mockApiFetch.mock.calls[1][1] as RequestInit).body as string,
    );
    expect(undoBody.treeId).toBe('extra-tree-9');
    expect(redoBody.treeId).toBe('extra-tree-9');
  });

  it('includes treeId in the create POST body (redo) for an extra tree', async () => {
    mockApiFetch.mockResolvedValue(okResponse({ id: '@I7@' }));
    const { redo } = buildCreateIndividualInverse({
      workspaceId: 'ws-1',
      createdId: '@I7@',
      createPayload: { givenName: 'سارة' },
      treeId: 'extra-tree-9',
    });
    await redo();
    const body = JSON.parse(
      (mockApiFetch.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.treeId).toBe('extra-tree-9');
  });
});

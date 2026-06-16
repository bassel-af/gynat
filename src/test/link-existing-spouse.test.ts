import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Individual, Family, GedcomData, FamilyEvent } from '@/lib/gedcom/types';

// Mock apiFetch — must be before importing the hook
vi.mock('@/lib/api/client', () => ({
  apiFetch: vi.fn(),
}));

import { usePersonActions } from '@/hooks/usePersonActions';
import { apiFetch } from '@/lib/api/client';
import {
  getSpouseExcludeIds,
  getSexFilterForSpouse,
  canMoveSubtree,
  getTargetFamiliesForMove,
  computeSubtreeIds,
} from '@/lib/person-detail-helpers';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEmptyEvent(): FamilyEvent {
  return { date: '', hijriDate: '', place: '', description: '', notes: '' };
}

function makeIndividual(overrides: Partial<Individual> & { id: string }): Individual {
  return {
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

function makeFamily(overrides: Partial<Family> & { id: string }): Family {
  return {
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

function makeGedcomData(
  individuals: Record<string, Individual>,
  families: Record<string, Family> = {},
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

function errorResponse(error: string, status = 400) {
  return { ok: false, status, json: () => Promise.resolve({ error }) } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Tests — getSpouseExcludeIds (pure helper)
// ---------------------------------------------------------------------------

describe('getSpouseExcludeIds', () => {
  it('excludes the person themselves', () => {
    const person = makeIndividual({ id: '@I1@' });
    const data = makeGedcomData({ '@I1@': person });

    const excluded = getSpouseExcludeIds(person, data);
    expect(excluded.has('@I1@')).toBe(true);
  });

  it('excludes existing spouses from all families', () => {
    const husband = makeIndividual({ id: '@I1@', sex: 'M', familiesAsSpouse: ['@F1@', '@F2@'] });
    const wife1 = makeIndividual({ id: '@I2@', sex: 'F', familiesAsSpouse: ['@F1@'] });
    const wife2 = makeIndividual({ id: '@I3@', sex: 'F', familiesAsSpouse: ['@F2@'] });
    const unrelated = makeIndividual({ id: '@I4@', sex: 'F' });

    const fam1 = makeFamily({ id: '@F1@', husband: '@I1@', wife: '@I2@' });
    const fam2 = makeFamily({ id: '@F2@', husband: '@I1@', wife: '@I3@' });

    const data = makeGedcomData(
      { '@I1@': husband, '@I2@': wife1, '@I3@': wife2, '@I4@': unrelated },
      { '@F1@': fam1, '@F2@': fam2 },
    );

    const excluded = getSpouseExcludeIds(husband, data);
    expect(excluded.has('@I1@')).toBe(true);  // self
    expect(excluded.has('@I2@')).toBe(true);  // wife1
    expect(excluded.has('@I3@')).toBe(true);  // wife2
    expect(excluded.has('@I4@')).toBe(false); // unrelated
  });

  it('excludes pointed individuals', () => {
    const person = makeIndividual({ id: '@I1@', sex: 'M' });
    const pointed = makeIndividual({ id: '@I5@', sex: 'F', _pointed: true });
    const normal = makeIndividual({ id: '@I6@', sex: 'F' });

    const data = makeGedcomData(
      { '@I1@': person, '@I5@': pointed, '@I6@': normal },
    );

    const excluded = getSpouseExcludeIds(person, data);
    expect(excluded.has('@I5@')).toBe(true);  // pointed
    expect(excluded.has('@I6@')).toBe(false); // normal
  });

  it('handles person with no families', () => {
    const person = makeIndividual({ id: '@I1@', sex: 'M' });
    const data = makeGedcomData({ '@I1@': person });

    const excluded = getSpouseExcludeIds(person, data);
    // Should only contain self
    expect(excluded.size).toBe(1);
    expect(excluded.has('@I1@')).toBe(true);
  });

  it('handles family with missing spouse reference', () => {
    // Family has husbandId but the individual doesn't exist in data
    const person = makeIndividual({ id: '@I1@', sex: 'F', familiesAsSpouse: ['@F1@'] });
    const fam = makeFamily({ id: '@F1@', husband: '@I99@', wife: '@I1@' });

    const data = makeGedcomData(
      { '@I1@': person },
      { '@F1@': fam },
    );

    const excluded = getSpouseExcludeIds(person, data);
    // Should include self + the spouse ID even if individual doesn't exist
    expect(excluded.has('@I1@')).toBe(true);
    expect(excluded.has('@I99@')).toBe(true);
  });

  it('handles family with null spouse slots', () => {
    const person = makeIndividual({ id: '@I1@', sex: 'M', familiesAsSpouse: ['@F1@'] });
    const fam = makeFamily({ id: '@F1@', husband: '@I1@', wife: null });

    const data = makeGedcomData(
      { '@I1@': person },
      { '@F1@': fam },
    );

    const excluded = getSpouseExcludeIds(person, data);
    // Only self, no null entry
    expect(excluded.size).toBe(1);
    expect(excluded.has('@I1@')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests — getSexFilterForSpouse (pure helper)
// ---------------------------------------------------------------------------

describe('getSexFilterForSpouse', () => {
  it('returns F when person is male', () => {
    const person = makeIndividual({ id: '@I1@', sex: 'M' });
    expect(getSexFilterForSpouse(person)).toBe('F');
  });

  it('returns M when person is female', () => {
    const person = makeIndividual({ id: '@I1@', sex: 'F' });
    expect(getSexFilterForSpouse(person)).toBe('M');
  });

  it('returns undefined when sex is null', () => {
    const person = makeIndividual({ id: '@I1@', sex: null });
    expect(getSexFilterForSpouse(person)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests — handleLinkExistingSpouse (hook)
// ---------------------------------------------------------------------------

describe('handleLinkExistingSpouse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a family with correct husband/wife roles for male person', async () => {
    const person = makeIndividual({ id: '@I1@', sex: 'M' });
    const data = makeGedcomData({ '@I1@': person });

    // createFamily returns new family id
    mockApiFetch.mockResolvedValueOnce(okResponse({ id: '@F99@' }));

    const { result } = renderHook(() =>
      usePersonActions({
        personId: person.id,
        workspace: mockWorkspace,
        person,
        data,
        setSelectedPersonId: mockSetSelectedPersonId,
      }),
    );

    // Set mode to linkExistingSpouse
    act(() => {
      result.current.setFormMode({ kind: 'linkExistingSpouse' });
    });

    await act(async () => {
      await result.current.handleLinkExistingSpouse('@I2@');
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/workspaces/ws-123/tree/families',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ husbandId: '@I1@', wifeId: '@I2@' }),
      }),
    );
  });

  it('creates a family with correct husband/wife roles for female person', async () => {
    const person = makeIndividual({ id: '@I1@', sex: 'F' });
    const data = makeGedcomData({ '@I1@': person });

    mockApiFetch.mockResolvedValueOnce(okResponse({ id: '@F99@' }));

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
      result.current.setFormMode({ kind: 'linkExistingSpouse' });
    });

    await act(async () => {
      await result.current.handleLinkExistingSpouse('@I2@');
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/workspaces/ws-123/tree/families',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ wifeId: '@I1@', husbandId: '@I2@' }),
      }),
    );
  });

  it('auto-opens family event form after linking spouse', async () => {
    const person = makeIndividual({ id: '@I1@', sex: 'M' });
    const data = makeGedcomData({ '@I1@': person });

    mockApiFetch.mockResolvedValueOnce(okResponse({ id: '@F99@' }));

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
      result.current.setFormMode({ kind: 'linkExistingSpouse' });
    });

    await act(async () => {
      await result.current.handleLinkExistingSpouse('@I2@');
    });

    // Should transition to editFamilyEvent mode with the new family ID
    expect(result.current.formMode).toEqual({
      kind: 'editFamilyEvent',
      familyId: '@F99@',
    });
  });

  it('refreshes tree after successful link', async () => {
    const person = makeIndividual({ id: '@I1@', sex: 'M' });
    const data = makeGedcomData({ '@I1@': person });

    mockApiFetch.mockResolvedValueOnce(okResponse({ id: '@F99@' }));

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
      await result.current.handleLinkExistingSpouse('@I2@');
    });

    expect(mockWorkspace.refreshTree).toHaveBeenCalled();
  });

  it('sets formError on API failure', async () => {
    const person = makeIndividual({ id: '@I1@', sex: 'M' });
    const data = makeGedcomData({ '@I1@': person });

    mockApiFetch.mockResolvedValueOnce(errorResponse('يوجد سجل عائلة بين هذين الشخصين بالفعل', 409));

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
      await result.current.handleLinkExistingSpouse('@I2@');
    });

    expect(result.current.formError).toBe('يوجد سجل عائلة بين هذين الشخصين بالفعل');
    expect(result.current.formLoading).toBe(false);
  });

  it('is a no-op for pointed individuals', async () => {
    const person = makeIndividual({ id: '@I1@', sex: 'M', _pointed: true });
    const data = makeGedcomData({ '@I1@': person });

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
      await result.current.handleLinkExistingSpouse('@I2@');
    });

    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('is a no-op when no workspace context', async () => {
    const person = makeIndividual({ id: '@I1@', sex: 'M' });
    const data = makeGedcomData({ '@I1@': person });

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
      await result.current.handleLinkExistingSpouse('@I2@');
    });

    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests — canMoveSubtree (pure helper)
// ---------------------------------------------------------------------------

describe('canMoveSubtree', () => {
  it('returns true when person has familyAsChild', () => {
    const person = makeIndividual({ id: '@I1@', familyAsChild: '@F1@' });
    expect(canMoveSubtree(person)).toBe(true);
  });

  it('returns false when person has no familyAsChild', () => {
    const person = makeIndividual({ id: '@I1@', familyAsChild: null });
    expect(canMoveSubtree(person)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests — computeSubtreeIds (pure helper)
// ---------------------------------------------------------------------------

describe('computeSubtreeIds', () => {
  it('returns just the person when they have no descendants', () => {
    const person = makeIndividual({ id: '@I1@' });
    const data = makeGedcomData({ '@I1@': person });

    const ids = computeSubtreeIds(data, '@I1@');
    expect(ids.size).toBe(1);
    expect(ids.has('@I1@')).toBe(true);
  });

  it('includes person and all descendants', () => {
    // @I1@ -> (family @F1@) -> child @I2@ -> (family @F2@) -> child @I3@
    const i1 = makeIndividual({ id: '@I1@', familiesAsSpouse: ['@F1@'] });
    const i2 = makeIndividual({ id: '@I2@', familyAsChild: '@F1@', familiesAsSpouse: ['@F2@'] });
    const i3 = makeIndividual({ id: '@I3@', familyAsChild: '@F2@' });
    const f1 = makeFamily({ id: '@F1@', husband: '@I1@', children: ['@I2@'] });
    const f2 = makeFamily({ id: '@F2@', husband: '@I2@', children: ['@I3@'] });

    const data = makeGedcomData(
      { '@I1@': i1, '@I2@': i2, '@I3@': i3 },
      { '@F1@': f1, '@F2@': f2 },
    );

    const ids = computeSubtreeIds(data, '@I1@');
    expect(ids.has('@I1@')).toBe(true);
    expect(ids.has('@I2@')).toBe(true);
    expect(ids.has('@I3@')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests — getTargetFamiliesForMove (pure helper)
// ---------------------------------------------------------------------------

describe('getTargetFamiliesForMove', () => {
  it('returns empty array when person has no familyAsChild', () => {
    const person = makeIndividual({ id: '@I1@' });
    const data = makeGedcomData({ '@I1@': person });

    const result = getTargetFamiliesForMove(person, data, new Set(['@I1@']));
    expect(result).toEqual([]);
  });

  it('excludes the current family', () => {
    const parent1 = makeIndividual({ id: '@P1@', sex: 'M', familiesAsSpouse: ['@F1@'] });
    const parent2 = makeIndividual({ id: '@P2@', sex: 'M', familiesAsSpouse: ['@F2@'] });
    const child = makeIndividual({ id: '@C1@', familyAsChild: '@F1@' });

    const f1 = makeFamily({ id: '@F1@', husband: '@P1@', children: ['@C1@'] });
    const f2 = makeFamily({ id: '@F2@', husband: '@P2@' });

    const data = makeGedcomData(
      { '@P1@': parent1, '@P2@': parent2, '@C1@': child },
      { '@F1@': f1, '@F2@': f2 },
    );

    const result = getTargetFamiliesForMove(child, data, new Set(['@C1@']));
    expect(result).toHaveLength(1);
    expect(result[0].familyId).toBe('@F2@');
  });

  it('excludes pointed families', () => {
    const parent = makeIndividual({ id: '@P1@', sex: 'M', familiesAsSpouse: ['@F1@'] });
    const child = makeIndividual({ id: '@C1@', familyAsChild: '@F1@' });
    const pointedParent = makeIndividual({ id: '@P2@', sex: 'M', _pointed: true });

    const f1 = makeFamily({ id: '@F1@', husband: '@P1@', children: ['@C1@'] });
    const f2 = makeFamily({ id: '@F2@', husband: '@P2@', _pointed: true });

    const data = makeGedcomData(
      { '@P1@': parent, '@C1@': child, '@P2@': pointedParent },
      { '@F1@': f1, '@F2@': f2 },
    );

    const result = getTargetFamiliesForMove(child, data, new Set(['@C1@']));
    expect(result).toHaveLength(0);
  });

  it('excludes families where a parent is in the subtree (cycle prevention)', () => {
    // @P1@ -> F1 -> @C1@ -> F2 -> @GC1@
    // Moving @C1@ subtree: F2 has @C1@ as parent, which is in the subtree
    const p1 = makeIndividual({ id: '@P1@', sex: 'M', familiesAsSpouse: ['@F1@'] });
    const c1 = makeIndividual({ id: '@C1@', familyAsChild: '@F1@', familiesAsSpouse: ['@F2@'] });
    const gc1 = makeIndividual({ id: '@GC1@', familyAsChild: '@F2@' });
    const otherParent = makeIndividual({ id: '@OP@', sex: 'M', familiesAsSpouse: ['@F3@'] });

    const f1 = makeFamily({ id: '@F1@', husband: '@P1@', children: ['@C1@'] });
    const f2 = makeFamily({ id: '@F2@', husband: '@C1@', children: ['@GC1@'] });
    const f3 = makeFamily({ id: '@F3@', husband: '@OP@' });

    const data = makeGedcomData(
      { '@P1@': p1, '@C1@': c1, '@GC1@': gc1, '@OP@': otherParent },
      { '@F1@': f1, '@F2@': f2, '@F3@': f3 },
    );

    // subtreeIds includes @C1@ and @GC1@
    const subtreeIds = new Set(['@C1@', '@GC1@']);
    const result = getTargetFamiliesForMove(c1, data, subtreeIds);

    // F1 is current family (excluded), F2 has @C1@ as husband (in subtree, excluded)
    // Only F3 remains
    expect(result).toHaveLength(1);
    expect(result[0].familyId).toBe('@F3@');
  });

  it('excludes families where person is already a child', () => {
    const p1 = makeIndividual({ id: '@P1@', sex: 'M', familiesAsSpouse: ['@F1@'] });
    const p2 = makeIndividual({ id: '@P2@', sex: 'M', familiesAsSpouse: ['@F2@'] });
    const child = makeIndividual({ id: '@C1@', familyAsChild: '@F1@' });

    const f1 = makeFamily({ id: '@F1@', husband: '@P1@', children: ['@C1@'] });
    // Child is already listed in F2 as well (shouldn't happen normally, but guard against it)
    const f2 = makeFamily({ id: '@F2@', husband: '@P2@', children: ['@C1@'] });

    const data = makeGedcomData(
      { '@P1@': p1, '@P2@': p2, '@C1@': child },
      { '@F1@': f1, '@F2@': f2 },
    );

    const result = getTargetFamiliesForMove(child, data, new Set(['@C1@']));
    expect(result).toHaveLength(0);
  });

  it('formats parent names correctly', () => {
    const husband = makeIndividual({ id: '@P1@', name: 'أحمد السعيد', givenName: 'أحمد', surname: 'السعيد', sex: 'M', familiesAsSpouse: ['@F1@', '@F2@'] });
    const wife1 = makeIndividual({ id: '@W1@', name: 'فاطمة', givenName: 'فاطمة', sex: 'F', familiesAsSpouse: ['@F1@'] });
    const wife2 = makeIndividual({ id: '@W2@', name: 'خديجة', givenName: 'خديجة', sex: 'F', familiesAsSpouse: ['@F2@'] });
    const child = makeIndividual({ id: '@C1@', familyAsChild: '@F1@' });

    const f1 = makeFamily({ id: '@F1@', husband: '@P1@', wife: '@W1@', children: ['@C1@'] });
    const f2 = makeFamily({ id: '@F2@', husband: '@P1@', wife: '@W2@' });

    const data = makeGedcomData(
      { '@P1@': husband, '@W1@': wife1, '@W2@': wife2, '@C1@': child },
      { '@F1@': f1, '@F2@': f2 },
    );

    const result = getTargetFamiliesForMove(child, data, new Set(['@C1@']));
    expect(result).toHaveLength(1);
    expect(result[0].familyId).toBe('@F2@');
    // Should contain both parent names joined with ' + '
    expect(result[0].parentNames).toContain('+');
  });

  it('shows fallback label for family with no parents', () => {
    const child = makeIndividual({ id: '@C1@', familyAsChild: '@F1@' });

    const f1 = makeFamily({ id: '@F1@', children: ['@C1@'] });
    const f2 = makeFamily({ id: '@F2@' }); // no parents

    const data = makeGedcomData(
      { '@C1@': child },
      { '@F1@': f1, '@F2@': f2 },
    );

    const result = getTargetFamiliesForMove(child, data, new Set(['@C1@']));
    expect(result).toHaveLength(1);
    expect(result[0].parentNames).toBe('عائلة بدون والدين');
  });

  it('returns multiple valid target families', () => {
    const p1 = makeIndividual({ id: '@P1@', sex: 'M', familiesAsSpouse: ['@F1@'] });
    const p2 = makeIndividual({ id: '@P2@', sex: 'M', familiesAsSpouse: ['@F2@'] });
    const p3 = makeIndividual({ id: '@P3@', sex: 'M', familiesAsSpouse: ['@F3@'] });
    const child = makeIndividual({ id: '@C1@', familyAsChild: '@F1@' });

    const f1 = makeFamily({ id: '@F1@', husband: '@P1@', children: ['@C1@'] });
    const f2 = makeFamily({ id: '@F2@', husband: '@P2@' });
    const f3 = makeFamily({ id: '@F3@', husband: '@P3@' });

    const data = makeGedcomData(
      { '@P1@': p1, '@P2@': p2, '@P3@': p3, '@C1@': child },
      { '@F1@': f1, '@F2@': f2, '@F3@': f3 },
    );

    const result = getTargetFamiliesForMove(child, data, new Set(['@C1@']));
    expect(result).toHaveLength(2);
    const familyIds = result.map(r => r.familyId);
    expect(familyIds).toContain('@F2@');
    expect(familyIds).toContain('@F3@');
  });
});


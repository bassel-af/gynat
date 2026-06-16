import { describe, test, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { TreeProvider, useTree } from '@/context/TreeContext';
import type { GedcomData, Individual, Family } from '@/lib/gedcom/types';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeIndividual(overrides: Partial<Individual> & { id: string }): Individual {
  return {
    type: 'INDI',
    name: overrides.id,
    givenName: overrides.id,
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

const EMPTY_EVENT = { date: '', hijriDate: '', place: '', description: '', notes: '' };

function makeFamily(overrides: Partial<Family> & { id: string }): Family {
  return {
    type: 'FAM',
    husband: null,
    wife: null,
    children: [],
    marriageContract: EMPTY_EVENT,
    marriage: EMPTY_EVENT,
    divorce: EMPTY_EVENT,
    isDivorced: false,
    ...overrides,
  };
}

// Two separate trees sharing a married-in spouse:
//
// Tree A: RootA -> Son -> (married to SharedSpouse)
// Tree B: RootB -> Daughter (who is SharedSpouse)
function buildFixture(): GedcomData {
  const individuals: Record<string, Individual> = {
    '@ROOT_A@': makeIndividual({
      id: '@ROOT_A@',
      name: 'RootA',
      familiesAsSpouse: ['@FA1@'],
    }),
    '@SON@': makeIndividual({
      id: '@SON@',
      name: 'Son',
      familiesAsSpouse: ['@FA2@'],
      familyAsChild: '@FA1@',
    }),
    '@SHARED@': makeIndividual({
      id: '@SHARED@',
      name: 'SharedSpouse',
      sex: 'F',
      familiesAsSpouse: ['@FA2@'],
      familyAsChild: '@FB1@',
    }),
    '@GRANDCHILD@': makeIndividual({
      id: '@GRANDCHILD@',
      name: 'Grandchild',
      familyAsChild: '@FA2@',
    }),
    '@ROOT_B@': makeIndividual({
      id: '@ROOT_B@',
      name: 'RootB',
      familiesAsSpouse: ['@FB1@'],
    }),
  };

  const families: Record<string, Family> = {
    '@FA1@': makeFamily({
      id: '@FA1@',
      husband: '@ROOT_A@',
      children: ['@SON@'],
    }),
    '@FA2@': makeFamily({
      id: '@FA2@',
      husband: '@SON@',
      wife: '@SHARED@',
      children: ['@GRANDCHILD@'],
    }),
    '@FB1@': makeFamily({
      id: '@FB1@',
      husband: '@ROOT_B@',
      children: ['@SHARED@'],
    }),
  };

  return { individuals, families };
}

function wrapper({ children }: { children: ReactNode }) {
  return <TreeProvider>{children}</TreeProvider>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TreeContext - multi-root state', () => {
  test('initializes viewMode as single', () => {
    const { result } = renderHook(() => useTree(), { wrapper });
    expect(result.current.viewMode).toBe('single');
  });

  test('setViewMode switches to multi', () => {
    const { result } = renderHook(() => useTree(), { wrapper });
    const data = buildFixture();

    act(() => {
      result.current.setData(data);
    });

    act(() => {
      result.current.setViewMode('multi');
    });

    expect(result.current.viewMode).toBe('multi');
  });

  test('setViewMode switches back to single from multi', () => {
    const { result } = renderHook(() => useTree(), { wrapper });
    const data = buildFixture();

    act(() => {
      result.current.setData(data);
    });

    act(() => {
      result.current.setViewMode('multi');
    });

    act(() => {
      result.current.setViewMode('single');
    });

    expect(result.current.viewMode).toBe('single');
  });

  test('does not expose pinnedRootIds, pinRoot, or unpinRoot', () => {
    const { result } = renderHook(() => useTree(), { wrapper });

    // These should no longer exist in the context
    expect('pinnedRootIds' in result.current).toBe(false);
    expect('pinRoot' in result.current).toBe(false);
    expect('unpinRoot' in result.current).toBe(false);
  });

  test('preserves selectedRootId when switching between modes', () => {
    const { result } = renderHook(() => useTree(), { wrapper });
    const data = buildFixture();

    act(() => {
      result.current.setData(data);
    });

    const rootBefore = result.current.selectedRootId;

    act(() => {
      result.current.setViewMode('multi');
    });

    expect(result.current.selectedRootId).toBe(rootBefore);

    act(() => {
      result.current.setViewMode('single');
    });

    expect(result.current.selectedRootId).toBe(rootBefore);
  });
});

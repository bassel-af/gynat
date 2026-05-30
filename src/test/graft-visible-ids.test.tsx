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

// Main tree: ROOT -> SON + WIFE (married-in with parents WIFE_DAD and sibling WIFE_SIS)
function buildFixture(): GedcomData {
  const individuals: Record<string, Individual> = {
    '@ROOT@': makeIndividual({
      id: '@ROOT@',
      name: 'Root',
      familiesAsSpouse: ['@F1@'],
    }),
    '@SON@': makeIndividual({
      id: '@SON@',
      name: 'Son',
      familiesAsSpouse: ['@F2@'],
      familyAsChild: '@F1@',
    }),
    '@WIFE@': makeIndividual({
      id: '@WIFE@',
      name: 'Wife',
      sex: 'F',
      familiesAsSpouse: ['@F2@'],
      familyAsChild: '@FWIFE@',
    }),
    '@GRANDCHILD@': makeIndividual({
      id: '@GRANDCHILD@',
      name: 'Grandchild',
      familyAsChild: '@F2@',
    }),
    '@WIFE_DAD@': makeIndividual({
      id: '@WIFE_DAD@',
      name: 'WifeDad',
      familiesAsSpouse: ['@FWIFE@'],
    }),
    '@WIFE_SIS@': makeIndividual({
      id: '@WIFE_SIS@',
      name: 'WifeSis',
      sex: 'F',
      familyAsChild: '@FWIFE@',
    }),
  };

  const families: Record<string, Family> = {
    '@F1@': makeFamily({
      id: '@F1@',
      husband: '@ROOT@',
      children: ['@SON@'],
    }),
    '@F2@': makeFamily({
      id: '@F2@',
      husband: '@SON@',
      wife: '@WIFE@',
      children: ['@GRANDCHILD@'],
    }),
    '@FWIFE@': makeFamily({
      id: '@FWIFE@',
      husband: '@WIFE_DAD@',
      children: ['@WIFE@', '@WIFE_SIS@'],
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

describe('TreeContext - visiblePersonIds includes graft individuals in all view modes', () => {
  test('in single mode, visiblePersonIds includes graft parents/siblings', () => {
    const { result } = renderHook(() => useTree(), { wrapper });
    const data = buildFixture();

    act(() => {
      result.current.setData(data);
    });

    act(() => {
      result.current.setSelectedRootId('@ROOT@');
    });

    // Graft parents and siblings should be visible in ALL modes (including single)
    expect(result.current.visiblePersonIds.has('@WIFE_DAD@')).toBe(true);
    expect(result.current.visiblePersonIds.has('@WIFE_SIS@')).toBe(true);
  });

  test('in multi mode, visiblePersonIds DOES include graft parents and siblings', () => {
    const { result } = renderHook(() => useTree(), { wrapper });
    const data = buildFixture();

    act(() => {
      result.current.setData(data);
    });

    act(() => {
      result.current.setSelectedRootId('@ROOT@');
    });

    act(() => {
      result.current.setViewMode('multi');
    });

    // In multi mode, graft parents and siblings should be visible
    expect(result.current.visiblePersonIds.has('@WIFE_DAD@')).toBe(true);
    expect(result.current.visiblePersonIds.has('@WIFE_SIS@')).toBe(true);

    // Regular tree members should also still be visible
    expect(result.current.visiblePersonIds.has('@ROOT@')).toBe(true);
    expect(result.current.visiblePersonIds.has('@SON@')).toBe(true);
    expect(result.current.visiblePersonIds.has('@WIFE@')).toBe(true);
    expect(result.current.visiblePersonIds.has('@GRANDCHILD@')).toBe(true);
  });

  test('switching back to single mode keeps graft individuals in visible set', () => {
    const { result } = renderHook(() => useTree(), { wrapper });
    const data = buildFixture();

    act(() => {
      result.current.setData(data);
    });

    act(() => {
      result.current.setSelectedRootId('@ROOT@');
    });

    act(() => {
      result.current.setViewMode('multi');
    });

    expect(result.current.visiblePersonIds.has('@WIFE_DAD@')).toBe(true);

    act(() => {
      result.current.setViewMode('single');
    });

    // Graft individuals should REMAIN visible after switching back to single
    expect(result.current.visiblePersonIds.has('@WIFE_DAD@')).toBe(true);
    expect(result.current.visiblePersonIds.has('@WIFE_SIS@')).toBe(true);
  });

  test('graftPersonIds contains graft-only individuals (not core tree members)', () => {
    const { result } = renderHook(() => useTree(), { wrapper });
    const data = buildFixture();

    act(() => {
      result.current.setData(data);
    });

    act(() => {
      result.current.setSelectedRootId('@ROOT@');
    });

    // WIFE_DAD and WIFE_SIS are graft-only (not in core tree)
    expect(result.current.graftPersonIds.has('@WIFE_DAD@')).toBe(true);
    expect(result.current.graftPersonIds.has('@WIFE_SIS@')).toBe(true);
  });

  test('panelScopeIds includes the married-in family AND the core tree', () => {
    const { result } = renderHook(() => useTree(), { wrapper });
    const data = buildFixture();

    act(() => {
      result.current.setData(data);
    });
    act(() => {
      result.current.setSelectedRootId('@ROOT@');
    });

    // Married-in family (connected via marriage) is in panel scope...
    expect(result.current.panelScopeIds.has('@WIFE_DAD@')).toBe(true);
    expect(result.current.panelScopeIds.has('@WIFE_SIS@')).toBe(true);
    // ...alongside the core tree.
    expect(result.current.panelScopeIds.has('@ROOT@')).toBe(true);
    expect(result.current.panelScopeIds.has('@SON@')).toBe(true);
    expect(result.current.panelScopeIds.has('@WIFE@')).toBe(true);
    expect(result.current.panelScopeIds.has('@GRANDCHILD@')).toBe(true);
  });

  test('graftPersonIds does NOT contain people who are in the core tree', () => {
    const { result } = renderHook(() => useTree(), { wrapper });
    const data = buildFixture();

    act(() => {
      result.current.setData(data);
    });

    act(() => {
      result.current.setSelectedRootId('@ROOT@');
    });

    // Core tree members (root, descendants, spouses) must NOT be in graftPersonIds
    expect(result.current.graftPersonIds.has('@ROOT@')).toBe(false);
    expect(result.current.graftPersonIds.has('@SON@')).toBe(false);
    expect(result.current.graftPersonIds.has('@WIFE@')).toBe(false);
    expect(result.current.graftPersonIds.has('@GRANDCHILD@')).toBe(false);
  });
});

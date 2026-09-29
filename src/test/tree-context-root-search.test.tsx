/** The root list carries a search text matching every name a root goes by. */
import { describe, test, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { TreeProvider, useTree } from '@/context/TreeContext';
import { matchesSearch } from '@/lib/utils/search';
import type { GedcomData, Individual } from '@/lib/gedcom/types';

function ind(id: string, over: Partial<Individual> = {}): Individual {
  return {
    id, type: 'INDI', name: id, givenName: id, surname: '', sex: 'M',
    birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
    death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
    kunya: '', notes: '', isDeceased: false, isPrivate: false,
    familiesAsSpouse: [], familyAsChild: null, ...over,
  };
}

const wrapper = ({ children }: { children: ReactNode }) => <TreeProvider>{children}</TreeProvider>;

describe('TreeContext root search text', () => {
  test('a famous-name-led root is found by the real name, the kunya and the birth', () => {
    const data: GedcomData = {
      individuals: {
        '@S@': ind('@S@', { name: 'شيبة', givenName: 'شيبة', famousName: 'عبدالمطلب', kunya: 'أبو الحارث', birth: '500' }),
      },
      families: {},
    };
    const { result } = renderHook(() => useTree(), { wrapper });
    act(() => result.current.setData(data));
    const root = result.current.rootsList.find((r) => r.id === '@S@')!;
    expect(matchesSearch(root.searchText ?? '', 'شيبة')).toBe(true);
    expect(matchesSearch(root.searchText ?? '', 'أبو الحارث')).toBe(true);
    expect(matchesSearch(root.searchText ?? '', '500')).toBe(true);
  });

  test('a famous-name-led root carries its other-name grey line', () => {
    const data: GedcomData = {
      individuals: { '@S@': ind('@S@', { name: 'شيبة', givenName: 'شيبة', famousName: 'عبدالمطلب' }) },
      families: {},
    };
    const { result } = renderHook(() => useTree(), { wrapper });
    act(() => result.current.setData(data));
    expect(result.current.rootsList.find((r) => r.id === '@S@')!.alternate).toBe('واسمه شيبة');
  });

  test('a root without a famous name has no grey line', () => {
    const data: GedcomData = { individuals: { '@X@': ind('@X@', { name: 'سعيد', givenName: 'سعيد' }) }, families: {} };
    const { result } = renderHook(() => useTree(), { wrapper });
    act(() => result.current.setData(data));
    expect(result.current.rootsList.find((r) => r.id === '@X@')!.alternate ?? null).toBeNull();
  });
});

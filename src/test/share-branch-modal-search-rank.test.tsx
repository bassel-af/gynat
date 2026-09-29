/**
 * ShareBranchModal person search: a person matched only through an alias
 * (here a famous name kept out of the name line, famousNameInNasab: false)
 * must never outrank a main-name match.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GedcomData, Individual } from '@/lib/gedcom/types';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

import { ShareBranchModal } from '@/components/workspace/ShareBranchModal/ShareBranchModal';

function person(id: string, givenName: string, over: Partial<Individual> = {}): Individual {
  return {
    id, type: 'INDI', name: givenName, givenName, surname: '', sex: 'M',
    birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
    death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
    kunya: '', notes: '', isDeceased: false, isPrivate: false,
    familiesAsSpouse: [], familyAsChild: null, ...over,
  } as Individual;
}

describe('ShareBranchModal person search ranking', () => {
  it('ranks a main-name match above a person matched only through their famous name', () => {
    const treeData: GedcomData = {
      individuals: {
        A1: person('A1', 'عبدمناف', { famousName: 'أبو طالب', famousNameInNasab: false }),
        A2: person('A2', 'طالب بن عمرو'),
      },
      families: {},
    };
    render(
      <ShareBranchModal isOpen onClose={() => {}} workspaceId="ws-1" treeData={treeData} />,
    );
    fireEvent.change(screen.getByPlaceholderText('ابحث بالاسم...'), { target: { value: 'طالب' } });
    const results = screen.getAllByRole('button').filter((b) => /طالب/.test(b.textContent ?? ''));
    expect(results).toHaveLength(2);
    expect(results[0]).toHaveTextContent('طالب بن عمرو');
  });
});

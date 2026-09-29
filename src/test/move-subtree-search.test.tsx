/**
 * The move-subtree / assign-parents picker searches every name the parents go
 * by (famous name, real name, kunya), not only the shown label.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { Family, GedcomData, Individual } from '@/lib/gedcom/types';
import { getTargetFamiliesForMove } from '@/lib/person-detail-helpers';
import { matchesSearch } from '@/lib/utils/search';
import { MoveSubtreeModal, type MoveSubtreeOption } from '@/components/tree/MoveSubtreeModal';

function ind(id: string, over: Partial<Individual> = {}): Individual {
  return {
    id, type: 'INDI', name: id, givenName: id, surname: '', sex: 'M',
    birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
    death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
    kunya: '', notes: '', isDeceased: false, isPrivate: false,
    familiesAsSpouse: [], familyAsChild: null, ...over,
  };
}
const EV = { date: '', hijriDate: '', place: '', description: '', notes: '' };
function fam(id: string, husband: string | null, wife: string | null, children: string[] = []): Family {
  return { id, type: 'FAM', husband, wife, children, marriageContract: EV, marriage: EV, divorce: EV, isDivorced: false };
}

describe('getTargetFamiliesForMove search text', () => {
  const data: GedcomData = {
    individuals: {
      H: ind('H', { name: 'شيبة', givenName: 'شيبة', famousName: 'عبدالمطلب', familiesAsSpouse: ['F2'] }),
      W: ind('W', { name: 'فاطمة', givenName: 'فاطمة', sex: 'F', kunya: 'أم الزبير', familiesAsSpouse: ['F2'] }),
      P: ind('P', { familiesAsSpouse: ['F1'] }),
      C: ind('C', { familyAsChild: 'F1' }),
    },
    families: { F1: fam('F1', 'P', null, ['C']), F2: fam('F2', 'H', 'W') },
  };
  const [target] = getTargetFamiliesForMove(data.individuals.C, data, new Set(['C']));

  it('matches the husband\'s real name behind his famous name', () => {
    expect(matchesSearch(target.searchText, 'شيبة')).toBe(true);
  });

  it('matches the wife\'s kunya', () => {
    expect(matchesSearch(target.searchText, 'أم الزبير')).toBe(true);
  });
});

describe('MoveSubtreeModal search', () => {
  const options: MoveSubtreeOption[] = [
    { kind: 'family', familyId: 'F2', parentNames: 'عبدالمطلب + فاطمة', searchText: 'عبدالمطلب شيبة + فاطمة أم الزبير' },
    { kind: 'solo', individualId: 'S', name: 'أبو طالب', sex: 'M', searchText: 'أبو طالب عبدمناف' },
  ];
  const renderModal = () => render(
    <MoveSubtreeModal
      isOpen onClose={vi.fn()} onConfirm={vi.fn()} options={options}
      personName="علي" descendantCount={0} intent="assign"
    />,
  );

  it('filters family options by their search text (kunya)', () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText('ابحث بالاسم...'), { target: { value: 'أم الزبير' } });
    expect(screen.getAllByRole('radio')).toHaveLength(1);
    expect(screen.getByText('عبدالمطلب + فاطمة')).toBeTruthy();
  });

  it('filters solo options by their search text (real name)', () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText('ابحث بالاسم...'), { target: { value: 'عبدمناف' } });
    expect(screen.getAllByRole('radio')).toHaveLength(1);
    expect(screen.getByText('أبو طالب')).toBeTruthy();
  });
});

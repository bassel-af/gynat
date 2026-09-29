/**
 * Famous name («اسم الشهرة») in the people pickers — IndividualPicker (change
 * parents / رضاعة / قفزة نسب), ShareBranchModal and SourcePeoplePicker. Each
 * row renders through PersonListName: the lead name + nasab on the main line,
 * the other name on a grey line that is strengthened when the search matched
 * only it.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GedcomData, Individual, Family, FamilyEvent } from '@/lib/gedcom/types';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

import { IndividualPicker } from '@/components/ui/IndividualPicker';
import { ShareBranchModal } from '@/components/workspace/ShareBranchModal/ShareBranchModal';
import { SourcePeoplePicker } from '@/components/sources/SourcePeoplePicker';

const EV: FamilyEvent = { date: '', hijriDate: '', place: '', description: '', notes: '' };

function person(id: string, givenName: string, over: Partial<Individual> = {}): Individual {
  return {
    id, type: 'INDI', name: givenName, givenName, surname: '', sex: 'M',
    birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
    death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
    kunya: '', notes: '', isDeceased: false, isPrivate: false,
    familiesAsSpouse: [], familyAsChild: null, ...over,
  } as Individual;
}

/** هاشم (real name عمرو, famous name leads); علي بن حسن has no famous name. */
function buildData(): GedcomData {
  const individuals: Record<string, Individual> = {
    H: person('H', 'عمرو', { famousName: 'هاشم' }),
    HS: person('HS', 'حسن', { familiesAsSpouse: ['F1'] }),
    A: person('A', 'علي', { familyAsChild: 'F1', birth: '1950' }),
  };
  const families: Record<string, Family> = {
    F1: {
      id: 'F1', type: 'FAM', husband: 'HS', wife: null, children: ['A'],
      marriageContract: EV, marriage: EV, divorce: EV, isDivorced: false,
    } as Family,
  };
  return { individuals, families };
}

const hitLine = (row: HTMLElement) => row.querySelector('[data-hit="true"]');

describe('IndividualPicker rows', () => {
  const renderPicker = () =>
    render(<IndividualPicker value={null} onChange={vi.fn()} data={buildData()} label="الأب" />);

  const search = (q: string) => {
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: q } });
  };

  it('«عمرو» finds هاشم and strengthens «واسمه عمرو»', () => {
    renderPicker();
    search('عمرو');
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('هاشم');
    expect(hitLine(options[0])).toHaveTextContent('واسمه عمرو');
  });

  it('a person without a famous name renders name and birth year with no grey line', () => {
    renderPicker();
    search('علي');
    const option = screen.getByRole('option');
    expect(option).toHaveTextContent('علي بن حسن');
    expect(option).toHaveTextContent('1950');
    expect(option.querySelector('[data-hit]')).toBeNull();
  });
});

describe('ShareBranchModal rows', () => {
  const renderModal = () =>
    render(<ShareBranchModal isOpen onClose={() => {}} workspaceId="ws-1" treeData={buildData()} />);

  const search = (q: string) =>
    fireEvent.change(screen.getByPlaceholderText('ابحث بالاسم...'), { target: { value: q } });

  const resultRows = (pattern: RegExp) =>
    screen.getAllByRole('button').filter((b) => pattern.test(b.textContent ?? ''));

  it('«عمرو» finds هاشم and strengthens «واسمه عمرو»', () => {
    renderModal();
    search('عمرو');
    const rows = resultRows(/هاشم/);
    expect(rows).toHaveLength(1);
    expect(hitLine(rows[0])).toHaveTextContent('واسمه عمرو');
  });

  it('searches the nasab text it displays', () => {
    renderModal();
    search('علي بن حسن');
    const rows = resultRows(/علي بن حسن/);
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector('[data-hit]')).toBeNull();
  });
});

describe('SourcePeoplePicker rows', () => {
  const renderPicker = () =>
    render(<SourcePeoplePicker data={buildData()} initialIds={[]} onDone={vi.fn()} onClose={vi.fn()} />);

  const search = (q: string) =>
    fireEvent.change(screen.getByRole('searchbox', { name: 'ابحث باسم أو نسب' }), { target: { value: q } });

  const rowOf = (checkbox: HTMLElement) => checkbox.closest('label') as HTMLElement;

  it('«عمرو» finds هاشم and strengthens «واسمه عمرو»', () => {
    renderPicker();
    search('عمرو');
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(1);
    expect(rowOf(boxes[0])).toHaveTextContent('هاشم');
    expect(hitLine(rowOf(boxes[0]))).toHaveTextContent('واسمه عمرو');
  });

  it('a person without a famous name renders name and sub line with no grey line', () => {
    renderPicker();
    search('علي');
    const row = rowOf(screen.getByRole('checkbox'));
    expect(row).toHaveTextContent('علي بن حسن');
    expect(row).toHaveTextContent('مواليد ١٩٥٠م');
    expect(row.querySelector('[data-hit]')).toBeNull();
  });
});

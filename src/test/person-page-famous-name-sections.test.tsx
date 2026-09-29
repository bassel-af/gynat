import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type {
  PersonChip,
  PersonProjection,
  PersonSubject,
  SpineChip,
} from '@/lib/tree/person-projection';

// «اسم الشهرة» in the Person Page's lineage columns («سلسلتا النسب») and the
// descendants section («الذرية»): the lead name is the card's main name, and the
// other name sits under it as a small grey line («واسمه …» / «ويُعرف ب…»).
//   عبدمناف ← هاشم (واسمه عمرو) ← عبدالمطلب (واسمه شيبة) ← أبو طالب (واسمه عبدمناف) ← علي

vi.mock('@/hooks/useCalendarPreference', () => ({
  useCalendarPreference: () => ({ preference: 'hijri', setPreference: vi.fn(), loading: false }),
}));
vi.mock('@/hooks/useTreeColorOverrides', () => ({ useTreeColorOverrides: () => {} }));
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { BloodlineColumn } from '@/components/person/BloodlineColumn';
import { PersonPage } from '@/components/person/PersonPage';

function subjectOf(givenName: string, famousName = '', extra: Partial<PersonSubject> = {}): PersonSubject {
  return {
    id: 'self', name: `${givenName} بني هاشم`, givenName, famousName, surname: 'بني هاشم',
    kunya: '', gender: 'male', birth: '', birthHijriDate: '', birthPlace: '', death: '',
    deathHijriDate: '', deathPlace: '', notes: '', isDeceased: true, living: false, house: '',
    ...extra,
  };
}

function chip(id: string, givenName: string, famousName = '', extra: Partial<SpineChip> = {}): SpineChip {
  return {
    id, name: `${givenName} بني هاشم`, givenName, famousName, gender: 'male', birth: '',
    birthHijriDate: '', death: '', deathHijriDate: '', isDeceased: true, living: false,
    private: false, ...extra,
  };
}

const privateChip: SpineChip = {
  name: 'خاص', givenName: 'خاص', famousName: '', gender: 'male', birth: '', birthHijriDate: '',
  death: '', deathHijriDate: '', isDeceased: false, private: true,
};

const aliChain: SpineChip[] = [
  chip('mn', 'عبدمناف'),
  chip('hs', 'عمرو', 'هاشم'),
  chip('am', 'شيبة', 'عبدالمطلب'),
  chip('at', 'عبدمناف', 'أبو طالب'),
];

const hrefFor = (id: string) => `/person/${id}`;

function projection(subject: PersonSubject, extra: Partial<PersonProjection> = {}): PersonProjection {
  return {
    subject, paternalChain: [], maternalChain: [], marriages: [], grandchildren: [],
    siblings: [], paternalUncles: [], maternalUncles: [], paternalCousins: [],
    maternalCousins: [], rada: { fathers: [], mothers: [], siblings: [] },
    ...extra,
  };
}

const renderColumn = (chain: SpineChip[]) =>
  render(
    <BloodlineColumn
      variant="paternal"
      kicker="نسب الأب"
      chain={chain}
      subject={subjectOf('علي')}
      hrefFor={hrefFor}
    />,
  );

describe('BloodlineColumn — lineage cards lead with the chosen name', () => {
  it.each([
    ['hs', 'هاشم'],
    ['am', 'عبدالمطلب'],
    ['at', 'أبو طالب'],
  ])('card %s shows %s as its main name', (id, lead) => {
    const { container } = renderColumn(aliChain);
    const card = container.querySelector(`a[href="/person/${id}"]`)!;
    expect(within(card as HTMLElement).getByText(lead)).toBeInTheDocument();
  });

  it.each([
    ['hs', 'واسمه عمرو'],
    ['am', 'واسمه شيبة'],
    ['at', 'واسمه عبدمناف'],
  ])('card %s shows the grey line «%s»', (id, line) => {
    const { container } = renderColumn(aliChain);
    const card = container.querySelector(`a[href="/person/${id}"]`)!;
    expect(within(card as HTMLElement).getByText(line)).toBeInTheDocument();
  });

  it('shows «ويُعرف بأبي طالب» when the real name leads', () => {
    const { container } = renderColumn([chip('at', 'عبدمناف', 'أبو طالب', { famousNameInNasab: false })]);
    const card = container.querySelector('a[href="/person/at"]') as HTMLElement;
    expect(within(card).getByText('عبدمناف بني هاشم')).toBeInTheDocument();
    expect(within(card).getByText('ويُعرف بأبي طالب')).toBeInTheDocument();
  });

  it('leaves a card without a famous name unchanged (no grey line)', () => {
    const { container } = renderColumn(aliChain);
    const card = container.querySelector('a[href="/person/mn"]') as HTMLElement;
    expect(within(card).getByText('عبدمناف بني هاشم')).toBeInTheDocument();
    expect(within(card).queryByText(/^(واسمه|واسمها|ويُعرف|وتُعرف)/)).toBeNull();
  });

  it('keeps a private ancestor as a bare «خاص» card', () => {
    const { container } = renderColumn([privateChip]);
    const priv = screen.getByText('خاص');
    expect(priv.closest('a')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(screen.queryByText(/^(واسمه|واسمها|ويُعرف|وتُعرف)/)).toBeNull();
  });
});

describe('PersonPage — descendants lead with the chosen name', () => {
  const renderWithChildren = (subject: PersonSubject, children: PersonChip[]) =>
    render(
      <PersonPage
        projection={projection(subject, {
          marriages: [{ familyId: 'f1', spouse: null, children }],
        })}
        hrefFor={hrefFor}
        backHref="/back"
        treeHref="/tree"
      />,
    );

  it('lists علي among أبو طالب’s descendants', () => {
    const { container } = renderWithChildren(subjectOf('عبدمناف', 'أبو طالب'), [chip('ali', 'علي')]);
    const link = container.querySelector('a[href="/person/ali"]') as HTMLElement;
    expect(within(link).getByText('علي بني هاشم')).toBeInTheDocument();
  });

  it('shows a descendant’s famous name as the main name', () => {
    const { container } = renderWithChildren(subjectOf('شيبة', 'عبدالمطلب'), [chip('at', 'عبدمناف', 'أبو طالب')]);
    const link = container.querySelector('a[href="/person/at"]') as HTMLElement;
    expect(within(link).getByText('أبو طالب')).toBeInTheDocument();
  });

  it('shows the descendant’s real name as the grey line «واسمه عبدمناف»', () => {
    const { container } = renderWithChildren(subjectOf('شيبة', 'عبدالمطلب'), [chip('at', 'عبدمناف', 'أبو طالب')]);
    const link = container.querySelector('a[href="/person/at"]') as HTMLElement;
    expect(within(link).getByText('واسمه عبدمناف')).toBeInTheDocument();
  });

  it('uses «واسمها» for a daughter with a famous name', () => {
    const { container } = renderWithChildren(subjectOf('علي'), [
      chip('z', 'زينب', 'أم هانئ', { gender: 'female' }),
    ]);
    const link = container.querySelector('a[href="/person/z"]') as HTMLElement;
    expect(within(link).getByText('واسمها زينب')).toBeInTheDocument();
  });

  it('leaves a descendant without a famous name unchanged (no grey line)', () => {
    const { container } = renderWithChildren(subjectOf('عبدمناف', 'أبو طالب'), [chip('ali', 'علي')]);
    const link = container.querySelector('a[href="/person/ali"]') as HTMLElement;
    expect(within(link).queryByText(/^(واسمه|واسمها|ويُعرف|وتُعرف)/)).toBeNull();
  });
});

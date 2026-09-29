import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type {
  PersonProjection,
  PersonSubject,
  SpineChip,
} from '@/lib/tree/person-projection';

// «اسم الشهرة» on the Person Page. The famous-name example is علي's line:
//   عبدمناف ← هاشم (واسمه عمرو) ← عبدالمطلب (واسمه شيبة) ← أبو طالب (واسمه عبدمناف) ← علي
// The ribbon links each ancestor by the name he LEADS with, in the genitive
// after بن («بن أبي طالب»), with a tiny caption of his other name.

vi.mock('@/hooks/useCalendarPreference', () => ({
  useCalendarPreference: () => ({ preference: 'hijri', setPreference: vi.fn(), loading: false }),
}));
vi.mock('@/hooks/useTreeColorOverrides', () => ({ useTreeColorOverrides: () => {} }));
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { NasabRibbon } from '@/components/person/NasabRibbon';
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

// Oldest → father, as the projection emits it.
const aliChain: SpineChip[] = [
  chip('mn', 'عبدمناف'),
  chip('hs', 'عمرو', 'هاشم'),
  chip('am', 'شيبة', 'عبدالمطلب'),
  chip('at', 'عبدمناف', 'أبو طالب'),
];

const hrefFor = (id: string) => `/person/${id}`;

function projection(subject: PersonSubject, chain: SpineChip[]): PersonProjection {
  return {
    subject, paternalChain: chain, maternalChain: [], marriages: [], grandchildren: [],
    siblings: [], paternalUncles: [], maternalUncles: [], paternalCousins: [],
    maternalCousins: [], rada: { fathers: [], mothers: [], siblings: [] },
  };
}

describe('NasabRibbon — famous names', () => {
  const renderAli = () =>
    render(<NasabRibbon subject={subjectOf('علي')} chain={aliChain} hrefFor={hrefFor} />);

  it('links the father by his famous name in the genitive («أبي طالب»)', () => {
    renderAli();
    expect(screen.getByRole('link', { name: 'أبي طالب' })).toHaveAttribute('href', '/person/at');
  });

  it('describes أبي طالب with his real name «واسمه عبدمناف»', () => {
    renderAli();
    expect(screen.getByRole('link', { name: 'أبي طالب' })).toHaveAccessibleDescription('واسمه عبدمناف');
  });

  it('shows a caption «عبدمناف» next to the أبي طالب link', () => {
    renderAli();
    const link = screen.getByRole('link', { name: 'أبي طالب' });
    expect(within(link.parentElement!).getByText('عبدمناف', { selector: '[aria-hidden="true"]' })).toBeInTheDocument();
  });

  it('describes عبدالمطلب with «واسمه شيبة»', () => {
    renderAli();
    expect(screen.getByRole('link', { name: 'عبدالمطلب' })).toHaveAccessibleDescription('واسمه شيبة');
  });

  it('shows a caption «شيبة» next to the عبدالمطلب link', () => {
    renderAli();
    const link = screen.getByRole('link', { name: 'عبدالمطلب' });
    expect(within(link.parentElement!).getByText('شيبة', { selector: '[aria-hidden="true"]' })).toBeInTheDocument();
  });

  it('describes هاشم with «واسمه عمرو»', () => {
    renderAli();
    expect(screen.getByRole('link', { name: 'هاشم' })).toHaveAccessibleDescription('واسمه عمرو');
  });

  it('shows a caption «عمرو» next to the هاشم link', () => {
    renderAli();
    const link = screen.getByRole('link', { name: 'هاشم' });
    expect(within(link.parentElement!).getByText('عمرو', { selector: '[aria-hidden="true"]' })).toBeInTheDocument();
  });

  it('gives an ancestor without a famous name no description', () => {
    renderAli();
    const link = screen.getByRole('link', { name: 'عبدمناف' });
    expect(link).toHaveAttribute('href', '/person/mn');
    expect(link).not.toHaveAttribute('aria-describedby');
  });

  it('describes an ancestor whose real name leads with «ويُعرف ب…»', () => {
    const chain = [chip('at', 'عبدمناف', 'أبو طالب', { famousNameInNasab: false })];
    render(<NasabRibbon subject={subjectOf('علي')} chain={chain} hrefFor={hrefFor} />);
    expect(screen.getByRole('link', { name: 'عبدمناف' })).toHaveAccessibleDescription('ويُعرف بأبي طالب');
  });

  it('leads the subject with the famous name in the nominative', () => {
    const { container } = render(
      <NasabRibbon subject={subjectOf('عبدمناف', 'أبو طالب')} chain={[]} hrefFor={hrefFor} />,
    );
    expect(container.querySelector('h1')).toHaveTextContent(/^أبو طالب$/);
  });

  it('renders a private ancestor as only «خاص» — no link, no caption, no description', () => {
    const { container } = render(
      <NasabRibbon subject={subjectOf('علي')} chain={[privateChip]} hrefFor={hrefFor} />,
    );
    const priv = screen.getByLabelText('فرد خاص');
    expect(priv.closest('a')).toBeNull();
    expect(container.querySelectorAll('a')).toHaveLength(0);
    expect(container.querySelector('[aria-describedby]')).toBeNull();
    expect(container.querySelector('h1')).toHaveTextContent(/^علي\s*بن\s*خاص$/);
  });

  it('renders a line without famous names exactly as before', () => {
    const chain = [chip('g', 'سعيد'), chip('f', 'محمد')];
    const { container } = render(
      <NasabRibbon subject={subjectOf('باسل')} chain={chain} hrefFor={hrefFor} />,
    );
    expect(container.querySelector('h1')).toHaveTextContent(/^باسل\s*بن\s*محمد\s*بن\s*سعيد$/);
    expect(container.querySelector('[aria-describedby]')).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});

describe('PersonPage — subject heading grey line', () => {
  const renderPage = (subject: PersonSubject) =>
    render(
      <PersonPage
        projection={projection(subject, [])}
        hrefFor={hrefFor}
        backHref="/back"
        treeHref="/tree"
      />,
    );

  it('shows «واسمه عبدمناف» under a subject known as أبو طالب', () => {
    renderPage(subjectOf('عبدمناف', 'أبو طالب'));
    expect(screen.getByText('واسمه عبدمناف')).toBeInTheDocument();
  });

  it('shows «ويُعرف بأبي طالب» when the subject keeps his real name in the nasab', () => {
    renderPage(subjectOf('عبدمناف', 'أبو طالب', { famousNameInNasab: false }));
    expect(screen.getByText('ويُعرف بأبي طالب')).toBeInTheDocument();
  });

  it('shows no grey line for a subject without a famous name', () => {
    renderPage(subjectOf('علي'));
    expect(screen.queryByText(/^(واسمه|واسمها|ويُعرف|وتُعرف)/)).toBeNull();
  });
});

describe('PersonPage — kunya line uses the shared shouldShowKunya rule', () => {
  // Hero texts equal to `text` that sit OUTSIDE the nasab heading (h1).
  const heroTextOutsideHeading = (container: HTMLElement, text: string) =>
    within(container.querySelector('header')!)
      .queryAllByText(text)
      .filter((el) => !el.closest('h1'));

  const renderPage = (subject: PersonSubject) =>
    render(
      <PersonPage
        projection={projection(subject, [])}
        hrefFor={hrefFor}
        backHref="/back"
        treeHref="/tree"
      />,
    );

  it('hides the kunya line for أبو طالب whose kunya equals his famous name', () => {
    const { container } = renderPage(subjectOf('عبدمناف', 'أبو طالب', { kunya: 'أبو طالب' }));
    expect(heroTextOutsideHeading(container, 'أبو طالب')).toHaveLength(0);
  });

  it('shows the kunya line when it differs from the famous name', () => {
    const { container } = renderPage(subjectOf('عبدمناف', 'أبو طالب', { kunya: 'أبو علي' }));
    expect(heroTextOutsideHeading(container, 'أبو علي')).toHaveLength(1);
  });

  it('shows the kunya line for a subject without a famous name', () => {
    const { container } = renderPage(subjectOf('علي', '', { kunya: 'أبو الحسن' }));
    expect(heroTextOutsideHeading(container, 'أبو الحسن')).toHaveLength(1);
  });
});

describe('BloodlineColumn — subject terminus', () => {
  it('names the subject by his lead name', () => {
    render(
      <BloodlineColumn
        variant="paternal"
        kicker="نسب الأب"
        chain={[chip('am', 'شيبة', 'عبدالمطلب')]}
        subject={subjectOf('عبدمناف', 'أبو طالب')}
        hrefFor={hrefFor}
      />,
    );
    const self = screen.getByText('الشخص المعروض').parentElement!;
    expect(within(self).getByText('أبو طالب')).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { PersonProjection, PersonSubject, PersonChip } from '@/lib/tree/person-projection';

// ---------------------------------------------------------------------------
// "If there is nothing to show, do not show it." — the Person Page must never
// render a section heading/box with no content underneath it.
//
// The PO hit this on السجل (the record section): its heading + hint + ornament
// rendered for a person with no birth/death/place/kunya/house/notes, leaving a
// titled box with an empty body. These tests pin that السجل disappears entirely
// when empty, and that the broader sections (sالأسرة والصلات, سلسلتا النسب)
// don't render their headers with nothing inside.
//
// next/navigation + the calendar-preference hook are stubbed so the pure
// presentational components render under jsdom without a server context.
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useCalendarPreference', () => ({
  useCalendarPreference: () => ({ preference: 'hijri', setPreference: vi.fn(), loading: false }),
}));

vi.mock('@/hooks/useTreeColorOverrides', () => ({
  useTreeColorOverrides: () => {},
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { PersonRecord } from '@/components/person/PersonRecord';
import { PersonPage } from '@/components/person/PersonPage';
import { BloodlineColumn } from '@/components/person/BloodlineColumn';

function subject(overrides: Partial<PersonSubject> = {}): PersonSubject {
  return {
    id: 'p1',
    name: 'عبدالله',
    givenName: 'عبدالله',
    surname: '',
    kunya: '',
    gender: 'male',
    birth: '',
    birthHijriDate: '',
    birthPlace: '',
    death: '',
    deathHijriDate: '',
    deathPlace: '',
    notes: '',
    isDeceased: false,
    living: true,
    house: '',
    ...overrides,
  };
}

function emptyProjection(subjectOverrides: Partial<PersonSubject> = {}): PersonProjection {
  return {
    subject: subject(subjectOverrides),
    paternalChain: [],
    maternalChain: [],
    marriages: [],
    grandchildren: [],
    siblings: [],
    paternalUncles: [],
    maternalUncles: [],
    paternalCousins: [],
    maternalCousins: [],
    rada: { fathers: [], mothers: [], siblings: [] },
  };
}

const hrefFor = (id: string) => `/p/${id}`;

describe('PersonRecord — empty-section hiding', () => {
  it('renders nothing when the record has no fields to show', () => {
    const { container } = render(<PersonRecord subject={subject()} />);
    expect(container.firstChild).toBeNull();
    expect(container.textContent).not.toContain('السجل');
  });

  it('renders the section when there is at least one field (a birth place)', () => {
    const { container } = render(
      <PersonRecord subject={subject({ birthPlace: 'مكة المكرمة' })} />,
    );
    expect(container.textContent).toContain('السجل');
    expect(container.textContent).toContain('مكة المكرمة');
  });

  it('renders for a deceased person with a death place even when birth is blank', () => {
    const { container } = render(
      <PersonRecord subject={subject({ living: false, isDeceased: true, deathPlace: 'المدينة المنورة' })} />,
    );
    expect(container.textContent).toContain('السجل');
    expect(container.textContent).toContain('المدينة المنورة');
  });

  it('does NOT render for a LIVING person whose only field is a death place (death is hidden for the living)', () => {
    // The record only shows الوفاة for the deceased; a living person with a
    // stray deathPlace has no displayable field → the section must stay hidden.
    const { container } = render(
      <PersonRecord subject={subject({ living: true, deathPlace: 'المدينة المنورة' })} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('PersonPage — empty-section hiding', () => {
  it('omits the السجل heading + hint entirely when the subject record is empty', () => {
    const { container } = render(
      <PersonPage
        projection={emptyProjection()}
        hrefFor={hrefFor}
        backHref="/back"
        treeHref="/tree"
      />,
    );
    expect(container.textContent).not.toContain('السجل');
    expect(container.textContent).not.toContain('المولد، والمكان، والملاحظات.');
  });

  it('still renders السجل when the subject has record content', () => {
    const { container } = render(
      <PersonPage
        projection={emptyProjection({ birthPlace: 'مكة المكرمة' })}
        hrefFor={hrefFor}
        backHref="/back"
        treeHref="/tree"
      />,
    );
    expect(container.textContent).toContain('السجل');
    expect(container.textContent).toContain('مكة المكرمة');
  });

  it('omits «الأسرة والصلات» when there are no family relations at all', () => {
    const { container } = render(
      <PersonPage
        projection={emptyProjection()}
        hrefFor={hrefFor}
        backHref="/back"
        treeHref="/tree"
      />,
    );
    expect(container.textContent).not.toContain('الأسرة والصلات');
  });

  it('omits «سلسلتا النسب» when both chains are empty', () => {
    const { container } = render(
      <PersonPage
        projection={emptyProjection()}
        hrefFor={hrefFor}
        backHref="/back"
        treeHref="/tree"
      />,
    );
    expect(container.textContent).not.toContain('سلسلتا النسب');
  });

  it('shows «سلسلتا النسب» with only the paternal column when the maternal chain is empty', () => {
    const proj = emptyProjection();
    proj.paternalChain = [
      {
        id: 'f1',
        name: 'هاشم',
        givenName: 'هاشم',
        gender: 'male',
        birth: '',
        birthHijriDate: '',
        death: '',
        deathHijriDate: '',
        isDeceased: true,
        private: false,
      },
    ];
    const { container } = render(
      <PersonPage projection={proj} hrefFor={hrefFor} backHref="/back" treeHref="/tree" />,
    );
    expect(container.textContent).toContain('سلسلتا النسب');
    // Exactly ONE bloodline column renders (the paternal one). The empty maternal
    // column collapses — so its ancestor card / terminus does not appear. (The
    // section HINT legitimately mentions both نسب الأب/نسب الأم in prose, so we
    // count the rendered column kicker elements, not the raw text.)
    const kickers = Array.from(container.querySelectorAll('*')).filter(
      (el) =>
        el.children.length === 0 &&
        (el.textContent === 'نسب الأب' || el.textContent === 'نسب الأم'),
    );
    expect(kickers.map((k) => k.textContent)).toEqual(['نسب الأب']);
  });
});

describe('PersonPage — marriage label (ordinal only when plural)', () => {
  function spouseChip(id: string, name: string): PersonChip {
    return {
      id, name, givenName: name, gender: 'female',
      birth: '', birthHijriDate: '', death: '', deathHijriDate: '',
      isDeceased: false, private: false, living: true,
    };
  }
  function withMarriages(n: number): PersonProjection {
    const p = emptyProjection();
    p.marriages = Array.from({ length: n }, (_, i) => ({
      familyId: `fam-${i}`,
      spouse: spouseChip(`sp-${i}`, `زوجة ${i + 1}`),
      children: [],
    }));
    return p;
  }

  it('a SINGLE marriage reads «الزواج» with no ordinal', () => {
    const { container } = render(
      <PersonPage projection={withMarriages(1)} hrefFor={hrefFor} backHref="/back" treeHref="/tree" />,
    );
    expect(container.textContent).toContain('الزواج');
    expect(container.textContent).not.toContain('الزواج الأول');
  });

  it('MULTIPLE marriages use the ordinals (الأول / الثاني)', () => {
    const { container } = render(
      <PersonPage projection={withMarriages(2)} hrefFor={hrefFor} backHref="/back" treeHref="/tree" />,
    );
    expect(container.textContent).toContain('الزواج الأول');
    expect(container.textContent).toContain('الزواج الثاني');
  });
});

describe('BloodlineColumn — empty-column hiding', () => {
  const FATHER: import('@/lib/tree/person-projection').SpineChip = {
    id: 'f1',
    name: 'هاشم',
    givenName: 'هاشم',
    gender: 'male',
    birth: '',
    birthHijriDate: '',
    death: '',
    deathHijriDate: '',
    isDeceased: true,
    private: false,
  };

  it('renders nothing when the chain is empty (only the subject would show)', () => {
    const { container } = render(
      <BloodlineColumn
        variant="maternal"
        kicker="نسب الأم"
        chain={[]}
        subject={subject()}
        hrefFor={hrefFor}
      />,
    );
    expect(container.firstChild).toBeNull();
    expect(container.textContent).not.toContain('نسب الأم');
  });

  it('renders the column (kicker + ancestors) when the chain has entries', () => {
    const { container } = render(
      <BloodlineColumn
        variant="paternal"
        kicker="نسب الأب"
        chain={[FATHER]}
        subject={subject()}
        hrefFor={hrefFor}
      />,
    );
    expect(container.textContent).toContain('نسب الأب');
    expect(container.textContent).toContain('هاشم');
  });
});

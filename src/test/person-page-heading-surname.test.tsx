import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { PersonProjection, PersonSubject, SpineChip } from '@/lib/tree/person-projection';

// Person Page heading: the nasab chain NEVER carries the family name — with or
// without a «قفزة نسب». The family name appears ONCE, in the «من بيت X» tag.
// (A trailing surname after «… من وَلَد عدنان» would read as عدنان's house.)

vi.mock('@/hooks/useCalendarPreference', () => ({
  useCalendarPreference: () => ({ preference: 'hijri', setPreference: vi.fn(), loading: false }),
}));
vi.mock('@/hooks/useTreeColorOverrides', () => ({ useTreeColorOverrides: () => {} }));
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { PersonPage } from '@/components/person/PersonPage';

const SURNAME = 'آل السعيد';

const subject: PersonSubject = {
  id: 'p1', name: `باسل ${SURNAME}`, givenName: 'باسل', surname: SURNAME, kunya: '',
  gender: 'male', birth: '', birthHijriDate: '', birthPlace: '', death: '', deathHijriDate: '',
  deathPlace: '', notes: '', isDeceased: false, living: true, house: '',
};

function chip(id: string, givenName: string, jump?: SpineChip['jump']): SpineChip {
  return {
    id, name: givenName, givenName, gender: 'male', birth: '', birthHijriDate: '', death: '',
    deathHijriDate: '', isDeceased: true, living: false, private: false, ...(jump ? { jump } : {}),
  } as SpineChip;
}

function projection(chain: SpineChip[]): PersonProjection {
  return {
    subject,
    paternalChain: chain,
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

function heading(container: HTMLElement) {
  return container.querySelector('h1')!.textContent ?? '';
}

const plainChain = [chip('g', 'سعيد'), chip('f', 'محمد')];
const jumpChain = [chip('adnan', 'عدنان', { generationsMin: null, generationsMax: null }), chip('f', 'محمد')];

describe.each([
  ['member', undefined],
  ['public', 'public' as const],
])('PersonPage heading (%s)', (_label, variant) => {
  const renderPage = (chain: SpineChip[]) =>
    render(
      <PersonPage
        projection={projection(chain)}
        hrefFor={(id) => `/p/${id}`}
        backHref="/back"
        treeHref="/tree"
        {...(variant ? { variant } : {})}
      />,
    );

  it('the nasab heading carries no family name', () => {
    const { container } = renderPage(plainChain);
    expect(heading(container)).not.toContain(SURNAME);
  });

  it('the nasab heading carries no family name across a jump', () => {
    const { container } = renderPage(jumpChain);
    expect(heading(container)).toContain('عدنان');
    expect(heading(container)).not.toContain(SURNAME);
  });

  it('the family name is shown in the «من بيت» line', () => {
    const { container } = renderPage(jumpChain);
    expect(container.textContent).toContain(`من بيت ${SURNAME}`);
  });
});

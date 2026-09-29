import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MotherLine, SpineChip } from '@/lib/tree/person-projection';

// The mother's-lineage strip (MotherRibbon, inside «نسب أمه») uses the same
// lead-name rules as the hero NasabRibbon: each father is linked by the name he
// LEADS with, in the genitive after بن/بنت, with a tiny caption of his other
// name. Owner chain: … ← عمرو «هاشم» ← شيبة «عبدالمطلب» ← عبدمناف «أبو طالب».

vi.mock('@/hooks/useCalendarPreference', () => ({
  useCalendarPreference: () => ({ preference: 'hijri', setPreference: vi.fn(), loading: false }),
}));
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [k: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { MotherRibbon } from '@/components/person/MotherDisclosure';

function chip(id: string, givenName: string, famousName = ''): SpineChip {
  return {
    id, name: `${givenName} بني هاشم`, givenName, famousName, gender: 'male', birth: '',
    birthHijriDate: '', death: '', deathHijriDate: '', isDeceased: true, living: false,
    private: false,
  };
}

const privateChip: SpineChip = {
  name: 'خاص', givenName: 'خاص', famousName: '', gender: 'male', birth: '', birthHijriDate: '',
  death: '', deathHijriDate: '', isDeceased: false, private: true,
};

function motherWith(fathers: SpineChip[]): MotherLine {
  return {
    id: 'fa', name: 'فاطمة بني هاشم', givenName: 'فاطمة', famousName: '', gender: 'female',
    birth: '', birthHijriDate: '', death: '', deathHijriDate: '', isDeceased: true,
    living: false, private: false, fathers,
  };
}

// Nearest → oldest, as the projection emits a mother's fathers.
const ownerFathers: SpineChip[] = [
  chip('at', 'عبدمناف', 'أبو طالب'),
  chip('am', 'شيبة', 'عبدالمطلب'),
  chip('hs', 'عمرو', 'هاشم'),
  chip('mn', 'عبدمناف'),
];

const hrefFor = (id: string) => `/person/${id}`;
const linkNames = () => screen.getAllByRole('link').map((a) => a.getAttribute('href') + '=' + a.textContent);

describe('MotherRibbon — lead names', () => {
  it('links the fathers by their lead names (genitive), not their real names', () => {
    render(<MotherRibbon mother={motherWith(ownerFathers)} hrefFor={hrefFor} />);
    expect(linkNames()).toEqual([
      '/person/fa=فاطمة بني هاشم',
      '/person/at=أبي طالب',
      '/person/am=عبدالمطلب',
      '/person/hs=هاشم',
      '/person/mn=عبدمناف بني هاشم',
    ]);
  });

  it('describes a famous-name father with his real name («واسمه عبدمناف»)', () => {
    render(<MotherRibbon mother={motherWith(ownerFathers)} hrefFor={hrefFor} />);
    expect(screen.getByRole('link', { name: 'أبي طالب' })).toHaveAccessibleDescription('واسمه عبدمناف');
  });

  it('captions each famous-name father with his «واسمه …» line', () => {
    const { container } = render(<MotherRibbon mother={motherWith(ownerFathers)} hrefFor={hrefFor} />);
    const captions = [...container.querySelectorAll('[aria-hidden="true"]')].map((n) => n.textContent).filter(Boolean);
    expect(captions).toEqual(['واسمه عبدمناف', 'واسمه شيبة', 'واسمه عمرو']);
  });

  it('links a famous-name mother by her lead name', () => {
    const mother = { ...motherWith([]), givenName: 'فاطمة', famousName: 'أم الخير' };
    render(<MotherRibbon mother={mother} hrefFor={hrefFor} />);
    expect(screen.getByRole('link', { name: 'أم الخير' })).toHaveAttribute('href', '/person/fa');
  });

  it('keeps a private father as a bare «خاص» token', () => {
    render(<MotherRibbon mother={motherWith([chip('at', 'عبدمناف', 'أبو طالب'), privateChip])} hrefFor={hrefFor} />);
    expect(screen.getByText('خاص').tagName).toBe('SPAN');
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NasabRibbon } from '@/components/person/NasabRibbon';
import { PersonLink } from '@/components/person/PersonLink';
import type { PersonSubject, SpineChip } from '@/lib/tree/person-projection';

// The hero nasab ribbon and its inline PersonLink. The load-bearing rule under
// test: the PAGE'S SUBJECT (the lead) is NOT a navigation target — linking the
// page to itself reads as a dead end — while every ancestor stays clickable and
// a private ancestor stays a non-clickable «خاص» token. (Bug 1.)

const subject: PersonSubject = {
  id: 'p-self',
  name: 'باسل آل السعيد',
  givenName: 'باسل',
  surname: 'آل السعيد',
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
  house: 'آل السعيد',
};

function anc(id: string, name: string, isPrivate = false): SpineChip {
  return {
    ...(isPrivate ? {} : { id }),
    name: isPrivate ? 'خاص' : name,
    givenName: isPrivate ? 'خاص' : name,
    gender: 'male',
    birth: '',
    birthHijriDate: '',
    death: '',
    deathHijriDate: '',
    isDeceased: false,
    living: false,
    private: isPrivate,
  } as SpineChip;
}

const chain: SpineChip[] = [
  anc('p-grand', 'عمر'),
  anc('p-priv', '', true),
  anc('p-father', 'خالد'),
];

const hrefFor = (id: string) => `/person/${id}`;

describe('NasabRibbon — subject is not a link', () => {
  it('renders the subject given name as a non-anchor element', () => {
    render(<NasabRibbon subject={subject} chain={chain} hrefFor={hrefFor} />);
    const lead = screen.getByText('باسل');
    expect(lead.tagName.toLowerCase()).not.toBe('a');
    expect(lead.closest('a')).toBeNull();
  });

  it('the subject name carries no href to its own page', () => {
    const { container } = render(
      <NasabRibbon subject={subject} chain={chain} hrefFor={hrefFor} />,
    );
    // No link in the whole ribbon should point at the subject's own page.
    const selfLinks = container.querySelectorAll(`a[href="/person/${subject.id}"]`);
    expect(selfLinks.length).toBe(0);
  });

  it('keeps the ancestors clickable (real links to their pages)', () => {
    render(<NasabRibbon subject={subject} chain={chain} hrefFor={hrefFor} />);
    const father = screen.getByText('خالد');
    const grand = screen.getByText('عمر');
    expect(father.closest('a')).toHaveAttribute('href', '/person/p-father');
    expect(grand.closest('a')).toHaveAttribute('href', '/person/p-grand');
  });

  it('renders a private ancestor as a non-clickable «خاص» token', () => {
    render(<NasabRibbon subject={subject} chain={chain} hrefFor={hrefFor} />);
    const priv = screen.getByLabelText('فرد خاص');
    expect(priv.tagName.toLowerCase()).toBe('span');
    expect(priv.closest('a')).toBeNull();
    expect(priv).toHaveTextContent('خاص');
  });
});

describe('NasabRibbon — surname shown once, correct بن/بنت', () => {
  // An ancestor whose full `name` (given + surname) DIFFERS from its bare
  // `givenName`, to prove the ribbon renders only the given name (the shared
  // family name prints once at the very end, not after every father).
  const fatherWithSurname: SpineChip = {
    id: 'p-fa',
    name: 'خالد آل السعيد',
    givenName: 'خالد',
    gender: 'male',
    birth: '', birthHijriDate: '', death: '', deathHijriDate: '',
    isDeceased: true, living: false, private: false,
  };

  it('renders ancestors by GIVEN name only — the surname is not repeated per father', () => {
    render(<NasabRibbon subject={subject} chain={[fatherWithSurname]} hrefFor={hrefFor} />);
    // The given name is the link text…
    expect(screen.getByText('خالد').closest('a')).toHaveAttribute('href', '/person/p-fa');
    // …and the ancestor's full "given + surname" string never appears.
    expect(screen.queryByText('خالد آل السعيد')).toBeNull();
  });

  it('shows the family name exactly once (the trailing ribbon surname)', () => {
    const { container } = render(
      <NasabRibbon subject={subject} chain={[fatherWithSurname]} hrefFor={hrefFor} />,
    );
    const occurrences = (container.textContent?.split('آل السعيد').length ?? 1) - 1;
    expect(occurrences).toBe(1);
  });

  it('uses بنت for a FEMALE subject (رندة بنت بشر), not بن', () => {
    const female: PersonSubject = { ...subject, id: 'p-f', givenName: 'رندة', gender: 'female' };
    const father: SpineChip = { ...fatherWithSurname, id: 'p-b', name: 'بشر', givenName: 'بشر' };
    const { container } = render(<NasabRibbon subject={female} chain={[father]} hrefFor={hrefFor} />);
    expect(container.textContent).toContain('بنت');
  });

  it('uses بن for a MALE subject', () => {
    const father: SpineChip = { ...fatherWithSurname, id: 'p-b', name: 'بشر', givenName: 'بشر' };
    const { container } = render(<NasabRibbon subject={subject} chain={[father]} hrefFor={hrefFor} />);
    expect(container.textContent).toContain('بن');
    expect(container.textContent).not.toContain('بنت');
  });
});

describe('PersonLink — interactive flag', () => {
  it('renders an anchor by default', () => {
    render(<PersonLink chip={{ id: 'x', name: 'فلان' }} hrefFor={hrefFor} />);
    expect(screen.getByText('فلان').tagName.toLowerCase()).toBe('a');
  });

  it('renders a span (no anchor) when interactive is false', () => {
    render(
      <PersonLink chip={{ id: 'x', name: 'فلان' }} interactive={false} hrefFor={hrefFor} />,
    );
    const el = screen.getByText('فلان');
    expect(el.tagName.toLowerCase()).toBe('span');
    expect(el.closest('a')).toBeNull();
  });
});

/**
 * «قفزة نسب» — Person Page UI (§7.6).
 *
 * Three surfaces:
 *  - The NAME surfaces (`NasabRibbon`, `MotherRibbon`) put the connector
 *    «من وَلَد» where the «بن» token would stand — the same wording
 *    `getDisplayNameWithNasab` prints, so a name reads the same everywhere:
 *    «عدنان، من وَلَد إسماعيل». Printing «بن» there would be the false parent
 *    claim the whole feature exists to avoid; printing the feature's own name
 *    («قفزة نسب») or its generation range there would put a label inside a
 *    person's name.
 *  - The `BloodlineColumn` is not a name but the canvas's broken thread stood on
 *    end, so it wears the canvas's own dashed chip, labelled by the very same
 *    `formatAncestryJumpLabel` the edge uses.
 *  - `AncestryJumpBlock` is where the feature is NAMED and the range stated.
 *    It shows the ancestor COUPLE, and is the ONLY place a female-only distant
 *    ancestor ever appears.
 *
 * Plain Western digits everywhere, matching the rest of the app.
 */
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type {
  AncestryJumpProjection,
  MotherLine,
  PersonSubject,
  SpineChip,
} from '@/lib/tree/person-projection';

vi.mock('@/hooks/useCalendarPreference', () => ({
  useCalendarPreference: () => ({ preference: 'hijri', setPreference: vi.fn(), loading: false }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [k: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { JUMP_CONNECTOR } from '@/lib/gedcom/display';
import { NasabRibbon } from '@/components/person/NasabRibbon';
import { AncestryJumpBlock } from '@/components/person/AncestryJumpBlock';
import { MotherRibbon } from '@/components/person/MotherDisclosure';
import { BloodlineColumn } from '@/components/person/BloodlineColumn';
import { formatAncestryJumpLabel } from '@/components/tree/FamilyTree/buildTreeData';

const hrefFor = (id: string) => `/person/${id}`;

function subject(overrides: Partial<PersonSubject> = {}): PersonSubject {
  return {
    id: 'ADNAN',
    name: 'عدنان',
    givenName: 'عدنان',
    surname: 'العدنانية',
    kunya: '',
    gender: 'male',
    birth: '',
    birthHijriDate: '',
    birthPlace: '',
    death: '',
    deathHijriDate: '',
    deathPlace: '',
    notes: '',
    isDeceased: true,
    living: false,
    house: '',
    ...overrides,
  };
}

function chip(overrides: Partial<SpineChip> & { id?: string; givenName: string }): SpineChip {
  return {
    name: overrides.givenName,
    gender: 'male',
    birth: '',
    birthHijriDate: '',
    death: '',
    deathHijriDate: '',
    isDeceased: true,
    private: false,
    ...overrides,
  } as SpineChip;
}

/** Spine oldest → nearest: إبراهيم, then إسماعيل reached BY the jump. */
function chain(jump: SpineChip['jump']): SpineChip[] {
  return [
    chip({ id: 'IBRAHIM', givenName: 'إبراهيم' }),
    chip({ id: 'ISH', givenName: 'إسماعيل', jump }),
  ];
}

// ---------------------------------------------------------------------------
// NasabRibbon
// ---------------------------------------------------------------------------

describe('NasabRibbon at a jump-marked chip', () => {
  test('renders the «من وَلَد» connector instead of a «بن» token', () => {
    render(
      <NasabRibbon
        subject={subject()}
        chain={chain({ generationsMin: 4, generationsMax: 40 })}
        hrefFor={hrefFor}
      />,
    );
    expect(screen.getByText(JUMP_CONNECTOR)).toBeTruthy();
    // Exactly ONE «بن» remains: إسماعيل بن إبراهيم, above the jump.
    expect(screen.getAllByText('بن').length).toBe(1);
  });

  test('reads «عدنان، من وَلَد إسماعيل» — comma, connector, ancestor', () => {
    const { container } = render(
      <NasabRibbon
        subject={subject()}
        chain={chain({ generationsMin: 4, generationsMax: 40 })}
        hrefFor={hrefFor}
      />,
    );
    const text = container.textContent ?? '';
    // The comma binds to the name BEFORE the connector, exactly as
    // `getDisplayNameWithNasab` punctuates it.
    expect(text).toContain('عدنان،');
    expect(text.indexOf('عدنان')).toBeLessThan(text.indexOf(JUMP_CONNECTOR));
    expect(text.indexOf(JUMP_CONNECTOR)).toBeLessThan(text.indexOf('إسماعيل'));
  });

  test('never puts the feature name «قفزة نسب» inside the name', () => {
    const { container } = render(
      <NasabRibbon
        subject={subject()}
        chain={chain({ generationsMin: 4, generationsMax: 40 })}
        hrefFor={hrefFor}
      />,
    );
    expect(container.textContent).not.toContain('قفزة نسب');
  });

  test('never states the generation range inside the name', () => {
    const { container } = render(
      <NasabRibbon
        subject={subject()}
        chain={chain({ generationsMin: 4, generationsMax: 40 })}
        hrefFor={hrefFor}
      />,
    );
    // The range belongs to `AncestryJumpBlock` and the canvas chip — a name is
    // not the place to quantify a gap.
    expect(container.textContent).not.toMatch(/جيل|أجيال/);
  });

  test('says nothing about generations when neither bound is stated', () => {
    const { container } = render(
      <NasabRibbon
        subject={subject()}
        chain={chain({ generationsMin: null, generationsMax: null })}
        hrefFor={hrefFor}
      />,
    );
    expect(screen.getByText(JUMP_CONNECTOR)).toBeTruthy();
    expect(container.textContent).not.toMatch(/جيل|أجيال/);
  });

  test('a jump-free chain still reads as an ordinary nasab', () => {
    const { container } = render(
      <NasabRibbon subject={subject()} chain={chain(undefined)} hrefFor={hrefFor} />,
    );
    expect(screen.queryByText(JUMP_CONNECTOR)).toBeNull();
    expect(screen.getAllByText('بن').length).toBe(2);
    expect(container.textContent).toContain('إسماعيل');
  });
});

// ---------------------------------------------------------------------------
// MotherRibbon — the female line crosses jumps too
// ---------------------------------------------------------------------------

function motherLine(fathers: SpineChip[]): MotherLine {
  return {
    ...chip({ id: 'SALMA', givenName: 'سلمى' }),
    gender: 'female',
    fathers,
  };
}

describe('MotherRibbon at a jump-marked father', () => {
  test('never renders «بن» or «بنت» across the jump', () => {
    render(
      <MotherRibbon
        mother={motherLine([
          chip({ id: 'ISH', givenName: 'إسماعيل', jump: { generationsMin: 7, generationsMax: null } }),
          chip({ id: 'IBRAHIM', givenName: 'إبراهيم' }),
        ])}
        hrefFor={hrefFor}
      />,
    );
    expect(screen.getByText(JUMP_CONNECTOR)).toBeTruthy();
    // The «بنت» that would normally lead سلمى's chain is replaced by the
    // connector; the only one left is إسماعيل بن إبراهيم, above the jump.
    expect(screen.queryByText('بنت')).toBeNull();
    expect(screen.getAllByText('بن').length).toBe(1);
  });

  test('names neither the feature nor the range inside the mother ribbon', () => {
    const { container } = render(
      <MotherRibbon
        mother={motherLine([
          chip({ id: 'ISH', givenName: 'إسماعيل', jump: { generationsMin: 7, generationsMax: null } }),
        ])}
        hrefFor={hrefFor}
      />,
    );
    expect(screen.getByText(JUMP_CONNECTOR)).toBeTruthy();
    expect(container.textContent).not.toContain('قفزة نسب');
    expect(container.textContent).not.toMatch(/جيل|أجيال/);
  });

  test('a jump-free mother chain still reads «بنت … بن …»', () => {
    render(
      <MotherRibbon
        mother={motherLine([
          chip({ id: 'ISH', givenName: 'إسماعيل' }),
          chip({ id: 'IBRAHIM', givenName: 'إبراهيم' }),
        ])}
        hrefFor={hrefFor}
      />,
    );
    expect(screen.queryByText(JUMP_CONNECTOR)).toBeNull();
    expect(screen.getByText('بنت')).toBeTruthy();
    expect(screen.getAllByText('بن').length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// BloodlineColumn — the «سلسلة النسب» column crosses jumps too
// ---------------------------------------------------------------------------

/**
 * The vertical column is NOT a name — it is the same broken thread the canvas
 * draws, stood on end. So it wears the canvas's own dashed chip, labelled by the
 * very same `formatAncestryJumpLabel`, rather than the in-name connector: a
 * reader who saw the dashed chip on the tree meets the identical marker here.
 */
describe('BloodlineColumn at a jump-marked ancestor', () => {
  test('never badges the ancestor reached by a jump as «الأب»', () => {
    render(
      <BloodlineColumn
        variant="paternal"
        kicker="سلسلة النسب"
        chain={chain({ generationsMin: 4, generationsMax: 40 })}
        subject={subject()}
        hrefFor={hrefFor}
      />,
    );
    // إسماعيل sits nearest the subject, but he was reached ACROSS the jump —
    // calling him the father would be the false parent claim the whole feature
    // exists to prevent.
    expect(screen.queryByText('الأب')).toBeNull();
  });

  test('renders the canvas chip — feature name plus the stated range', () => {
    render(
      <BloodlineColumn
        variant="paternal"
        kicker="سلسلة النسب"
        chain={chain({ generationsMin: 4, generationsMax: 40 })}
        subject={subject()}
        hrefFor={hrefFor}
      />,
    );
    expect(
      screen.getByText(formatAncestryJumpLabel({ generationsMin: 4, generationsMax: 40 })),
    ).toBeTruthy();
    expect(screen.getByText('قفزة نسب · بين 4 و40 جيلاً')).toBeTruthy();
  });

  test('renders a bare «قفزة نسب» chip when no range is stated', () => {
    const { container } = render(
      <BloodlineColumn
        variant="paternal"
        kicker="سلسلة النسب"
        chain={chain({ generationsMin: null, generationsMax: null })}
        subject={subject()}
        hrefFor={hrefFor}
      />,
    );
    expect(screen.getByText('قفزة نسب')).toBeTruthy();
    // An unstated gap is the honest default: the chip must not invent a count.
    expect(container.textContent).not.toMatch(/جيل|أجيال/);
  });

  test('stands the chip between the jump ancestor and the subject', () => {
    const { container } = render(
      <BloodlineColumn
        variant="paternal"
        kicker="سلسلة النسب"
        chain={chain({ generationsMin: 4, generationsMax: 40 })}
        subject={subject()}
        hrefFor={hrefFor}
      />,
    );
    const text = container.textContent ?? '';
    // Column order is oldest → subject, so the gap marker stands below إسماعيل
    // and above the subject's own terminus card.
    expect(text.indexOf('إسماعيل')).toBeLessThan(text.indexOf('قفزة نسب'));
    expect(text.indexOf('قفزة نسب')).toBeLessThan(text.indexOf('الشخص المعروض'));
  });

  test('never spans the gap with a nasab token or the in-name connector', () => {
    render(
      <BloodlineColumn
        variant="paternal"
        kicker="سلسلة النسب"
        chain={chain({ generationsMin: 4, generationsMax: 40 })}
        subject={subject()}
        hrefFor={hrefFor}
      />,
    );
    expect(screen.queryByText('بن')).toBeNull();
    // The column is a thread, not a name — «من وَلَد» belongs to the ribbons.
    expect(screen.queryByText(JUMP_CONNECTOR)).toBeNull();
  });

  test('a jump-free spine still badges the nearest ancestor «الأب»', () => {
    const { container } = render(
      <BloodlineColumn
        variant="paternal"
        kicker="سلسلة النسب"
        chain={chain(undefined)}
        subject={subject()}
        hrefFor={hrefFor}
      />,
    );
    expect(screen.getByText('الأب')).toBeTruthy();
    expect(container.textContent).not.toContain('قفزة نسب');
    expect(screen.queryByText(JUMP_CONNECTOR)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AncestryJumpBlock
// ---------------------------------------------------------------------------

function jumpProjection(overrides: Partial<AncestryJumpProjection> = {}): AncestryJumpProjection {
  return {
    generationsMin: 4,
    generationsMax: 40,
    notes: 'نصّ عليه ابن هشام في السيرة',
    father: { id: 'ISH', name: 'إسماعيل', givenName: 'إسماعيل', gender: 'male', birth: '', birthHijriDate: '', death: '', deathHijriDate: '', isDeceased: true, private: false },
    mother: { id: 'HAJAR', name: 'هاجر', givenName: 'هاجر', gender: 'female', birth: '', birthHijriDate: '', death: '', deathHijriDate: '', isDeceased: true, private: false },
    ...overrides,
  };
}

describe('AncestryJumpBlock', () => {
  test('renders the heading, both ancestors and the range', () => {
    render(<AncestryJumpBlock jump={jumpProjection()} hrefFor={hrefFor} />);
    expect(screen.getByText('قفزة نسب')).toBeTruthy();
    expect(screen.getByText('إسماعيل')).toBeTruthy();
    expect(screen.getByText('هاجر')).toBeTruthy();
    expect(screen.getByText('بين 4 و40 جيلاً')).toBeTruthy();
  });

  test('renders the scholarly note that justifies the link', () => {
    render(<AncestryJumpBlock jump={jumpProjection()} hrefFor={hrefFor} />);
    expect(screen.getByText('نصّ عليه ابن هشام في السيرة')).toBeTruthy();
  });

  test('renders a female-only ancestor — the one place she appears', () => {
    render(<AncestryJumpBlock jump={jumpProjection({ father: null })} hrefFor={hrefFor} />);
    expect(screen.getByText('هاجر')).toBeTruthy();
    expect(screen.queryByText('إسماعيل')).toBeNull();
  });

  test('renders nothing when there is no jump', () => {
    const { container } = render(<AncestryJumpBlock jump={undefined} hrefFor={hrefFor} />);
    expect(container.innerHTML).toBe('');
  });

  test('renders nothing when both ancestors are withheld', () => {
    const { container } = render(
      <AncestryJumpBlock jump={jumpProjection({ father: null, mother: null })} hrefFor={hrefFor} />,
    );
    expect(container.innerHTML).toBe('');
  });
});

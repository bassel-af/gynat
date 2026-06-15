import { describe, test, expect } from 'vitest';
import type { GedcomData, Individual } from '@/lib/gedcom/types';
import {
  isPresumedLiving,
  computeLivingForCheckpoint,
  redactForPublic,
  PRESUMED_DECEASED_AGE_YEARS,
} from '@/lib/tree/public-visibility';

// ---------------------------------------------------------------------------
// Fixture builders (same pattern as cascade-delete.test.ts)
// ---------------------------------------------------------------------------

function makeIndividual(overrides: Partial<Individual> & { id: string }): Individual {
  return {
    type: 'INDI',
    name: overrides.id,
    givenName: overrides.id,
    surname: '',
    sex: 'M',
    birth: '',
    birthPlace: '',
    birthDescription: '',
    birthNotes: '',
    birthHijriDate: '',
    death: '',
    deathPlace: '',
    deathDescription: '',
    deathNotes: '',
    deathHijriDate: '',
    kunya: '',
    notes: '',
    isDeceased: false,
    isPrivate: false,
    familiesAsSpouse: [],
    familyAsChild: null,
    ...overrides,
  };
}

// A fixed "now" so 130-year math is deterministic.
const NOW = new Date('2026-06-15T00:00:00Z');

// ---------------------------------------------------------------------------
// isPresumedLiving — the single living-status rule
// ---------------------------------------------------------------------------

describe('isPresumedLiving', () => {
  test('person marked deceased is not living', () => {
    const p = makeIndividual({ id: 'p', isDeceased: true });
    expect(isPresumedLiving(p, NOW)).toBe(false);
  });

  test('person with no birth date and no deceased mark is living', () => {
    const p = makeIndividual({ id: 'p', birth: '', isDeceased: false });
    expect(isPresumedLiving(p, NOW)).toBe(true);
  });

  test('person born within 130 years and not deceased is living', () => {
    const p = makeIndividual({ id: 'p', birth: '1990', isDeceased: false });
    expect(isPresumedLiving(p, NOW)).toBe(true);
  });

  test('person born more than 130 years ago is presumed deceased', () => {
    const p = makeIndividual({ id: 'p', birth: '1850', isDeceased: false });
    expect(isPresumedLiving(p, NOW)).toBe(false);
  });

  test('the cutoff constant is 130 years', () => {
    expect(PRESUMED_DECEASED_AGE_YEARS).toBe(130);
  });

  test('person born exactly at the cutoff boundary is presumed deceased', () => {
    // born 130 years ago -> age == cutoff -> deceased
    const cutoffYear = NOW.getUTCFullYear() - PRESUMED_DECEASED_AGE_YEARS;
    const p = makeIndividual({ id: 'p', birth: String(cutoffYear), isDeceased: false });
    expect(isPresumedLiving(p, NOW)).toBe(false);
  });

  test('extracts a 4-digit year from a full date string', () => {
    const p = makeIndividual({ id: 'p', birth: '12 JAN 1850', isDeceased: false });
    expect(isPresumedLiving(p, NOW)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeLivingForCheckpoint — checkpoint view-model
// ---------------------------------------------------------------------------

describe('computeLivingForCheckpoint', () => {
  test('counts only living people', () => {
    const data: GedcomData = {
      individuals: {
        living: makeIndividual({ id: 'living', birth: '1990' }),
        deceased: makeIndividual({ id: 'deceased', isDeceased: true }),
        ancient: makeIndividual({ id: 'ancient', birth: '1800' }),
      },
      families: {},
    };
    const result = computeLivingForCheckpoint(data, NOW);
    expect(result.livingCount).toBe(1);
  });

  test('people with no birth date land in the attention bucket', () => {
    const data: GedcomData = {
      individuals: {
        noDate: makeIndividual({ id: 'noDate', name: 'بلا تاريخ', birth: '' }),
      },
      families: {},
    };
    const result = computeLivingForCheckpoint(data, NOW);
    expect(result.attention).toHaveLength(1);
    expect(result.attention[0].id).toBe('noDate');
    expect(result.attention[0].needsAttention).toBe(true);
  });

  test('maps sex M to gender male and F to female, null to male', () => {
    const data: GedcomData = {
      individuals: {
        m: makeIndividual({ id: 'm', sex: 'M', birth: '1990' }),
        f: makeIndividual({ id: 'f', sex: 'F', birth: '1990' }),
        n: makeIndividual({ id: 'n', sex: null, birth: '1990' }),
      },
      families: {},
    };
    const result = computeLivingForCheckpoint(data, NOW);
    const all = [...result.attention, ...result.households.flatMap((h) => h.members)];
    expect(all.find((p) => p.id === 'm')?.gender).toBe('male');
    expect(all.find((p) => p.id === 'f')?.gender).toBe('female');
    expect(all.find((p) => p.id === 'n')?.gender).toBe('male');
  });

  test('attention bucket meta says no birth date in Arabic', () => {
    const data: GedcomData = {
      individuals: { noDate: makeIndividual({ id: 'noDate', birth: '' }) },
      families: {},
    };
    const result = computeLivingForCheckpoint(data, NOW);
    expect(result.attention[0].meta).toContain('بلا تاريخ ميلاد');
  });

  test('living person with a birth date appears in a household, not attention', () => {
    const data: GedcomData = {
      individuals: { living: makeIndividual({ id: 'living', birth: '1990' }) },
      families: {},
    };
    const result = computeLivingForCheckpoint(data, NOW);
    expect(result.attention).toHaveLength(0);
    const members = result.households.flatMap((h) => h.members);
    expect(members.map((m) => m.id)).toContain('living');
  });

  // Contract for the checkpoint UI's zero-living variant: an all-deceased tree
  // yields livingCount === 0 with PRESENT, empty attention/households arrays —
  // the field is never omitted. The checkpoint keys its simplified "ready to
  // publish" dialog purely off `livingCount === 0`.
  test('all-deceased tree yields livingCount 0 with empty (present) arrays', () => {
    const data: GedcomData = {
      individuals: {
        dec1: makeIndividual({ id: 'dec1', isDeceased: true, birth: '1900' }),
        ancient: makeIndividual({ id: 'ancient', birth: '1850' }), // >130y -> deceased
      },
      families: {},
    };
    const result = computeLivingForCheckpoint(data, NOW);
    expect(result.livingCount).toBe(0);
    expect(result.attention).toEqual([]);
    expect(result.households).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// redactForPublic — the single public redactor
// ---------------------------------------------------------------------------

describe('redactForPublic', () => {
  test('private individuals are marked redacted with PII blanked', () => {
    const data: GedcomData = {
      individuals: {
        priv: makeIndividual({
          id: 'priv',
          name: 'سرّي',
          isPrivate: true,
          birth: '1990',
          birthPlace: 'دمشق',
          notes: 'note',
        }),
      },
      families: {},
    };
    const out = redactForPublic(data, NOW);
    const p = out.individuals.priv;
    expect(p.publicDisplay).toBe('redacted');
    expect(p.name).not.toBe('سرّي');
    expect(p.birth).toBe('');
    expect(p.birthPlace).toBe('');
    expect(p.notes).toBe('');
  });

  test('living individuals are marked living with birth date hidden but name kept', () => {
    const data: GedcomData = {
      individuals: {
        liv: makeIndividual({
          id: 'liv',
          name: 'حيّ',
          birth: '1990',
          birthHijriDate: '1410',
          birthPlace: 'دمشق',
        }),
      },
      families: {},
    };
    const out = redactForPublic(data, NOW);
    const p = out.individuals.liv;
    expect(p.publicDisplay).toBe('living');
    expect(p.name).toBe('حيّ');
    expect(p.birth).toBe('');
    expect(p.birthHijriDate).toBe('');
    expect(p.birthPlace).toBe('');
  });

  test('living individuals keep their biography and notes (سيرة shown in full)', () => {
    const data: GedcomData = {
      individuals: {
        liv: makeIndividual({
          id: 'liv',
          name: 'حيّ',
          birth: '1990',
          notes: 'سيرة هذا الشخص',
        }),
      },
      families: {},
    };
    const out = redactForPublic(data, NOW);
    expect(out.individuals.liv.notes).toBe('سيرة هذا الشخص');
  });

  test('deceased individuals are marked full and keep their birth date', () => {
    const data: GedcomData = {
      individuals: {
        dec: makeIndividual({ id: 'dec', name: 'متوفّى', isDeceased: true, birth: '1950' }),
      },
      families: {},
    };
    const out = redactForPublic(data, NOW);
    const p = out.individuals.dec;
    expect(p.publicDisplay).toBe('full');
    expect(p.birth).toBe('1950');
  });

  test('strips internal fields from every individual', () => {
    const data: GedcomData = {
      individuals: {
        x: makeIndividual({
          id: 'x',
          birth: '1950',
          isDeceased: true,
          birthPlaceId: 'place-1',
          deathPlaceId: 'place-2',
          _pointed: true,
          _sourceWorkspaceId: 'ws-secret',
          _pointerId: 'ptr-1',
        }),
      },
      families: {},
    };
    const out = redactForPublic(data, NOW);
    const p = out.individuals.x;
    expect(p._pointed).toBeUndefined();
    expect(p._sourceWorkspaceId).toBeUndefined();
    expect(p.birthPlaceId).toBeUndefined();
    expect(p.deathPlaceId).toBeUndefined();
  });

  test('does not mutate the input data', () => {
    const data: GedcomData = {
      individuals: {
        liv: makeIndividual({ id: 'liv', birth: '1990' }),
      },
      families: {},
    };
    redactForPublic(data, NOW);
    expect(data.individuals.liv.birth).toBe('1990');
    expect(data.individuals.liv.publicDisplay).toBeUndefined();
  });

  test('applies server-side hideBirthDateForFemale toggle', () => {
    const data: GedcomData = {
      individuals: {
        // Deceased female (would otherwise show full birth date)
        f: makeIndividual({ id: 'f', sex: 'F', isDeceased: true, birth: '1950', birthHijriDate: '1370' }),
      },
      families: {},
    };
    const out = redactForPublic(data, NOW, { hideBirthDateForFemale: true });
    expect(out.individuals.f.birth).toBe('');
    expect(out.individuals.f.birthHijriDate).toBe('');
  });

  test('applies server-side hideBirthDateForMale toggle', () => {
    const data: GedcomData = {
      individuals: {
        m: makeIndividual({ id: 'm', sex: 'M', isDeceased: true, birth: '1950' }),
      },
      families: {},
    };
    const out = redactForPublic(data, NOW, { hideBirthDateForMale: true });
    expect(out.individuals.m.birth).toBe('');
  });

  test('without toggles, deceased birth dates are preserved', () => {
    const data: GedcomData = {
      individuals: {
        f: makeIndividual({ id: 'f', sex: 'F', isDeceased: true, birth: '1950' }),
      },
      families: {},
    };
    const out = redactForPublic(data, NOW);
    expect(out.individuals.f.birth).toBe('1950');
  });
});

// ---------------------------------------------------------------------------
// No-leak content test (§9) — over the composed JSON feed
// ---------------------------------------------------------------------------

describe('redactForPublic — no plaintext leaks', () => {
  test('no sensitive plaintext survives in the serialized output', () => {
    const data: GedcomData = {
      individuals: {
        priv: makeIndividual({
          id: 'priv',
          name: 'PRIVATE_NAME',
          isPrivate: true,
          birth: 'PRIVATE_BIRTH',
          notes: 'PRIVATE_NOTE',
        }),
        liv: makeIndividual({
          id: 'liv',
          name: 'حيّ',
          birth: 'LIVING_BIRTH_1995',
          birthPlace: 'LIVING_PLACE',
          birthPlaceId: 'PLACEID_LEAK',
          _sourceWorkspaceId: 'WS_LEAK',
        }),
      },
      families: {},
    };
    const out = redactForPublic(data, NOW);
    const json = JSON.stringify(out);
    expect(json).not.toContain('PRIVATE_NAME');
    expect(json).not.toContain('PRIVATE_BIRTH');
    expect(json).not.toContain('PRIVATE_NOTE');
    expect(json).not.toContain('LIVING_BIRTH_1995');
    expect(json).not.toContain('LIVING_PLACE');
    expect(json).not.toContain('PLACEID_LEAK');
    expect(json).not.toContain('WS_LEAK');
  });

  test('living person inside a (pre-composed) borrowed branch has birth date hidden uniformly', () => {
    // Proves compose-then-redact: a _pointed living person is redacted the
    // same way as a home living person.
    const data: GedcomData = {
      individuals: {
        borrowedLiving: makeIndividual({
          id: 'borrowedLiving',
          name: 'مستعار',
          birth: 'BORROWED_BIRTH_2000',
          _pointed: true,
          _sourceWorkspaceId: 'SRC_WS',
        }),
      },
      families: {},
    };
    const out = redactForPublic(data, NOW);
    const p = out.individuals.borrowedLiving;
    expect(p.publicDisplay).toBe('living');
    expect(p.birth).toBe('');
    expect(JSON.stringify(out)).not.toContain('BORROWED_BIRTH_2000');
    expect(JSON.stringify(out)).not.toContain('SRC_WS');
  });
});

// ---------------------------------------------------------------------------
// Checkpoint <-> redaction agreement (§9)
// ---------------------------------------------------------------------------

describe('computeLivingForCheckpoint and redactForPublic agree on who is living', () => {
  test('the same people are classified living by both functions', () => {
    const data: GedcomData = {
      individuals: {
        living1: makeIndividual({ id: 'living1', birth: '1990' }),
        living2NoDate: makeIndividual({ id: 'living2NoDate', birth: '' }),
        deceased: makeIndividual({ id: 'deceased', isDeceased: true, birth: '1950' }),
        ancient: makeIndividual({ id: 'ancient', birth: '1800' }),
      },
      families: {},
    };

    const checkpoint = computeLivingForCheckpoint(data, NOW);
    const checkpointLivingIds = new Set([
      ...checkpoint.attention.map((p) => p.id),
      ...checkpoint.households.flatMap((h) => h.members).map((p) => p.id),
    ]);

    const redacted = redactForPublic(data, NOW);
    const redactionLivingIds = new Set(
      Object.values(redacted.individuals)
        .filter((p) => p.publicDisplay === 'living')
        .map((p) => p.id),
    );

    expect(redactionLivingIds).toEqual(checkpointLivingIds);
  });

  // Regression (found via real-data e2e): a PRIVATE living person is shown in
  // the checkpoint (the publisher must see who exists before exposing the tree)
  // but is 'redacted' — not 'living' — in the public view (privacy wins). Both
  // functions still agree on the living CLASSIFICATION; they intentionally
  // differ on the public DISPLAY for private people.
  test('a private living person is in the checkpoint but redacted in the public view', () => {
    const data: GedcomData = {
      individuals: {
        privLiving: makeIndividual({ id: 'privLiving', isPrivate: true, birth: '1990' }),
        publicLiving: makeIndividual({ id: 'publicLiving', birth: '1991' }),
      },
      families: {},
    };

    const checkpoint = computeLivingForCheckpoint(data, NOW);
    const checkpointIds = new Set([
      ...checkpoint.attention.map((p) => p.id),
      ...checkpoint.households.flatMap((h) => h.members).map((p) => p.id),
    ]);
    // Both living people appear in the checkpoint.
    expect(checkpointIds.has('privLiving')).toBe(true);
    expect(checkpointIds.has('publicLiving')).toBe(true);

    const redacted = redactForPublic(data, NOW);
    // Private wins over living in the public view.
    expect(redacted.individuals.privLiving.publicDisplay).toBe('redacted');
    expect(redacted.individuals.publicLiving.publicDisplay).toBe('living');

    // The living CLASSIFICATION agrees for the non-private person; it's only the
    // public display of the private person that differs.
    const redactionLivingIds = new Set(
      Object.values(redacted.individuals)
        .filter((p) => p.publicDisplay === 'living')
        .map((p) => p.id),
    );
    const nonPrivateCheckpointIds = new Set(
      [...checkpointIds].filter((id) => !data.individuals[id].isPrivate),
    );
    expect(redactionLivingIds).toEqual(nonPrivateCheckpointIds);
  });
});

/**
 * «قفزة نسب» in the nasab chain (§5.3).
 *
 * Two things are load-bearing here:
 *
 *  1. THE CONNECTOR. A jump must never print «بن» — that would assert a
 *     father→son link the record does not make. It prints «…، من وَلَد …».
 *
 *  2. THE SURNAME PITFALL. `getDisplayNameWithNasab` takes the surname from the
 *     LAST person in the chain. Naively, crossing a jump would stamp the whole
 *     family with the distant ancestor's surname — عدنان's line would suddenly
 *     read as إسماعيل's house. The surname source FREEZES at the jump.
 */
import { describe, test, expect } from 'vitest';
import type { GedcomData, Individual, Family, AncestryJump } from '@/lib/gedcom/types';
import { getDisplayNameWithNasab, DEFAULT_NASAB_DEPTH } from '@/lib/gedcom/display';

// ---------------------------------------------------------------------------
// Fixture builders
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
    notes: '',
    isDeceased: false,
    isPrivate: false,
    familiesAsSpouse: [],
    kunya: '',
    familyAsChild: null,
    ...overrides,
  };
}

const EMPTY_EVENT = { date: '', hijriDate: '', place: '', description: '', notes: '' };

function makeFamily(overrides: Partial<Family> & { id: string }): Family {
  return {
    type: 'FAM',
    husband: null,
    wife: null,
    children: [],
    marriageContract: EMPTY_EVENT,
    marriage: EMPTY_EVENT,
    divorce: EMPTY_EVENT,
    isDivorced: false,
    ...overrides,
  };
}

function makeJump(overrides: Partial<AncestryJump> & { id: string }): AncestryJump {
  return {
    type: '_ANC_JUMP',
    descendant: '',
    ancestorFamily: '',
    generationsMin: null,
    generationsMax: null,
    notes: '',
    ...overrides,
  };
}

/**
 * إبراهيم → إسماعيل × هاجر. عدنان (of بيت العدنانية) is linked to that couple
 * by a «قفزة نسب»; his son زيد continues the recorded line.
 *
 * إسماعيل deliberately carries his OWN surname, so the pitfall is live.
 */
function adnanData(): GedcomData {
  const data: GedcomData = {
    individuals: {
      IBRAHIM: makeIndividual({
        id: 'IBRAHIM',
        givenName: 'إبراهيم',
        surname: 'الخليلية',
        familiesAsSpouse: ['FAM-IBR'],
      }),
      ISH: makeIndividual({
        id: 'ISH',
        givenName: 'إسماعيل',
        surname: 'الإسماعيلية',
        familyAsChild: 'FAM-IBR',
        familiesAsSpouse: ['FAM-ISH'],
      }),
      HAJAR: makeIndividual({
        id: 'HAJAR',
        givenName: 'هاجر',
        sex: 'F',
        familiesAsSpouse: ['FAM-ISH'],
      }),
      ADNAN: makeIndividual({
        id: 'ADNAN',
        givenName: 'عدنان',
        surname: 'العدنانية',
        familiesAsSpouse: ['FAM-ADN'],
      }),
      ZAYD: makeIndividual({ id: 'ZAYD', givenName: 'زيد', familyAsChild: 'FAM-ADN' }),
      FATIMA: makeIndividual({
        id: 'FATIMA',
        givenName: 'فاطمة',
        sex: 'F',
        surname: 'العدنانية',
      }),
    },
    families: {
      'FAM-IBR': makeFamily({ id: 'FAM-IBR', husband: 'IBRAHIM', children: ['ISH'] }),
      'FAM-ISH': makeFamily({ id: 'FAM-ISH', husband: 'ISH', wife: 'HAJAR' }),
      'FAM-ADN': makeFamily({ id: 'FAM-ADN', husband: 'ADNAN', children: ['ZAYD'] }),
    },
    ancestryJumps: {
      J1: makeJump({ id: 'J1', descendant: 'ADNAN', ancestorFamily: 'FAM-ISH' }),
    },
  };
  data.individuals.ADNAN.ancestryJumpAsDescendant = 'J1';
  data.families['FAM-ISH'].ancestryJumpsAsAncestor = ['J1'];
  return data;
}

const nasab = (data: GedcomData, id: string, depth?: number) =>
  getDisplayNameWithNasab(data, data.individuals[id], depth);

// ---------------------------------------------------------------------------
// The connector
// ---------------------------------------------------------------------------

describe('the «من وَلَد» connector', () => {
  test('replaces «بن» at the jump and the chain continues above it', () => {
    expect(nasab(adnanData(), 'ADNAN', 0)).toBe('عدنان، من وَلَد إسماعيل بن إبراهيم العدنانية');
  });

  test('the comma binds to the preceding name, with no space before it', () => {
    expect(nasab(adnanData(), 'ADNAN', 0)).toContain('عدنان، من');
    expect(nasab(adnanData(), 'ADNAN', 0)).not.toContain('عدنان ،');
  });

  test('a recorded line leads INTO the jump normally', () => {
    expect(nasab(adnanData(), 'ZAYD', 0)).toBe(
      'زيد بن عدنان، من وَلَد إسماعيل بن إبراهيم العدنانية',
    );
  });

  test('does NOT become «بنت» for a female descendant', () => {
    const data = adnanData();
    data.individuals.FATIMA.ancestryJumpAsDescendant = 'J1';
    data.ancestryJumps!.J1.descendant = 'FATIMA';
    const result = nasab(data, 'FATIMA', 0);
    expect(result).toBe('فاطمة، من وَلَد إسماعيل بن إبراهيم العدنانية');
    expect(result).not.toContain('بنت');
  });

  test('a person with a recorded father never consults his jump', () => {
    const data = adnanData();
    data.individuals.ZAYD.ancestryJumpAsDescendant = 'J1';
    expect(nasab(data, 'ZAYD', 2)).toBe('زيد بن عدنان العدنانية');
  });
});

// ---------------------------------------------------------------------------
// The surname pitfall
// ---------------------------------------------------------------------------

describe('the surname freezes at the jump', () => {
  test('عدنان’s line keeps its own house, never إسماعيل’s', () => {
    const result = nasab(adnanData(), 'ZAYD', 0);
    expect(result.endsWith('العدنانية')).toBe(true);
    expect(result).not.toContain('الإسماعيلية');
    expect(result).not.toContain('الخليلية');
  });

  test('a jump-free chain still takes the surname from the top of the chain', () => {
    // إسماعيل بن إبراهيم — no jump is crossed, so the old rule applies and the
    // surname comes from إبراهيم, the last person in the chain.
    expect(nasab(adnanData(), 'ISH', 0)).toBe('إسماعيل بن إبراهيم الخليلية');
  });

  test('a surname-less descendant falls back to his own blank, not the ancestor’s', () => {
    const data = adnanData();
    data.individuals.ADNAN.surname = '';
    expect(nasab(data, 'ADNAN', 0)).toBe('عدنان، من وَلَد إسماعيل بن إبراهيم');
  });
});

// ---------------------------------------------------------------------------
// Depth
// ---------------------------------------------------------------------------

describe('depth', () => {
  test('the DEFAULT depth never reaches the jump', () => {
    // Cards, the sidebar and the pickers all call at the default depth.
    expect(DEFAULT_NASAB_DEPTH).toBe(2);
    expect(nasab(adnanData(), 'ADNAN')).toBe('عدنان العدنانية');
    expect(nasab(adnanData(), 'ADNAN', 2)).toBe('عدنان العدنانية');
  });

  test('depth 3 spells the jump out and stops there', () => {
    expect(nasab(adnanData(), 'ADNAN', 3)).toBe('عدنان، من وَلَد إسماعيل العدنانية');
  });

  test('depth 4 continues into the ancestor’s own father', () => {
    expect(nasab(adnanData(), 'ADNAN', 4)).toBe('عدنان، من وَلَد إسماعيل بن إبراهيم العدنانية');
  });

  test('depth 1 is the bare name, as always', () => {
    expect(nasab(adnanData(), 'ADNAN', 1)).toBe('عدنان العدنانية');
  });
});

// ---------------------------------------------------------------------------
// When the chain must stop
// ---------------------------------------------------------------------------

describe('the chain stops silently', () => {
  test('when the ancestor couple has a wife only (female-only ancestor)', () => {
    const data = adnanData();
    data.families['FAM-ISH'].husband = null;
    expect(nasab(data, 'ADNAN', 0)).toBe('عدنان العدنانية');
  });

  test('when the ancestor family is missing from the payload', () => {
    const data = adnanData();
    delete data.families['FAM-ISH'];
    expect(nasab(data, 'ADNAN', 0)).toBe('عدنان العدنانية');
  });

  test('when the back-reference points at a missing jump row', () => {
    const data = adnanData();
    delete data.ancestryJumps!.J1;
    expect(nasab(data, 'ADNAN', 0)).toBe('عدنان العدنانية');
  });

  test('when the ancestor himself is absent from the payload', () => {
    const data = adnanData();
    delete data.individuals.ISH;
    expect(nasab(data, 'ADNAN', 0)).toBe('عدنان العدنانية');
  });

  test('on a jump that loops back to someone already named', () => {
    const data = adnanData();
    // إسماعيل ⇢ عدنان's couple closes the ring; إسماعيل also loses his father
    // so the jump is the only way up from him.
    data.individuals.ISH.familyAsChild = null;
    data.individuals.ISH.ancestryJumpAsDescendant = 'J2';
    data.ancestryJumps!.J2 = makeJump({
      id: 'J2',
      descendant: 'ISH',
      ancestorFamily: 'FAM-ADN',
    });
    expect(nasab(data, 'ADNAN', 0)).toBe('عدنان، من وَلَد إسماعيل العدنانية');
  });
});

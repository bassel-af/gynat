/**
 * «قفزة نسب» (ancestry jump) — validator rules J1…J8.
 *
 * `validateAncestryJump` is a PURE function over already-mapped `GedcomData`.
 * It returns the FIRST violated error code, or null when the candidate is
 * legal. The route turns the code into an Arabic message + HTTP status via the
 * two exported maps.
 */
import { describe, test, expect } from 'vitest';
import type { GedcomData, Individual, Family, AncestryJump } from '@/lib/gedcom/types';
import {
  validateAncestryJump,
  ANCESTRY_JUMP_ERROR_MESSAGES,
  ANCESTRY_JUMP_ERROR_STATUS,
} from '@/lib/tree/ancestry-jump-validators';

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
 * The canonical fixture:
 *
 *   FAM-ISH:  إسماعيل × هاجر
 *   عدنان     — a parentless person, the jump descendant candidate
 *   FAM-ADN:  عدنان × زوجته  →  child معد
 */
function baseData(): GedcomData {
  return {
    individuals: {
      ISH: makeIndividual({ id: 'ISH', familiesAsSpouse: ['FAM-ISH'] }),
      HAJAR: makeIndividual({ id: 'HAJAR', sex: 'F', familiesAsSpouse: ['FAM-ISH'] }),
      ADNAN: makeIndividual({ id: 'ADNAN', familiesAsSpouse: ['FAM-ADN'] }),
      WIFE: makeIndividual({ id: 'WIFE', sex: 'F', familiesAsSpouse: ['FAM-ADN'] }),
      MAADD: makeIndividual({ id: 'MAADD', familyAsChild: 'FAM-ADN' }),
    },
    families: {
      'FAM-ISH': makeFamily({ id: 'FAM-ISH', husband: 'ISH', wife: 'HAJAR' }),
      'FAM-ADN': makeFamily({
        id: 'FAM-ADN',
        husband: 'ADNAN',
        wife: 'WIFE',
        children: ['MAADD'],
      }),
    },
  };
}

const VALID = { descendantId: 'ADNAN', ancestorFamilyId: 'FAM-ISH' };

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('validateAncestryJump — legal candidates', () => {
  test('accepts a parentless descendant pointing at a full ancestor couple', () => {
    expect(validateAncestryJump(baseData(), VALID)).toBeNull();
  });

  test('accepts an ancestor family with a husband only', () => {
    const data = baseData();
    data.families['FAM-ISH'].wife = null;
    expect(validateAncestryJump(data, VALID)).toBeNull();
  });

  test('accepts an ancestor family with a WIFE only (female-only ancestor)', () => {
    const data = baseData();
    data.families['FAM-ISH'].husband = null;
    expect(validateAncestryJump(data, VALID)).toBeNull();
  });

  test('accepts a stated generation range', () => {
    const data = baseData();
    expect(
      validateAncestryJump(data, { ...VALID, generationsMin: 4, generationsMax: 40 }),
    ).toBeNull();
  });

  test('accepts a range with only one bound stated', () => {
    const data = baseData();
    expect(validateAncestryJump(data, { ...VALID, generationsMin: 4 })).toBeNull();
    expect(validateAncestryJump(data, { ...VALID, generationsMax: 40 })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// J1 / J2 — endpoints must exist in THIS tree
// ---------------------------------------------------------------------------

describe('J1/J2 — endpoint existence', () => {
  test('J1: unknown descendant id', () => {
    expect(validateAncestryJump(baseData(), { ...VALID, descendantId: 'NOPE' })).toBe(
      'descendant_not_found',
    );
  });

  test('J2: unknown ancestor family id', () => {
    expect(
      validateAncestryJump(baseData(), { ...VALID, ancestorFamilyId: 'NOPE' }),
    ).toBe('ancestor_family_not_found');
  });

  test('J1 is checked before J2 when both are unknown', () => {
    expect(
      validateAncestryJump(baseData(), { descendantId: 'NOPE', ancestorFamilyId: 'ALSO-NOPE' }),
    ).toBe('descendant_not_found');
  });
});

// ---------------------------------------------------------------------------
// J3 — a jump belongs at the TOP of a known line
// ---------------------------------------------------------------------------

describe('J3 — descendant must have no recorded parents', () => {
  test('rejects a descendant who already has a familyAsChild', () => {
    const data = baseData();
    data.individuals.ADNAN.familyAsChild = 'FAM-ISH';
    expect(validateAncestryJump(data, VALID)).toBe('descendant_has_parents');
  });

  test('a person whose only link is being a SPOUSE is still eligible', () => {
    // ADNAN is a spouse in FAM-ADN but a child of nothing — eligible.
    expect(validateAncestryJump(baseData(), VALID)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// J4 — one jump per person
// ---------------------------------------------------------------------------

describe('J4 — one jump per descendant', () => {
  function withExistingJump(): GedcomData {
    const data = baseData();
    data.ancestryJumps = {
      J1: makeJump({ id: 'J1', descendant: 'ADNAN', ancestorFamily: 'FAM-ISH' }),
    };
    data.individuals.ADNAN.ancestryJumpAsDescendant = 'J1';
    data.families['FAM-ISH'].ancestryJumpsAsAncestor = ['J1'];
    return data;
  }

  test('rejects a second jump for the same person', () => {
    expect(validateAncestryJump(withExistingJump(), VALID)).toBe(
      'descendant_already_has_jump',
    );
  });

  test('ignoreJumpId skips the person’s OWN jump (the PATCH case)', () => {
    expect(
      validateAncestryJump(withExistingJump(), VALID, { ignoreJumpId: 'J1' }),
    ).toBeNull();
  });

  test('ignoreJumpId naming a DIFFERENT jump does not excuse the conflict', () => {
    expect(
      validateAncestryJump(withExistingJump(), VALID, { ignoreJumpId: 'SOME-OTHER' }),
    ).toBe('descendant_already_has_jump');
  });
});

// ---------------------------------------------------------------------------
// J5 — the ancestor couple must name someone
// ---------------------------------------------------------------------------

describe('J5 — ancestor family must have at least one spouse', () => {
  test('rejects a family with neither husband nor wife', () => {
    const data = baseData();
    data.families['FAM-ISH'].husband = null;
    data.families['FAM-ISH'].wife = null;
    expect(validateAncestryJump(data, VALID)).toBe('ancestor_family_empty');
  });

  test('rejects a family whose only spouse is absent from individuals', () => {
    const data = baseData();
    data.families['FAM-ISH'].wife = null;
    delete data.individuals.ISH;
    expect(validateAncestryJump(data, VALID)).toBe('ancestor_family_empty');
  });
});

// ---------------------------------------------------------------------------
// J6 — range ordering, re-checked here on MERGED values (the PATCH case)
// ---------------------------------------------------------------------------

describe('J6 — generation range ordering', () => {
  test('rejects min greater than max', () => {
    expect(
      validateAncestryJump(baseData(), { ...VALID, generationsMin: 40, generationsMax: 4 }),
    ).toBe('invalid_range');
  });

  test('accepts min equal to max', () => {
    expect(
      validateAncestryJump(baseData(), { ...VALID, generationsMin: 7, generationsMax: 7 }),
    ).toBeNull();
  });

  test('a null bound never triggers the ordering rule', () => {
    expect(
      validateAncestryJump(baseData(), { ...VALID, generationsMin: 40, generationsMax: null }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// J7 — self reference
// ---------------------------------------------------------------------------

describe('J7 — self reference', () => {
  test('rejects a jump whose descendant is a spouse of the ancestor family', () => {
    // ADNAN points at his OWN family FAM-ADN.
    expect(
      validateAncestryJump(baseData(), { descendantId: 'ADNAN', ancestorFamilyId: 'FAM-ADN' }),
    ).toBe('self_reference');
  });

  test('self reference is reported even when the descendant is the WIFE slot', () => {
    const data = baseData();
    data.individuals.WIFE.familyAsChild = null;
    expect(
      validateAncestryJump(data, { descendantId: 'WIFE', ancestorFamilyId: 'FAM-ADN' }),
    ).toBe('self_reference');
  });
});

// ---------------------------------------------------------------------------
// J8 — no cycle
// ---------------------------------------------------------------------------

describe('J8 — cycle detection', () => {
  test('rejects pointing at a family whose spouse is the descendant’s own child', () => {
    // MAADD is ADNAN's son; give MAADD a family and point ADNAN at it.
    const data = baseData();
    data.individuals.MAADD.familiesAsSpouse = ['FAM-MAADD'];
    data.families['FAM-MAADD'] = makeFamily({ id: 'FAM-MAADD', husband: 'MAADD' });
    expect(
      validateAncestryJump(data, { descendantId: 'ADNAN', ancestorFamilyId: 'FAM-MAADD' }),
    ).toBe('cycle');
  });

  test('rejects a cycle reachable only THROUGH an existing jump (three hops)', () => {
    // ADNAN --[spouse in FAM-ADN]--> [existing jump off FAM-ADN] --> NIZAR
    //        --(child)--> MUDAR --[spouse in FAM-MUDAR]
    // Pointing ADNAN at FAM-MUDAR closes the loop ONLY if the downward walk
    // crosses the existing jump edge. A jump-blind walk would wrongly allow it.
    const data = baseData();
    data.individuals.NIZAR = makeIndividual({ id: 'NIZAR', familiesAsSpouse: ['FAM-NIZAR'] });
    data.individuals.MUDAR = makeIndividual({
      id: 'MUDAR',
      familyAsChild: 'FAM-NIZAR',
      familiesAsSpouse: ['FAM-MUDAR'],
    });
    data.families['FAM-NIZAR'] = makeFamily({
      id: 'FAM-NIZAR',
      husband: 'NIZAR',
      children: ['MUDAR'],
    });
    data.families['FAM-MUDAR'] = makeFamily({ id: 'FAM-MUDAR', husband: 'MUDAR' });

    // The existing jump: NIZAR ⇢ ADNAN's couple.
    data.ancestryJumps = {
      'J-EXISTING': makeJump({
        id: 'J-EXISTING',
        descendant: 'NIZAR',
        ancestorFamily: 'FAM-ADN',
      }),
    };
    data.individuals.NIZAR.ancestryJumpAsDescendant = 'J-EXISTING';
    data.families['FAM-ADN'].ancestryJumpsAsAncestor = ['J-EXISTING'];

    expect(
      validateAncestryJump(data, { descendantId: 'ADNAN', ancestorFamilyId: 'FAM-MUDAR' }),
    ).toBe('cycle');
  });

  test('a DISJOINT family is not a cycle', () => {
    const data = baseData();
    data.individuals.STRANGER = makeIndividual({
      id: 'STRANGER',
      familiesAsSpouse: ['FAM-STRANGER'],
    });
    data.families['FAM-STRANGER'] = makeFamily({ id: 'FAM-STRANGER', husband: 'STRANGER' });
    expect(
      validateAncestryJump(data, { descendantId: 'ADNAN', ancestorFamilyId: 'FAM-STRANGER' }),
    ).toBeNull();
  });

  test('cycle detection terminates on data that already contains a jump loop', () => {
    // A pre-existing ADNAN ⇢ FAM-ISH / ISH ⇢ FAM-ADN loop must not hang the
    // walk. Re-validating ADNAN's own jump (ignoreJumpId) still reports the
    // cycle rather than spinning: ISH is reachable downward from ADNAN via JB.
    const data = baseData();
    data.ancestryJumps = {
      JA: makeJump({ id: 'JA', descendant: 'ADNAN', ancestorFamily: 'FAM-ISH' }),
      JB: makeJump({ id: 'JB', descendant: 'ISH', ancestorFamily: 'FAM-ADN' }),
    };
    data.individuals.ADNAN.ancestryJumpAsDescendant = 'JA';
    data.individuals.ISH.ancestryJumpAsDescendant = 'JB';
    data.families['FAM-ISH'].ancestryJumpsAsAncestor = ['JA'];
    data.families['FAM-ADN'].ancestryJumpsAsAncestor = ['JB'];

    expect(validateAncestryJump(data, VALID, { ignoreJumpId: 'JA' })).toBe('cycle');
  });
});

// ---------------------------------------------------------------------------
// Error maps
// ---------------------------------------------------------------------------

describe('error maps', () => {
  const CODES = [
    'descendant_not_found',
    'ancestor_family_not_found',
    'descendant_has_parents',
    'descendant_already_has_jump',
    'ancestor_family_empty',
    'self_reference',
    'cycle',
    'invalid_range',
  ] as const;

  test('every error code has a non-empty Arabic message', () => {
    for (const code of CODES) {
      expect(ANCESTRY_JUMP_ERROR_MESSAGES[code]).toBeTruthy();
    }
  });

  test('status codes: 404 for missing endpoints, 409 for a duplicate jump, else 400', () => {
    expect(ANCESTRY_JUMP_ERROR_STATUS.descendant_not_found).toBe(404);
    expect(ANCESTRY_JUMP_ERROR_STATUS.ancestor_family_not_found).toBe(404);
    expect(ANCESTRY_JUMP_ERROR_STATUS.descendant_already_has_jump).toBe(409);
    expect(ANCESTRY_JUMP_ERROR_STATUS.descendant_has_parents).toBe(400);
    expect(ANCESTRY_JUMP_ERROR_STATUS.ancestor_family_empty).toBe(400);
    expect(ANCESTRY_JUMP_ERROR_STATUS.self_reference).toBe(400);
    expect(ANCESTRY_JUMP_ERROR_STATUS.cycle).toBe(400);
    expect(ANCESTRY_JUMP_ERROR_STATUS.invalid_range).toBe(400);
  });
});

/**
 * «قفزة نسب» — root selection (§5.2).
 *
 * `findDefaultRoot` is the ONE place that changes UNCONDITIONALLY (no
 * `includeJumps` opt-in): a person with a jump has someone above him, so he is
 * not the top of the tree and must never be crowned the default root. The
 * descendant count that breaks ties between the remaining roots DOES cross
 * jumps, so the apex ancestor outranks everyone below him.
 *
 * `findRootAncestors` (the "every possible root" picker list) is unchanged.
 */
import { describe, test, expect } from 'vitest';
import type { GedcomData, Individual, Family, AncestryJump } from '@/lib/gedcom/types';
import { findDefaultRoot, findRootAncestors } from '@/lib/gedcom/roots';

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

function build(individuals: Individual[], families: Family[], jumps: AncestryJump[] = []): GedcomData {
  const data: GedcomData = {
    individuals: Object.fromEntries(individuals.map((i) => [i.id, i])),
    families: Object.fromEntries(families.map((f) => [f.id, f])),
  };
  if (jumps.length > 0) {
    data.ancestryJumps = Object.fromEntries(jumps.map((j) => [j.id, j]));
    for (const jump of jumps) {
      const descendant = data.individuals[jump.descendant];
      if (descendant) descendant.ancestryJumpAsDescendant = jump.id;
      const family = data.families[jump.ancestorFamily];
      if (family) family.ancestryJumpsAsAncestor = [...(family.ancestryJumpsAsAncestor ?? []), jump.id];
    }
  }
  return data;
}

/**
 * إبراهيم → إسماعيل × هاجر → قيدار, plus عدنان ⇢ (إسماعيل × هاجر) carrying
 * معد → نزار. The apex is إبراهيم once the count crosses the jump.
 */
function adnanTree(): GedcomData {
  return build(
    [
      makeIndividual({ id: 'IBRAHIM', familiesAsSpouse: ['FAM-IBR'] }),
      makeIndividual({ id: 'ISH', familyAsChild: 'FAM-IBR', familiesAsSpouse: ['FAM-ISH'] }),
      makeIndividual({ id: 'HAJAR', sex: 'F', familiesAsSpouse: ['FAM-ISH'] }),
      makeIndividual({ id: 'QAYDAR', familyAsChild: 'FAM-ISH' }),
      makeIndividual({ id: 'ADNAN', familiesAsSpouse: ['FAM-ADN'] }),
      makeIndividual({ id: 'WIFE', sex: 'F', familiesAsSpouse: ['FAM-ADN'] }),
      makeIndividual({ id: 'MAADD', familyAsChild: 'FAM-ADN', familiesAsSpouse: ['FAM-MAADD'] }),
      makeIndividual({ id: 'NIZAR', familyAsChild: 'FAM-MAADD' }),
    ],
    [
      makeFamily({ id: 'FAM-IBR', husband: 'IBRAHIM', children: ['ISH'] }),
      makeFamily({ id: 'FAM-ISH', husband: 'ISH', wife: 'HAJAR', children: ['QAYDAR'] }),
      makeFamily({ id: 'FAM-ADN', husband: 'ADNAN', wife: 'WIFE', children: ['MAADD'] }),
      makeFamily({ id: 'FAM-MAADD', husband: 'MAADD', children: ['NIZAR'] }),
    ],
    [makeJump({ id: 'J1', descendant: 'ADNAN', ancestorFamily: 'FAM-ISH' })],
  );
}

// ---------------------------------------------------------------------------
// findDefaultRoot
// ---------------------------------------------------------------------------

describe('findDefaultRoot — a jump descendant is not a true root', () => {
  test('the apex ancestor wins because the count crosses the jump', () => {
    expect(findDefaultRoot(adnanTree())?.id).toBe('IBRAHIM');
  });

  test('the jump descendant loses to a smaller-or-equal rival root', () => {
    // إبراهيم / إسماعيل / هاجر are PRIVATE, so none of them is a candidate and
    // nobody absorbs عدنان's line. Jump-blind, عدنان is then the first
    // parentless candidate in iteration order and WINS. The exclusion is the
    // only thing that hands the tree to زوجته instead.
    const data = adnanTree();
    data.individuals.IBRAHIM.isPrivate = true;
    data.individuals.ISH.isPrivate = true;
    data.individuals.HAJAR.isPrivate = true;

    const root = findDefaultRoot(data);
    expect(root?.id).not.toBe('ADNAN');
    expect(root?.id).toBe('WIFE');
  });

  test('the exclusion holds even when the jump has no resolvable ancestors', () => {
    // A dangling ancestor family: nobody above him is reachable, but the jump
    // still says someone IS above him — he is not the top of the tree.
    const data = adnanTree();
    delete data.families['FAM-ISH'];
    delete data.individuals.ISH;
    delete data.individuals.HAJAR;
    delete data.individuals.QAYDAR;
    delete data.individuals.IBRAHIM;
    delete data.families['FAM-IBR'];

    expect(findDefaultRoot(data)?.id).toBe('WIFE');
  });

  test('a jump-free tree picks exactly the root it picked before', () => {
    const data = adnanTree();
    delete data.ancestryJumps;
    delete data.individuals.ADNAN.ancestryJumpAsDescendant;
    delete data.families['FAM-ISH'].ancestryJumpsAsAncestor;

    // إبراهيم (إسماعيل + قيدار) is still the first of the tied 2-descendant
    // candidates in iteration order, exactly as before the feature existed.
    expect(findDefaultRoot(data)?.id).toBe('IBRAHIM');
  });

  test('a STALE back-reference with no matching jump row does not disqualify a root', () => {
    // A borrowed branch root carries the SOURCE workspace's jump id into the
    // target payload, where no such row exists. The flag alone must not crown
    // a different default root — the row is the truth.
    // عدنان (2 descendants) outranks زيد (1) — unless the stale flag wrongly
    // knocks him out of `trueRoots`, in which case زيد is crowned instead.
    const data = build(
      [
        makeIndividual({ id: 'ADNAN', familiesAsSpouse: ['FAM-ADN'] }),
        makeIndividual({ id: 'MAADD', familyAsChild: 'FAM-ADN', familiesAsSpouse: ['FAM-MAADD'] }),
        makeIndividual({ id: 'NIZAR', familyAsChild: 'FAM-MAADD' }),
        makeIndividual({ id: 'ZAYD', familiesAsSpouse: ['FAM-ZAYD'] }),
        makeIndividual({ id: 'ZAYD-SON', familyAsChild: 'FAM-ZAYD' }),
      ],
      [
        makeFamily({ id: 'FAM-ADN', husband: 'ADNAN', children: ['MAADD'] }),
        makeFamily({ id: 'FAM-MAADD', husband: 'MAADD', children: ['NIZAR'] }),
        makeFamily({ id: 'FAM-ZAYD', husband: 'ZAYD', children: ['ZAYD-SON'] }),
      ],
    );
    data.individuals.ADNAN.ancestryJumpAsDescendant = 'jump-from-workspace-a';

    expect(findDefaultRoot(data)?.id).toBe('ADNAN');
  });

  test('a single remaining true root is returned without any counting', () => {
    const data = build(
      [
        makeIndividual({ id: 'ISH', familiesAsSpouse: ['FAM-ISH'] }),
        makeIndividual({ id: 'ADNAN' }),
      ],
      [makeFamily({ id: 'FAM-ISH', husband: 'ISH' })],
      [makeJump({ id: 'J1', descendant: 'ADNAN', ancestorFamily: 'FAM-ISH' })],
    );
    expect(findDefaultRoot(data)?.id).toBe('ISH');
  });
});

// ---------------------------------------------------------------------------
// findRootAncestors — explicitly unchanged
// ---------------------------------------------------------------------------

describe('findRootAncestors', () => {
  test('still lists the jump descendant among the pickable roots', () => {
    const ids = findRootAncestors(adnanTree()).map((p) => p.id);
    expect(ids).toContain('ADNAN');
    expect(ids).toContain('IBRAHIM');
    expect(ids.length).toBe(8);
  });
});

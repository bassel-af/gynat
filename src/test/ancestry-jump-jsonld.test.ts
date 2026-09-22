/**
 * «قفزة نسب» — schema.org emission (spec §6.2).
 *
 * LOCKED RULES, in one place because they are exactly the kind of thing a
 * future reader "helpfully" changes:
 *   1. a jump is emitted as `relatedTo` ONLY — never `parent`, `children`,
 *      `spouse` or `sibling`. schema.org has no "ancestor" property, and a
 *      `parent` edge across an unrecorded gap publishes a false claim into the
 *      knowledge graph (the FamilySearch-عدنان failure this feature exists to
 *      prevent).
 *   2. jump nodes carry name + gender ONLY — no dates, no generation range, no
 *      notes.
 *   3. nothing at all when `indexable` is false.
 *   4. a redacted spouse is dropped per-node, as defense in depth on top of
 *      `redactForPublic` (which already drops the whole mixed jump).
 * The existing four relation buckets must be untouched by any of this.
 */
import { describe, test, expect } from 'vitest';
import type { GedcomData, Individual, Family, AncestryJump } from '@/lib/gedcom/types';
import { buildPersonJsonLd } from '@/lib/tree/person-jsonld';
import { redactForPublic } from '@/lib/tree/public-visibility';

// ---------------------------------------------------------------------------
// Fixtures — these are POST-`redactForPublic` shapes (every node carries
// `publicDisplay`), which is what the builder contractually consumes.
// ---------------------------------------------------------------------------

function ind(overrides: Partial<Individual> & { id: string }): Individual {
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
    isDeceased: true,
    isPrivate: false,
    familiesAsSpouse: [],
    familyAsChild: null,
    publicDisplay: 'full',
    ...overrides,
  };
}

const EMPTY_EVENT = { date: '', hijriDate: '', place: '', description: '', notes: '' };

function fam(overrides: Partial<Family> & { id: string }): Family {
  return {
    type: 'FAM',
    husband: null,
    wife: null,
    children: [],
    marriageContract: { ...EMPTY_EVENT },
    marriage: { ...EMPTY_EVENT },
    divorce: { ...EMPTY_EVENT },
    isDivorced: false,
    ...overrides,
  };
}

function jump(overrides: Partial<AncestryJump> & { id: string }): AncestryJump {
  return {
    type: '_ANC_JUMP',
    descendant: 'adnan',
    ancestorFamily: 'f-ish',
    generationsMin: 4,
    generationsMax: 40,
    notes: 'قيل سبعة، وقيل أربعون',
    ...overrides,
  };
}

const URL = '/family/saeed/person/adnan';

/**
 * عدنان: jump descendant, married with a son, no recorded parents (rule J3).
 * The ancestor couple is إسماعيل × هاجر.
 */
function publicTree(): GedcomData {
  const individuals: Record<string, Individual> = {
    adnan: ind({
      id: 'adnan',
      name: 'عدنان',
      birth: '0100',
      familiesAsSpouse: ['f-adnan'],
      ancestryJumpAsDescendant: 'j1',
    }),
    wife: ind({ id: 'wife', name: 'مهدد', sex: 'F', familiesAsSpouse: ['f-adnan'] }),
    maadd: ind({ id: 'maadd', name: 'معد', familyAsChild: 'f-adnan' }),
    ish: ind({ id: 'ish', name: 'إسماعيل', birth: '0001', familiesAsSpouse: ['f-ish'] }),
    hagar: ind({ id: 'hagar', name: 'هاجر', sex: 'F', familiesAsSpouse: ['f-ish'] }),
  };
  const families: Record<string, Family> = {
    'f-adnan': fam({ id: 'f-adnan', husband: 'adnan', wife: 'wife', children: ['maadd'] }),
    'f-ish': fam({ id: 'f-ish', husband: 'ish', wife: 'hagar', ancestryJumpsAsAncestor: ['j1'] }),
  };
  return { individuals, families, ancestryJumps: { j1: jump({ id: 'j1' }) } };
}

function build(data: GedcomData, indexable = true) {
  return buildPersonJsonLd({ data, focalId: 'adnan', canonicalUrl: URL, indexable });
}

// ---------------------------------------------------------------------------
// relatedTo — and nothing but relatedTo
// ---------------------------------------------------------------------------

describe('buildPersonJsonLd — «قفزة نسب» emits relatedTo', () => {
  test('emits both ancestors of the jump couple under relatedTo', () => {
    const out = build(publicTree())!;
    expect(out.relatedTo).toEqual([
      { '@type': 'Person', name: 'إسماعيل', gender: 'male' },
      { '@type': 'Person', name: 'هاجر', gender: 'female' },
    ]);
  });

  test('never emits the jump ancestor as a parent', () => {
    const out = build(publicTree())!;
    expect(out.parent).toBeUndefined();
  });

  test('never emits the jump ancestor under children, spouse or sibling', () => {
    const out = build(publicTree())!;
    const names = (key: string) =>
      ((out[key] as Array<Record<string, unknown>> | undefined) ?? []).map((n) => n.name);
    expect(names('children')).not.toContain('إسماعيل');
    expect(names('spouse')).not.toContain('إسماعيل');
    expect(names('sibling')).not.toContain('إسماعيل');
  });

  test('a jump node carries name and gender ONLY', () => {
    const out = build(publicTree())!;
    const node = (out.relatedTo as Array<Record<string, unknown>>)[0];
    expect(Object.keys(node).sort()).toEqual(['@type', 'gender', 'name']);
  });

  test('never emits the generation range or the jump notes anywhere in the graph', () => {
    const serialized = JSON.stringify(build(publicTree()));
    expect(serialized).not.toContain('generationsMin');
    expect(serialized).not.toContain('generationsMax');
    expect(serialized).not.toContain('قيل سبعة');
    expect(serialized).not.toContain('40');
  });

  test('emits nothing at all on a non-indexable page', () => {
    expect(build(publicTree(), false)).toBeNull();
  });

  test('omits relatedTo for a focal person with no jump', () => {
    const data = publicTree();
    delete data.individuals.adnan.ancestryJumpAsDescendant;
    expect(build(data)!.relatedTo).toBeUndefined();
  });

  test('omits relatedTo when the jump belongs to someone else', () => {
    const data = publicTree();
    delete data.individuals.adnan.ancestryJumpAsDescendant;
    data.individuals.maadd.ancestryJumpAsDescendant = 'j1';
    expect(build(data)!.relatedTo).toBeUndefined();
  });

  test('omits relatedTo when the back-reference dangles', () => {
    const data = publicTree();
    data.individuals.adnan.ancestryJumpAsDescendant = 'ghost';
    expect(build(data)!.relatedTo).toBeUndefined();
  });

  test('omits relatedTo when the ancestor family is absent', () => {
    const data = publicTree();
    delete data.families['f-ish'];
    expect(build(data)!.relatedTo).toBeUndefined();
  });

  test('emits the known ancestor alone when the couple has one spouse', () => {
    const data = publicTree();
    data.families['f-ish'].wife = null;
    expect(build(data)!.relatedTo).toEqual([
      { '@type': 'Person', name: 'إسماعيل', gender: 'male' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Per-node privacy — the second, independent gate
// ---------------------------------------------------------------------------

describe('buildPersonJsonLd — «قفزة نسب» per-node privacy', () => {
  test('drops a redacted spouse from relatedTo (defense in depth)', () => {
    const data = publicTree();
    data.individuals.hagar.publicDisplay = 'redacted';
    expect(build(data)!.relatedTo).toEqual([
      { '@type': 'Person', name: 'إسماعيل', gender: 'male' },
    ]);
  });

  test('omits relatedTo entirely when BOTH ancestors are redacted', () => {
    const data = publicTree();
    data.individuals.ish.publicDisplay = 'redacted';
    data.individuals.hagar.publicDisplay = 'redacted';
    expect(build(data)!.relatedTo).toBeUndefined();
  });

  test('a redacted focal person emits no graph at all', () => {
    const data = publicTree();
    data.individuals.adnan.publicDisplay = 'redacted';
    expect(build(data)).toBeNull();
  });

  test('the full pipeline drops the jump when an ancestor is private', () => {
    // redactForPublic removes the row; the builder then has nothing to read.
    const raw = publicTree();
    raw.individuals.hagar.isPrivate = true;
    const redacted = redactForPublic(raw, new Date('2026-06-15T00:00:00Z'));
    const out = buildPersonJsonLd({
      data: redacted,
      focalId: 'adnan',
      canonicalUrl: URL,
      indexable: true,
    })!;
    expect(out.relatedTo).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Regression: the four existing buckets are untouched
// ---------------------------------------------------------------------------

describe('buildPersonJsonLd — existing relations still behave', () => {
  test('spouse and children are still emitted next to a jump', () => {
    const out = build(publicTree())!;
    expect(out.spouse).toEqual([{ '@type': 'Person', name: 'مهدد', gender: 'female' }]);
    expect(out.children).toEqual([{ '@type': 'Person', name: 'معد', gender: 'male' }]);
  });

  test('recorded parents are still emitted as parent, not relatedTo', () => {
    const data = publicTree();
    data.individuals.maadd.familyAsChild = 'f-adnan';
    const out = buildPersonJsonLd({
      data,
      focalId: 'maadd',
      canonicalUrl: '/family/saeed/person/maadd',
      indexable: true,
    })!;
    expect((out.parent as Array<Record<string, unknown>>).map((n) => n.name)).toEqual([
      'عدنان',
      'مهدد',
    ]);
    expect(out.relatedTo).toBeUndefined();
  });
});

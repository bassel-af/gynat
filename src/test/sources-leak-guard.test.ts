/**
 * Sources («المصادر») — leak guard (denylist).
 *
 * Sources are NEVER part of `GedcomData`. They are served only by the
 * per-person sources route through `src/lib/tree/source-visibility.ts`. This
 * suite feeds every tree-derived output path an input that DOES carry stray
 * source-shaped keys (on individuals, families and the root) and asserts no
 * such key survives — so a future upstream bug that attaches sources to the
 * tree can never ride a redactor / projection / JSON-LD out to a viewer.
 */
import { describe, test, expect } from 'vitest';
import type { GedcomData, Individual, Family } from '@/lib/gedcom/types';
import { redactForPublic } from '@/lib/tree/public-visibility';
import { redactPrivateIndividuals } from '@/lib/tree/mapper';
import { extractPointedSubtree } from '@/lib/tree/branch-pointer-merge';
import { projectPerson, MEMBER_PROJECT_OPTIONS } from '@/lib/tree/person-projection';
import { buildPersonJsonLd } from '@/lib/tree/person-jsonld';
import { findSourceKeys, STRAY_SOURCES } from './helpers/source-leak';

const NOW = new Date('2026-09-25T00:00:00Z');

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
    ...overrides,
    // Stray source-shaped keys a buggy upstream might attach.
    ...({ sources: STRAY_SOURCES, sourceEntries: STRAY_SOURCES, citations: STRAY_SOURCES } as object),
  } as Individual;
}

function fam(overrides: Partial<Family> & { id: string }): Family {
  const empty = { date: '', hijriDate: '', place: '', description: '', notes: '' };
  return {
    type: 'FAM',
    husband: null,
    wife: null,
    children: [],
    marriageContract: { ...empty },
    marriage: { ...empty },
    divorce: { ...empty },
    isDivorced: false,
    ...overrides,
    ...({ citations: STRAY_SOURCES, sources: STRAY_SOURCES } as object),
  } as Family;
}

/** grandfather → father (+mother, private) → focal (+spouse) → child. */
function buildTree(): GedcomData {
  const data = {
    individuals: {
      grandfather: ind({ id: 'grandfather', name: 'إبراهيم', familiesAsSpouse: ['f-grand'] }),
      father: ind({ id: 'father', name: 'خالد', familyAsChild: 'f-grand', familiesAsSpouse: ['f-parents'] }),
      mother: ind({ id: 'mother', name: 'رقية', sex: 'F', isPrivate: true, familiesAsSpouse: ['f-parents'] }),
      focal: ind({ id: 'focal', name: 'باسل', familyAsChild: 'f-parents', familiesAsSpouse: ['f-marriage'] }),
      spouse: ind({ id: 'spouse', name: 'ليلى', sex: 'F', familiesAsSpouse: ['f-marriage'] }),
      child: ind({ id: 'child', name: 'عمر', familyAsChild: 'f-marriage' }),
    },
    families: {
      'f-grand': fam({ id: 'f-grand', husband: 'grandfather', children: ['father'] }),
      'f-parents': fam({ id: 'f-parents', husband: 'father', wife: 'mother', children: ['focal'] }),
      'f-marriage': fam({ id: 'f-marriage', husband: 'focal', wife: 'spouse', children: ['child'] }),
    },
  } as GedcomData;
  Object.assign(data, { sourceEntries: STRAY_SOURCES, sources: STRAY_SOURCES });
  return data;
}

function expectFixtureCarriesStrays(data: GedcomData) {
  // Guard the guard: the input really does carry the keys we expect stripped.
  expect(findSourceKeys(data).length).toBeGreaterThan(0);
}

describe('redactForPublic strips source-shaped keys', () => {
  test('individuals, families and root are source-free', () => {
    const input = buildTree();
    expectFixtureCarriesStrays(input);
    expect(findSourceKeys(redactForPublic(input, NOW))).toEqual([]);
  });

  test('does not mutate its input', () => {
    const input = buildTree();
    redactForPublic(input, NOW);
    expect((input.individuals.focal as unknown as Record<string, unknown>).sources).toBeDefined();
    expect((input.families['f-parents'] as unknown as Record<string, unknown>).citations).toBeDefined();
  });
});

describe('redactPrivateIndividuals strips source-shaped keys', () => {
  test('individuals (private and not), families and root are source-free', () => {
    const input = buildTree();
    expectFixtureCarriesStrays(input);
    expect(findSourceKeys(redactPrivateIndividuals(input))).toEqual([]);
  });
});

describe('extractPointedSubtree strips source-shaped keys', () => {
  test('unlimited depth, no grafts', () => {
    const out = extractPointedSubtree(buildTree(), { rootIndividualId: 'father', depthLimit: null, includeGrafts: false });
    expect(Object.keys(out.individuals)).toContain('focal');
    expect(findSourceKeys(out)).toEqual([]);
  });

  test('limited depth with grafts', () => {
    const out = extractPointedSubtree(buildTree(), { rootIndividualId: 'father', depthLimit: 1, includeGrafts: true });
    expect(Object.keys(out.individuals)).toContain('focal');
    expect(findSourceKeys(out)).toEqual([]);
  });
});

describe('projectPerson never emits source-shaped keys', () => {
  test('member options', () => {
    const projection = projectPerson(buildTree(), 'focal', MEMBER_PROJECT_OPTIONS);
    expect(projection).not.toBeNull();
    expect(findSourceKeys(projection)).toEqual([]);
  });

  test('public options (over the public-redacted payload)', () => {
    const data = redactForPublic(buildTree(), NOW);
    const home = new Set(Object.keys(data.individuals));
    const projection = projectPerson(data, 'focal', {
      maternalRecursionDepth: 1,
      isBoundary: (p) => !home.has(p.id),
      continueThroughPrivateAncestor: false,
    });
    expect(projection).not.toBeNull();
    expect(findSourceKeys(projection)).toEqual([]);
  });

  test('public options (fed raw strays directly)', () => {
    const projection = projectPerson(buildTree(), 'focal', {
      maternalRecursionDepth: 1,
      isBoundary: () => false,
      continueThroughPrivateAncestor: false,
    });
    expect(findSourceKeys(projection)).toEqual([]);
  });
});

describe('buildPersonJsonLd never emits source-shaped keys', () => {
  test('over the public-redacted payload', () => {
    const jsonLd = buildPersonJsonLd({
      data: redactForPublic(buildTree(), NOW),
      focalId: 'focal',
      canonicalUrl: '/family/x/person/focal',
      indexable: true,
    });
    expect(jsonLd).not.toBeNull();
    expect(findSourceKeys(jsonLd)).toEqual([]);
    expect(JSON.stringify(jsonLd)).not.toContain('ابن سعد');
  });

  test('fed raw strays directly (every node marked public)', () => {
    const data = buildTree();
    for (const p of Object.values(data.individuals)) if (!p.isPrivate) p.publicDisplay = 'full';
    const jsonLd = buildPersonJsonLd({ data, focalId: 'focal', canonicalUrl: '/p/focal', indexable: true });
    expect(jsonLd).not.toBeNull();
    expect(findSourceKeys(jsonLd)).toEqual([]);
    expect(JSON.stringify(jsonLd)).not.toContain('ابن سعد');
  });
});

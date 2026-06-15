import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { GedcomData, Individual } from '@/lib/gedcom/types';
import { redactForPublic } from '@/lib/tree/public-visibility';
import { buildPublicNamesList } from '@/lib/tree/public-serve';

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

const NOW = new Date('2026-06-15T00:00:00Z');

// ---------------------------------------------------------------------------
// buildPublicNamesList — the SSR-crawlable names list
// ---------------------------------------------------------------------------

describe('buildPublicNamesList', () => {
  test('includes living and deceased people with name + gender', () => {
    const data: GedcomData = {
      individuals: {
        dec: makeIndividual({ id: 'dec', name: 'أحمد', sex: 'M', isDeceased: true, birth: '1950' }),
        liv: makeIndividual({ id: 'liv', name: 'سارة', sex: 'F', birth: '1990' }),
      },
      families: {},
    };
    const redacted = redactForPublic(data, NOW);
    const list = buildPublicNamesList(redacted);
    const names = list.map((p) => p.name);
    expect(names).toContain('أحمد');
    expect(names).toContain('سارة');
    expect(list.find((p) => p.name === 'سارة')?.gender).toBe('female');
  });

  test('excludes redacted (private) people from the crawlable names list', () => {
    const data: GedcomData = {
      individuals: {
        pub: makeIndividual({ id: 'pub', name: 'علني', isDeceased: true, birth: '1950' }),
        priv: makeIndividual({ id: 'priv', name: 'SECRET_PRIVATE', isPrivate: true }),
      },
      families: {},
    };
    const redacted = redactForPublic(data, NOW);
    const list = buildPublicNamesList(redacted);
    const names = list.map((p) => p.name);
    expect(names).toContain('علني');
    expect(names).not.toContain('SECRET_PRIVATE');
    // and the redaction placeholder is not surfaced as a "name" either
    expect(names).not.toContain('خاص');
  });

  test('skips people with empty names', () => {
    const data: GedcomData = {
      individuals: {
        named: makeIndividual({ id: 'named', name: 'له اسم', isDeceased: true, birth: '1950' }),
        blank: makeIndividual({ id: 'blank', name: '', isDeceased: true, birth: '1950' }),
      },
      families: {},
    };
    const redacted = redactForPublic(data, NOW);
    const list = buildPublicNamesList(redacted);
    expect(list.map((p) => p.name)).toEqual(['له اسم']);
  });
});

// ---------------------------------------------------------------------------
// No-leak across BOTH egress surfaces (§9): JSON feed AND SSR names list.
// ---------------------------------------------------------------------------

describe('no plaintext leaks across both public surfaces', () => {
  test('private/living sensitive data is absent from both the JSON and the names list', () => {
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
          birthPlaceId: 'PLACEID_LEAK',
          _sourceWorkspaceId: 'WS_LEAK',
        }),
      },
      families: {},
    };
    const redacted = redactForPublic(data, NOW);

    // Surface 1: JSON feed
    const json = JSON.stringify(redacted);
    // Surface 2: SSR names list serialized to what would land in HTML
    const namesHtml = JSON.stringify(buildPublicNamesList(redacted));

    for (const surface of [json, namesHtml]) {
      expect(surface).not.toContain('PRIVATE_NAME');
      expect(surface).not.toContain('PRIVATE_BIRTH');
      expect(surface).not.toContain('PRIVATE_NOTE');
      expect(surface).not.toContain('LIVING_BIRTH_1995');
      expect(surface).not.toContain('PLACEID_LEAK');
      expect(surface).not.toContain('WS_LEAK');
    }
  });
});

// ---------------------------------------------------------------------------
// Structural no-unsafe-import test (§9): the public route module must NOT be
// able to reach the member merge path.
// ---------------------------------------------------------------------------

describe('public route does not import the member merge path', () => {
  const publicRouteFiles = [
    'src/app/api/family/[slug]/tree/route.ts',
    'src/lib/tree/public-serve.ts',
    'src/lib/tree/public-compose.ts',
  ];

  for (const rel of publicRouteFiles) {
    test(`${rel} does not import mergePointedSubtree or getActivePointersForWorkspace`, () => {
      const src = readFileSync(join(process.cwd(), rel), 'utf8');
      expect(src).not.toContain('mergePointedSubtree');
      expect(src).not.toContain('getActivePointersForWorkspace');
    });
  }
});

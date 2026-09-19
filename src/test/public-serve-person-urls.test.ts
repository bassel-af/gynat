import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { GedcomData, Individual } from '@/lib/gedcom/types';

// ---------------------------------------------------------------------------
// listIndexablePersonUrls — the sitemap data source for per-person pages.
//
// Mirrors `isPublicPersonPageIndexable` as a SQL `where` (main + public_listed
// + the personPagesIndexable opt-in), then derives the person ids from the very
// same redacted payload the public serve uses — so a private person can never
// reach the sitemap.
// ---------------------------------------------------------------------------

const mockFamilyTreeFindMany = vi.fn();
const mockBranchPointerFindMany = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    familyTree: {
      findMany: (...a: unknown[]) => mockFamilyTreeFindMany(...a),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    branchPointer: {
      findMany: (...a: unknown[]) => mockBranchPointerFindMany(...a),
    },
  },
}));

const mockGetTreeByWorkspaceId = vi.fn();
vi.mock('@/lib/tree/queries', () => ({
  getTreeByWorkspaceId: (...a: unknown[]) => mockGetTreeByWorkspaceId(...a),
  getOrCreateTargetTree: vi.fn(),
}));

vi.mock('@/lib/tree/encryption', () => ({
  getWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32)),
}));

// Sentinel DbTree -> GedcomData, keyed by workspace id.
const gedcomByWorkspace = new Map<string, GedcomData>();
vi.mock('@/lib/tree/mapper', () => ({
  dbTreeToGedcomData: (dbTree: { _ws: string }) =>
    gedcomByWorkspace.get(dbTree._ws) ?? { individuals: {}, families: {} },
  PRIVATE_PERSON_PLACEHOLDER: 'خاص',
  blankPrivatePerson: (ind: Record<string, unknown>) => {
    ind.name = 'خاص';
    ind.givenName = 'خاص';
    ind.surname = '';
  },
}));

import {
  listIndexablePersonUrls,
  MAX_SITEMAP_PERSON_URLS,
} from '@/lib/tree/public-serve';

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
    isDeceased: true,
    isPrivate: false,
    familiesAsSpouse: [],
    familyAsChild: null,
    ...overrides,
  } as Individual;
}

const TS = new Date('2026-06-10T00:00:00Z');

function treeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tree-1',
    workspaceId: 'ws-1',
    nameAr: 'آل السعيد',
    visibility: 'public_listed',
    lastModifiedAt: TS,
    publicSlug: 'alpha',
    kind: 'main',
    personPagesIndexable: true,
    workspace: {
      nameAr: 'آل السعيد',
      enableKunya: true,
      enableCollections: false,
      hideBirthDateForFemale: false,
      hideBirthDateForMale: false,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  gedcomByWorkspace.clear();
  mockBranchPointerFindMany.mockResolvedValue([]);
  mockGetTreeByWorkspaceId.mockImplementation(async (wsId: string) => ({ _ws: wsId }));
});

describe('listIndexablePersonUrls', () => {
  test('queries only main + public_listed + personPagesIndexable trees', async () => {
    mockFamilyTreeFindMany.mockResolvedValue([]);

    await listIndexablePersonUrls();

    const arg = mockFamilyTreeFindMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({
      kind: 'main',
      visibility: 'public_listed',
      personPagesIndexable: true,
    });
  });

  test('emits one entry per public person, carrying the tree slug and mtime', async () => {
    mockFamilyTreeFindMany.mockResolvedValue([treeRow()]);
    gedcomByWorkspace.set('ws-1', {
      individuals: {
        I1: makeIndividual({ id: 'I1', name: 'جدّ', birth: '1900' }),
        I2: makeIndividual({ id: 'I2', name: 'ابن', birth: '1930' }),
      },
      families: {},
    });

    const result = await listIndexablePersonUrls();

    expect(result).toEqual([
      { slug: 'alpha', individualId: 'I1', lastModified: TS },
      { slug: 'alpha', individualId: 'I2', lastModified: TS },
    ]);
  });

  test('never emits a private individual (redaction is the only gate)', async () => {
    mockFamilyTreeFindMany.mockResolvedValue([treeRow()]);
    gedcomByWorkspace.set('ws-1', {
      individuals: {
        I1: makeIndividual({ id: 'I1', name: 'جدّ', birth: '1900' }),
        SECRET: makeIndividual({ id: 'SECRET', name: 'سرّي', isPrivate: true }),
      },
      families: {},
    });

    const result = await listIndexablePersonUrls();

    expect(result.map((r) => r.individualId)).toEqual(['I1']);
  });

  test('returns nothing when no tree opted in (fail-closed)', async () => {
    mockFamilyTreeFindMany.mockResolvedValue([]);
    expect(await listIndexablePersonUrls()).toEqual([]);
  });

  test('stops at the hard cap', async () => {
    mockFamilyTreeFindMany.mockResolvedValue([treeRow()]);
    const individuals: Record<string, Individual> = {};
    for (let i = 0; i < MAX_SITEMAP_PERSON_URLS + 5; i++) {
      individuals[`I${i}`] = makeIndividual({ id: `I${i}`, name: `شخص${i}`, birth: '1900' });
    }
    gedcomByWorkspace.set('ws-1', { individuals, families: {} });

    const result = await listIndexablePersonUrls();

    expect(result).toHaveLength(MAX_SITEMAP_PERSON_URLS);
  });
});

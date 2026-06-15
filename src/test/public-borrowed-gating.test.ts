import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { GedcomData, Individual } from '@/lib/gedcom/types';

// ---------------------------------------------------------------------------
// Mocks — declared before importing the unit under test.
// ---------------------------------------------------------------------------

const mockBranchPointerFindMany = vi.fn();
const mockFamilyTreeFindFirst = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    branchPointer: {
      findMany: (...args: unknown[]) => mockBranchPointerFindMany(...args),
    },
    familyTree: {
      // Used by loadPublicBorrowedSubtrees to read source-tree visibility.
      findFirst: (...args: unknown[]) => mockFamilyTreeFindFirst(...args),
    },
  },
}));

const mockGetTreeByWorkspaceId = vi.fn();
vi.mock('@/lib/tree/queries', () => ({
  getTreeByWorkspaceId: (...args: unknown[]) => mockGetTreeByWorkspaceId(...args),
}));

const mockGetWorkspaceKey = vi.fn();
vi.mock('@/lib/tree/encryption', () => ({
  getWorkspaceKey: (...args: unknown[]) => mockGetWorkspaceKey(...args),
}));

// The mapper is given a sentinel DbTree per source; return the matching GedcomData.
const sourceGedcomByTreeMarker = new Map<string, GedcomData>();
vi.mock('@/lib/tree/mapper', () => ({
  dbTreeToGedcomData: (dbTree: { _marker: string }) =>
    sourceGedcomByTreeMarker.get(dbTree._marker) ?? { individuals: {}, families: {} },
  // Faithful stand-ins for the shared private-redaction helpers (pure, no crypto).
  PRIVATE_PERSON_PLACEHOLDER: 'خاص',
  blankPrivatePerson: (ind: Record<string, unknown>) => {
    ind.name = 'خاص'; ind.givenName = 'خاص'; ind.surname = '';
    ind.birth = ''; ind.birthPlace = ''; ind.birthDescription = '';
    ind.birthNotes = ''; ind.birthHijriDate = '';
    ind.death = ''; ind.deathPlace = ''; ind.deathDescription = '';
    ind.deathNotes = ''; ind.deathHijriDate = '';
    ind.kunya = ''; ind.notes = '';
    delete ind.birthPlaceId; delete ind.deathPlaceId;
  },
}));

import { buildPublicTreePayload, type PublicTreeRecord } from '@/lib/tree/public-serve';

// ---------------------------------------------------------------------------
// Fixtures
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

const HOME_RECORD: PublicTreeRecord = {
  treeId: 'home-tree',
  workspaceId: 'home-ws',
  workspaceNameAr: 'البيت',
  nameAr: 'شجرة البيت',
  visibility: 'public_listed',
  lastModifiedAt: new Date('2026-06-15'),
  publicSlug: 'home-abc123',
  enableKunya: true,
  hideBirthDateForFemale: false,
  hideBirthDateForMale: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  sourceGedcomByTreeMarker.clear();

  // Home tree: one deceased person.
  sourceGedcomByTreeMarker.set('home', {
    individuals: { homePerson: makeIndividual({ id: 'homePerson', name: 'جدّ البيت', isDeceased: true, birth: '1900' }) },
    families: {},
  });

  // getTreeByWorkspaceId returns a sentinel DbTree the mocked mapper resolves.
  mockGetTreeByWorkspaceId.mockImplementation(async (wsId: string) => {
    if (wsId === 'home-ws') return { _marker: 'home' };
    if (wsId === 'src-ws') return { _marker: 'src' };
    return null;
  });
  mockGetWorkspaceKey.mockResolvedValue(Buffer.alloc(32));
});

// ---------------------------------------------------------------------------
// Borrowed-branch gating (§9)
// ---------------------------------------------------------------------------

describe('buildPublicTreePayload borrowed-branch source gating', () => {
  test('a borrowed branch from a PRIVATE source is withheld', async () => {
    // The source has a borrowed person, but its tree is private.
    sourceGedcomByTreeMarker.set('src', {
      individuals: { borrowed: makeIndividual({ id: 'borrowed', name: 'مستعار-خاص', isDeceased: true, birth: '1910' }) },
      families: {},
    });
    mockBranchPointerFindMany.mockResolvedValue([
      { sourceWorkspaceId: 'src-ws', rootIndividualId: 'borrowed', depthLimit: null, includeGrafts: false },
    ]);
    // Source main tree is PRIVATE.
    mockFamilyTreeFindFirst.mockResolvedValue({ visibility: 'private' });

    const payload = await buildPublicTreePayload(HOME_RECORD);

    expect(payload.data.individuals.borrowed).toBeUndefined();
    expect(payload.data.individuals.homePerson).toBeDefined();
    // And nothing leaks into the names list either.
    expect(payload.names.map((n) => n.name)).not.toContain('مستعار-خاص');
  });

  test('a borrowed branch from a PUBLIC source is included AND redacted', async () => {
    // Source has a LIVING borrowed person whose birth date must be hidden.
    sourceGedcomByTreeMarker.set('src', {
      individuals: {
        borrowed: makeIndividual({ id: 'borrowed', name: 'مستعار-حيّ', birth: 'BORROWED_BIRTH_1995' }),
      },
      families: {},
    });
    mockBranchPointerFindMany.mockResolvedValue([
      { sourceWorkspaceId: 'src-ws', rootIndividualId: 'borrowed', depthLimit: null, includeGrafts: false },
    ]);
    // Source main tree is PUBLIC.
    mockFamilyTreeFindFirst.mockResolvedValue({ visibility: 'public_link' });

    const payload = await buildPublicTreePayload(HOME_RECORD);

    // Included...
    const borrowed = payload.data.individuals.borrowed;
    expect(borrowed).toBeDefined();
    // ...AND redacted (living -> birth date hidden), uniformly with home people.
    expect(borrowed.publicDisplay).toBe('living');
    expect(borrowed.birth).toBe('');
    expect(JSON.stringify(payload.data)).not.toContain('BORROWED_BIRTH_1995');
    // Name still appears (living people are shown by name).
    expect(payload.names.map((n) => n.name)).toContain('مستعار-حيّ');
  });

  test('a missing source tree (null visibility) is withheld (fail-closed)', async () => {
    sourceGedcomByTreeMarker.set('src', {
      individuals: { borrowed: makeIndividual({ id: 'borrowed', name: 'مستعار', isDeceased: true, birth: '1910' }) },
      families: {},
    });
    mockBranchPointerFindMany.mockResolvedValue([
      { sourceWorkspaceId: 'src-ws', rootIndividualId: 'borrowed', depthLimit: null, includeGrafts: false },
    ]);
    mockFamilyTreeFindFirst.mockResolvedValue(null); // no source main tree found

    const payload = await buildPublicTreePayload(HOME_RECORD);
    expect(payload.data.individuals.borrowed).toBeUndefined();
  });

  test('with no pointers, only home data is served', async () => {
    mockBranchPointerFindMany.mockResolvedValue([]);
    const payload = await buildPublicTreePayload(HOME_RECORD);
    expect(Object.keys(payload.data.individuals)).toEqual(['homePerson']);
  });
});

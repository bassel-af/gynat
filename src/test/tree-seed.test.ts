import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { GedcomData, Individual, Family, FamilyEvent } from '@/lib/gedcom/types';
import type { PrismaLike } from '@/lib/tree/seed-helpers';
import { seedTreeFromGedcomData } from '@/lib/tree/seed-helpers';

const emptyEvent: FamilyEvent = { date: '', hijriDate: '', place: '', description: '', notes: '' };

function makeTestIndividual(overrides: Partial<Individual> & { id: string }): Individual {
  return {
    type: 'INDI',
    name: '',
    givenName: '',
    surname: '',
    sex: null,
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
    familyAsChild: null,
    ...overrides,
  };
}

function makeTestFamily(overrides: Partial<Family> & { id: string }): Family {
  return {
    type: 'FAM',
    husband: null,
    wife: null,
    children: [],
    marriageContract: emptyEvent,
    marriage: emptyEvent,
    divorce: emptyEvent,
    isDivorced: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock Prisma functions
// ---------------------------------------------------------------------------

const mockFamilyTreeFindUnique = vi.fn();
const mockFamilyTreeCreate = vi.fn();
const mockIndividualCreateMany = vi.fn();
const mockFamilyCreateMany = vi.fn();
const mockFamilyChildCreateMany = vi.fn();
const mockIndividualCount = vi.fn();
const mockTransaction = vi.fn();

function createMockPrisma(): PrismaLike {
  return {
    $transaction: mockTransaction,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGedcomData(overrides?: Partial<GedcomData>): GedcomData {
  return {
    individuals: {},
    families: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('seedTreeFromGedcomData', () => {
  const workspaceId = 'workspace-uuid-1';
  const treeId = 'tree-uuid-1';
  let mockPrisma: PrismaLike;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();

    // Default: $transaction executes the callback immediately
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        familyTree: {
          findUnique: mockFamilyTreeFindUnique,
          create: mockFamilyTreeCreate,
        },
        individual: {
          createMany: mockIndividualCreateMany,
          count: mockIndividualCount,
        },
        family: {
          createMany: mockFamilyCreateMany,
        },
        familyChild: {
          createMany: mockFamilyChildCreateMany,
        },
      });
    });
  });

  test('creates FamilyTree, individuals, families, and family_children from GedcomData', async () => {
    const gedcomData = makeGedcomData({
      individuals: {
        '@I1@': {
          id: '@I1@',
          type: 'INDI',
          name: 'Ahmad Saeed',
          givenName: 'Ahmad',
          surname: 'Saeed',
          sex: 'M',
          birth: '01/01/1950',
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
          familiesAsSpouse: ['@F1@'],
          familyAsChild: null,
        },
        '@I2@': {
          id: '@I2@',
          type: 'INDI',
          name: 'Fatima Ali',
          givenName: 'Fatima',
          surname: 'Ali',
          sex: 'F',
          birth: '06/1955',
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
          familiesAsSpouse: ['@F1@'],
          familyAsChild: null,
        },
        '@I3@': {
          id: '@I3@',
          type: 'INDI',
          name: 'Khalid Ahmad Saeed',
          givenName: 'Khalid',
          surname: 'Saeed',
          sex: 'M',
          birth: '15/03/1980',
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
          familyAsChild: '@F1@',
        },
      },
      families: {
        '@F1@': makeTestFamily({
          id: '@F1@',
          husband: '@I1@',
          wife: '@I2@',
          children: ['@I3@'],
        }),
      },
    });

    // No existing tree
    mockFamilyTreeFindUnique.mockResolvedValue(null);
    mockFamilyTreeCreate.mockResolvedValue({ id: treeId, workspaceId, individuals: [], families: [] });
    mockIndividualCount.mockResolvedValue(0);
    mockIndividualCreateMany.mockResolvedValue({ count: 3 });
    mockFamilyCreateMany.mockResolvedValue({ count: 1 });
    mockFamilyChildCreateMany.mockResolvedValue({ count: 1 });

    const result = await seedTreeFromGedcomData(workspaceId, gedcomData, mockPrisma);

    // Should create a tree
    expect(mockFamilyTreeCreate).toHaveBeenCalledTimes(1);

    // Should create 3 individuals
    expect(mockIndividualCreateMany).toHaveBeenCalledTimes(1);
    const individualData = mockIndividualCreateMany.mock.calls[0][0].data;
    expect(individualData).toHaveLength(3);

    // Should create 1 family
    expect(mockFamilyCreateMany).toHaveBeenCalledTimes(1);
    const familyData = mockFamilyCreateMany.mock.calls[0][0].data;
    expect(familyData).toHaveLength(1);

    // Should create 1 family_child
    expect(mockFamilyChildCreateMany).toHaveBeenCalledTimes(1);
    const childData = mockFamilyChildCreateMany.mock.calls[0][0].data;
    expect(childData).toHaveLength(1);

    // Should return the mapping and tree info
    expect(result.treeId).toBe(treeId);
    expect(result.individualCount).toBe(3);
    expect(result.familyCount).toBe(1);
  });

  test('correctly maps GEDCOM IDs to DB records in families and family_children', async () => {
    const gedcomData = makeGedcomData({
      individuals: {
        '@I1@': {
          id: '@I1@', type: 'INDI', name: 'Father', givenName: 'Father', surname: '',
          sex: 'M', birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
          familiesAsSpouse: ['@F1@'], familyAsChild: null,
        },
        '@I2@': {
          id: '@I2@', type: 'INDI', name: 'Mother', givenName: 'Mother', surname: '',
          sex: 'F', birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
          familiesAsSpouse: ['@F1@'], familyAsChild: null,
        },
        '@I3@': {
          id: '@I3@', type: 'INDI', name: 'Child', givenName: 'Child', surname: '',
          sex: 'M', birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
          familiesAsSpouse: [], familyAsChild: '@F1@',
        },
      },
      families: {
        '@F1@': makeTestFamily({
          id: '@F1@',
          husband: '@I1@', wife: '@I2@',
          children: ['@I3@'],
        }),
      },
    });

    mockFamilyTreeFindUnique.mockResolvedValue(null);
    mockFamilyTreeCreate.mockResolvedValue({ id: treeId, workspaceId, individuals: [], families: [] });
    mockIndividualCount.mockResolvedValue(0);
    mockIndividualCreateMany.mockResolvedValue({ count: 3 });
    mockFamilyCreateMany.mockResolvedValue({ count: 1 });
    mockFamilyChildCreateMany.mockResolvedValue({ count: 1 });

    const result = await seedTreeFromGedcomData(workspaceId, gedcomData, mockPrisma);

    // Verify the GEDCOM-to-UUID mapping was used for families
    const familyData = mockFamilyCreateMany.mock.calls[0][0].data;
    const family = familyData[0];

    // The husband and wife IDs should be UUIDs from the mapping, not GEDCOM IDs
    expect(family.husbandId).toBe(result.gedcomToDbId['@I1@']);
    expect(family.wifeId).toBe(result.gedcomToDbId['@I2@']);
    expect(family.gedcomId).toBe('@F1@');
    expect(family.treeId).toBe(treeId);

    // Verify family_children uses the correct mapped IDs
    const childData = mockFamilyChildCreateMany.mock.calls[0][0].data;
    expect(childData[0].individualId).toBe(result.gedcomToDbId['@I3@']);
  });

  test('handles individuals with minimal data (only name, no birth/death)', async () => {
    const gedcomData = makeGedcomData({
      individuals: {
        '@I1@': {
          id: '@I1@', type: 'INDI', name: 'Unknown Person', givenName: 'Unknown Person', surname: '',
          sex: null, birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
          familiesAsSpouse: [], familyAsChild: null,
        },
      },
    });

    mockFamilyTreeFindUnique.mockResolvedValue(null);
    mockFamilyTreeCreate.mockResolvedValue({ id: treeId, workspaceId, individuals: [], families: [] });
    mockIndividualCount.mockResolvedValue(0);
    mockIndividualCreateMany.mockResolvedValue({ count: 1 });
    mockFamilyCreateMany.mockResolvedValue({ count: 0 });
    mockFamilyChildCreateMany.mockResolvedValue({ count: 0 });

    await seedTreeFromGedcomData(workspaceId, gedcomData, mockPrisma);

    const individualData = mockIndividualCreateMany.mock.calls[0][0].data;
    expect(individualData).toHaveLength(1);

    const ind = individualData[0];
    expect(ind.gedcomId).toBe('@I1@');
    expect(ind.givenName).toBe('Unknown Person');
    expect(ind.surname).toBeNull();
    expect(ind.sex).toBeNull();
    expect(ind.birthDate).toBeNull();
    expect(ind.deathDate).toBeNull();
    expect(ind.treeId).toBe(treeId);
  });

  test('handles empty GedcomData (no individuals, no families)', async () => {
    const gedcomData = makeGedcomData();

    mockFamilyTreeFindUnique.mockResolvedValue(null);
    mockFamilyTreeCreate.mockResolvedValue({ id: treeId, workspaceId, individuals: [], families: [] });
    mockIndividualCount.mockResolvedValue(0);
    mockIndividualCreateMany.mockResolvedValue({ count: 0 });
    mockFamilyCreateMany.mockResolvedValue({ count: 0 });
    mockFamilyChildCreateMany.mockResolvedValue({ count: 0 });

    const result = await seedTreeFromGedcomData(workspaceId, gedcomData, mockPrisma);

    expect(result.treeId).toBe(treeId);
    expect(result.individualCount).toBe(0);
    expect(result.familyCount).toBe(0);
    expect(result.gedcomToDbId).toEqual({});

    // Should still create a tree
    expect(mockFamilyTreeCreate).toHaveBeenCalledTimes(1);

    // createMany should not be called when there is no data
    expect(mockIndividualCreateMany).not.toHaveBeenCalled();
    expect(mockFamilyCreateMany).not.toHaveBeenCalled();
    expect(mockFamilyChildCreateMany).not.toHaveBeenCalled();
  });

  test('skips seeding if tree already has individuals (idempotent)', async () => {
    const gedcomData = makeGedcomData({
      individuals: {
        '@I1@': {
          id: '@I1@', type: 'INDI', name: 'Ahmad', givenName: 'Ahmad', surname: '',
          sex: 'M', birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
          familiesAsSpouse: [], familyAsChild: null,
        },
      },
    });

    // Tree already exists
    mockFamilyTreeFindUnique.mockResolvedValue({ id: treeId, workspaceId, individuals: [], families: [] });
    // Tree already has individuals
    mockIndividualCount.mockResolvedValue(5);

    const result = await seedTreeFromGedcomData(workspaceId, gedcomData, mockPrisma);

    expect(result.treeId).toBe(treeId);
    expect(result.skipped).toBe(true);
    // Should NOT create new records
    expect(mockIndividualCreateMany).not.toHaveBeenCalled();
    expect(mockFamilyCreateMany).not.toHaveBeenCalled();
    expect(mockFamilyChildCreateMany).not.toHaveBeenCalled();
    // Should NOT create a new tree
    expect(mockFamilyTreeCreate).not.toHaveBeenCalled();
  });

  test('maps husband/wife/children references correctly with multiple families', async () => {
    const gedcomData = makeGedcomData({
      individuals: {
        '@I1@': {
          id: '@I1@', type: 'INDI', name: 'Grandfather', givenName: 'Grandfather', surname: '',
          sex: 'M', birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
          familiesAsSpouse: ['@F1@', '@F2@'], familyAsChild: null,
        },
        '@I2@': {
          id: '@I2@', type: 'INDI', name: 'Wife One', givenName: 'Wife One', surname: '',
          sex: 'F', birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
          familiesAsSpouse: ['@F1@'], familyAsChild: null,
        },
        '@I3@': {
          id: '@I3@', type: 'INDI', name: 'Wife Two', givenName: 'Wife Two', surname: '',
          sex: 'F', birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
          familiesAsSpouse: ['@F2@'], familyAsChild: null,
        },
        '@I4@': {
          id: '@I4@', type: 'INDI', name: 'Child A', givenName: 'Child A', surname: '',
          sex: 'M', birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
          familiesAsSpouse: [], familyAsChild: '@F1@',
        },
        '@I5@': {
          id: '@I5@', type: 'INDI', name: 'Child B', givenName: 'Child B', surname: '',
          sex: 'F', birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
          familiesAsSpouse: [], familyAsChild: '@F2@',
        },
      },
      families: {
        '@F1@': makeTestFamily({
          id: '@F1@',
          husband: '@I1@', wife: '@I2@',
          children: ['@I4@'],
        }),
        '@F2@': makeTestFamily({
          id: '@F2@',
          husband: '@I1@', wife: '@I3@',
          children: ['@I5@'],
        }),
      },
    });

    mockFamilyTreeFindUnique.mockResolvedValue(null);
    mockFamilyTreeCreate.mockResolvedValue({ id: treeId, workspaceId, individuals: [], families: [] });
    mockIndividualCount.mockResolvedValue(0);
    mockIndividualCreateMany.mockResolvedValue({ count: 5 });
    mockFamilyCreateMany.mockResolvedValue({ count: 2 });
    mockFamilyChildCreateMany.mockResolvedValue({ count: 2 });

    const result = await seedTreeFromGedcomData(workspaceId, gedcomData, mockPrisma);

    // Should have 2 families
    const familyData = mockFamilyCreateMany.mock.calls[0][0].data;
    expect(familyData).toHaveLength(2);

    // Both families share the same husband
    const fatherUuid = result.gedcomToDbId['@I1@'];
    expect(familyData[0].husbandId).toBe(fatherUuid);
    expect(familyData[1].husbandId).toBe(fatherUuid);

    // Different wives
    expect(familyData[0].wifeId).toBe(result.gedcomToDbId['@I2@']);
    expect(familyData[1].wifeId).toBe(result.gedcomToDbId['@I3@']);

    // 2 family_children total
    const childData = mockFamilyChildCreateMany.mock.calls[0][0].data;
    expect(childData).toHaveLength(2);

    expect(result.individualCount).toBe(5);
    expect(result.familyCount).toBe(2);
  });

  test('uses a Prisma transaction for atomicity', async () => {
    const gedcomData = makeGedcomData({
      individuals: {
        '@I1@': {
          id: '@I1@', type: 'INDI', name: 'Test', givenName: 'Test', surname: '',
          sex: 'M', birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
          familiesAsSpouse: [], familyAsChild: null,
        },
      },
    });

    mockFamilyTreeFindUnique.mockResolvedValue(null);
    mockFamilyTreeCreate.mockResolvedValue({ id: treeId, workspaceId, individuals: [], families: [] });
    mockIndividualCount.mockResolvedValue(0);
    mockIndividualCreateMany.mockResolvedValue({ count: 1 });
    mockFamilyCreateMany.mockResolvedValue({ count: 0 });
    mockFamilyChildCreateMany.mockResolvedValue({ count: 0 });

    await seedTreeFromGedcomData(workspaceId, gedcomData, mockPrisma);

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockTransaction).toHaveBeenCalledWith(expect.any(Function));
  });

  test('includes birthDescription and deathDescription in createMany data', async () => {
    const gedcomData = makeGedcomData({
      individuals: {
        '@I1@': {
          id: '@I1@', type: 'INDI', name: 'Ahmad', givenName: 'Ahmad', surname: '',
          sex: 'M', birth: '', birthPlace: '', birthDescription: 'Natural birth', birthNotes: '', birthHijriDate: '', death: '2020', deathPlace: '', deathDescription: 'Heart attack', deathNotes: '', deathHijriDate: '', notes: '', isDeceased: true, isPrivate: false,
          familiesAsSpouse: [], familyAsChild: null,
        },
      },
    });

    mockFamilyTreeFindUnique.mockResolvedValue(null);
    mockFamilyTreeCreate.mockResolvedValue({ id: treeId, workspaceId, individuals: [], families: [] });
    mockIndividualCount.mockResolvedValue(0);
    mockIndividualCreateMany.mockResolvedValue({ count: 1 });
    mockFamilyCreateMany.mockResolvedValue({ count: 0 });
    mockFamilyChildCreateMany.mockResolvedValue({ count: 0 });

    await seedTreeFromGedcomData(workspaceId, gedcomData, mockPrisma);

    const individualData = mockIndividualCreateMany.mock.calls[0][0].data;
    expect(individualData).toHaveLength(1);
    const ind = individualData[0];
    expect(ind.birthDescription).toBe('Natural birth');
    expect(ind.deathDescription).toBe('Heart attack');
  });

  test('sets birthDescription and deathDescription to null when empty', async () => {
    const gedcomData = makeGedcomData({
      individuals: {
        '@I1@': {
          id: '@I1@', type: 'INDI', name: 'Ahmad', givenName: 'Ahmad', surname: '',
          sex: 'M', birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '', death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '', notes: '', isDeceased: false, isPrivate: false,
          familiesAsSpouse: [], familyAsChild: null,
        },
      },
    });

    mockFamilyTreeFindUnique.mockResolvedValue(null);
    mockFamilyTreeCreate.mockResolvedValue({ id: treeId, workspaceId, individuals: [], families: [] });
    mockIndividualCount.mockResolvedValue(0);
    mockIndividualCreateMany.mockResolvedValue({ count: 1 });
    mockFamilyCreateMany.mockResolvedValue({ count: 0 });
    mockFamilyChildCreateMany.mockResolvedValue({ count: 0 });

    await seedTreeFromGedcomData(workspaceId, gedcomData, mockPrisma);

    const individualData = mockIndividualCreateMany.mock.calls[0][0].data;
    const ind = individualData[0];
    expect(ind.birthDescription).toBeNull();
    expect(ind.deathDescription).toBeNull();
  });

  test('seeds individual with Hijri dates', async () => {
    const gedcomData = makeGedcomData({
      individuals: {
        '@I1@': makeTestIndividual({
          id: '@I1@',
          name: 'Ahmad',
          givenName: 'Ahmad',
          birthHijriDate: '1369/03/16',
          deathHijriDate: '1441/10/09',
          isDeceased: true,
        }),
      },
    });

    mockFamilyTreeFindUnique.mockResolvedValue(null);
    mockFamilyTreeCreate.mockResolvedValue({ id: treeId, workspaceId, individuals: [], families: [] });
    mockIndividualCount.mockResolvedValue(0);
    mockIndividualCreateMany.mockResolvedValue({ count: 1 });

    await seedTreeFromGedcomData(workspaceId, gedcomData, mockPrisma);

    const individualData = mockIndividualCreateMany.mock.calls[0][0].data;
    const ind = individualData[0];
    expect(ind.birthHijriDate).toBe('1369/03/16');
    expect(ind.deathHijriDate).toBe('1441/10/09');
  });

  test('sets birthHijriDate and deathHijriDate to null when empty', async () => {
    const gedcomData = makeGedcomData({
      individuals: {
        '@I1@': makeTestIndividual({
          id: '@I1@',
          name: 'Ahmad',
          givenName: 'Ahmad',
          birthHijriDate: '',
          deathHijriDate: '',
        }),
      },
    });

    mockFamilyTreeFindUnique.mockResolvedValue(null);
    mockFamilyTreeCreate.mockResolvedValue({ id: treeId, workspaceId, individuals: [], families: [] });
    mockIndividualCount.mockResolvedValue(0);
    mockIndividualCreateMany.mockResolvedValue({ count: 1 });

    await seedTreeFromGedcomData(workspaceId, gedcomData, mockPrisma);

    const individualData = mockIndividualCreateMany.mock.calls[0][0].data;
    const ind = individualData[0];
    expect(ind.birthHijriDate).toBeNull();
    expect(ind.deathHijriDate).toBeNull();
  });

  test('seeds family with marriage event data', async () => {
    const gedcomData = makeGedcomData({
      individuals: {
        '@I1@': makeTestIndividual({
          id: '@I1@',
          name: 'Father',
          givenName: 'Father',
          sex: 'M',
          familiesAsSpouse: ['@F1@'],
        }),
        '@I2@': makeTestIndividual({
          id: '@I2@',
          name: 'Mother',
          givenName: 'Mother',
          sex: 'F',
          familiesAsSpouse: ['@F1@'],
        }),
      },
      families: {
        '@F1@': makeTestFamily({
          id: '@F1@',
          husband: '@I1@',
          wife: '@I2@',
          marriageContract: {
            date: '2020-01-01',
            hijriDate: '1441/05/06',
            place: 'Riyadh',
            description: 'Official contract',
            notes: 'Witnessed by family',
          },
          marriage: {
            date: '2020-03-15',
            hijriDate: '1441/07/20',
            place: 'Jeddah',
            description: 'Wedding ceremony',
            notes: 'Large gathering',
          },
          isDivorced: true,
          divorce: {
            date: '2023-06-01',
            hijriDate: '1444/11/12',
            place: 'Mecca',
            description: 'Mutual agreement',
            notes: 'Amicable',
          },
        }),
      },
    });

    mockFamilyTreeFindUnique.mockResolvedValue(null);
    mockFamilyTreeCreate.mockResolvedValue({ id: treeId, workspaceId, individuals: [], families: [] });
    mockIndividualCount.mockResolvedValue(0);
    mockIndividualCreateMany.mockResolvedValue({ count: 2 });
    mockFamilyCreateMany.mockResolvedValue({ count: 1 });
    mockFamilyChildCreateMany.mockResolvedValue({ count: 0 });

    await seedTreeFromGedcomData(workspaceId, gedcomData, mockPrisma);

    const familyData = mockFamilyCreateMany.mock.calls[0][0].data;
    const fam = familyData[0];

    // Marriage contract
    expect(fam.marriageContractDate).toBe('2020-01-01');
    expect(fam.marriageContractHijriDate).toBe('1441/05/06');
    expect(fam.marriageContractPlace).toBe('Riyadh');
    expect(fam.marriageContractDescription).toBe('Official contract');
    expect(fam.marriageContractNotes).toBe('Witnessed by family');

    // Marriage
    expect(fam.marriageDate).toBe('2020-03-15');
    expect(fam.marriageHijriDate).toBe('1441/07/20');
    expect(fam.marriagePlace).toBe('Jeddah');
    expect(fam.marriageDescription).toBe('Wedding ceremony');
    expect(fam.marriageNotes).toBe('Large gathering');

    // Divorce
    expect(fam.isDivorced).toBe(true);
    expect(fam.divorceDate).toBe('2023-06-01');
    expect(fam.divorceHijriDate).toBe('1444/11/12');
    expect(fam.divorcePlace).toBe('Mecca');
    expect(fam.divorceDescription).toBe('Mutual agreement');
    expect(fam.divorceNotes).toBe('Amicable');
  });

  test('sets family event fields to null when empty', async () => {
    const gedcomData = makeGedcomData({
      individuals: {
        '@I1@': makeTestIndividual({
          id: '@I1@',
          name: 'Father',
          givenName: 'Father',
          sex: 'M',
          familiesAsSpouse: ['@F1@'],
        }),
      },
      families: {
        '@F1@': makeTestFamily({
          id: '@F1@',
          husband: '@I1@',
        }),
      },
    });

    mockFamilyTreeFindUnique.mockResolvedValue(null);
    mockFamilyTreeCreate.mockResolvedValue({ id: treeId, workspaceId, individuals: [], families: [] });
    mockIndividualCount.mockResolvedValue(0);
    mockIndividualCreateMany.mockResolvedValue({ count: 1 });
    mockFamilyCreateMany.mockResolvedValue({ count: 1 });
    mockFamilyChildCreateMany.mockResolvedValue({ count: 0 });

    await seedTreeFromGedcomData(workspaceId, gedcomData, mockPrisma);

    const familyData = mockFamilyCreateMany.mock.calls[0][0].data;
    const fam = familyData[0];

    expect(fam.marriageContractDate).toBeNull();
    expect(fam.marriageContractHijriDate).toBeNull();
    expect(fam.marriageDate).toBeNull();
    expect(fam.marriageHijriDate).toBeNull();
    expect(fam.isDivorced).toBe(false);
    expect(fam.divorceDate).toBeNull();
    expect(fam.divorceHijriDate).toBeNull();
  });
});

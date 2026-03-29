import { describe, test, expect } from 'vitest';
import {
  familyEventFieldsSchema,
  createFamilySchema,
  updateFamilySchema,
} from '@/lib/tree/schemas';
import { dbTreeToGedcomData, type DbTree } from '@/lib/tree/mapper';
import { buildFamilyEventInitialData } from '@/lib/person-detail-helpers';
import type { Family, FamilyEvent } from '@/lib/gedcom/types';

// ============================================================================
// 1. Type system — Family.isUmmWalad
// ============================================================================
describe('Family type has isUmmWalad field', () => {
  test('Family object can have isUmmWalad set to true', () => {
    const emptyEvent: FamilyEvent = { date: '', hijriDate: '', place: '', description: '', notes: '' };
    const family: Family = {
      id: 'f1',
      type: 'FAM',
      husband: null,
      wife: null,
      children: [],
      marriageContract: emptyEvent,
      marriage: emptyEvent,
      divorce: emptyEvent,
      isDivorced: false,
      isUmmWalad: true,
    };
    expect(family.isUmmWalad).toBe(true);
  });

  test('Family object defaults isUmmWalad to undefined when not set', () => {
    const emptyEvent: FamilyEvent = { date: '', hijriDate: '', place: '', description: '', notes: '' };
    const family: Family = {
      id: 'f1',
      type: 'FAM',
      husband: null,
      wife: null,
      children: [],
      marriageContract: emptyEvent,
      marriage: emptyEvent,
      divorce: emptyEvent,
      isDivorced: false,
    };
    expect(family.isUmmWalad).toBeUndefined();
  });
});

// ============================================================================
// 2. Zod schemas — isUmmWalad field
// ============================================================================
describe('familyEventFieldsSchema accepts isUmmWalad', () => {
  test('accepts isUmmWalad as boolean', () => {
    const result = familyEventFieldsSchema.safeParse({ isUmmWalad: true });
    expect(result.success).toBe(true);
  });

  test('accepts isUmmWalad as false', () => {
    const result = familyEventFieldsSchema.safeParse({ isUmmWalad: false });
    expect(result.success).toBe(true);
  });

  test('accepts omitted isUmmWalad (optional)', () => {
    const result = familyEventFieldsSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('createFamilySchema validates isUmmWalad with MARC/MARR mutual exclusion', () => {
  test('rejects isUmmWalad=true when marriageContractDate is set', () => {
    const result = createFamilySchema.safeParse({
      isUmmWalad: true,
      marriageContractDate: '2020-01-01',
    });
    expect(result.success).toBe(false);
  });

  test('rejects isUmmWalad=true when marriageDate is set', () => {
    const result = createFamilySchema.safeParse({
      isUmmWalad: true,
      marriageDate: '2020-03-15',
    });
    expect(result.success).toBe(false);
  });

  test('accepts isUmmWalad=true when no MARC/MARR fields are set', () => {
    const result = createFamilySchema.safeParse({
      isUmmWalad: true,
      husbandId: 'a0000000-0000-4000-a000-000000000001',
    });
    expect(result.success).toBe(true);
  });

  test('accepts isUmmWalad=false with MARC fields', () => {
    const result = createFamilySchema.safeParse({
      isUmmWalad: false,
      marriageContractDate: '2020-01-01',
    });
    expect(result.success).toBe(true);
  });
});

describe('updateFamilySchema validates isUmmWalad with MARC/MARR mutual exclusion', () => {
  test('rejects isUmmWalad=true when marriageContractDate is set', () => {
    const result = updateFamilySchema.safeParse({
      isUmmWalad: true,
      marriageContractDate: '2020-01-01',
    });
    expect(result.success).toBe(false);
  });

  test('rejects isUmmWalad=true when marriageHijriDate is set', () => {
    const result = updateFamilySchema.safeParse({
      isUmmWalad: true,
      marriageHijriDate: '5 رمضان 1441',
    });
    expect(result.success).toBe(false);
  });

  test('accepts isUmmWalad=true when all MARC/MARR fields are null', () => {
    const result = updateFamilySchema.safeParse({
      isUmmWalad: true,
      marriageContractDate: null,
      marriageDate: null,
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// 3. Mapper — DbFamily.isUmmWalad -> Family.isUmmWalad
// ============================================================================
describe('dbTreeToGedcomData maps isUmmWalad', () => {
  test('maps isUmmWalad from DB family to GedcomData family', () => {
    const dbTree: DbTree = {
      id: 'tree1',
      workspaceId: 'ws1',
      individuals: [
        {
          id: 'ind1', treeId: 'tree1', gedcomId: null,
          givenName: 'Ahmad', surname: null, fullName: null,
          sex: 'M', birthDate: null, birthPlace: null, birthPlaceId: null,
          birthDescription: null, birthNotes: null, birthHijriDate: null,
          deathDate: null, deathPlace: null, deathPlaceId: null,
          deathDescription: null, deathNotes: null, deathHijriDate: null,
          notes: null, isDeceased: false, isPrivate: false,
          createdById: null, updatedAt: new Date(), createdAt: new Date(),
        },
      ],
      families: [
        {
          id: 'fam1', treeId: 'tree1', gedcomId: null,
          husbandId: 'ind1', wifeId: null,
          children: [],
          marriageContractDate: null, marriageContractHijriDate: null,
          marriageContractPlace: null, marriageContractPlaceId: null,
          marriageContractDescription: null, marriageContractNotes: null,
          marriageDate: null, marriageHijriDate: null,
          marriagePlace: null, marriagePlaceId: null,
          marriageDescription: null, marriageNotes: null,
          isDivorced: false,
          divorceDate: null, divorceHijriDate: null,
          divorcePlace: null, divorcePlaceId: null,
          divorceDescription: null, divorceNotes: null,
          isUmmWalad: true,
        },
      ],
    };

    const result = dbTreeToGedcomData(dbTree);
    expect(result.families['fam1'].isUmmWalad).toBe(true);
  });

  test('maps isUmmWalad false when not set in DB', () => {
    const dbTree: DbTree = {
      id: 'tree1',
      workspaceId: 'ws1',
      individuals: [],
      families: [
        {
          id: 'fam1', treeId: 'tree1', gedcomId: null,
          husbandId: null, wifeId: null,
          children: [],
          marriageContractDate: null, marriageContractHijriDate: null,
          marriageContractPlace: null, marriageContractPlaceId: null,
          marriageContractDescription: null, marriageContractNotes: null,
          marriageDate: null, marriageHijriDate: null,
          marriagePlace: null, marriagePlaceId: null,
          marriageDescription: null, marriageNotes: null,
          isDivorced: false,
          divorceDate: null, divorceHijriDate: null,
          divorcePlace: null, divorcePlaceId: null,
          divorceDescription: null, divorceNotes: null,
          isUmmWalad: false,
        },
      ],
    };

    const result = dbTreeToGedcomData(dbTree);
    expect(result.families['fam1'].isUmmWalad).toBe(false);
  });
});

// ============================================================================
// 4. buildFamilyEventInitialData includes isUmmWalad
// ============================================================================
describe('buildFamilyEventInitialData includes isUmmWalad', () => {
  test('includes isUmmWalad true from family', () => {
    const emptyEvent: FamilyEvent = { date: '', hijriDate: '', place: '', description: '', notes: '' };
    const family: Family = {
      id: 'f1', type: 'FAM', husband: null, wife: null, children: [],
      marriageContract: emptyEvent, marriage: emptyEvent, divorce: emptyEvent,
      isDivorced: false, isUmmWalad: true,
    };
    const result = buildFamilyEventInitialData(family);
    expect(result.isUmmWalad).toBe(true);
  });

  test('includes isUmmWalad false when not set on family', () => {
    const emptyEvent: FamilyEvent = { date: '', hijriDate: '', place: '', description: '', notes: '' };
    const family: Family = {
      id: 'f1', type: 'FAM', husband: null, wife: null, children: [],
      marriageContract: emptyEvent, marriage: emptyEvent, divorce: emptyEvent,
      isDivorced: false,
    };
    const result = buildFamilyEventInitialData(family);
    expect(result.isUmmWalad).toBe(false);
  });
});

// ============================================================================
// 5. Branch pointer — synthetic families always have isUmmWalad: false
// ============================================================================
describe('branch pointer synthetic families have isUmmWalad false', () => {
  test('makeSyntheticFamily in mergePointedSubtree sets isUmmWalad false', async () => {
    const { mergePointedSubtree } = await import('@/lib/tree/branch-pointer-merge');
    const emptyEvent: FamilyEvent = { date: '', hijriDate: '', place: '', description: '', notes: '' };

    const target = {
      individuals: {
        'anchor': {
          id: 'anchor', type: 'INDI' as const, name: 'Anchor', givenName: 'Anchor', surname: '',
          sex: 'M' as const, birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
          death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
          notes: '', isDeceased: false, isPrivate: false,
          familiesAsSpouse: [], familyAsChild: null,
        },
      },
      families: {},
    };

    const pointed = {
      individuals: {
        'pointed-root': {
          id: 'pointed-root', type: 'INDI' as const, name: 'Pointed', givenName: 'Pointed', surname: '',
          sex: 'M' as const, birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
          death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
          notes: '', isDeceased: false, isPrivate: false,
          familiesAsSpouse: [], familyAsChild: null,
        },
      },
      families: {},
    };

    const result = mergePointedSubtree(target, pointed, {
      pointerId: 'ptr-1',
      anchorIndividualId: 'anchor',
      selectedIndividualId: 'pointed-root',
      relationship: 'child',
      sourceWorkspaceId: 'source-ws',
    });

    const syntheticFam = result.families['ptr-ptr-1-fam'];
    expect(syntheticFam).toBeDefined();
    expect(syntheticFam.isUmmWalad).toBe(false);
  });

  test('prepareDeepCopy stitch family has isUmmWalad false', async () => {
    const { prepareDeepCopy } = await import('@/lib/tree/branch-pointer-deep-copy');
    const emptyEvent: FamilyEvent = { date: '', hijriDate: '', place: '', description: '', notes: '' };

    const pointed = {
      individuals: {
        'root': {
          id: 'root', type: 'INDI' as const, name: 'Root', givenName: 'Root', surname: '',
          sex: 'M' as const, birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
          death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
          notes: '', isDeceased: false, isPrivate: false,
          familiesAsSpouse: [], familyAsChild: null,
        },
      },
      families: {},
    };

    const result = prepareDeepCopy(pointed, {
      anchorIndividualId: 'anchor',
      relationship: 'child',
      pointerId: 'ptr-1',
    });

    expect(result.stitchFamily).not.toBeNull();
    expect(result.stitchFamily!.isUmmWalad).toBe(false);
  });
});

// ============================================================================
// 6. Deep copy preserves isUmmWalad on copied families
// ============================================================================
describe('prepareDeepCopy preserves isUmmWalad on copied families', () => {
  test('copies isUmmWalad from source families', async () => {
    const { prepareDeepCopy } = await import('@/lib/tree/branch-pointer-deep-copy');
    const emptyEvent: FamilyEvent = { date: '', hijriDate: '', place: '', description: '', notes: '' };

    const pointed = {
      individuals: {
        'p1': {
          id: 'p1', type: 'INDI' as const, name: 'P1', givenName: 'P1', surname: '',
          sex: 'M' as const, birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
          death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
          notes: '', isDeceased: false, isPrivate: false,
          familiesAsSpouse: ['f1'], familyAsChild: null,
        },
      },
      families: {
        'f1': {
          id: 'f1', type: 'FAM' as const, husband: 'p1', wife: null, children: [],
          marriageContract: emptyEvent, marriage: emptyEvent, divorce: emptyEvent,
          isDivorced: false, isUmmWalad: true,
        },
      },
    };

    const result = prepareDeepCopy(pointed, {
      anchorIndividualId: 'anchor',
      relationship: 'child',
      pointerId: 'ptr-1',
    });

    // Find the copied family (it has a new UUID)
    const copiedFamilies = Object.values(result.families);
    expect(copiedFamilies.length).toBe(1);
    expect(copiedFamilies[0].isUmmWalad).toBe(true);
  });
});

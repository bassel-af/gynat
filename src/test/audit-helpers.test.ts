import { describe, test, expect, beforeAll } from 'vitest';

// ============================================================================
// Tests for src/lib/tree/audit.ts — snapshot extraction + description builder
// ============================================================================

describe('snapshotIndividual', () => {
  let snapshotIndividual: typeof import('@/lib/tree/audit').snapshotIndividual;

  beforeAll(async () => {
    const mod = await import('@/lib/tree/audit');
    snapshotIndividual = mod.snapshotIndividual;
  });

  test('extracts all scalar fields from a Prisma individual record', () => {
    const record = {
      id: 'ind-1',
      treeId: 'tree-1',
      gedcomId: 'I001',
      givenName: 'محمد',
      surname: 'السعيد',
      fullName: 'محمد السعيد',
      sex: 'M',
      birthDate: '1990-01-01',
      birthPlace: 'دمشق',
      birthPlaceId: 'place-1',
      birthDescription: 'ولد في دمشق',
      birthNotes: 'ملاحظات',
      birthHijriDate: '1410-06-05',
      deathDate: null,
      deathPlace: null,
      deathPlaceId: null,
      deathDescription: null,
      deathNotes: null,
      deathHijriDate: null,
      kunya: 'أبو أحمد',
      notes: 'some notes',
      isDeceased: false,
      isPrivate: false,
      createdById: 'user-1',
      updatedAt: new Date(),
      createdAt: new Date(),
    };

    const snapshot = snapshotIndividual(record);

    // Should include relevant fields
    expect(snapshot.id).toBe('ind-1');
    expect(snapshot.givenName).toBe('محمد');
    expect(snapshot.surname).toBe('السعيد');
    expect(snapshot.fullName).toBe('محمد السعيد');
    expect(snapshot.sex).toBe('M');
    expect(snapshot.birthDate).toBe('1990-01-01');
    expect(snapshot.birthPlace).toBe('دمشق');
    expect(snapshot.birthPlaceId).toBe('place-1');
    expect(snapshot.birthDescription).toBe('ولد في دمشق');
    expect(snapshot.birthNotes).toBe('ملاحظات');
    expect(snapshot.birthHijriDate).toBe('1410-06-05');
    expect(snapshot.kunya).toBe('أبو أحمد');
    expect(snapshot.notes).toBe('some notes');
    expect(snapshot.isDeceased).toBe(false);
    expect(snapshot.isPrivate).toBe(false);

    // Should NOT include relational/metadata fields
    expect(snapshot).not.toHaveProperty('treeId');
    expect(snapshot).not.toHaveProperty('gedcomId');
    expect(snapshot).not.toHaveProperty('createdById');
    expect(snapshot).not.toHaveProperty('updatedAt');
    expect(snapshot).not.toHaveProperty('createdAt');
  });

  test('handles null values correctly', () => {
    const record = {
      id: 'ind-2',
      givenName: null,
      surname: null,
      fullName: null,
      sex: null,
      birthDate: null,
      birthPlace: null,
      birthPlaceId: null,
      birthDescription: null,
      birthNotes: null,
      birthHijriDate: null,
      deathDate: null,
      deathPlace: null,
      deathPlaceId: null,
      deathDescription: null,
      deathNotes: null,
      deathHijriDate: null,
      kunya: null,
      notes: null,
      isDeceased: false,
      isPrivate: false,
    };

    const snapshot = snapshotIndividual(record);
    expect(snapshot.givenName).toBeNull();
    expect(snapshot.surname).toBeNull();
    expect(snapshot.birthDate).toBeNull();
    expect(snapshot.kunya).toBeNull();
  });
});

describe('snapshotFamily', () => {
  let snapshotFamily: typeof import('@/lib/tree/audit').snapshotFamily;

  beforeAll(async () => {
    const mod = await import('@/lib/tree/audit');
    snapshotFamily = mod.snapshotFamily;
  });

  test('extracts family fields including childrenIds from children relation', () => {
    const record = {
      id: 'fam-1',
      treeId: 'tree-1',
      husbandId: 'ind-1',
      wifeId: 'ind-2',
      children: [
        { individualId: 'ind-3', familyId: 'fam-1' },
        { individualId: 'ind-4', familyId: 'fam-1' },
      ],
      marriageContractDate: '2020-01-15',
      marriageContractHijriDate: '1441-05-20',
      marriageContractPlace: 'دمشق',
      marriageContractPlaceId: 'place-1',
      marriageContractDescription: 'عقد قران',
      marriageContractNotes: null,
      marriageDate: '2020-06-01',
      marriageHijriDate: '1441-10-09',
      marriagePlace: 'دمشق',
      marriagePlaceId: 'place-1',
      marriageDescription: null,
      marriageNotes: null,
      isUmmWalad: false,
      isDivorced: false,
      divorceDate: null,
      divorceHijriDate: null,
      divorcePlace: null,
      divorcePlaceId: null,
      divorceDescription: null,
      divorceNotes: null,
    };

    const snapshot = snapshotFamily(record);

    expect(snapshot.id).toBe('fam-1');
    expect(snapshot.husbandId).toBe('ind-1');
    expect(snapshot.wifeId).toBe('ind-2');
    expect(snapshot.childrenIds).toEqual(['ind-3', 'ind-4']);
    expect(snapshot.marriageContractDate).toBe('2020-01-15');
    expect(snapshot.isUmmWalad).toBe(false);
    expect(snapshot.isDivorced).toBe(false);

    // Should NOT include relational/metadata fields
    expect(snapshot).not.toHaveProperty('treeId');
    expect(snapshot).not.toHaveProperty('children');
  });

  test('returns empty childrenIds when children is undefined', () => {
    const record = {
      id: 'fam-2',
      husbandId: null,
      wifeId: null,
      marriageContractDate: null,
      marriageContractHijriDate: null,
      marriageContractPlace: null,
      marriageContractPlaceId: null,
      marriageContractDescription: null,
      marriageContractNotes: null,
      marriageDate: null,
      marriageHijriDate: null,
      marriagePlace: null,
      marriagePlaceId: null,
      marriageDescription: null,
      marriageNotes: null,
      isUmmWalad: false,
      isDivorced: false,
      divorceDate: null,
      divorceHijriDate: null,
      divorcePlace: null,
      divorcePlaceId: null,
      divorceDescription: null,
      divorceNotes: null,
    };

    const snapshot = snapshotFamily(record);
    expect(snapshot.childrenIds).toEqual([]);
  });
});

describe('snapshotRadaFamily', () => {
  let snapshotRadaFamily: typeof import('@/lib/tree/audit').snapshotRadaFamily;

  beforeAll(async () => {
    const mod = await import('@/lib/tree/audit');
    snapshotRadaFamily = mod.snapshotRadaFamily;
  });

  test('extracts rada family fields with childrenIds', () => {
    const record = {
      id: 'rada-1',
      treeId: 'tree-1',
      fosterFatherId: 'ind-1',
      fosterMotherId: 'ind-2',
      notes: 'رضاعة',
      children: [
        { individualId: 'ind-3', radaFamilyId: 'rada-1' },
      ],
    };

    const snapshot = snapshotRadaFamily(record);
    expect(snapshot.id).toBe('rada-1');
    expect(snapshot.fosterFatherId).toBe('ind-1');
    expect(snapshot.fosterMotherId).toBe('ind-2');
    expect(snapshot.childrenIds).toEqual(['ind-3']);
    expect(snapshot.notes).toBe('رضاعة');
    expect(snapshot).not.toHaveProperty('treeId');
  });

  test('returns empty childrenIds when children is undefined', () => {
    const record = {
      id: 'rada-2',
      fosterFatherId: null,
      fosterMotherId: null,
      notes: null,
    };

    const snapshot = snapshotRadaFamily(record);
    expect(snapshot.childrenIds).toEqual([]);
  });
});

describe('snapshotBranchPointer', () => {
  let snapshotBranchPointer: typeof import('@/lib/tree/audit').snapshotBranchPointer;

  beforeAll(async () => {
    const mod = await import('@/lib/tree/audit');
    snapshotBranchPointer = mod.snapshotBranchPointer;
  });

  test('extracts branch pointer fields', () => {
    const record = {
      id: 'ptr-1',
      sourceWorkspaceId: 'ws-1',
      rootIndividualId: 'ind-1',
      selectedIndividualId: 'ind-2',
      targetWorkspaceId: 'ws-2',
      anchorIndividualId: 'ind-3',
      relationship: 'child',
      status: 'active',
      linkChildrenToAnchor: true,
      shareTokenId: 'token-1',
      createdById: 'user-1',
      createdAt: new Date(),
    };

    const snapshot = snapshotBranchPointer(record);
    expect(snapshot.id).toBe('ptr-1');
    expect(snapshot.sourceWorkspaceId).toBe('ws-1');
    expect(snapshot.relationship).toBe('child');
    expect(snapshot.status).toBe('active');
    expect(snapshot.linkChildrenToAnchor).toBe(true);
    expect(snapshot.shareTokenId).toBe('token-1');

    // Should NOT include metadata fields
    expect(snapshot).not.toHaveProperty('createdById');
    expect(snapshot).not.toHaveProperty('createdAt');
  });
});

// ============================================================================
// buildAuditDescription — Arabic description builder
// ============================================================================

describe('buildAuditDescription', () => {
  let buildAuditDescription: typeof import('@/lib/tree/audit').buildAuditDescription;

  beforeAll(async () => {
    const mod = await import('@/lib/tree/audit');
    buildAuditDescription = mod.buildAuditDescription;
  });

  test('create individual with name returns Arabic description with name', () => {
    const desc = buildAuditDescription('create', 'individual', 'محمد');
    expect(desc).toContain('محمد');
    expect(desc.length).toBeGreaterThan(0);
  });

  test('update individual returns Arabic description', () => {
    const desc = buildAuditDescription('update', 'individual', 'أحمد');
    expect(desc).toContain('أحمد');
    expect(desc.length).toBeGreaterThan(0);
  });

  test('delete individual returns Arabic description', () => {
    const desc = buildAuditDescription('delete', 'individual');
    expect(desc.length).toBeGreaterThan(0);
  });

  test('cascade_delete returns Arabic description', () => {
    const desc = buildAuditDescription('cascade_delete', 'individual', 'محمد');
    expect(desc).toContain('محمد');
    expect(desc.length).toBeGreaterThan(0);
  });

  test('create family returns Arabic description', () => {
    const desc = buildAuditDescription('create', 'family');
    expect(desc.length).toBeGreaterThan(0);
  });

  test('import tree returns Arabic description', () => {
    const desc = buildAuditDescription('import', 'tree');
    expect(desc.length).toBeGreaterThan(0);
  });

  test('redeem_pointer returns Arabic description', () => {
    const desc = buildAuditDescription('redeem_pointer', 'branch_pointer');
    expect(desc.length).toBeGreaterThan(0);
  });

  test('disconnect returns Arabic description', () => {
    const desc = buildAuditDescription('disconnect', 'branch_pointer');
    expect(desc.length).toBeGreaterThan(0);
  });

  test('deep_copy returns Arabic description', () => {
    const desc = buildAuditDescription('deep_copy', 'branch_pointer');
    expect(desc.length).toBeGreaterThan(0);
  });

  test('token_revoked returns Arabic description', () => {
    const desc = buildAuditDescription('token_revoked', 'share_token');
    expect(desc.length).toBeGreaterThan(0);
  });

  test('MOVE_SUBTREE returns Arabic description', () => {
    const desc = buildAuditDescription('MOVE_SUBTREE', 'family_child');
    expect(desc.length).toBeGreaterThan(0);
  });

  test('without entity name omits name from description', () => {
    const desc = buildAuditDescription('create', 'individual');
    // Should not contain quotes (used to wrap names)
    expect(desc).not.toContain('"');
  });

  test('with entity name includes quoted name in description', () => {
    const desc = buildAuditDescription('create', 'individual', 'محمد');
    expect(desc).toContain('"محمد"');
  });
});

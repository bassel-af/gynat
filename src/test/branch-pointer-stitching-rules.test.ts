import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { GedcomData, Individual, Family } from '@/lib/gedcom/types';

// ===========================================================================
// Part 1: Pure function tests (no mocks needed)
// ===========================================================================

const EMPTY_EVENT = { date: '', hijriDate: '', place: '', description: '', notes: '' };

function makeIndividual(overrides: Partial<Individual> & { id: string }): Individual {
  return {
    type: 'INDI',
    name: overrides.givenName ?? overrides.id,
    givenName: overrides.givenName ?? overrides.id,
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
    familyAsChild: null,
    ...overrides,
  };
}

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

// ---------------------------------------------------------------------------
// detectOrphanedChildren
// ---------------------------------------------------------------------------

describe('detectOrphanedChildren', () => {
  test('returns hasOrphans: true when children lack a parent of the given sex', async () => {
    const { detectOrphanedChildren } = await import('@/lib/tree/branch-pointer-merge');

    // Subtree: selectedPerson (male) married to wife, with 2 children.
    // The family has no husband (father) — children are orphaned w.r.t. 'M'.
    const subtree: GedcomData = {
      individuals: {
        selected: makeIndividual({ id: 'selected', sex: 'M', familiesAsSpouse: ['fam1'] }),
        wife: makeIndividual({ id: 'wife', sex: 'F', familiesAsSpouse: ['fam1'] }),
        child1: makeIndividual({ id: 'child1', givenName: 'أحمد', familyAsChild: 'fam1' }),
        child2: makeIndividual({ id: 'child2', givenName: 'فاطمة', familyAsChild: 'fam1' }),
      },
      families: {
        fam1: makeFamily({
          id: 'fam1',
          husband: 'selected',
          wife: 'wife',
          children: ['child1', 'child2'],
        }),
      },
    };

    // anchorSex is 'M' — check if children lack a father-figure
    // The family already has 'selected' as husband, but anchorSex represents the
    // anchor's sex in the TARGET tree. We check: does the family lack a parent of anchorSex?
    // Since anchor is male and family has selected (husband), children have a father.
    // But the scenario is: the children's family in the subtree has NO parent of anchorSex
    // besides the selectedPerson themselves.
    //
    // Actually, the function checks: for families where selectedPerson is a spouse,
    // do the children have a parent of anchorSex OTHER than through the selectedPerson?
    // The use case: anchor is female, selected is male. Children's family has husband=selected, wife=wife.
    // Do children lack a mother (anchorSex='F')? wife exists, so no orphans.
    //
    // Let's create a proper scenario: selected is male, family has only husband (no wife).
    // Anchor is female. Children lack a mother.
    const subtreeNoWife: GedcomData = {
      individuals: {
        selected: makeIndividual({ id: 'selected', sex: 'M', familiesAsSpouse: ['fam1'] }),
        child1: makeIndividual({ id: 'child1', givenName: 'أحمد', familyAsChild: 'fam1' }),
        child2: makeIndividual({ id: 'child2', givenName: 'فاطمة', familyAsChild: 'fam1' }),
      },
      families: {
        fam1: makeFamily({
          id: 'fam1',
          husband: 'selected',
          wife: null,
          children: ['child1', 'child2'],
        }),
      },
    };

    const result = detectOrphanedChildren(subtreeNoWife, 'selected', 'F');
    expect(result.hasOrphans).toBe(true);
    expect(result.childNames).toContain('أحمد');
    expect(result.childNames).toContain('فاطمة');
  });

  test('returns hasOrphans: false when children have both parents', async () => {
    const { detectOrphanedChildren } = await import('@/lib/tree/branch-pointer-merge');

    const subtree: GedcomData = {
      individuals: {
        selected: makeIndividual({ id: 'selected', sex: 'M', familiesAsSpouse: ['fam1'] }),
        wife: makeIndividual({ id: 'wife', sex: 'F', familiesAsSpouse: ['fam1'] }),
        child1: makeIndividual({ id: 'child1', givenName: 'أحمد', familyAsChild: 'fam1' }),
      },
      families: {
        fam1: makeFamily({
          id: 'fam1',
          husband: 'selected',
          wife: 'wife',
          children: ['child1'],
        }),
      },
    };

    // Anchor is female — children already have a wife (mother), so no orphans
    const result = detectOrphanedChildren(subtree, 'selected', 'F');
    expect(result.hasOrphans).toBe(false);
    expect(result.childNames).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// stitchAsSpouse with linkChildrenToAnchor
// ---------------------------------------------------------------------------

describe('mergePointedSubtree — spouse with linkChildrenToAnchor', () => {
  test('linkChildrenToAnchor: true adds orphaned children to synthetic family', async () => {
    const { mergePointedSubtree } = await import('@/lib/tree/branch-pointer-merge');

    // Target tree: anchor is a female with no family yet
    const target: GedcomData = {
      individuals: {
        anchor: makeIndividual({ id: 'anchor', sex: 'F', givenName: 'سارة' }),
      },
      families: {},
    };

    // Pointed subtree: selected person (male) with children who lack a mother
    const pointed: GedcomData = {
      individuals: {
        selected: makeIndividual({ id: 'selected', sex: 'M', familiesAsSpouse: ['src-fam'] }),
        child1: makeIndividual({ id: 'child1', givenName: 'أحمد', familyAsChild: 'src-fam' }),
        child2: makeIndividual({ id: 'child2', givenName: 'خالد', familyAsChild: 'src-fam' }),
      },
      families: {
        'src-fam': makeFamily({
          id: 'src-fam',
          husband: 'selected',
          wife: null,
          children: ['child1', 'child2'],
        }),
      },
    };

    const result = mergePointedSubtree(target, pointed, {
      pointerId: 'bp-spouse',
      anchorIndividualId: 'anchor',
      selectedIndividualId: 'selected',
      relationship: 'spouse',
      sourceWorkspaceId: 'ws-source',
      linkChildrenToAnchor: true,
    });

    const syntheticFamId = 'ptr-bp-spouse-fam';
    const syntheticFam = result.families[syntheticFamId];
    expect(syntheticFam).toBeDefined();
    // Anchor (female) should be wife, selected (male) should be husband
    expect(syntheticFam.husband).toBe('selected');
    expect(syntheticFam.wife).toBe('anchor');
    // Orphaned children should be added to the synthetic family
    expect(syntheticFam.children).toContain('child1');
    expect(syntheticFam.children).toContain('child2');
  });

  test('linkChildrenToAnchor: false — synthetic family has no children', async () => {
    const { mergePointedSubtree } = await import('@/lib/tree/branch-pointer-merge');

    const target: GedcomData = {
      individuals: {
        anchor: makeIndividual({ id: 'anchor', sex: 'F', givenName: 'سارة' }),
      },
      families: {},
    };

    const pointed: GedcomData = {
      individuals: {
        selected: makeIndividual({ id: 'selected', sex: 'M', familiesAsSpouse: ['src-fam'] }),
        child1: makeIndividual({ id: 'child1', givenName: 'أحمد', familyAsChild: 'src-fam' }),
      },
      families: {
        'src-fam': makeFamily({
          id: 'src-fam',
          husband: 'selected',
          wife: null,
          children: ['child1'],
        }),
      },
    };

    const result = mergePointedSubtree(target, pointed, {
      pointerId: 'bp-spouse',
      anchorIndividualId: 'anchor',
      selectedIndividualId: 'selected',
      relationship: 'spouse',
      sourceWorkspaceId: 'ws-source',
      linkChildrenToAnchor: false,
    });

    const syntheticFamId = 'ptr-bp-spouse-fam';
    const syntheticFam = result.families[syntheticFamId];
    expect(syntheticFam).toBeDefined();
    expect(syntheticFam.children).toEqual([]);
  });
});

// ===========================================================================
// Part 2: API route tests (mocked DB)
// ===========================================================================

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}));

const mockMembershipFindUnique = vi.fn();
const mockShareTokenFindFirst = vi.fn();
const mockShareTokenUpdate = vi.fn();
const mockBranchPointerCreate = vi.fn();
const mockBranchPointerCount = vi.fn();
const mockBranchPointerFindFirst = vi.fn();
const mockIndividualFindFirst = vi.fn();
const mockFamilyTreeFindUnique = vi.fn();
const mockFamilyFindMany = vi.fn();
const mockFamilyChildFindFirst = vi.fn();
const mockTransaction = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: {
      findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
    },
    branchShareToken: {
      findFirst: (...args: unknown[]) => mockShareTokenFindFirst(...args),
      update: (...args: unknown[]) => mockShareTokenUpdate(...args),
    },
    branchPointer: {
      create: (...args: unknown[]) => mockBranchPointerCreate(...args),
      count: (...args: unknown[]) => mockBranchPointerCount(...args),
      findFirst: (...args: unknown[]) => mockBranchPointerFindFirst(...args),
    },
    individual: {
      findFirst: (...args: unknown[]) => mockIndividualFindFirst(...args),
    },
    familyTree: {
      findUnique: (...args: unknown[]) => mockFamilyTreeFindUnique(...args),
    },
    family: {
      findMany: (...args: unknown[]) => mockFamilyFindMany(...args),
    },
    familyChild: {
      findFirst: (...args: unknown[]) => mockFamilyChildFindFirst(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock('@/lib/tree/branch-share-token', () => ({
  hashToken: (token: string) => `hashed_${token}`,
  TOKEN_PREFIX: 'brsh_',
}));

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const wsId = 'ws-target-uuid';
const fakeUser = {
  id: 'user-uuid-editor',
  email: 'editor@example.com',
  user_metadata: { display_name: 'Editor' },
};

const anchorId = '123e4567-e89b-12d3-a456-426614174000';
const routeParams = { params: Promise.resolve({ id: wsId }) };

function makePostRequest(url: string, body: object) {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      authorization: 'Bearer valid-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function mockAuth() {
  mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
}

function mockEditor() {
  mockMembershipFindUnique.mockResolvedValue({
    userId: fakeUser.id,
    workspaceId: wsId,
    role: 'workspace_admin',
    permissions: ['tree_editor'],
  });
}

function mockValidToken() {
  mockShareTokenFindFirst.mockResolvedValue({
    id: 'token-uuid-1',
    tokenHash: 'hashed_brsh_valid-token',
    sourceWorkspaceId: 'ws-source-uuid',
    rootIndividualId: 'src-root-uuid',
    depthLimit: null,
    includeGrafts: false,
    targetWorkspaceId: wsId,
    isPublic: false,
    maxUses: 1,
    useCount: 0,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 86400000),
  });
}

function mockAnchorExists() {
  mockIndividualFindFirst.mockResolvedValue({ id: anchorId, sex: 'M' });
}

function mockPointerCountOk() {
  mockBranchPointerCount.mockResolvedValue(0);
}

function mockNoExistingPointerOnAnchor() {
  mockBranchPointerFindFirst.mockResolvedValue(null);
}

function mockTransactionPassthrough() {
  // Transaction mock: execute the callback with the same prisma mock
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    // For simplicity, we pass the same mock prisma through
    // The callback should use tx.branchShareToken.update and tx.branchPointer.create
    const txProxy = {
      branchShareToken: {
        update: (...args: unknown[]) => mockShareTokenUpdate(...args),
        findUnique: vi.fn().mockResolvedValue({ isRevoked: false }),
      },
      branchPointer: {
        create: (...args: unknown[]) => mockBranchPointerCreate(...args),
        findFirst: (...args: unknown[]) => mockBranchPointerFindFirst(...args),
      },
    };
    return fn(txProxy);
  });
}

function setupValidRedemption(overrides?: { relationship?: string; selectedPersonId?: string }) {
  mockAuth();
  mockEditor();
  mockValidToken();
  mockPointerCountOk();
  mockAnchorExists();
  mockNoExistingPointerOnAnchor();
  mockFamilyChildFindFirst.mockResolvedValue(null); // no parents by default
  mockTransactionPassthrough();
  mockShareTokenUpdate.mockResolvedValue({});
  mockBranchPointerCreate.mockResolvedValue({
    id: 'bp-uuid-1',
    sourceWorkspaceId: 'ws-source-uuid',
    rootIndividualId: 'src-root-uuid',
    targetWorkspaceId: wsId,
    anchorIndividualId: anchorId,
    relationship: overrides?.relationship ?? 'child',
    selectedIndividualId: overrides?.selectedPersonId ?? 'src-root-uuid',
    status: 'active',
  });
}

const baseUrl = `http://localhost:3000/api/workspaces/${wsId}/branch-pointers`;

// ---------------------------------------------------------------------------
// Rule 4: One pointer per anchor
// ---------------------------------------------------------------------------

describe('Rule 4 — one pointer per anchor', () => {
  beforeEach(() => vi.clearAllMocks());

  test('rejects when anchor already has an active pointer in this workspace', async () => {
    setupValidRedemption();
    // Override: anchor already has an active pointer
    mockBranchPointerFindFirst.mockResolvedValue({
      id: 'existing-bp',
      anchorIndividualId: anchorId,
      status: 'active',
    });

    const { POST } = await import('@/app/api/workspaces/[id]/branch-pointers/route');
    const req = makePostRequest(baseUrl, {
      token: 'brsh_valid-token',
      anchorIndividualId: anchorId,
      selectedPersonId: 'src-root-uuid',
      relationship: 'child',
    });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('يوجد ربط فرع مسبق لهذا الشخص. لا يمكن إضافة أكثر من ربط واحد حالياً.');
  });

  test('allows when anchor has no active pointer', async () => {
    setupValidRedemption();

    const { POST } = await import('@/app/api/workspaces/[id]/branch-pointers/route');
    const req = makePostRequest(baseUrl, {
      token: 'brsh_valid-token',
      anchorIndividualId: anchorId,
      selectedPersonId: 'src-root-uuid',
      relationship: 'child',
    });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// Rule 1: Child/sibling — selected must not have parents in subtree
// ---------------------------------------------------------------------------

describe('Rule 1 — child/sibling: selected must not have parents in subtree', () => {
  beforeEach(() => vi.clearAllMocks());

  test('rejects child when selected person has parents in source tree', async () => {
    setupValidRedemption({ selectedPersonId: 'child-with-parents' });
    // Selected person HAS a familyChild record in the source workspace
    mockFamilyChildFindFirst.mockResolvedValue({ individualId: 'child-with-parents', familyId: 'some-fam' });

    const { POST } = await import('@/app/api/workspaces/[id]/branch-pointers/route');
    const req = makePostRequest(baseUrl, {
      token: 'brsh_valid-token',
      anchorIndividualId: anchorId,
      selectedPersonId: 'child-with-parents',
      relationship: 'child',
    });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('لا يمكن الربط كابن أو أخ: الشخص المختار لديه والدان في الفرع المشارَك.');
  });

  test('rejects sibling when selected person has parents in source tree', async () => {
    setupValidRedemption({ selectedPersonId: 'child-with-parents' });
    mockFamilyChildFindFirst.mockResolvedValue({ individualId: 'child-with-parents', familyId: 'some-fam' });

    const { POST } = await import('@/app/api/workspaces/[id]/branch-pointers/route');
    const req = makePostRequest(baseUrl, {
      token: 'brsh_valid-token',
      anchorIndividualId: anchorId,
      selectedPersonId: 'child-with-parents',
      relationship: 'sibling',
    });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('لا يمكن الربط كابن أو أخ: الشخص المختار لديه والدان في الفرع المشارَك.');
  });

  test('allows child when selected person has no parents in source tree', async () => {
    setupValidRedemption({ selectedPersonId: 'person-no-parents' });
    // No familyChild record — person has no parents
    mockFamilyChildFindFirst.mockResolvedValue(null);

    const { POST } = await import('@/app/api/workspaces/[id]/branch-pointers/route');
    const req = makePostRequest(baseUrl, {
      token: 'brsh_valid-token',
      anchorIndividualId: anchorId,
      selectedPersonId: 'person-no-parents',
      relationship: 'child',
    });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(201);
  });

  test('allows sibling when selected person has no parents (e.g. married-in spouse)', async () => {
    setupValidRedemption({ selectedPersonId: 'spouse-no-parents', relationship: 'sibling' });
    mockFamilyChildFindFirst.mockResolvedValue(null);

    const { POST } = await import('@/app/api/workspaces/[id]/branch-pointers/route');
    const req = makePostRequest(baseUrl, {
      token: 'brsh_valid-token',
      anchorIndividualId: anchorId,
      selectedPersonId: 'spouse-no-parents',
      relationship: 'sibling',
    });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// Rule 2: Parent — no duplicate gender
// ---------------------------------------------------------------------------

describe('Rule 2 — parent: no duplicate gender', () => {
  beforeEach(() => vi.clearAllMocks());

  test('rejects parent when anchor already has a father and selected is male', async () => {
    setupValidRedemption({ selectedPersonId: 'selected-male', relationship: 'parent' });
    // Selected person is male
    mockIndividualFindFirst.mockImplementation(async (args: { where: { id: string } }) => {
      if (args.where.id === anchorId) return { id: anchorId, sex: 'M' };
      if (args.where.id === 'selected-male') return { id: 'selected-male', sex: 'M' };
      return null;
    });
    // Anchor's family as child already has a husband (father)
    mockFamilyFindMany.mockResolvedValue([
      { id: 'fam-parent', husbandId: 'existing-father', wifeId: null },
    ]);

    const { POST } = await import('@/app/api/workspaces/[id]/branch-pointers/route');
    const req = makePostRequest(baseUrl, {
      token: 'brsh_valid-token',
      anchorIndividualId: anchorId,
      selectedPersonId: 'selected-male',
      relationship: 'parent',
    });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('لا يمكن إضافة أب — يوجد بالفعل أب لهذا الشخص في الشجرة.');
  });

  test('rejects parent when anchor already has a mother and selected is female', async () => {
    setupValidRedemption({ selectedPersonId: 'selected-female', relationship: 'parent' });
    mockIndividualFindFirst.mockImplementation(async (args: { where: { id: string } }) => {
      if (args.where.id === anchorId) return { id: anchorId, sex: 'M' };
      if (args.where.id === 'selected-female') return { id: 'selected-female', sex: 'F' };
      return null;
    });
    mockFamilyFindMany.mockResolvedValue([
      { id: 'fam-parent', husbandId: null, wifeId: 'existing-mother' },
    ]);

    const { POST } = await import('@/app/api/workspaces/[id]/branch-pointers/route');
    const req = makePostRequest(baseUrl, {
      token: 'brsh_valid-token',
      anchorIndividualId: anchorId,
      selectedPersonId: 'selected-female',
      relationship: 'parent',
    });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('لا يمكن إضافة أم — يوجد بالفعل أم لهذا الشخص في الشجرة.');
  });

  test('allows parent when opposite-gender parent slot is open', async () => {
    setupValidRedemption({ selectedPersonId: 'selected-female', relationship: 'parent' });
    mockIndividualFindFirst.mockImplementation(async (args: { where: { id: string } }) => {
      if (args.where.id === anchorId) return { id: anchorId, sex: 'M' };
      if (args.where.id === 'selected-female') return { id: 'selected-female', sex: 'F' };
      return null;
    });
    // Anchor's family has a husband (father) but no wife (mother) — female parent is allowed
    mockFamilyFindMany.mockResolvedValue([
      { id: 'fam-parent', husbandId: 'existing-father', wifeId: null },
    ]);

    const { POST } = await import('@/app/api/workspaces/[id]/branch-pointers/route');
    const req = makePostRequest(baseUrl, {
      token: 'brsh_valid-token',
      anchorIndividualId: anchorId,
      selectedPersonId: 'selected-female',
      relationship: 'parent',
    });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(201);
  });

  test('rejects parent when selected person has no sex', async () => {
    setupValidRedemption({ selectedPersonId: 'selected-unknown', relationship: 'parent' });
    mockIndividualFindFirst.mockImplementation(async (args: { where: { id: string } }) => {
      if (args.where.id === anchorId) return { id: anchorId, sex: 'M' };
      if (args.where.id === 'selected-unknown') return { id: 'selected-unknown', sex: null };
      return null;
    });

    const { POST } = await import('@/app/api/workspaces/[id]/branch-pointers/route');
    const req = makePostRequest(baseUrl, {
      token: 'brsh_valid-token',
      anchorIndividualId: anchorId,
      selectedPersonId: 'selected-unknown',
      relationship: 'parent',
    });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('يجب تحديد جنس الشخص المختار أولاً.');
  });
});

// ---------------------------------------------------------------------------
// _pointerId propagation in mergePointedSubtree
// ---------------------------------------------------------------------------

describe('mergePointedSubtree — _pointerId propagation', () => {
  test('sets _pointerId on all pointed individuals', async () => {
    const { mergePointedSubtree } = await import('@/lib/tree/branch-pointer-merge');

    const target: GedcomData = {
      individuals: {
        anchor: makeIndividual({ id: 'anchor', sex: 'M', givenName: 'سعد' }),
      },
      families: {},
    };

    const pointed: GedcomData = {
      individuals: {
        selected: makeIndividual({ id: 'selected', sex: 'M', familiesAsSpouse: ['pfam1'] }),
        grandchild: makeIndividual({ id: 'grandchild', familyAsChild: 'pfam1' }),
      },
      families: {
        pfam1: makeFamily({ id: 'pfam1', husband: 'selected', children: ['grandchild'] }),
      },
    };

    const result = mergePointedSubtree(target, pointed, {
      pointerId: 'bp-123',
      anchorIndividualId: 'anchor',
      selectedIndividualId: 'selected',
      relationship: 'child',
      sourceWorkspaceId: 'ws-src',
    });

    // All pointed individuals should have _pointerId
    expect(result.individuals['selected']._pointerId).toBe('bp-123');
    expect(result.individuals['grandchild']._pointerId).toBe('bp-123');
    // Anchor should NOT have _pointerId
    expect(result.individuals['anchor']._pointerId).toBeUndefined();
  });

  test('sets _pointerId on all pointed families', async () => {
    const { mergePointedSubtree } = await import('@/lib/tree/branch-pointer-merge');

    const target: GedcomData = {
      individuals: {
        anchor: makeIndividual({ id: 'anchor', sex: 'M' }),
      },
      families: {},
    };

    const pointed: GedcomData = {
      individuals: {
        selected: makeIndividual({ id: 'selected', sex: 'M', familiesAsSpouse: ['pfam1'] }),
        child: makeIndividual({ id: 'child', familyAsChild: 'pfam1' }),
      },
      families: {
        pfam1: makeFamily({ id: 'pfam1', husband: 'selected', children: ['child'] }),
      },
    };

    const result = mergePointedSubtree(target, pointed, {
      pointerId: 'bp-456',
      anchorIndividualId: 'anchor',
      selectedIndividualId: 'selected',
      relationship: 'child',
      sourceWorkspaceId: 'ws-src',
    });

    // Pointed family should have _pointerId
    expect(result.families['pfam1']._pointerId).toBe('bp-456');
  });

  test('sets _pointerId on synthetic stitching family', async () => {
    const { mergePointedSubtree } = await import('@/lib/tree/branch-pointer-merge');

    const target: GedcomData = {
      individuals: {
        anchor: makeIndividual({ id: 'anchor', sex: 'M' }),
      },
      families: {},
    };

    const pointed: GedcomData = {
      individuals: {
        selected: makeIndividual({ id: 'selected', sex: 'M' }),
      },
      families: {},
    };

    const result = mergePointedSubtree(target, pointed, {
      pointerId: 'bp-789',
      anchorIndividualId: 'anchor',
      selectedIndividualId: 'selected',
      relationship: 'child',
      sourceWorkspaceId: 'ws-src',
    });

    const syntheticFam = result.families['ptr-bp-789-fam'];
    expect(syntheticFam).toBeDefined();
    expect(syntheticFam._pointerId).toBe('bp-789');
  });

  test('sets _pointerId on synthetic family for sibling stitch (no existing parent)', async () => {
    const { mergePointedSubtree } = await import('@/lib/tree/branch-pointer-merge');

    const target: GedcomData = {
      individuals: {
        anchor: makeIndividual({ id: 'anchor', sex: 'M' }),
      },
      families: {},
    };

    const pointed: GedcomData = {
      individuals: {
        selected: makeIndividual({ id: 'selected', sex: 'M' }),
      },
      families: {},
    };

    const result = mergePointedSubtree(target, pointed, {
      pointerId: 'bp-sib',
      anchorIndividualId: 'anchor',
      selectedIndividualId: 'selected',
      relationship: 'sibling',
      sourceWorkspaceId: 'ws-src',
    });

    const syntheticFam = result.families['ptr-bp-sib-fam'];
    expect(syntheticFam).toBeDefined();
    expect(syntheticFam._pointerId).toBe('bp-sib');
  });

  test('sets _pointerId on synthetic family for spouse stitch', async () => {
    const { mergePointedSubtree } = await import('@/lib/tree/branch-pointer-merge');

    const target: GedcomData = {
      individuals: {
        anchor: makeIndividual({ id: 'anchor', sex: 'F' }),
      },
      families: {},
    };

    const pointed: GedcomData = {
      individuals: {
        selected: makeIndividual({ id: 'selected', sex: 'M' }),
      },
      families: {},
    };

    const result = mergePointedSubtree(target, pointed, {
      pointerId: 'bp-sp',
      anchorIndividualId: 'anchor',
      selectedIndividualId: 'selected',
      relationship: 'spouse',
      sourceWorkspaceId: 'ws-src',
    });

    const syntheticFam = result.families['ptr-bp-sp-fam'];
    expect(syntheticFam).toBeDefined();
    expect(syntheticFam._pointerId).toBe('bp-sp');
  });

  test('sets _pointerId on synthetic family for parent stitch', async () => {
    const { mergePointedSubtree } = await import('@/lib/tree/branch-pointer-merge');

    const target: GedcomData = {
      individuals: {
        anchor: makeIndividual({ id: 'anchor', sex: 'M' }),
      },
      families: {},
    };

    const pointed: GedcomData = {
      individuals: {
        selected: makeIndividual({ id: 'selected', sex: 'M' }),
      },
      families: {},
    };

    const result = mergePointedSubtree(target, pointed, {
      pointerId: 'bp-par',
      anchorIndividualId: 'anchor',
      selectedIndividualId: 'selected',
      relationship: 'parent',
      sourceWorkspaceId: 'ws-src',
    });

    const syntheticFam = result.families['ptr-bp-par-fam'];
    expect(syntheticFam).toBeDefined();
    expect(syntheticFam._pointerId).toBe('bp-par');
  });
});

// ---------------------------------------------------------------------------
// Security hardening: generic Zod error
// ---------------------------------------------------------------------------

describe('Security hardening', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns generic error for Zod validation failures', async () => {
    mockAuth();
    mockEditor();

    const { POST } = await import('@/app/api/workspaces/[id]/branch-pointers/route');
    const req = makePostRequest(baseUrl, {
      token: 'brsh_valid-token',
      anchorIndividualId: 'not-a-uuid', // invalid UUID
      selectedPersonId: 'src-root-uuid',
      relationship: 'child',
    });
    const res = await POST(req, routeParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    // parseValidatedBody returns the first Zod issue rather than a generic message
    expect(body.error).toBe('Invalid UUID');
  });
});

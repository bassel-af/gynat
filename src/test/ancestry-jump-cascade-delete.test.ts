/**
 * «قفزة نسب» — cascade delete (spec §9.3) and the two side effects that hang
 * off it.
 *
 * THE RULE THIS FILE LOCKS: `computeDeleteImpact` is jump-BLIND, deliberately.
 * A jump ancestor is a CLAIM about descent, not a dependent of the descendant —
 * traversing it would sweep an entire apex lineage (إسماعيل and everyone below
 * him) into a delete of one man. The natural instinct of a future reader is
 * "jumps are ancestry, add them to the BFS"; these tests are the tripwire.
 *
 * Also covered:
 *  - the version hash is `lastModifiedAt`-derived and every jump mutation
 *    touches that timestamp, so creating a jump DOES invalidate a delete-impact
 *    preview the client is holding;
 *  - deleting the last ancestor INDIVIDUAL prunes the now-pointless jump row
 *    (`Family.husbandId`/`wifeId` are SetNull FKs, so the empty couple survives).
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { GedcomData, Individual, Family, AncestryJump } from '@/lib/gedcom/types';

// ---------------------------------------------------------------------------
// Mocks — declared before any import that uses them
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

const mockMembershipFindUnique = vi.fn();
const mockFamilyTreeFindFirst = vi.fn();
const mockFamilyTreeCreate = vi.fn();
const mockFamilyTreeUpdate = vi.fn();
const mockIndividualFindFirst = vi.fn();
const mockIndividualDeleteMany = vi.fn();
const mockFamilyUpdateMany = vi.fn();
const mockFamilyDeleteMany = vi.fn();
const mockJumpCreate = vi.fn();
const mockJumpDeleteMany = vi.fn();
const mockTreeEditLogCreate = vi.fn();
const mockBranchPointerCount = vi.fn();
const mockTransaction = vi.fn();
const noop = vi.fn(() => Promise.resolve({ count: 0 }));

vi.mock('@/lib/db', () => ({
  prisma: {
    // The jump POST is gated by the workspace «قفزة نسب» toggle — ON here.
    workspace: { findUnique: vi.fn().mockResolvedValue({ enableAncestryJumps: true }) },
    workspaceMembership: { findUnique: (...a: unknown[]) => mockMembershipFindUnique(...a) },
    familyTree: {
      findFirst: (...a: unknown[]) => mockFamilyTreeFindFirst(...a),
      findUnique: (...a: unknown[]) => mockFamilyTreeFindFirst(...a),
      create: (...a: unknown[]) => mockFamilyTreeCreate(...a),
      update: (...a: unknown[]) => mockFamilyTreeUpdate(...a),
    },
    individual: { findFirst: (...a: unknown[]) => mockIndividualFindFirst(...a) },
    ancestryJump: {
      create: (...a: unknown[]) => mockJumpCreate(...a),
      deleteMany: (...a: unknown[]) => mockJumpDeleteMany(...a),
    },
    treeEditLog: { create: (...a: unknown[]) => mockTreeEditLogCreate(...a) },
    branchPointer: { count: (...a: unknown[]) => mockBranchPointerCount(...a) },
    $transaction: (...a: unknown[]) => mockTransaction(...a),
  },
}));

vi.mock('@/lib/tree/branch-pointer-queries', () => ({
  isPointedIndividualInWorkspace: vi.fn().mockResolvedValue(false),
  getActivePointersForWorkspace: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/tree/encryption', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tree/encryption')>(
    '@/lib/tree/encryption',
  );
  return {
    ...actual,
    getWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 7)),
    getOrCreateWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 7)),
  };
});

const mockDbTreeToGedcomData = vi.fn();
vi.mock('@/lib/tree/mapper', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tree/mapper')>('@/lib/tree/mapper');
  return { ...actual, dbTreeToGedcomData: (...a: unknown[]) => mockDbTreeToGedcomData(...a) };
});

import { NextRequest } from 'next/server';
import { computeDeleteImpact, computeVersionHash } from '@/lib/tree/cascade-delete';
import { pruneEmptyAncestryJumps } from '@/lib/tree/queries';

// ---------------------------------------------------------------------------
// Fixture builders
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
    generationsMin: null,
    generationsMax: null,
    notes: '',
    ...overrides,
  };
}

/**
 * Two independent lineages joined ONLY by a jump:
 *   إسماعيل × هاجر → قيدار (recorded son)
 *   عدنان (no parents) × مهدد → معد, and عدنان ⇢ the إسماعيل couple.
 * `withJump: false` returns the identical tree with the jump row and both
 * back-references removed.
 */
function twoLineages(withJump = true): GedcomData {
  const individuals: Record<string, Individual> = {
    ish: ind({ id: 'ish', name: 'إسماعيل', familiesAsSpouse: ['f-ish'] }),
    hagar: ind({ id: 'hagar', name: 'هاجر', sex: 'F', familiesAsSpouse: ['f-ish'] }),
    qidar: ind({ id: 'qidar', name: 'قيدار', familyAsChild: 'f-ish' }),
    adnan: ind({ id: 'adnan', name: 'عدنان', familiesAsSpouse: ['f-adnan'] }),
    mahdad: ind({ id: 'mahdad', name: 'مهدد', sex: 'F', familiesAsSpouse: ['f-adnan'] }),
    maadd: ind({ id: 'maadd', name: 'معد', familyAsChild: 'f-adnan' }),
  };
  const families: Record<string, Family> = {
    'f-ish': fam({ id: 'f-ish', husband: 'ish', wife: 'hagar', children: ['qidar'] }),
    'f-adnan': fam({ id: 'f-adnan', husband: 'adnan', wife: 'mahdad', children: ['maadd'] }),
  };
  if (!withJump) return { individuals, families };

  individuals.adnan.ancestryJumpAsDescendant = 'j1';
  families['f-ish'].ancestryJumpsAsAncestor = ['j1'];
  return { individuals, families, ancestryJumps: { j1: jump({ id: 'j1' }) } };
}

const sorted = (s: Set<string>) => [...s].sort();

// The jump POST validates against UUID-shaped ids (Zod `.uuid()`), so the
// version-hash test needs its own uuid-keyed tree.
const DESC_UUID = '11111111-1111-4111-8111-111111111111';
const FAM_UUID = '22222222-2222-4222-8222-222222222222';
const ANC_UUID = '33333333-3333-4333-8333-333333333333';

/** A parentless descendant and a one-spouse ancestor family, both uuid-keyed. */
function uuidTree(): GedcomData {
  return {
    individuals: {
      [DESC_UUID]: ind({ id: DESC_UUID, name: 'عدنان' }),
      [ANC_UUID]: ind({ id: ANC_UUID, name: 'إسماعيل', familiesAsSpouse: [FAM_UUID] }),
    },
    families: { [FAM_UUID]: fam({ id: FAM_UUID, husband: ANC_UUID }) },
  };
}

// ===========================================================================
// computeDeleteImpact is jump-blind — the regression lock
// ===========================================================================

describe('computeDeleteImpact — a «قفزة نسب» is a claim, not a dependency', () => {
  test('deleting the jump descendant never sweeps the ancestor lineage', () => {
    const impact = computeDeleteImpact(twoLineages(), 'adnan');
    expect(sorted(impact.affectedIds)).not.toContain('ish');
    expect(sorted(impact.affectedIds)).not.toContain('hagar');
    expect(sorted(impact.affectedIds)).not.toContain('qidar');
  });

  test('deleting the jump descendant still sweeps his OWN dependants', () => {
    // معد hangs off عدنان alone here (no married-in spouse to re-root the
    // household), so the ordinary cascade must still reach him — the jump has
    // not turned عدنان into a protected node.
    const data = twoLineages();
    delete data.individuals.mahdad;
    data.families['f-adnan'].wife = null;
    expect(sorted(computeDeleteImpact(data, 'adnan').affectedIds)).toEqual(['maadd']);
  });

  test('deleting the jump ancestor never sweeps the descendant lineage', () => {
    const impact = computeDeleteImpact(twoLineages(), 'ish');
    for (const id of ['adnan', 'mahdad', 'maadd']) {
      expect(impact.affectedIds.has(id)).toBe(false);
    }
  });

  test('the impact is IDENTICAL with and without the jump row present', () => {
    // The literal proof that the BFS never reads `ancestryJumps`.
    for (const target of ['adnan', 'ish', 'qidar', 'maadd']) {
      const withJump = computeDeleteImpact(twoLineages(true), target);
      const without = computeDeleteImpact(twoLineages(false), target);
      expect(sorted(withJump.affectedIds)).toEqual(sorted(without.affectedIds));
      expect(withJump.hasImpact).toBe(without.hasImpact);
    }
  });

  test('a jump descendant is still treated as a root candidate', () => {
    // عدنان has no familyAsChild, so deleting an unrelated person must not
    // strand his line behind the jump.
    const impact = computeDeleteImpact(twoLineages(), 'qidar');
    expect(impact.hasImpact).toBe(false);
  });
});

// ===========================================================================
// Version hash
// ===========================================================================

describe('computeVersionHash — jumps ride on lastModifiedAt', () => {
  test('a different tree timestamp yields a different version hash', () => {
    const before = computeVersionHash(new Date('2026-09-22T10:00:00.000Z'));
    const after = computeVersionHash(new Date('2026-09-22T10:00:01.000Z'));
    expect(before).not.toBe(after);
  });

  test('the same timestamp yields the same version hash', () => {
    const at = new Date('2026-09-22T10:00:00.000Z');
    expect(computeVersionHash(at)).toBe(computeVersionHash(new Date(at)));
  });
});

// ===========================================================================
// pruneEmptyAncestryJumps
// ===========================================================================

describe('pruneEmptyAncestryJumps', () => {
  test('deletes only the jumps whose ancestor couple lost BOTH spouses', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const removed = await pruneEmptyAncestryJumps('tree-1', { ancestryJump: { deleteMany } });

    expect(removed).toBe(2);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { treeId: 'tree-1', ancestorFamily: { husbandId: null, wifeId: null } },
    });
  });

  test('returns 0 when nothing was orphaned', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    expect(await pruneEmptyAncestryJumps('tree-1', { ancestryJump: { deleteMany } })).toBe(0);
  });
});

// ===========================================================================
// Routes
// ===========================================================================

const WS = 'ws-jump-cascade';
const TREE = 'tree-jump-cascade';
const LAST_MODIFIED = new Date('2026-09-22T10:00:00.000Z');
const fakeUser = { id: 'user-1', email: 'editor@example.com', user_metadata: {} };

function mockEditor() {
  mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
  mockMembershipFindUnique.mockResolvedValue({
    userId: fakeUser.id,
    workspaceId: WS,
    role: 'workspace_admin',
    permissions: ['tree_editor'],
  });
}

function mockTree(lastModifiedAt = LAST_MODIFIED) {
  const tree = {
    id: TREE,
    workspaceId: WS,
    lastModifiedAt,
    individuals: [],
    families: [],
    radaFamilies: [],
    ancestryJumps: [],
  };
  mockFamilyTreeFindFirst.mockResolvedValue(tree);
  mockFamilyTreeCreate.mockResolvedValue(tree);
}

function request(url: string, options: { method?: string; body?: unknown } = {}) {
  const { method = 'GET', body } = options;
  return new NextRequest(url, {
    method,
    headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const impactUrl = `http://localhost:4000/api/workspaces/${WS}/tree/individuals/adnan/delete-impact`;
const indParams = { params: Promise.resolve({ id: WS, individualId: 'adnan' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockEditor();
  mockTree();
  mockDbTreeToGedcomData.mockReturnValue(twoLineages());
  mockIndividualFindFirst.mockResolvedValue({ id: 'adnan', treeId: TREE, givenName: 'عدنان' });
  mockBranchPointerCount.mockResolvedValue(0);
  mockJumpCreate.mockResolvedValue({
    id: 'j-new',
    treeId: TREE,
    descendantId: 'adnan',
    ancestorFamilyId: 'f-ish',
    generationsMin: null,
    generationsMax: null,
    notes: null,
  });
  mockJumpDeleteMany.mockResolvedValue({ count: 0 });
  mockTreeEditLogCreate.mockResolvedValue({});
  mockFamilyTreeUpdate.mockResolvedValue({});
  mockIndividualDeleteMany.mockResolvedValue({ count: 1 });
  mockFamilyUpdateMany.mockResolvedValue({ count: 0 });
  mockFamilyDeleteMany.mockResolvedValue({ count: 0 });
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      branchPointer: { updateMany: noop },
      branchShareToken: { updateMany: noop },
      radaFamily: { updateMany: noop },
      userTreeLink: { deleteMany: noop },
      workspaceInvitation: { updateMany: noop },
      family: { updateMany: mockFamilyUpdateMany, deleteMany: mockFamilyDeleteMany },
      familyChild: { deleteMany: noop, create: noop },
      individual: { deleteMany: mockIndividualDeleteMany, delete: noop },
      ancestryJump: { deleteMany: (...a: unknown[]) => mockJumpDeleteMany(...a) },
      treeEditLog: { create: mockTreeEditLogCreate, createMany: noop },
      familyTree: { update: mockFamilyTreeUpdate },
    }),
  );
});

describe('GET /delete-impact — the version hash a jump invalidates', () => {
  test('returns the hash derived from the tree timestamp', async () => {
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/delete-impact/route'
    );
    const res = await GET(request(impactUrl), indParams);
    const body = await res.json();
    expect(body.data.versionHash).toBe(computeVersionHash(LAST_MODIFIED));
  });

  test('creating a «قفزة نسب» changes the hash a held preview was built on', async () => {
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/delete-impact/route'
    );
    const before = await (await GET(request(impactUrl), indParams)).json();

    // The jump POST touches the tree timestamp...
    const { POST } = await import('@/app/api/workspaces/[id]/tree/ancestry-jumps/route');
    mockDbTreeToGedcomData.mockReturnValue(uuidTree());
    const created = await POST(
      request(`http://localhost:4000/api/workspaces/${WS}/tree/ancestry-jumps`, {
        method: 'POST',
        body: { descendantId: DESC_UUID, ancestorFamilyId: FAM_UUID },
      }),
      { params: Promise.resolve({ id: WS }) },
    );
    expect(created.status).toBe(201);
    expect(mockFamilyTreeUpdate).toHaveBeenCalled();

    // ...so the next preview carries a different hash.
    mockTree(new Date('2026-09-22T10:05:00.000Z'));
    mockDbTreeToGedcomData.mockReturnValue(twoLineages());
    const after = await (await GET(request(impactUrl), indParams)).json();
    expect(after.data.versionHash).not.toBe(before.data.versionHash);
  });
});

describe('DELETE individual — the jump row, and only the jump row', () => {
  test('prunes jumps whose ancestor couple was emptied, inside the transaction', async () => {
    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    mockDbTreeToGedcomData.mockReturnValue(twoLineages(false));
    mockIndividualFindFirst.mockResolvedValue({ id: 'qidar', treeId: TREE, givenName: 'قيدار' });

    const res = await DELETE(
      request(`http://localhost:4000/api/workspaces/${WS}/tree/individuals/qidar`, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: WS, individualId: 'qidar' }) },
    );

    expect(res.status).toBe(204);
    expect(mockJumpDeleteMany).toHaveBeenCalledWith({
      where: { treeId: TREE, ancestorFamily: { husbandId: null, wifeId: null } },
    });
  });

  test('deleting the jump descendant deletes no one from the ancestor lineage', async () => {
    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const res = await DELETE(
      request(`http://localhost:4000/api/workspaces/${WS}/tree/individuals/adnan`, {
        method: 'DELETE',
        body: { versionHash: computeVersionHash(LAST_MODIFIED) },
      }),
      indParams,
    );

    expect(res.status).toBe(204);
    const deletedIds = mockIndividualDeleteMany.mock.calls[0][0].where.id.in as string[];
    expect(deletedIds).toContain('adnan');
    for (const id of ['ish', 'hagar', 'qidar']) {
      expect(deletedIds).not.toContain(id);
    }
  });
});

/**
 * «قفزة نسب» — server backstop: a person who carries a jump can gain recorded
 * parents ONLY through the move-to-new-father route. Every other path that
 * would give him a father or mother answers 409 `{ code: 'child_has_jump' }`
 * and writes nothing:
 *
 *   - POST /tree/families with the person in `childrenIds`;
 *   - POST /tree/families/[familyId]/children;
 *   - POST /tree/families/[familyId]/children/[individualId]/move;
 *   - POST /branch-pointers as `parent`, or as `sibling` when the anchor has no
 *     parent family (the stitch then mints a synthetic parent family for him).
 *
 * The same routes behave exactly as before for a person without a jump.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

vi.mock('@/lib/api/rate-limit', () => ({
  treeMutateLimiter: { check: () => ({ allowed: true, retryAfterSeconds: 0 }) },
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));

const m = {
  membership: vi.fn(),
  treeFind: vi.fn(),
  treeUpdate: vi.fn(),
  individualFindFirst: vi.fn(),
  familyFindFirst: vi.fn(),
  familyFindMany: vi.fn(),
  familyCreate: vi.fn(),
  familyChildCreate: vi.fn(),
  familyChildDelete: vi.fn(),
  familyChildFindUnique: vi.fn(),
  familyChildFindFirst: vi.fn(),
  jumpFindMany: vi.fn(),
  editLog: vi.fn(),
  pointerFindFirst: vi.fn(),
  pointerCount: vi.fn(),
  pointerCreate: vi.fn(),
  tokenFindFirst: vi.fn(),
  tokenFindUnique: vi.fn(),
  tokenUpdate: vi.fn(),
};

const mockPrisma = {
  workspaceMembership: { findUnique: (...a: unknown[]) => m.membership(...a) },
  workspace: { findUnique: vi.fn().mockResolvedValue({}) },
  familyTree: {
    findFirst: (...a: unknown[]) => m.treeFind(...a),
    findUnique: (...a: unknown[]) => m.treeFind(...a),
    update: (...a: unknown[]) => m.treeUpdate(...a),
  },
  individual: { findFirst: (...a: unknown[]) => m.individualFindFirst(...a) },
  family: {
    findFirst: (...a: unknown[]) => m.familyFindFirst(...a),
    findMany: (...a: unknown[]) => m.familyFindMany(...a),
    create: (...a: unknown[]) => m.familyCreate(...a),
  },
  familyChild: {
    create: (...a: unknown[]) => m.familyChildCreate(...a),
    delete: (...a: unknown[]) => m.familyChildDelete(...a),
    findUnique: (...a: unknown[]) => m.familyChildFindUnique(...a),
    findFirst: (...a: unknown[]) => m.familyChildFindFirst(...a),
  },
  ancestryJump: { findMany: (...a: unknown[]) => m.jumpFindMany(...a) },
  treeEditLog: { create: (...a: unknown[]) => m.editLog(...a) },
  branchPointer: {
    findFirst: (...a: unknown[]) => m.pointerFindFirst(...a),
    count: (...a: unknown[]) => m.pointerCount(...a),
    create: (...a: unknown[]) => m.pointerCreate(...a),
  },
  branchShareToken: {
    findFirst: (...a: unknown[]) => m.tokenFindFirst(...a),
    findUnique: (...a: unknown[]) => m.tokenFindUnique(...a),
    update: (...a: unknown[]) => m.tokenUpdate(...a),
  },
  $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma),
};

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));

vi.mock('@/lib/tree/encryption', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tree/encryption')>('@/lib/tree/encryption');
  return {
    ...actual,
    getWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 7)),
    getOrCreateWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 7)),
  };
});

vi.mock('@/lib/tree/branch-share-token', () => ({
  hashToken: (t: string) => `hashed_${t}`,
  TOKEN_PREFIX: 'brsh_',
}));

import { NextRequest } from 'next/server';
import { JUMP_BLOCKS_PARENTS_MESSAGE } from '@/lib/tree/ancestry-jump-validators';

const WS = 'ws-backstop';
const TREE = 'bbbbbbbb-1111-4111-9111-111111111111';
const P = 'a0000000-0000-4000-a000-000000000001';
const FATHER = 'a0000000-0000-4000-a000-000000000002';
const FAM = 'c0000000-0000-4000-a000-000000000003';
const FAM2 = 'c0000000-0000-4000-a000-000000000004';

function req(url: string, body: unknown) {
  return new NextRequest(`http://localhost:4000${url}`, {
    method: 'POST',
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * P carries a jump when `hasJump`. The in-transaction guards read
 * `ancestryJump.findMany`; the families / children POST routes read the
 * resolved tree's own `ancestryJumps` rows.
 */
function jumpOnP(hasJump: boolean) {
  m.treeFind.mockResolvedValue({
    id: TREE, workspaceId: WS, individuals: [], families: [],
    ancestryJumps: hasJump ? [{ id: 'j1', treeId: TREE, descendantId: P }] : [],
  });
  m.jumpFindMany.mockImplementation((args: { where: { descendantId: { in: string[] } } }) =>
    Promise.resolve(
      hasJump && args.where.descendantId.in.includes(P) ? [{ descendantId: P }] : [],
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'e@x', user_metadata: {} } }, error: null });
  m.membership.mockResolvedValue({ userId: 'u1', workspaceId: WS, role: 'workspace_admin', permissions: [] });
  m.treeFind.mockResolvedValue({ id: TREE, workspaceId: WS, individuals: [], families: [], ancestryJumps: [] });
  m.treeUpdate.mockResolvedValue({});
  m.individualFindFirst.mockImplementation((args: { where: { id: string } }) =>
    // The shared-branch person is a woman so a `spouse` link to P passes the gender rule.
    Promise.resolve({ id: args.where.id, treeId: TREE, sex: args.where.id === 'src-person' ? 'F' : 'M' }),
  );
  m.familyFindFirst.mockImplementation((args: { where: { id?: string } }) =>
    Promise.resolve(args.where.id ? { id: args.where.id, treeId: TREE, husbandId: FATHER, wifeId: null, children: [] } : null),
  );
  m.familyFindMany.mockResolvedValue([]);
  m.familyCreate.mockResolvedValue({ id: FAM, husbandId: FATHER, wifeId: null, children: [{ individualId: P }] });
  m.familyChildCreate.mockResolvedValue({ familyId: FAM, individualId: P });
  m.familyChildDelete.mockResolvedValue({});
  m.familyChildFindUnique.mockResolvedValue(null);
  m.familyChildFindFirst.mockResolvedValue(null);
  m.editLog.mockResolvedValue({});
  m.pointerFindFirst.mockResolvedValue(null);
  m.pointerCount.mockResolvedValue(0);
  m.pointerCreate.mockResolvedValue({ id: 'bp-1', status: 'active' });
  m.tokenFindFirst.mockResolvedValue({
    id: 'tok-1', sourceWorkspaceId: 'ws-src', rootIndividualId: 'src-root', depthLimit: null,
    includeGrafts: false, targetWorkspaceId: WS, isPublic: false, maxUses: 5, useCount: 0,
    isRevoked: false, expiresAt: new Date(Date.now() + 86_400_000),
  });
  m.tokenFindUnique.mockResolvedValue({ id: 'tok-1', isRevoked: false });
  m.tokenUpdate.mockResolvedValue({});
});

async function expectChildHasJump(res: Response) {
  expect(res.status).toBe(409);
  const body = await res.json();
  expect(body.code).toBe('child_has_jump');
  expect(body.error).toBe(JUMP_BLOCKS_PARENTS_MESSAGE);
}

// ---------------------------------------------------------------------------

describe('POST /tree/families — childrenIds', () => {
  const call = async () => {
    const { POST } = await import('@/app/api/workspaces/[id]/tree/families/route');
    return POST(req(`/api/workspaces/${WS}/tree/families`, { husbandId: FATHER, childrenIds: [P] }), {
      params: Promise.resolve({ id: WS }),
    });
  };

  test('409 child_has_jump when a listed child carries a jump — nothing written', async () => {
    jumpOnP(true);
    await expectChildHasJump(await call());
    expect(m.familyCreate).not.toHaveBeenCalled();
    expect(m.editLog).not.toHaveBeenCalled();
  });

  test('creates the family as before when no child carries a jump', async () => {
    jumpOnP(false);
    const res = await call();
    expect(res.status).toBe(201);
    expect(m.familyCreate).toHaveBeenCalledTimes(1);
  });

  test('checks the resolved tree’s own jumps — no extra query', async () => {
    jumpOnP(true);
    await expectChildHasJump(await call());
    expect(m.jumpFindMany).not.toHaveBeenCalled();
  });
});

describe('POST /tree/families/[familyId]/children', () => {
  const call = async () => {
    const { POST } = await import('@/app/api/workspaces/[id]/tree/families/[familyId]/children/route');
    return POST(req(`/api/workspaces/${WS}/tree/families/${FAM}/children`, { individualId: P }), {
      params: Promise.resolve({ id: WS, familyId: FAM }),
    });
  };

  test('409 child_has_jump — the child row is never written', async () => {
    jumpOnP(true);
    await expectChildHasJump(await call());
    expect(m.familyChildCreate).not.toHaveBeenCalled();
    expect(m.editLog).not.toHaveBeenCalled();
  });

  test('adds the child as before without a jump', async () => {
    jumpOnP(false);
    const res = await call();
    expect(res.status).toBe(201);
    expect(m.familyChildCreate).toHaveBeenCalledTimes(1);
  });
});

describe('POST /tree/families/[familyId]/children/[individualId]/move', () => {
  const call = async () => {
    const { POST } = await import(
      '@/app/api/workspaces/[id]/tree/families/[familyId]/children/[individualId]/move/route'
    );
    return POST(
      req(`/api/workspaces/${WS}/tree/families/${FAM}/children/${P}/move`, { targetFamilyId: FAM2 }),
      { params: Promise.resolve({ id: WS, familyId: FAM, individualId: P }) },
    );
  };

  beforeEach(() => {
    m.familyChildFindUnique.mockImplementation((args: { where: { familyId_individualId: { familyId: string } } }) =>
      Promise.resolve(args.where.familyId_individualId.familyId === FAM ? { familyId: FAM, individualId: P } : null),
    );
  });

  test('409 child_has_jump — nothing is moved', async () => {
    jumpOnP(true);
    await expectChildHasJump(await call());
    expect(m.familyChildDelete).not.toHaveBeenCalled();
    expect(m.familyChildCreate).not.toHaveBeenCalled();
  });

  test('moves as before without a jump', async () => {
    jumpOnP(false);
    const res = await call();
    expect(res.status).toBe(200);
    expect(m.familyChildCreate).toHaveBeenCalledTimes(1);
  });
});

describe('POST /branch-pointers', () => {
  const call = async (relationship: string) => {
    const { POST } = await import('@/app/api/workspaces/[id]/branch-pointers/route');
    return POST(
      req(`/api/workspaces/${WS}/branch-pointers`, {
        token: 'brsh_x', anchorIndividualId: P, selectedPersonId: 'src-person', relationship,
      }),
      { params: Promise.resolve({ id: WS }) },
    );
  };

  test('parent: 409 child_has_jump — no pointer is created', async () => {
    jumpOnP(true);
    await expectChildHasJump(await call('parent'));
    expect(m.pointerCreate).not.toHaveBeenCalled();
    expect(m.tokenUpdate).not.toHaveBeenCalled();
  });

  test('sibling with an anchor who has no parent family: 409 (the stitch would mint parents)', async () => {
    jumpOnP(true);
    m.familyChildFindFirst.mockResolvedValue(null);
    await expectChildHasJump(await call('sibling'));
    expect(m.pointerCreate).not.toHaveBeenCalled();
  });

  test('parent without a jump links as before', async () => {
    jumpOnP(false);
    const res = await call('parent');
    expect(res.status).toBe(201);
    expect(m.pointerCreate).toHaveBeenCalledTimes(1);
  });

  test('spouse and child are unaffected by a jump', async () => {
    jumpOnP(true);
    expect((await call('spouse')).status).toBe(201);
    expect((await call('child')).status).toBe(201);
  });
});

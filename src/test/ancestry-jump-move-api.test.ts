/**
 * «قفزة نسب» — the two move routes.
 *
 *   POST /tree/ancestry-jumps/[jumpId]/move-to-new-father
 *     Creates F, the couple {husband F, children [P]} and re-points the jump to
 *     F with the range shrunk by one — in ONE transaction. The jump row is
 *     updated IN PLACE (same id, notes, creator). Not gated by the workspace
 *     «قفزة نسب» toggle: it only moves an existing jump.
 *
 *   POST /tree/ancestry-jumps/[jumpId]/move-back
 *     The undo. Puts the jump back on P with the pre-move range, then deletes
 *     the couple and F — in that order (deleting F first would cascade the
 *     jump away).
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { AncestryJump, Family, GedcomData, Individual } from '@/lib/gedcom/types';

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

const mockRateCheck = vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 }));
vi.mock('@/lib/api/rate-limit', () => ({
  treeMutateLimiter: { check: (...a: unknown[]) => mockRateCheck(...(a as [])) },
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));

/** Every write goes through `calls`, so tests can assert order across models. */
const calls: string[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- call args are inspected loosely
const rec = <T,>(name: string, impl: (...a: any[]) => T) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.fn((...a: any[]) => {
    calls.push(name);
    return impl(...a);
  });

const m = {
  membership: vi.fn(),
  workspace: vi.fn(),
  treeFind: vi.fn(),
  treeUpdate: rec('familyTree.update', () => Promise.resolve({})),
  queryRaw: rec('$queryRaw', () => Promise.resolve([{ '?column?': 1 }])),
  familyChildFindFirst: vi.fn(),
  familyChildDeleteMany: rec('familyChild.deleteMany', () => Promise.resolve({ count: 1 })),
  individualCreate: rec('individual.create', () => Promise.resolve({ id: F_ID, treeId: TREE })),
  individualDeleteMany: rec('individual.deleteMany', () => Promise.resolve({ count: 1 })),
  individualFindFirst: vi.fn(),
  familyCreate: rec('family.create', () =>
    Promise.resolve({ id: FAM_NEW, treeId: TREE, husbandId: F_ID, wifeId: null, children: [{ familyId: FAM_NEW, individualId: P }] }),
  ),
  familyDeleteMany: rec('family.deleteMany', () => Promise.resolve({ count: 1 })),
  jumpUpdateMany: rec('ancestryJump.updateMany', () => Promise.resolve({ count: 1 })),
  editLog: rec('treeEditLog.create', () => Promise.resolve({})),
  pointerCount: vi.fn(),
};

const mockPrisma = {
  workspaceMembership: { findUnique: (...a: unknown[]) => m.membership(...a) },
  workspace: { findUnique: (...a: unknown[]) => m.workspace(...a) },
  familyTree: {
    findFirst: (...a: unknown[]) => m.treeFind(...a),
    findUnique: (...a: unknown[]) => m.treeFind(...a),
    update: (...a: unknown[]) => m.treeUpdate(...a),
  },
  $queryRaw: (...a: unknown[]) => m.queryRaw(...a),
  familyChild: {
    findFirst: (...a: unknown[]) => m.familyChildFindFirst(...a),
    deleteMany: (...a: unknown[]) => m.familyChildDeleteMany(...a),
  },
  individual: {
    create: (...a: unknown[]) => m.individualCreate(...a),
    deleteMany: (...a: unknown[]) => m.individualDeleteMany(...a),
    findFirst: (...a: unknown[]) => m.individualFindFirst(...a),
  },
  family: {
    create: (...a: unknown[]) => m.familyCreate(...a),
    deleteMany: (...a: unknown[]) => m.familyDeleteMany(...a),
  },
  ancestryJump: { updateMany: (...a: unknown[]) => m.jumpUpdateMany(...a) },
  treeEditLog: { create: (...a: unknown[]) => m.editLog(...a) },
  branchPointer: { count: (...a: unknown[]) => m.pointerCount(...a) },
  $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma),
};
vi.mock('@/lib/db', () => ({
  get prisma() {
    return mockPrisma;
  },
}));

vi.mock('@/lib/tree/encryption', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tree/encryption')>('@/lib/tree/encryption');
  return {
    ...actual,
    getWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 7)),
    getOrCreateWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 7)),
  };
});

const mockMapper = vi.fn();
vi.mock('@/lib/tree/mapper', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tree/mapper')>('@/lib/tree/mapper');
  return { ...actual, dbTreeToGedcomData: (...a: unknown[]) => mockMapper(...a) };
});

import { NextRequest } from 'next/server';
import { decryptSnapshot } from '@/lib/tree/encryption';

const WS = 'ws-move';
const TREE = 'bbbbbbbb-1111-4111-9111-111111111111';
const FOREIGN_TREE = 'aaaaaaaa-0000-4000-8000-000000000000';
const JUMP_ID = '88888888-7777-4777-b777-777777777777';
const P = 'cccccccc-2222-4222-a222-222222222222';
const ISH = 'eeeeeeee-4444-4444-8444-444444444444';
const FAM_ISH = 'dddddddd-3333-4333-b333-333333333333';
const F_ID = 'ffffffff-5555-4555-9555-555555555555';
const FAM_NEW = '99999999-6666-4666-a666-666666666666';
const KEY = Buffer.alloc(32, 7);

function ind(id: string, o: Partial<Individual> = {}): Individual {
  return {
    id, type: 'INDI', name: id, givenName: id, surname: '', sex: 'M',
    birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
    death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
    notes: '', isDeceased: false, isPrivate: false, familiesAsSpouse: [], kunya: '',
    familyAsChild: null, ...o,
  };
}
const EV = { date: '', hijriDate: '', place: '', description: '', notes: '' };
function fam(id: string, o: Partial<Family> = {}): Family {
  return { id, type: 'FAM', husband: null, wife: null, children: [], marriageContract: EV, marriage: EV, divorce: EV, isDivorced: false, ...o };
}
function jump(o: Partial<AncestryJump> = {}): AncestryJump {
  return { id: JUMP_ID, type: '_ANC_JUMP', descendant: P, ancestorFamily: FAM_ISH, generationsMin: 5, generationsMax: 40, notes: 'قيل أربعون', ...o };
}

function beforeMove(): GedcomData {
  return {
    individuals: { [P]: ind(P, { ancestryJumpAsDescendant: JUMP_ID }), [ISH]: ind(ISH, { familiesAsSpouse: [FAM_ISH] }) },
    families: { [FAM_ISH]: fam(FAM_ISH, { husband: ISH, ancestryJumpsAsAncestor: [JUMP_ID] }) },
    ancestryJumps: { [JUMP_ID]: jump() },
  };
}

function afterMove(): GedcomData {
  const d = beforeMove();
  d.individuals[P] = ind(P, { familyAsChild: FAM_NEW });
  d.individuals[F_ID] = ind(F_ID, { givenName: 'محمد', familiesAsSpouse: [FAM_NEW], ancestryJumpAsDescendant: JUMP_ID });
  d.families[FAM_NEW] = fam(FAM_NEW, { husband: F_ID, children: [P] });
  d.ancestryJumps = { [JUMP_ID]: jump({ descendant: F_ID, generationsMin: 4, generationsMax: 39 }) };
  return d;
}

function req(path: string, body: unknown, undo = false) {
  return new NextRequest(`http://localhost:4000/api/workspaces/${WS}/tree/ancestry-jumps/${JUMP_ID}/${path}`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer t',
      'content-type': 'application/json',
      ...(undo ? { 'X-Gynat-Undo': 'true' } : {}),
    },
    body: JSON.stringify(body),
  });
}
const params = (jumpId = JUMP_ID) => ({ params: Promise.resolve({ id: WS, jumpId }) });

const FATHER = { givenName: 'محمد', surname: 'سعيد', sex: 'M', kunya: 'أبو باسل' };

async function moveRoute() {
  return (await import('@/app/api/workspaces/[id]/tree/ancestry-jumps/[jumpId]/move-to-new-father/route')).POST;
}
async function backRoute() {
  return (await import('@/app/api/workspaces/[id]/tree/ancestry-jumps/[jumpId]/move-back/route')).POST;
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'e@x', user_metadata: {} } }, error: null });
  m.membership.mockResolvedValue({ userId: 'u1', workspaceId: WS, role: 'workspace_admin', permissions: [] });
  // «قفزة نسب» OFF on purpose — neither move route may be gated by it.
  m.workspace.mockResolvedValue({ enableAncestryJumps: false, enableKunya: true });
  m.treeFind.mockImplementation((args: { where: { id?: string } }) =>
    Promise.resolve(args.where.id === FOREIGN_TREE ? null : { id: TREE, workspaceId: WS, individuals: [], families: [], ancestryJumps: [] }),
  );
  m.familyChildFindFirst.mockResolvedValue(null);
  m.pointerCount.mockResolvedValue(0);
  // F's stored row (no encrypted fields set) — the move-back audit snapshot source.
  m.individualFindFirst.mockResolvedValue({ id: F_ID, treeId: TREE, sex: 'M', isDeceased: false, isPrivate: false });
  mockMapper.mockReturnValue(beforeMove());
});

// ===========================================================================
// move-to-new-father
// ===========================================================================

describe('POST move-to-new-father', () => {
  test('201 — creates F and his couple, re-points the jump to F with the range shifted', async () => {
    const POST = await moveRoute();
    const res = await POST(req('move-to-new-father', { father: FATHER }), params());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.individual.id).toBe(F_ID);
    expect(body.data.family.id).toBe(FAM_NEW);
    expect(body.data.jump).toEqual({
      id: JUMP_ID,
      treeId: TREE,
      descendantId: F_ID,
      ancestorFamilyId: FAM_ISH,
      generationsMin: 4,
      generationsMax: 39,
      notes: 'قيل أربعون',
    });
  });

  test('the couple is {husband F, children [P]}', async () => {
    const POST = await moveRoute();
    await POST(req('move-to-new-father', { father: FATHER }), params());
    const data = m.familyCreate.mock.calls[0][0].data;
    expect(data.husbandId).toBe(F_ID);
    expect(data.treeId).toBe(TREE);
    expect(data.children).toEqual({ create: [{ individualId: P }] });
  });

  test('the jump is updated IN PLACE — same id, scoped to the tree and to P', async () => {
    const POST = await moveRoute();
    await POST(req('move-to-new-father', { father: FATHER }), params());
    expect(m.jumpUpdateMany).toHaveBeenCalledWith({
      where: { id: JUMP_ID, treeId: TREE, descendantId: P },
      data: { descendantId: F_ID, generationsMin: 4, generationsMax: 39 },
    });
  });

  test('P’s row is locked before anything is written', async () => {
    const POST = await moveRoute();
    await POST(req('move-to-new-father', { father: FATHER }), params());
    expect(calls[0]).toBe('$queryRaw');
    const sql = (m.queryRaw.mock.calls[0][0] as TemplateStringsArray).join('?');
    expect(sql).toMatch(/FROM individuals WHERE id = .* FOR UPDATE/);
  });

  test('writes three audit rows — individual create, family create, jump update', async () => {
    const POST = await moveRoute();
    await POST(req('move-to-new-father', { father: FATHER }), params());
    const rows = m.editLog.mock.calls.map((c) => (c[0] as { data: { action: string; entityType: string } }).data);
    expect(rows.map((r) => [r.action, r.entityType])).toEqual([
      ['create', 'individual'],
      ['create', 'family'],
      ['update', 'ancestry_jump'],
    ]);
    const jumpRow = m.editLog.mock.calls[2][0].data;
    expect(decryptSnapshot(jumpRow.snapshotBefore, KEY)).toMatchObject({ descendantId: P, generationsMin: 5 });
    expect(decryptSnapshot(jumpRow.snapshotAfter, KEY)).toMatchObject({ descendantId: F_ID, generationsMin: 4 });
  });

  test('touches the tree timestamp', async () => {
    const POST = await moveRoute();
    await POST(req('move-to-new-father', { father: FATHER }), params());
    expect(m.treeUpdate).toHaveBeenCalled();
  });

  test('works with the workspace «قفزة نسب» toggle OFF', async () => {
    m.workspace.mockResolvedValue({ enableAncestryJumps: false, enableKunya: false });
    const POST = await moveRoute();
    const res = await POST(req('move-to-new-father', { father: FATHER }), params());
    expect(res.status).toBe(201);
  });

  test('strips the kunya when the workspace has it off', async () => {
    m.workspace.mockResolvedValue({ enableKunya: false });
    const POST = await moveRoute();
    await POST(req('move-to-new-father', { father: FATHER }), params());
    expect(m.individualCreate.mock.calls[0][0].data.kunya).toBeUndefined();
  });

  test('400 when the father is not male — nothing written', async () => {
    const POST = await moveRoute();
    const res = await POST(req('move-to-new-father', { father: { ...FATHER, sex: 'F' } }), params());
    expect(res.status).toBe(400);
    expect(m.individualCreate).not.toHaveBeenCalled();
  });

  test('404 for a malformed jump id, before any DB read', async () => {
    const POST = await moveRoute();
    const res = await POST(req('move-to-new-father', { father: FATHER }), params('not-a-uuid'));
    expect(res.status).toBe(404);
    expect(m.treeFind).not.toHaveBeenCalled();
  });

  test('404 for a foreign treeId', async () => {
    const POST = await moveRoute();
    const res = await POST(req('move-to-new-father', { treeId: FOREIGN_TREE, father: FATHER }), params());
    expect(res.status).toBe(404);
    expect(m.individualCreate).not.toHaveBeenCalled();
  });

  test('404 for a jump not in this tree', async () => {
    const d = beforeMove();
    d.ancestryJumps = {};
    mockMapper.mockReturnValue(d);
    const POST = await moveRoute();
    const res = await POST(req('move-to-new-father', { father: FATHER }), params());
    expect(res.status).toBe(404);
  });

  test('409 when P gained parents inside the lock — nothing written', async () => {
    m.familyChildFindFirst.mockResolvedValue({ familyId: 'x', individualId: P });
    const POST = await moveRoute();
    const res = await POST(req('move-to-new-father', { father: FATHER }), params());
    expect(res.status).toBe(409);
    expect(m.individualCreate).not.toHaveBeenCalled();
    expect(m.editLog).not.toHaveBeenCalled();
    expect(m.treeUpdate).not.toHaveBeenCalled();
  });

  test('409 when the jump moved away concurrently (updateMany hit 0 rows) — tx aborted', async () => {
    m.jumpUpdateMany.mockResolvedValueOnce({ count: 0 });
    const POST = await moveRoute();
    const res = await POST(req('move-to-new-father', { father: FATHER }), params());
    expect(res.status).toBe(409);
    expect(m.editLog).not.toHaveBeenCalled();
    expect(m.treeUpdate).not.toHaveBeenCalled();
  });

  test('a redo (undo-header request) still writes all three audit rows', async () => {
    const POST = await moveRoute();
    await POST(req('move-to-new-father', { father: FATHER }, true), params());
    expect(m.editLog).toHaveBeenCalledTimes(3);
  });
});

// ===========================================================================
// move-back
// ===========================================================================

const BACK_BODY = { fatherId: F_ID, familyId: FAM_NEW, childId: P, generationsMin: 5, generationsMax: 40 };

describe('POST move-back', () => {
  beforeEach(() => mockMapper.mockReturnValue(afterMove()));

  test('restores the jump on P with the pre-move range', async () => {
    const POST = await backRoute();
    const res = await POST(req('move-back', BACK_BODY, true), params());
    expect(res.status).toBe(200);
    expect(m.jumpUpdateMany).toHaveBeenCalledWith({
      where: { id: JUMP_ID, treeId: TREE, descendantId: F_ID },
      data: { descendantId: P, generationsMin: 5, generationsMax: 40 },
    });
  });

  test('deletes the couple and F', async () => {
    const POST = await backRoute();
    await POST(req('move-back', BACK_BODY, true), params());
    expect(m.familyDeleteMany.mock.calls[0][0].where).toMatchObject({ id: FAM_NEW, treeId: TREE });
    expect(m.individualDeleteMany.mock.calls[0][0].where).toMatchObject({ id: F_ID, treeId: TREE });
  });

  test('order: the jump moves BEFORE the couple and F are deleted', async () => {
    const POST = await backRoute();
    await POST(req('move-back', BACK_BODY, true), params());
    const jumpAt = calls.indexOf('ancestryJump.updateMany');
    expect(jumpAt).toBeGreaterThan(-1);
    expect(jumpAt).toBeLessThan(calls.indexOf('family.deleteMany'));
    expect(calls.indexOf('family.deleteMany')).toBeLessThan(calls.indexOf('individual.deleteMany'));
  });

  test('writes audit rows and touches the timestamp', async () => {
    const POST = await backRoute();
    await POST(req('move-back', BACK_BODY, true), params());
    const rows = m.editLog.mock.calls.map((c) => (c[0] as { data: { action: string; entityType: string } }).data);
    expect(rows.map((r) => [r.action, r.entityType])).toEqual([
      ['update', 'ancestry_jump'],
      ['delete', 'family'],
      ['delete', 'individual'],
    ]);
    expect(decryptSnapshot(m.editLog.mock.calls[2][0].data.snapshotBefore, KEY)).toMatchObject({ id: F_ID, sex: 'M' });
    expect(m.treeUpdate).toHaveBeenCalled();
  });

  test('409 with the plain message when F gained a wife — nothing written', async () => {
    const d = afterMove();
    d.families[FAM_NEW] = { ...d.families[FAM_NEW], wife: ISH };
    mockMapper.mockReturnValue(d);
    const POST = await backRoute();
    const res = await POST(req('move-back', BACK_BODY, true), params());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('تغيّرت الشجرة منذ هذا الإجراء، فلا يمكن التراجع عنه');
    expect(calls.filter((c) => c !== '$queryRaw')).toEqual([]);
  });

  test('409 when a live branch link is anchored on F', async () => {
    m.pointerCount.mockResolvedValue(1);
    const POST = await backRoute();
    const res = await POST(req('move-back', BACK_BODY, true), params());
    expect(res.status).toBe(409);
    expect(m.individualDeleteMany).not.toHaveBeenCalled();
  });

  test('409 when the jump left F concurrently — tx aborted before any delete', async () => {
    m.jumpUpdateMany.mockResolvedValueOnce({ count: 0 });
    const POST = await backRoute();
    const res = await POST(req('move-back', BACK_BODY, true), params());
    expect(res.status).toBe(409);
    expect(m.familyDeleteMany).not.toHaveBeenCalled();
    expect(m.individualDeleteMany).not.toHaveBeenCalled();
  });

  test('works with the workspace «قفزة نسب» toggle OFF', async () => {
    const POST = await backRoute();
    const res = await POST(req('move-back', BACK_BODY, true), params());
    expect(res.status).toBe(200);
  });

  test('404 for a foreign treeId', async () => {
    const POST = await backRoute();
    const res = await POST(req('move-back', { ...BACK_BODY, treeId: FOREIGN_TREE }, true), params());
    expect(res.status).toBe(404);
  });

  test('400 for an inverted range', async () => {
    const POST = await backRoute();
    const res = await POST(req('move-back', { ...BACK_BODY, generationsMin: 9, generationsMax: 2 }, true), params());
    expect(res.status).toBe(400);
  });
});

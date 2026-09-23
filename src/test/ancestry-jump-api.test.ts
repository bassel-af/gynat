/**
 * «قفزة نسب» — the three API routes (POST / PATCH / DELETE).
 *
 * Modelled on `cascade-delete-api.test.ts`: real route handlers, mocked
 * Supabase + Prisma + workspace key. The mapper is mocked so each test can
 * hand the validators an exact `GedcomData` shape.
 *
 * What is asserted is what can break: the guard order, tree scoping, the
 * validator wiring, the duplicate backstop, and the two write side effects
 * (one `TreeEditLog` row + `touchTreeTimestamp`).
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { GedcomData, Individual, Family } from '@/lib/gedcom/types';

// ---------------------------------------------------------------------------
// Mocks — declared before any import that uses them
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

const mockRateCheck = vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 }));
vi.mock('@/lib/api/rate-limit', () => ({
  treeMutateLimiter: { check: (...a: unknown[]) => mockRateCheck(...(a as [])) },
  rateLimitResponse: (retryAfterSeconds: number) =>
    new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { 'Retry-After': String(retryAfterSeconds) },
    }),
}));

const mockMembershipFindUnique = vi.fn();
const mockFamilyTreeFindFirst = vi.fn();
const mockFamilyTreeCreate = vi.fn();
const mockFamilyTreeUpdate = vi.fn();
const mockJumpCreate = vi.fn();
const mockJumpUpdate = vi.fn();
const mockJumpDelete = vi.fn();
const mockJumpFindFirst = vi.fn();
const mockTreeEditLogCreate = vi.fn();
const mockWorkspaceFindUnique = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspace: {
      findUnique: (...a: unknown[]) => mockWorkspaceFindUnique(...a),
    },
    workspaceMembership: {
      findUnique: (...a: unknown[]) => mockMembershipFindUnique(...a),
    },
    familyTree: {
      findFirst: (...a: unknown[]) => mockFamilyTreeFindFirst(...a),
      findUnique: (...a: unknown[]) => mockFamilyTreeFindFirst(...a),
      create: (...a: unknown[]) => mockFamilyTreeCreate(...a),
      update: (...a: unknown[]) => mockFamilyTreeUpdate(...a),
    },
    ancestryJump: {
      create: (...a: unknown[]) => mockJumpCreate(...a),
      update: (...a: unknown[]) => mockJumpUpdate(...a),
      delete: (...a: unknown[]) => mockJumpDelete(...a),
      findFirst: (...a: unknown[]) => mockJumpFindFirst(...a),
    },
    treeEditLog: {
      create: (...a: unknown[]) => mockTreeEditLogCreate(...a),
    },
  },
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
  return {
    ...actual,
    dbTreeToGedcomData: (...a: unknown[]) => mockDbTreeToGedcomData(...a),
  };
});

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WS = 'ws-jump-1';
// All ids must be syntactically valid v4 UUIDs — the Zod schema rejects
// anything else with a 400 before the route logic is ever reached.
/** A tree id that belongs to ANOTHER workspace — resolution must 404. */
const FOREIGN_TREE = 'aaaaaaaa-0000-4000-8000-000000000000';
const MAIN_TREE = 'bbbbbbbb-1111-4111-9111-111111111111';
/** A valid uuid that is absent from the mapped tree. */
const ABSENT_PERSON = '11111111-8888-4888-a888-888888888888';
const ADNAN = 'cccccccc-2222-4222-a222-222222222222';
const FAM_ISH = 'dddddddd-3333-4333-b333-333333333333';
const ISH = 'eeeeeeee-4444-4444-8444-444444444444';
const MAADD = 'ffffffff-5555-4555-9555-555555555555';
const FAM_ADN = '99999999-6666-4666-a666-666666666666';
const JUMP_ID = '88888888-7777-4777-b777-777777777777';
/** معد's own family, minted inside the cycle test. */
const FAM_MAADD = '77777777-9999-4999-8999-999999999999';

const fakeUser = { id: 'user-1', email: 'editor@example.com', user_metadata: {} };

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
    notes: '',
    isDeceased: false,
    isPrivate: false,
    familiesAsSpouse: [],
    kunya: '',
    familyAsChild: null,
    ...overrides,
  };
}

const EMPTY_EVENT = { date: '', hijriDate: '', place: '', description: '', notes: '' };

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

/** عدنان (parentless, has his own family + son معد) and the إسماعيل couple. */
function treeData(): GedcomData {
  return {
    individuals: {
      [ISH]: makeIndividual({ id: ISH, familiesAsSpouse: [FAM_ISH] }),
      [ADNAN]: makeIndividual({ id: ADNAN, familiesAsSpouse: [FAM_ADN] }),
      [MAADD]: makeIndividual({ id: MAADD, familyAsChild: FAM_ADN }),
    },
    families: {
      [FAM_ISH]: makeFamily({ id: FAM_ISH, husband: ISH }),
      [FAM_ADN]: makeFamily({ id: FAM_ADN, husband: ADNAN, children: [MAADD] }),
    },
  };
}

function makeRequest(options: { method?: string; body?: unknown } = {}) {
  const { method = 'POST', body } = options;
  return new NextRequest(`http://localhost:4000/api/workspaces/${WS}/tree/ancestry-jumps`, {
    method,
    headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const postParams = { params: Promise.resolve({ id: WS }) };
const itemParams = { params: Promise.resolve({ id: WS, jumpId: JUMP_ID }) };

function mockAuth() {
  mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
}

function mockTreeEditor() {
  mockMembershipFindUnique.mockResolvedValue({
    userId: fakeUser.id,
    workspaceId: WS,
    role: 'workspace_admin',
    permissions: ['tree_editor'],
  });
}

function mockViewer() {
  mockMembershipFindUnique.mockResolvedValue({
    userId: fakeUser.id,
    workspaceId: WS,
    role: 'workspace_member',
    permissions: [],
  });
}

function mockTreeResolves() {
  const tree = { id: MAIN_TREE, workspaceId: WS, individuals: [], families: [], ancestryJumps: [] };
  mockFamilyTreeFindFirst.mockResolvedValue(tree);
  mockFamilyTreeCreate.mockResolvedValue(tree);
}

function createdRow(overrides: Record<string, unknown> = {}) {
  return {
    id: JUMP_ID,
    treeId: MAIN_TREE,
    descendantId: ADNAN,
    ancestorFamilyId: FAM_ISH,
    generationsMin: null,
    generationsMax: null,
    // The DB column is Bytes — the route must NOT echo it.
    notes: Buffer.from('ciphertext-bytes'),
    ...overrides,
  };
}

async function postRoute() {
  return (await import('@/app/api/workspaces/[id]/tree/ancestry-jumps/route')).POST;
}
async function itemRoute() {
  return import('@/app/api/workspaces/[id]/tree/ancestry-jumps/[jumpId]/route');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRateCheck.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
  mockDbTreeToGedcomData.mockReturnValue(treeData());
  mockJumpCreate.mockResolvedValue(createdRow());
  mockJumpUpdate.mockResolvedValue(createdRow());
  mockJumpDelete.mockResolvedValue(createdRow());
  mockTreeEditLogCreate.mockResolvedValue({});
  mockFamilyTreeUpdate.mockResolvedValue({});
  // The create route is gated by the per-workspace «قفزة نسب» toggle; ON here
  // so every pre-existing POST test exercises the enabled path.
  mockWorkspaceFindUnique.mockResolvedValue({ enableAncestryJumps: true });
});

// ===========================================================================
// Workspace feature toggle — `enableAncestryJumps`
// ===========================================================================

describe('enableAncestryJumps OFF', () => {
  beforeEach(() => {
    mockAuth();
    mockTreeEditor();
    mockTreeResolves();
    mockWorkspaceFindUnique.mockResolvedValue({ enableAncestryJumps: false });
    mockJumpFindFirst.mockResolvedValue({
      id: JUMP_ID,
      treeId: MAIN_TREE,
      descendantId: ADNAN,
      ancestorFamilyId: FAM_ISH,
      generationsMin: null,
      generationsMax: null,
      notes: null,
    });
  });

  test('POST returns 400 with the Arabic feature-off message and writes nothing', async () => {
    const POST = await postRoute();
    const res = await POST(
      makeRequest({ body: { descendantId: ADNAN, ancestorFamilyId: FAM_ISH } }),
      postParams,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('ميزة قفزة النسب غير مفعّلة في هذه المساحة');
    expect(mockJumpCreate).not.toHaveBeenCalled();
    expect(mockTreeEditLogCreate).not.toHaveBeenCalled();
  });

  test('POST is gated for a missing workspace row too (treated as OFF)', async () => {
    mockWorkspaceFindUnique.mockResolvedValue(null);
    const POST = await postRoute();
    const res = await POST(
      makeRequest({ body: { descendantId: ADNAN, ancestorFamilyId: FAM_ISH } }),
      postParams,
    );
    expect(res.status).toBe(400);
    expect(mockJumpCreate).not.toHaveBeenCalled();
  });

  test('POST gate cannot be bypassed by the undo header', async () => {
    const POST = await postRoute();
    const req = makeRequest({ body: { descendantId: ADNAN, ancestorFamilyId: FAM_ISH } });
    req.headers.set('X-Gynat-Undo', 'true');
    const res = await POST(req, postParams);
    expect(res.status).toBe(400);
    expect(mockJumpCreate).not.toHaveBeenCalled();
  });

  test('PATCH still edits an existing jump', async () => {
    const { PATCH } = await itemRoute();
    const res = await PATCH(makeRequest({ method: 'PATCH', body: { generationsMin: 7 } }), itemParams);
    expect(res.status).toBe(200);
    expect(mockJumpUpdate).toHaveBeenCalled();
  });

  test('DELETE still removes an existing jump', async () => {
    const { DELETE } = await itemRoute();
    const res = await DELETE(makeRequest({ method: 'DELETE' }), itemParams);
    expect(res.status).toBe(204);
    expect(mockJumpDelete).toHaveBeenCalled();
  });
});

// ===========================================================================
// POST — auth / limiter gates
// ===========================================================================

describe('POST /ancestry-jumps — gates', () => {
  test('401 for an unauthenticated caller', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'no' } });
    const POST = await postRoute();
    const res = await POST(makeRequest({ body: { descendantId: ADNAN, ancestorFamilyId: FAM_ISH } }), postParams);
    expect(res.status).toBe(401);
  });

  test('403 for a member without tree_editor', async () => {
    mockAuth();
    mockViewer();
    const POST = await postRoute();
    const res = await POST(makeRequest({ body: { descendantId: ADNAN, ancestorFamilyId: FAM_ISH } }), postParams);
    expect(res.status).toBe(403);
  });

  test('429 when the mutation limiter is exhausted', async () => {
    mockAuth();
    mockTreeEditor();
    mockRateCheck.mockReturnValue({ allowed: false, retryAfterSeconds: 30 });
    const POST = await postRoute();
    const res = await POST(makeRequest({ body: { descendantId: ADNAN, ancestorFamilyId: FAM_ISH } }), postParams);
    expect(res.status).toBe(429);
  });

  test('the limiter is not consulted before the permission gate', async () => {
    mockAuth();
    mockViewer();
    const POST = await postRoute();
    await POST(makeRequest({ body: { descendantId: ADNAN, ancestorFamilyId: FAM_ISH } }), postParams);
    expect(mockRateCheck).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// POST — happy path
// ===========================================================================

describe('POST /ancestry-jumps — success', () => {
  beforeEach(() => {
    mockAuth();
    mockTreeEditor();
    mockTreeResolves();
  });

  test('201 with the created jump', async () => {
    const POST = await postRoute();
    const res = await POST(
      makeRequest({ body: { descendantId: ADNAN, ancestorFamilyId: FAM_ISH } }),
      postParams,
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.id).toBe(JUMP_ID);
    expect(json.data.descendantId).toBe(ADNAN);
    expect(json.data.ancestorFamilyId).toBe(FAM_ISH);
  });

  test('the response carries PLAINTEXT notes, never the Bytes column', async () => {
    const POST = await postRoute();
    const res = await POST(
      makeRequest({
        body: { descendantId: ADNAN, ancestorFamilyId: FAM_ISH, notes: 'عدنان من وَلَد إسماعيل' },
      }),
      postParams,
    );
    const json = await res.json();
    expect(json.data.notes).toBe('عدنان من وَلَد إسماعيل');
    // A Buffer would serialize as { type: 'Buffer', data: [...] }.
    expect(typeof json.data.notes).toBe('string');
  });

  test('notes are null in the response when none were sent', async () => {
    const POST = await postRoute();
    const res = await POST(
      makeRequest({ body: { descendantId: ADNAN, ancestorFamilyId: FAM_ISH } }),
      postParams,
    );
    expect((await res.json()).data.notes).toBeNull();
  });

  test('notes reach Prisma as ciphertext bytes, not plaintext', async () => {
    const POST = await postRoute();
    await POST(
      makeRequest({ body: { descendantId: ADNAN, ancestorFamilyId: FAM_ISH, notes: 'سرّي' } }),
      postParams,
    );
    const written = mockJumpCreate.mock.calls[0][0].data;
    expect(Buffer.isBuffer(written.notes)).toBe(true);
    expect(written.notes.toString()).not.toContain('سرّي');
  });

  test('persists the generation range', async () => {
    const POST = await postRoute();
    await POST(
      makeRequest({
        body: { descendantId: ADNAN, ancestorFamilyId: FAM_ISH, generationsMin: 4, generationsMax: 40 },
      }),
      postParams,
    );
    const written = mockJumpCreate.mock.calls[0][0].data;
    expect(written.generationsMin).toBe(4);
    expect(written.generationsMax).toBe(40);
  });

  test('scopes the new row to the resolved tree', async () => {
    const POST = await postRoute();
    await POST(makeRequest({ body: { descendantId: ADNAN, ancestorFamilyId: FAM_ISH } }), postParams);
    expect(mockJumpCreate.mock.calls[0][0].data.treeId).toBe(MAIN_TREE);
  });

  test('writes exactly one audit row, typed ancestry_jump', async () => {
    const POST = await postRoute();
    await POST(makeRequest({ body: { descendantId: ADNAN, ancestorFamilyId: FAM_ISH } }), postParams);
    expect(mockTreeEditLogCreate).toHaveBeenCalledTimes(1);
    const log = mockTreeEditLogCreate.mock.calls[0][0].data;
    expect(log.entityType).toBe('ancestry_jump');
    expect(log.action).toBe('create');
    expect(log.entityId).toBe(JUMP_ID);
    expect(log.treeId).toBe(MAIN_TREE);
  });

  test('touches the tree timestamp so ETags invalidate', async () => {
    const POST = await postRoute();
    await POST(makeRequest({ body: { descendantId: ADNAN, ancestorFamilyId: FAM_ISH } }), postParams);
    expect(mockFamilyTreeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: MAIN_TREE } }),
    );
  });

  test('the audit description is stored encrypted, not as plaintext Arabic', async () => {
    const POST = await postRoute();
    await POST(makeRequest({ body: { descendantId: ADNAN, ancestorFamilyId: FAM_ISH } }), postParams);
    const log = mockTreeEditLogCreate.mock.calls[0][0].data;
    expect(Buffer.isBuffer(log.description)).toBe(true);
  });
});

// ===========================================================================
// POST — validation
// ===========================================================================

describe('POST /ancestry-jumps — validation', () => {
  beforeEach(() => {
    mockAuth();
    mockTreeEditor();
    mockTreeResolves();
  });

  test('400 on a malformed body', async () => {
    const POST = await postRoute();
    const res = await POST(makeRequest({ body: { descendantId: 'not-a-uuid' } }), postParams);
    expect(res.status).toBe(400);
  });

  test('404 when the descendant is not in this tree', async () => {
    const POST = await postRoute();
    const res = await POST(
      makeRequest({ body: { descendantId: ABSENT_PERSON, ancestorFamilyId: FAM_ISH } }),
      postParams,
    );
    expect(res.status).toBe(404);
  });

  test('400 when the descendant already has recorded parents', async () => {
    const data = treeData();
    data.individuals[ADNAN].familyAsChild = FAM_ISH;
    mockDbTreeToGedcomData.mockReturnValue(data);
    const POST = await postRoute();
    const res = await POST(
      makeRequest({ body: { descendantId: ADNAN, ancestorFamilyId: FAM_ISH } }),
      postParams,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('قفزة نسب');
  });

  test('400 on a cycle', async () => {
    // Point عدنان at his own son's family.
    const data = treeData();
    data.individuals[MAADD].familiesAsSpouse = [FAM_MAADD];
    data.families[FAM_MAADD] = makeFamily({ id: FAM_MAADD, husband: MAADD });
    mockDbTreeToGedcomData.mockReturnValue(data);
    const POST = await postRoute();
    const res = await POST(
      makeRequest({ body: { descendantId: ADNAN, ancestorFamilyId: FAM_MAADD } }),
      postParams,
    );
    expect(res.status).toBe(400);
  });

  test('409 when the person already has a jump (route pre-check)', async () => {
    const data = treeData();
    data.ancestryJumps = {
      [JUMP_ID]: {
        id: JUMP_ID,
        type: '_ANC_JUMP',
        descendant: ADNAN,
        ancestorFamily: FAM_ISH,
        generationsMin: null,
        generationsMax: null,
        notes: '',
      },
    };
    data.individuals[ADNAN].ancestryJumpAsDescendant = JUMP_ID;
    mockDbTreeToGedcomData.mockReturnValue(data);
    const POST = await postRoute();
    const res = await POST(
      makeRequest({ body: { descendantId: ADNAN, ancestorFamilyId: FAM_ISH } }),
      postParams,
    );
    expect(res.status).toBe(409);
    expect(mockJumpCreate).not.toHaveBeenCalled();
  });

  test('409 rather than 500 when the DB unique index fires (race backstop)', async () => {
    mockJumpCreate.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        meta: { target: ['tree_id', 'descendant_id'] },
      }),
    );
    const POST = await postRoute();
    const res = await POST(
      makeRequest({ body: { descendantId: ADNAN, ancestorFamilyId: FAM_ISH } }),
      postParams,
    );
    expect(res.status).toBe(409);
  });

  test('400 when the ancestor couple is empty', async () => {
    const data = treeData();
    data.families[FAM_ISH].husband = null;
    data.families[FAM_ISH].wife = null;
    mockDbTreeToGedcomData.mockReturnValue(data);
    const POST = await postRoute();
    const res = await POST(
      makeRequest({ body: { descendantId: ADNAN, ancestorFamilyId: FAM_ISH } }),
      postParams,
    );
    expect(res.status).toBe(400);
  });

  test('404 for a foreign/unknown treeId', async () => {
    mockFamilyTreeFindFirst.mockResolvedValue(null);
    const POST = await postRoute();
    const res = await POST(
      makeRequest({
        body: { treeId: FOREIGN_TREE, descendantId: ADNAN, ancestorFamilyId: FAM_ISH },
      }),
      postParams,
    );
    expect(res.status).toBe(404);
    expect(mockJumpCreate).not.toHaveBeenCalled();
  });

  test('the row is scoped to the RESOLVED tree, not to the raw body treeId', async () => {
    mockTreeResolves();
    const POST = await postRoute();
    await POST(
      makeRequest({ body: { treeId: MAIN_TREE, descendantId: ADNAN, ancestorFamilyId: FAM_ISH } }),
      postParams,
    );
    // `resolveTargetTreeOr404` returned MAIN_TREE; the row must carry that id,
    // and no stray request field may ride along into the Prisma payload.
    const written = mockJumpCreate.mock.calls[0][0].data;
    expect(written.treeId).toBe(MAIN_TREE);
    expect(Object.keys(written).sort()).toEqual(
      ['ancestorFamilyId', 'createdById', 'descendantId', 'generationsMax', 'generationsMin', 'notes', 'treeId'],
    );
  });
});

// ===========================================================================
// PATCH
// ===========================================================================

describe('PATCH /ancestry-jumps/[jumpId]', () => {
  beforeEach(() => {
    mockAuth();
    mockTreeEditor();
    mockTreeResolves();
    mockJumpFindFirst.mockResolvedValue({
      id: JUMP_ID,
      treeId: MAIN_TREE,
      descendantId: ADNAN,
      ancestorFamilyId: FAM_ISH,
      generationsMin: 4,
      generationsMax: 40,
      notes: null,
    });
  });

  test('403 for a viewer', async () => {
    mockViewer();
    const { PATCH } = await itemRoute();
    const res = await PATCH(makeRequest({ method: 'PATCH', body: { generationsMin: 7 } }), itemParams);
    expect(res.status).toBe(403);
  });

  test('200 and updates the range', async () => {
    mockJumpUpdate.mockResolvedValue(createdRow({ generationsMin: 7, generationsMax: 7, notes: null }));
    const { PATCH } = await itemRoute();
    const res = await PATCH(
      makeRequest({ method: 'PATCH', body: { generationsMin: 7, generationsMax: 7 } }),
      itemParams,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.generationsMin).toBe(7);
    expect(json.data.generationsMax).toBe(7);
  });

  test('404 when the jump belongs to another tree', async () => {
    mockJumpFindFirst.mockResolvedValue(null);
    const { PATCH } = await itemRoute();
    const res = await PATCH(makeRequest({ method: 'PATCH', body: { generationsMin: 7 } }), itemParams);
    expect(res.status).toBe(404);
    expect(mockJumpUpdate).not.toHaveBeenCalled();
  });

  test('404 rather than 500 for a malformed jumpId', async () => {
    // A non-UUID against a `@db.Uuid` column raises Prisma P2023 → 500. The
    // shape check turns it into the same generic 404 a foreign id gets.
    const { PATCH } = await itemRoute();
    const res = await PATCH(makeRequest({ method: 'PATCH', body: { generationsMin: 7 } }), {
      params: Promise.resolve({ id: WS, jumpId: "not-a-uuid' OR 1=1" }),
    });
    expect(res.status).toBe(404);
    expect(mockJumpFindFirst).not.toHaveBeenCalled();
    expect(mockJumpUpdate).not.toHaveBeenCalled();
  });

  test('the lookup is scoped by BOTH jump id and tree id', async () => {
    const { PATCH } = await itemRoute();
    await PATCH(makeRequest({ method: 'PATCH', body: { generationsMin: 7 } }), itemParams);
    expect(mockJumpFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: JUMP_ID, treeId: MAIN_TREE } }),
    );
  });

  test('rejects a MERGED range that is out of order (existing max 40, new min 99)', async () => {
    // Zod's refine only sees the patch; the merged check is the route's job.
    const { PATCH } = await itemRoute();
    const res = await PATCH(makeRequest({ method: 'PATCH', body: { generationsMin: 99 } }), itemParams);
    expect(res.status).toBe(400);
    expect(mockJumpUpdate).not.toHaveBeenCalled();
  });

  test('an explicit null clears a bound and makes the merged check pass', async () => {
    const { PATCH } = await itemRoute();
    const res = await PATCH(
      makeRequest({ method: 'PATCH', body: { generationsMin: 99, generationsMax: null } }),
      itemParams,
    );
    expect(res.status).toBe(200);
  });

  test('does not move either endpoint', async () => {
    const { PATCH } = await itemRoute();
    await PATCH(makeRequest({ method: 'PATCH', body: { generationsMin: 7 } }), itemParams);
    const written = mockJumpUpdate.mock.calls[0][0].data;
    expect(written).not.toHaveProperty('descendantId');
    expect(written).not.toHaveProperty('ancestorFamilyId');
  });

  test('writes one update audit row and touches the tree', async () => {
    const { PATCH } = await itemRoute();
    await PATCH(makeRequest({ method: 'PATCH', body: { generationsMin: 7 } }), itemParams);
    expect(mockTreeEditLogCreate).toHaveBeenCalledTimes(1);
    expect(mockTreeEditLogCreate.mock.calls[0][0].data.action).toBe('update');
    expect(mockTreeEditLogCreate.mock.calls[0][0].data.entityType).toBe('ancestry_jump');
    expect(mockFamilyTreeUpdate).toHaveBeenCalled();
  });

  test('returns plaintext notes after an update', async () => {
    mockJumpUpdate.mockResolvedValue(createdRow({ notes: Buffer.from('bytes') }));
    const { PATCH } = await itemRoute();
    const res = await PATCH(makeRequest({ method: 'PATCH', body: { notes: 'جديد' } }), itemParams);
    expect((await res.json()).data.notes).toBe('جديد');
  });
});

// ===========================================================================
// DELETE
// ===========================================================================

describe('DELETE /ancestry-jumps/[jumpId]', () => {
  beforeEach(() => {
    mockAuth();
    mockTreeEditor();
    mockTreeResolves();
    mockJumpFindFirst.mockResolvedValue({
      id: JUMP_ID,
      treeId: MAIN_TREE,
      descendantId: ADNAN,
      ancestorFamilyId: FAM_ISH,
      generationsMin: null,
      generationsMax: null,
      notes: null,
    });
  });

  test('403 for a viewer', async () => {
    mockViewer();
    const { DELETE } = await itemRoute();
    const res = await DELETE(makeRequest({ method: 'DELETE' }), itemParams);
    expect(res.status).toBe(403);
  });

  test('204 on success', async () => {
    const { DELETE } = await itemRoute();
    const res = await DELETE(makeRequest({ method: 'DELETE' }), itemParams);
    expect(res.status).toBe(204);
    expect(mockJumpDelete).toHaveBeenCalledWith({ where: { id: JUMP_ID } });
  });

  test('404 for a jump in another tree', async () => {
    mockJumpFindFirst.mockResolvedValue(null);
    const { DELETE } = await itemRoute();
    const res = await DELETE(makeRequest({ method: 'DELETE' }), itemParams);
    expect(res.status).toBe(404);
    expect(mockJumpDelete).not.toHaveBeenCalled();
  });

  test('404 rather than 500 for a malformed jumpId', async () => {
    const { DELETE } = await itemRoute();
    const res = await DELETE(makeRequest({ method: 'DELETE' }), {
      params: Promise.resolve({ id: WS, jumpId: 'not-a-uuid' }),
    });
    expect(res.status).toBe(404);
    expect(mockJumpFindFirst).not.toHaveBeenCalled();
    expect(mockJumpDelete).not.toHaveBeenCalled();
  });

  test('accepts an optional treeId body to target an extra tree', async () => {
    const { DELETE } = await itemRoute();
    const res = await DELETE(
      makeRequest({ method: 'DELETE', body: { treeId: MAIN_TREE } }),
      itemParams,
    );
    expect(res.status).toBe(204);
  });

  test('writes one delete audit row with the before-snapshot and touches the tree', async () => {
    const { DELETE } = await itemRoute();
    await DELETE(makeRequest({ method: 'DELETE' }), itemParams);
    expect(mockTreeEditLogCreate).toHaveBeenCalledTimes(1);
    const log = mockTreeEditLogCreate.mock.calls[0][0].data;
    expect(log.action).toBe('delete');
    expect(log.entityType).toBe('ancestry_jump');
    expect(log.snapshotBefore).toBeTruthy();
    expect(mockFamilyTreeUpdate).toHaveBeenCalled();
  });

  test('deletes the jump row ONLY — never the ancestor family or individuals', async () => {
    const { DELETE } = await itemRoute();
    await DELETE(makeRequest({ method: 'DELETE' }), itemParams);
    expect(mockJumpDelete).toHaveBeenCalledTimes(1);
    // No family/individual delete mock exists on the prisma stub; if the route
    // reached for one it would throw rather than silently pass.
  });
});

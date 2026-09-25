/**
 * Sources («المصادر») rework R2 — the member write/read API for SHARED
 * sources: `POST sources`, PATCH link deltas + last link, partial DELETE,
 * the preview GET, the person GET shape + family hints, suggestions, the
 * admin list shape/filters/counts and bulk.
 *
 * Real route handlers over an in-memory Prisma fake (tree/workspace scoping
 * and link rows are really exercised), mocked Supabase, REAL AES-GCM with a
 * fixed key. What can break: a hidden (private) person's id, name or count
 * reaching a non-admin; a link crossing trees; the last person silently
 * orphaning or deleting a source.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { encryptField } from '@/lib/crypto/workspace-encryption';
import { decryptSnapshot } from '@/lib/tree/encryption';
import { decryptAuditPayload } from '@/lib/tree/audit';

// ---------------------------------------------------------------------------
// Mocks
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

vi.mock('@/lib/tree/encryption', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tree/encryption')>('@/lib/tree/encryption');
  return {
    ...actual,
    getWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 7)),
    getOrCreateWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 7)),
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const KEY = Buffer.alloc(32, 7);
const WS = 'ws-shared-1';
const OTHER_WS = 'ws-shared-2';
const MAIN = 'bbbbbbbb-1111-4111-9111-111111111111';
const EXTRA = 'bbbbbbbb-2222-4222-9222-222222222222';
const FOREIGN_TREE = 'bbbbbbbb-3333-4333-9333-333333333333';

// A (father) married W; children C, D and PRIV (private). B is unrelated.
const A = 'cccccccc-0000-4000-8000-00000000000a';
const B = 'cccccccc-0000-4000-8000-00000000000b';
const C = 'cccccccc-0000-4000-8000-00000000000c';
const D = 'cccccccc-0000-4000-8000-00000000000d';
const W = 'cccccccc-0000-4000-8000-0000000000e0';
const PRIV = 'cccccccc-0000-4000-8000-0000000000f0';
const X_EXTRA = 'cccccccc-0000-4000-8000-000000000100';
const FOREIGN_PERSON = 'cccccccc-0000-4000-8000-000000000200';
const ABSENT = 'cccccccc-0000-4000-8000-0000000fffff';

const S_SHARED = 'eeeeeeee-0000-4000-8000-000000000001';
const S_ADMIN = 'eeeeeeee-0000-4000-8000-000000000002';
const S_ONLY_PRIV = 'eeeeeeee-0000-4000-8000-000000000003';
const S_TREE = 'eeeeeeee-0000-4000-8000-000000000004';
const S_ORPHAN = 'eeeeeeee-0000-4000-8000-000000000005';
const S_EXTRA = 'eeeeeeee-0000-4000-8000-000000000006';
const S_FOREIGN = 'eeeeeeee-0000-4000-8000-000000000007';
const S_MINE = 'eeeeeeee-0000-4000-8000-000000000008';
const S_ABSENT = 'eeeeeeee-0000-4000-8000-0000000fffff';

const ADMIN_USER = { id: 'u-admin', email: 'a@x', user_metadata: {} };
const EDITOR_USER = { id: 'u-editor', email: 'e@x', user_metadata: {} };
const MEMBER_USER = { id: 'u-member', email: 'm@x', user_metadata: {} };

const MEMBERSHIPS: Record<string, { role: string; permissions: string[] }> = {
  'u-admin': { role: 'workspace_admin', permissions: [] },
  'u-editor': { role: 'workspace_member', permissions: ['tree_editor'] },
  'u-member': { role: 'workspace_member', permissions: [] },
};

type Row = Record<string, unknown>;
const TREES: Row[] = [
  { id: MAIN, workspaceId: WS, kind: 'main' },
  { id: EXTRA, workspaceId: WS, kind: 'extra' },
  { id: FOREIGN_TREE, workspaceId: OTHER_WS, kind: 'main' },
];

const enc = (s: string) => encryptField(s, KEY);

const NAMES: Record<string, string> = {
  [A]: 'محمد',
  [B]: 'علي',
  [C]: 'زيد',
  [D]: 'عمر',
  [W]: 'هند',
  [PRIV]: 'سرّي',
};

let individuals: Row[] = [];
let families: Row[] = [];
let entries: Row[] = [];
let links: Row[] = [];
let files: Row[] = [];
let auditRows: Row[] = [];
let seq = 0;
let createCounter = 0;

function tick(): Date {
  seq += 1;
  return new Date(Date.UTC(2026, 0, 1, 0, 0, seq));
}

function person(id: string, treeId: string, isPrivate = false): Row {
  return { id, treeId, isPrivate, givenName: enc(NAMES[id] ?? 'شخص'), surname: id === A ? enc('السعيد') : null, fullName: null };
}

function source(id: string, treeId: string, visibility: string, text: string, people: string[], opts: { treeWide?: boolean; by?: string } = {}): Row {
  const at = tick();
  for (const individualId of people) {
    links.push({ sourceId: id, individualId, treeId, createdById: opts.by ?? 'u-admin', createdAt: tick() });
  }
  return {
    id,
    treeId,
    isTreeWide: opts.treeWide ?? false,
    visibility,
    text: enc(text),
    createdById: opts.by ?? 'u-admin',
    createdAt: at,
    updatedAt: at,
  };
}

function seed() {
  seq = 0;
  createCounter = 0;
  links = [];
  files = [];
  auditRows = [];
  individuals = [
    person(A, MAIN),
    person(B, MAIN),
    person(C, MAIN),
    person(D, MAIN),
    person(W, MAIN),
    person(PRIV, MAIN, true),
    person(X_EXTRA, EXTRA),
    person(FOREIGN_PERSON, FOREIGN_TREE),
  ];
  families = [{ id: 'fam-1', treeId: MAIN, husbandId: A, wifeId: W, children: [C, D, PRIV] }];
  entries = [
    source(S_SHARED, MAIN, 'members', 'دفتر العائلة', [A, C, PRIV]),
    source(S_ADMIN, MAIN, 'admins', 'سجل سري', [A]),
    source(S_ONLY_PRIV, MAIN, 'members', 'وثيقة خاصة', [PRIV]),
    source(S_TREE, MAIN, 'members', 'مشجرة العائلة', [], { treeWide: true }),
    source(S_ORPHAN, MAIN, 'members', 'بلا أشخاص', []),
    source(S_EXTRA, EXTRA, 'members', 'تاريخ الطبري', [X_EXTRA]),
    source(S_FOREIGN, FOREIGN_TREE, 'public', 'مصدر غريب', [FOREIGN_PERSON]),
    source(S_MINE, MAIN, 'admins', 'كتبه المحرر', [B], { by: 'u-editor' }),
  ];
  files = [
    { id: 'ffffffff-0000-4000-8000-000000000001', entryId: S_SHARED, treeId: MAIN, mimeType: 'image/png', sizeBytes: 3, fileName: enc('دفتر.png'), createdAt: tick() },
  ];
}

// --- tiny where-matcher ------------------------------------------------------

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'tree') {
      const tree = TREES.find((t) => t.id === row.treeId);
      if (!tree || !matches(tree, cond as Row)) return false;
      continue;
    }
    if (key === 'family') {
      const fam = families.find((f) => f.id === row.familyId);
      if (!fam || !matches(fam, cond as Row)) return false;
      continue;
    }
    if (key === 'AND') {
      if (!(cond as Row[]).every((c) => matches(row, c))) return false;
      continue;
    }
    if (key === 'OR') {
      if (!(cond as Row[]).some((c) => matches(row, c))) return false;
      continue;
    }
    if (key === 'links') {
      const some = (cond as { some: Row }).some;
      if (!links.some((l) => l.sourceId === row.id && matches(l, some))) return false;
      continue;
    }
    const value = row[key];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Row;
      if ('in' in c && !(c.in as unknown[]).includes(value)) return false;
      if ('not' in c) {
        if (c.not === null ? value === null || value === undefined : value === c.not) return false;
      }
      continue;
    }
    if (cond === null ? value !== null && value !== undefined : value !== cond) return false;
  }
  return true;
}

function ordered(rows: Row[], orderBy: unknown): Row[] {
  const list = [...rows];
  const specs = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []) as Row[];
  list.sort((a, b) => {
    for (const spec of specs) {
      const [field, dir] = Object.entries(spec)[0] as [string, string];
      const av = a[field] as Date | string;
      const bv = b[field] as Date | string;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
  return list;
}

function linksOf(sourceId: unknown): Row[] {
  return ordered(
    links.filter((l) => l.sourceId === sourceId),
    [{ createdAt: 'asc' }, { individualId: 'asc' }],
  ).map((l) => ({ ...l, individual: individuals.find((i) => i.id === l.individualId) ?? null }));
}

function joined(row: Row): Row {
  const own = files.filter((f) => f.entryId === row.id);
  return { ...row, links: linksOf(row.id), files: own, _count: { files: own.length, links: linksOf(row.id).length } };
}

function dropSource(ids: unknown[]) {
  entries = entries.filter((e) => !ids.includes(e.id));
  links = links.filter((l) => !ids.includes(l.sourceId)); // FK cascade
  files = files.filter((f) => !ids.includes(f.entryId)); // FK cascade
}

vi.mock('@/lib/db', () => {
  const prisma: Record<string, unknown> = {
    workspaceMembership: {
      findUnique: async ({ where }: { where: { userId_workspaceId: { userId: string; workspaceId: string } } }) => {
        const { userId, workspaceId } = where.userId_workspaceId;
        const m = workspaceId === WS ? MEMBERSHIPS[userId] : undefined;
        return m ? { userId, workspaceId, ...m } : null;
      },
    },
    familyTree: {
      findFirst: async ({ where }: { where: Row }) => {
        const t = TREES.find((tree) => matches(tree, where));
        return t ? { id: t.id } : null;
      },
      update: vi.fn(),
    },
    individual: {
      findFirst: async ({ where }: { where: Row }) => individuals.find((i) => matches(i, where)) ?? null,
      findMany: async ({ where }: { where: Row }) =>
        individuals.filter((i) => matches(i, where)).map((i) => ({ id: i.id, isPrivate: i.isPrivate })),
    },
    familyChild: {
      findMany: async ({ where }: { where: { individualId: string; family: Row } }) =>
        families
          .filter((f) => (f.children as string[]).includes(where.individualId) && matches(f, where.family))
          .map((f) => ({ family: { husbandId: f.husbandId, wifeId: f.wifeId } })),
    },
    family: {
      findMany: async ({ where }: { where: Row }) =>
        families
          .filter((f) => matches(f, where))
          .map((f) => ({ husbandId: f.husbandId, wifeId: f.wifeId, children: (f.children as string[]).map((c) => ({ individualId: c })) })),
    },
    sourceEntry: {
      findFirst: async ({ where, orderBy }: { where: Row; orderBy?: unknown }) => {
        const hit = ordered(entries.filter((e) => matches(e, where)), orderBy)[0];
        return hit ? joined(hit) : null;
      },
      findMany: async ({ where, orderBy, take }: { where: Row; orderBy?: unknown; take?: number }) => {
        const list = ordered(entries.filter((e) => matches(e, where)), orderBy).map(joined);
        return take ? list.slice(0, take) : list;
      },
      create: async ({ data }: { data: Row }) => {
        createCounter += 1;
        const at = new Date();
        const row: Row = {
          id: `aaaaaaaa-0000-4000-8000-${String(createCounter).padStart(12, '0')}`,
          isTreeWide: false,
          visibility: 'admins',
          createdAt: at,
          updatedAt: at,
          ...data,
        };
        entries.push(row);
        return joined(row);
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const row = entries.find((e) => matches(e, where));
        if (!row) throw Object.assign(new Error('not found'), { code: 'P2025' });
        Object.assign(row, data, { updatedAt: new Date() });
        return joined(row);
      },
      delete: async ({ where }: { where: Row }) => {
        const row = entries.find((e) => matches(e, where));
        if (!row) throw Object.assign(new Error('not found'), { code: 'P2025' });
        dropSource([row.id]);
        return row;
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const hit = entries.filter((e) => matches(e, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
      deleteMany: async ({ where }: { where: Row }) => {
        const gone = entries.filter((e) => matches(e, where));
        dropSource(gone.map((e) => e.id));
        return { count: gone.length };
      },
    },
    sourceLink: {
      create: async ({ data }: { data: Row }) => {
        const row = { createdAt: tick(), ...data };
        links.push(row);
        return row;
      },
      createMany: async ({ data }: { data: Row[] }) => {
        for (const d of data) {
          if (links.some((l) => l.sourceId === d.sourceId && l.individualId === d.individualId)) {
            throw Object.assign(new Error('dup'), { code: 'P2002' });
          }
          links.push({ createdAt: tick(), ...d });
        }
        return { count: data.length };
      },
      findMany: async ({ where }: { where: Row }) => ordered(links.filter((l) => matches(l, where)), [{ createdAt: 'asc' }]).map((l) => ({ ...l, individual: individuals.find((i) => i.id === l.individualId) ?? null })),
      deleteMany: async ({ where }: { where: Row }) => {
        const before = links.length;
        links = links.filter((l) => !matches(l, where));
        return { count: before - links.length };
      },
      count: async ({ where }: { where: Row }) => links.filter((l) => matches(l, where)).length,
    },
    sourceFile: {
      count: async ({ where }: { where: Row }) => files.filter((f) => matches(f, where)).length,
    },
    treeEditLog: {
      create: async ({ data }: { data: Row }) => {
        auditRows.push(data);
        return data;
      },
    },
    $queryRaw: async () => [],
  };
  prisma.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => {
    // Roll back on throw, as the database would.
    const snapshot = {
      entries: entries.map((e) => ({ ...e })),
      links: links.map((l) => ({ ...l })),
      files: files.map((f) => ({ ...f })),
      audit: auditRows.length,
    };
    try {
      return await fn(prisma);
    } catch (error) {
      entries = snapshot.entries;
      links = snapshot.links;
      files = snapshot.files;
      auditRows.length = snapshot.audit;
      throw error;
    }
  };
  return { prisma };
});

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

function as(user: { id: string }) {
  mockGetUser.mockResolvedValue({ data: { user }, error: null });
}

function req(path: string, method = 'GET', body?: unknown) {
  return new NextRequest(`http://localhost:4000/api/workspaces/${WS}/tree/${path}`, {
    method,
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const listRoute = () => import('@/app/api/workspaces/[id]/tree/sources/route');
const entryRoute = () => import('@/app/api/workspaces/[id]/tree/sources/[entryId]/route');
const personRoute = () => import('@/app/api/workspaces/[id]/tree/individuals/[individualId]/sources/route');
const suggestionsRoute = () => import('@/app/api/workspaces/[id]/tree/sources/suggestions/route');
const bulkRoute = () => import('@/app/api/workspaces/[id]/tree/sources/bulk/route');

const wp = { params: Promise.resolve({ id: WS }) };
const ep = (entryId: string) => ({ params: Promise.resolve({ id: WS, entryId }) });
const pp = (individualId: string) => ({ params: Promise.resolve({ id: WS, individualId }) });

async function createSource(user: { id: string }, body: unknown) {
  as(user);
  const { POST } = await listRoute();
  return POST(req('sources', 'POST', body), wp);
}
async function patch(user: { id: string }, entryId: string, body: unknown) {
  as(user);
  const { PATCH } = await entryRoute();
  return PATCH(req(`sources/${entryId}`, 'PATCH', body), ep(entryId));
}
async function del(user: { id: string }, entryId: string) {
  as(user);
  const { DELETE } = await entryRoute();
  return DELETE(req(`sources/${entryId}`, 'DELETE', {}), ep(entryId));
}
async function preview(user: { id: string }, entryId: string, query = '') {
  as(user);
  const { GET } = await entryRoute();
  return GET(req(`sources/${entryId}${query}`), ep(entryId));
}
async function getPerson(user: { id: string }, individualId: string) {
  as(user);
  const { GET } = await personRoute();
  return GET(req(`individuals/${individualId}/sources`), pp(individualId));
}
async function suggest(user: { id: string }, query = '') {
  as(user);
  const { GET } = await suggestionsRoute();
  return GET(req(`sources/suggestions${query}`), wp);
}
async function list(user: { id: string }, query = '') {
  as(user);
  const { GET } = await listRoute();
  return GET(req(`sources${query}`), wp);
}

const linkedIds = (sourceId: string) => links.filter((l) => l.sourceId === sourceId).map((l) => l.individualId).sort();
const lastAudit = () => auditRows[auditRows.length - 1];

beforeEach(() => {
  vi.clearAllMocks();
  mockRateCheck.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
  seed();
});

// ===========================================================================
// POST sources
// ===========================================================================

describe('POST sources', () => {
  test('a plain member (no tree_editor) is refused', async () => {
    expect((await createSource(MEMBER_USER, { text: 'x', personIds: [A] })).status).toBe(403);
  });

  test('one save creates one source linked to every chosen person of the tree', async () => {
    const res = await createSource(EDITOR_USER, { text: 'دفتر ١٩٧٤', personIds: [A, C, D] });
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(entries.filter((e) => e.id === data.id)).toHaveLength(1);
    expect(linkedIds(data.id)).toEqual([A, C, D].sort());
    expect(links.filter((l) => l.sourceId === data.id).every((l) => l.treeId === MAIN && l.createdById === 'u-editor')).toBe(true);
    expect(data).toMatchObject({ individualId: A, text: 'دفتر ١٩٧٤', visibility: 'admins' });
  });

  test('the response names the OTHER people the creator may see', async () => {
    const { data } = await (await createSource(ADMIN_USER, { text: 'x', visibility: 'members', personIds: [A, C, PRIV] })).json();
    expect(data.people).toEqual([
      { id: C, name: 'زيد' },
      { id: PRIV, name: 'سرّي' },
    ]);
    expect(data.sharedCount).toBe(2);
  });

  test('another tree, another workspace, nonexistent and a private person (non-admin) all answer the same 400, and nothing is created', async () => {
    const before = entries.length;
    const results = await Promise.all([
      createSource(EDITOR_USER, { text: 'x', personIds: [A, X_EXTRA] }),
      createSource(EDITOR_USER, { text: 'x', personIds: [A, FOREIGN_PERSON] }),
      createSource(EDITOR_USER, { text: 'x', personIds: [A, ABSENT] }),
      createSource(EDITOR_USER, { text: 'x', personIds: [A, PRIV] }),
    ]);
    expect(results.map((r) => r.status)).toEqual([400, 400, 400, 400]);
    const bodies = await Promise.all(results.map((r) => r.json()));
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
    expect(entries.length).toBe(before);
  });

  test('an admin may link a private person', async () => {
    const res = await createSource(ADMIN_USER, { text: 'x', personIds: [PRIV] });
    expect(res.status).toBe(201);
  });

  test('a non-admin cannot set a level other than admins', async () => {
    expect((await createSource(EDITOR_USER, { text: 'x', visibility: 'members', personIds: [A] })).status).toBe(403);
  });

  test('treeId targets an extra tree, and links its people only', async () => {
    const res = await createSource(EDITOR_USER, { treeId: EXTRA, text: 'x', personIds: [X_EXTRA] });
    expect(res.status).toBe(201);
    expect((await createSource(EDITOR_USER, { treeId: EXTRA, text: 'x', personIds: [A] })).status).toBe(400);
  });

  test('writes one audit row whose snapshot lists the person ids and count', async () => {
    const { data } = await (await createSource(ADMIN_USER, { text: 'نص الأصل', personIds: [A, C] })).json();
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({ action: 'create', entityType: 'source_entry', entityId: data.id });
    const after = decryptSnapshot<Row>(auditRows[0].snapshotAfter, KEY)!;
    expect(after).toMatchObject({ personIds: [A, C], peopleCount: 2 });
    expect(JSON.stringify(auditRows[0].description)).not.toContain('نص الأصل');
  });

  test('is rate limited', async () => {
    mockRateCheck.mockReturnValue({ allowed: false, retryAfterSeconds: 5 });
    expect((await createSource(ADMIN_USER, { text: 'x', personIds: [A] })).status).toBe(429);
  });

  test('the per-person POST is gone (replaced by POST sources)', async () => {
    const mod = (await personRoute()) as Record<string, unknown>;
    expect(mod.POST).toBeUndefined();
  });
});

// ===========================================================================
// GET individuals/[individualId]/sources — shape, privacy, family hints
// ===========================================================================

describe('GET person sources (shared shape)', () => {
  test('member on A: the shared source names the other VISIBLE people only; the private person never appears', async () => {
    const res = await getPerson(MEMBER_USER, A);
    const json = await res.json();
    const shared = json.data.entries.find((e: Row) => e.id === S_SHARED);
    expect(shared).toMatchObject({ individualId: A, people: [{ id: C, name: 'زيد' }], sharedCount: 1 });
    const text = JSON.stringify(json);
    expect(text).not.toContain(PRIV);
    expect(text).not.toContain('سرّي');
  });

  test('admin on A: every other person counts', async () => {
    const json = await (await getPerson(ADMIN_USER, A)).json();
    expect(json.data.entries.find((e: Row) => e.id === S_SHARED).sharedCount).toBe(2);
  });

  test('member on the private person: nothing, and no hints', async () => {
    const json = await (await getPerson(MEMBER_USER, PRIV)).json();
    expect(json.data.entries).toEqual([]);
    expect(json.data.familyHints).toBeUndefined();
  });

  test('family hints for an editor: household sources they may see, visible counts only', async () => {
    const json = await (await getPerson(EDITOR_USER, D)).json();
    expect(json.data.entries).toEqual([]);
    expect(json.data.familyHints).toEqual([
      { id: S_SHARED, text: 'دفتر العائلة', visibility: 'members', fileCount: 1, peopleCount: 2, firstPersonName: null },
    ]);
  });

  test('family hints for an admin: most-linked first, at most two', async () => {
    const json = await (await getPerson(ADMIN_USER, D)).json();
    expect(json.data.familyHints.map((h: Row) => h.id)).toEqual([S_SHARED, S_ADMIN]);
    expect(json.data.familyHints[1]).toMatchObject({ peopleCount: 1, firstPersonName: 'محمد السعيد' });
  });

  test('no hints for a plain member (not an editor)', async () => {
    const json = await (await getPerson(MEMBER_USER, D)).json();
    expect(json.data.familyHints).toBeUndefined();
  });

  test('no hints when the person already has a visible source', async () => {
    const json = await (await getPerson(EDITOR_USER, C)).json();
    expect(json.data.entries.map((e: Row) => e.id)).toEqual([S_SHARED]);
    expect(json.data.familyHints).toBeUndefined();
  });
});

// ===========================================================================
// GET sources/[entryId] — preview
// ===========================================================================

describe('GET sources/[entryId] (preview)', () => {
  test('a plain member (no tree_editor) is refused', async () => {
    expect((await preview(MEMBER_USER, S_SHARED)).status).toBe(403);
  });

  test('editor: full text, files, level, and only the visible people', async () => {
    const res = await preview(EDITOR_USER, S_SHARED);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    const { data } = await res.json();
    expect(data).toMatchObject({ id: S_SHARED, text: 'دفتر العائلة', visibility: 'members', peopleCount: 2 });
    expect(data.people).toEqual([
      { id: A, name: 'محمد السعيد' },
      { id: C, name: 'زيد' },
    ]);
    expect(data.files).toHaveLength(1);
    expect(JSON.stringify(data)).not.toContain(PRIV);
  });

  test('admin: every person', async () => {
    const { data } = await (await preview(ADMIN_USER, S_SHARED)).json();
    expect(data.peopleCount).toBe(3);
  });

  test('a source seen only through a private person, an orphan, the tree-wide source, another tree and a malformed id read the same 404 for an editor', async () => {
    const results = await Promise.all([
      preview(EDITOR_USER, S_ONLY_PRIV),
      preview(EDITOR_USER, S_ORPHAN),
      preview(EDITOR_USER, S_TREE),
      preview(EDITOR_USER, S_FOREIGN),
      preview(EDITOR_USER, S_ABSENT),
      preview(EDITOR_USER, 'nope'),
    ]);
    expect(results.map((r) => r.status)).toEqual([404, 404, 404, 404, 404, 404]);
    const bodies = await Promise.all(results.map((r) => r.json()));
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
  });

  test('an admin previews an orphan', async () => {
    const res = await preview(ADMIN_USER, S_ORPHAN);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ people: [], peopleCount: 0 });
  });
});

// ===========================================================================
// PATCH sources/[entryId] — link deltas and the last person
// ===========================================================================

describe('PATCH sources/[entryId] — people', () => {
  test('adds a person, and the answer carries the visible people', async () => {
    const res = await patch(EDITOR_USER, S_SHARED, { addPersonIds: [B] });
    expect(res.status).toBe(200);
    expect(linkedIds(S_SHARED)).toEqual([A, B, C, PRIV].sort());
    const { data } = await res.json();
    expect(data.peopleCount).toBe(3); // A, C, B — never PRIV for an editor
    expect(JSON.stringify(data)).not.toContain(PRIV);
  });

  test('adding an already linked person is a no-op', async () => {
    expect((await patch(ADMIN_USER, S_SHARED, { addPersonIds: [A] })).status).toBe(200);
    expect(linkedIds(S_SHARED)).toEqual([A, C, PRIV].sort());
  });

  test('a private, other-tree or nonexistent person to add → the same 400, nothing changed', async () => {
    const results = await Promise.all([
      patch(EDITOR_USER, S_SHARED, { addPersonIds: [PRIV, B] }),
      patch(EDITOR_USER, S_SHARED, { addPersonIds: [X_EXTRA] }),
      patch(EDITOR_USER, S_SHARED, { addPersonIds: [ABSENT] }),
    ]);
    expect(results.map((r) => r.status)).toEqual([400, 400, 400]);
    const bodies = await Promise.all(results.map((r) => r.json()));
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
    expect(linkedIds(S_SHARED)).toEqual([A, C, PRIV].sort());
  });

  test('removes a person', async () => {
    expect((await patch(EDITOR_USER, S_SHARED, { removePersonIds: [C] })).status).toBe(200);
    expect(linkedIds(S_SHARED)).toEqual([A, PRIV].sort());
  });

  test('a non-admin cannot remove a person hidden from them (silently kept)', async () => {
    expect((await patch(EDITOR_USER, S_SHARED, { removePersonIds: [PRIV] })).status).toBe(200);
    expect(linkedIds(S_SHARED)).toEqual([A, C, PRIV].sort());
  });

  test('link changes are one audit update with linksAdded / linksRemoved ids', async () => {
    await patch(ADMIN_USER, S_SHARED, { text: 'دفتر مُعدّل', addPersonIds: [B], removePersonIds: [C] });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({ action: 'update', entityType: 'source_entry', entityId: S_SHARED });
    const payload = decryptAuditPayload(auditRows[0].payload as Buffer, KEY) as Row;
    expect(payload).toMatchObject({ linksAdded: [B], linksRemoved: [C] });
    const before = decryptSnapshot<Row>(auditRows[0].snapshotBefore, KEY)!;
    const after = decryptSnapshot<Row>(auditRows[0].snapshotAfter, KEY)!;
    expect(before).toMatchObject({ peopleCount: 3 });
    expect((after.personIds as string[]).sort()).toEqual([A, B, PRIV].sort());
  });

  test('removing the last person without a choice → 409 last_link, nothing changed', async () => {
    const res = await patch(ADMIN_USER, S_ADMIN, { removePersonIds: [A] });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'هذا آخر شخص لهذا المصدر', code: 'last_link' });
    expect(linkedIds(S_ADMIN)).toEqual([A]);
    expect(auditRows).toHaveLength(0);
  });

  test('last person + keep → the source stays, linked to nobody, listed under «ليس مصدرًا لأحد»', async () => {
    expect((await patch(ADMIN_USER, S_ADMIN, { removePersonIds: [A], onLastLink: 'keep' })).status).toBe(200);
    expect(entries.some((e) => e.id === S_ADMIN)).toBe(true);
    expect(linkedIds(S_ADMIN)).toEqual([]);
    const { data } = await (await list(ADMIN_USER, '?filter=unlinked')).json();
    expect(data.entries.map((e: Row) => e.id).sort()).toEqual([S_ADMIN, S_ORPHAN].sort());
  });

  test('last person + delete → the source and its files are gone', async () => {
    files.push({ id: 'ffffffff-0000-4000-8000-000000000009', entryId: S_ADMIN, treeId: MAIN, mimeType: 'image/png', sizeBytes: 1, fileName: enc('x'), createdAt: tick() });
    const res = await patch(ADMIN_USER, S_ADMIN, { removePersonIds: [A], onLastLink: 'delete' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: null, deleted: true });
    expect(entries.some((e) => e.id === S_ADMIN)).toBe(false);
    expect(files.some((f) => f.entryId === S_ADMIN)).toBe(false);
    expect(lastAudit()).toMatchObject({ action: 'delete', entityId: S_ADMIN });
  });

  test('an orphan getting its first person back is fine (no question)', async () => {
    expect((await patch(ADMIN_USER, S_ORPHAN, { addPersonIds: [B] })).status).toBe(200);
    expect(linkedIds(S_ORPHAN)).toEqual([B]);
  });

  test('link ops on the tree-wide source → 400', async () => {
    expect((await patch(ADMIN_USER, S_TREE, { addPersonIds: [A] })).status).toBe(400);
    expect(linkedIds(S_TREE)).toEqual([]);
  });

  test('content edits on the tree-wide source still read 404 here (it has its own route)', async () => {
    expect((await patch(ADMIN_USER, S_TREE, { text: 'x' })).status).toBe(404);
  });

  test('more than 500 people on one source → 400', async () => {
    for (let i = 0; i < 498; i += 1) {
      links.push({ sourceId: S_SHARED, individualId: `dddddddd-0000-4000-8000-${String(i).padStart(12, '0')}`, treeId: MAIN, createdAt: tick() });
    }
    expect((await patch(ADMIN_USER, S_SHARED, { addPersonIds: [B] })).status).toBe(400);
    expect(linkedIds(S_SHARED)).not.toContain(B);
  });

  test('an editor cannot touch the people of a source hidden from them (same 404)', async () => {
    expect((await patch(EDITOR_USER, S_ONLY_PRIV, { addPersonIds: [B] })).status).toBe(404);
    expect(linkedIds(S_ONLY_PRIV)).toEqual([PRIV]);
  });
});

// ===========================================================================
// DELETE sources/[entryId] — partial for a non-admin
// ===========================================================================

describe('DELETE sources/[entryId] — shared', () => {
  test('an admin deletes the source from everyone', async () => {
    expect((await del(ADMIN_USER, S_SHARED)).status).toBe(204);
    expect(entries.some((e) => e.id === S_SHARED)).toBe(false);
    expect(linkedIds(S_SHARED)).toEqual([]);
  });

  test('a non-admin with a hidden person linked removes only the people they see; the source stays', async () => {
    const res = await del(EDITOR_USER, S_SHARED);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ deleted: false });
    expect(entries.some((e) => e.id === S_SHARED)).toBe(true);
    expect(linkedIds(S_SHARED)).toEqual([PRIV]);
    expect(lastAudit()).toMatchObject({ action: 'update', entityId: S_SHARED });
    const payload = decryptAuditPayload(lastAudit().payload as Buffer, KEY) as Row;
    expect((payload.linksRemoved as string[]).sort()).toEqual([A, C].sort());
  });

  test('a non-admin deletes their own admins-level source (all its people visible to them) outright', async () => {
    expect((await del(EDITOR_USER, S_MINE)).status).toBe(204);
    expect(entries.some((e) => e.id === S_MINE)).toBe(false);
  });

  test('the delete audit snapshot lists the person ids', async () => {
    await del(ADMIN_USER, S_SHARED);
    const before = decryptSnapshot<Row>(lastAudit().snapshotBefore, KEY)!;
    expect(before).toMatchObject({ peopleCount: 3 });
  });
});

// ===========================================================================
// Suggestions
// ===========================================================================

describe('GET sources/suggestions (source summaries)', () => {
  test('returns source summaries of THIS tree, gate-filtered, with visible counts', async () => {
    const { data } = await (await suggest(EDITOR_USER, '')).json();
    const ids = data.suggestions.map((s: Row) => s.id);
    expect(ids).toContain(S_SHARED);
    expect(ids).not.toContain(S_ONLY_PRIV); // seen only through a private person
    expect(ids).not.toContain(S_ORPHAN); // orphans: admins only
    expect(ids).not.toContain(S_ADMIN); // admins level
    expect(ids).not.toContain(S_TREE); // tree-wide is never reused
    expect(ids).not.toContain(S_EXTRA); // another tree
    expect(ids).not.toContain(S_FOREIGN);
    expect(data.suggestions.find((s: Row) => s.id === S_SHARED)).toEqual({
      id: S_SHARED,
      text: 'دفتر العائلة',
      visibility: 'members',
      fileCount: 1,
      peopleCount: 2,
      firstPersonName: null,
    });
  });

  test('admins also get orphans, and a one-person source carries that person\'s name', async () => {
    const { data } = await (await suggest(ADMIN_USER, '')).json();
    expect(data.suggestions.map((s: Row) => s.id)).toContain(S_ORPHAN);
    expect(data.suggestions.find((s: Row) => s.id === S_ADMIN)).toMatchObject({ peopleCount: 1, firstPersonName: 'محمد السعيد' });
  });

  test('treeId targets another tree of the workspace', async () => {
    const { data } = await (await suggest(ADMIN_USER, `?treeId=${EXTRA}`)).json();
    expect(data.suggestions.map((s: Row) => s.id)).toEqual([S_EXTRA]);
  });

  test('matches diacritic-insensitively', async () => {
    const { data } = await (await suggest(ADMIN_USER, `?q=${encodeURIComponent('دَفْتَر')}`)).json();
    expect(data.suggestions.map((s: Row) => s.id)).toEqual([S_SHARED]);
  });

  test('caps at 10', async () => {
    for (let i = 0; i < 15; i += 1) {
      entries.push(source(`eeeeeeee-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`, MAIN, 'members', `كتاب ${i}`, [B]));
    }
    const { data } = await (await suggest(ADMIN_USER, `?q=${encodeURIComponent('كتاب')}`)).json();
    expect(data.suggestions).toHaveLength(10);
  });
});

// ===========================================================================
// Admin list
// ===========================================================================

describe('GET sources (admin list) — one row per source', () => {
  test('rows carry people (real names, admin), peopleCount and fileCount; tabs counted', async () => {
    const { data } = await (await list(ADMIN_USER)).json();
    const shared = data.entries.find((e: Row) => e.id === S_SHARED);
    expect(shared.people).toEqual([
      { id: A, name: 'محمد السعيد' },
      { id: C, name: 'زيد' },
      { id: PRIV, name: 'سرّي' },
    ]);
    expect(shared).toMatchObject({ peopleCount: 3, fileCount: 1 });
    expect(data.entries.some((e: Row) => e.id === S_TREE)).toBe(false);
    expect(data.counts).toEqual({ all: 5, shared: 1, unlinked: 1 });
  });

  test('filter=shared keeps sources with two or more people; counts stay whole', async () => {
    const { data } = await (await list(ADMIN_USER, '?filter=shared')).json();
    expect(data.entries.map((e: Row) => e.id)).toEqual([S_SHARED]);
    expect(data.total).toBe(1);
    expect(data.matchedIds).toEqual([S_SHARED]);
    expect(data.counts).toEqual({ all: 5, shared: 1, unlinked: 1 });
  });

  test('filter=unlinked keeps orphans only', async () => {
    const { data } = await (await list(ADMIN_USER, '?filter=unlinked')).json();
    expect(data.entries.map((e: Row) => e.id)).toEqual([S_ORPHAN]);
    expect(data.entries[0]).toMatchObject({ people: [], peopleCount: 0 });
  });

  test('names are capped at 20 per row while peopleCount stays real', async () => {
    for (let i = 0; i < 25; i += 1) {
      const id = `dddddddd-0000-4000-8000-${String(i).padStart(12, '0')}`;
      individuals.push(person(id, MAIN));
      links.push({ sourceId: S_ORPHAN, individualId: id, treeId: MAIN, createdAt: tick() });
    }
    const { data } = await (await list(ADMIN_USER)).json();
    const row = data.entries.find((e: Row) => e.id === S_ORPHAN);
    expect(row.people).toHaveLength(20);
    expect(row.peopleCount).toBe(25);
  });
});

// ===========================================================================
// Bulk — per source
// ===========================================================================

describe('POST sources/bulk — per source', () => {
  test('delete removes whole sources with every link', async () => {
    as(ADMIN_USER);
    const { POST } = await bulkRoute();
    const res = await POST(req('sources/bulk', 'POST', { ids: [S_SHARED, S_ADMIN], action: 'delete' }), wp);
    expect((await res.json()).data).toEqual({ deleted: 2 });
    expect(linkedIds(S_SHARED)).toEqual([]);
    expect(linkedIds(S_ADMIN)).toEqual([]);
    const before = decryptSnapshot<{ entries: Row[] }>(auditRows[0].snapshotBefore, KEY)!;
    expect(before.entries.find((e) => e.id === S_SHARED)).toMatchObject({ peopleCount: 3 });
  });
});

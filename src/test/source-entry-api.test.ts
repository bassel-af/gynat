/**
 * Sources («المصادر») step 4 — the text-only source-entry API.
 *
 * Real route handlers over a tiny in-memory Prisma fake (so tree/workspace
 * scoping is actually exercised, not just "was findFirst called"), mocked
 * Supabase, and a fixed workspace key with REAL AES-GCM so we can assert the
 * text is ciphertext at rest.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { encryptField, decryptField } from '@/lib/crypto/workspace-encryption';

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

const KEY = Buffer.alloc(32, 9);
vi.mock('@/lib/tree/encryption', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tree/encryption')>(
    '@/lib/tree/encryption',
  );
  return {
    ...actual,
    getWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 9)),
    getOrCreateWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 9)),
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WS = 'ws-src-1';
const OTHER_WS = 'ws-src-2';
const MAIN = 'bbbbbbbb-1111-4111-9111-111111111111';
const EXTRA = 'bbbbbbbb-2222-4222-9222-222222222222';
const FOREIGN_TREE = 'bbbbbbbb-3333-4333-9333-333333333333';

const PERSON = 'cccccccc-0000-4000-8000-000000000001';
const PERSON_BARE = 'cccccccc-0000-4000-8000-000000000002';
const PRIV = 'cccccccc-0000-4000-8000-000000000003';
const EXTRA_PERSON = 'cccccccc-0000-4000-8000-000000000004';
const FOREIGN_PERSON = 'cccccccc-0000-4000-8000-000000000005';

const E_ADMINS = 'eeeeeeee-0000-4000-8000-000000000001';
const E_MEMBERS = 'eeeeeeee-0000-4000-8000-000000000002';
const E_PRIV = 'eeeeeeee-0000-4000-8000-000000000003';
const E_EXTRA = 'eeeeeeee-0000-4000-8000-000000000004';
const E_FOREIGN = 'eeeeeeee-0000-4000-8000-000000000005';
const E_TREE = 'eeeeeeee-0000-4000-8000-000000000006';
const E_MINE_ADMINS = 'eeeeeeee-0000-4000-8000-000000000007';
const ABSENT = 'eeeeeeee-0000-4000-8000-0000000000ff';

const ADMIN_USER = { id: 'u-admin', email: 'a@x', user_metadata: {} };
const EDITOR_USER = { id: 'u-editor', email: 'e@x', user_metadata: {} };
const MEMBER_USER = { id: 'u-member', email: 'm@x', user_metadata: {} };
const STRANGER = { id: 'u-stranger', email: 's@x', user_metadata: {} };

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

function seedIndividuals(): Row[] {
  return [
    { id: PERSON, treeId: MAIN, isPrivate: false, givenName: enc('محمد'), surname: enc('السعيد'), fullName: null },
    { id: PERSON_BARE, treeId: MAIN, isPrivate: false, givenName: enc('علي'), surname: null, fullName: null },
    { id: PRIV, treeId: MAIN, isPrivate: true, givenName: enc('سرّي'), surname: null, fullName: null },
    { id: EXTRA_PERSON, treeId: EXTRA, isPrivate: false, givenName: enc('زيد'), surname: null, fullName: null },
    { id: FOREIGN_PERSON, treeId: FOREIGN_TREE, isPrivate: false, givenName: enc('غريب'), surname: null, fullName: null },
  ];
}

let seq = 0;
function entry(id: string, treeId: string, individualId: string | null, visibility: string, text: string, createdById = 'u-admin'): Row {
  seq += 1;
  return {
    id,
    treeId,
    individualId,
    visibility,
    text: enc(text),
    createdById,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, seq)),
    updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, seq)),
  };
}

function seedEntries(): Row[] {
  seq = 0;
  return [
    entry(E_ADMINS, MAIN, PERSON, 'admins', 'سجل سري'),
    entry(E_MEMBERS, MAIN, PERSON, 'members', 'طبقات ابن سعد، ص ٩٠'),
    entry(E_PRIV, MAIN, PRIV, 'members', 'وثيقة خاصة'),
    entry(E_EXTRA, EXTRA, EXTRA_PERSON, 'members', 'تاريخ الطبري'),
    entry(E_FOREIGN, FOREIGN_TREE, FOREIGN_PERSON, 'public', 'مصدر غريب'),
    entry(E_TREE, MAIN, null, 'members', 'مشجرة العائلة'),
    entry(E_MINE_ADMINS, MAIN, PERSON_BARE, 'admins', 'كتبه المحرر', 'u-editor'),
  ];
}

let individuals: Row[] = [];
let entries: Row[] = [];
const auditRows: Row[] = [];
const mockFamilyTreeUpdate = vi.fn();

// --- tiny where-matcher for the fake --------------------------------------

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'tree') {
      const tree = TREES.find((t) => t.id === row.treeId);
      if (!tree || !matches(tree, cond as Row)) return false;
      continue;
    }
    if (key === 'AND') {
      if (!(cond as Row[]).every((c) => matches(row, c))) return false;
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

function withJoins(row: Row): Row {
  const ind = individuals.find((i) => i.id === row.individualId) ?? null;
  return { ...row, individual: ind, _count: { files: 0 } };
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

let createCounter = 0;

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
      update: (...a: unknown[]) => mockFamilyTreeUpdate(...a),
    },
    individual: {
      findFirst: async ({ where }: { where: Row }) => individuals.find((i) => matches(i, where)) ?? null,
    },
    sourceEntry: {
      findFirst: async ({ where, orderBy }: { where: Row; orderBy?: unknown }) => {
        const hit = ordered(entries.filter((e) => matches(e, where)), orderBy)[0];
        return hit ? withJoins(hit) : null;
      },
      findMany: async ({ where, orderBy, take }: { where: Row; orderBy?: unknown; take?: number }) => {
        const list = ordered(entries.filter((e) => matches(e, where)), orderBy).map(withJoins);
        return take ? list.slice(0, take) : list;
      },
      create: async ({ data }: { data: Row }) => {
        createCounter += 1;
        const row: Row = {
          id: `ffffffff-0000-4000-8000-${String(createCounter).padStart(12, '0')}`,
          individualId: null,
          visibility: 'admins',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        entries.push(row);
        return row;
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const row = entries.find((e) => matches(e, where));
        if (!row) throw Object.assign(new Error('not found'), { code: 'P2025' });
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
      delete: async ({ where }: { where: Row }) => {
        const idx = entries.findIndex((e) => matches(e, where));
        if (idx < 0) throw Object.assign(new Error('not found'), { code: 'P2025' });
        return entries.splice(idx, 1)[0];
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const hit = entries.filter((e) => matches(e, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
      deleteMany: async ({ where }: { where: Row }) => {
        const before = entries.length;
        entries = entries.filter((e) => !matches(e, where));
        return { count: before - entries.length };
      },
    },
    treeEditLog: {
      create: async ({ data }: { data: Row }) => {
        auditRows.push(data);
        return data;
      },
    },
    // Step 5: entries here carry no files (the file paths live in
    // source-file-api.test.ts).
    sourceFile: {
      count: async () => 0,
    },
  };
  prisma.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma);
  return { prisma };
});

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

function as(user: { id: string } | null) {
  if (user) mockGetUser.mockResolvedValue({ data: { user }, error: null });
  else mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'no' } });
}

function req(path: string, method = 'GET', body?: unknown) {
  return new NextRequest(`http://localhost:4000/api/workspaces/${WS}/tree/${path}`, {
    method,
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const personRoute = () => import('@/app/api/workspaces/[id]/tree/individuals/[individualId]/sources/route');
const entryRoute = () => import('@/app/api/workspaces/[id]/tree/sources/[entryId]/route');
const treeEntryRoute = () => import('@/app/api/workspaces/[id]/tree/sources/tree-entry/route');
const listRoute = () => import('@/app/api/workspaces/[id]/tree/sources/route');
const bulkRoute = () => import('@/app/api/workspaces/[id]/tree/sources/bulk/route');
const suggestionsRoute = () => import('@/app/api/workspaces/[id]/tree/sources/suggestions/route');

const pp = (individualId: string) => ({ params: Promise.resolve({ id: WS, individualId }) });
const ep = (entryId: string) => ({ params: Promise.resolve({ id: WS, entryId }) });
const wp = { params: Promise.resolve({ id: WS }) };

async function getPerson(individualId: string, query = '') {
  const { GET } = await personRoute();
  return GET(req(`individuals/${individualId}/sources${query}`), pp(individualId));
}

function hasBytesOrUndefined(value: unknown): boolean {
  if (value === undefined) return true;
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return true;
  if (Array.isArray(value)) return value.some(hasBytesOrUndefined);
  if (value && typeof value === 'object') return Object.values(value).some(hasBytesOrUndefined);
  return false;
}

function plainOf(row: Row | undefined): string | null {
  if (!row?.text) return null;
  return decryptField(Buffer.from(row.text as Uint8Array), KEY);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRateCheck.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
  individuals = seedIndividuals();
  entries = seedEntries();
  auditRows.length = 0;
  createCounter = 0;
});

// ===========================================================================
// GET individuals/[individualId]/sources
// ===========================================================================

describe('GET person sources', () => {
  test('401 when not signed in', async () => {
    as(null);
    expect((await getPerson(PERSON)).status).toBe(401);
  });

  test('403 for a non-member, as the other member routes answer', async () => {
    as(STRANGER);
    expect((await getPerson(PERSON)).status).toBe(403);
  });

  test('admin sees every entry on the person, decrypted', async () => {
    as(ADMIN_USER);
    const json = await (await getPerson(PERSON)).json();
    expect(json.data.entries.map((e: Row) => e.text).sort()).toEqual(
      ['سجل سري', 'طبقات ابن سعد، ص ٩٠'].sort(),
    );
  });

  test('member sees only level-2+ entries', async () => {
    as(MEMBER_USER);
    const json = await (await getPerson(PERSON)).json();
    expect(json.data.entries.map((e: Row) => e.id)).toEqual([E_MEMBERS]);
  });

  test('member sees nothing on a private person', async () => {
    as(MEMBER_USER);
    const json = await (await getPerson(PRIV)).json();
    expect(json.data).toEqual({ entries: [], inherited: null });
  });

  test('admin sees the entries on a private person', async () => {
    as(ADMIN_USER);
    const json = await (await getPerson(PRIV)).json();
    expect(json.data.entries.map((e: Row) => e.id)).toEqual([E_PRIV]);
  });

  test('a person with no visible entry inherits the tree-wide entry', async () => {
    as(MEMBER_USER);
    const json = await (await getPerson(PERSON_BARE)).json();
    expect(json.data.inherited?.id).toBe(E_TREE);
  });

  test('a person with a visible entry does not inherit', async () => {
    as(MEMBER_USER);
    const json = await (await getPerson(PERSON)).json();
    expect(json.data.inherited).toBeNull();
  });

  test('is private, no-store and carries no ETag', async () => {
    as(MEMBER_USER);
    const res = await getPerson(PERSON);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('ETag')).toBeNull();
  });

  test('the DTO never carries Bytes or undefined keys', async () => {
    as(ADMIN_USER);
    const json = await (await getPerson(PERSON)).json();
    expect(hasBytesOrUndefined(json)).toBe(false);
    expect(Object.keys(json.data.entries[0]).sort()).toEqual(
      ['createdAt', 'files', 'id', 'individualId', 'text', 'updatedAt', 'visibility'].sort(),
    );
  });

  test('nonexistent, malformed and other-tree individuals answer the same 404', async () => {
    as(ADMIN_USER);
    const results = await Promise.all([
      getPerson(ABSENT),
      getPerson('not-a-uuid'),
      getPerson(FOREIGN_PERSON),
      getPerson(EXTRA_PERSON), // lives in the extra tree, not the main one
    ]);
    const bodies = await Promise.all(results.map((r) => r.json()));
    expect(results.map((r) => r.status)).toEqual([404, 404, 404, 404]);
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
  });

  test('treeId targets an extra tree of the same workspace', async () => {
    as(MEMBER_USER);
    const json = await (await getPerson(EXTRA_PERSON, `?treeId=${EXTRA}`)).json();
    expect(json.data.entries.map((e: Row) => e.id)).toEqual([E_EXTRA]);
  });

  test('another workspace\'s treeId is a 404', async () => {
    as(ADMIN_USER);
    expect((await getPerson(FOREIGN_PERSON, `?treeId=${FOREIGN_TREE}`)).status).toBe(404);
  });
});

// ===========================================================================
// POST individuals/[individualId]/sources
// ===========================================================================

describe('POST person source', () => {
  async function post(user: { id: string }, individualId: string, body: unknown) {
    as(user);
    const { POST } = await personRoute();
    return POST(req(`individuals/${individualId}/sources`, 'POST', body), pp(individualId));
  }

  test('a plain member (no tree_editor) is refused', async () => {
    expect((await post(MEMBER_USER, PERSON, { text: 'x' })).status).toBe(403);
  });

  test('an editor creates an admins-level entry by default', async () => {
    const res = await post(EDITOR_USER, PERSON, { text: '  طبقات  ' });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data).toMatchObject({ individualId: PERSON, text: 'طبقات', visibility: 'admins' });
  });

  test('the text is ciphertext at rest', async () => {
    await post(EDITOR_USER, PERSON, { text: 'طبقات' });
    const row = entries[entries.length - 1];
    expect(Buffer.isBuffer(row.text) || row.text instanceof Uint8Array).toBe(true);
    expect(Buffer.from(row.text as Uint8Array).toString('utf8')).not.toContain('طبقات');
    expect(plainOf(row)).toBe('طبقات');
  });

  test('a non-admin editor cannot set a level other than admins', async () => {
    const before = entries.length;
    const res = await post(EDITOR_USER, PERSON, { text: 'x', visibility: 'members' });
    expect(res.status).toBe(403);
    expect(entries.length).toBe(before);
  });

  test('an admin can create a public entry', async () => {
    const res = await post(ADMIN_USER, PERSON, { text: 'x', visibility: 'public' });
    expect(res.status).toBe(201);
    expect((await res.json()).data.visibility).toBe('public');
  });

  test('a person outside the tree is a 404', async () => {
    expect((await post(ADMIN_USER, FOREIGN_PERSON, { text: 'x' })).status).toBe(404);
  });

  test('writes one encrypted source_entry audit row', async () => {
    const res = await post(ADMIN_USER, PERSON, { text: 'نص الأصل' });
    const { data } = await res.json();
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({ action: 'create', entityType: 'source_entry', entityId: data.id, treeId: MAIN });
    expect(JSON.stringify(auditRows[0].snapshotAfter)).not.toContain('نص الأصل');
  });

  test('does not bump the tree timestamp (sources are not in the tree payload)', async () => {
    await post(ADMIN_USER, PERSON, { text: 'x' });
    expect(mockFamilyTreeUpdate).not.toHaveBeenCalled();
  });

  test('is rate limited', async () => {
    mockRateCheck.mockReturnValue({ allowed: false, retryAfterSeconds: 5 });
    expect((await post(ADMIN_USER, PERSON, { text: 'x' })).status).toBe(429);
  });
});

// ===========================================================================
// PATCH / DELETE sources/[entryId]
// ===========================================================================

describe('PATCH / DELETE sources/[entryId]', () => {
  async function patch(user: { id: string }, entryId: string, body: unknown) {
    as(user);
    const { PATCH } = await entryRoute();
    return PATCH(req(`sources/${entryId}`, 'PATCH', body), ep(entryId));
  }
  async function del(user: { id: string }, entryId: string, body?: unknown) {
    as(user);
    const { DELETE } = await entryRoute();
    return DELETE(req(`sources/${entryId}`, 'DELETE', body), ep(entryId));
  }

  test('nonexistent, malformed, other-tree, other-workspace and tree-wide ids all read the same 404', async () => {
    const results = await Promise.all([
      patch(ADMIN_USER, ABSENT, { text: 'x' }),
      patch(ADMIN_USER, 'nope', { text: 'x' }),
      patch(ADMIN_USER, E_EXTRA, { text: 'x' }), // main tree targeted, entry lives in the extra tree
      patch(ADMIN_USER, E_FOREIGN, { text: 'x' }),
      patch(ADMIN_USER, E_TREE, { text: 'x' }), // tree-wide entry has its own admin route
    ]);
    const bodies = await Promise.all(results.map((r) => r.json()));
    expect(results.map((r) => r.status)).toEqual([404, 404, 404, 404, 404]);
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
  });

  test('an editor cannot edit an entry hidden from them (same 404)', async () => {
    const res = await patch(EDITOR_USER, E_ADMINS, { text: 'x' });
    expect(res.status).toBe(404);
    expect(plainOf(entries.find((e) => e.id === E_ADMINS))).toBe('سجل سري');
  });

  test('an editor cannot edit an entry on a private person', async () => {
    expect((await patch(EDITOR_USER, E_PRIV, { text: 'x' })).status).toBe(404);
  });

  test('an editor edits the text of a visible entry', async () => {
    const res = await patch(EDITOR_USER, E_MEMBERS, { text: 'نص جديد' });
    expect(res.status).toBe(200);
    expect((await res.json()).data.text).toBe('نص جديد');
    expect(plainOf(entries.find((e) => e.id === E_MEMBERS))).toBe('نص جديد');
  });

  test('a non-admin editor cannot change the level', async () => {
    const res = await patch(EDITOR_USER, E_MEMBERS, { visibility: 'admins' });
    expect(res.status).toBe(403);
    expect(entries.find((e) => e.id === E_MEMBERS)?.visibility).toBe('members');
  });

  test('re-sending the current level is not a change', async () => {
    expect((await patch(EDITOR_USER, E_MEMBERS, { text: 'y', visibility: 'members' })).status).toBe(200);
  });

  test('an admin changes the level and the audit row holds before/after', async () => {
    const res = await patch(ADMIN_USER, E_ADMINS, { visibility: 'public' });
    expect(res.status).toBe(200);
    expect(entries.find((e) => e.id === E_ADMINS)?.visibility).toBe('public');
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({ action: 'update', entityType: 'source_entry', entityId: E_ADMINS });
    expect(auditRows[0].snapshotBefore).toBeTruthy();
    expect(auditRows[0].snapshotAfter).toBeTruthy();
  });

  test('treeId targets the extra tree', async () => {
    expect((await patch(ADMIN_USER, E_EXTRA, { treeId: EXTRA, text: 'x' })).status).toBe(200);
  });

  test('an editor deletes a visible entry and an audit row is written', async () => {
    const res = await del(EDITOR_USER, E_MEMBERS);
    expect(res.status).toBe(204);
    expect(entries.some((e) => e.id === E_MEMBERS)).toBe(false);
    expect(auditRows[0]).toMatchObject({ action: 'delete', entityType: 'source_entry', entityId: E_MEMBERS });
  });

  test('an editor cannot delete a hidden entry someone else wrote', async () => {
    expect((await del(EDITOR_USER, E_ADMINS)).status).toBe(404);
    expect(entries.some((e) => e.id === E_ADMINS)).toBe(true);
  });

  test('an editor can delete an admins-level entry they wrote (undo of their own create)', async () => {
    expect((await del(EDITOR_USER, E_MINE_ADMINS)).status).toBe(204);
  });

  test('another workspace\'s entry is a 404 and untouched', async () => {
    expect((await del(ADMIN_USER, E_FOREIGN)).status).toBe(404);
    expect(entries.some((e) => e.id === E_FOREIGN)).toBe(true);
  });

  test('does not bump the tree timestamp', async () => {
    await patch(ADMIN_USER, E_MEMBERS, { text: 'x' });
    await del(ADMIN_USER, E_MEMBERS);
    expect(mockFamilyTreeUpdate).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Tree-wide entry
// ===========================================================================

describe('sources/tree-entry', () => {
  async function call(user: { id: string }, method: 'GET' | 'PUT' | 'DELETE', body?: unknown, query = '') {
    as(user);
    const mod = await treeEntryRoute();
    return mod[method](req(`sources/tree-entry${query}`, method, body), wp);
  }

  test('a member sees a members-level tree entry', async () => {
    const res = await call(MEMBER_USER, 'GET');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect((await res.json()).data.entry.text).toBe('مشجرة العائلة');
  });

  test('a member does not see an admins-level tree entry', async () => {
    entries.find((e) => e.id === E_TREE)!.visibility = 'admins';
    expect((await (await call(MEMBER_USER, 'GET')).json()).data.entry).toBeNull();
  });

  test('PUT is admin only', async () => {
    expect((await call(EDITOR_USER, 'PUT', { text: 'x', visibility: 'admins' })).status).toBe(403);
  });

  test('PUT updates the existing entry instead of adding a second one', async () => {
    const res = await call(ADMIN_USER, 'PUT', { text: 'نسخة ثانية', visibility: 'public' });
    expect(res.status).toBe(200);
    const treeWide = entries.filter((e) => e.treeId === MAIN && e.individualId === null);
    expect(treeWide).toHaveLength(1);
    expect(treeWide[0].id).toBe(E_TREE);
    expect(plainOf(treeWide[0])).toBe('نسخة ثانية');
    expect(auditRows[0]).toMatchObject({ action: 'update', entityType: 'source_entry' });
  });

  test('PUT creates the entry when the tree has none', async () => {
    entries = entries.filter((e) => e.id !== E_TREE);
    const res = await call(ADMIN_USER, 'PUT', { text: 'جديد', visibility: 'members' });
    expect(res.status).toBe(201);
    const treeWide = entries.filter((e) => e.treeId === MAIN && e.individualId === null);
    expect(treeWide).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({ action: 'create', entityType: 'source_entry' });
  });

  test('DELETE is admin only', async () => {
    expect((await call(EDITOR_USER, 'DELETE')).status).toBe(403);
  });

  test('DELETE removes the tree entry; a second DELETE is a 404', async () => {
    expect((await call(ADMIN_USER, 'DELETE')).status).toBe(204);
    expect(entries.some((e) => e.id === E_TREE)).toBe(false);
    expect((await call(ADMIN_USER, 'DELETE')).status).toBe(404);
  });
});

// ===========================================================================
// «المصادر» page list
// ===========================================================================

describe('GET sources (admin list)', () => {
  async function list(user: { id: string }, query = '') {
    as(user);
    const { GET } = await listRoute();
    return GET(req(`sources${query}`), wp);
  }

  test('is admin only', async () => {
    expect((await list(EDITOR_USER)).status).toBe(403);
  });

  test('lists every entry of the resolved tree only, with the person name', async () => {
    const res = await list(ADMIN_USER);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    const json = await res.json();
    const ids = json.data.entries.map((e: Row) => e.id);
    expect(ids.sort()).toEqual([E_ADMINS, E_MEMBERS, E_PRIV, E_TREE, E_MINE_ADMINS].sort());
    const priv = json.data.entries.find((e: Row) => e.id === E_PRIV);
    expect(priv).toMatchObject({ individualId: PRIV, personName: 'سرّي', fileCount: 0 });
    expect(json.data.entries.find((e: Row) => e.id === E_MEMBERS).personName).toBe('محمد السعيد');
    expect(hasBytesOrUndefined(json)).toBe(false);
  });

  test('search ignores diacritics', async () => {
    const json = await (await list(ADMIN_USER, `?q=${encodeURIComponent('طَبَقَات')}`)).json();
    expect(json.data.entries.map((e: Row) => e.id)).toEqual([E_MEMBERS]);
  });

  test('filters by level', async () => {
    const json = await (await list(ADMIN_USER, '?visibility=admins')).json();
    expect(json.data.entries.map((e: Row) => e.id).sort()).toEqual([E_ADMINS, E_MINE_ADMINS].sort());
  });

  test('paginates, and matchedIds covers every match for «تحديد الكل»', async () => {
    const page1 = (await (await list(ADMIN_USER, '?limit=2')).json()).data;
    expect(page1.entries).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.matchedIds).toHaveLength(5);
    expect(page1.nextCursor).not.toBeNull();
    const page3 = (await (await list(ADMIN_USER, `?limit=2&cursor=4`)).json()).data;
    expect(page3.entries).toHaveLength(1);
    expect(page3.nextCursor).toBeNull();
  });
});

// ===========================================================================
// Bulk
// ===========================================================================

describe('POST sources/bulk', () => {
  async function bulk(user: { id: string }, body: unknown) {
    as(user);
    const { POST } = await bulkRoute();
    return POST(req('sources/bulk', 'POST', body), wp);
  }

  test('is admin only', async () => {
    expect((await bulk(EDITOR_USER, { ids: [E_MEMBERS], action: 'delete' })).status).toBe(403);
  });

  test('setVisibility touches only ids in the resolved tree', async () => {
    const res = await bulk(ADMIN_USER, {
      ids: [E_ADMINS, E_MEMBERS, E_FOREIGN, E_EXTRA, ABSENT],
      action: 'setVisibility',
      visibility: 'public',
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ updated: 2 });
    expect(entries.find((e) => e.id === E_ADMINS)?.visibility).toBe('public');
    expect(entries.find((e) => e.id === E_FOREIGN)?.visibility).toBe('public'); // seeded public, untouched
    expect(entries.find((e) => e.id === E_EXTRA)?.visibility).toBe('members');
  });

  test('delete touches only ids in the resolved tree', async () => {
    const res = await bulk(ADMIN_USER, { ids: [E_ADMINS, E_FOREIGN, E_EXTRA], action: 'delete' });
    expect((await res.json()).data).toEqual({ deleted: 1 });
    expect(entries.some((e) => e.id === E_FOREIGN)).toBe(true);
    expect(entries.some((e) => e.id === E_EXTRA)).toBe(true);
    expect(entries.some((e) => e.id === E_ADMINS)).toBe(false);
  });

  test('writes one summary audit row', async () => {
    await bulk(ADMIN_USER, { ids: [E_ADMINS, E_MEMBERS], action: 'delete' });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({ action: 'delete', entityType: 'source_entry', entityId: MAIN });
  });

  test('an all-foreign id list answers 0 and writes no audit row', async () => {
    const res = await bulk(ADMIN_USER, { ids: [E_FOREIGN], action: 'delete' });
    expect((await res.json()).data).toEqual({ deleted: 0 });
    expect(auditRows).toHaveLength(0);
  });
});

// ===========================================================================
// Suggestions
// ===========================================================================

describe('GET sources/suggestions', () => {
  async function suggest(user: { id: string }, q: string) {
    as(user);
    const { GET } = await suggestionsRoute();
    return GET(req(`sources/suggestions?q=${encodeURIComponent(q)}`), wp);
  }

  test('a plain member (no tree_editor) is refused', async () => {
    expect((await suggest(MEMBER_USER, 'ت')).status).toBe(403);
  });

  test('returns plain strings only', async () => {
    const json = await (await suggest(ADMIN_USER, '')).json();
    expect(json.data.suggestions.every((s: unknown) => typeof s === 'string')).toBe(true);
  });

  test('is workspace-scoped: other trees of the workspace yes, other workspaces no', async () => {
    const json = await (await suggest(ADMIN_USER, '')).json();
    expect(json.data.suggestions).toContain('تاريخ الطبري');
    expect(json.data.suggestions).not.toContain('مصدر غريب');
  });

  test('a non-admin editor is only offered texts they may see', async () => {
    const json = await (await suggest(EDITOR_USER, '')).json();
    expect(json.data.suggestions).not.toContain('سجل سري');
    expect(json.data.suggestions).not.toContain('وثيقة خاصة');
    expect(json.data.suggestions).toContain('طبقات ابن سعد، ص ٩٠');
  });

  test('matches diacritic-insensitively and dedupes', async () => {
    entries.push(entry('eeeeeeee-0000-4000-8000-000000000010', MAIN, PERSON_BARE, 'members', 'طبقات ابن سعد، ص ٩٠'));
    const json = await (await suggest(ADMIN_USER, 'طَبَقَات')).json();
    expect(json.data.suggestions).toEqual(['طبقات ابن سعد، ص ٩٠']);
  });

  test('caps at 10', async () => {
    for (let i = 0; i < 15; i += 1) {
      entries.push(entry(`eeeeeeee-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`, MAIN, PERSON, 'members', `كتاب ${i}`));
    }
    const json = await (await suggest(ADMIN_USER, 'كتاب')).json();
    expect(json.data.suggestions).toHaveLength(10);
  });
});

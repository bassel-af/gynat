// @vitest-environment node
/**
 * Sources («المصادر») step 5 — file upload, attach, serve and delete.
 *
 * Real route handlers over an in-memory Prisma fake (with transaction
 * rollback, so "the whole request fails" is observable), REAL multipart
 * requests (FormData), REAL sharp and REAL AES-GCM under a fixed workspace key.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { encryptField, decryptField, decryptBytes, encryptBytes } from '@/lib/crypto/workspace-encryption';
import { decryptSnapshot } from '@/lib/tree/encryption';
import { decryptAuditPayload } from '@/lib/tree/audit';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// The fake is built below; the hoisted holder lets vi.mock reference it.
const dbHolder = vi.hoisted(() => ({ prisma: {} as Record<string, unknown> }));
vi.mock('@/lib/db', () => dbHolder);

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

const mockMutateCheck = vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 }));
const mockUploadCheck = vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 }));
vi.mock('@/lib/api/rate-limit', () => ({
  treeMutateLimiter: { check: (...a: unknown[]) => mockMutateCheck(...(a as [])) },
  sourceUploadLimiter: { check: (...a: unknown[]) => mockUploadCheck(...(a as [])) },
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
    getWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 9)),
    getOrCreateWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 9)),
  };
});

const KEY = Buffer.alloc(32, 9);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WS = 'ws-files-1';
const OTHER_WS = 'ws-files-2';
const MAIN = 'bbbbbbbb-1111-4111-9111-111111111111';
const EXTRA = 'bbbbbbbb-2222-4222-9222-222222222222';
const FOREIGN_TREE = 'bbbbbbbb-3333-4333-9333-333333333333';

const PERSON = 'cccccccc-0000-4000-8000-000000000001';
const PRIV = 'cccccccc-0000-4000-8000-000000000002';
const EXTRA_PERSON = 'cccccccc-0000-4000-8000-000000000003';
const FOREIGN_PERSON = 'cccccccc-0000-4000-8000-000000000004';
const PERSON_2 = 'cccccccc-0000-4000-8000-000000000005';

const E_ADMINS = 'eeeeeeee-0000-4000-8000-000000000001';
const E_MEMBERS = 'eeeeeeee-0000-4000-8000-000000000002';
const E_PRIV = 'eeeeeeee-0000-4000-8000-000000000003';
const E_EXTRA = 'eeeeeeee-0000-4000-8000-000000000004';
const E_FOREIGN = 'eeeeeeee-0000-4000-8000-000000000005';
const E_TREE = 'eeeeeeee-0000-4000-8000-000000000006';
const E_TEXT_ONLY = 'eeeeeeee-0000-4000-8000-000000000007';
const E_FILE_ONLY = 'eeeeeeee-0000-4000-8000-000000000008';
const E_EDITOR_OWN = 'eeeeeeee-0000-4000-8000-000000000009';

const F_ADMINS = 'ffffffff-0000-4000-8000-000000000001';
const F_MEMBERS = 'ffffffff-0000-4000-8000-000000000002';
const F_MEMBERS_PDF = 'ffffffff-0000-4000-8000-000000000003';
const F_PRIV = 'ffffffff-0000-4000-8000-000000000004';
const F_EXTRA = 'ffffffff-0000-4000-8000-000000000005';
const F_FOREIGN = 'ffffffff-0000-4000-8000-000000000006';
const F_TREE = 'ffffffff-0000-4000-8000-000000000007';
const F_FILE_ONLY = 'ffffffff-0000-4000-8000-000000000008';
const F_STAGED_EDITOR = 'ffffffff-0000-4000-8000-000000000009';
const F_STAGED_ADMIN = 'ffffffff-0000-4000-8000-00000000000a';
const F_STAGED_OLD = 'ffffffff-0000-4000-8000-00000000000b';
const F_STAGED_EXTRA = 'ffffffff-0000-4000-8000-00000000000c';
const F_EDITOR_OWN = 'ffffffff-0000-4000-8000-00000000000d';
const ABSENT = 'ffffffff-0000-4000-8000-0000000000ff';

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

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]);
const PDF_BYTES = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n', 'latin1');

let quotaBytes = 5 * 1024 * 1024 * 1024;
let individuals: Row[] = [];
let entries: Row[] = [];
/** Shared-source model: `source_links` (a person entry = a source with ONE link). */
let links: Row[] = [];
let files: Row[] = [];
let fileData: Row[] = [];
const auditRows: Row[] = [];
const rawSql: string[] = [];
const dataReads: string[] = [];

const enc = (s: string) => encryptField(s, KEY);
const HOUR = 60 * 60 * 1000;

function seed() {
  individuals = [
    { id: PERSON, treeId: MAIN, isPrivate: false },
    { id: PERSON_2, treeId: MAIN, isPrivate: false },
    { id: PRIV, treeId: MAIN, isPrivate: true },
    { id: EXTRA_PERSON, treeId: EXTRA, isPrivate: false },
    { id: FOREIGN_PERSON, treeId: FOREIGN_TREE, isPrivate: false },
  ];
  links = [];
  const e = (id: string, treeId: string, individualId: string | null, visibility: string, text: string | null, createdById = 'u-admin'): Row => {
    if (individualId !== null) links.push({ sourceId: id, individualId, treeId, createdById, createdAt: new Date(Date.UTC(2026, 0, 1)) });
    return {
      id, treeId, isTreeWide: individualId === null, visibility, text: text === null ? null : enc(text), createdById,
      createdAt: new Date(Date.UTC(2026, 0, 1)), updatedAt: new Date(Date.UTC(2026, 0, 1)),
    };
  };
  entries = [
    e(E_ADMINS, MAIN, PERSON, 'admins', 'سري'),
    e(E_MEMBERS, MAIN, PERSON, 'members', 'طبقات'),
    e(E_PRIV, MAIN, PRIV, 'members', 'خاص'),
    e(E_EXTRA, EXTRA, EXTRA_PERSON, 'members', 'إضافي'),
    e(E_FOREIGN, FOREIGN_TREE, FOREIGN_PERSON, 'public', 'غريب'),
    e(E_TREE, MAIN, null, 'members', null),
    e(E_TEXT_ONLY, MAIN, PERSON_2, 'members', 'نص فقط'),
    e(E_FILE_ONLY, MAIN, PERSON_2, 'members', null),
    e(E_EDITOR_OWN, MAIN, PERSON_2, 'admins', null, 'u-editor'),
  ];
  files = [];
  fileData = [];
  const f = (id: string, entryId: string | null, treeId: string, mimeType = 'image/jpeg', createdById = 'u-admin', ageMs = 0, bytes = JPEG_BYTES, name = 'وثيقة.jpg') => {
    files.push({
      id, entryId, treeId, mimeType, sizeBytes: bytes.length, fileName: enc(name), createdById,
      createdAt: new Date(Date.now() - ageMs),
    });
    fileData.push({ id: `d-${id}`, fileId: id, data: encryptBytes(bytes, KEY) });
  };
  f(F_ADMINS, E_ADMINS, MAIN);
  f(F_MEMBERS, E_MEMBERS, MAIN);
  f(F_MEMBERS_PDF, E_MEMBERS, MAIN, 'application/pdf', 'u-admin', 0, PDF_BYTES, 'سجل.pdf');
  f(F_PRIV, E_PRIV, MAIN);
  f(F_EXTRA, E_EXTRA, EXTRA);
  f(F_FOREIGN, E_FOREIGN, FOREIGN_TREE);
  f(F_TREE, E_TREE, MAIN);
  f(F_FILE_ONLY, E_FILE_ONLY, MAIN);
  f(F_EDITOR_OWN, E_EDITOR_OWN, MAIN, 'image/jpeg', 'u-editor');
  f(F_STAGED_EDITOR, null, MAIN, 'image/jpeg', 'u-editor');
  f(F_STAGED_ADMIN, null, MAIN, 'image/jpeg', 'u-admin');
  f(F_STAGED_OLD, null, MAIN, 'image/jpeg', 'u-editor', 25 * HOUR);
  f(F_STAGED_EXTRA, null, EXTRA, 'image/jpeg', 'u-editor');
}

// --- where-matcher -----------------------------------------------------------

function matches(row: Row | null | undefined, where: Row | undefined): boolean {
  if (!where) return true;
  if (!row) return false;
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'tree') {
      if (!matches(TREES.find((t) => t.id === row.treeId), cond as Row)) return false;
      continue;
    }
    if (key === 'entry') {
      if (!matches(entries.find((e) => e.id === row.entryId), cond as Row)) return false;
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
      if ('not' in c && (c.not === null ? value === null || value === undefined : value === c.not)) return false;
      if ('lt' in c && !((value as Date) < (c.lt as Date))) return false;
      if ('gte' in c && !((value as Date) >= (c.gte as Date))) return false;
      continue;
    }
    if (cond === null ? value !== null && value !== undefined : value !== cond) return false;
  }
  return true;
}

function fileMeta(f: Row): Row {
  return { id: f.id, mimeType: f.mimeType, sizeBytes: f.sizeBytes, fileName: f.fileName };
}

function entryJoined(e: Row): Row {
  const own = files.filter((f) => f.entryId === e.id);
  return {
    ...e,
    links: links
      .filter((l) => l.sourceId === e.id)
      .map((l) => ({ ...l, individual: individuals.find((i) => i.id === l.individualId) ?? null })),
    files: own.map(fileMeta),
    _count: { files: own.length },
  };
}

function deleteFilesWhere(pred: (f: Row) => boolean): number {
  const gone = files.filter(pred).map((f) => f.id);
  files = files.filter((f) => !gone.includes(f.id));
  fileData = fileData.filter((d) => !gone.includes(d.fileId as string));
  return gone.length;
}

let createCounter = 0;
const newId = (prefix: string) => {
  createCounter += 1;
  return `${prefix}-0000-4000-8000-${String(createCounter).padStart(12, '0')}`;
};

const fake: Row = {
  workspaceMembership: {
    findUnique: async ({ where }: { where: { userId_workspaceId: { userId: string; workspaceId: string } } }) => {
      const { userId, workspaceId } = where.userId_workspaceId;
      const m = workspaceId === WS ? MEMBERSHIPS[userId] : undefined;
      return m ? { userId, workspaceId, ...m } : null;
    },
  },
  workspace: {
    findUnique: async () => ({ storageQuotaBytes: BigInt(quotaBytes) }),
  },
  familyTree: {
    findFirst: async ({ where }: { where: Row }) => {
      const t = TREES.find((tree) => matches(tree, where));
      return t ? { id: t.id } : null;
    },
  },
  individual: {
    findFirst: async ({ where }: { where: Row }) => individuals.find((i) => matches(i, where)) ?? null,
    findMany: async ({ where }: { where: Row }) =>
      individuals.filter((i) => matches(i, where)).map((i) => ({ id: i.id, isPrivate: i.isPrivate })),
  },
  sourceEntry: {
    findFirst: async ({ where }: { where: Row }) => {
      const hit = entries.find((e) => matches(e, where));
      return hit ? entryJoined(hit) : null;
    },
    findMany: async ({ where }: { where: Row }) => entries.filter((e) => matches(e, where)).map(entryJoined),
    create: async ({ data }: { data: Row }) => {
      const row: Row = {
        id: newId('aaaaaaaa'), isTreeWide: false, visibility: 'admins', text: null,
        createdAt: new Date(), updatedAt: new Date(), ...data,
      };
      entries.push(row);
      return entryJoined(row);
    },
    update: async ({ where, data }: { where: Row; data: Row }) => {
      const row = entries.find((e) => matches(e, where));
      if (!row) throw Object.assign(new Error('nf'), { code: 'P2025' });
      Object.assign(row, data, { updatedAt: new Date() });
      return entryJoined(row);
    },
    delete: async ({ where }: { where: Row }) => {
      const row = entries.find((e) => matches(e, where));
      if (!row) throw Object.assign(new Error('nf'), { code: 'P2025' });
      entries = entries.filter((e) => e !== row);
      links = links.filter((l) => l.sourceId !== row.id); // FK cascade
      deleteFilesWhere((f) => f.entryId === row.id); // FK cascade
      return row;
    },
  },
  sourceLink: {
    create: async ({ data }: { data: Row }) => {
      const row = { createdAt: new Date(), ...data };
      links.push(row);
      return row;
    },
    createMany: async ({ data }: { data: Row[] }) => {
      data.forEach((d) => links.push({ createdAt: new Date(), ...d }));
      return { count: data.length };
    },
  },
  sourceFile: {
    findFirst: async ({ where }: { where: Row }) => {
      const hit = files.find((f) => matches(f, where));
      if (!hit) return null;
      const entry = entries.find((e) => e.id === hit.entryId);
      return { ...hit, entry: entry ? entryJoined(entry) : null };
    },
    findMany: async ({ where }: { where: Row }) => files.filter((f) => matches(f, where)).map(fileMeta),
    count: async ({ where }: { where: Row }) => files.filter((f) => matches(f, where)).length,
    aggregate: async ({ where }: { where: Row }) => ({
      _sum: { sizeBytes: files.filter((f) => matches(f, where)).reduce((s, f) => s + (f.sizeBytes as number), 0) || null },
    }),
    create: async ({ data }: { data: Row }) => {
      const { data: nested, ...rest } = data as { data?: { create: { data: Buffer } } } & Row;
      const row: Row = { id: newId('dddddddd'), entryId: null, createdAt: new Date(), ...rest };
      files.push(row);
      if (nested) fileData.push({ id: `d-${row.id}`, fileId: row.id, data: nested.create.data });
      return fileMeta(row);
    },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const hit = files.filter((f) => matches(f, where));
      hit.forEach((f) => Object.assign(f, data));
      return { count: hit.length };
    },
    delete: async ({ where }: { where: Row }) => {
      const row = files.find((f) => matches(f, where));
      if (!row) throw Object.assign(new Error('nf'), { code: 'P2025' });
      deleteFilesWhere((f) => f.id === row.id);
      return row;
    },
    deleteMany: async ({ where }: { where: Row }) => ({ count: deleteFilesWhere((f) => matches(f, where)) }),
  },
  sourceFileData: {
    findUnique: async ({ where }: { where: { fileId: string } }) => {
      dataReads.push(where.fileId);
      return fileData.find((d) => d.fileId === where.fileId) ?? null;
    },
  },
  treeEditLog: {
    create: async ({ data }: { data: Row }) => {
      auditRows.push(data);
      return data;
    },
  },
  $queryRaw: async (strings: TemplateStringsArray) => {
    rawSql.push(strings.join('?'));
    return [];
  },
};
// All-or-nothing: restore every table when the callback throws.
fake.$transaction = async (fn: (tx: Row) => Promise<unknown>) => {
  const snap = {
    entries: entries.map((r) => ({ ...r })),
    links: links.map((r) => ({ ...r })),
    files: files.map((r) => ({ ...r })),
    fileData: [...fileData],
    audit: auditRows.length,
  };
  try {
    return await fn(fake);
  } catch (error) {
    entries = snap.entries;
    links = snap.links;
    files = snap.files;
    fileData = snap.fileData;
    auditRows.length = snap.audit;
    throw error;
  }
};

Object.assign(dbHolder.prisma, fake);

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

function as(user: { id: string } | null) {
  if (user) mockGetUser.mockResolvedValue({ data: { user }, error: null });
  else mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'no' } });
}

const base = `http://localhost:4000/api/workspaces/${WS}/tree`;

function jsonReq(p: string, method: string, body?: unknown) {
  return new NextRequest(`${base}/${p}`, {
    method,
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/** A real multipart request, with the Content-Length a browser would send. */
async function uploadReq(
  parts: { name: string; bytes: Buffer; type?: string }[],
  opts: { query?: string; contentLength?: string | null } = {},
) {
  const form = new FormData();
  for (const p of parts) form.append('file', new Blob([new Uint8Array(p.bytes)], { type: p.type ?? '' }), p.name);
  const encoded = new Request('http://x', { method: 'POST', body: form });
  const body = Buffer.from(await encoded.arrayBuffer());
  const headers: Record<string, string> = {
    authorization: 'Bearer t',
    'content-type': encoded.headers.get('content-type')!,
  };
  const cl = opts.contentLength === undefined ? String(body.length) : opts.contentLength;
  if (cl !== null) headers['content-length'] = cl;
  return new NextRequest(`${base}/sources/uploads${opts.query ?? ''}`, { method: 'POST', headers, body });
}

const uploadRoute = () => import('@/app/api/workspaces/[id]/tree/sources/uploads/route');
const fileRoute = () => import('@/app/api/workspaces/[id]/tree/sources/[entryId]/files/[fileId]/route');
const personRoute = () => import('@/app/api/workspaces/[id]/tree/individuals/[individualId]/sources/route');
const entryRoute = () => import('@/app/api/workspaces/[id]/tree/sources/[entryId]/route');
const treeEntryRoute = () => import('@/app/api/workspaces/[id]/tree/sources/tree-entry/route');
const listRoute = () => import('@/app/api/workspaces/[id]/tree/sources/route');

const wp = { params: Promise.resolve({ id: WS }) };
const fp = (entryId: string, fileId: string) => ({ params: Promise.resolve({ id: WS, entryId, fileId }) });
const pp = (individualId: string) => ({ params: Promise.resolve({ id: WS, individualId }) });
const ep = (entryId: string) => ({ params: Promise.resolve({ id: WS, entryId }) });

async function upload(parts: Parameters<typeof uploadReq>[0], opts?: Parameters<typeof uploadReq>[1]) {
  const { POST } = await uploadRoute();
  return POST(await uploadReq(parts, opts), wp);
}

async function serve(entryId: string, fileId: string, query = '') {
  const { GET } = await fileRoute();
  return GET(new NextRequest(`${base}/sources/${entryId}/files/${fileId}${query}`, { headers: { authorization: 'Bearer t' } }), fp(entryId, fileId));
}

async function removeFile(entryId: string, fileId: string, body: unknown = {}) {
  const { DELETE } = await fileRoute();
  return DELETE(jsonReq(`sources/${entryId}/files/${fileId}`, 'DELETE', body), fp(entryId, fileId));
}

async function gpsJpeg(): Promise<Buffer> {
  return sharp({ create: { width: 30, height: 20, channels: 3, background: '#a00' } })
    .jpeg()
    .withExif({ IFD0: { Make: 'SecretCam' }, IFD3: { GPSLatitudeRef: 'N', GPSMapDatum: 'SECRET-GPS-DATUM' } })
    .toBuffer();
}

const fileRow = (id: string) => files.find((f) => f.id === id);

beforeEach(() => {
  vi.clearAllMocks();
  mockMutateCheck.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
  mockUploadCheck.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
  quotaBytes = 5 * 1024 * 1024 * 1024;
  seed();
  auditRows.length = 0;
  rawSql.length = 0;
  dataReads.length = 0;
  createCounter = 0;
});

// ===========================================================================
// POST sources/uploads
// ===========================================================================

describe('POST sources/uploads', () => {
  test('a plain member (no tree_editor) is refused', async () => {
    as(MEMBER_USER);
    expect((await upload([{ name: 'a.jpg', bytes: await gpsJpeg() }])).status).toBe(403);
  });

  test('stages a JPEG: EXIF/GPS gone, bytes encrypted at rest, owned by the uploader', async () => {
    as(EDITOR_USER);
    const res = await upload([{ name: '../../صورة.jpg', bytes: await gpsJpeg(), type: 'image/jpeg' }]);
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data).toMatchObject({ mimeType: 'image/jpeg', fileName: 'صورة.jpg' });

    const row = fileRow(data.id)!;
    expect(row.entryId).toBeNull();
    expect(row.createdById).toBe('u-editor');
    expect(row.treeId).toBe(MAIN);
    expect(decryptField(Buffer.from(row.fileName as Buffer), KEY)).toBe('صورة.jpg');

    const stored = fileData.find((d) => d.fileId === data.id)!.data as Buffer;
    expect(stored.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(false); // ciphertext
    const plain = decryptBytes(stored, KEY);
    expect(plain.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(true);
    expect(plain.includes('SECRET-GPS-DATUM')).toBe(false);
    expect(plain.includes('SecretCam')).toBe(false);
    expect(row.sizeBytes).toBe(plain.length);
    expect(data.sizeBytes).toBe(plain.length);
  });

  test('the type comes from the bytes, not the browser MIME or the name', async () => {
    as(EDITOR_USER);
    const res = await upload([{ name: 'x.pdf', bytes: await gpsJpeg(), type: 'application/pdf' }]);
    const { data } = await res.json();
    expect(data.mimeType).toBe('image/jpeg');
    expect(data.fileName).toBe('x.pdf.jpg');
  });

  test('an image MIME with SVG bytes is refused', async () => {
    as(EDITOR_USER);
    const res = await upload([{ name: 'a.jpg', type: 'image/jpeg', bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') }]);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/نوع الملف غير مدعوم/);
  });

  test('HTML is refused', async () => {
    as(EDITOR_USER);
    const res = await upload([{ name: 'a.png', type: 'image/png', bytes: Buffer.from('<html><script>x</script></html>') }]);
    expect(res.status).toBe(400);
  });

  test('a PDF with /JavaScript is refused', async () => {
    as(EDITOR_USER);
    const res = await upload([{ name: 'a.pdf', bytes: Buffer.from('%PDF-1.4\n<< /S /JavaScript /JS (app.alert(1)) >>\n%%EOF') }]);
    expect(res.status).toBe(400);
  });

  test('a clean PDF is stored byte-for-byte', async () => {
    as(EDITOR_USER);
    const res = await upload([{ name: 'سجل.pdf', bytes: PDF_BYTES }]);
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(decryptBytes(fileData.find((d) => d.fileId === data.id)!.data as Buffer, KEY).equals(PDF_BYTES)).toBe(true);
  });

  test('an oversized Content-Length is refused BEFORE the body is read', async () => {
    as(EDITOR_USER);
    const { POST } = await uploadRoute();
    const req = await uploadReq([{ name: 'a.pdf', bytes: PDF_BYTES }], { contentLength: String(20 * 1024 * 1024) });
    const formSpy = vi.spyOn(req, 'formData');
    const res = await POST(req, wp);
    expect(res.status).toBe(413);
    expect(formSpy).not.toHaveBeenCalled();
    expect(req.bodyUsed).toBe(false);
  });

  test('a missing Content-Length is refused (411)', async () => {
    as(EDITOR_USER);
    const res = await upload([{ name: 'a.pdf', bytes: PDF_BYTES }], { contentLength: null });
    expect(res.status).toBe(411);
  });

  test('a file over 8 MB is refused by its real length', async () => {
    as(EDITOR_USER);
    const big = Buffer.concat([PDF_BYTES, Buffer.alloc(8 * 1024 * 1024)]);
    const res = await upload([{ name: 'a.pdf', bytes: big }]);
    expect(res.status).toBe(413);
    expect(files.some((f) => f.sizeBytes === big.length)).toBe(false);
  });

  test('two files in one request are refused', async () => {
    as(EDITOR_USER);
    const res = await upload([{ name: 'a.pdf', bytes: PDF_BYTES }, { name: 'b.pdf', bytes: PDF_BYTES }]);
    expect(res.status).toBe(400);
  });

  test('a request without a file is refused', async () => {
    as(EDITOR_USER);
    expect((await upload([])).status).toBe(400);
  });

  test('a pixel bomb is refused', async () => {
    as(EDITOR_USER);
    const bomb = await sharp({ create: { width: 8000, height: 7000, channels: 3, background: '#000' } }).png({ compressionLevel: 9 }).toBuffer();
    expect((await upload([{ name: 'bomb.png', bytes: bomb }])).status).toBe(400);
  }, 30_000);

  test('the workspace storage quota is enforced (413, nothing stored)', async () => {
    as(EDITOR_USER);
    files = files.filter((f) => f.id !== F_STAGED_OLD); // the sweep would free it first
    const used = files.filter((f) => TREES.find((t) => t.id === f.treeId)?.workspaceId === WS)
      .reduce((s, f) => s + (f.sizeBytes as number), 0);
    quotaBytes = used + PDF_BYTES.length - 1;
    const before = files.length;
    const res = await upload([{ name: 'a.pdf', bytes: PDF_BYTES }]);
    expect(res.status).toBe(413);
    expect(files.length).toBe(before);
  });

  test('the quota ignores other workspaces and locks the workspace row', async () => {
    as(EDITOR_USER);
    files = files.filter((f) => f.id !== F_STAGED_OLD); // the sweep would free it first
    const used = files.filter((f) => TREES.find((t) => t.id === f.treeId)?.workspaceId === WS)
      .reduce((s, f) => s + (f.sizeBytes as number), 0);
    quotaBytes = used + PDF_BYTES.length; // exactly fits
    expect((await upload([{ name: 'a.pdf', bytes: PDF_BYTES }])).status).toBe(201);
    expect(rawSql.some((s) => /FROM workspaces WHERE id = .* FOR UPDATE/.test(s))).toBe(true);
  });

  test('abandoned staged uploads older than 24 h are swept at upload', async () => {
    as(EDITOR_USER);
    const oldAttached = { ...fileRow(F_MEMBERS)!, createdAt: new Date(Date.now() - 48 * HOUR) };
    Object.assign(fileRow(F_MEMBERS)!, oldAttached);
    await upload([{ name: 'a.pdf', bytes: PDF_BYTES }]);
    expect(fileRow(F_STAGED_OLD)).toBeUndefined();
    expect(fileData.some((d) => d.fileId === F_STAGED_OLD)).toBe(false);
    expect(fileRow(F_STAGED_EDITOR)).toBeDefined(); // fresh staged stays
    expect(fileRow(F_MEMBERS)).toBeDefined(); // attached stays, however old
  });

  test('treeId targets the extra tree; another workspace\'s tree is a 404', async () => {
    as(EDITOR_USER);
    const ok = await upload([{ name: 'a.pdf', bytes: PDF_BYTES }], { query: `?treeId=${EXTRA}` });
    expect(fileRow((await ok.json()).data.id)!.treeId).toBe(EXTRA);
    expect((await upload([{ name: 'a.pdf', bytes: PDF_BYTES }], { query: `?treeId=${FOREIGN_TREE}` })).status).toBe(404);
  });

  test('is rate limited by the upload limiter', async () => {
    as(EDITOR_USER);
    mockUploadCheck.mockReturnValue({ allowed: false, retryAfterSeconds: 60 });
    expect((await upload([{ name: 'a.pdf', bytes: PDF_BYTES }])).status).toBe(429);
  });

  test('writes no audit row (a staged file is not part of the tree yet)', async () => {
    as(EDITOR_USER);
    await upload([{ name: 'a.pdf', bytes: PDF_BYTES }]);
    expect(auditRows).toHaveLength(0);
  });
});

// ===========================================================================
// Attaching staged files (entry create / PATCH / tree-entry PUT)
// ===========================================================================

describe('attaching staged files', () => {
  // Shared sources (R2): created by `POST sources` with the person in `personIds`.
  async function createOn(individualId: string, body: Record<string, unknown>) {
    const { POST } = await listRoute();
    return POST(jsonReq('sources', 'POST', { ...body, personIds: [individualId] }), wp);
  }

  test('a file-only entry is created with the file attached', async () => {
    as(EDITOR_USER);
    const res = await createOn(PERSON, { fileIds: [F_STAGED_EDITOR] });
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.text).toBeNull();
    expect(data.files).toEqual([{ id: F_STAGED_EDITOR, mimeType: 'image/jpeg', sizeBytes: JPEG_BYTES.length, fileName: 'وثيقة.jpg' }]);
    expect(fileRow(F_STAGED_EDITOR)!.entryId).toBe(data.id);
  });

  test('only the uploader\'s own staged files attach — the whole request fails otherwise', async () => {
    as(EDITOR_USER);
    const before = entries.length;
    const res = await createOn(PERSON, { text: 'x', fileIds: [F_STAGED_EDITOR, F_STAGED_ADMIN] });
    expect(res.status).toBe(400);
    expect(entries.length).toBe(before); // rolled back
    expect(fileRow(F_STAGED_EDITOR)!.entryId).toBeNull();
    expect(fileRow(F_STAGED_ADMIN)!.entryId).toBeNull();
  });

  test('an already attached, expired or other-tree file does not attach', async () => {
    as(EDITOR_USER);
    for (const id of [F_EDITOR_OWN, F_STAGED_OLD, F_STAGED_EXTRA, ABSENT]) {
      expect((await createOn(PERSON, { text: 'x', fileIds: [id] })).status).toBe(400);
    }
    expect(fileRow(F_EDITOR_OWN)!.entryId).toBe(E_EDITOR_OWN);
  });

  test('the create audit row carries file metadata only — never the file name', async () => {
    as(EDITOR_USER);
    await createOn(PERSON, { fileIds: [F_STAGED_EDITOR] });
    const row = auditRows[auditRows.length - 1];
    const after = decryptSnapshot<Row>(row.snapshotAfter, KEY)!;
    expect(after.fileCount).toBe(1);
    const payload = decryptAuditPayload(row.payload as Buffer, KEY) as Row;
    expect(payload).toEqual({ filesAdded: [{ mimeType: 'image/jpeg', sizeBytes: JPEG_BYTES.length }] });
    expect(JSON.stringify([after, payload])).not.toContain('وثيقة');
  });

  test('PATCH attaches files to a visible entry', async () => {
    as(EDITOR_USER);
    const { PATCH } = await entryRoute();
    const res = await PATCH(jsonReq(`sources/${E_TEXT_ONLY}`, 'PATCH', { fileIds: [F_STAGED_EDITOR] }), ep(E_TEXT_ONLY));
    expect(res.status).toBe(200);
    expect((await res.json()).data.files.map((f: Row) => f.id)).toEqual([F_STAGED_EDITOR]);
  });

  test('the 21st file on an entry is refused', async () => {
    as(EDITOR_USER);
    for (let i = 0; i < 18; i++) files.push({ ...fileRow(F_MEMBERS)!, id: `ffffffff-1111-4000-8000-${String(i).padStart(12, '0')}` });
    expect(files.filter((f) => f.entryId === E_MEMBERS)).toHaveLength(20);
    const { PATCH } = await entryRoute();
    const res = await PATCH(jsonReq(`sources/${E_MEMBERS}`, 'PATCH', { fileIds: [F_STAGED_EDITOR] }), ep(E_MEMBERS));
    expect(res.status).toBe(400);
    expect(fileRow(F_STAGED_EDITOR)!.entryId).toBeNull();
  });

  test('PATCH may clear the text of an entry that keeps a file', async () => {
    as(EDITOR_USER);
    const { PATCH } = await entryRoute();
    const res = await PATCH(jsonReq(`sources/${E_MEMBERS}`, 'PATCH', { text: null }), ep(E_MEMBERS));
    expect(res.status).toBe(200);
    expect((await res.json()).data.text).toBeNull();
  });

  test('PATCH may not clear the text of a text-only entry', async () => {
    as(EDITOR_USER);
    const { PATCH } = await entryRoute();
    const res = await PATCH(jsonReq(`sources/${E_TEXT_ONLY}`, 'PATCH', { text: '' }), ep(E_TEXT_ONLY));
    expect(res.status).toBe(400);
    expect(plain(entries.find((e) => e.id === E_TEXT_ONLY))).toBe('نص فقط');
  });

  test('the tree-wide entry takes files through PUT', async () => {
    as(ADMIN_USER);
    const { PUT } = await treeEntryRoute();
    const res = await PUT(jsonReq('sources/tree-entry', 'PUT', { visibility: 'members', fileIds: [F_STAGED_ADMIN] }), wp);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.files.map((f: Row) => f.id).sort()).toEqual([F_STAGED_ADMIN, F_TREE].sort());
  });

  test('PUT creating a tree-wide entry with neither text nor files is refused', async () => {
    as(ADMIN_USER);
    entries = entries.filter((e) => e.id !== E_TREE);
    const { PUT } = await treeEntryRoute();
    expect((await PUT(jsonReq('sources/tree-entry', 'PUT', { visibility: 'members' }), wp)).status).toBe(400);
  });
});

function plain(row: Row | undefined): string | null {
  if (!row?.text) return null;
  return decryptField(Buffer.from(row.text as Uint8Array), KEY);
}

// ===========================================================================
// GET sources/[entryId]/files/[fileId]
// ===========================================================================

describe('serving a file', () => {
  test('an admin gets the decrypted image with the locked-down headers', async () => {
    as(ADMIN_USER);
    const res = await serve(E_ADMINS, F_ADMINS);
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(JPEG_BYTES)).toBe(true);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toBe(
      "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    );
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('cross-origin-resource-policy')).toBe('same-origin');
    expect(res.headers.get('content-disposition')).toBe(
      `inline; filename="file.jpg"; filename*=UTF-8''${encodeURIComponent('وثيقة.jpg')}`,
    );
    expect(res.headers.get('etag')).toBeNull();
  });

  test('a PDF downloads as an attachment', async () => {
    as(MEMBER_USER);
    const res = await serve(E_MEMBERS, F_MEMBERS_PDF);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; /);
  });

  test('shared model: a member sees a file through any visible linked person; an orphan\'s file only an admin', async () => {
    // E_PRIV (members-level) gains a second, non-private person → visible to members.
    links.push({ sourceId: E_PRIV, individualId: PERSON, treeId: MAIN, createdById: 'u-admin', createdAt: new Date() });
    as(MEMBER_USER);
    expect((await serve(E_PRIV, F_PRIV)).status).toBe(200);
    // E_MEMBERS loses its only link → orphan.
    links = links.filter((l) => l.sourceId !== E_MEMBERS);
    expect((await serve(E_MEMBERS, F_MEMBERS)).status).toBe(404);
    as(ADMIN_USER);
    expect((await serve(E_MEMBERS, F_MEMBERS)).status).toBe(200);
  });

  test('item 4: a source linked ONLY to a private person — member and editor 404, admin 200', async () => {
    const bodies = new Set<string>();
    for (const user of [MEMBER_USER, EDITOR_USER]) {
      as(user);
      const res = await serve(E_PRIV, F_PRIV);
      expect(res.status).toBe(404);
      bodies.add(await res.text());
    }
    as(ADMIN_USER);
    expect((await serve(E_PRIV, F_PRIV)).status).toBe(200);
    // The refusals are byte-identical to a nonexistent file.
    as(MEMBER_USER);
    bodies.add(await (await serve(E_PRIV, ABSENT)).text());
    expect(bodies.size).toBe(1);
  });

  test('item 4: a members-level orphan — editor 404, admin 200; no bytes read on the refusal', async () => {
    links = links.filter((l) => l.sourceId !== E_MEMBERS);
    as(EDITOR_USER);
    expect((await serve(E_MEMBERS, F_MEMBERS)).status).toBe(404);
    expect(dataReads).toEqual([]);
    as(ADMIN_USER);
    expect((await serve(E_MEMBERS, F_MEMBERS)).status).toBe(200);
  });

  test('a member sees a members-level file and the members-level tree-wide file', async () => {
    as(MEMBER_USER);
    expect((await serve(E_MEMBERS, F_MEMBERS)).status).toBe(200);
    expect((await serve(E_TREE, F_TREE)).status).toBe(200);
  });

  test('treeId reaches an extra tree\'s file', async () => {
    as(MEMBER_USER);
    expect((await serve(E_EXTRA, F_EXTRA, `?treeId=${EXTRA}`)).status).toBe(200);
  });

  test('every not-visible case answers the IDENTICAL 404, without reading the bytes', async () => {
    const cases: [typeof ADMIN_USER, string, string, string][] = [
      [ADMIN_USER, E_ADMINS, ABSENT, ''], // nonexistent file
      [ADMIN_USER, E_ADMINS, 'not-a-uuid', ''], // malformed file id
      [ADMIN_USER, 'nope', F_ADMINS, ''], // malformed entry id
      [ADMIN_USER, E_MEMBERS, F_ADMINS, ''], // file of another entry
      [ADMIN_USER, E_FOREIGN, F_FOREIGN, `?treeId=${FOREIGN_TREE}`], // foreign workspace's tree
      [ADMIN_USER, E_FOREIGN, F_FOREIGN, ''], // foreign workspace, main tree
      [ADMIN_USER, E_EXTRA, F_EXTRA, ''], // extra-tree file without treeId
      [ADMIN_USER, E_ADMINS, F_ADMINS, '?treeId=garbage'], // malformed treeId
      [MEMBER_USER, E_ADMINS, F_ADMINS, ''], // member on an admins-level entry
      [MEMBER_USER, E_PRIV, F_PRIV, ''], // member on a private person
      [ADMIN_USER, E_ADMINS, F_STAGED_ADMIN, ''], // staged, unattached
    ];
    const bodies: string[] = [];
    for (const [user, entryId, fileId, q] of cases) {
      as(user);
      const res = await serve(entryId, fileId, q);
      expect(res.status, `${entryId}/${fileId}${q}`).toBe(404);
      expect(res.headers.get('cache-control')).toBe('private, no-store');
      bodies.push(await res.text());
    }
    expect(new Set(bodies).size).toBe(1);
    expect(dataReads).toEqual([]);
  });
});

// ===========================================================================
// DELETE sources/[entryId]/files/[fileId]
// ===========================================================================

describe('deleting a file', () => {
  test('a plain member is refused', async () => {
    as(MEMBER_USER);
    expect((await removeFile(E_MEMBERS, F_MEMBERS)).status).toBe(403);
  });

  test('an editor deletes a file of a visible entry; its bytes go too', async () => {
    as(EDITOR_USER);
    const res = await removeFile(E_MEMBERS, F_MEMBERS);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ entryDeleted: false });
    expect(fileRow(F_MEMBERS)).toBeUndefined();
    expect(fileData.some((d) => d.fileId === F_MEMBERS)).toBe(false);
  });

  test('deleting the last file of a text-less entry deletes the entry', async () => {
    as(EDITOR_USER);
    const res = await removeFile(E_FILE_ONLY, F_FILE_ONLY);
    expect((await res.json()).data).toEqual({ entryDeleted: true });
    expect(entries.some((e) => e.id === E_FILE_ONLY)).toBe(false);
    expect(auditRows[auditRows.length - 1].action).toBe('delete');
  });

  test('an entry with text survives losing its last file', async () => {
    as(ADMIN_USER);
    await removeFile(E_ADMINS, F_ADMINS);
    expect(entries.some((e) => e.id === E_ADMINS)).toBe(true);
  });

  test('an editor cannot delete a file on an entry hidden from them (same 404)', async () => {
    as(EDITOR_USER);
    const res = await removeFile(E_ADMINS, F_ADMINS);
    expect(res.status).toBe(404);
    expect(fileRow(F_ADMINS)).toBeDefined();
  });

  test('an editor may delete a file on an admins-level entry they wrote', async () => {
    as(EDITOR_USER);
    expect((await removeFile(E_EDITOR_OWN, F_EDITOR_OWN)).status).toBe(200);
  });

  test('the tree-wide entry\'s files: admin only', async () => {
    as(EDITOR_USER);
    expect((await removeFile(E_TREE, F_TREE)).status).toBe(404);
    as(ADMIN_USER);
    expect((await removeFile(E_TREE, F_TREE)).status).toBe(200);
  });

  test('a staged file cannot be deleted through an entry', async () => {
    as(ADMIN_USER);
    expect((await removeFile(E_ADMINS, F_STAGED_ADMIN)).status).toBe(404);
  });

  test('writes a metadata-only audit row', async () => {
    as(EDITOR_USER);
    await removeFile(E_MEMBERS, F_MEMBERS);
    const row = auditRows[auditRows.length - 1];
    expect(row).toMatchObject({ action: 'update', entityType: 'source_entry', entityId: E_MEMBERS });
    expect(decryptSnapshot<Row>(row.snapshotBefore, KEY)!.fileCount).toBe(2);
    expect(decryptSnapshot<Row>(row.snapshotAfter, KEY)!.fileCount).toBe(1);
    const payload = decryptAuditPayload(row.payload as Buffer, KEY);
    expect(payload).toEqual({ fileRemoved: { mimeType: 'image/jpeg', sizeBytes: JPEG_BYTES.length } });
  });

  test('is rate limited', async () => {
    as(EDITOR_USER);
    mockMutateCheck.mockReturnValue({ allowed: false, retryAfterSeconds: 5 });
    expect((await removeFile(E_MEMBERS, F_MEMBERS)).status).toBe(429);
  });
});

// ===========================================================================
// Entry reads carry file metadata
// ===========================================================================

describe('entry DTOs carry files', () => {
  test('person GET lists each visible entry\'s files with plaintext names', async () => {
    as(MEMBER_USER);
    const { GET } = await personRoute();
    const res = await GET(new NextRequest(`${base}/individuals/${PERSON}/sources`, { headers: { authorization: 'Bearer t' } }), pp(PERSON));
    const { data } = await res.json();
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].files.map((f: Row) => f.fileName).sort()).toEqual(['سجل.pdf', 'وثيقة.jpg']);
  });

  test('the inherited tree-wide entry carries its files', async () => {
    as(MEMBER_USER);
    individuals.push({ id: 'cccccccc-0000-4000-8000-0000000000aa', treeId: MAIN, isPrivate: false });
    const { GET } = await personRoute();
    const id = 'cccccccc-0000-4000-8000-0000000000aa';
    const { data } = await (await GET(new NextRequest(`${base}/individuals/${id}/sources`, { headers: { authorization: 'Bearer t' } }), pp(id))).json();
    expect(data.inherited.files.map((f: Row) => f.id)).toEqual([F_TREE]);
  });

  test('the admin list reports a real fileCount and the files', async () => {
    as(ADMIN_USER);
    const { GET } = await listRoute();
    const { data } = await (await GET(new NextRequest(`${base}/sources`, { headers: { authorization: 'Bearer t' } }), wp)).json();
    const members = data.entries.find((e: Row) => e.id === E_MEMBERS);
    expect(members.fileCount).toBe(2);
    expect(members.files).toHaveLength(2);
  });

  test('no DTO ever carries bytes', async () => {
    as(ADMIN_USER);
    const { GET } = await listRoute();
    const text = JSON.stringify(await (await GET(new NextRequest(`${base}/sources`, { headers: { authorization: 'Bearer t' } }), wp)).json());
    expect(text).not.toMatch(/"type":"Buffer"/);
  });
});

// ===========================================================================
// Cascades (the DB does it — lock the migrations)
// ===========================================================================

describe('cascades', () => {
  const sql = readdirSync(path.resolve(__dirname, '../../prisma/migrations'))
    .filter((d) => d.includes('source'))
    .map((d) => readFileSync(path.resolve(__dirname, '../../prisma/migrations', d, 'migration.sql'), 'utf8'))
    .join('\n');

  test('deleting an entry cascades to its files, and a file to its bytes', () => {
    expect(sql).toMatch(/"source_files_entry_id_fkey" FOREIGN KEY \("entry_id"\) REFERENCES "source_entries"\("id"\) ON DELETE CASCADE/);
    expect(sql).toMatch(/"source_file_data_file_id_fkey" FOREIGN KEY \("file_id"\) REFERENCES "source_files"\("id"\) ON DELETE CASCADE/);
  });

  test('deleting an entry through the API removes its files and bytes', async () => {
    as(ADMIN_USER);
    const { DELETE } = await entryRoute();
    expect((await DELETE(jsonReq(`sources/${E_MEMBERS}`, 'DELETE', {}), ep(E_MEMBERS))).status).toBe(204);
    expect(fileRow(F_MEMBERS)).toBeUndefined();
    expect(fileData.some((d) => d.fileId === F_MEMBERS || d.fileId === F_MEMBERS_PDF)).toBe(false);
  });
});

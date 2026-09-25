// @vitest-environment node
/**
 * Sources («المصادر») step 7 — the ANONYMOUS public sources surface.
 *
 *   GET /api/family/[slug]/person/[individualId]/sources
 *   GET /api/family/[slug]/person/[individualId]/sources/[entryId]/files/[fileId]
 *   GET /api/family/[slug]/sources/tree-entry/files/[fileId]
 *
 * Deny-by-default: every "not visible" case (unknown slug, private tree,
 * unknown / private / living / borrowed person, members- or admins-level
 * entry, another tree's entry, malformed ids) reads as the SAME 404. The
 * person context comes from the REAL `redactForPublic` output (the payload the
 * public tree serves), never from a re-implemented living rule.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { encryptField, encryptBytes } from '@/lib/crypto/workspace-encryption';
import type { GedcomData, Individual } from '@/lib/gedcom/types';
import { redactForPublic } from '@/lib/tree/public-visibility';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const dbHolder = vi.hoisted(() => ({ prisma: {} as Record<string, unknown> }));
vi.mock('@/lib/db', () => dbHolder);

const mockPublicCheck = vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 }));
vi.mock('@/lib/api/rate-limit', () => ({
  publicTreeLimiter: { check: (...a: unknown[]) => mockPublicCheck(...(a as [])) },
  clientIpKey: () => '1.2.3.4',
  rateLimitResponse: (retryAfterSeconds: number) =>
    new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { 'Retry-After': String(retryAfterSeconds) },
    }),
}));

vi.mock('@/lib/tree/encryption', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tree/encryption')>('@/lib/tree/encryption');
  return { ...actual, getWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 7)) };
});

// The public tree loader + payload builder: the record is looked up by slug;
// the payload is the REAL redactForPublic over a fixture tree.
const serve = vi.hoisted(() => ({
  loadPublicTreeBySlug: vi.fn(),
  buildPublicTreePayload: vi.fn(),
}));
vi.mock('@/lib/tree/public-serve', () => serve);

const KEY = Buffer.alloc(32, 7);
const enc = (s: string) => encryptField(s, KEY);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WS = 'ws-pub-1';
const MAIN = 'bbbbbbbb-1111-4111-9111-111111111111';
const EXTRA = 'bbbbbbbb-2222-4222-9222-222222222222';

const DEAD = 'cccccccc-0000-4000-8000-000000000001'; // deceased → publicly shown
const LIVING = 'cccccccc-0000-4000-8000-000000000002'; // living → hidden
const PRIV = 'cccccccc-0000-4000-8000-000000000003'; // private
const BORROWED = 'cccccccc-0000-4000-8000-000000000004'; // in payload, not home
const EXTRA_DEAD = 'cccccccc-0000-4000-8000-000000000005'; // extra tree person
const DEAD_NO_OWN = 'cccccccc-0000-4000-8000-000000000006'; // shown, no own entries
const ABSENT = 'cccccccc-0000-4000-8000-0000000000ff';

const E_PUBLIC = 'eeeeeeee-0000-4000-8000-000000000001';
const E_MEMBERS = 'eeeeeeee-0000-4000-8000-000000000002';
const E_ADMINS = 'eeeeeeee-0000-4000-8000-000000000003';
const E_LIVING_PUB = 'eeeeeeee-0000-4000-8000-000000000004';
const E_PRIV_PUB = 'eeeeeeee-0000-4000-8000-000000000005';
const E_BORROWED_PUB = 'eeeeeeee-0000-4000-8000-000000000006';
const E_EXTRA_PUB = 'eeeeeeee-0000-4000-8000-000000000007';
const E_TREE = 'eeeeeeee-0000-4000-8000-000000000008';
const E_PUBLIC_2 = 'eeeeeeee-0000-4000-8000-000000000009';

const F_PUB_IMG = 'ffffffff-0000-4000-8000-000000000001';
const F_PUB_PDF = 'ffffffff-0000-4000-8000-000000000002';
const F_MEMBERS = 'ffffffff-0000-4000-8000-000000000003';
const F_ADMINS = 'ffffffff-0000-4000-8000-000000000004';
const F_LIVING = 'ffffffff-0000-4000-8000-000000000005';
const F_PRIV = 'ffffffff-0000-4000-8000-000000000006';
const F_EXTRA = 'ffffffff-0000-4000-8000-000000000007';
const F_TREE = 'ffffffff-0000-4000-8000-000000000008';
const F_ABSENT = 'ffffffff-0000-4000-8000-0000000000ff';

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]);
const PDF_BYTES = Buffer.from('%PDF-1.7\n%%EOF\n', 'latin1');

type Row = Record<string, unknown>;

function ind(id: string, overrides: Partial<Individual> = {}): Individual {
  return {
    type: 'INDI', id, name: `اسم ${id.slice(-2)}`, givenName: `اسم ${id.slice(-2)}`, surname: '',
    sex: 'M', birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
    death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
    kunya: '', notes: '', isDeceased: false, isPrivate: false, familiesAsSpouse: [], familyAsChild: null,
    ...overrides,
  } as Individual;
}

function payloadFor(treeId: string) {
  const home: Individual[] =
    treeId === MAIN
      ? [
          ind(DEAD, { isDeceased: true }),
          ind(DEAD_NO_OWN, { isDeceased: true }),
          ind(LIVING, { birth: '1990' }),
          ind(PRIV, { isPrivate: true, isDeceased: true }),
        ]
      : [ind(EXTRA_DEAD, { isDeceased: true })];
  const all = treeId === MAIN ? [...home, ind(BORROWED, { isDeceased: true })] : home;
  const data: GedcomData = { individuals: Object.fromEntries(all.map((i) => [i.id, i])), families: {} };
  return {
    data: redactForPublic(data, new Date('2026-09-25T00:00:00Z')),
    names: [],
    homeIndividualIds: new Set(home.map((i) => i.id)),
  };
}

const RECORDS: Record<string, Row> = {
  'pub-main': { treeId: MAIN, workspaceId: WS, kind: 'main', visibility: 'public_link' },
  'pub-extra': { treeId: EXTRA, workspaceId: WS, kind: 'extra', visibility: 'public_link' },
};

let individuals: Row[] = [];
let entries: Row[] = [];
/** Shared-source model: `source_links` (a person entry = a source with ONE link). */
let links: Row[] = [];
let files: Row[] = [];
let fileData: Row[] = [];
const dataReads: string[] = [];

function seed() {
  individuals = [
    { id: DEAD, treeId: MAIN, isPrivate: false },
    { id: DEAD_NO_OWN, treeId: MAIN, isPrivate: false },
    { id: LIVING, treeId: MAIN, isPrivate: false },
    { id: PRIV, treeId: MAIN, isPrivate: true },
    { id: EXTRA_DEAD, treeId: EXTRA, isPrivate: false },
    // BORROWED lives in another workspace's tree — not a MAIN row.
    { id: BORROWED, treeId: 'bbbbbbbb-9999-4999-9999-999999999999', isPrivate: false },
  ];
  links = [];
  const e = (id: string, treeId: string, individualId: string | null, visibility: string, text: string | null, t = 0): Row => {
    if (individualId !== null) links.push({ sourceId: id, individualId, treeId });
    return {
      id, treeId, isTreeWide: individualId === null, visibility, text: text === null ? null : enc(text), createdById: 'u-admin',
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, t)), updatedAt: new Date(Date.UTC(2026, 0, 1)),
    };
  };
  entries = [
    e(E_PUBLIC, MAIN, DEAD, 'public', 'طبقات ابن سعد، ص ٩٠', 1),
    e(E_PUBLIC_2, MAIN, DEAD, 'public', null, 2),
    e(E_MEMBERS, MAIN, DEAD, 'members', 'للأعضاء', 3),
    e(E_ADMINS, MAIN, DEAD, 'admins', 'للمشرفين', 4),
    e(E_LIVING_PUB, MAIN, LIVING, 'public', 'حي', 5),
    e(E_PRIV_PUB, MAIN, PRIV, 'public', 'خاص', 6),
    e(E_BORROWED_PUB, 'bbbbbbbb-9999-4999-9999-999999999999', BORROWED, 'public', 'مستعار', 7),
    e(E_EXTRA_PUB, EXTRA, EXTRA_DEAD, 'public', 'إضافي', 8),
    e(E_TREE, MAIN, null, 'public', 'مصدر الشجرة', 9),
  ];
  files = [];
  fileData = [];
  const f = (id: string, entryId: string, treeId: string, mimeType = 'image/jpeg', bytes = JPEG_BYTES, name = 'وثيقة.jpg') => {
    files.push({ id, entryId, treeId, mimeType, sizeBytes: bytes.length, fileName: enc(name), createdById: 'u-admin', createdAt: new Date(Date.UTC(2026, 0, 1)) });
    fileData.push({ fileId: id, data: encryptBytes(bytes, KEY) });
  };
  f(F_PUB_IMG, E_PUBLIC, MAIN);
  f(F_PUB_PDF, E_PUBLIC, MAIN, 'application/pdf', PDF_BYTES, 'سجل.pdf');
  f(F_MEMBERS, E_MEMBERS, MAIN);
  f(F_ADMINS, E_ADMINS, MAIN);
  f(F_LIVING, E_LIVING_PUB, MAIN);
  f(F_PRIV, E_PRIV_PUB, MAIN);
  f(F_EXTRA, E_EXTRA_PUB, EXTRA);
  f(F_TREE, E_TREE, MAIN);
}

function matches(row: Row | null | undefined, where: Row | undefined): boolean {
  if (!where) return true;
  if (!row) return false;
  for (const [key, cond] of Object.entries(where)) {
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
      continue;
    }
    if (cond === null ? value !== null && value !== undefined : value !== cond) return false;
  }
  return true;
}

const fileMeta = (f: Row): Row => ({ id: f.id, mimeType: f.mimeType, sizeBytes: f.sizeBytes, fileName: f.fileName });
const joined = (e: Row): Row => ({
  ...e,
  links: links.filter((l) => l.sourceId === e.id),
  files: files.filter((f) => f.entryId === e.id).map(fileMeta),
});

dbHolder.prisma = {
  individual: {
    findFirst: async ({ where }: { where: Row }) => individuals.find((i) => matches(i, where)) ?? null,
  },
  sourceEntry: {
    findFirst: async ({ where }: { where: Row }) => {
      const hit = entries.find((e) => matches(e, where));
      return hit ? joined(hit) : null;
    },
    findMany: async ({ where }: { where: Row }) =>
      entries
        .filter((e) => matches(e, where))
        .sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime())
        .map(joined),
  },
  sourceFile: {
    findFirst: async ({ where }: { where: Row }) => {
      const hit = files.find((f) => matches(f, where));
      if (!hit) return null;
      const entry = entries.find((e) => e.id === hit.entryId);
      return { ...fileMeta(hit), entry: entry ? joined(entry) : null };
    },
  },
  sourceFileData: {
    findUnique: async ({ where }: { where: { fileId: string } }) => {
      dataReads.push(where.fileId);
      return fileData.find((d) => d.fileId === where.fileId) ?? null;
    },
  },
};

// ---------------------------------------------------------------------------
// Route helpers
// ---------------------------------------------------------------------------

import { GET as listGET } from '@/app/api/family/[slug]/person/[individualId]/sources/route';
import { GET as fileGET } from '@/app/api/family/[slug]/person/[individualId]/sources/[entryId]/files/[fileId]/route';
import { GET as treeFileGET } from '@/app/api/family/[slug]/sources/tree-entry/files/[fileId]/route';

const req = (url: string) => new NextRequest(new URL(url, 'http://localhost'));

function list(slug: string, individualId: string) {
  return listGET(req(`/api/family/${slug}/person/${individualId}/sources`), {
    params: Promise.resolve({ slug, individualId }),
  });
}
function file(slug: string, individualId: string, entryId: string, fileId: string) {
  return fileGET(req(`/api/family/${slug}/person/${individualId}/sources/${entryId}/files/${fileId}`), {
    params: Promise.resolve({ slug, individualId, entryId, fileId }),
  });
}
function treeFile(slug: string, fileId: string) {
  return treeFileGET(req(`/api/family/${slug}/sources/tree-entry/files/${fileId}`), {
    params: Promise.resolve({ slug, fileId }),
  });
}

async function expectGeneric404(res: Response) {
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: 'Not found' });
  expect(res.headers.get('Cache-Control')).toContain('no-store');
  expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
}

beforeEach(() => {
  seed();
  dataReads.length = 0;
  mockPublicCheck.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
  serve.loadPublicTreeBySlug.mockImplementation(async (slug: string) => RECORDS[slug] ?? null);
  serve.buildPublicTreePayload.mockImplementation(async (record: Row) => ({
    record,
    ...payloadFor(record.treeId as string),
  }));
});

// ---------------------------------------------------------------------------
// GET .../person/[individualId]/sources
// ---------------------------------------------------------------------------

describe('public person sources — list', () => {
  test('a publicly shown person gets ONLY their public-level entries, oldest first', async () => {
    const res = await list('pub-main', DEAD);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.entries.map((e: Row) => e.id)).toEqual([E_PUBLIC, E_PUBLIC_2]);
    expect(body.data.entries[0].text).toBe('طبقات ابن سعد، ص ٩٠');
  });

  test('entry DTO keys are exact — no visibility, creator, timestamps or person ids', async () => {
    const body = await (await list('pub-main', DEAD)).json();
    expect(Object.keys(body.data).sort()).toEqual(['entries', 'inherited']);
    expect(Object.keys(body.data.entries[0]).sort()).toEqual(['files', 'id', 'text']);
    expect(Object.keys(body.data.entries[0].files[0]).sort()).toEqual(['fileName', 'id', 'mimeType', 'sizeBytes']);
    expect(body.data.entries[0].files[0]).toEqual({
      id: F_PUB_IMG, mimeType: 'image/jpeg', sizeBytes: JPEG_BYTES.length, fileName: 'وثيقة.jpg',
    });
  });

  test('responses are never cached and never indexed', async () => {
    const res = await list('pub-main', DEAD);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(res.headers.get('ETag')).toBeNull();
  });

  test('a shown person with no own public entry inherits the public tree-wide entry', async () => {
    const body = await (await list('pub-main', DEAD_NO_OWN)).json();
    expect(body.data.entries).toEqual([]);
    expect(body.data.inherited).toEqual({ id: E_TREE, text: 'مصدر الشجرة', files: [expect.objectContaining({ id: F_TREE })] });
  });

  test('a person with own public entries does not inherit the tree-wide entry', async () => {
    const body = await (await list('pub-main', DEAD)).json();
    expect(body.data.inherited).toBeNull();
  });

  test('a members-level tree-wide entry is never inherited publicly', async () => {
    entries.find((e) => e.id === E_TREE)!.visibility = 'members';
    const body = await (await list('pub-main', DEAD_NO_OWN)).json();
    expect(body.data.inherited).toBeNull();
  });

  test('a published extra tree serves its own people', async () => {
    const body = await (await list('pub-extra', EXTRA_DEAD)).json();
    expect(body.data.entries.map((e: Row) => e.id)).toEqual([E_EXTRA_PUB]);
  });

  test.each([
    ['unknown slug', 'nope', DEAD],
    ['private tree / extra tree with collections off (loader says null)', 'private-tree', DEAD],
    ['unknown person', 'pub-main', ABSENT],
    ['private person', 'pub-main', PRIV],
    ['living (hidden) person', 'pub-main', LIVING],
    ['borrowed person', 'pub-main', BORROWED],
    ['person of another tree', 'pub-extra', DEAD],
    ['malformed person id', 'pub-main', 'not-a-uuid'],
  ])('%s → the generic 404', async (_label, slug, individualId) => {
    await expectGeneric404(await list(slug, individualId));
  });

  test('rate limited per IP', async () => {
    mockPublicCheck.mockReturnValue({ allowed: false, retryAfterSeconds: 9 });
    const res = await list('pub-main', DEAD);
    expect(res.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// GET .../sources/[entryId]/files/[fileId]
// ---------------------------------------------------------------------------

describe('public person sources — file', () => {
  test('shared model: a file is served only under a shown person its source is LINKED to', async () => {
    // E_PUBLIC is linked to DEAD only; DEAD_NO_OWN is shown too but not linked.
    await expectGeneric404(await file('pub-main', DEAD_NO_OWN, E_PUBLIC, F_PUB_IMG));
    links.push({ sourceId: E_PUBLIC, individualId: DEAD_NO_OWN, treeId: MAIN });
    expect((await file('pub-main', DEAD_NO_OWN, E_PUBLIC, F_PUB_IMG)).status).toBe(200);
  });

  test('shared model: a source linked to a shown and a living person lists on the shown one only', async () => {
    links.push({ sourceId: E_LIVING_PUB, individualId: DEAD, treeId: MAIN });
    const { data } = await (await list('pub-main', DEAD)).json();
    expect(data.entries.map((e: Row) => e.id)).toContain(E_LIVING_PUB);
    await expectGeneric404(await list('pub-main', LIVING));
  });

  test('a public entry image serves inline with locked-down headers', async () => {
    const res = await file('pub-main', DEAD, E_PUBLIC, F_PUB_IMG);
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer())).toEqual(JPEG_BYTES);
    expect(res.headers.get('Content-Type')).toBe('image/jpeg');
    expect(res.headers.get('Content-Disposition')).toMatch(/^inline; filename="file\.jpg"; filename\*=UTF-8''/);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Security-Policy')).toMatch(/^sandbox/);
    expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
  });

  test('a PDF downloads as an attachment', async () => {
    const res = await file('pub-main', DEAD, E_PUBLIC, F_PUB_PDF);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment; /);
  });

  test.each([
    ['unknown slug', 'nope', DEAD, E_PUBLIC, F_PUB_IMG],
    ['private tree', 'private-tree', DEAD, E_PUBLIC, F_PUB_IMG],
    ['members-level entry', 'pub-main', DEAD, E_MEMBERS, F_MEMBERS],
    ['admins-level entry', 'pub-main', DEAD, E_ADMINS, F_ADMINS],
    ['living person', 'pub-main', LIVING, E_LIVING_PUB, F_LIVING],
    ['private person', 'pub-main', PRIV, E_PRIV_PUB, F_PRIV],
    ['file of another person’s entry', 'pub-main', DEAD_NO_OWN, E_PUBLIC, F_PUB_IMG],
    ['entry of another tree', 'pub-main', DEAD, E_EXTRA_PUB, F_EXTRA],
    ['file under the wrong entry', 'pub-main', DEAD, E_PUBLIC_2, F_PUB_IMG],
    ['unknown file', 'pub-main', DEAD, E_PUBLIC, F_ABSENT],
    ['tree-wide entry through a person path', 'pub-main', DEAD_NO_OWN, E_TREE, F_TREE],
    ['malformed entry id', 'pub-main', DEAD, 'x', F_PUB_IMG],
    ['malformed file id', 'pub-main', DEAD, E_PUBLIC, 'x'],
    ['malformed person id', 'pub-main', 'x', E_PUBLIC, F_PUB_IMG],
  ])('%s → the generic 404 and no bytes read', async (_label, slug, person, entryId, fileId) => {
    await expectGeneric404(await file(slug, person, entryId, fileId));
    expect(dataReads).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GET /api/family/[slug]/sources/tree-entry/files/[fileId]
// ---------------------------------------------------------------------------

describe('public tree-wide entry file', () => {
  test('serves when the tree-wide entry is public', async () => {
    const res = await treeFile('pub-main', F_TREE);
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer())).toEqual(JPEG_BYTES);
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  test.each([
    ['members-level tree entry', () => { entries.find((e) => e.id === E_TREE)!.visibility = 'members'; }, 'pub-main', F_TREE],
    ['a person entry file', () => undefined, 'pub-main', F_PUB_IMG],
    ['another tree’s tree entry', () => undefined, 'pub-extra', F_TREE],
    ['unknown slug', () => undefined, 'nope', F_TREE],
    ['malformed file id', () => undefined, 'pub-main', 'x'],
  ])('%s → the generic 404', async (_label, arrange, slug, fileId) => {
    arrange();
    await expectGeneric404(await treeFile(slug, fileId));
    expect(dataReads).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Shared-source leak tests (rework R3, goal doc §8 items 5, 6, 9)
// ---------------------------------------------------------------------------

describe('shared sources — public never learns who else a source is for', () => {
  /** E_PUBLIC becomes one source for DEAD, DEAD_NO_OWN, PRIV and LIVING. */
  function shareEPublic() {
    for (const individualId of [DEAD_NO_OWN, PRIV, LIVING]) {
      links.push({ sourceId: E_PUBLIC, individualId, treeId: MAIN });
    }
  }

  test('item 5: DTO keys stay exactly id/text/files — no people, counts or links', async () => {
    shareEPublic();
    const body = await (await list('pub-main', DEAD)).json();
    const shared = body.data.entries.find((e: Row) => e.id === E_PUBLIC);
    expect(Object.keys(shared).sort()).toEqual(['files', 'id', 'text']);
    const json = JSON.stringify(body);
    for (const key of ['people', 'sharedCount', 'peopleCount', 'personIds', 'links', 'individualId']) {
      expect(json).not.toContain(`"${key}"`);
    }
  });

  test('item 5: no other linked person id appears anywhere in the response', async () => {
    shareEPublic();
    const json = JSON.stringify(await (await list('pub-main', DEAD)).json());
    for (const other of [DEAD_NO_OWN, PRIV, LIVING]) expect(json).not.toContain(other);
  });

  test('item 5: the other shown linked person sees the same source, still without people', async () => {
    shareEPublic();
    const body = await (await list('pub-main', DEAD_NO_OWN)).json();
    expect(body.data.entries.map((e: Row) => e.id)).toEqual([E_PUBLIC]);
    expect(JSON.stringify(body)).not.toContain(DEAD);
  });

  test('item 6: the shared file under a PRIVATE linked person → the generic 404, no bytes read', async () => {
    shareEPublic();
    await expectGeneric404(await file('pub-main', PRIV, E_PUBLIC, F_PUB_IMG));
    expect(dataReads).toEqual([]);
  });

  test('item 6: the shared file under a LIVING linked person → the generic 404, no bytes read', async () => {
    shareEPublic();
    await expectGeneric404(await file('pub-main', LIVING, E_PUBLIC, F_PUB_IMG));
    expect(dataReads).toEqual([]);
  });

  test('item 6: the hidden linked people get the SAME 404 on their list as an unknown person', async () => {
    shareEPublic();
    const bodies = new Set<string>();
    for (const id of [PRIV, LIVING, ABSENT]) {
      const res = await list('pub-main', id);
      expect(res.status).toBe(404);
      bodies.add(await res.text());
    }
    expect(bodies.size).toBe(1);
  });
});

describe('orphan sources are never the tree-wide source publicly (item 9)', () => {
  const ORPHAN = 'eeeeeeee-0000-4000-8000-0000000000a0';
  const F_ORPHAN = 'ffffffff-0000-4000-8000-0000000000a0';

  function addPublicOrphan() {
    entries.push({
      id: ORPHAN, treeId: MAIN, isTreeWide: false, visibility: 'public', text: enc('بلا أشخاص'),
      createdById: 'u-admin', createdAt: new Date(Date.UTC(2025, 0, 1)), updatedAt: new Date(Date.UTC(2025, 0, 1)),
    });
    files.push({ id: F_ORPHAN, entryId: ORPHAN, treeId: MAIN, mimeType: 'image/jpeg', sizeBytes: JPEG_BYTES.length, fileName: enc('يتيم.jpg'), createdById: 'u-admin', createdAt: new Date() });
    fileData.push({ fileId: F_ORPHAN, data: encryptBytes(JPEG_BYTES, KEY) });
  }

  test('a public orphan is never inherited, even with no tree-wide source', async () => {
    addPublicOrphan();
    entries = entries.filter((e) => e.id !== E_TREE);
    const body = await (await list('pub-main', DEAD_NO_OWN)).json();
    expect(body.data).toEqual({ entries: [], inherited: null });
  });

  test('the real tree-wide source still wins over an older public orphan', async () => {
    addPublicOrphan();
    const body = await (await list('pub-main', DEAD_NO_OWN)).json();
    expect(body.data.inherited.id).toBe(E_TREE);
  });

  test('an orphan\'s file is served by neither the tree-entry route nor any person path', async () => {
    addPublicOrphan();
    await expectGeneric404(await treeFile('pub-main', F_ORPHAN));
    await expectGeneric404(await file('pub-main', DEAD, ORPHAN, F_ORPHAN));
    expect(dataReads).toEqual([]);
  });
});

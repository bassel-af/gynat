// @vitest-environment node
/**
 * Sources («المصادر») rework R3 — `GET sources/publish-summary`
 * `publicPeopleCount`: the distinct people linked to a level-3 source whom the
 * published tree shows in full (`isShownOnPublicTree`), for the publish step's
 * «و{٣ مصادر} (تظهر على {٤٢ شخصًا})» line. Also item 9: an orphan (a source
 * linked to nobody) is never treated as the tree-wide source.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { encryptField } from '@/lib/crypto/workspace-encryption';

const KEY = Buffer.alloc(32, 5);
const enc = (s: string) => encryptField(s, KEY);

const dbHolder = vi.hoisted(() => ({ prisma: {} as Record<string, unknown> }));
vi.mock('@/lib/db', () => dbHolder);

vi.mock('@/lib/tree/encryption', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tree/encryption')>('@/lib/tree/encryption');
  return { ...actual, getWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 5)) };
});

const auth = vi.hoisted(() => ({ role: 'workspace_admin' }));
vi.mock('@/lib/api/workspace-auth', () => ({
  requireWorkspaceAdmin: async () =>
    auth.role === 'workspace_admin'
      ? { user: { id: 'u-admin' }, membership: { role: 'workspace_admin', permissions: [] } }
      : NextResponse.json({ error: 'forbidden' }, { status: 403 }),
  isErrorResponse: (r: unknown) => r instanceof Response,
}));

const WS = 'ws-sum-1';
const MAIN = 'bbbbbbbb-1111-4111-9111-111111111111';
const EXTRA = 'bbbbbbbb-2222-4222-9222-222222222222';

const P = (n: number) => `cccccccc-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const DEAD_A = P(1);
const DEAD_B = P(2);
const LIVING = P(3);
const PRIV = P(4);
const OLD = P(5); // born 1850, not marked deceased → presumed deceased → shown
const DEAD_C = P(6);
const EXTRA_DEAD = P(7);
const NO_DATE = P(8); // no birth date, not deceased → living

const S = (n: number) => `eeeeeeee-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;

type Row = Record<string, unknown>;
let trees: Row[] = [];
let individuals: Row[] = [];
let sources: Row[] = [];
let links: Row[] = [];

function person(id: string, treeId: string, over: Row = {}): Row {
  return { id, treeId, isPrivate: false, isDeceased: false, birthDate: null, ...over };
}

function source(id: string, treeId: string, visibility: string, people: string[], isTreeWide = false): Row {
  for (const individualId of people) links.push({ sourceId: id, individualId, treeId });
  return { id, treeId, visibility, isTreeWide, createdAt: new Date(Date.UTC(2026, 0, 1)) };
}

function seed() {
  trees = [
    { id: MAIN, workspaceId: WS, kind: 'main' },
    { id: EXTRA, workspaceId: WS, kind: 'extra' },
  ];
  individuals = [
    person(DEAD_A, MAIN, { isDeceased: true }),
    person(DEAD_B, MAIN, { isDeceased: true, birthDate: enc('1990') }),
    person(LIVING, MAIN, { birthDate: enc('12 JAN 1990') }),
    person(PRIV, MAIN, { isPrivate: true, isDeceased: true }),
    person(OLD, MAIN, { birthDate: enc('1850') }),
    person(DEAD_C, MAIN, { isDeceased: true }),
    person(EXTRA_DEAD, EXTRA, { isDeceased: true }),
    person(NO_DATE, MAIN),
  ];
  links = [];
  sources = [
    source(S(1), MAIN, 'public', [DEAD_A, DEAD_B, LIVING, PRIV, NO_DATE]),
    source(S(2), MAIN, 'public', [DEAD_A, OLD]),
    source(S(3), MAIN, 'members', [DEAD_C]),
    source(S(4), MAIN, 'admins', [DEAD_C]),
    source(S(5), EXTRA, 'public', [EXTRA_DEAD]),
  ];
}

/** Tiny where-matcher: equality, `{ in }`, `{ not }` and the link relations. */
function matches(row: Row | undefined, where: Row | undefined): boolean {
  if (!where) return true;
  if (!row) return false;
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'source') {
      if (!matches(sources.find((s) => s.id === row.sourceId), cond as Row)) return false;
      continue;
    }
    if (key === 'individual') {
      if (!matches(individuals.find((i) => i.id === row.individualId), cond as Row)) return false;
      continue;
    }
    if (key === 'links') {
      const c = cond as { some?: Row; none?: Row };
      const own = links.filter((l) => l.sourceId === row.id);
      if (c.some && !own.some((l) => matches(l, c.some))) return false;
      if (c.none && own.some((l) => matches(l, c.none))) return false;
      continue;
    }
    const value = row[key];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Row;
      if ('in' in c && !(c.in as unknown[]).includes(value)) return false;
      if ('not' in c && value === c.not) return false;
      continue;
    }
    if (value !== cond) return false;
  }
  return true;
}

function project(row: Row, select: Row | undefined): Row {
  if (!select) return row;
  const out: Row = {};
  for (const [k, v] of Object.entries(select)) {
    if (k === 'links') {
      out[k] = links
        .filter((l) => l.sourceId === row.id)
        .map((l) => project(l, (v as { select: Row }).select));
    } else if (k === 'individual') {
      const ind = individuals.find((i) => i.id === row.individualId);
      out[k] = ind ? project(ind, (v as { select: Row }).select) : null;
    } else if (v === true) out[k] = row[k];
  }
  return out;
}

dbHolder.prisma = {
  familyTree: {
    findFirst: async ({ where }: { where: Row }) => trees.find((t) => matches(t, where)) ?? null,
  },
  sourceEntry: {
    findMany: async ({ where, select }: { where: Row; select?: Row }) =>
      sources.filter((s) => matches(s, where)).map((s) => project(s, select)),
    findFirst: async ({ where, select }: { where: Row; select?: Row }) => {
      const hit = sources.find((s) => matches(s, where));
      return hit ? project(hit, select) : null;
    },
  },
};

import { GET } from '@/app/api/workspaces/[id]/tree/sources/publish-summary/route';

async function summary(query = '') {
  const res = await GET(
    new NextRequest(new URL(`http://localhost/api/workspaces/${WS}/tree/sources/publish-summary${query}`)),
    { params: Promise.resolve({ id: WS }) },
  );
  return res;
}

beforeEach(() => {
  auth.role = 'workspace_admin';
  seed();
});

describe('publish-summary — publicPeopleCount', () => {
  test('counts DISTINCT linked people the public tree shows, over level-3 sources only', async () => {
    const res = await summary();
    expect(res.status).toBe(200);
    const { data } = await res.json();
    // S1: DEAD_A, DEAD_B (deceased mark wins over a recent birth); LIVING,
    // PRIV and NO_DATE hidden. S2: DEAD_A (again), OLD (presumed deceased).
    // S3/S4 (levels 1–2) and the extra tree never count.
    expect(data.publicPeopleCount).toBe(3);
    expect(data.publicCount).toBe(2);
  });

  test('zero when no level-3 source exists', async () => {
    sources = sources.filter((s) => s.visibility !== 'public');
    const { data } = await (await summary()).json();
    expect(data.publicPeopleCount).toBe(0);
    expect(data.publicCount).toBe(0);
  });

  test('a level-3 source linked only to hidden people adds nobody', async () => {
    sources = sources.filter((s) => s.id !== S(2));
    links = links.filter((l) => !(l.sourceId === S(1) && [DEAD_A, DEAD_B].includes(l.individualId as string)));
    const { data } = await (await summary()).json();
    expect(data.publicPeopleCount).toBe(0);
    expect(data.publicCount).toBe(1);
  });

  test('scoped to the ?treeId tree', async () => {
    const { data } = await (await summary(`?treeId=${EXTRA}`)).json();
    expect(data.publicPeopleCount).toBe(1);
  });

  test('a public tree-wide source adds no people', async () => {
    sources.push(source(S(9), MAIN, 'public', [], true));
    const { data } = await (await summary()).json();
    expect(data.publicPeopleCount).toBe(3);
    expect(data.treeEntry).toEqual({ id: S(9), visibility: 'public' });
  });

  test('the response carries no names or person ids', async () => {
    const body = JSON.stringify(await (await summary()).json());
    for (const id of [DEAD_A, DEAD_B, LIVING, PRIV, OLD]) expect(body).not.toContain(id);
  });

  test('is admin only', async () => {
    auth.role = 'workspace_member';
    expect((await summary()).status).toBe(403);
  });
});

describe('publish-summary — an orphan is never the tree-wide source (item 9)', () => {
  test('a public orphan is a pending/public SOURCE, never `treeEntry`, and adds no people', async () => {
    sources.push(source(S(8), MAIN, 'public', []));
    const { data } = await (await summary()).json();
    expect(data.treeEntry).toBeNull();
    expect(data.publicCount).toBe(3);
    expect(data.publicPeopleCount).toBe(3);
  });

  test('a members-level orphan stays in pendingIds, not in treeEntry', async () => {
    sources.push(source(S(8), MAIN, 'members', []));
    const { data } = await (await summary()).json();
    expect(data.pendingIds).toContain(S(8));
    expect(data.treeEntry).toBeNull();
  });
});

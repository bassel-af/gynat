import { describe, test, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { GedcomData, Individual } from '@/lib/gedcom/types';
import type { PersonProjection } from '@/lib/tree/person-projection';

// GET /api/workspaces/[id]/tree/person/[individualId] — the workspace's
// name-feature toggles decide whether kunya / famous name reach the member
// Person Page payload (same rule as the member tree GET).

const mockWorkspaceFindUnique = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: { workspace: { findUnique: (...a: unknown[]) => mockWorkspaceFindUnique(...a) } },
}));

vi.mock('@/lib/api/workspace-auth', () => ({
  requireWorkspaceMember: vi.fn(async () => ({
    user: { id: 'u-1' }, membership: { role: 'workspace_member' },
  })),
  isErrorResponse: (r: unknown) => r instanceof NextResponse,
}));

vi.mock('@/lib/tree/queries', () => ({
  getTreeByWorkspaceId: vi.fn(async () => ({ id: 'tree-1', lastModifiedAt: new Date() })),
}));

vi.mock('@/lib/tree/encryption', () => ({
  getWorkspaceKey: vi.fn(async () => Buffer.alloc(32, 1)),
}));

vi.mock('@/lib/tree/branch-pointer-queries', () => ({
  getActivePointersForWorkspace: vi.fn(async () => []),
}));

function person(id: string, overrides: Partial<Individual> = {}): Individual {
  return {
    id, type: 'INDI', name: id, givenName: id, surname: '', sex: 'M',
    birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
    death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
    kunya: 'أبو طالب', famousName: 'هاشم', famousNameInNasab: true,
    notes: '', isDeceased: true, isPrivate: false, familiesAsSpouse: [], familyAsChild: null,
    ...overrides,
  };
}

// a (subject) — father f
vi.mock('@/lib/tree/mapper', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tree/mapper')>()),
  dbTreeToGedcomData: (): GedcomData => ({
    individuals: {
      a: person('a', { familyAsChild: 'F1' }),
      f: person('f', { famousName: 'شيبة', familiesAsSpouse: ['F1'] }),
    },
    families: {
      F1: {
        id: 'F1', type: 'FAM', husband: 'f', wife: null, children: ['a'],
        marriageContract: { date: '', hijriDate: '', place: '', description: '', notes: '' },
        marriage: { date: '', hijriDate: '', place: '', description: '', notes: '' },
        divorce: { date: '', hijriDate: '', place: '', description: '', notes: '' },
        isDivorced: false,
      },
    },
  }),
}));

import { GET } from '@/app/api/workspaces/[id]/tree/person/[individualId]/route';

async function fetchProjection(): Promise<PersonProjection> {
  const res = await GET(
    new NextRequest('http://localhost/api/workspaces/ws-1/tree/person/a'),
    { params: Promise.resolve({ id: 'ws-1', individualId: 'a' }) },
  );
  expect(res.status).toBe(200);
  return res.json();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockWorkspaceFindUnique.mockResolvedValue({ enableKunya: true, enableFamousName: true });
});

describe('GET /tree/person — name features', () => {
  test('famous name off → subject has no famous name value', async () => {
    mockWorkspaceFindUnique.mockResolvedValue({ enableKunya: true, enableFamousName: false });
    const p = await fetchProjection();
    expect(p.subject.famousName).toBe('');
  });

  test('famous name off → subject has no in-nasab choice', async () => {
    mockWorkspaceFindUnique.mockResolvedValue({ enableKunya: true, enableFamousName: false });
    const p = await fetchProjection();
    expect('famousNameInNasab' in p.subject).toBe(false);
  });

  test('famous name off → no chip carries a famous name or in-nasab choice', async () => {
    mockWorkspaceFindUnique.mockResolvedValue({ enableKunya: true, enableFamousName: false });
    const p = await fetchProjection();
    expect(p.paternalChain.map((c) => [c.famousName, 'famousNameInNasab' in c])).toEqual([['', false]]);
  });

  test('kunya off → subject kunya is blank', async () => {
    mockWorkspaceFindUnique.mockResolvedValue({ enableKunya: false, enableFamousName: true });
    const p = await fetchProjection();
    expect(p.subject.kunya).toBe('');
  });

  test('famous name on → subject carries the famous name', async () => {
    const p = await fetchProjection();
    expect(p.subject.famousName).toBe('هاشم');
  });

  test('famous name on → chip carries the famous name', async () => {
    const p = await fetchProjection();
    expect(p.paternalChain.find((c) => c.id === 'f')?.famousName).toBe('شيبة');
  });

  test('reads both name-feature toggles from the workspace', async () => {
    await fetchProjection();
    const query = mockWorkspaceFindUnique.mock.calls[0][0] as { select: Record<string, boolean> };
    expect(query.select).toMatchObject({ enableKunya: true, enableFamousName: true });
  });
});

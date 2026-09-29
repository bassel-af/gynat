import { describe, test, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { GedcomData, Individual } from '@/lib/gedcom/types';

// GET /api/workspaces/[id]/tree — the workspace's name-feature toggles decide
// whether kunya / famous name reach the member tree payload.

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
  resolveTargetTreeOr404: vi.fn(async () => ({ id: 'tree-1', lastModifiedAt: new Date() })),
  getTreeByWorkspaceId: vi.fn(),
}));

vi.mock('@/lib/tree/encryption', () => ({
  getWorkspaceKey: vi.fn(async () => Buffer.alloc(32, 1)),
}));

vi.mock('@/lib/tree/branch-pointer-queries', () => ({
  getActivePointersForWorkspace: vi.fn(async () => []),
}));

function person(id: string): Individual {
  return {
    id, type: 'INDI', name: id, givenName: id, surname: '', sex: 'M',
    birth: '', birthPlace: '', birthDescription: '', birthNotes: '', birthHijriDate: '',
    death: '', deathPlace: '', deathDescription: '', deathNotes: '', deathHijriDate: '',
    kunya: 'أبو طالب', famousName: 'هاشم', famousNameInNasab: true,
    notes: '', isDeceased: true, isPrivate: false, familiesAsSpouse: [], familyAsChild: null,
  };
}

vi.mock('@/lib/tree/mapper', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tree/mapper')>()),
  dbTreeToGedcomData: (): GedcomData => ({ individuals: { a: person('a') }, families: {} }),
}));

import { GET } from '@/app/api/workspaces/[id]/tree/route';

async function fetchPerson(): Promise<Individual> {
  const res = await GET(
    new NextRequest('http://localhost/api/workspaces/ws-1/tree'),
    { params: Promise.resolve({ id: 'ws-1' }) },
  );
  expect(res.status).toBe(200);
  const body = await res.json();
  return body.data.individuals.a;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockWorkspaceFindUnique.mockResolvedValue({ enableKunya: true, enableFamousName: true });
});

describe('GET /tree — name features', () => {
  test('famous name off → no famous name in the payload', async () => {
    mockWorkspaceFindUnique.mockResolvedValue({ enableKunya: true, enableFamousName: false });
    const ind = await fetchPerson();
    expect(ind.famousName).toBeUndefined();
  });

  test('famous name off → no in-nasab choice in the payload', async () => {
    mockWorkspaceFindUnique.mockResolvedValue({ enableKunya: true, enableFamousName: false });
    const ind = await fetchPerson();
    expect(ind.famousNameInNasab).toBeUndefined();
  });

  test('famous name on → the famous name is served', async () => {
    const ind = await fetchPerson();
    expect(ind.famousName).toBe('هاشم');
  });

  test('reads the famous-name toggle from the workspace', async () => {
    await fetchPerson();
    const query = mockWorkspaceFindUnique.mock.calls[0][0] as { select: Record<string, boolean> };
    expect(query.select.enableFamousName).toBe(true);
  });

  test('kunya off → kunya is blank', async () => {
    mockWorkspaceFindUnique.mockResolvedValue({ enableKunya: false, enableFamousName: true });
    const ind = await fetchPerson();
    expect(ind.kunya).toBe('');
  });
});

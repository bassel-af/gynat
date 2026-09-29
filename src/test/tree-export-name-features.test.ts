import { describe, test, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { GedcomData, Individual } from '@/lib/gedcom/types';

// GET /api/workspaces/[id]/tree/export — a disabled name feature (kunya,
// famous name) never leaves the server inside an exported GEDCOM.

const mockWorkspaceFindUnique = vi.fn();
vi.mock('@/lib/db', () => ({
  prisma: { workspace: { findUnique: (...a: unknown[]) => mockWorkspaceFindUnique(...a) } },
}));

vi.mock('@/lib/api/workspace-auth', () => ({
  requireWorkspaceMember: vi.fn(async () => ({
    user: { id: 'u-1' }, membership: { role: 'workspace_admin' },
  })),
  isErrorResponse: (r: unknown) => r instanceof NextResponse,
}));

vi.mock('@/lib/api/rate-limit', () => ({
  treeExportLimiter: { check: () => ({ allowed: true, retryAfterSeconds: 0 }) },
  rateLimitResponse: () => new Response(null, { status: 429 }),
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

const exportedData: GedcomData[] = [];
vi.mock('@/lib/gedcom/exporter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/gedcom/exporter')>();
  return {
    ...actual,
    gedcomDataToGedcom: (data: GedcomData, version: '5.5.1' | '7.0') => {
      exportedData.push(data);
      return actual.gedcomDataToGedcom(data, version);
    },
  };
});

import { GET } from '@/app/api/workspaces/[id]/tree/export/route';

async function exportText(): Promise<string> {
  const res = await GET(
    new NextRequest('http://localhost/api/workspaces/ws-1/tree/export'),
    { params: Promise.resolve({ id: 'ws-1' }) },
  );
  expect(res.status).toBe(200);
  return res.text();
}

const WS = { slug: 'fam', enableTreeExport: true, allowMemberExport: true, enableKunya: true, enableFamousName: true };

beforeEach(() => {
  vi.clearAllMocks();
  exportedData.length = 0;
  mockWorkspaceFindUnique.mockResolvedValue(WS);
});

describe('GEDCOM export — name features', () => {
  test('kunya off → no _KUNYA line', async () => {
    mockWorkspaceFindUnique.mockResolvedValue({ ...WS, enableKunya: false });
    expect(await exportText()).not.toContain('_KUNYA');
  });

  test('kunya on → the kunya is exported', async () => {
    expect(await exportText()).toContain('1 _KUNYA أبو طالب');
  });

  test('famous name off → the exporter never receives a famous name', async () => {
    mockWorkspaceFindUnique.mockResolvedValue({ ...WS, enableFamousName: false });
    await exportText();
    expect(exportedData[0].individuals.a.famousName).toBeUndefined();
  });

  test('reads both name-feature toggles from the workspace', async () => {
    await exportText();
    const query = mockWorkspaceFindUnique.mock.calls[0][0] as { select: Record<string, boolean> };
    expect(query.select).toMatchObject({ enableKunya: true, enableFamousName: true });
  });
});

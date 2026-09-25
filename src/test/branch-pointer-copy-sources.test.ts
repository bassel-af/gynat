// @vitest-environment node
/**
 * Sources («المصادر») step 8 — the manual pointer COPY
 * (`POST branch-pointers/[pointerId]/copy`) carries the borrowed branch's
 * sources into the target family with the cross-family rules.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { GedcomData } from '@/lib/gedcom/types';

const TARGET_WS = 'ws-target';
const SOURCE_WS = 'ws-source';
const SOURCE_TREE = 'tree-source';
const TARGET_TREE = 'tree-target';
const POINTER_ID = 'pointer-1';
const ROOT = 'ind-root';

const sourceKey = Buffer.alloc(32, 1);
const targetKey = Buffer.alloc(32, 2);

vi.mock('@/lib/api/workspace-auth', () => ({
  requireWorkspaceAdmin: vi.fn(async () => ({ user: { id: 'admin-1' } })),
  isErrorResponse: (r: unknown) => r instanceof NextResponse,
}));

const tx = {
  branchPointer: { update: vi.fn(async () => ({})) },
  treeEditLog: { create: vi.fn(async () => ({})) },
};
const mockTransaction = vi.fn(async (fn: (t: unknown) => unknown, _opts?: unknown) => fn(tx));
vi.mock('@/lib/db', () => ({
  prisma: {
    branchPointer: {
      findUnique: vi.fn(async () => ({
        id: POINTER_ID,
        status: 'active',
        isCollectionLink: false,
        sourceWorkspaceId: SOURCE_WS,
        targetWorkspaceId: TARGET_WS,
        rootIndividualId: ROOT,
        anchorIndividualId: 'anchor-1',
        relationship: 'child',
        depthLimit: null,
        includeGrafts: false,
      })),
    },
    $transaction: (fn: (t: unknown) => unknown, opts?: unknown) => mockTransaction(fn, opts),
  },
}));

vi.mock('@/lib/tree/queries', () => ({
  getTreeByWorkspaceId: vi.fn(async () => ({ id: SOURCE_TREE })),
  getOrCreateTree: vi.fn(async () => ({ id: TARGET_TREE })),
  touchTreeTimestamp: vi.fn(async () => undefined),
}));

vi.mock('@/lib/tree/encryption', () => ({
  getWorkspaceKey: vi.fn(async (ws: string) => (ws === SOURCE_WS ? sourceKey : targetKey)),
  encryptSnapshot: () => null,
}));

vi.mock('@/lib/tree/audit', () => ({
  snapshotBranchPointer: () => ({}),
  encryptAuditDescription: () => null,
}));

const branch: GedcomData = {
  individuals: {
    [ROOT]: {
      id: ROOT, type: 'INDI', name: 'الجد', givenName: 'الجد', surname: '', sex: 'M',
      familiesAsSpouse: [], familyAsChild: null, birth: '', death: '', isDeceased: true, isPrivate: false,
    } as never,
  },
  families: {},
};
vi.mock('@/lib/tree/mapper', () => ({ dbTreeToGedcomData: () => branch }));
vi.mock('@/lib/tree/branch-pointer-merge', () => ({ extractPointedSubtree: () => branch }));

const mockPersistDeepCopy = vi.fn(async (..._a: unknown[]) => undefined);
vi.mock('@/lib/tree/branch-pointer-deep-copy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tree/branch-pointer-deep-copy')>()),
  persistDeepCopy: (...a: unknown[]) => mockPersistDeepCopy(...a),
}));

const mockCopySources = vi.fn(async (..._a: unknown[]) => ({ skippedSourceFiles: 0 }));
vi.mock('@/lib/tree/source-copy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tree/source-copy')>()),
  copySources: (...a: unknown[]) => mockCopySources(...a),
}));

import { POST } from '@/app/api/workspaces/[id]/branch-pointers/[pointerId]/copy/route';

function copy() {
  return POST(
    new NextRequest(`http://localhost/api/workspaces/${TARGET_WS}/branch-pointers/${POINTER_ID}/copy`, { method: 'POST' }),
    { params: Promise.resolve({ id: TARGET_WS, pointerId: POINTER_ID }) },
  );
}

const inputOf = () => mockCopySources.mock.calls[0][1] as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  mockCopySources.mockResolvedValue({ skippedSourceFiles: 0 });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('POST branch-pointers/[pointerId]/copy — sources', () => {
  test('copies the branch sources cross-family, from the source key to the target key', async () => {
    await copy();
    expect(inputOf()).toMatchObject({
      fromTreeId: SOURCE_TREE,
      toTreeId: TARGET_TREE,
      targetWorkspaceId: TARGET_WS,
      mode: { kind: 'cross', sourceKey, targetKey },
    });
  });

  test('a branch copy never carries the tree-wide source', async () => {
    await copy();
    expect(inputOf().includeTreeWide).toBe(false);
  });

  test('links follow the id map of the landed people', async () => {
    await copy();
    const copyResult = mockPersistDeepCopy.mock.calls[0][2] as { idMap: Map<string, string> };
    expect(inputOf().idMap).toBe(copyResult.idMap);
  });

  test('runs in the copy transaction', async () => {
    await copy();
    expect(mockCopySources.mock.calls[0][0]).toBe(tx);
  });

  test('reports the files skipped for the quota', async () => {
    mockCopySources.mockResolvedValue({ skippedSourceFiles: 2 });
    const res = await copy();
    expect((await res.json()).data.skippedSourceFiles).toBe(2);
  });
});

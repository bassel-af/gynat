/**
 * «قفزة نسب» — undo/redo inverse builders (Chunk 1: builders only, no UI).
 *
 * Each builder returns `{ undo, redo }` closures over `apiFetch`. What can
 * break here is the URL, the method, the body and the `treeId` propagation —
 * so that is what is asserted. `isUndo: true` must be set on every call so the
 * server writes «تراجع عن: …» rather than a fresh audit line.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '@/lib/api/client';
import {
  buildCreateAncestryJumpInverse,
  buildUpdateAncestryJumpInverse,
  buildDeleteAncestryJumpInverse,
} from '@/lib/tree/undo-builders';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

const WS = 'ws-1';
const BASE = `/api/workspaces/${WS}/tree/ancestry-jumps`;
const TREE = 'tree-extra-1';

function okJson(data: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve({ data }) } as unknown as Response;
}

function noContent() {
  return { ok: true, status: 204, json: () => Promise.reject(new Error('no body')) } as unknown as Response;
}

/** The (path, init) pair of the Nth apiFetch call. */
function call(n: number): [string, Record<string, unknown>] {
  const [path, init] = mockApiFetch.mock.calls[n] as [string, Record<string, unknown>];
  return [path, init ?? {}];
}

function bodyOf(n: number): Record<string, unknown> {
  const [, init] = call(n);
  return JSON.parse(init.body as string);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockResolvedValue(okJson({ id: 'J-NEW' }));
});

// ---------------------------------------------------------------------------
// create → undo deletes, redo re-creates
// ---------------------------------------------------------------------------

describe('buildCreateAncestryJumpInverse', () => {
  const params = {
    workspaceId: WS,
    createdId: 'J1',
    createPayload: { descendantId: 'ADNAN', ancestorFamilyId: 'FAM-ISH' },
  };

  test('undo DELETEs the created jump', async () => {
    mockApiFetch.mockResolvedValue(noContent());
    await buildCreateAncestryJumpInverse(params).undo();
    const [path, init] = call(0);
    expect(path).toBe(`${BASE}/J1`);
    expect(init.method).toBe('DELETE');
  });

  test('redo POSTs the original payload back', async () => {
    await buildCreateAncestryJumpInverse(params).redo();
    const [path, init] = call(0);
    expect(path).toBe(BASE);
    expect(init.method).toBe('POST');
    expect(bodyOf(0)).toEqual(params.createPayload);
  });

  test('marks every call as an undo so the audit line is prefixed', async () => {
    mockApiFetch.mockResolvedValue(noContent());
    await buildCreateAncestryJumpInverse(params).undo();
    expect(call(0)[1].isUndo).toBe(true);
  });

  test('a redo re-targets the NEW id for the following undo', async () => {
    const inverse = buildCreateAncestryJumpInverse(params);
    mockApiFetch.mockResolvedValueOnce(okJson({ id: 'J-REBORN' }));
    await inverse.redo();
    mockApiFetch.mockResolvedValue(noContent());
    await inverse.undo();
    expect(call(1)[0]).toBe(`${BASE}/J-REBORN`);
  });

  test('propagates treeId into the POST body and the DELETE body', async () => {
    const inverse = buildCreateAncestryJumpInverse({ ...params, treeId: TREE });
    await inverse.redo();
    expect(bodyOf(0).treeId).toBe(TREE);

    mockApiFetch.mockResolvedValue(noContent());
    await inverse.undo();
    expect(bodyOf(1).treeId).toBe(TREE);
  });

  test('omits treeId entirely for the main tree', async () => {
    await buildCreateAncestryJumpInverse(params).redo();
    expect(bodyOf(0)).not.toHaveProperty('treeId');
  });
});

// ---------------------------------------------------------------------------
// update → PATCH ⇄ PATCH
// ---------------------------------------------------------------------------

describe('buildUpdateAncestryJumpInverse', () => {
  const params = {
    workspaceId: WS,
    jumpId: 'J1',
    before: { generationsMin: 4, generationsMax: 40 },
    after: { generationsMin: 7, generationsMax: 7 },
  };

  test('undo PATCHes the BEFORE values', async () => {
    await buildUpdateAncestryJumpInverse(params).undo();
    const [path, init] = call(0);
    expect(path).toBe(`${BASE}/J1`);
    expect(init.method).toBe('PATCH');
    expect(bodyOf(0)).toEqual(params.before);
  });

  test('redo PATCHes the AFTER values', async () => {
    await buildUpdateAncestryJumpInverse(params).redo();
    expect(bodyOf(0)).toEqual(params.after);
  });

  test('propagates treeId into both bodies', async () => {
    const inverse = buildUpdateAncestryJumpInverse({ ...params, treeId: TREE });
    await inverse.undo();
    await inverse.redo();
    expect(bodyOf(0).treeId).toBe(TREE);
    expect(bodyOf(1).treeId).toBe(TREE);
  });
});

// ---------------------------------------------------------------------------
// delete → undo re-creates from the snapshot, redo deletes again
// ---------------------------------------------------------------------------

describe('buildDeleteAncestryJumpInverse', () => {
  const params = {
    workspaceId: WS,
    deletedId: 'J1',
    snapshot: {
      descendantId: 'ADNAN',
      ancestorFamilyId: 'FAM-ISH',
      generationsMin: 4,
      generationsMax: 40,
      notes: 'عدنان من وَلَد إسماعيل',
    },
  };

  test('undo POSTs the snapshot back', async () => {
    await buildDeleteAncestryJumpInverse(params).undo();
    const [path, init] = call(0);
    expect(path).toBe(BASE);
    expect(init.method).toBe('POST');
    expect(bodyOf(0)).toEqual(params.snapshot);
  });

  test('redo DELETEs the id the undo re-created', async () => {
    const inverse = buildDeleteAncestryJumpInverse(params);
    mockApiFetch.mockResolvedValueOnce(okJson({ id: 'J-RECREATED' }));
    await inverse.undo();
    mockApiFetch.mockResolvedValue(noContent());
    await inverse.redo();
    expect(call(1)[0]).toBe(`${BASE}/J-RECREATED`);
  });

  test('redo falls back to the original id when nothing was re-created yet', async () => {
    mockApiFetch.mockResolvedValue(noContent());
    await buildDeleteAncestryJumpInverse(params).redo();
    expect(call(0)[0]).toBe(`${BASE}/J1`);
  });

  test('propagates treeId', async () => {
    await buildDeleteAncestryJumpInverse({ ...params, treeId: TREE }).undo();
    expect(bodyOf(0).treeId).toBe(TREE);
  });
});

// ---------------------------------------------------------------------------
// Shared contract
// ---------------------------------------------------------------------------

describe('inverse contract', () => {
  test('a non-ok response rejects rather than silently succeeding', async () => {
    mockApiFetch.mockResolvedValue({ ok: false, status: 500 } as unknown as Response);
    await expect(
      buildUpdateAncestryJumpInverse({
        workspaceId: WS,
        jumpId: 'J1',
        before: {},
        after: {},
      }).undo(),
    ).rejects.toThrow();
  });
});

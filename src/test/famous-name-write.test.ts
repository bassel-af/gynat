/**
 * اسم الشهرة (famousName) — write path.
 *
 * - The workspace `enableFamousName` toggle gates writes: OFF → create/PATCH
 *   never persist `famousName` / `famousNameInNasab` (mirrors the kunya strip).
 * - ON → `famousName` is stored as ciphertext under the workspace key, the
 *   plaintext `famousNameInNasab` flag is stored as given, and the response is
 *   a plaintext DTO (never a Buffer).
 * - The audit snapshot carries both fields.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

vi.mock('@/lib/api/rate-limit', () => ({
  treeMutateLimiter: { check: () => ({ allowed: true, retryAfterSeconds: 0 }) },
  rateLimitResponse: () => new Response('{}', { status: 429 }),
}));

const mockMembershipFindUnique = vi.fn();
const mockWorkspaceFindUnique = vi.fn();
const mockFamilyTreeFindUnique = vi.fn();
const mockFamilyTreeUpdate = vi.fn();
const mockIndividualCreate = vi.fn();
const mockIndividualUpdate = vi.fn();
const mockIndividualFindFirst = vi.fn();
const mockTreeEditLogCreate = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: { findUnique: (...a: unknown[]) => mockMembershipFindUnique(...a) },
    workspace: { findUnique: (...a: unknown[]) => mockWorkspaceFindUnique(...a) },
    familyTree: {
      findUnique: (...a: unknown[]) => mockFamilyTreeFindUnique(...a),
      findFirst: (...a: unknown[]) => mockFamilyTreeFindUnique(...a),
      update: (...a: unknown[]) => mockFamilyTreeUpdate(...a),
    },
    individual: {
      create: (...a: unknown[]) => mockIndividualCreate(...a),
      update: (...a: unknown[]) => mockIndividualUpdate(...a),
      findFirst: (...a: unknown[]) => mockIndividualFindFirst(...a),
    },
    treeEditLog: { create: (...a: unknown[]) => mockTreeEditLogCreate(...a) },
  },
}));

vi.mock('@/lib/tree/branch-pointer-queries', () => ({
  isPointedIndividualInWorkspace: vi.fn().mockResolvedValue(false),
}));

const TEST_KEY = Buffer.alloc(32, 9);
vi.mock('@/lib/tree/encryption', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tree/encryption')>('@/lib/tree/encryption');
  return { ...actual, getWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 9)) };
});

import { NextRequest } from 'next/server';
import { decryptFieldNullable, encryptFieldNullable } from '@/lib/crypto/workspace-encryption';
import { decryptSnapshot } from '@/lib/tree/encryption';
import { createIndividualSchema, updateIndividualSchema } from '@/lib/tree/schemas';
import { snapshotIndividual, type IndividualSnapshot } from '@/lib/tree/audit';
import { createIndividual } from '@/lib/tree/create-individual';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const wsId = 'ws-famous-1';
const treeId = 'tree-famous-1';
const indId = 'ind-famous-1';
const userId = 'user-famous-1';

function req(url: string, method: string, body: unknown) {
  return new NextRequest(url, {
    method,
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function postReq(body: unknown) {
  return req(`http://localhost:4000/api/workspaces/${wsId}/tree/individuals`, 'POST', body);
}

function patchReq(body: unknown) {
  return req(`http://localhost:4000/api/workspaces/${wsId}/tree/individuals/${indId}`, 'PATCH', body);
}

function setWorkspace(flags: { enableKunya?: boolean; enableFamousName?: boolean }) {
  mockWorkspaceFindUnique.mockResolvedValue({ enableKunya: false, enableFamousName: false, ...flags });
}

/** Echo the written data back like Prisma does (ciphertext stays Buffer). */
function echoRow({ data }: { data: Record<string, unknown> }) {
  return { id: indId, treeId, createdAt: new Date(), updatedAt: new Date(), ...data };
}

function containsBuffer(value: unknown): boolean {
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (v.type === 'Buffer' && Array.isArray(v.data)) return true;
    return Object.values(v).some(containsBuffer);
  }
  return false;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: userId, email: 'a@b.c', user_metadata: {} } }, error: null });
  mockMembershipFindUnique.mockResolvedValue({ userId, workspaceId: wsId, role: 'workspace_admin', permissions: [] });
  mockFamilyTreeFindUnique.mockResolvedValue({ id: treeId, workspaceId: wsId, kind: 'main', lastModifiedAt: new Date() });
  mockFamilyTreeUpdate.mockResolvedValue({});
  mockTreeEditLogCreate.mockResolvedValue({});
  mockIndividualCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => echoRow(args));
  mockIndividualUpdate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
    givenName: encryptFieldNullable('محمد', TEST_KEY),
    ...echoRow(args),
  }));
  mockIndividualFindFirst.mockResolvedValue({
    id: indId,
    treeId,
    givenName: encryptFieldNullable('محمد', TEST_KEY),
    sex: 'M',
    famousName: encryptFieldNullable('القديم', TEST_KEY),
    famousNameInNasab: null,
    isPrivate: false,
    isDeceased: false,
  });
});

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

describe('individual schemas — famousName fields', () => {
  test('create schema keeps famousName and famousNameInNasab', () => {
    const r = createIndividualSchema.parse({ givenName: 'أ', sex: 'M', famousName: 'الشهير', famousNameInNasab: true });
    expect(r).toMatchObject({ famousName: 'الشهير', famousNameInNasab: true });
  });

  test('famousName longer than 200 characters is rejected', () => {
    const r = updateIndividualSchema.safeParse({ famousName: 'x'.repeat(201) });
    expect(r.success).toBe(false);
  });

  test('famousNameInNasab accepts null (back to "never chosen")', () => {
    const r = updateIndividualSchema.parse({ famousNameInNasab: null, famousName: null });
    expect(r).toMatchObject({ famousNameInNasab: null, famousName: null });
  });

  test('famousNameInNasab rejects a non-boolean', () => {
    expect(updateIndividualSchema.safeParse({ famousNameInNasab: 'yes' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Audit snapshot
// ---------------------------------------------------------------------------

describe('snapshotIndividual — famousName fields', () => {
  test('carries famousName and famousNameInNasab', () => {
    const s = snapshotIndividual({ id: 'i', famousName: 'الشهير', famousNameInNasab: false });
    expect(s.famousName).toBe('الشهير');
    expect(s.famousNameInNasab).toBe(false);
  });

  test('absent fields snapshot as null', () => {
    const s = snapshotIndividual({ id: 'i' });
    expect(s.famousName).toBeNull();
    expect(s.famousNameInNasab).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createIndividual (shared by POST and move-to-new-father)
// ---------------------------------------------------------------------------

describe('createIndividual — name feature flags', () => {
  const input = {
    givenName: 'علي',
    sex: 'M' as const,
    isPrivate: false,
    kunya: 'أبو حسن',
    famousName: 'الشهير',
    famousNameInNasab: true,
  };

  test('famous-name feature off drops both famous-name fields', async () => {
    await createIndividual({ individual: { create: mockIndividualCreate } } as never, {
      treeId, userId, input, workspaceKey: TEST_KEY, isUndo: false,
      features: { enableKunya: true, enableFamousName: false },
    });
    const data = mockIndividualCreate.mock.calls[0][0].data;
    expect('famousName' in data).toBe(false);
    expect('famousNameInNasab' in data).toBe(false);
  });

  test('kunya feature off still drops kunya', async () => {
    await createIndividual({ individual: { create: mockIndividualCreate } } as never, {
      treeId, userId, input, workspaceKey: TEST_KEY, isUndo: false,
      features: { enableKunya: false, enableFamousName: true },
    });
    expect('kunya' in mockIndividualCreate.mock.calls[0][0].data).toBe(false);
  });

  test('famous-name feature off keeps it out of the audit snapshot', async () => {
    const { auditEntry } = await createIndividual({ individual: { create: mockIndividualCreate } } as never, {
      treeId, userId, input, workspaceKey: TEST_KEY, isUndo: false,
      features: { enableKunya: true, enableFamousName: false },
    });
    const snap = decryptSnapshot<IndividualSnapshot>(auditEntry.snapshotAfter, TEST_KEY)!;
    expect(snap.famousName).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// POST /individuals
// ---------------------------------------------------------------------------

describe('POST individuals — famousName', () => {
  const body = { givenName: 'علي', sex: 'M', famousName: 'الشهير', famousNameInNasab: true };

  test('toggle off → famousName is not persisted', async () => {
    setWorkspace({ enableFamousName: false });
    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');
    const res = await POST(postReq(body), { params: Promise.resolve({ id: wsId }) });
    expect(res.status).toBe(201);
    expect('famousName' in mockIndividualCreate.mock.calls[0][0].data).toBe(false);
  });

  test('toggle off → famousNameInNasab is not persisted', async () => {
    setWorkspace({ enableFamousName: false });
    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');
    await POST(postReq(body), { params: Promise.resolve({ id: wsId }) });
    expect('famousNameInNasab' in mockIndividualCreate.mock.calls[0][0].data).toBe(false);
  });

  test('toggle on → famousName column is ciphertext under the workspace key', async () => {
    setWorkspace({ enableFamousName: true });
    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');
    await POST(postReq(body), { params: Promise.resolve({ id: wsId }) });
    const data = mockIndividualCreate.mock.calls[0][0].data;
    expect(Buffer.isBuffer(data.famousName)).toBe(true);
    expect(decryptFieldNullable(data.famousName, TEST_KEY)).toBe('الشهير');
  });

  test('toggle on → famousNameInNasab stored as the plain boolean', async () => {
    setWorkspace({ enableFamousName: true });
    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');
    await POST(postReq(body), { params: Promise.resolve({ id: wsId }) });
    expect(mockIndividualCreate.mock.calls[0][0].data.famousNameInNasab).toBe(true);
  });

  test('response carries plaintext famousName', async () => {
    setWorkspace({ enableFamousName: true });
    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');
    const res = await POST(postReq(body), { params: Promise.resolve({ id: wsId }) });
    const json = await res.json();
    expect(json.data.famousName).toBe('الشهير');
  });

  test('response never contains a serialized Buffer', async () => {
    setWorkspace({ enableFamousName: true, enableKunya: true });
    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');
    const res = await POST(postReq({ ...body, kunya: 'أبو حسن', notes: 'ن' }), { params: Promise.resolve({ id: wsId }) });
    expect(containsBuffer(await res.json())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PATCH /individuals/[individualId]
// ---------------------------------------------------------------------------

describe('PATCH individual — famousName', () => {
  const params = { params: Promise.resolve({ id: wsId, individualId: indId }) };
  const body = { famousName: 'الجديد', famousNameInNasab: false };

  test('toggle off → famousName is not updated', async () => {
    setWorkspace({ enableFamousName: false });
    const { PATCH } = await import('@/app/api/workspaces/[id]/tree/individuals/[individualId]/route');
    const res = await PATCH(patchReq(body), params);
    expect(res.status).toBe(200);
    expect('famousName' in mockIndividualUpdate.mock.calls[0][0].data).toBe(false);
  });

  test('toggle off → famousNameInNasab is not updated', async () => {
    setWorkspace({ enableFamousName: false });
    const { PATCH } = await import('@/app/api/workspaces/[id]/tree/individuals/[individualId]/route');
    await PATCH(patchReq(body), params);
    expect('famousNameInNasab' in mockIndividualUpdate.mock.calls[0][0].data).toBe(false);
  });

  test('toggle off → kunya is still not updated', async () => {
    setWorkspace({ enableFamousName: true, enableKunya: false });
    const { PATCH } = await import('@/app/api/workspaces/[id]/tree/individuals/[individualId]/route');
    await PATCH(patchReq({ kunya: 'أبو حسن' }), params);
    expect('kunya' in mockIndividualUpdate.mock.calls[0][0].data).toBe(false);
  });

  test('toggle on → famousName column is ciphertext under the workspace key', async () => {
    setWorkspace({ enableFamousName: true });
    const { PATCH } = await import('@/app/api/workspaces/[id]/tree/individuals/[individualId]/route');
    await PATCH(patchReq(body), params);
    const data = mockIndividualUpdate.mock.calls[0][0].data;
    expect(Buffer.isBuffer(data.famousName)).toBe(true);
    expect(decryptFieldNullable(data.famousName, TEST_KEY)).toBe('الجديد');
  });

  test('response carries plaintext famousName', async () => {
    setWorkspace({ enableFamousName: true });
    const { PATCH } = await import('@/app/api/workspaces/[id]/tree/individuals/[individualId]/route');
    const res = await PATCH(patchReq(body), params);
    const json = await res.json();
    expect(json.data.famousName).toBe('الجديد');
  });

  test('response never contains a serialized Buffer', async () => {
    setWorkspace({ enableFamousName: true });
    const { PATCH } = await import('@/app/api/workspaces/[id]/tree/individuals/[individualId]/route');
    const res = await PATCH(patchReq(body), params);
    expect(containsBuffer(await res.json())).toBe(false);
  });

  test('audit snapshotAfter carries the new famousName', async () => {
    setWorkspace({ enableFamousName: true });
    const { PATCH } = await import('@/app/api/workspaces/[id]/tree/individuals/[individualId]/route');
    await PATCH(patchReq(body), params);
    const log = mockTreeEditLogCreate.mock.calls[0][0].data;
    const after = decryptSnapshot<IndividualSnapshot>(log.snapshotAfter, TEST_KEY)!;
    expect(after.famousName).toBe('الجديد');
  });

  test('audit snapshotBefore carries the old famousName', async () => {
    setWorkspace({ enableFamousName: true });
    const { PATCH } = await import('@/app/api/workspaces/[id]/tree/individuals/[individualId]/route');
    await PATCH(patchReq(body), params);
    const log = mockTreeEditLogCreate.mock.calls[0][0].data;
    const before = decryptSnapshot<IndividualSnapshot>(log.snapshotBefore, TEST_KEY)!;
    expect(before.famousName).toBe('القديم');
  });
});

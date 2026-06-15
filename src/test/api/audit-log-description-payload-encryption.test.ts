/**
 * Phase 10b follow-up (task #22) integration test: POST /individuals and
 * DELETE /individuals write encrypted `description` + `payload` to
 * `TreeEditLog`, and the captured Buffers round-trip through the decrypt
 * helpers to plaintext.
 *
 * Also includes a raw-bytes regression check: the captured description
 * Buffer does NOT contain the UTF-8 bytes of a known Arabic name, proving
 * that the write path is actually encrypting, not pass-through.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  generateWorkspaceKey,
  wrapKey,
} from '@/lib/crypto/workspace-encryption';
import { getMasterKey } from '@/lib/crypto/master-key';
import {
  decryptAuditDescription,
  decryptAuditPayload,
  encryptAuditDescription,
  encryptAuditPayload,
} from '@/lib/tree/audit';

// ---------------------------------------------------------------------------
// Shared key — wrapped with the real master key so the route's real
// `getWorkspaceKey` path unwraps successfully.
// ---------------------------------------------------------------------------

const PLAINTEXT_KEY = generateWorkspaceKey();
const WRAPPED_KEY = wrapKey(PLAINTEXT_KEY, getMasterKey());

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}));

vi.mock('@/lib/api/rate-limit', () => ({
  treeMutateLimiter: { check: () => ({ allowed: true, retryAfterSeconds: 0 }) },
  auditLogLimiter: { check: () => ({ allowed: true, retryAfterSeconds: 0 }) },
  rateLimitResponse: () =>
    new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 }),
}));

const mockMembershipFindUnique = vi.fn();
const mockWorkspaceFindUnique = vi.fn();
const mockFamilyTreeFindUnique = vi.fn();
const mockFamilyTreeUpdate = vi.fn();
const mockIndividualCreate = vi.fn();
const mockIndividualFindFirst = vi.fn();
const mockIndividualDeleteMany = vi.fn();
const mockFamilyUpdateMany = vi.fn();
const mockFamilyDeleteMany = vi.fn();
const mockBranchPointerUpdateMany = vi.fn();
const mockBranchShareTokenUpdateMany = vi.fn();
const mockRadaFamilyUpdateMany = vi.fn();
const mockUserTreeLinkDeleteMany = vi.fn();
const mockWorkspaceInvitationUpdateMany = vi.fn();
const mockTreeEditLogCreate = vi.fn();
const mockTreeEditLogFindMany = vi.fn();
const mockTreeEditLogCount = vi.fn();
const mockBranchPointerCount = vi.fn();
const mockTransaction = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: {
      findUnique: (...args: unknown[]) => mockMembershipFindUnique(...args),
    },
    workspace: {
      findUnique: (...args: unknown[]) => mockWorkspaceFindUnique(...args),
    },
    familyTree: {
      findUnique: (...args: unknown[]) => mockFamilyTreeFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFamilyTreeFindUnique(...args),
      update: (...args: unknown[]) => mockFamilyTreeUpdate(...args),
    },
    individual: {
      create: (...args: unknown[]) => mockIndividualCreate(...args),
      findFirst: (...args: unknown[]) => mockIndividualFindFirst(...args),
      deleteMany: (...args: unknown[]) => mockIndividualDeleteMany(...args),
    },
    family: {
      updateMany: (...args: unknown[]) => mockFamilyUpdateMany(...args),
      deleteMany: (...args: unknown[]) => mockFamilyDeleteMany(...args),
    },
    branchPointer: {
      updateMany: (...args: unknown[]) => mockBranchPointerUpdateMany(...args),
      count: (...args: unknown[]) => mockBranchPointerCount(...args),
    },
    branchShareToken: {
      updateMany: (...args: unknown[]) => mockBranchShareTokenUpdateMany(...args),
    },
    radaFamily: {
      updateMany: (...args: unknown[]) => mockRadaFamilyUpdateMany(...args),
    },
    userTreeLink: {
      deleteMany: (...args: unknown[]) => mockUserTreeLinkDeleteMany(...args),
    },
    workspaceInvitation: {
      updateMany: (...args: unknown[]) => mockWorkspaceInvitationUpdateMany(...args),
    },
    treeEditLog: {
      create: (...args: unknown[]) => mockTreeEditLogCreate(...args),
      findMany: (...args: unknown[]) => mockTreeEditLogFindMany(...args),
      count: (...args: unknown[]) => mockTreeEditLogCount(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

// Mock branch pointer queries — not pointed for these tests
vi.mock('@/lib/tree/branch-pointer-queries', () => ({
  isPointedIndividualInWorkspace: vi.fn().mockResolvedValue(false),
  getActivePointersForWorkspace: vi.fn().mockResolvedValue([]),
}));

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server';

const wsId = 'ws-audit-desc-payload-1';
const treeId = 'tree-audit-desc-payload-1';
const userId = 'user-audit-desc-payload-1';

function makeJsonRequest(body: unknown, pathSuffix = '') {
  return new NextRequest(
    `http://localhost:4000/api/workspaces/${wsId}/tree/individuals${pathSuffix}`,
    {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
}

function mockAuth() {
  mockGetUser.mockResolvedValue({
    data: {
      user: {
        id: userId,
        email: 't@x.com',
        user_metadata: { display_name: 'T' },
      },
    },
    error: null,
  });
}

function mockTreeEditor() {
  mockMembershipFindUnique.mockResolvedValue({
    userId,
    workspaceId: wsId,
    role: 'workspace_admin',
    permissions: [],
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Phase 10b follow-up (task #22) — description + payload on write', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    mockTreeEditor();

    // Workspace key + enableKunya for the individual POST route
    mockWorkspaceFindUnique.mockResolvedValue({
      enableKunya: true,
      encryptedKey: WRAPPED_KEY,
    });

    mockFamilyTreeFindUnique.mockResolvedValue({
      id: treeId,
      workspaceId: wsId,
      lastModifiedAt: new Date(),
    });

    mockIndividualCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'ind-new-desc-1',
      treeId,
      gedcomId: null,
      sex: data.sex ?? null,
      isPrivate: data.isPrivate ?? false,
      isDeceased: data.isDeceased ?? false,
      createdById: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      birthPlaceId: data.birthPlaceId ?? null,
      deathPlaceId: data.deathPlaceId ?? null,
      ...data,
    }));

    mockTreeEditLogCreate.mockResolvedValue({});
    mockFamilyTreeUpdate.mockResolvedValue({});
  });

  test('POST /individuals stores an encrypted description that decrypts to plaintext', async () => {
    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');
    const response = await POST(
      makeJsonRequest({
        givenName: 'أحمد',
        sex: 'M',
        isPrivate: false,
      }),
      { params: Promise.resolve({ id: wsId }) },
    );

    expect(response.status).toBe(201);
    expect(mockTreeEditLogCreate).toHaveBeenCalledTimes(1);

    const logData = mockTreeEditLogCreate.mock.calls[0][0].data;

    // description is a Buffer (not a string)
    expect(Buffer.isBuffer(logData.description)).toBe(true);
    // Decrypts to the Arabic description containing the given name
    const plaintext = decryptAuditDescription(logData.description, PLAINTEXT_KEY);
    expect(plaintext).toContain('أحمد');
    // The quoted-name form is produced by buildAuditDescription
    expect(plaintext).toContain('إضافة');
  });

  test('DELETE /individuals cascade stores an encrypted payload that decrypts to the targetName', async () => {
    // Simulate a cascade delete: the individual has affectedIds > 0, so
    // the route emits the payload with the targetName PII field.
    const existingIndividual = {
      id: 'ind-to-delete',
      treeId,
      gedcomId: null,
      sex: 'F',
      // encrypted Bytes (but the getTreeIndividualDecrypted helper will
      // pass through strings because our mock returns a plain string)
      givenName: 'فاطمة',
      surname: null,
      fullName: null,
      birthDate: null,
      birthPlace: null,
      birthDescription: null,
      birthNotes: null,
      birthHijriDate: null,
      deathDate: null,
      deathPlace: null,
      deathDescription: null,
      deathNotes: null,
      deathHijriDate: null,
      kunya: null,
      notes: null,
      isPrivate: false,
      isDeceased: false,
      createdById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      birthPlaceId: null,
      deathPlaceId: null,
    };
    mockIndividualFindFirst.mockResolvedValue(existingIndividual);

    // Set up the transaction callback to capture the treeEditLog.create
    // call inside the $transaction, with a mocked cascade impact.
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const fakeTx = {
        branchPointer: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        branchShareToken: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        radaFamily: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        userTreeLink: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        workspaceInvitation: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        family: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        individual: {
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        treeEditLog: {
          create: mockTreeEditLogCreate,
        },
        familyTree: {
          update: mockFamilyTreeUpdate,
        },
      };
      return callback(fakeTx);
    });

    // Mock cascade-delete to return a non-empty impact so the route takes
    // the payload-populated branch with targetName.
    vi.doMock('@/lib/tree/cascade-delete', async () => {
      const actual = await vi.importActual<typeof import('@/lib/tree/cascade-delete')>(
        '@/lib/tree/cascade-delete',
      );
      return {
        ...actual,
        computeDeleteImpact: vi.fn(() => ({
          hasImpact: true,
          affectedIds: new Set(['aff-1', 'aff-2']),
          affectedNames: [],
          truncated: false,
        })),
        computeVersionHash: vi.fn(() => 'test-version-hash'),
      };
    });

    // Mock dbTreeToGedcomData so we don't need to build a real tree
    vi.doMock('@/lib/tree/mapper', async () => {
      const actual = await vi.importActual<typeof import('@/lib/tree/mapper')>('@/lib/tree/mapper');
      return {
        ...actual,
        dbTreeToGedcomData: vi.fn(() => ({ individuals: {}, families: {} })),
      };
    });

    // For cascade delete with affected, the request must include the
    // matching versionHash in the body (and confirmationName if >= 5).
    const request = new NextRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/individuals/ind-to-delete`,
      {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer valid-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ versionHash: 'test-version-hash' }),
      },
    );

    const { DELETE } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const response = await DELETE(request, {
      params: Promise.resolve({ id: wsId, individualId: 'ind-to-delete' }),
    });

    // The response is 204 on successful cascade delete
    expect([204, 200]).toContain(response.status);

    // Find the cascade_delete entry in the captured treeEditLog.create calls
    const calls = mockTreeEditLogCreate.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const cascadeCall = calls.find((c) => c[0]?.data?.action === 'cascade_delete');
    expect(cascadeCall).toBeDefined();

    const logData = cascadeCall![0].data;
    expect(Buffer.isBuffer(logData.payload)).toBe(true);

    const decoded = decryptAuditPayload(logData.payload, PLAINTEXT_KEY) as {
      targetName: string;
      targetIndividualId: string;
      totalAffectedCount: number;
    };
    expect(decoded.targetName).toBe('فاطمة');
    expect(decoded.targetIndividualId).toBe('ind-to-delete');
    expect(decoded.totalAffectedCount).toBe(2);

    // description also encrypted + decryptable
    expect(Buffer.isBuffer(logData.description)).toBe(true);
    const description = decryptAuditDescription(logData.description, PLAINTEXT_KEY);
    expect(description).toContain('فاطمة');
  });

  test('raw bytes: captured description buffer does NOT contain plaintext UTF-8 of the name', async () => {
    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');
    await POST(
      makeJsonRequest({
        givenName: 'خديجة',
        sex: 'F',
        isPrivate: false,
      }),
      { params: Promise.resolve({ id: wsId }) },
    );

    const logData = mockTreeEditLogCreate.mock.calls[0][0].data;
    const buf = logData.description as Buffer;

    // "خديجة" as UTF-8 bytes
    const plaintextNameBytes = Buffer.from('خديجة', 'utf8');
    expect(buf.includes(plaintextNameBytes)).toBe(false);

    // The full Arabic description "إضافة شخص \"خديجة\"" as UTF-8 bytes
    const plaintextDescBytes = Buffer.from('إضافة شخص "خديجة"', 'utf8');
    expect(buf.includes(plaintextDescBytes)).toBe(false);

    // Verifies by contrast that the decrypt path DOES recover the plaintext
    const decrypted = decryptAuditDescription(buf, PLAINTEXT_KEY);
    expect(decrypted).toContain('خديجة');
  });
});

// ---------------------------------------------------------------------------
// Phase 10b follow-up (task #23): GET /audit-log must decrypt stored
// description + payload Bytes before returning them to the admin UI.
// This exercises the FULL production path including the real workspace key
// unwrap from the master key, matching how the deployed app will run.
// ---------------------------------------------------------------------------

describe('Phase 10b follow-up (task #23) — GET /audit-log decrypts on read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    // Admin role so the audit log route admits the request
    mockMembershipFindUnique.mockResolvedValue({
      userId,
      workspaceId: wsId,
      role: 'workspace_admin',
      permissions: [],
    });
    // Audit log feature enabled + real wrapped workspace key
    mockWorkspaceFindUnique.mockResolvedValue({
      id: wsId,
      enableAuditLog: true,
      enableVersionControl: false,
      encryptedKey: WRAPPED_KEY,
    });
    mockFamilyTreeFindUnique.mockResolvedValue({
      id: treeId,
      workspaceId: wsId,
      lastModifiedAt: new Date(),
    });
  });

  test('decrypts description + payload end-to-end with real workspace key', async () => {
    // Build a realistic fixture row as it would appear in the DB: Buffers
    // encrypted with PLAINTEXT_KEY (which the route will reach via the
    // real getWorkspaceKey → unwrap(WRAPPED_KEY, masterKey) path).
    const sensitivePayload = {
      targetName: 'فاطمة',
      targetIndividualId: 'ind-to-delete',
      totalAffectedCount: 3,
      affectedIds: ['aff-1', 'aff-2', 'aff-3'],
    };
    const encryptedDesc = encryptAuditDescription(
      'cascade_delete',
      'individual',
      'فاطمة',
      PLAINTEXT_KEY,
    );
    const encryptedPayload = encryptAuditPayload(sensitivePayload, PLAINTEXT_KEY);

    mockTreeEditLogFindMany.mockResolvedValue([
      {
        id: 'log-e2e-1',
        treeId,
        userId,
        action: 'cascade_delete',
        entityType: 'individual',
        entityId: 'ind-to-delete',
        snapshotBefore: null,
        snapshotAfter: null,
        description: encryptedDesc,
        payload: encryptedPayload,
        timestamp: new Date(),
        user: { displayName: 'Admin', avatarUrl: null },
      },
    ]);
    mockTreeEditLogCount.mockResolvedValue(1);

    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const request = new NextRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log`,
      {
        method: 'GET',
        headers: { authorization: 'Bearer valid-token' },
      },
    );
    const response = await GET(request, { params: Promise.resolve({ id: wsId }) });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data).toHaveLength(1);
    const row = body.data[0];

    // description is decrypted plaintext Arabic
    expect(typeof row.description).toBe('string');
    expect(row.description).toContain('فاطمة');

    // payload is decrypted plaintext object — deep equality check
    expect(row.payload).toEqual(sensitivePayload);
    expect(row.payload.targetName).toBe('فاطمة');

    // No Buffer/base64 leakage anywhere in the serialized response
    const rawJson = JSON.stringify(body);
    // A Buffer serializes to { type: 'Buffer', data: [...] } — assert absent
    expect(rawJson).not.toContain('"type":"Buffer"');
    // And no base64-ish blob pattern for description
    expect(row.description).not.toMatch(/^[A-Za-z0-9+/]{20,}={0,2}$/);
  });

  test('null payload passes through as null without touching decrypt', async () => {
    const encryptedDesc = encryptAuditDescription(
      'update',
      'individual',
      'أحمد',
      PLAINTEXT_KEY,
    );

    mockTreeEditLogFindMany.mockResolvedValue([
      {
        id: 'log-null-payload-1',
        treeId,
        userId,
        action: 'update',
        entityType: 'individual',
        entityId: 'ind-1',
        snapshotBefore: null,
        snapshotAfter: null,
        description: encryptedDesc,
        payload: null,
        timestamp: new Date(),
        user: { displayName: 'Admin', avatarUrl: null },
      },
    ]);
    mockTreeEditLogCount.mockResolvedValue(1);

    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const request = new NextRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log`,
      {
        method: 'GET',
        headers: { authorization: 'Bearer valid-token' },
      },
    );
    const response = await GET(request, { params: Promise.resolve({ id: wsId }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data[0].payload).toBeNull();
    expect(body.data[0].description).toBe('تعديل شخص "أحمد"');
  });

  test('null description passes through as null without touching decrypt', async () => {
    const sensitivePayload = { info: 'value' };
    const encryptedPayload = encryptAuditPayload(sensitivePayload, PLAINTEXT_KEY);

    mockTreeEditLogFindMany.mockResolvedValue([
      {
        id: 'log-null-desc-1',
        treeId,
        userId,
        action: 'import',
        entityType: 'tree',
        entityId: treeId,
        snapshotBefore: null,
        snapshotAfter: null,
        description: null,
        payload: encryptedPayload,
        timestamp: new Date(),
        user: { displayName: 'Admin', avatarUrl: null },
      },
    ]);
    mockTreeEditLogCount.mockResolvedValue(1);

    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const request = new NextRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log`,
      {
        method: 'GET',
        headers: { authorization: 'Bearer valid-token' },
      },
    );
    const response = await GET(request, { params: Promise.resolve({ id: wsId }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data[0].description).toBeNull();
    expect(body.data[0].payload).toEqual(sensitivePayload);
  });
});

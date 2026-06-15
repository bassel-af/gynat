import { describe, test, expect, vi, beforeEach } from 'vitest';
import { encryptAuditDescription, encryptAuditPayload } from '@/lib/tree/audit';

// Phase 10b follow-up (task #23): audit log read route now decrypts
// description + payload. Fixtures use this key (matches the mocked
// `getWorkspaceKey` below).
const TEST_KEY = Buffer.alloc(32, 7);

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports that use them
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}));

const mockMembershipFindUnique = vi.fn();
const mockWorkspaceFindUnique = vi.fn();
const mockFamilyTreeFindUnique = vi.fn();
const mockTreeEditLogFindMany = vi.fn();
const mockTreeEditLogCount = vi.fn();

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
    },
    treeEditLog: {
      findMany: (...args: unknown[]) => mockTreeEditLogFindMany(...args),
      count: (...args: unknown[]) => mockTreeEditLogCount(...args),
    },
  },
}));

// Mock branch pointer queries (not relevant for audit log tests)
vi.mock('@/lib/tree/branch-pointer-queries', () => ({
  isPointedIndividualInWorkspace: vi.fn().mockResolvedValue(false),
  getActivePointersForWorkspace: vi.fn().mockResolvedValue([]),
}));

// Phase 10b: stub getWorkspaceKey so the audit log route's decrypt pass
// gets a fixed buffer. Snapshots in these tests are plain JS objects —
// `decryptSnapshot` passes them through the legacy-sentinel check unchanged.
vi.mock('@/lib/tree/encryption', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tree/encryption')>('@/lib/tree/encryption');
  return {
    ...actual,
    getWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 7)),
    getOrCreateWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 7)),
  };
});

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const wsId = 'ws-audit-test-1';
const treeId = 'tree-audit-1';

const routeParams = { params: Promise.resolve({ id: wsId }) };

const fakeAdminUser = {
  id: 'user-admin-1',
  email: 'admin@example.com',
  user_metadata: { display_name: 'Admin' },
};

const fakeEditorUser = {
  id: 'user-editor-1',
  email: 'editor@example.com',
  user_metadata: { display_name: 'Editor' },
};

const fakeMemberUser = {
  id: 'user-member-1',
  email: 'member@example.com',
  user_metadata: { display_name: 'Member' },
};

function makeRequest(url: string) {
  return new NextRequest(url, {
    method: 'GET',
    headers: {
      authorization: 'Bearer valid-token',
    },
  });
}

function mockAuth(user = fakeAdminUser) {
  mockGetUser.mockResolvedValue({ data: { user }, error: null });
}

function mockNoAuth() {
  mockGetUser.mockResolvedValue({
    data: { user: null },
    error: { message: 'Invalid token' },
  });
}

function mockAdmin() {
  mockMembershipFindUnique.mockResolvedValue({
    userId: fakeAdminUser.id,
    workspaceId: wsId,
    role: 'workspace_admin',
    permissions: [],
  });
}

function mockTreeEditorMember() {
  mockAuth(fakeEditorUser);
  mockMembershipFindUnique.mockResolvedValue({
    userId: fakeEditorUser.id,
    workspaceId: wsId,
    role: 'workspace_member',
    permissions: ['tree_editor'],
  });
}

function mockRegularMember() {
  mockAuth(fakeMemberUser);
  mockMembershipFindUnique.mockResolvedValue({
    userId: fakeMemberUser.id,
    workspaceId: wsId,
    role: 'workspace_member',
    permissions: [],
  });
}

function mockWorkspaceWithAuditEnabled() {
  mockWorkspaceFindUnique.mockResolvedValue({
    id: wsId,
    enableAuditLog: true,
    enableVersionControl: false,
  });
}

function mockWorkspaceWithAuditDisabled() {
  mockWorkspaceFindUnique.mockResolvedValue({
    id: wsId,
    enableAuditLog: false,
    enableVersionControl: false,
  });
}

function mockExistingTree() {
  mockFamilyTreeFindUnique.mockResolvedValue({
    id: treeId,
    workspaceId: wsId,
    lastModifiedAt: new Date(),
  });
}

function mockAuditLogEntries(count: number) {
  const entries = Array.from({ length: count }, (_, i) => ({
    id: `log-${i + 1}`,
    treeId,
    userId: fakeAdminUser.id,
    action: 'update',
    entityType: 'individual',
    entityId: `ind-${i + 1}`,
    snapshotBefore: { givenName: `Old Name ${i}` },
    snapshotAfter: { givenName: `New Name ${i}` },
    // Phase 10b follow-up (task #23): description + payload are stored
    // as encrypted Bytes; the read route decrypts before returning.
    description: encryptAuditDescription('update', 'individual', `Name ${i}`, TEST_KEY),
    payload: null,
    timestamp: new Date(Date.now() - i * 60_000),
    user: { displayName: 'Admin', avatarUrl: null },
  }));
  mockTreeEditLogFindMany.mockResolvedValue(entries);
  mockTreeEditLogCount.mockResolvedValue(count);
  return entries;
}

// ============================================================================
// GET /api/workspaces/[id]/tree/audit-log — Authorization
// ============================================================================

describe('GET /api/workspaces/[id]/tree/audit-log — Authorization', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns 401 for unauthenticated user', async () => {
    mockNoAuth();
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log`,
    );
    const res = await GET(req, routeParams);
    expect(res.status).toBe(401);
  });

  test('returns 403 for regular member (not admin)', async () => {
    mockRegularMember();
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log`,
    );
    const res = await GET(req, routeParams);
    expect(res.status).toBe(403);
  });

  test('returns 403 for tree_editor who is not admin', async () => {
    mockTreeEditorMember();
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log`,
    );
    const res = await GET(req, routeParams);
    expect(res.status).toBe(403);
  });

  test('returns 403 when enableAuditLog is disabled (even for admin)', async () => {
    mockAuth();
    mockAdmin();
    mockWorkspaceWithAuditDisabled();
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log`,
    );
    const res = await GET(req, routeParams);
    expect(res.status).toBe(403);
  });

  test('returns 200 for admin when enableAuditLog is enabled', async () => {
    mockAuth();
    mockAdmin();
    mockWorkspaceWithAuditEnabled();
    mockExistingTree();
    mockAuditLogEntries(0);
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log`,
    );
    const res = await GET(req, routeParams);
    expect(res.status).toBe(200);
  });
});

// ============================================================================
// GET /api/workspaces/[id]/tree/audit-log — Pagination
// ============================================================================

describe('GET /api/workspaces/[id]/tree/audit-log — Pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    mockAdmin();
    mockWorkspaceWithAuditEnabled();
    mockExistingTree();
  });

  test('returns default page size of 20 when no limit specified', async () => {
    mockAuditLogEntries(20);
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log`,
    );
    const res = await GET(req, routeParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(20);
    expect(body.limit).toBe(20);
  });

  test('respects custom page size up to 50', async () => {
    mockAuditLogEntries(30);
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log?limit=30`,
    );
    const res = await GET(req, routeParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(30);
  });

  test('rejects page size greater than 50', async () => {
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log?limit=100`,
    );
    const res = await GET(req, routeParams);
    expect(res.status).toBe(400);
  });

  test('rejects page size of 0 or negative', async () => {
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log?limit=0`,
    );
    const res = await GET(req, routeParams);
    expect(res.status).toBe(400);
  });

  test('returns total and pagination metadata', async () => {
    mockAuditLogEntries(5);
    mockTreeEditLogCount.mockResolvedValue(25);
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log?limit=5&page=1`,
    );
    const res = await GET(req, routeParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(25);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(5);
  });

  test('rejects non-numeric page parameter', async () => {
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log?page=abc`,
    );
    const res = await GET(req, routeParams);
    expect(res.status).toBe(400);
  });
});

// ============================================================================
// GET /api/workspaces/[id]/tree/audit-log — Filtering
// ============================================================================

describe('GET /api/workspaces/[id]/tree/audit-log — Filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    mockAdmin();
    mockWorkspaceWithAuditEnabled();
    mockExistingTree();
  });

  test('filters by valid action type', async () => {
    mockAuditLogEntries(1);
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log?action=create`,
    );
    const res = await GET(req, routeParams);
    expect(res.status).toBe(200);
  });

  test('rejects invalid action type', async () => {
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log?action=hack`,
    );
    const res = await GET(req, routeParams);
    expect(res.status).toBe(400);
  });

  test('filters by valid entity type', async () => {
    mockAuditLogEntries(1);
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log?entityType=individual`,
    );
    const res = await GET(req, routeParams);
    expect(res.status).toBe(200);
  });

  test('rejects invalid entity type', async () => {
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log?entityType=hacked_table`,
    );
    const res = await GET(req, routeParams);
    expect(res.status).toBe(400);
  });

  test('filters by userId with valid UUID', async () => {
    mockAuditLogEntries(1);
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log?userId=550e8400-e29b-41d4-a716-446655440000`,
    );
    const res = await GET(req, routeParams);
    expect(res.status).toBe(200);
  });

  test('rejects userId that is not a valid UUID', async () => {
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log?userId=not-a-uuid`,
    );
    const res = await GET(req, routeParams);
    expect(res.status).toBe(400);
  });

  test('accepts valid date range filters', async () => {
    mockAuditLogEntries(1);
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log?from=2026-01-01T00:00:00.000Z&to=2026-04-06T23:59:59.999Z`,
    );
    const res = await GET(req, routeParams);
    expect(res.status).toBe(200);
  });

  test('rejects invalid date format in from parameter', async () => {
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log?from=not-a-date`,
    );
    const res = await GET(req, routeParams);
    expect(res.status).toBe(400);
  });

  test('rejects invalid date format in to parameter', async () => {
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log?to=not-a-date`,
    );
    const res = await GET(req, routeParams);
    expect(res.status).toBe(400);
  });

  test('accepts entityId filter with valid UUID', async () => {
    mockAuditLogEntries(1);
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log?entityId=550e8400-e29b-41d4-a716-446655440000`,
    );
    const res = await GET(req, routeParams);
    expect(res.status).toBe(200);
  });

  test('accepts multiple filters combined', async () => {
    mockAuditLogEntries(1);
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log?action=update&entityType=individual&limit=10`,
    );
    const res = await GET(req, routeParams);
    expect(res.status).toBe(200);
  });
});

// ============================================================================
// GET /api/workspaces/[id]/tree/audit-log — Response shape
// ============================================================================

describe('GET /api/workspaces/[id]/tree/audit-log — Response shape', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    mockAdmin();
    mockWorkspaceWithAuditEnabled();
    mockExistingTree();
  });

  test('returns entries ordered by timestamp descending', async () => {
    mockAuditLogEntries(3);
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log`,
    );
    const res = await GET(req, routeParams);
    const body = await res.json();

    expect(body.data).toHaveLength(3);
    const timestamps = body.data.map((e: { timestamp: string }) => new Date(e.timestamp).getTime());
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i - 1]).toBeGreaterThanOrEqual(timestamps[i]);
    }
  });

  test('each entry includes actor display name', async () => {
    mockAuditLogEntries(1);
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log`,
    );
    const res = await GET(req, routeParams);
    const body = await res.json();

    const entry = body.data[0];
    expect(entry.user).toBeDefined();
    expect(entry.user.displayName).toBeDefined();
  });

  test('each entry includes action, entityType, entityId, timestamp, description', async () => {
    mockAuditLogEntries(1);
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log`,
    );
    const res = await GET(req, routeParams);
    const body = await res.json();

    const entry = body.data[0];
    expect(entry).toHaveProperty('action');
    expect(entry).toHaveProperty('entityType');
    expect(entry).toHaveProperty('entityId');
    expect(entry).toHaveProperty('timestamp');
    expect(entry).toHaveProperty('description');
  });

  test('entries include snapshotBefore and snapshotAfter when present', async () => {
    mockAuditLogEntries(1);
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log`,
    );
    const res = await GET(req, routeParams);
    const body = await res.json();

    const entry = body.data[0];
    expect(entry).toHaveProperty('snapshotBefore');
    expect(entry).toHaveProperty('snapshotAfter');
  });

  test('timestamp is serialized as ISO string', async () => {
    mockAuditLogEntries(1);
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log`,
    );
    const res = await GET(req, routeParams);
    const body = await res.json();

    const entry = body.data[0];
    // Should be a valid ISO date string
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
  });

  // Phase 10b follow-up (task #23): description + payload on stored rows
  // are encrypted Bytes. The read route must decrypt them before returning
  // them to the admin UI, so the response body must contain plaintext.
  test('decrypts stored description Bytes into plaintext Arabic string', async () => {
    mockAuditLogEntries(1);
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log`,
    );
    const res = await GET(req, routeParams);
    const body = await res.json();

    const entry = body.data[0];
    // Plaintext built by `buildAuditDescription('update', 'individual', 'Name 0')`
    expect(entry.description).toBe('تعديل شخص "Name 0"');
    // Must NOT leak the raw encrypted Buffer shape
    expect(typeof entry.description).toBe('string');
  });

  test('decrypts stored payload Bytes into plaintext JSON object', async () => {
    // Seed one entry with an encrypted payload containing PII-shaped fields
    const sensitivePayload = {
      targetName: 'فاطمة',
      targetIndividualId: 'ind-to-delete',
      totalAffectedCount: 3,
    };
    const entry = {
      id: 'log-payload-1',
      treeId,
      userId: fakeAdminUser.id,
      action: 'cascade_delete',
      entityType: 'individual',
      entityId: 'ind-to-delete',
      snapshotBefore: { id: 'ind-to-delete' },
      snapshotAfter: null,
      description: encryptAuditDescription(
        'cascade_delete',
        'individual',
        'فاطمة',
        TEST_KEY,
      ),
      payload: encryptAuditPayload(sensitivePayload, TEST_KEY),
      timestamp: new Date(),
      user: { displayName: 'Admin', avatarUrl: null },
    };
    mockTreeEditLogFindMany.mockResolvedValue([entry]);
    mockTreeEditLogCount.mockResolvedValue(1);

    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log`,
    );
    const res = await GET(req, routeParams);
    expect(res.status).toBe(200);
    const body = await res.json();

    const row = body.data[0];
    // description decrypts and contains the Arabic target name
    expect(row.description).toContain('فاطمة');
    // payload decrypts into a plain JS object
    expect(row.payload).toEqual(sensitivePayload);
    // And the Buffer never leaks through
    expect(row.payload).not.toHaveProperty('type', 'Buffer');
    expect(Buffer.isBuffer(row.payload)).toBe(false);
  });

  test('null payload on a row passes through as null (not decrypted)', async () => {
    mockAuditLogEntries(1);
    const { GET } = await import(
      '@/app/api/workspaces/[id]/tree/audit-log/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/audit-log`,
    );
    const res = await GET(req, routeParams);
    const body = await res.json();

    const entry = body.data[0];
    // Existing fixture seeds payload: null
    expect(entry.payload).toBeNull();
  });
});

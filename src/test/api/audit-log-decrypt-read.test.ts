/**
 * Phase 10b (task #13) integration test: the audit log read path must
 * decrypt snapshot envelopes before returning them to the client, while
 * still passing through legacy plaintext snapshots unchanged.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  generateWorkspaceKey,
  wrapKey,
} from '@/lib/crypto/workspace-encryption';
import { getMasterKey } from '@/lib/crypto/master-key';
import { encryptSnapshot } from '@/lib/tree/encryption';
import { encryptAuditDescription, encryptAuditPayload } from '@/lib/tree/audit';

// ---------------------------------------------------------------------------
// Shared key setup so the real `getWorkspaceKey()` path can unwrap cleanly.
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

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server';

const wsId = 'ws-audit-decrypt-1';
const treeId = 'tree-audit-decrypt-1';

function makeRequest(url: string) {
  return new NextRequest(url, {
    method: 'GET',
    headers: { authorization: 'Bearer valid-token' },
  });
}

function mockAdminAuth() {
  mockGetUser.mockResolvedValue({
    data: {
      user: {
        id: 'admin-uuid',
        email: 'admin@example.com',
        user_metadata: { display_name: 'Admin' },
      },
    },
    error: null,
  });
  mockMembershipFindUnique.mockResolvedValue({
    userId: 'admin-uuid',
    workspaceId: wsId,
    role: 'workspace_admin',
    permissions: [],
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/workspaces/[id]/tree/audit-log — Phase 10b snapshot decryption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminAuth();
    // Critical: workspace mock returns both the audit flag and the
    // encrypted key. The route calls findUnique TWICE — once for the
    // enableAuditLog gate, once inside getWorkspaceKey. Both use the
    // same mocked function so we return a combined shape.
    mockWorkspaceFindUnique.mockResolvedValue({
      id: wsId,
      enableAuditLog: true,
      enableVersionControl: false,
      encryptedKey: WRAPPED_KEY,
    });
    mockFamilyTreeFindUnique.mockResolvedValue({ id: treeId });
  });

  test('decrypts envelope-shaped snapshotAfter on PATCH-style entries', async () => {
    // Simulate what an encrypted mutation route would have written.
    const plaintextBefore = { id: 'ind-1', givenName: 'أحمد', surname: null };
    const plaintextAfter = { id: 'ind-1', givenName: 'محمد', surname: null };
    const envelopeBefore = encryptSnapshot(plaintextBefore, PLAINTEXT_KEY);
    const envelopeAfter = encryptSnapshot(plaintextAfter, PLAINTEXT_KEY);

    mockTreeEditLogFindMany.mockResolvedValue([
      {
        id: 'log-1',
        treeId,
        userId: 'admin-uuid',
        action: 'update',
        entityType: 'individual',
        entityId: 'ind-1',
        description: encryptAuditDescription('update', 'individual', 'أحمد', PLAINTEXT_KEY),
        snapshotBefore: envelopeBefore,
        snapshotAfter: envelopeAfter,
        payload: encryptAuditPayload({ givenName: 'محمد' }, PLAINTEXT_KEY),
        timestamp: new Date('2026-04-08T15:00:00Z'),
        user: { displayName: 'Admin', avatarUrl: null },
      },
    ]);
    mockTreeEditLogCount.mockResolvedValue(1);

    const { GET } = await import('@/app/api/workspaces/[id]/tree/audit-log/route');
    const response = await GET(
      makeRequest(`http://localhost:4000/api/workspaces/${wsId}/tree/audit-log`),
      { params: Promise.resolve({ id: wsId }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const entry = body.data[0];

    // The client never sees the envelope — it sees the decrypted plaintext
    expect(entry.snapshotBefore).toEqual(plaintextBefore);
    expect(entry.snapshotAfter).toEqual(plaintextAfter);
    expect(entry.snapshotBefore).not.toHaveProperty('_encrypted');
    expect(entry.snapshotAfter).not.toHaveProperty('_encrypted');

    // The diff viewer on the client relies on direct field access
    expect(entry.snapshotBefore.givenName).toBe('أحمد');
    expect(entry.snapshotAfter.givenName).toBe('محمد');
  });

  test('passes through legacy plaintext snapshots unchanged', async () => {
    // Pre-Phase-10b rows store snapshots as plain JS objects (no envelope).
    // The pass-through branch in decryptSnapshot keeps them intact. Note:
    // description + payload do NOT have a legacy fallback (task #24's
    // migration re-encrypts them before the read path is exercised), so
    // this fixture uses encrypted values for those two columns while
    // keeping the snapshot in legacy plaintext shape.
    mockTreeEditLogFindMany.mockResolvedValue([
      {
        id: 'log-legacy',
        treeId,
        userId: 'admin-uuid',
        action: 'create',
        entityType: 'individual',
        entityId: 'ind-legacy',
        description: encryptAuditDescription('create', 'individual', 'شخص قديم', PLAINTEXT_KEY),
        snapshotBefore: null,
        snapshotAfter: { id: 'ind-legacy', givenName: 'شخص قديم', surname: 'قديم' },
        payload: null,
        timestamp: new Date('2026-04-01T10:00:00Z'),
        user: { displayName: 'Admin', avatarUrl: null },
      },
    ]);
    mockTreeEditLogCount.mockResolvedValue(1);

    const { GET } = await import('@/app/api/workspaces/[id]/tree/audit-log/route');
    const response = await GET(
      makeRequest(`http://localhost:4000/api/workspaces/${wsId}/tree/audit-log`),
      { params: Promise.resolve({ id: wsId }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const entry = body.data[0];
    expect(entry.snapshotBefore).toBeNull();
    expect(entry.snapshotAfter).toEqual({
      id: 'ind-legacy',
      givenName: 'شخص قديم',
      surname: 'قديم',
    });
  });

  test('null snapshots stay null (create action: snapshotBefore is null)', async () => {
    const envelopeAfter = encryptSnapshot({ id: 'ind-2', givenName: 'سليمان' }, PLAINTEXT_KEY);

    mockTreeEditLogFindMany.mockResolvedValue([
      {
        id: 'log-create',
        treeId,
        userId: 'admin-uuid',
        action: 'create',
        entityType: 'individual',
        entityId: 'ind-2',
        description: encryptAuditDescription('create', 'individual', 'سليمان', PLAINTEXT_KEY),
        snapshotBefore: null,
        snapshotAfter: envelopeAfter,
        payload: null,
        timestamp: new Date('2026-04-08T16:00:00Z'),
        user: { displayName: 'Admin', avatarUrl: null },
      },
    ]);
    mockTreeEditLogCount.mockResolvedValue(1);

    const { GET } = await import('@/app/api/workspaces/[id]/tree/audit-log/route');
    const response = await GET(
      makeRequest(`http://localhost:4000/api/workspaces/${wsId}/tree/audit-log`),
      { params: Promise.resolve({ id: wsId }) },
    );

    const body = await response.json();
    const entry = body.data[0];
    expect(entry.snapshotBefore).toBeNull();
    expect(entry.snapshotAfter.givenName).toBe('سليمان');
  });
});

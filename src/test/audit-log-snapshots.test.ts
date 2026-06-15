import { describe, test, expect, vi, beforeEach } from 'vitest';

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
const mockFamilyTreeCreate = vi.fn();
const mockFamilyTreeUpdate = vi.fn();
const mockIndividualCreate = vi.fn();
const mockIndividualUpdate = vi.fn();
const mockIndividualFindFirst = vi.fn();
const mockFamilyCreate = vi.fn();
const mockFamilyFindFirst = vi.fn();
const mockFamilyUpdateMany = vi.fn();
const mockFamilyChildDeleteMany = vi.fn();
const mockTreeEditLogCreate = vi.fn();

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
      create: (...args: unknown[]) => mockFamilyTreeCreate(...args),
      update: (...args: unknown[]) => mockFamilyTreeUpdate(...args),
    },
    individual: {
      create: (...args: unknown[]) => mockIndividualCreate(...args),
      update: (...args: unknown[]) => mockIndividualUpdate(...args),
      findFirst: (...args: unknown[]) => mockIndividualFindFirst(...args),
    },
    family: {
      create: (...args: unknown[]) => mockFamilyCreate(...args),
      findFirst: (...args: unknown[]) => mockFamilyFindFirst(...args),
      updateMany: (...args: unknown[]) => mockFamilyUpdateMany(...args),
    },
    familyChild: {
      deleteMany: (...args: unknown[]) => mockFamilyChildDeleteMany(...args),
    },
    treeEditLog: {
      create: (...args: unknown[]) => mockTreeEditLogCreate(...args),
    },
    $transaction: vi.fn(),
  },
}));

// Mock branch pointer queries
vi.mock('@/lib/tree/branch-pointer-queries', () => ({
  isPointedIndividualInWorkspace: vi.fn().mockResolvedValue(false),
  getActivePointersForWorkspace: vi.fn().mockResolvedValue([]),
}));

// Mock tree mapper
vi.mock('@/lib/tree/mapper', () => ({
  dbTreeToGedcomData: vi.fn(() => ({ individuals: {}, families: {} })),
  redactPrivateIndividuals: vi.fn((data: unknown) => data),
}));

// Mock cascade-delete
vi.mock('@/lib/tree/cascade-delete', () => ({
  computeDeleteImpact: vi.fn(() => ({ hasImpact: false, affectedIds: new Set() })),
  computeVersionHash: vi.fn(() => 'mock-hash'),
  buildImpactResponse: vi.fn(() => ({ hasImpact: false, affectedCount: 0, affectedNames: [], versionHash: 'mock-hash' })),
}));

// Phase 10b: stub workspace-key helpers so routes skip the DB lookup.
const TEST_KEY = Buffer.alloc(32, 7);
vi.mock('@/lib/tree/encryption', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tree/encryption')>('@/lib/tree/encryption');
  return {
    ...actual,
    getWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 7)),
    getOrCreateWorkspaceKey: vi.fn().mockResolvedValue(Buffer.alloc(32, 7)),
  };
});

import { NextRequest } from 'next/server';
import { decryptSnapshot } from '@/lib/tree/encryption';

/**
 * Phase 10b: mutation routes now wrap snapshots in an encrypted envelope.
 * Tests that inspect captured `treeEditLog.create` args must decrypt the
 * envelope before asserting on field values. `decryptSnapshot` is itself
 * passed through from the real module via `importActual` above.
 */
function unwrapSnapshot(value: unknown): unknown {
  return decryptSnapshot(value, TEST_KEY);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const wsId = 'ws-snapshot-test-1';
const treeId = 'tree-snapshot-1';
const indId = 'ind-snapshot-1';

const fakeUser = {
  id: 'user-snapshot-1',
  email: 'editor@example.com',
  user_metadata: { display_name: 'Editor' },
};

function makeRequest(url: string, options: { method?: string; body?: unknown } = {}) {
  const { method = 'POST', body } = options;
  return new NextRequest(url, {
    method,
    headers: {
      authorization: 'Bearer valid-token',
      'content-type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function mockAuth() {
  mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
}

function mockTreeEditor() {
  mockMembershipFindUnique.mockResolvedValue({
    userId: fakeUser.id,
    workspaceId: wsId,
    role: 'workspace_admin',
    permissions: [],
  });
}

function mockExistingTree() {
  const tree = {
    id: treeId,
    workspaceId: wsId,
    lastModifiedAt: new Date(),
    individuals: [],
    families: [],
    radaFamilies: [],
  };
  mockFamilyTreeFindUnique.mockResolvedValue(tree);
  mockFamilyTreeCreate.mockResolvedValue(tree);
}

function mockWorkspaceWithFeatures() {
  mockWorkspaceFindUnique.mockResolvedValue({
    id: wsId,
    enableKunya: false,
    enableUmmWalad: false,
    enableRadaa: false,
    enableAuditLog: true,
  });
}

// ============================================================================
// Snapshot capture on individual CREATE
// ============================================================================

describe('Snapshot capture — individual CREATE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockWorkspaceWithFeatures();
    mockTreeEditLogCreate.mockResolvedValue({});
    mockFamilyTreeUpdate.mockResolvedValue({});
  });

  test('create individual stores snapshotAfter with full entity data, snapshotBefore is null', async () => {
    const createdIndividual = {
      id: indId,
      treeId,
      givenName: 'محمد',
      surname: 'السعيد',
      fullName: null,
      sex: 'M',
      birthDate: '1990-01-01',
      birthPlace: null,
      birthPlaceId: null,
      birthDescription: null,
      birthNotes: null,
      birthHijriDate: null,
      deathDate: null,
      deathPlace: null,
      deathPlaceId: null,
      deathDescription: null,
      deathNotes: null,
      deathHijriDate: null,
      kunya: null,
      notes: null,
      isDeceased: false,
      isPrivate: false,
      createdById: fakeUser.id,
    };
    mockIndividualCreate.mockResolvedValue(createdIndividual);

    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/individuals`,
      {
        body: { givenName: 'محمد', surname: 'السعيد', sex: 'M', birthDate: '1990-01-01' },
      },
    );
    const res = await POST(req, { params: Promise.resolve({ id: wsId }) });
    expect(res.status).toBe(201);

    // Phase 10b: snapshots are now stored as encrypted envelopes. Decrypt
    // the captured call arg before asserting on plaintext fields.
    expect(mockTreeEditLogCreate).toHaveBeenCalled();
    const callData = mockTreeEditLogCreate.mock.calls[0][0].data;
    expect(callData.treeId).toBe(treeId);
    expect(callData.userId).toBe(fakeUser.id);
    expect(callData.action).toBe('create');
    expect(callData.entityType).toBe('individual');
    expect(callData.entityId).toBe(indId);
    expect(callData.snapshotBefore).toBeNull();

    const after = unwrapSnapshot(callData.snapshotAfter) as {
      id: string;
      givenName: string;
      surname: string;
    };
    expect(after.id).toBe(indId);
    expect(after.givenName).toBe('محمد');
    expect(after.surname).toBe('السعيد');
  });

  test('create individual includes description in audit log entry', async () => {
    const createdIndividual = {
      id: indId,
      treeId,
      givenName: 'محمد',
      surname: null,
      fullName: null,
      sex: 'M',
      birthDate: null,
      birthPlace: null,
      birthPlaceId: null,
      birthDescription: null,
      birthNotes: null,
      birthHijriDate: null,
      deathDate: null,
      deathPlace: null,
      deathPlaceId: null,
      deathDescription: null,
      deathNotes: null,
      deathHijriDate: null,
      kunya: null,
      notes: null,
      isDeceased: false,
      isPrivate: false,
      createdById: fakeUser.id,
    };
    mockIndividualCreate.mockResolvedValue(createdIndividual);

    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/individuals`,
      { body: { givenName: 'محمد', sex: 'M' } },
    );
    await POST(req, { params: Promise.resolve({ id: wsId }) });

    // Phase 10b follow-up: description is now an encrypted Buffer. The
    // captured value should be a Buffer >= 28 bytes (IV + authTag minimum);
    // decrypting with the test key should yield a non-empty Arabic string.
    const callData = mockTreeEditLogCreate.mock.calls[0][0].data;
    expect(Buffer.isBuffer(callData.description) || callData.description instanceof Uint8Array).toBe(true);
    const { decryptAuditDescription } = await import('@/lib/tree/audit');
    const plaintext = decryptAuditDescription(callData.description, TEST_KEY);
    expect(plaintext).toBeTruthy();
    expect(plaintext!.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Snapshot capture on individual UPDATE
// ============================================================================

describe('Snapshot capture — individual UPDATE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockWorkspaceWithFeatures();
    mockTreeEditLogCreate.mockResolvedValue({});
    mockFamilyTreeUpdate.mockResolvedValue({});
  });

  test('update individual stores snapshotBefore (old state) and snapshotAfter (new state)', async () => {
    const existingIndividual = {
      id: indId,
      treeId,
      givenName: 'محمد',
      surname: 'السعيد',
      fullName: null,
      sex: 'M',
      birthDate: '1990-01-01',
      birthPlace: null,
      birthPlaceId: null,
      birthDescription: null,
      birthNotes: null,
      birthHijriDate: null,
      deathDate: null,
      deathPlace: null,
      deathPlaceId: null,
      deathDescription: null,
      deathNotes: null,
      deathHijriDate: null,
      kunya: null,
      notes: null,
      isDeceased: false,
      isPrivate: false,
    };
    mockIndividualFindFirst.mockResolvedValue(existingIndividual);

    const updatedIndividual = {
      ...existingIndividual,
      givenName: 'أحمد',
      birthDate: '1991-03-15',
    };
    mockIndividualUpdate.mockResolvedValue(updatedIndividual);

    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/individuals/${indId}`,
      {
        method: 'PATCH',
        body: { givenName: 'أحمد', birthDate: '1991-03-15' },
      },
    );
    const res = await PATCH(req, { params: Promise.resolve({ id: wsId, individualId: indId }) });
    expect(res.status).toBe(200);

    // Phase 10b: snapshots are encrypted envelopes — capture + decrypt.
    expect(mockTreeEditLogCreate).toHaveBeenCalled();
    const callData = mockTreeEditLogCreate.mock.calls[0][0].data;
    expect(callData.treeId).toBe(treeId);
    expect(callData.userId).toBe(fakeUser.id);
    expect(callData.action).toBe('update');
    expect(callData.entityType).toBe('individual');
    expect(callData.entityId).toBe(indId);

    const before = unwrapSnapshot(callData.snapshotBefore) as {
      id: string;
      givenName: string;
      birthDate: string;
    };
    const after = unwrapSnapshot(callData.snapshotAfter) as {
      id: string;
      givenName: string;
      birthDate: string;
    };
    expect(before.id).toBe(indId);
    expect(before.givenName).toBe('محمد');
    expect(before.birthDate).toBe('1990-01-01');
    expect(after.id).toBe(indId);
    expect(after.givenName).toBe('أحمد');
    expect(after.birthDate).toBe('1991-03-15');
  });

  test('update individual includes description in audit log entry', async () => {
    const existingIndividual = {
      id: indId,
      treeId,
      givenName: 'محمد',
      surname: null,
      fullName: null,
      sex: 'M',
      birthDate: null,
      birthPlace: null,
      birthPlaceId: null,
      birthDescription: null,
      birthNotes: null,
      birthHijriDate: null,
      deathDate: null,
      deathPlace: null,
      deathPlaceId: null,
      deathDescription: null,
      deathNotes: null,
      deathHijriDate: null,
      kunya: null,
      notes: null,
      isDeceased: false,
      isPrivate: false,
    };
    mockIndividualFindFirst.mockResolvedValue(existingIndividual);
    mockIndividualUpdate.mockResolvedValue({ ...existingIndividual, givenName: 'أحمد' });

    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/individuals/${indId}`,
      { method: 'PATCH', body: { givenName: 'أحمد' } },
    );
    await PATCH(req, { params: Promise.resolve({ id: wsId, individualId: indId }) });

    const callData = mockTreeEditLogCreate.mock.calls[0][0].data;
    // Phase 10b follow-up: description is an encrypted Buffer; check presence
    // and decryptability rather than plaintext.
    expect(callData.description).toBeTruthy();
    const { decryptAuditDescription } = await import('@/lib/tree/audit');
    const plaintext = decryptAuditDescription(callData.description, TEST_KEY);
    expect(plaintext).toBeTruthy();
  });
});

// ============================================================================
// Snapshot capture — mutations write unconditionally (toggle OFF)
// ============================================================================

describe('Snapshot capture — unconditional write (toggle OFF)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth();
    mockTreeEditor();
    mockExistingTree();
    mockTreeEditLogCreate.mockResolvedValue({});
    mockFamilyTreeUpdate.mockResolvedValue({});
  });

  test('create individual writes TreeEditLog with snapshots even when enableAuditLog is false', async () => {
    // Workspace has audit disabled
    mockWorkspaceFindUnique.mockResolvedValue({
      id: wsId,
      enableKunya: false,
      enableAuditLog: false,
    });

    const createdIndividual = {
      id: indId,
      treeId,
      givenName: 'محمد',
      surname: null,
      fullName: null,
      sex: 'M',
      birthDate: null,
      birthPlace: null,
      birthPlaceId: null,
      birthDescription: null,
      birthNotes: null,
      birthHijriDate: null,
      deathDate: null,
      deathPlace: null,
      deathPlaceId: null,
      deathDescription: null,
      deathNotes: null,
      deathHijriDate: null,
      kunya: null,
      notes: null,
      isDeceased: false,
      isPrivate: false,
      createdById: fakeUser.id,
    };
    mockIndividualCreate.mockResolvedValue(createdIndividual);

    const { POST } = await import('@/app/api/workspaces/[id]/tree/individuals/route');
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/individuals`,
      { body: { givenName: 'محمد', sex: 'M' } },
    );
    const res = await POST(req, { params: Promise.resolve({ id: wsId }) });
    expect(res.status).toBe(201);

    // TreeEditLog must be written regardless of toggle, with snapshots
    expect(mockTreeEditLogCreate).toHaveBeenCalled();
    const callData = mockTreeEditLogCreate.mock.calls[0][0].data;
    expect(callData.snapshotAfter).toBeDefined();
    expect(callData.snapshotBefore).toBeNull();
  });

  test('update individual writes TreeEditLog with snapshots even when enableAuditLog is false', async () => {
    mockWorkspaceFindUnique.mockResolvedValue({
      id: wsId,
      enableKunya: false,
      enableAuditLog: false,
    });

    const existingIndividual = {
      id: indId,
      treeId,
      givenName: 'محمد',
      surname: 'السعيد',
      fullName: null,
      sex: 'M',
      birthDate: null,
      birthPlace: null,
      birthPlaceId: null,
      birthDescription: null,
      birthNotes: null,
      birthHijriDate: null,
      deathDate: null,
      deathPlace: null,
      deathPlaceId: null,
      deathDescription: null,
      deathNotes: null,
      deathHijriDate: null,
      kunya: null,
      notes: null,
      isDeceased: false,
      isPrivate: false,
    };
    mockIndividualFindFirst.mockResolvedValue(existingIndividual);
    mockIndividualUpdate.mockResolvedValue({ ...existingIndividual, givenName: 'أحمد' });

    const { PATCH } = await import(
      '@/app/api/workspaces/[id]/tree/individuals/[individualId]/route'
    );
    const req = makeRequest(
      `http://localhost:4000/api/workspaces/${wsId}/tree/individuals/${indId}`,
      { method: 'PATCH', body: { givenName: 'أحمد' } },
    );
    const res = await PATCH(req, { params: Promise.resolve({ id: wsId, individualId: indId }) });
    expect(res.status).toBe(200);

    // TreeEditLog with snapshots must be written regardless of toggle
    expect(mockTreeEditLogCreate).toHaveBeenCalled();
    const callData = mockTreeEditLogCreate.mock.calls[0][0].data;
    expect(callData.action).toBe('update');
    // Phase 10b: envelope-wrapped — decrypt before field access.
    expect(callData.snapshotBefore).toBeDefined();
    const before = unwrapSnapshot(callData.snapshotBefore) as { givenName: string };
    expect(before.givenName).toBe('محمد');
    expect(callData.snapshotAfter).toBeDefined();
    const after = unwrapSnapshot(callData.snapshotAfter) as { givenName: string };
    expect(after.givenName).toBe('أحمد');
  });
});

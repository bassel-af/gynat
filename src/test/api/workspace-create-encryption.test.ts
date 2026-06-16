/**
 * Integration test for Phase 10b: verifies that POST /api/workspaces
 * generates a fresh workspace data key, wraps it with the master key, and
 * persists the wrapped bytes in `Workspace.encryptedKey`.
 *
 * The wrapped key must unwrap via the crypto primitives back to a 32-byte
 * Buffer that is actually usable for field encryption.
 */

import { describe, test, expect, vi, beforeEach, beforeAll } from 'vitest';
import {
  unwrapKey,
  WORKSPACE_KEY_LENGTH,
  encryptField,
  decryptField,
} from '@/lib/crypto/workspace-encryption';
import { getMasterKey, resetMasterKeyCache } from '@/lib/crypto/master-key';

// ---------------------------------------------------------------------------
// Mocks — match the pattern used by src/test/workspaces.test.ts
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}));

vi.mock('@/lib/api/rate-limit', () => ({
  workspaceCreateLimiter: { check: () => ({ allowed: true, retryAfterSeconds: 0 }) },
  rateLimitResponse: () =>
    new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 }),
}));

const mockMembershipCount = vi.fn();
const mockTransaction = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMembership: {
      count: (...args: unknown[]) => mockMembershipCount(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost:4000/api/workspaces', {
    method: 'POST',
    headers: {
      authorization: 'Bearer valid-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

const fakeUser = {
  id: 'user-uuid-777',
  email: 'tdd@example.com',
  user_metadata: { display_name: 'TDD' },
};

function mockAuthenticatedUser() {
  mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/workspaces — Phase 10b encryption key generation', () => {
  beforeAll(() => {
    // Ensure a valid master key is available for this test process.
    // vitest sets NODE_ENV=test; .env.local is loaded by the Next.js runtime
    // in prod/dev but not by vitest. Seed a deterministic one here.
    if (!process.env.WORKSPACE_MASTER_KEY) {
      const { randomBytes } = require('node:crypto');
      process.env.WORKSPACE_MASTER_KEY = randomBytes(32).toString('base64');
    }
    resetMasterKeyCache();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticatedUser();
    mockMembershipCount.mockResolvedValue(0);
  });

  test('persists a wrapped workspace key that unwraps to 32 bytes', async () => {
    // Capture the value that the route hands to tx.workspace.create
    let capturedEncryptedKey: Buffer | null = null;

    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const fakeTx = {
        workspace: {
          create: vi.fn(async ({ data }: { data: { encryptedKey?: Buffer; slug?: string } }) => {
            capturedEncryptedKey = data.encryptedKey ?? null;
            return {
              id: 'ws-uuid-new',
              slug: data.slug ?? 'enc-ws',
              nameAr: 'مشفرة',
              description: null,
              logoUrl: null,
              createdById: fakeUser.id,
              encryptedKey: data.encryptedKey ?? null,
            };
          }),
        },
        workspaceMembership: {
          create: vi.fn(async () => ({})),
        },
      };
      return callback(fakeTx);
    });

    const { POST } = await import('@/app/api/workspaces/route');
    const response = await POST(makeRequest({ slug: 'enc-ws', nameAr: 'مشفرة' }));

    expect(response.status).toBe(201);
    expect(capturedEncryptedKey).not.toBeNull();
    expect(Buffer.isBuffer(capturedEncryptedKey)).toBe(true);

    // Unwrap round-trips to a valid 32-byte workspace key
    const masterKey = getMasterKey();
    const unwrapped = unwrapKey(capturedEncryptedKey as unknown as Buffer, masterKey);
    expect(unwrapped.length).toBe(WORKSPACE_KEY_LENGTH);

    // Sanity: the unwrapped key can actually encrypt/decrypt data
    const ciphertext = encryptField('أحمد', unwrapped);
    expect(decryptField(ciphertext, unwrapped)).toBe('أحمد');
  });

  test('each new workspace receives a distinct wrapped key', async () => {
    const captured: Buffer[] = [];

    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const fakeTx = {
        workspace: {
          create: vi.fn(async ({ data }: { data: { encryptedKey?: Buffer; slug?: string } }) => {
            if (data.encryptedKey) captured.push(data.encryptedKey);
            return {
              id: 'ws-' + captured.length,
              slug: data.slug ?? 'x',
              nameAr: 'x',
              description: null,
              logoUrl: null,
              createdById: fakeUser.id,
              encryptedKey: data.encryptedKey ?? null,
            };
          }),
        },
        workspaceMembership: { create: vi.fn(async () => ({})) },
      };
      return callback(fakeTx);
    });

    const { POST } = await import('@/app/api/workspaces/route');
    await POST(makeRequest({ slug: 'first-ws', nameAr: 'أولى' }));
    await POST(makeRequest({ slug: 'second-ws', nameAr: 'ثانية' }));

    expect(captured).toHaveLength(2);
    expect(captured[0].equals(captured[1])).toBe(false);

    // Both unwrap to distinct 32-byte plaintext keys
    const master = getMasterKey();
    const a = unwrapKey(captured[0], master);
    const b = unwrapKey(captured[1], master);
    expect(a.length).toBe(32);
    expect(b.length).toBe(32);
    expect(a.equals(b)).toBe(false);
  });
});

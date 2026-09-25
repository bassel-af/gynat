/**
 * Phase 1 — Platform Owner Dashboard / Health metrics.
 *
 * Unit tests for `getHealthMetrics()` at `src/lib/admin/queries.ts`. All
 * probes (DB, GoTrue, mail transport, master-key validity, storage) are
 * mocked — the helper must surface failures inline in the payload, never
 * throw. Assertions explicitly check that no raw secret or raw error
 * message leaks into the response.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';

const mockQueryRaw = vi.fn();
const mockAdminAccessLogCount = vi.fn();
const mockAlbumMediaAggregate = vi.fn();
const mockSourceFileAggregate = vi.fn();
const mockVerifyMailTransport = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    adminAccessLog: {
      count: (...args: unknown[]) => mockAdminAccessLogCount(...args),
    },
    albumMedia: {
      aggregate: (...args: unknown[]) => mockAlbumMediaAggregate(...args),
    },
    sourceFile: {
      aggregate: (...args: unknown[]) => mockSourceFileAggregate(...args),
    },
  },
}));

vi.mock('@/lib/email/transport', () => ({
  verifyMailTransport: (...args: unknown[]) => mockVerifyMailTransport(...args),
}));

import { getHealthMetrics } from '@/lib/admin/queries';

const ORIGINAL_FETCH = globalThis.fetch;

describe('getHealthMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryRaw.mockResolvedValue([{ '?column?': 1 }]);
    mockAdminAccessLogCount.mockResolvedValue(0);
    mockAlbumMediaAggregate.mockResolvedValue({ _sum: { fileSizeBytes: null } });
    mockSourceFileAggregate.mockResolvedValue({ _sum: { sizeBytes: null } });
    mockVerifyMailTransport.mockResolvedValue(true);
    // Always provide a valid 32-byte base64 master key by default
    process.env.WORKSPACE_MASTER_KEY = randomBytes(32).toString('base64');
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:8000';
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
  });

  describe('db probe', () => {
    test('returns ok:true when SELECT 1 succeeds', async () => {
      const metrics = await getHealthMetrics();
      expect(metrics.db.ok).toBe(true);
      expect(metrics.db.error).toBeUndefined();
    });

    test('returns ok:false with error class name (not message) when query throws', async () => {
      class CustomDbError extends Error {}
      mockQueryRaw.mockRejectedValue(new CustomDbError('PII leak: password=secret'));

      const metrics = await getHealthMetrics();
      expect(metrics.db.ok).toBe(false);
      expect(metrics.db.error).toBe('CustomDbError');
      // Never leak the message
      const serialized = JSON.stringify(metrics.db);
      expect(serialized).not.toContain('password');
      expect(serialized).not.toContain('secret');
    });
  });

  describe('gotrue probe', () => {
    test('returns ok:true with status:200 when fetch returns 200', async () => {
      const metrics = await getHealthMetrics();
      expect(metrics.gotrue.ok).toBe(true);
      expect(metrics.gotrue.status).toBe(200);
    });

    test('returns ok:false with error class when fetch rejects', async () => {
      class NetworkError extends Error {}
      globalThis.fetch = vi.fn(async () => {
        throw new NetworkError('DNS not resolving: secret-hostname.internal');
      }) as unknown as typeof fetch;

      const metrics = await getHealthMetrics();
      expect(metrics.gotrue.ok).toBe(false);
      expect(metrics.gotrue.error).toBe('NetworkError');
      const serialized = JSON.stringify(metrics.gotrue);
      expect(serialized).not.toContain('secret-hostname');
    });

    test('returns ok:false with the status code when fetch returns non-200', async () => {
      globalThis.fetch = vi.fn(async () =>
        new Response('Bad Gateway', { status: 502 }),
      ) as unknown as typeof fetch;

      const metrics = await getHealthMetrics();
      expect(metrics.gotrue.ok).toBe(false);
      expect(metrics.gotrue.status).toBe(502);
    });
  });

  describe('mail probe', () => {
    test('returns ok:true when verifyMailTransport resolves', async () => {
      const metrics = await getHealthMetrics();
      expect(metrics.mail.ok).toBe(true);
    });

    test('returns ok:false with error class when verifyMailTransport throws', async () => {
      class SmtpError extends Error {}
      mockVerifyMailTransport.mockRejectedValue(new SmtpError('auth failed for user foo'));

      const metrics = await getHealthMetrics();
      expect(metrics.mail.ok).toBe(false);
      expect(metrics.mail.error).toBe('SmtpError');
      const serialized = JSON.stringify(metrics.mail);
      expect(serialized).not.toContain('auth failed');
      expect(serialized).not.toContain('foo');
    });
  });

  describe('encryption probe', () => {
    test('masterKeyLoaded:true when env is 32 bytes base64', async () => {
      process.env.WORKSPACE_MASTER_KEY = randomBytes(32).toString('base64');
      const metrics = await getHealthMetrics();
      expect(metrics.encryption.masterKeyLoaded).toBe(true);
      // Never echo the key
      const serialized = JSON.stringify(metrics.encryption);
      expect(serialized).not.toContain(process.env.WORKSPACE_MASTER_KEY);
    });

    test('masterKeyLoaded:false when env is 31 bytes base64 (wrong length)', async () => {
      process.env.WORKSPACE_MASTER_KEY = randomBytes(31).toString('base64');
      const metrics = await getHealthMetrics();
      expect(metrics.encryption.masterKeyLoaded).toBe(false);
    });

    test('masterKeyLoaded:false when env is missing', async () => {
      delete process.env.WORKSPACE_MASTER_KEY;
      const metrics = await getHealthMetrics();
      expect(metrics.encryption.masterKeyLoaded).toBe(false);
    });

    test('masterKeyLoaded:false when env is not valid base64', async () => {
      process.env.WORKSPACE_MASTER_KEY = '!!!not-base64!!!';
      const metrics = await getHealthMetrics();
      expect(metrics.encryption.masterKeyLoaded).toBe(false);
    });
  });

  describe('storage probe', () => {
    test('returns totalMediaBytes from AlbumMedia._sum.fileSizeBytes', async () => {
      mockAlbumMediaAggregate.mockResolvedValue({
        _sum: { fileSizeBytes: BigInt(123456789) },
      });
      const metrics = await getHealthMetrics();
      expect(metrics.storage.totalMediaBytes).toBe(123456789);
    });

    test('includes source files (المصادر) in totalMediaBytes', async () => {
      mockAlbumMediaAggregate.mockResolvedValue({ _sum: { fileSizeBytes: BigInt(1000) } });
      mockSourceFileAggregate.mockResolvedValue({ _sum: { sizeBytes: 234 } });
      const metrics = await getHealthMetrics();
      expect(metrics.storage.totalMediaBytes).toBe(1234);
    });

    test('returns totalMediaBytes:0 when sum is null (empty table)', async () => {
      mockAlbumMediaAggregate.mockResolvedValue({ _sum: { fileSizeBytes: null } });
      const metrics = await getHealthMetrics();
      expect(metrics.storage.totalMediaBytes).toBe(0);
    });

    test('returns totalMediaBytes:null when aggregate throws', async () => {
      mockAlbumMediaAggregate.mockRejectedValue(new Error('table missing'));
      const metrics = await getHealthMetrics();
      expect(metrics.storage.totalMediaBytes).toBeNull();
    });
  });

  describe('adminReadsLast24h', () => {
    test('counts AdminAccessLog rows with createdAt gte now-24h', async () => {
      mockAdminAccessLogCount.mockImplementation(
        (args?: { where?: { createdAt?: { gte?: Date } } }) => {
          const gte = args?.where?.createdAt?.gte;
          if (!gte) return Promise.resolve(0);
          const deltaMs = Date.now() - gte.getTime();
          if (Math.abs(deltaMs - 24 * 3_600_000) < 2_000) return Promise.resolve(17);
          return Promise.resolve(0);
        },
      );
      const metrics = await getHealthMetrics();
      expect(metrics.adminReadsLast24h).toBe(17);
    });
  });

  test('health function NEVER throws — even if every probe fails', async () => {
    mockQueryRaw.mockRejectedValue(new Error('db down'));
    mockAdminAccessLogCount.mockRejectedValue(new Error('db down'));
    mockAlbumMediaAggregate.mockRejectedValue(new Error('db down'));
    mockVerifyMailTransport.mockRejectedValue(new Error('smtp down'));
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    await expect(getHealthMetrics()).resolves.toBeDefined();
  });
});

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { assertProductionSafe } from '@/lib/email/transport-guard';

const ORIGINAL = { ...process.env };

function resetEnv() {
  for (const k of Object.keys(process.env)) {
    if (!(k in ORIGINAL)) delete process.env[k];
  }
  for (const [k, v] of Object.entries(ORIGINAL)) {
    process.env[k] = v;
  }
}

describe('assertProductionSafe()', () => {
  beforeEach(() => {
    resetEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnv();
  });

  test('throws when NODE_ENV=production and SMTP_HOST references mailpit service name', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SMTP_HOST', 'mailpit');
    expect(() => assertProductionSafe()).toThrow(/production/i);
  });

  test('throws when NODE_ENV=production and SMTP_HOST is localhost (loopback mail trap)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SMTP_HOST', 'localhost');
    expect(() => assertProductionSafe()).toThrow(/production/i);
  });

  test('throws when NODE_ENV=production and SMTP_HOST is 127.0.0.1', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SMTP_HOST', '127.0.0.1');
    expect(() => assertProductionSafe()).toThrow(/production/i);
  });

  test('does not throw when NODE_ENV=production with a real SMTP host', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SMTP_HOST', 'smtp.gmail.com');
    expect(() => assertProductionSafe()).not.toThrow();
  });

  test('does not throw when NODE_ENV=development with mailpit host', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SMTP_HOST', 'mailpit');
    expect(() => assertProductionSafe()).not.toThrow();
  });

  test('does not throw when NODE_ENV=test with localhost', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('SMTP_HOST', 'localhost');
    expect(() => assertProductionSafe()).not.toThrow();
  });
});

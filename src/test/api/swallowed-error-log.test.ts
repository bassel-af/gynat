/**
 * Phase 10b — task #5 (tdd-red)
 *
 * Failing tests for the new pure helper `logSwallowedAuditError()` that
 * the share-tokens route will use to replace its bare `catch {}` blocks
 * with PII-free structured logging.
 *
 * The helper module `src/lib/api/swallowed-error-log.ts` does NOT exist
 * yet — these tests should fail with a "module not found" error. tdd-green
 * will create the file and wire it into
 * `src/app/api/workspaces/[id]/share-tokens/[tokenId]/route.ts`.
 *
 * Contract:
 *   logSwallowedAuditError(
 *     context: string,
 *     entityRef: { tokenId?: string; pointerId?: string },
 *     err: unknown,
 *   ): void
 *
 *   - Calls `console.error('[swallowed-audit-error]', context, { errorType, ...entityRef })`.
 *   - Never logs the raw `err` object (it may carry PII in its message).
 *   - `errorType` = `err?.constructor?.name ?? 'Unknown'`.
 *   - Never throws — even if `console.error` itself throws.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { logSwallowedAuditError } from '@/lib/api/swallowed-error-log';

let consoleSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleSpy.mockRestore();
});

function flattenedArgs(): string {
  return consoleSpy.mock.calls
    .flat()
    .map((a: unknown) => {
      if (a instanceof Error) return a.message + ' ' + (a.stack ?? '');
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}

describe('logSwallowedAuditError — happy path with Error', () => {
  test('logs context tag, context name, and entity ref with errorType', () => {
    logSwallowedAuditError('share_token_revoke', { tokenId: 'abc-123' }, new Error('boom'));

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const callArgs = consoleSpy.mock.calls[0];

    // First argument: stable PII-free tag
    expect(callArgs[0]).toBe('[swallowed-audit-error]');
    // Second argument: context name
    expect(callArgs[1]).toBe('share_token_revoke');
    // Third argument: structured object
    const detail = callArgs[2] as Record<string, unknown>;
    expect(detail).toMatchObject({
      errorType: 'Error',
      tokenId: 'abc-123',
    });

    // The raw error message MUST NOT leak into any console.error argument.
    const flat = flattenedArgs();
    expect(flat).not.toContain('boom');
  });
});

describe('logSwallowedAuditError — null / unknown errors', () => {
  test('uses errorType "Unknown" when err is null', () => {
    logSwallowedAuditError('per_pointer_revoke', { pointerId: 'ptr-1' }, null);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const detail = consoleSpy.mock.calls[0][2] as Record<string, unknown>;
    expect(detail.errorType).toBe('Unknown');
    expect(detail.pointerId).toBe('ptr-1');
  });

  test('uses errorType "Unknown" when err is undefined', () => {
    logSwallowedAuditError('per_pointer_revoke', { pointerId: 'ptr-2' }, undefined);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const detail = consoleSpy.mock.calls[0][2] as Record<string, unknown>;
    expect(detail.errorType).toBe('Unknown');
  });
});

describe('logSwallowedAuditError — non-Error error types', () => {
  test('reports TypeError as errorType "TypeError"', () => {
    logSwallowedAuditError('share_token_revoke', { tokenId: 'tk-9' }, new TypeError('bad type'));

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const detail = consoleSpy.mock.calls[0][2] as Record<string, unknown>;
    expect(detail.errorType).toBe('TypeError');
    expect(detail.tokenId).toBe('tk-9');

    // The raw message must not leak.
    const flat = flattenedArgs();
    expect(flat).not.toContain('bad type');
  });
});

describe('logSwallowedAuditError — entityRef variants', () => {
  test('passes through tokenId only', () => {
    logSwallowedAuditError('ctx', { tokenId: 'only-token' }, new Error('msg'));
    const detail = consoleSpy.mock.calls[0][2] as Record<string, unknown>;
    expect(detail.tokenId).toBe('only-token');
    expect(detail.pointerId).toBeUndefined();
  });

  test('passes through pointerId only', () => {
    logSwallowedAuditError('ctx', { pointerId: 'only-pointer' }, new Error('msg'));
    const detail = consoleSpy.mock.calls[0][2] as Record<string, unknown>;
    expect(detail.pointerId).toBe('only-pointer');
    expect(detail.tokenId).toBeUndefined();
  });

  test('passes through both tokenId and pointerId together', () => {
    logSwallowedAuditError('ctx', { tokenId: 'tk', pointerId: 'pt' }, new Error('msg'));
    const detail = consoleSpy.mock.calls[0][2] as Record<string, unknown>;
    expect(detail.tokenId).toBe('tk');
    expect(detail.pointerId).toBe('pt');
  });
});

describe('logSwallowedAuditError — never throws', () => {
  test('does not propagate when console.error itself throws', () => {
    consoleSpy.mockImplementation(() => {
      throw new Error('console exploded');
    });

    expect(() =>
      logSwallowedAuditError('ctx', { tokenId: 'tk-x' }, new Error('msg')),
    ).not.toThrow();
  });
});

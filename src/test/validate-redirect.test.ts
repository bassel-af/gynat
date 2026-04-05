import { describe, test, expect } from 'vitest';
import { validateRedirectPath } from '@/lib/auth/validate-redirect';

describe('validateRedirectPath', () => {
  test('allows /workspaces through', () => {
    expect(validateRedirectPath('/workspaces')).toBe('/workspaces');
  });

  test('allows /workspaces/some-slug through', () => {
    expect(validateRedirectPath('/workspaces/some-slug')).toBe('/workspaces/some-slug');
  });

  test('allows /invite/123 through', () => {
    expect(validateRedirectPath('/invite/123')).toBe('/invite/123');
  });

  test('allows path with query string through', () => {
    expect(validateRedirectPath('/workspaces?tab=settings')).toBe('/workspaces?tab=settings');
  });

  test('rejects absolute URL https://evil.com', () => {
    expect(validateRedirectPath('https://evil.com')).toBe('/workspaces');
  });

  test('rejects absolute URL http://evil.com', () => {
    expect(validateRedirectPath('http://evil.com')).toBe('/workspaces');
  });

  test('rejects protocol-relative URL //evil.com', () => {
    expect(validateRedirectPath('//evil.com')).toBe('/workspaces');
  });

  test('rejects javascript: URL', () => {
    expect(validateRedirectPath('javascript:alert(1)')).toBe('/workspaces');
  });

  test('rejects data: URL', () => {
    expect(validateRedirectPath('data:text/html,<script>alert(1)</script>')).toBe('/workspaces');
  });

  test('returns fallback for empty string', () => {
    expect(validateRedirectPath('')).toBe('/workspaces');
  });

  test('returns fallback for null', () => {
    expect(validateRedirectPath(null as unknown as string)).toBe('/workspaces');
  });

  test('returns fallback for undefined', () => {
    expect(validateRedirectPath(undefined as unknown as string)).toBe('/workspaces');
  });

  test('rejects path with backslash (\\\\evil.com)', () => {
    expect(validateRedirectPath('\\evil.com')).toBe('/workspaces');
  });

  test('rejects javascript: with mixed case', () => {
    expect(validateRedirectPath('JavaScript:alert(1)')).toBe('/workspaces');
  });

  test('rejects javascript: with leading whitespace', () => {
    expect(validateRedirectPath('  javascript:alert(1)')).toBe('/workspaces');
  });
});

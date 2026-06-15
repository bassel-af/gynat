import { describe, test, expect } from 'vitest';
import {
  generatePublicSlug,
  PUBLIC_SLUG_CODE_LENGTH,
} from '@/lib/tree/public-slug';

describe('generatePublicSlug', () => {
  // One slug scheme for BOTH public levels: a compact, unguessable random code
  // (letters+numbers, no dashes), long enough that link-only trees can't be
  // enumerated. No family-name derivation.

  test('is a compact random code (lowercase alnum only)', () => {
    const slug = generatePublicSlug();
    expect(slug).toMatch(/^[a-z0-9]+$/);
  });

  test('has the configured length', () => {
    expect(generatePublicSlug().length).toBe(PUBLIC_SLUG_CODE_LENGTH);
  });

  test('is long enough to be unguessable (>= 20)', () => {
    expect(PUBLIC_SLUG_CODE_LENGTH).toBeGreaterThanOrEqual(20);
  });

  test('contains no dashes (not a dashed UUID)', () => {
    expect(generatePublicSlug()).not.toContain('-');
  });

  test('two calls differ', () => {
    expect(generatePublicSlug()).not.toBe(generatePublicSlug());
  });
});

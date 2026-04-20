import { describe, it, expect } from 'vitest';
import robots from '@/app/robots';

describe('robots.ts', () => {
  it('returns a sitemap URL pointing to gynat.com', () => {
    const result = robots();
    expect(result.sitemap).toBe('https://gynat.com/sitemap.xml');
  });

  it('disallows everything by default with "/"', () => {
    const result = robots();
    const rules = result.rules;
    // rules can be a single object or an array
    const singleRule = Array.isArray(rules) ? rules[0] : rules;
    expect(singleRule.userAgent).toBe('*');
    const disallow = Array.isArray(singleRule.disallow)
      ? singleRule.disallow
      : [singleRule.disallow];
    expect(disallow).toContain('/');
  });

  it('disallows parameterized login URLs to prevent slug leaks', () => {
    const result = robots();
    const rules = result.rules;
    const singleRule = Array.isArray(rules) ? rules[0] : rules;
    const disallow = Array.isArray(singleRule.disallow)
      ? singleRule.disallow
      : [singleRule.disallow];
    expect(disallow).toContain('/auth/login?');
  });

  it('allows the 7 public pages', () => {
    const result = robots();
    const rules = result.rules;
    const singleRule = Array.isArray(rules) ? rules[0] : rules;
    const allow = Array.isArray(singleRule.allow)
      ? singleRule.allow
      : [singleRule.allow];
    expect(allow).toContain('/');
    expect(allow).toContain('/policy');
    expect(allow).toContain('/islamic-gedcom');
    expect(allow).toContain('/features');
    expect(allow).toContain('/auth/login');
    expect(allow).toContain('/auth/signup');
    expect(allow).toContain('/auth/forgot-password');
    expect(allow).toHaveLength(7);
  });
});

import { describe, it, expect } from 'vitest';
import sitemap from '@/app/sitemap';

describe('sitemap.ts', () => {
  it('returns exactly 6 URLs', () => {
    const result = sitemap();
    expect(result).toHaveLength(6);
  });

  it('includes the homepage with priority 1.0', () => {
    const result = sitemap();
    const homepage = result.find((entry) => entry.url === 'https://gynat.com');
    expect(homepage).toBeDefined();
    expect(homepage!.priority).toBe(1.0);
    expect(homepage!.changeFrequency).toBe('monthly');
  });

  it('includes the policy page with priority 0.3', () => {
    const result = sitemap();
    const policy = result.find((entry) => entry.url === 'https://gynat.com/policy');
    expect(policy).toBeDefined();
    expect(policy!.priority).toBe(0.3);
    expect(policy!.changeFrequency).toBe('yearly');
  });

  it('includes the islamic-gedcom page with priority 0.5', () => {
    const result = sitemap();
    const page = result.find((entry) => entry.url === 'https://gynat.com/islamic-gedcom');
    expect(page).toBeDefined();
    expect(page!.priority).toBe(0.5);
    expect(page!.changeFrequency).toBe('yearly');
  });

  it('includes auth login and signup pages with priority 0.2', () => {
    const result = sitemap();
    const login = result.find((entry) => entry.url === 'https://gynat.com/auth/login');
    const signup = result.find((entry) => entry.url === 'https://gynat.com/auth/signup');
    expect(login).toBeDefined();
    expect(login!.priority).toBe(0.2);
    expect(signup).toBeDefined();
    expect(signup!.priority).toBe(0.2);
  });

  it('uses only https://gynat.com as the base URL', () => {
    const result = sitemap();
    for (const entry of result) {
      expect(entry.url).toMatch(/^https:\/\/gynat\.com/);
    }
  });
});

  it('includes the features page with priority 0.7', () => {
    const result = sitemap();
    const features = result.find((entry) => entry.url === 'https://gynat.com/features');
    expect(features).toBeDefined();
    expect(features!.priority).toBe(0.7);
    expect(features!.changeFrequency).toBe('monthly');
  });

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockListTrees = vi.fn();
const mockListCollections = vi.fn();

vi.mock('@/lib/tree/public-serve', () => ({
  listIndexableTreeSlugs: (...a: unknown[]) => mockListTrees(...a),
}));
vi.mock('@/lib/collections/public-serve', () => ({
  listIndexableCollectionSlugs: (...a: unknown[]) => mockListCollections(...a),
}));

import sitemap from '@/app/sitemap';

beforeEach(() => {
  mockListTrees.mockReset();
  mockListCollections.mockReset();
  mockListTrees.mockResolvedValue([]);
  mockListCollections.mockResolvedValue([]);
});

describe('sitemap.ts', () => {
  it('returns the 5 static URLs when nothing is published', async () => {
    const result = await sitemap();
    expect(result).toHaveLength(5);
  });

  it('includes the homepage with priority 1.0', async () => {
    const result = await sitemap();
    const homepage = result.find((entry) => entry.url === 'https://gynat.com');
    expect(homepage).toBeDefined();
    expect(homepage!.priority).toBe(1.0);
    expect(homepage!.changeFrequency).toBe('monthly');
  });

  it('includes the policy page with priority 0.3', async () => {
    const result = await sitemap();
    const policy = result.find((entry) => entry.url === 'https://gynat.com/policy');
    expect(policy).toBeDefined();
    expect(policy!.priority).toBe(0.3);
    expect(policy!.changeFrequency).toBe('yearly');
  });

  it('includes the islamic-gedcom page with priority 0.5', async () => {
    const result = await sitemap();
    const page = result.find((entry) => entry.url === 'https://gynat.com/islamic-gedcom');
    expect(page).toBeDefined();
    expect(page!.priority).toBe(0.5);
    expect(page!.changeFrequency).toBe('yearly');
  });

  it('includes auth login and signup pages with priority 0.2', async () => {
    const result = await sitemap();
    const login = result.find((entry) => entry.url === 'https://gynat.com/auth/login');
    const signup = result.find((entry) => entry.url === 'https://gynat.com/auth/signup');
    expect(login).toBeDefined();
    expect(login!.priority).toBe(0.2);
    expect(signup).toBeDefined();
    expect(signup!.priority).toBe(0.2);
  });

  it('uses only https://gynat.com as the base URL', async () => {
    mockListTrees.mockResolvedValue([{ slug: 'alpha', lastModified: new Date('2026-06-01T00:00:00Z') }]);
    const result = await sitemap();
    for (const entry of result) {
      expect(entry.url).toMatch(/^https:\/\/gynat\.com/);
    }
  });

  it('appends a /family/[slug] entry per indexable tree (priority 0.6, weekly)', async () => {
    const ts = new Date('2026-06-01T00:00:00Z');
    mockListTrees.mockResolvedValue([{ slug: 'alpha', lastModified: ts }]);

    const result = await sitemap();
    const entry = result.find((e) => e.url === 'https://gynat.com/family/alpha');
    expect(entry).toBeDefined();
    expect(entry!.priority).toBe(0.6);
    expect(entry!.changeFrequency).toBe('weekly');
    expect(entry!.lastModified).toBe(ts);
  });

  it('appends a /collections/[slug] entry per indexable collection (priority 0.5, weekly)', async () => {
    const ts = new Date('2026-06-02T00:00:00Z');
    mockListCollections.mockResolvedValue([{ slug: 'fam-coll', lastModified: ts }]);

    const result = await sitemap();
    const entry = result.find((e) => e.url === 'https://gynat.com/collections/fam-coll');
    expect(entry).toBeDefined();
    expect(entry!.priority).toBe(0.5);
    expect(entry!.changeFrequency).toBe('weekly');
    expect(entry!.lastModified).toBe(ts);
  });

  it('omits trees/collections that are not in the indexable list (fail-closed)', async () => {
    mockListTrees.mockResolvedValue([{ slug: 'alpha', lastModified: new Date() }]);
    const result = await sitemap();
    expect(result.find((e) => e.url === 'https://gynat.com/family/secret')).toBeUndefined();
  });
});

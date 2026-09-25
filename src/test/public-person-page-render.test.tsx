import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { PublicTreeRecord } from '@/lib/tree/public-serve';
import type { GedcomData, Individual, Family } from '@/lib/gedcom/types';

// ---------------------------------------------------------------------------
// The public person page BODY: which structured data it emits, and how many
// times it builds the public payload per request.
//
// React's `cache()` is a no-op outside a request scope, so we substitute a real
// per-wrapped-function memo. That makes the caching observable: if the page
// stopped wrapping its resolver in `cache()`, metadata + body would each build
// the payload and the call count would be 2.
// ---------------------------------------------------------------------------

const hoisted = vi.hoisted(() => ({ resets: [] as (() => void)[] }));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    cache: (fn: (...args: never[]) => unknown) => {
      const memo = new Map<string, unknown>();
      hoisted.resets.push(() => memo.clear());
      return (...args: never[]) => {
        const key = JSON.stringify(args);
        if (!memo.has(key)) memo.set(key, fn(...args));
        return memo.get(key);
      };
    },
  };
});

const mockGetPublicTreeForRequest = vi.fn();
const mockBuildPublicTreePayload = vi.fn();

vi.mock('@/lib/tree/public-serve', () => ({
  getPublicTreeForRequest: (...a: unknown[]) => mockGetPublicTreeForRequest(...a),
  buildPublicTreePayload: (...a: unknown[]) => mockBuildPublicTreePayload(...a),
  isPublicTreeIndexable: (r: PublicTreeRecord) =>
    r.kind === 'main' && r.visibility === 'public_listed',
  isPublicPersonPageIndexable: (r: PublicTreeRecord) =>
    r.kind === 'main' && r.visibility === 'public_listed' && r.personPagesIndexable,
}));

// Any database read during SSR is recorded; source tables must never be touched.
const { dbTouches, publicSourceRows } = vi.hoisted(() => ({
  dbTouches: [] as string[],
  publicSourceRows: [] as Record<string, unknown>[],
}));
vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, {
    get: (_t, model: string) => new Proxy({}, {
      get: (_m, op: string) => async () => {
        dbTouches.push(`${model}.${op}`);
        return /source/i.test(model) ? publicSourceRows : null;
      },
    }),
  }),
}));

vi.mock('@/app/family/[slug]/person/[individualId]/PublicPersonView', () => ({ default: () => null }));
vi.mock('@/app/family/[slug]/person/[individualId]/page.module.css', () => ({ default: {} }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

import PublicPersonPage, { generateMetadata } from '@/app/family/[slug]/person/[individualId]/page';

function record(overrides: Partial<PublicTreeRecord> = {}): PublicTreeRecord {
  return {
    treeId: 't1',
    workspaceId: 'ws1',
    workspaceNameAr: 'آل السعيد',
    nameAr: 'آل السعيد',
    kind: 'main',
    visibility: 'public_listed',
    lastModifiedAt: new Date(),
    publicSlug: 'slug',
    enableKunya: true,
    hideBirthDateForFemale: false,
    hideBirthDateForMale: false,
    personPagesIndexable: false,
    ...overrides,
  };
}

function makeInd(overrides: Partial<Individual> & { id: string }): Individual {
  return {
    type: 'INDI',
    name: overrides.id,
    givenName: overrides.id,
    surname: '',
    sex: 'M',
    birth: '',
    birthPlace: '',
    birthDescription: '',
    birthNotes: '',
    birthHijriDate: '',
    death: '',
    deathPlace: '',
    deathDescription: '',
    deathNotes: '',
    deathHijriDate: '',
    kunya: '',
    notes: '',
    isDeceased: false,
    isPrivate: false,
    familiesAsSpouse: [],
    familyAsChild: null,
    publicDisplay: 'full',
    ...overrides,
  };
}

const EMPTY_EVENT = { date: '', hijriDate: '', place: '', description: '', notes: '' };

function makeFam(overrides: Partial<Family> & { id: string }): Family {
  return {
    type: 'FAM',
    husband: null,
    wife: null,
    children: [],
    marriageContract: { ...EMPTY_EVENT },
    marriage: { ...EMPTY_EVENT },
    divorce: { ...EMPTY_EVENT },
    isDivorced: false,
    ...overrides,
  };
}

function payload() {
  const individuals = {
    focal: makeInd({
      id: 'focal',
      name: 'باسل السعيد',
      givenName: 'باسل',
      surname: 'السعيد',
      familyAsChild: 'F1',
    }),
    dad: makeInd({ id: 'dad', name: 'محمد السعيد', givenName: 'محمد', surname: 'السعيد' }),
  };
  const families: Record<string, Family> = {
    F1: makeFam({ id: 'F1', husband: 'dad', children: ['focal'] }),
  };
  const data: GedcomData = { individuals, families };
  return { record: record(), data, names: [], homeIndividualIds: new Set(Object.keys(individuals)) };
}

function params(slug: string, individualId: string) {
  return { params: Promise.resolve({ slug, individualId }) };
}

/** Every JSON-LD blob the rendered page emitted. */
function jsonLdBlobs(container: HTMLElement): Record<string, unknown>[] {
  return Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map(
    (el) => JSON.parse(el.textContent || '{}') as Record<string, unknown>,
  );
}

function hasPersonSchema(blobs: Record<string, unknown>[]): boolean {
  return blobs.some((b) => {
    const graph = Array.isArray(b['@graph']) ? (b['@graph'] as Record<string, unknown>[]) : [b];
    return graph.some((node) => node['@type'] === 'Person');
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.resets.forEach((reset) => reset());
});

describe('public person page — Person JSON-LD emission gate', () => {
  test('listed MAIN tree with the opt-in ON emits Person JSON-LD', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(
      record({ visibility: 'public_listed', personPagesIndexable: true }),
    );
    mockBuildPublicTreePayload.mockResolvedValue(payload());

    const { container } = render(await PublicPersonPage(params('slug', 'focal')));
    expect(hasPersonSchema(jsonLdBlobs(container))).toBe(true);
  });

  test('listed MAIN tree with the opt-in OFF emits NO Person JSON-LD', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(
      record({ visibility: 'public_listed', personPagesIndexable: false }),
    );
    mockBuildPublicTreePayload.mockResolvedValue(payload());

    const { container } = render(await PublicPersonPage(params('slug', 'focal')));
    expect(hasPersonSchema(jsonLdBlobs(container))).toBe(false);
  });

  test('public_link tree with the opt-in ON emits NO Person JSON-LD', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(
      record({ visibility: 'public_link', personPagesIndexable: true }),
    );
    mockBuildPublicTreePayload.mockResolvedValue(payload());

    const { container } = render(await PublicPersonPage(params('slug', 'focal')));
    expect(hasPersonSchema(jsonLdBlobs(container))).toBe(false);
  });

  test('the page still SERVES on a by-link tree (only indexability is gated)', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(
      record({ visibility: 'public_link', personPagesIndexable: false }),
    );
    mockBuildPublicTreePayload.mockResolvedValue(payload());

    await expect(PublicPersonPage(params('slug', 'focal'))).resolves.toBeTruthy();
  });
});

describe('public person page — one payload build per request', () => {
  test('metadata + body share a single buildPublicTreePayload call', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(
      record({ visibility: 'public_listed', personPagesIndexable: true }),
    );
    mockBuildPublicTreePayload.mockResolvedValue(payload());

    await generateMetadata(params('slug', 'focal'));
    await PublicPersonPage(params('slug', 'focal'));

    expect(mockBuildPublicTreePayload).toHaveBeenCalledTimes(1);
  });
});

describe('public person page — sources never reach the SSR / JSON-LD', () => {
  test('a person with public sources: identical JSON-LD, no source text in the HTML, no source reads', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(
      record({ visibility: 'public_listed', personPagesIndexable: true }),
    );
    mockBuildPublicTreePayload.mockResolvedValue(payload());
    const baseline = render(await PublicPersonPage(params('slug', 'focal')));
    const before = jsonLdBlobs(baseline.container);
    baseline.unmount();
    hoisted.resets.forEach((reset) => reset());

    // The focal person now HAS a public-level source entry in the database.
    dbTouches.length = 0;
    publicSourceRows.push({ id: 'SRC-1', individualId: 'focal', visibility: 'public', text: 'طبقات ابن سعد، ص ٩٠' });
    try {
      const { container } = render(await PublicPersonPage(params('slug', 'focal')));
      expect(jsonLdBlobs(container)).toEqual(before);
      expect(container.innerHTML).not.toContain('ابن سعد');
      const meta = await generateMetadata(params('slug', 'focal'));
      expect(JSON.stringify(meta)).not.toContain('ابن سعد');
      expect(dbTouches.filter((t) => /source/i.test(t))).toEqual([]);
    } finally {
      publicSourceRows.length = 0;
    }
  });
});

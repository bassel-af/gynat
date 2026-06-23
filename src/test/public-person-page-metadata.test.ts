import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { PublicTreeRecord } from '@/lib/tree/public-serve';
import type { GedcomData, Individual } from '@/lib/gedcom/types';

// ---------------------------------------------------------------------------
// Mocks — exercise generateMetadata only; stub the heavy imports.
// ---------------------------------------------------------------------------

const mockGetPublicTreeForRequest = vi.fn();
const mockBuildPublicTreePayload = vi.fn();

vi.mock('@/lib/tree/public-serve', () => ({
  getPublicTreeForRequest: (...a: unknown[]) => mockGetPublicTreeForRequest(...a),
  buildPublicTreePayload: (...a: unknown[]) => mockBuildPublicTreePayload(...a),
  isPublicTreeIndexable: (r: PublicTreeRecord) =>
    r.kind === 'main' && r.visibility === 'public_listed',
}));

vi.mock('@/app/family/[slug]/person/[individualId]/PublicPersonPageClient', () => ({ default: () => null }));
vi.mock('@/app/family/[slug]/person/[individualId]/page.module.css', () => ({ default: {} }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

import { generateMetadata } from '@/app/family/[slug]/person/[individualId]/page';

function record(overrides: Partial<PublicTreeRecord>): PublicTreeRecord {
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
    ...overrides,
  };
}

function payloadWith(individuals: Record<string, Individual>) {
  const data: GedcomData = { individuals, families: {} };
  return { record: record({}), data, names: [] };
}

function params(slug: string, individualId: string) {
  return { params: Promise.resolve({ slug, individualId }) };
}

const PUBLIC_FOCAL = { focal: makeInd({ id: 'focal', name: 'باسل', publicDisplay: 'full' }) };

beforeEach(() => vi.clearAllMocks());

describe('public person page — generateMetadata robots', () => {
  test('public_listed MAIN tree -> indexable', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(record({ kind: 'main', visibility: 'public_listed' }));
    mockBuildPublicTreePayload.mockResolvedValue(payloadWith(PUBLIC_FOCAL));
    const meta = await generateMetadata(params('slug', 'focal'));
    expect(meta.robots).toMatchObject({ index: true });
  });

  test('public_link MAIN tree -> noindex (link-only kept out of search)', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(record({ kind: 'main', visibility: 'public_link' }));
    mockBuildPublicTreePayload.mockResolvedValue(payloadWith(PUBLIC_FOCAL));
    const meta = await generateMetadata(params('slug', 'focal'));
    expect(meta.robots).toMatchObject({ index: false });
  });

  test('public_listed EXTRA tree -> forced noindex', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(record({ kind: 'extra', visibility: 'public_listed' }));
    mockBuildPublicTreePayload.mockResolvedValue(payloadWith(PUBLIC_FOCAL));
    const meta = await generateMetadata(params('slug', 'focal'));
    expect(meta.robots).toMatchObject({ index: false });
  });

  test('unknown tree -> noindex + غير موجود', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(null);
    const meta = await generateMetadata(params('nope', 'focal'));
    expect(meta.robots).toMatchObject({ index: false });
    expect(meta.title).toBe('غير موجود');
  });
});

describe('public person page — no existence oracle / no PII in metadata', () => {
  test('a PRIVATE focal id -> غير موجود + noindex (indistinguishable from missing)', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(record({}));
    mockBuildPublicTreePayload.mockResolvedValue(
      payloadWith({ priv: makeInd({ id: 'priv', name: 'خاص', publicDisplay: 'redacted' }) }),
    );
    const meta = await generateMetadata(params('slug', 'priv'));
    expect(meta.title).toBe('غير موجود');
    expect(meta.robots).toMatchObject({ index: false });
  });

  test('an ABSENT focal id -> غير موجود (same as private — no oracle)', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(record({}));
    mockBuildPublicTreePayload.mockResolvedValue(payloadWith(PUBLIC_FOCAL));
    const meta = await generateMetadata(params('slug', 'does-not-exist'));
    expect(meta.title).toBe('غير موجود');
    expect(meta.robots).toMatchObject({ index: false });
  });

  test('title is the FAMILY name — never the individual name (no PII in title/OG)', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(record({ nameAr: 'آل السعيد' }));
    mockBuildPublicTreePayload.mockResolvedValue(payloadWith(PUBLIC_FOCAL));
    const meta = await generateMetadata(params('slug', 'focal'));
    expect(meta.title).toBe('آل السعيد');
    expect(meta.title).not.toBe('باسل');
    expect(meta.openGraph?.title).toBe('آل السعيد');
  });

  test('canonical + openGraph.url point at /family/{slug}/person/{id}', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(record({}));
    mockBuildPublicTreePayload.mockResolvedValue(payloadWith(PUBLIC_FOCAL));
    const meta = await generateMetadata(params('my-slug', 'focal'));
    expect(meta.alternates?.canonical).toBe('/family/my-slug/person/focal');
    expect(meta.openGraph).toMatchObject({ url: '/family/my-slug/person/focal' });
  });
});

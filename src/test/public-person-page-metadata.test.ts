import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { PublicTreeRecord } from '@/lib/tree/public-serve';
import type { GedcomData, Individual, Family } from '@/lib/gedcom/types';
import { blankPrivatePerson } from '@/lib/tree/mapper';

// ---------------------------------------------------------------------------
// Mocks — exercise generateMetadata only; stub the heavy imports.
//
// Both gates are stubbed with their real shape: the TREE gate (main + listed)
// and the PERSON-PAGE gate (tree gate + the owner opt-in). The page must use
// the PERSON-PAGE gate for robots + JSON-LD.
// ---------------------------------------------------------------------------

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

vi.mock('@/app/family/[slug]/person/[individualId]/PublicPersonView', () => ({ default: () => null }));
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

function payloadWith(
  individuals: Record<string, Individual>,
  families: Record<string, Family> = {},
) {
  const data: GedcomData = { individuals, families };
  return { record: record({}), data, names: [], homeIndividualIds: new Set(Object.keys(individuals)) };
}

function params(slug: string, individualId: string) {
  return { params: Promise.resolve({ slug, individualId }) };
}

const PUBLIC_FOCAL = { focal: makeInd({ id: 'focal', name: 'باسل', publicDisplay: 'full' }) };

/** A focal person with a public father, so the nasab chain has something to walk. */
function familyWithFather() {
  const individuals = {
    focal: makeInd({
      id: 'focal',
      name: 'باسل السعيد',
      givenName: 'باسل',
      surname: 'السعيد',
      familyAsChild: 'F1',
      publicDisplay: 'full',
    }),
    brother: makeInd({
      id: 'brother',
      name: 'سعيد السعيد',
      givenName: 'سعيد',
      surname: 'السعيد',
      familyAsChild: 'F1',
      publicDisplay: 'full',
    }),
    dad: makeInd({
      id: 'dad',
      name: 'محمد السعيد',
      givenName: 'محمد',
      surname: 'السعيد',
      publicDisplay: 'full',
    }),
  };
  const families = {
    F1: makeFam({ id: 'F1', husband: 'dad', children: ['focal', 'brother'] }),
  };
  return payloadWith(individuals, families);
}

beforeEach(() => vi.clearAllMocks());

describe('public person page — generateMetadata robots (person-page opt-in gate)', () => {
  test('listed MAIN tree with the opt-in ON -> indexable', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(
      record({ kind: 'main', visibility: 'public_listed', personPagesIndexable: true }),
    );
    mockBuildPublicTreePayload.mockResolvedValue(payloadWith(PUBLIC_FOCAL));
    const meta = await generateMetadata(params('slug', 'focal'));
    expect(meta.robots).toMatchObject({ index: true, follow: true });
  });

  test('listed MAIN tree with the opt-in OFF -> noindex (off by default)', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(
      record({ kind: 'main', visibility: 'public_listed', personPagesIndexable: false }),
    );
    mockBuildPublicTreePayload.mockResolvedValue(payloadWith(PUBLIC_FOCAL));
    const meta = await generateMetadata(params('slug', 'focal'));
    expect(meta.robots).toMatchObject({ index: false });
  });

  test('public_link MAIN tree with the opt-in ON -> noindex (link-only kept out of search)', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(
      record({ kind: 'main', visibility: 'public_link', personPagesIndexable: true }),
    );
    mockBuildPublicTreePayload.mockResolvedValue(payloadWith(PUBLIC_FOCAL));
    const meta = await generateMetadata(params('slug', 'focal'));
    expect(meta.robots).toMatchObject({ index: false });
  });

  test('public_listed EXTRA tree with the opt-in ON -> forced noindex', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(
      record({ kind: 'extra', visibility: 'public_listed', personPagesIndexable: true }),
    );
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

describe('public person page — no existence oracle', () => {
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
});

describe('public person page — title and description carry the person', () => {
  test('title is «{nasab name} — شجرة عائلة {family}»', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(record({ nameAr: 'آل السعيد' }));
    mockBuildPublicTreePayload.mockResolvedValue(familyWithFather());
    const meta = await generateMetadata(params('slug', 'focal'));
    expect(meta.title).toBe('باسل بن محمد السعيد — شجرة عائلة آل السعيد');
  });

  test('two people in the SAME tree get different titles', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(record({ nameAr: 'آل السعيد' }));
    mockBuildPublicTreePayload.mockResolvedValue(familyWithFather());
    const first = await generateMetadata(params('slug', 'focal'));
    mockBuildPublicTreePayload.mockResolvedValue(familyWithFather());
    const second = await generateMetadata(params('slug', 'brother'));
    expect(first.title).not.toBe(second.title);
    expect(second.title).toBe('سعيد بن محمد السعيد — شجرة عائلة آل السعيد');
  });

  test('description names the person then the family', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(record({ nameAr: 'آل السعيد' }));
    mockBuildPublicTreePayload.mockResolvedValue(familyWithFather());
    const meta = await generateMetadata(params('slug', 'focal'));
    expect(meta.description).toBe(
      'باسل بن محمد السعيد، فرد من شجرة عائلة آل السعيد الموثقة بالأنساب على جينات',
    );
  });

  test('openGraph title + description match the page title + description', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(record({ nameAr: 'آل السعيد' }));
    mockBuildPublicTreePayload.mockResolvedValue(familyWithFather());
    const meta = await generateMetadata(params('slug', 'focal'));
    expect(meta.openGraph?.title).toBe(meta.title);
    expect(meta.openGraph?.description).toBe(meta.description);
  });

  test('a PRIVATE father in the chain never leaks his real name into the title', async () => {
    const payload = familyWithFather();
    const dad = payload.data.individuals.dad;
    // Redact him exactly the way the public redactor does.
    dad.publicDisplay = 'redacted';
    blankPrivatePerson(dad);

    mockGetPublicTreeForRequest.mockResolvedValue(record({ nameAr: 'آل السعيد' }));
    mockBuildPublicTreePayload.mockResolvedValue(payload);
    const meta = await generateMetadata(params('slug', 'focal'));

    expect(String(meta.title)).not.toContain('محمد');
    expect(String(meta.description)).not.toContain('محمد');
    expect(String(meta.title)).toContain('خاص');
  });

  test('canonical + openGraph.url point at /family/{slug}/person/{id}', async () => {
    mockGetPublicTreeForRequest.mockResolvedValue(record({}));
    mockBuildPublicTreePayload.mockResolvedValue(payloadWith(PUBLIC_FOCAL));
    const meta = await generateMetadata(params('my-slug', 'focal'));
    expect(meta.alternates?.canonical).toBe('/family/my-slug/person/focal');
    expect(meta.openGraph).toMatchObject({ url: '/family/my-slug/person/focal' });
  });
});

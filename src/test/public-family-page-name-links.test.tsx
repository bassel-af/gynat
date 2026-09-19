import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { PublicTreeRecord } from '@/lib/tree/public-serve';
import type { GedcomData, Individual } from '@/lib/gedcom/types';

// ---------------------------------------------------------------------------
// The crawlable names list on the public tree page. Each name becomes a link to
// that person's own page ONLY when person pages are indexable for this tree
// (listed + the owner opt-in). Otherwise the names stay plain text, so a
// crawler is never handed a per-person URL the owner did not opt into.
// ---------------------------------------------------------------------------

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

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

vi.mock('@/app/family/[slug]/PublicTreePageClient', () => ({ default: () => null }));
vi.mock('@/app/family/[slug]/page.module.css', () => ({ default: {} }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

import PublicFamilyTreePage from '@/app/family/[slug]/page';

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

/**
 * A tree holding two public people and one PRIVATE person. `payload.names` is
 * what `buildPublicNamesList` produces: the private person is already excluded
 * there (that filter is the single privacy gate for this list).
 */
function payload() {
  const individuals = {
    p1: makeInd({ id: 'p1', name: 'باسل السعيد' }),
    p2: makeInd({ id: 'p2', name: 'سعيد السعيد' }),
    priv: makeInd({ id: 'priv', name: 'خاص', publicDisplay: 'redacted' }),
  };
  const data: GedcomData = { individuals, families: {} };
  return {
    record: record(),
    data,
    names: [
      { id: 'p1', name: 'باسل السعيد', gender: 'male' as const },
      { id: 'p2', name: 'سعيد السعيد', gender: 'male' as const },
    ],
    homeIndividualIds: new Set(Object.keys(individuals)),
  };
}

function params(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

async function renderPage(rec: PublicTreeRecord, slug = 'my-slug') {
  mockGetPublicTreeForRequest.mockResolvedValue(rec);
  mockBuildPublicTreePayload.mockResolvedValue(payload());
  return render(await PublicFamilyTreePage(params(slug)));
}

beforeEach(() => vi.clearAllMocks());

describe('public tree page — crawlable names list links', () => {
  test('person pages indexable: every name links to its own person page', async () => {
    const { container } = await renderPage(
      record({ visibility: 'public_listed', personPagesIndexable: true }),
    );
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/family/my-slug/person/p1');
    expect(hrefs).toContain('/family/my-slug/person/p2');
  });

  test('person pages indexable: the link text is the person name', async () => {
    const { container } = await renderPage(
      record({ visibility: 'public_listed', personPagesIndexable: true }),
    );
    const link = container.querySelector('a[href="/family/my-slug/person/p1"]');
    expect(link?.textContent).toBe('باسل السعيد');
  });

  test('opt-in OFF: names stay plain text, no person links', async () => {
    const { container } = await renderPage(
      record({ visibility: 'public_listed', personPagesIndexable: false }),
    );
    expect(container.querySelectorAll('a')).toHaveLength(0);
    expect(container.textContent).toContain('باسل السعيد');
  });

  test('by-link tree with the opt-in ON: no person links (kept out of search)', async () => {
    const { container } = await renderPage(
      record({ visibility: 'public_link', personPagesIndexable: true }),
    );
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  test('a PRIVATE individual never gets an anchor, even with the opt-in ON', async () => {
    const { container } = await renderPage(
      record({ visibility: 'public_listed', personPagesIndexable: true }),
    );
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).not.toContain('/family/my-slug/person/priv');
    expect(container.textContent).not.toContain('خاص');
  });
});

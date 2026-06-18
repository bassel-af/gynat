import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  // Per-request memoized loader (cache()) — generateMetadata + the page share
  // one DB lookup, mirroring family/[slug]/page.tsx's `getPublicTreeForRequest`.
  getPublicCollectionForRequest,
  buildPublicCollectionPayload,
  getCollectionListingReadiness,
} from '@/lib/collections/public-serve';
import PublicCollectionPageClient from './PublicCollectionPageClient';
import styles from './page.module.css';

// Dynamic SSR per request — no generateStaticParams, no build-time per-slug work.
export const dynamic = 'force-dynamic';

type PageParams = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug } = await params;
  const record = await getPublicCollectionForRequest(slug);
  if (!record) {
    return { title: 'غير موجود', robots: { index: false, follow: false } };
  }

  // A collection is indexable ONLY when it is public_listed AND every servable
  // leaf tree is itself public_listed (fully listable). A listed collection that
  // contains a link-only tree stays noindex — we never surface a link-only
  // family in search. Fail-closed: any uncertainty (readiness null) -> noindex.
  const indexable =
    record.visibility === 'public_listed' &&
    (await getCollectionListingReadiness(slug))?.fullyListable === true;

  const description = record.descriptionAr
    ? record.descriptionAr.slice(0, 160)
    : `مجموعة ${record.titleAr} من أشجار العائلة الموثقة على جينات`;
  const url = `/collections/${slug}`;

  return {
    // The root layout template ('%s · جينات') appends the brand.
    title: record.titleAr,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      locale: 'ar_SA',
      url,
      siteName: 'جينات',
      title: record.titleAr,
      description,
    },
    robots: indexable
      ? { index: true, follow: true }
      : { index: false, follow: false },
  };
}

export default async function PublicCollectionPage({ params }: PageParams) {
  const { slug } = await params;

  const record = await getPublicCollectionForRequest(slug);
  // Deny-by-default: unknown OR private OR collections-disabled -> 404.
  if (!record) notFound();

  const payload = await buildPublicCollectionPayload(record);

  // JSON-LD only on the indexable branch (public_listed + fully listable).
  // CollectionPage + BreadcrumbList only — NO Person/genealogy schema. Strings
  // derive from the redacted payload, never raw DB.
  const indexable =
    record.visibility === 'public_listed' &&
    (await getCollectionListingReadiness(slug))?.fullyListable === true;
  const url = `/collections/${slug}`;
  const jsonLd = indexable
    ? {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'CollectionPage',
            name: payload.titleAr,
            description:
              payload.descriptionAr ??
              `مجموعة ${payload.titleAr} من أشجار العائلة الموثقة على جينات`,
            inLanguage: 'ar',
            url,
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'جينات', item: '/' },
              {
                '@type': 'ListItem',
                position: 2,
                name: payload.titleAr,
                item: url,
              },
            ],
          },
        ],
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      {/*
        Server-rendered crawlable text (mirrors the family viewer): the
        collection title, its description, and the list of public tree names so
        crawlers and screen readers read them while the interactive card grid
        below is the sighted human view. Visually hidden, present in the DOM.
      */}
      <section className={styles.srOnly} aria-hidden="false">
        <h1>{payload.titleAr}</h1>
        {payload.descriptionAr && <p>{payload.descriptionAr}</p>}
        <nav aria-label="أشجار المجموعة">
          <ul>
            {payload.trees.map((tree) => (
              <li key={tree.slug}>{tree.titleAr}</li>
            ))}
          </ul>
        </nav>
      </section>

      <PublicCollectionPageClient
        titleAr={payload.titleAr}
        descriptionAr={payload.descriptionAr}
        trees={payload.trees.map((tree) => ({
          slug: tree.slug,
          titleAr: tree.titleAr,
          peopleCount: tree.peopleCount,
        }))}
      />
    </>
  );
}

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  getPublicTreeForRequest,
  buildPublicTreePayload,
  isPublicTreeIndexable,
} from '@/lib/tree/public-serve';
import PublicTreePageClient from './PublicTreePageClient';
import styles from './page.module.css';

// Dynamic SSR per request — no generateStaticParams, no build-time per-tree work.
export const dynamic = 'force-dynamic';

type PageParams = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug } = await params;
  const record = await getPublicTreeForRequest(slug);
  if (!record) {
    return { title: 'غير موجود', robots: { index: false, follow: false } };
  }

  const familyName = record.nameAr || record.workspaceNameAr;
  // Only "findable in Google" (public_listed) MAIN trees are indexable. By-link
  // trees are explicitly kept out of search (PRD §1.2, §7.6). An EXTRA tree
  // (Collections, Slice B) is ALWAYS noindex regardless of its visibility level
  // — only the main family tree is discoverable.
  const indexable = isPublicTreeIndexable(record);

  const description = `شجرة عائلة ${familyName} الموثقة بالأنساب والتقويم الهجري على جينات`;
  const url = `/family/${slug}`;

  return {
    // The root layout template ('%s · جينات') appends the brand — title is the
    // bare family name (no hand-written suffix).
    title: familyName,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      locale: 'ar_SA',
      url,
      siteName: 'جينات',
      title: familyName,
      description,
    },
    robots: indexable
      ? { index: true, follow: true }
      : { index: false, follow: false },
  };
}

export default async function PublicFamilyTreePage({ params }: PageParams) {
  const { slug } = await params;

  const record = await getPublicTreeForRequest(slug);
  // Deny-by-default: unknown OR private -> 404 (no existence leak).
  if (!record) notFound();

  const payload = await buildPublicTreePayload(record);
  const familyName = record.nameAr || record.workspaceNameAr;

  // JSON-LD only on the indexable branch (public_listed MAIN). WebPage +
  // BreadcrumbList only — NO Person/genealogy schema (would leak redacted
  // living PII). All strings derive from the already-redacted record.
  const indexable = isPublicTreeIndexable(record);
  const url = `/family/${slug}`;
  const jsonLd = indexable
    ? {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebPage',
            name: familyName,
            description: `شجرة عائلة ${familyName} الموثقة بالأنساب والتقويم الهجري على جينات`,
            inLanguage: 'ar',
            url,
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'جينات', item: '/' },
              { '@type': 'ListItem', position: 2, name: familyName, item: url },
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
        Server-rendered crawlable text (SEO, §7.6). The interactive canvas is
        drawn by client JS that search engines can't read, so the family name,
        a short description, the stats, and the PUBLIC NAMES LIST are emitted
        here into the initial HTML. Visually hidden — the canvas below is the
        human view — but present for crawlers. One URL, both surfaces.
      */}
      <section className={styles.srOnly} aria-hidden="false">
        <h1>{familyName}</h1>
        <p>شجرة عائلة {familyName}</p>
        <p>{payload.names.length} شخصا موثقا</p>
        <nav aria-label="أفراد العائلة">
          <ul>
            {payload.names.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
          </ul>
        </nav>
      </section>

      {/* Interactive read-only canvas hydrates on top of the same page. */}
      <PublicTreePageClient
        data={payload.data}
        familyName={familyName}
        subtitle={`${payload.names.length} شخصا موثقا`}
        reportHref={`/family/${slug}/report`}
      />
    </>
  );
}

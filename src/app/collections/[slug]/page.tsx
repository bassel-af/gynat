import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  // Per-request memoized loader (cache()) — generateMetadata + the page share
  // one DB lookup, mirroring family/[slug]/page.tsx's `getPublicTreeForRequest`.
  getPublicCollectionForRequest,
  buildPublicCollectionPayload,
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

  // Collections are ALWAYS noindex — there is no "findable in Google" variant
  // for a collection (PRD §1.2; only the main family tree is discoverable).
  return {
    title: record.titleAr,
    description: record.descriptionAr ?? `مجموعة ${record.titleAr}`,
    robots: { index: false, follow: false },
  };
}

export default async function PublicCollectionPage({ params }: PageParams) {
  const { slug } = await params;

  const record = await getPublicCollectionForRequest(slug);
  // Deny-by-default: unknown OR private OR collections-disabled -> 404.
  if (!record) notFound();

  const payload = await buildPublicCollectionPayload(record);

  return (
    <>
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

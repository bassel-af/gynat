import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  getPublicTreeForRequest,
  buildPublicTreePayload,
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
  // Only "findable in Google" (public_listed) trees are indexable. By-link
  // trees are explicitly kept out of search (PRD §1.2, §7.6).
  const indexable = record.visibility === 'public_listed';

  return {
    title: familyName,
    description: `شجرة عائلة ${familyName}`,
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

  return (
    <>
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
        <p>{payload.names.length} شخصًا موثّقًا</p>
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
        subtitle={`${payload.names.length} شخصًا موثّقًا`}
        reportHref={`/family/${slug}/report`}
      />
    </>
  );
}

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  getPublicTreeForRequest,
  buildPublicTreePayload,
  isPublicTreeIndexable,
} from '@/lib/tree/public-serve';
import { projectPerson } from '@/lib/tree/person-projection';
import { buildPersonJsonLd } from '@/lib/tree/person-jsonld';
import { PRIVATE_PERSON_PLACEHOLDER } from '@/lib/tree/mapper';
import PublicPersonView from './PublicPersonView';
import styles from './page.module.css';

// Dynamic SSR per request — no generateStaticParams, no build-time per-person work.
export const dynamic = 'force-dynamic';

type PageParams = { params: Promise<{ slug: string; individualId: string }> };

/**
 * Resolve the published tree + the focal person from the SAME redacted public
 * payload that the JSON-LD and human view both consume. Returns null on ANY of:
 * unknown/private tree, missing focal id, or a focal person that is redacted
 * (private). A private/absent individual is indistinguishable from a
 * nonexistent one — no existence oracle (PRD deny-by-default).
 *
 * NOTE: not React-cached because metadata + body both call it; the underlying
 * `getPublicTreeForRequest` IS cached, and the payload build is cheap relative
 * to the per-request render. Kept explicit to avoid memo bleed across requests.
 */
async function resolvePublicPerson(slug: string, individualId: string) {
  const record = await getPublicTreeForRequest(slug);
  if (!record) return null;

  const payload = await buildPublicTreePayload(record);
  const focal = payload.data.individuals[individualId];

  // Deny-by-default: the focal person must exist AND be publicly visible.
  // A redacted (private) person has no public page — 404, no oracle.
  if (!focal || focal.publicDisplay === 'redacted') return null;
  if (!focal.name || focal.name === PRIVATE_PERSON_PLACEHOLDER) return null;

  return { record, payload, focal };
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug, individualId } = await params;
  const resolved = await resolvePublicPerson(slug, individualId);
  if (!resolved) {
    return { title: 'غير موجود', robots: { index: false, follow: false } };
  }

  const { record } = resolved;
  const familyName = record.nameAr || record.workspaceNameAr;
  // Only "findable in Google" (public_listed) MAIN trees are indexable. The
  // person's own NAME is deliberately NOT in the title/OG (it would surface a
  // living/private-adjacent individual's identity in search snippets) — the
  // title is the family name, matching the tree page.
  const indexable = isPublicTreeIndexable(record);
  const url = `/family/${slug}/person/${individualId}`;
  const description = `فرد من شجرة عائلة ${familyName} الموثقة بالأنساب على جينات`;

  return {
    title: familyName,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'profile',
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

export default async function PublicPersonPage({ params }: PageParams) {
  const { slug, individualId } = await params;

  const resolved = await resolvePublicPerson(slug, individualId);
  // Deny-by-default: unknown tree, missing/private person -> 404 (no oracle).
  if (!resolved) notFound();

  const { record, payload } = resolved;
  const familyName = record.nameAr || record.workspaceNameAr;
  const url = `/family/${slug}/person/${individualId}`;

  // HUMAN view: project from the SAME redacted public data. Because the data is
  // already redacted (living births hidden, private blanked), the projection is
  // public-safe by construction — it reads only what a stranger may see.
  //
  // PUBLIC cap (architect §3 + security review): female-line recursion depth = 1;
  // the ancestry BOUNDARY is "anything outside this home tree" — a borrowed/
  // foreign node is emitted as a boundary chip but its ancestry is NEVER climbed
  // (redaction has already stripped the `_pointed` marker, so we use the home id
  // set captured pre-redaction). And `continueThroughPrivateAncestor` is LEFT
  // FALSE (the default): unlike the member tree, the PUBLIC patriline STOPS at a
  // private ancestor rather than climbing past the «خاص» placeholder to reveal
  // his father — the conservative posture from the security review of §4.4.
  const projection = projectPerson(payload.data, individualId, {
    maternalRecursionDepth: 1,
    // Public boundary is the home-tree edge; `climbBoundary` defaults to this same
    // `isBoundary`, so outside-home ancestry is never climbed nor enumerated.
    isBoundary: (ind) => !payload.homeIndividualIds.has(ind.id),
    continueThroughPrivateAncestor: false,
  });
  // Projection returns null for a private subject — already handled by the 404
  // above, but guard again (defense in depth).
  if (!projection) notFound();

  // MACHINE view: schema.org Person/genealogy JSON-LD. Emitted ONLY on the
  // indexable branch (public_listed MAIN). Built from the redacted data via the
  // single guarded builder — never emits a living birth date or a private node.
  const indexable = isPublicTreeIndexable(record);
  const jsonLd = buildPersonJsonLd({
    data: payload.data,
    focalId: individualId,
    canonicalUrl: url,
    indexable,
  });

  // WebPage + BreadcrumbList carry on every indexable page (no individual name
  // in the breadcrumb — family name only, matching the tree page).
  const pageJsonLd = indexable
    ? {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebPage',
            name: familyName,
            description: `فرد من شجرة عائلة ${familyName} على جينات`,
            inLanguage: 'ar',
            url,
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'جينات', item: '/' },
              { '@type': 'ListItem', position: 2, name: familyName, item: `/family/${slug}` },
            ],
          },
        ],
      }
    : null;

  return (
    <div className={styles.root}>
      {pageJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(pageJsonLd) }}
        />
      )}
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      {/*
        Shared person-view container (Surface 3) via a thin client wrapper that
        builds the href functions from the slug — a Server Component cannot pass
        function props to a Client Component. The projection is already redacted
        + public-capped; the view reads nothing beyond it. A private placeholder
        token has no id, so person hrefs are only ever built for real public ids.
      */}
      <PublicPersonView
        projection={projection}
        slug={slug}
        enableKunya={record.enableKunya}
      />
    </div>
  );
}

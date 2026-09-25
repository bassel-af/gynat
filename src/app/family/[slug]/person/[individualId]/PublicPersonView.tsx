'use client';

import type { PersonProjection } from '@/lib/tree/person-projection';
import { PersonPage } from '@/components/person';
import { PublicPersonSourcesCard } from '@/components/sources/PublicPersonSourcesCard';

export interface PublicPersonViewProps {
  /** Already-redacted, public-capped projection (private dropped upstream). */
  projection: PersonProjection;
  /** Public tree slug — used to build same-tree person/back/tree hrefs. */
  slug: string;
  /** The focal person — their public sources are fetched client-side. */
  individualId: string;
  enableKunya: boolean;
}

/**
 * Thin CLIENT wrapper that builds the href functions PersonPage needs.
 *
 * A Server Component cannot pass function props to a Client Component, so the
 * `hrefFor` builder is constructed HERE (client side) from the serializable
 * `slug`. PersonPage stays a reusable presentational client component; this
 * adapter binds it to the PUBLIC route's URL shape. It reads nothing beyond the
 * projection it is handed.
 */
export default function PublicPersonView({ projection, slug, individualId, enableKunya }: PublicPersonViewProps) {
  return (
    <PersonPage
      projection={projection}
      hrefFor={(id) => `/family/${slug}/person/${id}`}
      backHref={`/family/${slug}`}
      treeHref={`/family/${slug}`}
      enableKunya={enableKunya}
      // PUBLIC variant: PersonPage skips the per-user color overrides (no
      // localStorage read for an anonymous visitor) and suppresses the بن/بنت
      // nasab connector between two LIVING people. Privacy-relevant — pass it.
      variant="public"
      // «المصادر»: fetched in the browser from the anonymous sources route, so
      // the server render, metadata and JSON-LD stay source-free.
      afterRecord={<PublicPersonSourcesCard slug={slug} individualId={individualId} />}
    />
  );
}

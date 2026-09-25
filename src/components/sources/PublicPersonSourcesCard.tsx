'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import type { PublicPersonSources, PublicSourceEntryDto } from '@/lib/tree/public-sources';
import personStyles from '@/components/person/person.module.css';
import { SourceFileThumbs } from './SourceFileThumbs';
import { toArabicDigits } from './arabicDigits';
import styles from './PersonSourcesCard.module.css';

export interface PublicPersonSourcesCardProps {
  /** Public tree slug. */
  slug: string;
  individualId: string;
  /** `page` = the public person page card; `panel` = the public tree's person panel. */
  variant?: 'page' | 'panel';
}

/**
 * «المصادر» for an ANONYMOUS visitor — read-only footnotes of the entries the
 * owners opened to «زوار الشجرة المنشورة», the inherited tree-wide entry last.
 *
 * Fetched client-side from the public sources route (plain fetch, no
 * credentials, never cached) so the page's server render, metadata and
 * JSON-LD stay source-free. Thumbnails load straight from the public file
 * routes. Renders nothing when there is nothing to show — including the 404
 * a hidden (living / private / borrowed) person gets.
 */
export function PublicPersonSourcesCard({ slug, individualId, variant = 'page' }: PublicPersonSourcesCardProps) {
  const [sources, setSources] = useState<PublicPersonSources | null>(null);

  useEffect(() => {
    let active = true;
    setSources(null);
    const base = `/api/family/${encodeURIComponent(slug)}/person/${encodeURIComponent(individualId)}/sources`;
    fetch(base, { credentials: 'omit', cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) return null;
        const body = (await res.json()) as { data?: PublicPersonSources };
        return body.data ?? null;
      })
      .catch(() => null)
      .then((data) => {
        if (active) setSources(data);
      });
    return () => {
      active = false;
    };
  }, [slug, individualId]);

  if (!sources || (sources.entries.length === 0 && !sources.inherited)) return null;

  const personBase = `/api/family/${encodeURIComponent(slug)}/person/${encodeURIComponent(individualId)}/sources`;
  const treeBase = `/api/family/${encodeURIComponent(slug)}/sources/tree-entry`;
  const titleId = `public-sources-title-${variant}`;

  const renderEntry = (entry: PublicSourceEntryDto, index: number, inherited: boolean) => (
    <li key={entry.id} className={clsx(styles.note, { [styles.inherited]: inherited })}>
      <span className={styles.number} aria-hidden="true">
        {toArabicDigits(index + 1)}
      </span>
      <div className={styles.body}>
        {entry.text && <p className={styles.text}>{entry.text}</p>}
        <SourceFileThumbs
          workspaceId="public"
          entryId={entry.id}
          files={entry.files}
          size={variant === 'panel' ? 40 : 48}
          fileUrl={(file) =>
            inherited ? `${treeBase}/files/${file.id}` : `${personBase}/${entry.id}/files/${file.id}`
          }
        />
        {inherited && <span className={styles.inheritedTag}>من مصدر الشجرة</span>}
      </div>
    </li>
  );

  return (
    <section
      className={variant === 'panel' ? styles.panel : styles.card}
      aria-labelledby={titleId}
    >
      {variant === 'panel' ? (
        <h3 id={titleId} className={styles.panelTitle}>
          المصادر
        </h3>
      ) : (
        <div className={personStyles.sectionHead}>
          <h2 id={titleId} className={personStyles.sectionTitle}>
            المصادر
          </h2>
          <p className={personStyles.sectionHint}>ما يستند إليه هذا السجل.</p>
        </div>
      )}

      <ol className={clsx(styles.notes, { [styles.panelNotes]: variant === 'panel' })}>
        {sources.entries.map((entry, i) => renderEntry(entry, i, false))}
        {sources.inherited && renderEntry(sources.inherited, sources.entries.length, true)}
      </ol>
    </section>
  );
}

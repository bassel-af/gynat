'use client';

import Link from 'next/link';
import { FigureCluster } from '@/components/heritage/FigureCluster';
import { PublicGrowthCTA } from '@/components/public-tree/PublicGrowthCTA';
import { PublicTreeState } from '@/components/public-tree/PublicTreeState';
import { useState } from 'react';
import styles from './page.module.css';

/** One published tree inside a public collection (already public + redacted). */
export interface PublicCollectionCard {
  /** The per-tree public slug — links into the existing /family/[slug] viewer. */
  slug: string;
  titleAr: string;
  /** People count for the card subtitle, when the server supplies one. */
  peopleCount?: number | null;
}

export interface PublicCollectionPageClientProps {
  titleAr: string;
  descriptionAr?: string | null;
  /** Published, non-withheld trees — each opens the per-tree public viewer. */
  trees: PublicCollectionCard[];
}

/**
 * The anonymous public collection viewer. Unlike a single family tree (which
 * renders the interactive canvas), a collection is a GRID of its published
 * trees; each tree opens the existing per-tree `/family/[slug]` viewer.
 *
 * This page is built from the SAME visual vocabulary as the approved
 * `/design-preview` prototype — the jeweled-heritage workspace surface:
 *   - the prototype's nav strip (gold-orb جينات wordmark + a glass status pill);
 *   - its section header (gold eyebrow with a leading hairline, a Reem Kufi
 *     parchment→gold display title, a soft lead, and a floating glass count chip);
 *   - and, for each tree, a faithful clone of the prototype's WORKSPACE CARD: a
 *     tall glass panel with a gold top hairline, the family name in large display
 *     type, a stat row pinned to the foot above a faint gold rule, and a
 *     low-opacity figure cluster in the corner that lifts on hover.
 *
 * All collection pages are `noindex` (page-level meta on the server).
 */
export default function PublicCollectionPageClient({
  titleAr,
  descriptionAr,
  trees,
}: PublicCollectionPageClientProps) {
  const [ctaDismissed, setCtaDismissed] = useState(false);

  const hasTrees = trees.length > 0;
  // A single tree shouldn't stretch edge-to-edge; the few-cards layout stays
  // intimate and centered, while a fuller collection flows into the grid.
  const isSparse = trees.length > 0 && trees.length <= 2;
  const treeCountLabel = `${trees.length} ${trees.length === 1 ? 'شجرة' : 'أشجار'}`;

  return (
    <div className="heritage-surface">
      <main className={styles.page}>
        {/*
          The prototype's nav strip: the gold-orb جينات wordmark linking home at
          the start edge, and a glass status pill at the end so the public
          surface opens exactly like the approved workspace screens.
        */}
        <nav className={styles.navStrip}>
          <Link
            href="/"
            className={styles.wordmark}
            aria-label="جينات — الصفحة الرئيسية"
          >
            <span className={styles.wordmarkOrb} aria-hidden="true" />
            جينات
          </Link>
          <span className={styles.navPill}>
            <span className={styles.navDot} aria-hidden="true" />
            مجموعة عائلية
          </span>
        </nav>

        {/*
          Section header in the prototype's language: a gold eyebrow with a
          leading hairline, the collection name as the Reem Kufi display title,
          the optional description as a soft lead, and the tree count as a
          floating glass stat chip on the side.
        */}
        <header className={styles.intro}>
          <div className={styles.introText}>
            <span className={styles.eyebrow}>مجموعة عائلية موثَّقة</span>
            <h1 className={styles.collectionTitle}>{titleAr}</h1>
            {descriptionAr && (
              <p className={styles.collectionDesc}>{descriptionAr}</p>
            )}
          </div>

          {hasTrees && (
            <div className={styles.countChip}>
              <span className={styles.countChipLabel}>أشجار المجموعة</span>
              <span className={styles.countChipValue}>{treeCountLabel}</span>
            </div>
          )}
        </header>

        {hasTrees ? (
          <ul
            className={`${styles.cardGrid} ${isSparse ? styles.cardGridSparse : ''}`}
            role="list"
          >
            {trees.map((tree, index) => (
              <li key={tree.slug} className={styles.cardItem}>
                <Link
                  href={`/family/${tree.slug}`}
                  className={styles.card}
                  style={{ animationDelay: `${Math.min(index, 6) * 70}ms` }}
                >
                  <span className={styles.cardSheen} aria-hidden="true" />

                  <div className={styles.cardHeader}>
                    <span className={styles.cardCrest} aria-hidden="true">
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M12 3v7m0 0L8.5 7M12 10l3.5-3M12 10v4m0 0H7.5a2 2 0 0 0-2 2v3m6.5-5h4.5a2 2 0 0 1 2 2v3M5.5 21v-1m13 1v-1M12 21v-2"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span className={styles.cardOpen}>
                      عرض الشجرة
                      <svg
                        className={styles.cardOpenArrow}
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M15 6l-6 6 6 6"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </div>

                  <span className={styles.cardName}>{tree.titleAr}</span>

                  <div className={styles.cardFoot}>
                    {typeof tree.peopleCount === 'number' ? (
                      // Kept as one contiguous text run ("N شخصا موثقا") so it
                      // reads naturally and stays a single matchable string.
                      <span className={styles.cardStat}>
                        <span className={styles.cardStatDot} aria-hidden="true" />
                        {`${tree.peopleCount} شخصا موثقا`}
                      </span>
                    ) : (
                      <span className={styles.cardStat}>
                        <span className={styles.cardStatDot} aria-hidden="true" />
                        شجرة عائلية
                      </span>
                    )}
                  </div>

                  {/* Low-opacity heritage silhouettes anchored in the corner —
                      the prototype's workspace-card signature; lifts on hover. */}
                  <span className={styles.cardFigures} aria-hidden="true">
                    <FigureCluster variant="corner" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.emptySlot}>
            <PublicTreeState variant="empty" />
          </div>
        )}

        {!ctaDismissed && (
          <div className={styles.ctaSlot}>
            <PublicGrowthCTA variant="card" onClose={() => setCtaDismissed(true)} />
          </div>
        )}
      </main>
    </div>
  );
}

'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { PersonProjection } from '@/lib/tree/person-projection';
import { useTreeColorOverrides } from '@/hooks/useTreeColorOverrides';
import { NasabRibbon } from './NasabRibbon';
import { BloodlineColumn } from './BloodlineColumn';
import { FamilyHighlightProvider } from './FamilyHighlight';
import { MarriageGroupCard } from './MarriageGroupCard';
import { ChipGroup } from './ChipGroup';
import { RadaBlock } from './RadaBlock';
import { PersonRecord } from './PersonRecord';
import { ViewInTreeButton } from './ViewInTreeButton';
import { useCalendarPreference } from '@/hooks/useCalendarPreference';
import { subjectLifespan } from './yearFormat';
import styles from './person.module.css';

export interface PersonPageProps {
  projection: PersonProjection;
  /** Builds the in-app href for another person (the member or public route). */
  hrefFor: (id: string) => string;
  /** Where the "رجوع إلى الشجرة" link goes. */
  backHref: string;
  /** Where the "عرض في الشجرة" button (this person in the tree) goes. */
  treeHref: string;
  /** Workspace toggle — when false the kunya is suppressed everywhere. */
  enableKunya?: boolean;
  /**
   * Which surface is rendering. `member` (default) honors the viewer's tree
   * color overrides; `public` skips them (no per-user settings anonymously) and
   * suppresses the بن/بنت connector between two LIVING people in the ribbon.
   */
  variant?: 'member' | 'public';
}

/**
 * The whole Person Page, composed from the ported components. The consuming
 * route renders this with a projection + the route-specific href builders. The
 * structure mirrors the approved mockup section-for-section. The component is
 * purely presentational — it knows nothing about routing or data fetching.
 */
export function PersonPage({
  projection,
  hrefFor,
  backHref,
  treeHref,
  enableKunya = true,
  variant = 'member',
}: PersonPageProps) {
  // Honor the viewer's tree color customization (gold/green accents) — member
  // only; the public surface has no per-user settings.
  useTreeColorOverrides(variant === 'public');

  const { subject, paternalChain, maternalChain, marriages, grandchildren, siblings } = projection;
  const { paternalUncles, maternalUncles, paternalCousins, maternalCousins, rada } = projection;
  const { preference } = useCalendarPreference();

  const showKunya = enableKunya && !!subject.kunya;
  const subjectYears = subjectLifespan(subject, preference);

  // The universe over which the parent↔child relationship highlight is computed:
  // every chip rendered inside the family section EXCEPT the spouses (the
  // highlight is about parent→child links, which spouses do not participate in).
  const familyChips = useMemo(
    () => [
      ...marriages.flatMap((m) => m.children),
      ...grandchildren,
      ...siblings,
      ...paternalUncles,
      ...maternalUncles,
      ...paternalCousins,
      ...maternalCousins,
    ],
    [
      marriages,
      grandchildren,
      siblings,
      paternalUncles,
      maternalUncles,
      paternalCousins,
      maternalCousins,
    ],
  );

  const hasFamily =
    marriages.length > 0 ||
    familyChips.length > 0 ||
    rada.fathers.length > 0 ||
    rada.mothers.length > 0 ||
    rada.siblings.length > 0;

  return (
    <main className={styles.root}>
      <div className={styles.page}>
        {/* ============ TOP BAR ============ */}
        <nav className={styles.topbar}>
          <Link href={backHref} className={styles.backLink}>
            <span aria-hidden>→</span> رجوع إلى الشجرة
          </Link>
        </nav>

        {/* ============ HERO — nasab ribbon ============ */}
        <header className={styles.hero}>
          <span className={styles.eyebrow}>صفحة الشخص</span>

          <NasabRibbon
            subject={subject}
            chain={paternalChain}
            hrefFor={hrefFor}
            suppressLivingConnectors={variant === 'public'}
          />

          <div className={styles.heroMeta}>
            {showKunya && <span className={styles.kunya}>{subject.kunya}</span>}
            {showKunya && subjectYears && <span className={styles.metaDivider}>◆</span>}
            {subjectYears && <span className={styles.dates}>{subjectYears}</span>}
          </div>

          {(subject.living || subject.surname) && (
            <div className={styles.tagRow}>
              {subject.living && (
                <span className={styles.tagEmerald}>على قيد الحياة</span>
              )}
              {subject.surname && <span className={styles.tagMuted}>من بيت {subject.surname}</span>}
            </div>
          )}
        </header>

        {/* ============ TWO BLOODLINES BAND ============ */}
        {(paternalChain.length > 0 || maternalChain.length > 0) && (
          <section className={styles.bloodlines}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>سلسلتا النسب</h2>
              <p className={styles.sectionHint}>
                نسب الأب ونسب الأم جنبا إلى جنب.
              </p>
            </div>

            <div
              className={`${styles.bloodlinesGrid} ${
                // Only one side has documented ancestors → collapse to a single
                // column so the present column isn't left at half width with an
                // empty grid cell beside it.
                paternalChain.length === 0 || maternalChain.length === 0
                  ? styles.bloodlinesGridSingle
                  : ''
              }`}
            >
              <BloodlineColumn
                variant="paternal"
                kicker="نسب الأب"
                chain={paternalChain}
                subject={subject}
                hrefFor={hrefFor}
              />
              <BloodlineColumn
                variant="maternal"
                kicker="نسب الأم"
                chain={maternalChain}
                subject={subject}
                hrefFor={hrefFor}
              />
            </div>
          </section>
        )}

        {/* ============ IMMEDIATE & EXTENDED FAMILY ============ */}
        {hasFamily && (
          <section className={styles.family}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>الأسرة والصلات</h2>
              <p className={styles.sectionHint}>
                الزواج، الذرية والأحفاد، الإخوة، وأبناء العمومة والأخوال.
              </p>
            </div>

            <FamilyHighlightProvider chips={familyChips}>
              {marriages.length > 0 && (
                <div className={styles.marriagesWrap}>
                  {marriages.map((group, i) => (
                    <MarriageGroupCard
                      key={group.familyId}
                      group={group}
                      index={i}
                      total={marriages.length}
                      hrefFor={hrefFor}
                    />
                  ))}
                </div>
              )}

              {grandchildren.length > 0 && (
                <div className={styles.grandchildrenWrap}>
                  <ChipGroup
                    label="الأحفاد"
                    count={grandchildren.length}
                    chips={grandchildren}
                    hrefFor={hrefFor}
                  />
                </div>
              )}

              <div className={styles.familyColumns}>
                <ChipGroup
                  label="الإخوة والأخوات"
                  count={siblings.length}
                  chips={siblings}
                  hrefFor={hrefFor}
                />
                <ChipGroup
                  label="الأعمام"
                  count={paternalUncles.length}
                  chips={paternalUncles}
                  hrefFor={hrefFor}
                />
                <ChipGroup
                  label="الأخوال"
                  count={maternalUncles.length}
                  chips={maternalUncles}
                  hrefFor={hrefFor}
                />
                <ChipGroup
                  label="أولاد العمومة"
                  count={paternalCousins.length}
                  chips={paternalCousins}
                  hrefFor={hrefFor}
                />
                <ChipGroup
                  label="أبناء الأخوال"
                  count={maternalCousins.length}
                  chips={maternalCousins}
                  hrefFor={hrefFor}
                />
              </div>
            </FamilyHighlightProvider>

            <RadaBlock rada={rada} hrefFor={hrefFor} />
          </section>
        )}

        {/* ============ THE RECORD ============ */}
        <PersonRecord subject={subject} />

        {/* ============ VIEW IN TREE ============ */}
        <ViewInTreeButton href={treeHref} />

        <div className={styles.footnote}>
          وَجَعَلْنَاكُمْ شُعُوبًا وَقَبَائِلَ لِتَعَارَفُوا
        </div>
      </div>
    </main>
  );
}

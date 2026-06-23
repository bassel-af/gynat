'use client';

import Link from 'next/link';
import { NodeFigure } from '@/components/heritage/FigureCluster';
import type { Gender, MotherLine, PersonChip } from '@/lib/tree/person-projection';
import { useCalendarPreference } from '@/hooks/useCalendarPreference';
import { chipYears } from './yearFormat';
import styles from './person.module.css';

/**
 * Small inline person link tuned for the green mother-ribbon. A private father
 * token (the projection emits it as a locked `{ private: true, name: 'خاص' }`
 * placeholder) renders as a non-clickable «خاص» — never an `<a>`.
 */
function MotherName({ chip, hrefFor }: { chip: PersonChip; hrefFor: (id: string) => string }) {
  if (chip.private || !chip.id) {
    return <span className={styles.motherPrivate}>خاص</span>;
  }
  return (
    <Link href={hrefFor(chip.id)} className={styles.motherLink}>
      {chip.name}
    </Link>
  );
}

/**
 * One mother's nasab as a green ribbon: «<her name> بنت <father> بن <grandfather>».
 * `mother.fathers` is ordered nearest → oldest (her father first), all male,
 * fathers-only. The connector before the FIRST father is «بنت» (she is female);
 * deeper connectors are «بن» (descending from a male). A private father token
 * TERMINATES the chain (the projection emits no tokens past it).
 */
export function MotherRibbon({
  mother,
  hrefFor,
}: {
  mother: MotherLine;
  hrefFor: (id: string) => string;
}) {
  const { preference } = useCalendarPreference();
  const years = chipYears(mother, preference);

  return (
    <div className={styles.motherRibbon}>
      <span className={styles.motherAvatar}>
        <NodeFigure gender="female" />
      </span>
      {mother.private || !mother.id ? (
        <span className={styles.motherPrivate}>خاص</span>
      ) : (
        <Link href={hrefFor(mother.id)} className={styles.motherLink}>
          {mother.name}
        </Link>
      )}
      {years && <span className={styles.motherYears}>{years}</span>}
      {mother.fathers.map((f, i) => (
        <span key={f.id ?? `father-${i}`} className={styles.motherSeg}>
          <span className={styles.motherConnector}>{i === 0 ? 'بنت' : 'بن'}</span>
          <MotherName chip={f} hrefFor={hrefFor} />
        </span>
      ))}
    </div>
  );
}

/**
 * Recursive, collapsed-by-default disclosure into the FEMALE line.
 * `mother` is the woman whose nasab opens here; `childGender` is the gender of
 * the person SHE is the mother of (drives «نسب أمه» vs «نسب أمها» on the label).
 * Native <details> → touch + keyboard friendly, zero JS state, at every level.
 *
 * The projection has already bounded the `mother.mother` recursion (depth /
 * boundary / private / cycle / ceiling guarded), so we recurse without a guard.
 */
export function MotherDisclosure({
  mother,
  childGender,
  hrefFor,
}: {
  mother: MotherLine;
  childGender: Gender;
  hrefFor: (id: string) => string;
}) {
  return (
    <details className={styles.motherDisclosure}>
      <summary className={styles.motherSummary}>
        <span className={styles.motherSummaryDot} aria-hidden />
        {childGender === 'female' ? 'نسب أمها' : 'نسب أمه'}
        <span className={styles.motherChevron} aria-hidden>
          ⌄
        </span>
      </summary>
      <div className={styles.motherBody}>
        <MotherRibbon mother={mother} hrefFor={hrefFor} />
        {/* Recurse into HER mother — still collapsed by default. */}
        {mother.mother && (
          <MotherDisclosure mother={mother.mother} childGender="female" hrefFor={hrefFor} />
        )}
      </div>
    </details>
  );
}

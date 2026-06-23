'use client';

import Link from 'next/link';
import { NodeFigure } from '@/components/heritage/FigureCluster';
import type { PersonSubject, SpineChip } from '@/lib/tree/person-projection';
import { useCalendarPreference } from '@/hooks/useCalendarPreference';
import { MotherDisclosure } from './MotherDisclosure';
import { chipYears } from './yearFormat';
import styles from './person.module.css';

type Variant = 'paternal' | 'maternal';

/** A single node in a bloodline column: the ancestor card + optional mother line. */
function LineageNode({
  chip,
  badge,
  variant,
  hrefFor,
}: {
  chip: SpineChip;
  badge?: string;
  variant: Variant;
  hrefFor: (id: string) => string;
}) {
  const { preference } = useCalendarPreference();
  const years = chipYears(chip, preference);

  const inner = (
    <>
      <span className={styles.lineageAvatar}>
        <NodeFigure gender={chip.gender} />
      </span>
      <span className={styles.lineageText}>
        <span className={styles.lineageName}>
          {chip.private ? <span className={styles.privateName}>خاص</span> : chip.name}
        </span>
        {years && <span className={styles.lineageYears}>{years}</span>}
      </span>
      {badge && <span className={styles.lineageBadge}>{badge}</span>}
    </>
  );

  const cls = `${styles.lineageNode} ${styles[variant]} ${
    chip.private ? styles.lineageNodePrivate : ''
  }`;

  const card =
    chip.private || !chip.id ? (
      <div className={cls}>{inner}</div>
    ) : (
      <Link href={hrefFor(chip.id)} className={cls}>
        {inner}
      </Link>
    );

  return (
    <div className={styles.lineageNodeWrap}>
      {card}
      {chip.mother && (
        <MotherDisclosure mother={chip.mother} childGender={chip.gender} hrefFor={hrefFor} />
      )}
    </div>
  );
}

/**
 * One bloodline column (نسب الأب or نسب الأم). Renders the column head, the
 * "oldest documented ancestor" marker, the spine (oldest → person) with each
 * ancestor's married-in mother as a collapsed green disclosure, and the subject
 * pinned at the bottom as the column's terminus.
 *
 * The LAST spine entry gets the «الأب» / «الأم» badge. For the maternal column
 * that last entry IS the subject's mother (female); for the paternal column it
 * is the father.
 */
export function BloodlineColumn({
  variant,
  kicker,
  chain,
  subject,
  hrefFor,
}: {
  variant: Variant;
  kicker: string;
  chain: SpineChip[];
  subject: PersonSubject;
  hrefFor: (id: string) => string;
}) {
  const columnClass = variant === 'paternal' ? styles.colPaternal : styles.colMaternal;
  const badgeLabel = variant === 'paternal' ? 'الأب' : 'الأم';
  // The subject node on the maternal column reads as a softer, muted terminus.
  const selfClass =
    variant === 'maternal'
      ? `${styles.lineageNode} ${styles.lineageSelf} ${styles.lineageSelfMuted}`
      : `${styles.lineageNode} ${styles.lineageSelf}`;

  return (
    <div className={`${styles.lineageColumn} ${columnClass}`}>
      <div className={styles.lineageColHead}>
        <span className={styles.lineageColKicker}>{kicker}</span>
      </div>
      <div className={styles.lineageStack}>
        {chain.length > 0 && <div className={styles.lineageRoot}>أقدم سلف موثق</div>}
        {chain.map((anc, i) => (
          <LineageNode
            key={anc.id ?? `spine-${i}`}
            chip={anc}
            variant={variant}
            badge={i === chain.length - 1 ? badgeLabel : undefined}
            hrefFor={hrefFor}
          />
        ))}
        <div className={selfClass}>
          <span className={styles.lineageAvatar}>
            <NodeFigure gender={subject.gender} />
          </span>
          <span className={styles.lineageText}>
            <span className={styles.lineageName}>{subject.givenName}</span>
            <span className={styles.lineageYears}>الشخص المعروض</span>
          </span>
        </div>
      </div>
    </div>
  );
}

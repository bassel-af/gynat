'use client';

import { useId } from 'react';
import Link from 'next/link';
import { NodeFigure } from '@/components/heritage/FigureCluster';
import type { Gender, MotherLine, PersonChip } from '@/lib/tree/person-projection';
import { useCalendarPreference } from '@/hooks/useCalendarPreference';
import {
  getAlternateNameLine,
  getNasabToken,
  getOtherName,
  isFamousNameLead,
} from '@/lib/gedcom/display';
import { JumpDivider } from './JumpDivider';
import { asNamedIndividual, chipNameLines } from './personNames';
import { chipYears } from './yearFormat';
import styles from './person.module.css';

/**
 * Small inline father link tuned for the green mother-ribbon, following the
 * hero NasabRibbon: the father's LEAD name in the genitive after بن/بنت
 * («أبي طالب»), and — when he has a famous name — a tiny muted caption of his
 * other name, with «واسمه …» / «ويُعرف ب…» as the link's description. A father
 * without a famous name keeps his display name. A private father token (the
 * projection emits it as a locked `{ private: true, name: 'خاص' }` placeholder)
 * renders as a non-clickable «خاص» — never an `<a>`.
 */
function MotherName({
  chip,
  descId,
  hrefFor,
}: {
  chip: PersonChip;
  descId: string;
  hrefFor: (id: string) => string;
}) {
  if (chip.private || !chip.id) {
    return <span className={styles.motherPrivate}>خاص</span>;
  }
  const person = asNamedIndividual(chip);
  const altLine = getAlternateNameLine(person);
  const token = isFamousNameLead(person) ? getNasabToken(person) : chip.name;
  if (!altLine) {
    return (
      <Link href={hrefFor(chip.id)} className={styles.motherLink}>
        {token}
      </Link>
    );
  }
  return (
    <span className={styles.motherName}>
      <Link href={hrefFor(chip.id)} className={styles.motherLink} aria-describedby={descId}>
        {token}
      </Link>
      <span className={styles.motherCaption} aria-hidden="true">
        {getOtherName(person)}
      </span>
      <span id={descId} hidden>
        {altLine}
      </span>
    </span>
  );
}

/**
 * One mother's nasab as a green ribbon: «<her name> بنت <father> بن <grandfather>».
 * `mother.fathers` is ordered nearest → oldest (her father first), all male,
 * fathers-only. The connector before the FIRST father is «بنت» (she is female);
 * deeper connectors are «بن» (descending from a male). A private father token
 * TERMINATES the chain (the projection emits no tokens past it).
 *
 * A father REACHED BY a «قفزة نسب» carries `jump`, and at that position the
 * connector is replaced by the same divider the hero ribbon uses — «بن» there
 * would claim a father→son link across a gap the record does not fill.
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
  const idBase = useId();

  return (
    <div className={styles.motherRibbon}>
      <span className={styles.motherAvatar}>
        <NodeFigure gender="female" />
      </span>
      {mother.private || !mother.id ? (
        <span className={styles.motherPrivate}>خاص</span>
      ) : (
        <Link href={hrefFor(mother.id)} className={styles.motherLink}>
          {chipNameLines(mother).lead}
        </Link>
      )}
      {years && <span className={styles.motherYears}>{years}</span>}
      {mother.fathers.map((f, i) => (
        <span key={f.id ?? `father-${i}`} className={styles.motherSeg}>
          {f.jump ? (
            <JumpDivider range={f.jump} size="inline" />
          ) : (
            <span className={styles.motherConnector}>{i === 0 ? 'بنت' : 'بن'}</span>
          )}
          <MotherName chip={f} descId={`${idBase}-alt-${i}`} hrefFor={hrefFor} />
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

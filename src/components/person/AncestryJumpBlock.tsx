'use client';

import type { AncestryJumpProjection } from '@/lib/tree/person-projection';
import { ChipGroup } from './ChipGroup';
import { JUMP_LABEL, jumpRangeText } from './jumpRange';
import styles from './person.module.css';

/**
 * The «قفزة نسب» card: a certain descent from a distant ancestor COUPLE across
 * an unrecorded (or deliberately skipped) number of generations.
 *
 * This is the ONLY place a female-only distant ancestor appears — she never
 * joins the نسب name chain (owner ruling), but she is a recorded ancestor and
 * must be shown. The card states the generation range when one was given, and
 * carries the note that justifies the link.
 *
 * Renders nothing when there is no jump, or when both ancestors are withheld
 * (private) — an empty card claims a lineage without naming anybody.
 *
 * No parent↔child highlight runs here (the jump is not a parent edge), so like
 * `RadaBlock` it sits OUTSIDE the FamilyHighlightProvider.
 */
export function AncestryJumpBlock({
  jump,
  hrefFor,
}: {
  jump: AncestryJumpProjection | undefined;
  hrefFor: (id: string) => string;
}) {
  if (!jump) return null;
  if (!jump.father && !jump.mother) return null;

  const range = jumpRangeText(jump);

  return (
    <div className={styles.jumpBlock}>
      <div className={styles.jumpHead}>
        <span className={styles.jumpKicker}>{JUMP_LABEL}</span>
        <span className={styles.jumpSub}>
          نسب ثابت إلى جدّ بعيد، دون ذكر من بينهما من الأجيال
        </span>
        {range && <span className={styles.jumpBlockRange}>{range}</span>}
      </div>
      <div className={styles.familyColumns}>
        <ChipGroup label="الجدّ" chips={jump.father ? [jump.father] : []} hrefFor={hrefFor} />
        <ChipGroup label="الجدّة" chips={jump.mother ? [jump.mother] : []} hrefFor={hrefFor} />
      </div>
      {jump.notes && <p className={styles.jumpNotes}>{jump.notes}</p>}
    </div>
  );
}

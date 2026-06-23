'use client';

import type { PersonProjection } from '@/lib/tree/person-projection';
import { ChipGroup } from './ChipGroup';
import styles from './person.module.css';

type Rada = PersonProjection['rada'];

/**
 * The رضاعة (milk-kinship) sub-section — a distinct emerald block kept apart
 * from blood relations. No parent↔child highlight runs here (these relations
 * are not arranged as a lineage), so it sits OUTSIDE the FamilyHighlightProvider.
 *
 * Renders nothing when there are no rada relations at all.
 */
export function RadaBlock({ rada, hrefFor }: { rada: Rada; hrefFor: (id: string) => string }) {
  const isEmpty =
    rada.fathers.length === 0 && rada.mothers.length === 0 && rada.siblings.length === 0;
  if (isEmpty) return null;

  return (
    <div className={styles.radaBlock}>
      <div className={styles.radaHead}>
        <span className={styles.radaKicker}>صلات الرضاعة</span>
        <span className={styles.radaSub}>قرابة شرعية محفوظة إلى جانب النسب</span>
      </div>
      <div className={styles.familyColumns}>
        <ChipGroup label="الأب من الرضاعة" chips={rada.fathers} hrefFor={hrefFor} />
        <ChipGroup label="الأم من الرضاعة" chips={rada.mothers} hrefFor={hrefFor} />
        <ChipGroup
          label="الإخوة من الرضاعة"
          count={rada.siblings.length}
          chips={rada.siblings}
          hrefFor={hrefFor}
        />
      </div>
    </div>
  );
}

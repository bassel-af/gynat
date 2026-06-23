'use client';

import type { PersonChip } from '@/lib/tree/person-projection';
import { RelationChip } from './FamilyHighlight';
import styles from './person.module.css';

/**
 * A labelled group of relation chips (e.g. الإخوة, الأعمام). Renders nothing
 * when there are no chips so empty relations simply drop out of the layout.
 */
export function ChipGroup({
  label,
  count,
  chips,
  hrefFor,
}: {
  label: string;
  count?: number;
  chips: PersonChip[];
  hrefFor: (id: string) => string;
}) {
  if (chips.length === 0) return null;

  return (
    <section className={styles.familyGroup}>
      <div className={styles.familyGroupLabel}>
        {label}
        {typeof count === 'number' && <span className={styles.familyGroupCount}>{count}</span>}
      </div>
      <div className={styles.relationRow}>
        {chips.map((c) => (
          <RelationChip key={c.id} chip={c} hrefFor={hrefFor} />
        ))}
      </div>
    </section>
  );
}

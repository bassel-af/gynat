'use client';

import { NodeFigure } from '@/components/heritage/FigureCluster';
import type { MarriageGroup } from '@/lib/tree/person-projection';
import { useCalendarPreference } from '@/hooks/useCalendarPreference';
import { RelationChip } from './FamilyHighlight';
import { marriageMeta } from './yearFormat';
import styles from './person.module.css';

const ORDINALS = ['الزواج الأول', 'الزواج الثاني', 'الزواج الثالث', 'الزواج الرابع'];

/** Arabic ordinal label for the nth marriage (1-based); falls back gracefully. */
function marriageLabel(index: number): string {
  return ORDINALS[index] ?? `الزواج ${index + 1}`;
}

/**
 * One marriage group (polygamy aware): the spouse chip + that marriage's
 * children. The spouse participates in the relationship highlight like any
 * other chip; the children belong to THIS marriage only.
 *
 * `group.spouse` is null when no spouse is recorded/visible (e.g. a private
 * spouse) — the card still shows the marriage's children, just without a spouse
 * chip. A discreet «غير مذكورة» placeholder keeps the head from looking broken.
 */
export function MarriageGroupCard({
  group,
  index,
  hrefFor,
}: {
  group: MarriageGroup;
  /** 0-based position among the subject's marriages — drives the ordinal label. */
  index: number;
  hrefFor: (id: string) => string;
}) {
  const { preference } = useCalendarPreference();
  const meta = marriageMeta(group.marriageEvent, preference);

  return (
    <div className={styles.marriageCard}>
      <div className={styles.marriageHead}>
        <span className={styles.marriageLabel}>{marriageLabel(index)}</span>
        {group.spouse ? (
          <RelationChip chip={group.spouse} hrefFor={hrefFor} />
        ) : (
          <span className={`${styles.relationChip} ${styles.relationChipPrivate}`}>
            <span className={styles.relationAvatar}>
              <NodeFigure gender="female" />
            </span>
            <span className={styles.relationText}>
              <span className={styles.privateName}>غير مذكورة</span>
            </span>
          </span>
        )}
        {meta && <span className={styles.marriageMeta}>{meta}</span>}
      </div>
      {group.children.length > 0 && (
        <>
          <div className={styles.familyGroupLabel}>
            الذرية <span className={styles.familyGroupCount}>{group.children.length}</span>
          </div>
          <div className={styles.relationRow}>
            {group.children.map((c) => (
              <RelationChip key={c.id} chip={c} hrefFor={hrefFor} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

'use client';

import { JUMP_CONNECTOR } from '@/lib/gedcom/display';
import { formatAncestryJumpLabel } from '@/components/tree/FamilyTree/buildTreeData';
import type { JumpRange } from '@/lib/tree/person-projection';
import styles from './person.module.css';

/**
 * The connector that stands where a «بن» token would otherwise go, at a chip
 * reached across a «قفزة نسب».
 *
 * It exists because printing «بن» there would assert a father→son link the
 * record does not make. What it prints is `JUMP_CONNECTOR` — «من وَلَد» — the
 * SAME wording `getDisplayNameWithNasab` puts in a plain-text nasab, so one
 * person's name reads identically on every surface: «عدنان، من وَلَد إسماعيل».
 *
 * It is a connector, not a badge: «قفزة نسب» is the name of the FEATURE (the
 * action, the canvas edge chip, the `AncestryJumpBlock` heading), and the
 * generation range is stated there too — neither belongs inside a person's
 * name, which is why `range` is accepted here but deliberately never rendered.
 *
 * Every nasab surface that can contain a jump-marked chip renders THIS — the
 * hero ribbon and the green mother ribbon — so the two can never drift apart.
 *
 * `size` picks the type scale AND the punctuation: the hero ribbon sizes
 * relative to its own very large font (`em`) and carries the comma that binds
 * to the preceding name, exactly as `display.ts` punctuates it. `inline` is the
 * fixed small scale used by the mother ribbon — where the marker stands between
 * two names, so a comma there would be an orphan glyph.
 *
 * `variant="chip"` is the OTHER thing entirely, and the bloodline column is its
 * only caller. That column is not a name; it is the canvas's broken edge stood
 * on end between two stacked cards. So it wears the canvas's own dashed pill,
 * labelled by the very `formatAncestryJumpLabel` the edge uses — feature name
 * plus the stated range — so a reader who met the chip on the tree meets the
 * identical marker here. Both readings live in one component precisely so the
 * rule "a name never carries the label, a thread always does" stays in one
 * place.
 */
export function JumpDivider({
  range,
  size = 'ribbon',
  variant = 'connector',
}: {
  /**
   * Rendered ONLY by the chip variant; the connector accepts it so every
   * jump-marked chip can pass its range without knowing the surface.
   */
  range: JumpRange;
  size?: 'ribbon' | 'inline';
  variant?: 'connector' | 'chip';
}) {
  if (variant === 'chip') {
    return <span className={styles.jumpChip}>{formatAncestryJumpLabel(range)}</span>;
  }

  const cls = `${styles.jumpConnector} ${size === 'inline' ? styles.jumpConnectorInline : ''}`;

  return (
    <>
      {size === 'ribbon' && <span className={styles.jumpComma}>،</span>}
      <span className={cls}>{JUMP_CONNECTOR}</span>
    </>
  );
}

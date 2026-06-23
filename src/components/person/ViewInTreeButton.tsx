'use client';

import Link from 'next/link';
import styles from './person.module.css';

/**
 * The person page's primary call-to-action: a labeled GOLD PILL that links the
 * reader to the same person in the tree («عرض في الشجرة»). It is a presentational
 * LINK, not a stateful switcher — the route hands it the destination `href`
 * (built from the single href source `@/lib/tree/view-modes`); this component
 * never constructs URLs. `label`/`glyph` are configurable so the same pill could
 * drive the reverse jump (tree → page) if ever needed.
 *
 * Distinct from the canvas sidebar's compact icon `ViewSwitcherIconButton`
 * (`@/components/tree`) — different affordance, different host.
 */
export function ViewInTreeButton({
  href,
  label = 'عرض في الشجرة',
  glyph = '⌖',
}: {
  href: string;
  label?: string;
  glyph?: string;
}) {
  return (
    <div className={styles.actions}>
      <Link href={href} className={styles.treeBtn}>
        <span aria-hidden>{glyph}</span> {label}
      </Link>
    </div>
  );
}

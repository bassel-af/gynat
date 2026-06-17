'use client';

import {
  VISIBILITY_SHORT,
  LINK_MODE_LABEL,
  type Visibility,
  type ItemLinkMode,
} from '@/lib/collections/api';
import styles from './CollectionBadges.module.css';

/**
 * Small, reusable status chips shared across every collections screen so the
 * visibility ladder and the link/copy distinction read identically everywhere.
 */

export function VisibilityChip({ level }: { level: Visibility }) {
  const variant =
    level === 'private'
      ? styles.private
      : level === 'search'
        ? styles.search
        : styles.link;
  const icon =
    level === 'private'
      ? 'material-symbols:lock'
      : level === 'search'
        ? 'material-symbols:travel-explore'
        : 'material-symbols:link';
  return (
    <span className={`${styles.chip} ${variant}`}>
      <iconify-icon icon={icon} width="13" height="13" aria-hidden="true" />
      {VISIBILITY_SHORT[level]}
    </span>
  );
}

export function LinkModeBadge({ mode }: { mode: ItemLinkMode }) {
  const variant = mode === 'linked' ? styles.linked : styles.copied;
  const icon =
    mode === 'linked'
      ? 'material-symbols:sync'
      : 'material-symbols:lock-clock';
  return (
    <span className={`${styles.chip} ${variant}`} title={LINK_MODE_LABEL[mode]}>
      <iconify-icon icon={icon} width="13" height="13" aria-hidden="true" />
      {LINK_MODE_LABEL[mode]}
    </span>
  );
}

/** Plainly surfaces that a private tree will not appear in a public view (§3). */
export function WithheldBadge() {
  return (
    <span className={`${styles.chip} ${styles.withheld}`}>
      <iconify-icon
        icon="material-symbols:visibility-off"
        width="13"
        height="13"
        aria-hidden="true"
      />
      يُحجب عند النشر
    </span>
  );
}

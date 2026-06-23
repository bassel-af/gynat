'use client';

import Link from 'next/link';
import styles from './person.module.css';

/**
 * The minimal shape the ribbon link needs: a real person carries id + name; a
 * private chain placeholder carries `private: true` (id/name unused). Both
 * `PersonChip` and `SpineChip` satisfy this.
 */
interface LinkableChip {
  /** Absent on a private placeholder (no navigable handle). */
  id?: string;
  name: string;
  private?: boolean;
}

/**
 * Inline person link used inside the nasab ribbon (the hero patronymic chain).
 *
 * A PRIVATE token is NEVER a link: it renders a non-clickable «خاص» span (no
 * `<a>`, no href, no navigation target). The projection emits private direct
 * ancestors as `{ private: true, name: 'خاص' }` purely for continuity — there is
 * nothing to navigate to and no PII to leak.
 *
 * `kind="lead"` styles the subject (largest, brightest) at the head of the ribbon.
 */
export function PersonLink({
  chip,
  kind = 'default',
  hrefFor,
}: {
  chip: LinkableChip;
  kind?: 'default' | 'lead';
  /** Builds the navigation href for a non-private person. */
  hrefFor: (id: string) => string;
}) {
  if (chip.private || !chip.id) {
    return (
      <span className={styles.privateInline} aria-label="فرد خاص">
        خاص
      </span>
    );
  }

  return (
    <Link
      href={hrefFor(chip.id)}
      className={`${styles.personLink} ${kind === 'lead' ? styles.personLinkLead : ''}`}
    >
      {chip.name}
    </Link>
  );
}

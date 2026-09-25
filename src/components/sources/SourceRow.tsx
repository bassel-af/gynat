'use client';

import type { ReactNode } from 'react';
import clsx from 'clsx';
import { LockIcon } from './SourceIcons';
import { toArabicDigits } from './arabicDigits';
// The row look is the sidebar's; the edit form reuses it as is.
import styles from './PersonSourcesSection.module.css';

/**
 * «مشترك مع …» — how many OTHER people (this viewer may see) the source is
 * for: 1 «مشترك مع شخص آخر», 2 «مشترك مع شخصين آخرين», else «مشترك مع {K} آخرين».
 */
export function sharedWithLabel(k: number): string {
  if (k === 1) return 'مشترك مع شخص آخر';
  if (k === 2) return 'مشترك مع شخصين آخرين';
  return `مشترك مع ${toArabicDigits(k)} آخرين`;
}

/** The green «مشترك مع …» tag; nothing when the source is this person's alone. */
export function SharedTag({ count, className }: { count: number; className?: string }) {
  if (count < 1) return null;
  return <span className={clsx(styles.sharedTag, className)}>{sharedWithLabel(count)}</span>;
}

export interface SourceRowProps {
  text: string | null;
  /** The files strip (thumbnails) — shown on the meta line before the lock badge. */
  thumbs?: ReactNode;
  /** «للمشرفين» badge (level «المشرفون فقط»). */
  locked?: boolean;
  /** Other people (visible to the viewer) the source is for — the «مشترك مع …» tag. */
  sharedCount?: number;
  /** A short state tag on the meta line («جديد», «مُعدَّل», «سيُحذف» …). */
  tag?: ReactNode;
  /** Buttons at the row's end (menu / edit / delete / «تراجع»). */
  actions?: ReactNode;
  /** Anything under the row (a menu, an inline confirm). */
  children?: ReactNode;
  className?: string;
  textClassName?: string;
}

/** One source as a list row: text, a meta line (thumbs + lock badge + shared tag + tag), actions. */
export function SourceRow({
  text,
  thumbs,
  locked,
  sharedCount = 0,
  tag,
  actions,
  children,
  className,
  textClassName,
}: SourceRowProps) {
  return (
    <li className={clsx(styles.row, className)}>
      <div className={styles.rowMain}>
        {text && <p className={clsx(styles.text, textClassName)}>{text}</p>}
        <div className={styles.meta}>
          {thumbs}
          {locked && (
            <span className={styles.lockBadge}>
              <LockIcon size={11} />
              للمشرفين
            </span>
          )}
          <SharedTag count={sharedCount} />
          {tag}
        </div>
      </div>
      {actions && <div className={styles.rowActions}>{actions}</div>}
      {children}
    </li>
  );
}

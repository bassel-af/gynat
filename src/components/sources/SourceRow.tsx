'use client';

import type { ReactNode } from 'react';
import clsx from 'clsx';
import { LockIcon } from './SourceIcons';
// The row look is the sidebar's; the edit form reuses it as is.
import styles from './PersonSourcesSection.module.css';

export interface SourceRowProps {
  text: string | null;
  /** The files strip (thumbnails) — shown on the meta line before the lock badge. */
  thumbs?: ReactNode;
  /** «للمشرفين» badge (level «المشرفون فقط»). */
  locked?: boolean;
  /** A short state tag on the meta line («جديد», «مُعدَّل», «سيُحذف» …). */
  tag?: ReactNode;
  /** Buttons at the row's end (edit / delete / «تراجع»). */
  actions?: ReactNode;
  /** Anything under the row (an inline confirm). */
  children?: ReactNode;
  className?: string;
  textClassName?: string;
}

/** One source entry as a list row: text, a meta line (thumbs + lock badge + tag), actions. */
export function SourceRow({ text, thumbs, locked, tag, actions, children, className, textClassName }: SourceRowProps) {
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
          {tag}
        </div>
      </div>
      {actions && <div className={styles.rowActions}>{actions}</div>}
      {children}
    </li>
  );
}

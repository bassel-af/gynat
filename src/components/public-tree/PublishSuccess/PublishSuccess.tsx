'use client';

import { useState } from 'react';
import clsx from 'clsx';
import type { VisibilityLevel } from '../VisibilityLadder';
import styles from './PublishSuccess.module.css';

export interface PublishSuccessProps {
  /** The visibility level the tree was published at. */
  level: Exclude<VisibilityLevel, 'private'>;
  /** The shareable public link to display and copy. */
  shareUrl: string;
  /** Dismiss the success state / close the flow. */
  onDone?: () => void;
  className?: string;
}

const LEVEL_COPY: Record<Exclude<VisibilityLevel, 'private'>, { title: string; note: string }> = {
  link: {
    title: 'أصبحت شجرتك متاحةً عبر الرابط',
    note: 'يستطيع مَن يملك هذا الرابط مشاهدتها. لا تظهر في نتائج البحث.',
  },
  search: {
    title: 'نُشِرت شجرتك وقد تظهر في البحث',
    note: 'شارِك الرابط الآن. قد تبدأ بالظهور في نتائج Google خلال الأيّام القادمة.',
  },
};

/**
 * Success state after a successful publish — confirms the chosen visibility and
 * offers a shareable link to copy.
 *
 * Presentational only: the link is supplied by the caller (a fake value in the
 * static flow). The copy uses the clipboard API purely as a UI nicety; it is
 * not feature logic.
 */
export function PublishSuccess({ level, shareUrl, onDone, className }: PublishSuccessProps) {
  const [copied, setCopied] = useState(false);
  const copy = LEVEL_COPY[level];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable (e.g. insecure context) — ignore silently.
    }
  };

  return (
    <div className={clsx(styles.root, className)}>
      <div className={styles.icon} aria-hidden="true">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 12.5l2.5 2.5L16 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <h3 className={styles.title}>{copy.title}</h3>
      <p className={styles.note}>{copy.note}</p>

      <div className={styles.linkRow}>
        <span className={styles.linkLabel}>الرابط العامّ</span>
        <div className={styles.linkBox}>
          <code className={styles.linkValue} dir="ltr">
            {shareUrl}
          </code>
          <button type="button" className={styles.copyBtn} onClick={handleCopy}>
            {copied ? 'تم النسخ ✓' : 'نسخ'}
          </button>
        </div>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onDone}>
          تمّ
        </button>
      </div>
    </div>
  );
}

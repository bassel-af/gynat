'use client';

import clsx from 'clsx';
import Link from 'next/link';
import styles from './PublicGrowthCTA.module.css';

export interface PublicGrowthCTAProps {
  /**
   * Layout variant:
   * - `card` — a docked glass card (desktop sidebar footer).
   * - `bar`  — a single slim button (mobile, anchored bottom).
   */
  variant?: 'card' | 'bar';
  /** Where the primary action goes. Defaults to signup. */
  startHref?: string;
  /** Where the secondary "how it works" action goes. Defaults to the marketing home. */
  learnHref?: string;
  /** When provided, renders a dismiss (×) control that calls this. */
  onClose?: () => void;
  className?: string;
}

/**
 * A dignified, non-intrusive invitation for anonymous visitors of a public tree
 * to create their own family tree. Never covers or interrupts the canvas.
 *
 * Presentational only — links to the auth/marketing surfaces.
 */
export function PublicGrowthCTA({
  variant = 'card',
  startHref = '/auth/signup',
  learnHref = '/',
  onClose,
  className,
}: PublicGrowthCTAProps) {
  if (variant === 'bar') {
    return (
      <div className={clsx(styles.bar, className)}>
        <Link href={startHref} className={styles.barButton}>
          ابدأ شجرة عائلتك
        </Link>
        {onClose && (
          <button type="button" className={styles.barClose} onClick={onClose} aria-label="إغلاق">
            <CloseIcon />
          </button>
        )}
      </div>
    );
  }

  return (
    <section className={clsx(styles.card, className)} aria-label="أنشئ شجرتك">
      {onClose && (
        <button type="button" className={styles.close} onClick={onClose} aria-label="إغلاق">
          <CloseIcon />
        </button>
      )}
      <span className={styles.eyebrow}>أنشئ شجرتك</span>
      <p className={styles.line}>وثّق نسب عائلتك واحفظ أسماء أجدادك</p>
      <div className={styles.actions}>
        <Link href={startHref} className={styles.primary}>
          ابدأ شجرة عائلتك
        </Link>
        <Link href={learnHref} className={styles.ghost}>
          كيف تعمل؟
        </Link>
      </div>
    </section>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

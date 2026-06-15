'use client';

import clsx from 'clsx';
import Link from 'next/link';
import styles from './PublicTreeState.module.css';

export type PublicTreeStateVariant = 'loading' | 'empty' | 'unavailable';

export interface PublicTreeStateProps {
  variant: PublicTreeStateVariant;
  className?: string;
}

const COPY: Record<
  PublicTreeStateVariant,
  { title: string; text: string; showWordmark?: boolean }
> = {
  loading: {
    title: 'جاري تحميل شجرة العائلة…',
    text: 'لحظاتٌ قليلة ريثما نُحضِر الأجداد.',
  },
  empty: {
    title: 'لا تتوفّر معلوماتٌ معروضة',
    text: 'هذه الشجرة لا تحتوي حاليّاً على أفرادٍ معروضين للعموم.',
  },
  unavailable: {
    title: 'هذه الشجرة غير متاحة للعرض حاليّاً',
    text: 'قد تكون العائلةُ قد أوقفت عرضَها للعموم، أو أنّ الرابط غير صحيح.',
    showWordmark: true,
  },
};

/**
 * The calm, branded placeholder screens for the public viewer:
 * - `loading`     — while the redacted tree is being fetched.
 * - `empty`       — published but nothing public to show.
 * - `unavailable` — unpublished / link revoked / bad slug (also the
 *                   landing a visitor hits after a family goes private).
 *
 * Presentational only — never surfaces technical codes.
 */
export function PublicTreeState({ variant, className }: PublicTreeStateProps) {
  const copy = COPY[variant];

  return (
    <div className={clsx(styles.panel, className)} role="status" aria-live="polite">
      {copy.showWordmark && <div className={styles.wordmark}>جينات</div>}

      <div className={clsx(styles.ring, { [styles.ringLoading]: variant === 'loading' })}>
        {variant === 'loading' && <div className={styles.spinner} aria-hidden="true" />}
      </div>

      <h2 className={styles.title}>{copy.title}</h2>
      <p className={styles.text}>{copy.text}</p>

      {variant === 'empty' && (
        <Link href="/auth/signup" className={styles.primary}>
          ابدأ شجرة عائلتك
        </Link>
      )}
      {variant === 'unavailable' && (
        <Link href="/" className={styles.ghost}>
          العودة إلى الصفحة الرئيسيّة
        </Link>
      )}
    </div>
  );
}

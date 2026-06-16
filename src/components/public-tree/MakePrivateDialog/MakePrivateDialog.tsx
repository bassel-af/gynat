'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { HeritageOverlay } from '../HeritageOverlay';
import styles from './MakePrivateDialog.module.css';

export interface MakePrivateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Confirm handler — wired to the unpublish action in the TDD phase. */
  onConfirm?: () => void;
  /** Where the "request permanent removal" path points. */
  reportHref?: string;
  /** Disables actions while a request is in flight (wired later). */
  loading?: boolean;
  className?: string;
}

/**
 * The "stop showing this tree publicly" dialog. Calm and matter-of-fact — this
 * is a supported, legitimate action, not a danger. It is honest that copies
 * already in other families' collections will remain, and points clearly to the
 * permanent-removal (report) path.
 *
 * Presentational only — no unpublish logic; `onConfirm` is a placeholder.
 */
export function MakePrivateDialog({
  isOpen,
  onClose,
  onConfirm,
  reportHref,
  loading = false,
  className,
}: MakePrivateDialogProps) {
  return (
    <HeritageOverlay isOpen={isOpen} onClose={onClose}>
      <div
        className={clsx(styles.modal, className)}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="make-private-title"
      >
        <div className={styles.icon} aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
            <path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </div>

        <h3 id="make-private-title" className={styles.title}>
          إيقاف العرض العامّ
        </h3>
        <p className={styles.lead}>
          ستتوقّف الشجرة عن الظهور للعموم فوراً، وسنطلب من محرّكات البحث إزالتها.
        </p>

        <div className={styles.honestBlock}>
          لكن إذا كانت أجزاءٌ من شجرتك قد أُضيفت إلى مجموعات عائلاتٍ أخرى، فستبقى لديهم كنسخةٍ محفوظة،
          ولن يختفي تلقائيّاً ما سبق أن حفظته محرّكاتُ البحث أو أرشيف الإنترنت.
        </div>

        {reportHref && (
          <Link href={reportHref} className={styles.reportLink}>
            <span className={styles.reportIcon} aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 4v16M4 5h12l-2 4 2 4H4"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className={styles.reportText}>
              <span className={styles.reportTitle}>طلب إزالةٍ نهائيّة</span>
              <span className={styles.reportSub}>
                إن كانت هناك معلوماتٌ يجب إزالتها من كلّ مكانٍ لأجل الخصوصيّة
              </span>
            </span>
            <span className={styles.reportArrow} aria-hidden="true">
              ←
            </span>
          </Link>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.confirm} onClick={onConfirm} disabled={loading}>
            {loading ? 'جارٍ الإيقاف…' : 'إيقاف العرض'}
          </button>
          <button type="button" className={styles.cancel} onClick={onClose} disabled={loading}>
            تراجُع
          </button>
        </div>
      </div>
    </HeritageOverlay>
  );
}

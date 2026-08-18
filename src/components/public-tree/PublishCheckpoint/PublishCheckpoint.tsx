'use client';

import clsx from 'clsx';
import { SearchIrreversibleWarning } from '../SearchIrreversibleWarning';
import type { PublishCheckpointData } from './types';
import styles from './PublishCheckpoint.module.css';

export interface PublishCheckpointProps {
  isOpen: boolean;
  /**
   * Living-people view-model. Not rendered right now — the full review (count,
   * search, per-person mark deceased/private) was confusing and is slated for a
   * rebuild. Kept in the prop shape so callers don't change when it comes back.
   */
  data: PublishCheckpointData;
  /**
   * The recognizable family name (e.g. "عائلة السعيد"). Not rendered right now —
   * the type-to-confirm step is gone along with the review it used to gate.
   * The server still validates this phrase independently on publish (see
   * `PublishFlow.handlePublished`, which sends it regardless of this UI), so
   * dropping the typing step here doesn't weaken that check. Kept in the prop
   * shape for the rebuild.
   */
  confirmPhrase: string;
  /**
   * When true, shows the search-listing irreversibility warning. Driven by the
   * chosen visibility level (the caller decides; this component just displays).
   */
  showIrreversible?: boolean;
  onClose: () => void;
  /** Fired when the admin confirms the publish. */
  onPublish?: () => void;
  /** Disables the publish button while a request is in flight. */
  loading?: boolean;
  className?: string;
}

/**
 * Temporary, minimal publish gate: a plain confirm/cancel step. The
 * living-people review and the type-to-confirm step this used to show are
 * being redesigned — for now the admin just confirms the publish directly.
 */
export function PublishCheckpoint({
  isOpen,
  showIrreversible = false,
  onClose,
  onPublish,
  loading = false,
  className,
}: PublishCheckpointProps) {
  if (!isOpen) return null;

  return (
    <div className={clsx(styles.overlay, className)}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkpoint-title"
      >
        <div className={styles.head}>
          <div className={styles.seal} aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 3l2.4 1.4 2.8-.2.9 2.6 2 1.9-1 2.6 1 2.6-2 1.9-.9 2.6-2.8-.2L12 21l-2.4-1.4-2.8.2-.9-2.6-2-1.9 1-2.6-1-2.6 2-1.9.9-2.6 2.8.2z"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
                opacity="0.55"
              />
              <path d="M8.5 12.2l2.4 2.3 4.6-4.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 id="checkpoint-title" className={styles.title}>
            تأكيد النشر
          </h2>
          <p className={styles.lead}>
            بالنشر، تصبح الشجرة قابلة للعرض لأي زائر عبر الرابط العام.
          </p>
        </div>

        {showIrreversible && <SearchIrreversibleWarning className={styles.irreversibleSlot} />}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.publish}
            disabled={loading}
            onClick={onPublish}
          >
            {loading ? 'جار النشر…' : 'نشر الشجرة'}
          </button>
          <button type="button" className={styles.cancel} onClick={onClose} disabled={loading}>
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

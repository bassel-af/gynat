'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { VisibilityLadder, type VisibilityLevel } from '../VisibilityLadder';
import { SearchIrreversibleWarning } from '../SearchIrreversibleWarning';
import styles from './ManagePublicPanel.module.css';

export interface ManagePublicPanelProps {
  /** Current (already-public) visibility level — `link` or `search`. */
  currentLevel: Exclude<VisibilityLevel, 'private'>;
  /** The live public URL to display + copy. */
  shareUrl: string;
  /** Current reuse-into-collections opt-in. */
  allowReuse?: boolean;
  onAllowReuseChange?: (allow: boolean) => void;
  /**
   * Apply a non-escalating visibility change (downgrade search→link, or no-op).
   * The caller persists; this panel only reports intent.
   */
  onChangeLevel?: (level: Exclude<VisibilityLevel, 'private'>) => void;
  /**
   * Confirm escalation link → search. Fired only after the admin acknowledges
   * the inline irreversibility warning.
   */
  onEscalateToSearch?: () => void;
  /** Open the make-private dialog. */
  onGoPrivate?: () => void;
  /** Dismiss the whole dialog. */
  onClose?: () => void;
  className?: string;
}

const LEVEL_LABEL: Record<Exclude<VisibilityLevel, 'private'>, string> = {
  link: 'عبر الرابط',
  search: 'تظهر في محركات البحث',
};

/**
 * The "manage" state of the share dialog, shown when a tree is ALREADY public.
 * Primary job: surface the live public link + copy. Secondary: let the admin
 * change settings.
 *
 * Boundary (agreed with architect): re-opening an already-public tree never
 * re-gates what's already exposed. The ONLY change that warns is escalating
 * link → search (the one-way door into search indexing) — and that warning is
 * just the irreversibility acknowledge, NOT the living-people review or the
 * type-to-confirm phrase.
 *
 * Presentational only — no persistence; intents reported via callbacks.
 */
export function ManagePublicPanel({
  currentLevel,
  shareUrl,
  allowReuse = false,
  onAllowReuseChange,
  onChangeLevel,
  onEscalateToSearch,
  onGoPrivate,
  onClose,
  className,
}: ManagePublicPanelProps) {
  const [copied, setCopied] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The level the admin is selecting in the revealed control.
  const [pendingLevel, setPendingLevel] = useState<VisibilityLevel>(currentLevel);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  // Did the admin pick a level that escalates exposure into search?
  const isEscalation = currentLevel === 'link' && pendingLevel === 'search';
  const wantsPrivate = pendingLevel === 'private';
  const isLateralOrDown =
    !isEscalation && !wantsPrivate && pendingLevel !== currentLevel;
  const hasPendingChange = pendingLevel !== currentLevel;

  const handleApply = () => {
    if (wantsPrivate) {
      onGoPrivate?.();
      return;
    }
    if (isEscalation) {
      // handled by the inline confirm button below, not here
      return;
    }
    if (isLateralOrDown) {
      onChangeLevel?.(pendingLevel as Exclude<VisibilityLevel, 'private'>);
    }
  };

  return (
    <div
      className={clsx(styles.panel, className)}
      role="dialog"
      aria-modal="true"
      aria-label="إدارة النشر"
      onClick={(e) => e.stopPropagation()}
    >
      <button type="button" className={styles.close} onClick={onClose} aria-label="إغلاق">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
          <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      <header className={styles.head}>
        <div className={styles.statusRow}>
          <span className={styles.statusDot} aria-hidden="true" />
          <span className={styles.statusText}>هذه الشجرة عامة</span>
          <span className={clsx(styles.statusBadge, { [styles.statusBadgeSearch]: currentLevel === 'search' })}>
            {LEVEL_LABEL[currentLevel]}
          </span>
        </div>
      </header>

      {/* The link — the primary reason the admin re-opened the dialog. */}
      <div className={styles.linkRow}>
        <span className={styles.linkLabel}>الرابط العام</span>
        <div className={styles.linkBox}>
          <code className={styles.linkValue} dir="ltr">
            {shareUrl}
          </code>
          <button type="button" className={styles.copyBtn} onClick={handleCopy}>
            {copied ? 'تم النسخ ✓' : 'نسخ'}
          </button>
        </div>
      </div>

      {/* Settings — collapsed by default; the admin came for the link. */}
      <button
        type="button"
        className={clsx(styles.settingsToggle, { [styles.settingsToggleOpen]: settingsOpen })}
        onClick={() => setSettingsOpen((v) => !v)}
        aria-expanded={settingsOpen}
      >
        <span>تعديل الإعدادات</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {settingsOpen && (
        <div className={styles.settings}>
          <VisibilityLadder
            level={pendingLevel}
            onLevelChange={setPendingLevel}
            allowReuse={allowReuse}
            onAllowReuseChange={onAllowReuseChange}
            className={styles.ladder}
          />

          {/* Escalation into search = the one change that still warns. */}
          {isEscalation && <SearchIrreversibleWarning as="h4" className={styles.irreversibleSlot} />}

          <div className={styles.settingsActions}>
            {isEscalation ? (
              <button type="button" className={styles.confirmEscalate} onClick={onEscalateToSearch}>
                تأكيد الظهور في محركات البحث
              </button>
            ) : wantsPrivate ? (
              <button type="button" className={styles.applyBtn} onClick={handleApply}>
                متابعة إلى إيقاف النشر
              </button>
            ) : (
              <button
                type="button"
                className={clsx(styles.applyBtn, { [styles.applyDisabled]: !hasPendingChange })}
                onClick={handleApply}
                disabled={!hasPendingChange}
              >
                حفظ التغيير
              </button>
            )}
          </div>
        </div>
      )}

      <footer className={styles.footer}>
        <button type="button" className={styles.doneBtn} onClick={onClose}>
          تم
        </button>
      </footer>
    </div>
  );
}

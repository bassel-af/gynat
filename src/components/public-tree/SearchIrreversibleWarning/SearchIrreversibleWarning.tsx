import clsx from 'clsx';
import styles from './SearchIrreversibleWarning.module.css';

export interface SearchIrreversibleWarningProps {
  /**
   * Heading element for the title — lets each call site keep its exact prior
   * heading level (the checkpoint used `h3`, the manage panel used `h4`).
   * Visual size is the same either way; this preserves the document outline.
   */
  as?: 'h3' | 'h4';
  /**
   * Extra class for the outer container — used by consumers to apply their own
   * positioning margin (the warning's spacing context differs between the
   * full-page checkpoint and the inline manage panel).
   */
  className?: string;
}

/**
 * The amber "search indexing is a one-way door" warning, shared by the publish
 * checkpoint (escalating to / publishing as search-listed) and the manage panel
 * (escalating link → search). Single source of truth for the copy + icon so the
 * two never drift.
 *
 * Presentational only. The outer positioning margin is left to the consumer via
 * `className`; everything inside (icon, title, text) is owned here.
 */
export function SearchIrreversibleWarning({ as: Heading = 'h3', className }: SearchIrreversibleWarningProps) {
  return (
    <div className={clsx(styles.box, className)}>
      <div className={styles.icon} aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div>
        <Heading className={styles.title}>الظهور في البحث قرار يصعب التراجع عنه</Heading>
        <p className={styles.text}>
          بمجرد ظهور الشجرة في محركات البحث، قد تبقى بعض النسخ محفوظة لدى Google أو أرشيف الإنترنت
          حتى لو أوقفت العرض لاحقا.
        </p>
      </div>
    </div>
  );
}

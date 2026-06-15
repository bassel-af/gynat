'use client';

import clsx from 'clsx';
import Link from 'next/link';
import type { CalendarPreference } from '@/lib/calendar-helpers';
import styles from './PublicTreeHeader.module.css';

export interface PublicTreeHeaderProps {
  /** Family / tree display name (e.g. "عائلة السعيد"). */
  familyName: string;
  /** Optional one-line subtitle (e.g. "حلب · ٦ أجيال موثّقة"). */
  subtitle?: string;
  /** Currently selected calendar preference. Controlled. */
  calendar: CalendarPreference;
  /** Fired when the visitor switches calendar. Anonymous visitors persist this in localStorage only. */
  onCalendarChange?: (calendar: CalendarPreference) => void;
  /** Where the جينات wordmark links to. Defaults to the marketing home. */
  homeHref?: string;
  className?: string;
}

/**
 * The chrome for the anonymous public family-tree viewer — a floating glass
 * pill over the canvas. It is intentionally minimal: family name, a calendar
 * toggle, and the جينات wordmark. It carries NO member info, NO workspace
 * navigation, and NO editing affordances (those belong to the authed tree).
 *
 * Presentational only: calendar selection is controlled via props.
 */
export function PublicTreeHeader({
  familyName,
  subtitle,
  calendar,
  onCalendarChange,
  homeHref = '/',
  className,
}: PublicTreeHeaderProps) {
  return (
    <header className={clsx(styles.header, className)}>
      <div className={styles.identity}>
        <span className={styles.crest} aria-hidden="true" />
        <div className={styles.identityText}>
          <h1 className={styles.familyName}>{familyName}</h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
      </div>

      <div className={styles.tools}>
        <div className={styles.calToggle} role="radiogroup" aria-label="التقويم">
          <button
            type="button"
            role="radio"
            aria-checked={calendar === 'hijri'}
            className={clsx(styles.calSeg, { [styles.calSegActive]: calendar === 'hijri' })}
            onClick={() => onCalendarChange?.('hijri')}
          >
            هجري
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={calendar === 'gregorian'}
            className={clsx(styles.calSeg, { [styles.calSegActive]: calendar === 'gregorian' })}
            onClick={() => onCalendarChange?.('gregorian')}
          >
            ميلادي
          </button>
        </div>

        <Link href={homeHref} className={styles.wordmark} aria-label="جينات — الصفحة الرئيسية">
          جينات
        </Link>
      </div>
    </header>
  );
}

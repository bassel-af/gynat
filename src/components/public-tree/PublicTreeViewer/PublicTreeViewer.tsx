'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import { TreeProvider, useTree } from '@/context/TreeContext';
import { WorkspaceTreeProvider } from '@/context/WorkspaceTreeContext';
import { FamilyTree } from '@/components/tree';
import { Sidebar } from '@/components/ui';
import type { GedcomData } from '@/lib/gedcom/types';
import type { CalendarPreference } from '@/lib/calendar-helpers';
import { PublicTreeHeader } from '../PublicTreeHeader';
import { PublicGrowthCTA } from '../PublicGrowthCTA';
import { PublicTreeState } from '../PublicTreeState';
import styles from './PublicTreeViewer.module.css';

export interface PublicTreeViewerProps {
  /** Already-redacted public tree data (server strips PII before sending). */
  data: GedcomData;
  /** Family / tree display name shown in the header. */
  familyName: string;
  /** Optional one-line subtitle for the header. */
  subtitle?: string;
  /** Optional family description for the sidebar "about" panel. */
  description?: string;
  /** Visitor's calendar preference (localStorage-backed in the real page). */
  calendar: CalendarPreference;
  onCalendarChange?: (calendar: CalendarPreference) => void;
  /** Public, no-account report page for this tree (PRD §1.5, §8.2). */
  reportHref?: string;
  className?: string;
}

/**
 * The anonymous read-only public family-tree viewer.
 *
 * Reuses the real `FamilyTree` + `Sidebar`/`PersonDetail` by rendering them
 * inside a `WorkspaceTreeProvider` with `canEdit={false}` — every edit
 * affordance is already gated on `canEdit`, so read-only is free and identical
 * to the authed tree minus editing. The authed `CanvasToolbar` is replaced by
 * the lightweight public `PublicTreeHeader`; a `PublicGrowthCTA` is docked
 * unobtrusively.
 *
 * Presentational only: it renders the supplied (already-redacted) data and
 * writes nothing. `refreshTree` is a no-op.
 */
export function PublicTreeViewer({
  data,
  familyName,
  subtitle,
  description,
  calendar,
  onCalendarChange,
  reportHref,
  className,
}: PublicTreeViewerProps) {
  return (
    <TreeProvider>
      <WorkspaceTreeProvider
        workspaceId="public"
        canEdit={false}
        isAdmin={false}
        refreshTree={noopRefresh}
        description={description}
      >
        <PublicTreeViewerInner
          data={data}
          familyName={familyName}
          subtitle={subtitle}
          calendar={calendar}
          onCalendarChange={onCalendarChange}
          reportHref={reportHref}
          className={className}
        />
      </WorkspaceTreeProvider>
    </TreeProvider>
  );
}

async function noopRefresh() {
  /* read-only viewer never refreshes */
}

/** Per-browser dismissal of the growth CTA (anonymous visitors). */
const GROWTH_CTA_DISMISSED_KEY = 'gynat:publicGrowthCtaDismissed';

function PublicTreeViewerInner({
  data,
  familyName,
  subtitle,
  calendar,
  onCalendarChange,
  reportHref,
  className,
}: Omit<PublicTreeViewerProps, 'description'>) {
  const { data: contextData, setData } = useTree();
  const [ctaDismissed, setCtaDismissed] = useState(false);

  // Feed the (already-redacted) tree into TreeContext once.
  useEffect(() => {
    setData(data);
  }, [data, setData]);

  // Restore the visitor's previous dismissal (localStorage, per-browser).
  useEffect(() => {
    try {
      if (localStorage.getItem(GROWTH_CTA_DISMISSED_KEY) === '1') {
        setCtaDismissed(true);
      }
    } catch {
      /* localStorage unavailable (private mode) — CTA simply stays shown */
    }
  }, []);

  const dismissCta = () => {
    setCtaDismissed(true);
    try {
      localStorage.setItem(GROWTH_CTA_DISMISSED_KEY, '1');
    } catch {
      /* ignore persistence failure */
    }
  };

  // Mirror the authed tree's flow: only mount FamilyTree once data is in
  // context. FamilyTree takes an early-return path when data is null and
  // mounting it first then populating would change its hook order.
  const ready = contextData != null && Object.keys(contextData.individuals).length > 0;

  return (
    <div className={clsx('app-layout', styles.viewer, className)}>
      <Sidebar />
      <main className="main-content">
        <div className={styles.headerSlot}>
          <PublicTreeHeader
            familyName={familyName}
            subtitle={subtitle}
            calendar={calendar}
            onCalendarChange={onCalendarChange}
          />
        </div>
        {ready ? (
          <FamilyTree hideMiniMap />
        ) : (
          <div className={styles.loadingSlot}>
            <PublicTreeState variant="loading" />
          </div>
        )}
        {!ctaDismissed && (
          <>
            <div className={clsx(styles.ctaSlot, styles.ctaDesktop)}>
              <PublicGrowthCTA variant="card" onClose={dismissCta} />
            </div>
            <div className={clsx(styles.ctaSlot, styles.ctaMobile)}>
              <PublicGrowthCTA variant="bar" onClose={dismissCta} />
            </div>
          </>
        )}
        {reportHref && (
          <Link
            href={reportHref}
            className={clsx(styles.reportLink, {
              // On mobile, lift it clear of the growth bar so they never overlap.
              [styles.reportLinkAboveCta]: !ctaDismissed,
            })}
          >
            <svg
              className={styles.reportIcon}
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M5 21V4M5 5h11l-2 3.5L16 12H5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            الإبلاغ عن هذه الشجرة
          </Link>
        )}
      </main>
    </div>
  );
}

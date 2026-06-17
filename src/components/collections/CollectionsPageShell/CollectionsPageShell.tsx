'use client';

import Link from 'next/link';
import { type ReactNode } from 'react';
import { UserNav } from '@/components/ui/UserNav';
import styles from './CollectionsPageShell.module.css';

interface Crumb {
  label: string;
  href?: string;
}

interface CollectionsPageShellProps {
  /** Workspace title shown in the top bar. */
  workspaceName: string;
  /** Breadcrumb trail under the header (last crumb is the current page). */
  crumbs: Crumb[];
  children: ReactNode;
}

/**
 * Shared heritage page chrome for the collections routes (trees, collections
 * list, collection detail). Mirrors the workspace detail header so the new
 * area sits inside the same visual world.
 */
export function CollectionsPageShell({
  workspaceName,
  crumbs,
  children,
}: CollectionsPageShellProps) {
  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.headerTitle}>{workspaceName}</h1>
        <div className={styles.headerRight}>
          <UserNav />
          <Link href="/workspaces" className={styles.backLink}>
            &rarr; مساحات العمل
          </Link>
        </div>
      </header>

      <div className={styles.content}>
        <nav className={styles.breadcrumbs} aria-label="مسار التنقّل">
          {crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <span key={`${crumb.label}-${i}`} className={styles.crumbWrap}>
                {crumb.href && !isLast ? (
                  <Link href={crumb.href} className={styles.crumbLink}>
                    {crumb.label}
                  </Link>
                ) : (
                  <span className={styles.crumbCurrent} aria-current="page">
                    {crumb.label}
                  </span>
                )}
                {!isLast && (
                  <span className={styles.crumbSep} aria-hidden="true">
                    /
                  </span>
                )}
              </span>
            );
          })}
        </nav>

        {children}
      </div>
    </main>
  );
}

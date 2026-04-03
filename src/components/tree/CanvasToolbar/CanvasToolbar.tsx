'use client';

import Link from 'next/link';
import { UserNav } from '@/components/ui/UserNav/UserNav';
import { RootBackChip } from '@/components/tree/RootBackChip/RootBackChip';
import styles from './CanvasToolbar.module.css';

interface CanvasToolbarProps {
  workspaceSlug: string;
}

export function CanvasToolbar({ workspaceSlug }: CanvasToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.pill}>
        <Link
          href={`/workspaces/${workspaceSlug}`}
          className={styles.backLink}
          aria-label="مساحة العائلة"
        >
          <svg
            className={styles.backIcon}
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M9 18L15 12L9 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className={styles.backLabel}>مساحة العائلة</span>
        </Link>
        <span className={styles.separator} />
        <UserNav />
      </div>
      <RootBackChip />
    </div>
  );
}

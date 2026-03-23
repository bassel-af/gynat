'use client';

import { Button } from '@/components/ui';
import styles from './EmptyTreeState.module.css';

interface EmptyTreeStateProps {
  canEdit: boolean;
  onAddFirst?: () => void;
}

function TreeIcon() {
  return (
    <svg
      className={styles.icon}
      width="80"
      height="80"
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Root person circle */}
      <circle cx="40" cy="16" r="8" stroke="currentColor" strokeWidth="1.5" />
      {/* Vertical line down from root */}
      <line x1="40" y1="24" x2="40" y2="34" stroke="currentColor" strokeWidth="1.5" />
      {/* Horizontal connector */}
      <line x1="20" y1="34" x2="60" y2="34" stroke="currentColor" strokeWidth="1.5" />
      {/* Left branch */}
      <line x1="20" y1="34" x2="20" y2="44" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="20" cy="52" r="8" stroke="currentColor" strokeWidth="1.5" />
      {/* Right branch */}
      <line x1="60" y1="34" x2="60" y2="44" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="60" cy="52" r="8" stroke="currentColor" strokeWidth="1.5" />
      {/* Left sub-branch */}
      <line x1="20" y1="60" x2="20" y2="66" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
      {/* Right sub-branch */}
      <line x1="60" y1="60" x2="60" y2="66" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
    </svg>
  );
}

export function EmptyTreeState({ canEdit, onAddFirst }: EmptyTreeStateProps) {
  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <TreeIcon />
        <h2 className={styles.heading}>
          لا توجد بيانات في شجرة العائلة بعد
        </h2>
        <p className={styles.subtext}>
          {canEdit
            ? 'ابدأ بإضافة أول شخص في شجرة العائلة'
            : 'سيقوم المحرر بإضافة بيانات شجرة العائلة قريباً'}
        </p>
        {canEdit && onAddFirst && (
          <Button
            variant="primary"
            size="lg"
            onClick={onAddFirst}
            className={styles.addButton}
          >
            إضافة أول شخص
          </Button>
        )}
      </div>
    </div>
  );
}

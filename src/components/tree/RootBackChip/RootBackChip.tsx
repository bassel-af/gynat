'use client';

import { useTree } from '@/context/TreeContext';
import { getDisplayName } from '@/lib/gedcom';
import styles from './RootBackChip.module.css';

/**
 * Floating pill component that appears when the user has re-rooted
 * away from the initial root. Clicking it returns to the original root.
 */
export function RootBackChip() {
  const { selectedRootId, initialRootId, data, setSelectedRootId, setSelectedPersonId } = useTree();

  // Only show when viewing a different root than the initial one
  if (!data || !selectedRootId || !initialRootId || selectedRootId === initialRootId) {
    return null;
  }

  const initialRoot = data.individuals[initialRootId];
  if (!initialRoot) return null;

  const rootName = getDisplayName(initialRoot);

  const handleClick = () => {
    setSelectedRootId(initialRootId);
    setSelectedPersonId(null);
  };

  return (
    <button
      className={styles.chip}
      onClick={handleClick}
      title={`العودة لشجرة ${rootName}`}
      aria-label={`العودة لشجرة ${rootName}`}
    >
      <svg
        className={styles.icon}
        width="16"
        height="16"
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
      <span className={styles.label}>
        <span className={styles.fullLabel}>العودة لشجرة {rootName}</span>
        <span className={styles.shortLabel}>العودة</span>
      </span>
    </button>
  );
}

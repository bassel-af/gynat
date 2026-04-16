'use client';

import { useMemo } from 'react';
import styles from './UndoRedoButtons.module.css';

export interface UndoRedoButtonsProps {
  canUndo: boolean;
  canRedo: boolean;
  isInFlight: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

function detectMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  try {
    return /Mac|iPhone|iPad/i.test(navigator.platform);
  } catch {
    return false;
  }
}

function UndoIcon() {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      aria-hidden="true"
    >
      <path d="M9 14L4 9l5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 9h11a5 5 0 015 5v1a5 5 0 01-5 5h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      aria-hidden="true"
    >
      <path d="M15 14l5-5-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 9H9a5 5 0 00-5 5v1a5 5 0 005 5h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Spinner() {
  return <span className={styles.spinner} aria-hidden="true" />;
}

export function UndoRedoButtons({
  canUndo,
  canRedo,
  isInFlight,
  onUndo,
  onRedo,
}: UndoRedoButtonsProps) {
  const isMac = useMemo(detectMac, []);
  const undoHint = isMac ? 'تراجع (⌘Z)' : 'تراجع (Ctrl+Z)';
  const redoHint = isMac ? 'إعادة (⇧⌘Z)' : 'إعادة (Ctrl+Shift+Z)';
  const undoDisabled = !canUndo || isInFlight;
  const redoDisabled = !canRedo || isInFlight;
  return (
    <div className={styles.group}>
      <button
        type="button"
        className={styles.button}
        aria-label="تراجع"
        aria-keyshortcuts="Control+Z"
        aria-busy={isInFlight}
        aria-disabled={undoDisabled}
        disabled={undoDisabled}
        title={undoHint}
        onClick={onUndo}
      >
        {isInFlight ? <Spinner /> : <UndoIcon />}
      </button>
      <button
        type="button"
        className={styles.button}
        aria-label="إعادة"
        aria-keyshortcuts="Control+Shift+Z"
        aria-busy={isInFlight}
        aria-disabled={redoDisabled}
        disabled={redoDisabled}
        title={redoHint}
        onClick={onRedo}
      >
        {isInFlight ? <Spinner /> : <RedoIcon />}
      </button>
    </div>
  );
}

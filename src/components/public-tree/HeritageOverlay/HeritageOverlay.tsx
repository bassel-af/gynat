'use client';

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import styles from './HeritageOverlay.module.css';

export interface HeritageOverlayProps {
  isOpen: boolean;
  /** Fired on backdrop click and Escape. */
  onClose: () => void;
  children: React.ReactNode;
  /** Vertical placement of the panel within the overlay. */
  align?: 'center' | 'top';
  /** Extra class on the backdrop element. */
  className?: string;
}

/**
 * Shared portal + backdrop + Escape/mount handling for the heritage dialogs in
 * this feature (MakePrivateDialog, the PublishFlow centered steps, …).
 *
 * This is a deliberately LOCAL helper — NOT a shared `ui/` export. Per the
 * architect's call, we don't extract a general `HeritageModal` until a third
 * dialog wants the same centered shell; keeping the duplicated overlay in ONE
 * consistent block here (instead of copy-pasted per dialog) makes that future
 * extraction a mechanical lift-out rather than a redesign.
 *
 * Consumers render their own inner panel as children and call
 * `stopPropagation` there if they want clicks inside to not close.
 */
export function HeritageOverlay({
  isOpen,
  onClose,
  children,
  align = 'center',
  className,
}: HeritageOverlayProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className={clsx(styles.overlay, { [styles.alignTop]: align === 'top' }, className)}
      onClick={onClose}
    >
      {children}
    </div>,
    document.body,
  );
}

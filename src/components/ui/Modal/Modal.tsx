'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useModalStackEntry } from './modalStack';
import styles from './Modal.module.css';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  /**
   * Opened on top of another modal (e.g. «إضافة مصدر» over the person form):
   * a lighter overlay above the lower one, Tab trapped inside, and focus
   * handed back to whatever opened it on close.
   */
  stacked?: boolean;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ isOpen, onClose, title, children, actions, className, contentClassName, stacked = false }: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const isTop = useModalStackEntry(isOpen);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Captured while rendering the open modal, before any autoFocus inside it
  // moves focus away from the button that opened it.
  const openerRef = useRef<HTMLElement | null | undefined>(undefined);
  if (isOpen && stacked && openerRef.current === undefined && typeof document !== 'undefined') {
    openerRef.current = document.activeElement as HTMLElement | null;
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only the top modal answers — one Esc closes one modal.
      if (!isTop()) return;
      if (e.key === 'Escape') {
        onCloseRef.current();
      } else if (e.key === 'Tab' && stacked) {
        const root = dialogRef.current;
        if (!root) return;
        const focusables = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !root.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !root.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isTop, stacked]);

  // A stacked modal gives focus back to its opener when it closes.
  useEffect(() => {
    if (!isOpen || !stacked) return;
    return () => {
      const opener = openerRef.current;
      openerRef.current = undefined;
      if (opener && opener.isConnected) opener.focus();
    };
  }, [isOpen, stacked]);

  if (!isOpen || !mounted) return null;

  const modalClassName = [styles.modal, stacked ? styles.modalStacked : '', className ?? ''].filter(Boolean).join(' ');

  return createPortal(
    <div
      className={[styles.overlay, stacked ? styles.overlayStacked : ''].filter(Boolean).join(' ')}
      data-stacked={stacked ? 'true' : undefined}
      onClick={(e) => {
        e.stopPropagation();
        if (isTop()) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={modalClassName}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <h3 className={styles.title}>{title}</h3>
        <div className={[styles.content, contentClassName ?? ''].filter(Boolean).join(' ')}>{children}</div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}

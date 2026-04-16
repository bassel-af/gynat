'use client';

import { Modal } from '@/components/ui/Modal';
import styles from './ConflictDialog.module.css';

export type ConflictVariant = 'stale' | 'auth';

export interface ConflictDialogProps {
  isOpen: boolean;
  variant: ConflictVariant;
  onRefresh: () => void;
}

const COPY: Record<ConflictVariant, { title: string; body: string[] }> = {
  stale: {
    title: 'تغيّرت الشجرة',
    body: [
      'تغيّرت الشجرة منذ ذلك التعديل.',
      'الرجاء تحديث الصفحة لمتابعة التعديل.',
    ],
  },
  auth: {
    title: 'تغيّرت الشجرة',
    body: [
      'انتهت صلاحية الجلسة أو تغيّرت الصلاحيات.',
      'أعد تحميل الصفحة.',
    ],
  },
};

export function ConflictDialog({ isOpen, variant, onRefresh }: ConflictDialogProps) {
  if (!isOpen) return null;
  const { title, body } = COPY[variant];
  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        // Forced acknowledgment — Escape/overlay must not dismiss.
      }}
      title={title}
      actions={
        <button
          type="button"
          className={styles.refreshButton}
          onClick={onRefresh}
          autoFocus
        >
          تحديث الصفحة
        </button>
      }
    >
      <div className={styles.banner}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={styles.icon}>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
          <path d="M12 8v.01M11 12h1v4h1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <div className={styles.body}>
          {body.map((line, i) => (
            <p key={i} className={styles.line}>{line}</p>
          ))}
        </div>
      </div>
    </Modal>
  );
}

'use client';

import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { CloseIcon } from './SourceIcons';
import styles from './LastLinkDialog.module.css';

export interface LastLinkDialogProps {
  onDelete: () => void;
  onKeep: () => void;
  /** ✕ / Escape / the backdrop: nothing changes. */
  onCancel: () => void;
  /** The chosen answer is being saved. */
  busy?: 'delete' | 'keep' | null;
  /** Opened over another modal (e.g. the person form). */
  stacked?: boolean;
}

/**
 * «هذا آخر شخص لهذا المصدر» — asked when removing a source from its last
 * person: delete it (with its files) or keep it on the «المصادر» page under
 * «ليس مصدرًا لأحد».
 */
export function LastLinkDialog({ onDelete, onKeep, onCancel, busy = null, stacked = false }: LastLinkDialogProps) {
  const actions = (
    <div className={styles.actions}>
      <Button variant="danger" size="md" onClick={onDelete} loading={busy === 'delete'} disabled={!!busy}>
        حذف المصدر وملفاته
      </Button>
      <Button variant="secondary" size="md" onClick={onKeep} loading={busy === 'keep'} disabled={!!busy}>
        إبقاؤه في صفحة المصادر
      </Button>
    </div>
  );
  return (
    <Modal
      isOpen
      onClose={() => {
        if (!busy) onCancel();
      }}
      title="هذا آخر شخص لهذا المصدر"
      actions={actions}
      className={styles.modal}
      contentClassName={styles.content}
      stacked={stacked}
    >
      <button type="button" className={styles.close} aria-label="إغلاق" onClick={onCancel} disabled={!!busy}>
        <CloseIcon size={16} />
      </button>
      <p className={styles.question}>ماذا تريد أن تفعل بالمصدر وملفاته؟</p>
    </Modal>
  );
}

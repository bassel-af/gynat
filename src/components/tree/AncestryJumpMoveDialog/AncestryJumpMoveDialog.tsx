'use client';

import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { JUMP_BLOCKS_PARENTS_MESSAGE } from '@/lib/tree/ancestry-jump-validators';
import styles from './AncestryJumpMoveDialog.module.css';

interface AncestryJumpMoveDialogProps {
  /** The person who carries the jump. */
  personName: string;
  /** The distant ancestor the jump points at (husband ?? wife of the couple). */
  ancestorName: string;
  /**
   * Present → the «إضافة والد/والدة» variant: explain, offer the move.
   * Absent → the block variant (e.g. «تعيين والدين موجودين»): explain only.
   */
  onMove?: () => void;
  onCancel: () => void;
}

/**
 * Shown before anything is written when the editor tries to give parents to a
 * person who carries a «قفزة نسب». Adding a FATHER moves the jump up to him
 * (one generation of the gap becomes recorded); a mother, or removing the jump
 * instead, needs the jump deleted by hand first — never automatically.
 */
export function AncestryJumpMoveDialog({
  personName,
  ancestorName,
  onMove,
  onCancel,
}: AncestryJumpMoveDialogProps) {
  return (
    <Modal
      isOpen
      onClose={onCancel}
      title="لهذا الشخص قفزة نسب"
      actions={
        onMove ? (
          <>
            <Button variant="secondary" onClick={onCancel}>إلغاء</Button>
            <Button variant="primary" onClick={onMove} autoFocus>نقل القفزة إلى الأب الجديد</Button>
          </>
        ) : (
          <Button variant="primary" onClick={onCancel} autoFocus>حسنًا</Button>
        )
      }
    >
      <div className={styles.banner}>
        <p className={styles.line}>
          لـ{personName} قفزة نسب إلى {ancestorName}.
        </p>
        {onMove ? (
          <>
            <p className={styles.line}>
              عند إضافة أبٍ له تنتقل القفزة إلى الأب الجديد، فيصبح الأب هو الموصول بـ{ancestorName}،
              ويُحسب جيلٌ واحد من الأجيال المطويّة.
            </p>
            <p className={styles.line}>
              لإضافة أمّ أو لإزالة القفزة بدلًا من نقلها: احذف قفزة النسب يدويًا أولًا ثم أضف الأب.
            </p>
          </>
        ) : (
          <p className={styles.line}>{JUMP_BLOCKS_PARENTS_MESSAGE}</p>
        )}
      </div>
    </Modal>
  );
}

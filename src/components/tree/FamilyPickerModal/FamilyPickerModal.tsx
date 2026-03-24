'use client';

import { useState, useCallback } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import styles from './FamilyPickerModal.module.css';

export interface FamilyPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (familyId: string) => void;
  families: Array<{ familyId: string; spouseName: string | null }>;
  title?: string;
}

export function FamilyPickerModal({
  isOpen,
  onClose,
  onSelect,
  families,
  title = 'اختر العائلة',
}: FamilyPickerModalProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const handleConfirm = useCallback(() => {
    if (selected) {
      onSelect(selected);
    }
  }, [selected, onSelect]);

  const actions = (
    <>
      <Button variant="ghost" size="md" onClick={onClose}>
        إلغاء
      </Button>
      <Button
        variant="primary"
        size="md"
        disabled={!selected}
        onClick={handleConfirm}
      >
        التالي
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      actions={actions}
      className={styles.modal}
    >
      <div className={styles.list} role="radiogroup" aria-label={title}>
        {families.map((family) => (
          <label
            key={family.familyId}
            className={`${styles.row} ${selected === family.familyId ? styles.rowSelected : ''}`}
          >
            <input
              type="radio"
              name="family-picker"
              value={family.familyId}
              checked={selected === family.familyId}
              onChange={() => setSelected(family.familyId)}
              className={styles.radioInput}
            />
            <span className={styles.familyLabel}>
              {family.spouseName
                ? `أبناء من ${family.spouseName}`
                : 'عائلة بدون زوج/زوجة'}
            </span>
          </label>
        ))}
      </div>
    </Modal>
  );
}

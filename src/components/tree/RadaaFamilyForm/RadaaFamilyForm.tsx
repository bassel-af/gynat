'use client';

import { useState, useCallback, type FormEvent } from 'react';
import type { GedcomData } from '@/lib/gedcom/types';
import type { RadaaFormData } from '@/hooks/usePersonActions';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { IndividualPicker } from '@/components/ui/IndividualPicker';
import styles from './RadaaFamilyForm.module.css';

export interface RadaaFamilyFormProps {
  mode: 'create' | 'edit';
  initialData?: {
    radaFamilyId?: string;
    fosterFatherId?: string | null;
    fosterMotherId?: string | null;
    childrenIds?: string[];
    notes?: string;
  };
  preselectedChildId?: string;
  data: GedcomData;
  onSubmit: (data: RadaaFormData) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  error?: string;
}

export function RadaaFamilyForm({
  mode,
  initialData,
  preselectedChildId,
  data,
  onSubmit,
  onDelete,
  onCancel,
  isLoading = false,
  error,
}: RadaaFamilyFormProps) {
  const [fosterMotherId, setFosterMotherId] = useState<string | null>(
    initialData?.fosterMotherId ?? null,
  );
  const [fosterFatherId, setFosterFatherId] = useState<string | null>(
    initialData?.fosterFatherId ?? null,
  );
  const [childrenIds, setChildrenIds] = useState<string[]>(() => {
    if (initialData?.childrenIds?.length) return initialData.childrenIds;
    if (preselectedChildId) return [preselectedChildId];
    return [''];
  });
  const [notes, setNotes] = useState(initialData?.notes ?? '');
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const validChildren = childrenIds.filter(Boolean);
      await onSubmit({
        fosterFatherId,
        fosterMotherId,
        childrenIds: validChildren,
        notes,
      });
    },
    [fosterFatherId, fosterMotherId, childrenIds, notes, onSubmit],
  );

  const updateChild = useCallback((index: number, id: string | null) => {
    setChildrenIds((prev) => {
      const next = [...prev];
      next[index] = id ?? '';
      return next;
    });
  }, []);

  const addChildSlot = useCallback(() => {
    setChildrenIds((prev) => [...prev, '']);
  }, []);

  const removeChildSlot = useCallback((index: number) => {
    setChildrenIds((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Build exclude sets: foster parents should not appear as children and vice versa
  const parentExclude = new Set<string>(childrenIds.filter(Boolean));
  if (fosterFatherId) parentExclude.add(fosterFatherId);
  if (fosterMotherId) parentExclude.add(fosterMotherId);

  const childExclude = new Set<string>();
  if (fosterFatherId) childExclude.add(fosterFatherId);
  if (fosterMotherId) childExclude.add(fosterMotherId);
  for (const cId of childrenIds) {
    if (cId) childExclude.add(cId);
  }

  const validChildrenCount = childrenIds.filter(Boolean).length;
  const canSubmit = validChildrenCount >= 1 && (fosterFatherId || fosterMotherId || notes.trim());

  const actions = (
    <>
      <Button variant="ghost" size="md" onClick={onCancel} disabled={isLoading}>
        إلغاء
      </Button>
      <Button
        variant="primary"
        size="md"
        type="submit"
        form="radaa-family-form"
        loading={isLoading}
        disabled={!canSubmit}
      >
        حفظ
      </Button>
    </>
  );

  return (
    <Modal
      isOpen
      onClose={onCancel}
      title={mode === 'create' ? 'إضافة رضاعة' : 'تعديل رضاعة'}
      actions={actions}
      className={styles.modal}
    >
      <form
        id="radaa-family-form"
        className={styles.form}
        onSubmit={handleSubmit}
      >
        {error && <div className={styles.error}>{error}</div>}

        <IndividualPicker
          value={fosterMotherId}
          onChange={setFosterMotherId}
          data={data}
          label="الأم من الرضاعة (المرضعة)"
          placeholder="ابحث عن المرضعة..."
          exclude={parentExclude}
          sexFilter="F"
        />

        <IndividualPicker
          value={fosterFatherId}
          onChange={setFosterFatherId}
          data={data}
          label="الأب من الرضاعة"
          placeholder="ابحث عن زوج المرضعة..."
          exclude={parentExclude}
          sexFilter="M"
        />

        <div className={styles.childrenSection}>
          <span className={styles.childrenLabel}>الأبناء من الرضاعة</span>
          {childrenIds.map((childId, index) => (
            <div key={index} className={styles.childRow}>
              <div className={styles.childPicker}>
                <IndividualPicker
                  value={childId || null}
                  onChange={(id) => updateChild(index, id)}
                  data={data}
                  label=""
                  placeholder="ابحث عن طفل..."
                  exclude={childExclude}
                />
              </div>
              {childrenIds.length > 1 && (
                <button
                  type="button"
                  className={styles.removeChildButton}
                  onClick={() => removeChildSlot(index)}
                  aria-label="إزالة طفل"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className={styles.addChildButton}
            onClick={addChildSlot}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            إضافة طفل
          </button>
        </div>

        <div className={styles.fieldGroup}>
          <label htmlFor="radaa-notes" className={styles.fieldLabel}>ملاحظات</label>
          <textarea
            id="radaa-notes"
            className={styles.textarea}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="مثال: المرضعة فاطمة بنت أحمد (ليست في الشجرة)"
            maxLength={5000}
            rows={2}
          />
        </div>

        {mode === 'edit' && onDelete && (
          <div className={styles.deleteSection}>
            {!deleteConfirm ? (
              <button
                type="button"
                className={styles.deleteButton}
                onClick={() => setDeleteConfirm(true)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                حذف الرضاعة
              </button>
            ) : (
              <div className={styles.deleteConfirm}>
                <span className={styles.deleteConfirmText}>هل أنت متأكد من حذف الرضاعة؟</span>
                <div className={styles.deleteConfirmActions}>
                  <Button
                    variant="danger"
                    size="sm"
                    loading={isLoading}
                    onClick={onDelete}
                  >
                    نعم، احذف
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteConfirm(false)}
                    disabled={isLoading}
                  >
                    إلغاء
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}

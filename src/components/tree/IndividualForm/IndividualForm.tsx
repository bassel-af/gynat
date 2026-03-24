'use client';

import { useState, useCallback, type FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import styles from './IndividualForm.module.css';

export interface IndividualFormData {
  givenName: string;
  surname: string;
  sex: 'M' | 'F' | '';
  birthDate: string;
  birthPlace: string;
  birthNotes: string;
  deathDate: string;
  deathPlace: string;
  deathNotes: string;
  isDeceased: boolean;
  isPrivate: boolean;
  notes: string;
}

interface IndividualFormProps {
  mode: 'create' | 'edit';
  initialData?: Partial<IndividualFormData>;
  onSubmit: (data: IndividualFormData) => Promise<void>;
  onClose: () => void;
  isLoading?: boolean;
  error?: string;
  lockedSex?: 'M' | 'F';
}

const EMPTY_FORM: IndividualFormData = {
  givenName: '',
  surname: '',
  sex: '',
  birthDate: '',
  birthPlace: '',
  birthNotes: '',
  deathDate: '',
  deathPlace: '',
  deathNotes: '',
  isDeceased: false,
  isPrivate: false,
  notes: '',
};

export function IndividualForm({
  mode,
  initialData,
  onSubmit,
  onClose,
  isLoading = false,
  error,
  lockedSex,
}: IndividualFormProps) {
  const [formData, setFormData] = useState<IndividualFormData>(() => {
    const base = { ...EMPTY_FORM, ...initialData };
    if (lockedSex) {
      base.sex = lockedSex;
    }
    return base;
  });

  const title = mode === 'create' ? 'إضافة شخص جديد' : 'تعديل بيانات الشخص';
  const submitLabel = mode === 'create' ? 'إضافة' : 'حفظ';

  const updateField = useCallback(
    <K extends keyof IndividualFormData>(key: K, value: IndividualFormData[K]) => {
      setFormData((prev) => {
        const next = { ...prev, [key]: value };
        // Auto-check isDeceased when a death date is entered
        if (key === 'deathDate' && typeof value === 'string' && value.trim()) {
          next.isDeceased = true;
        }
        return next;
      });
    },
    [],
  );

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      await onSubmit(formData);
    },
    [formData, onSubmit],
  );

  const actions = (
    <>
      <Button variant="ghost" size="md" onClick={onClose} disabled={isLoading}>
        إلغاء
      </Button>
      <Button
        variant="primary"
        size="md"
        type="submit"
        form="individual-form"
        loading={isLoading}
        disabled={isLoading || (mode === 'create' && !formData.givenName.trim())}
      >
        {submitLabel}
      </Button>
    </>
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      actions={actions}
      className={styles.modal}
    >
      <form
        id="individual-form"
        className={styles.form}
        onSubmit={handleSubmit}
      >
        {error && <div className={styles.error}>{error}</div>}

        {/* Name fields */}
        <div className={styles.row}>
          <Input
            id="givenName"
            label="الاسم الأول"
            value={formData.givenName}
            onChange={(e) => updateField('givenName', e.target.value)}
            placeholder="مثال: أحمد"
            required={mode === 'create'}
            autoFocus
          />
          <Input
            id="surname"
            label="اللقب"
            value={formData.surname}
            onChange={(e) => updateField('surname', e.target.value)}
            placeholder="مثال: السعيد"
          />
        </div>

        {/* Sex */}
        <div className={styles.fieldGroup}>
          <span className={styles.label}>الجنس</span>
          <div className={styles.radioGroup} role="radiogroup" aria-label="الجنس">
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="sex"
                value="M"
                checked={formData.sex === 'M'}
                onChange={() => updateField('sex', 'M')}
                className={styles.radioInput}
                disabled={!!lockedSex}
                aria-label="ذكر"
              />
              ذكر
            </label>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="sex"
                value="F"
                checked={formData.sex === 'F'}
                onChange={() => updateField('sex', 'F')}
                className={styles.radioInput}
                disabled={!!lockedSex}
                aria-label="أنثى"
              />
              أنثى
            </label>
          </div>
        </div>

        <hr className={styles.sectionDivider} />

        {/* Birth info */}
        <span className={styles.sectionLabel}>بيانات الميلاد</span>
        <div className={styles.row}>
          <Input
            id="birthDate"
            label="تاريخ الميلاد"
            value={formData.birthDate}
            onChange={(e) => updateField('birthDate', e.target.value)}
            placeholder="مثال: 1950 أو 15/3/1950"
          />
          <Input
            id="birthPlace"
            label="مكان الميلاد"
            value={formData.birthPlace}
            onChange={(e) => updateField('birthPlace', e.target.value)}
            placeholder="مثال: مكة المكرمة"
          />
        </div>
        <div className={styles.fieldGroup}>
          <label htmlFor="birthNotes" className={styles.label}>ملاحظات الميلاد</label>
          <textarea
            id="birthNotes"
            className={styles.textarea}
            value={formData.birthNotes}
            onChange={(e) => updateField('birthNotes', e.target.value)}
            placeholder="مثال: ولد في عاصفة ثلجية"
            maxLength={2000}
            rows={2}
          />
        </div>

        {/* Death info */}
        <span className={styles.sectionLabel}>بيانات الوفاة</span>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={formData.isDeceased}
            onChange={(e) => updateField('isDeceased', e.target.checked)}
            className={styles.checkbox}
          />
          متوفى/متوفية
        </label>
        {formData.isDeceased && (
          <>
            <div className={styles.row}>
              <Input
                id="deathDate"
                label="تاريخ الوفاة"
                value={formData.deathDate}
                onChange={(e) => updateField('deathDate', e.target.value)}
                placeholder="مثال: 2020"
              />
              <Input
                id="deathPlace"
                label="مكان الوفاة"
                value={formData.deathPlace}
                onChange={(e) => updateField('deathPlace', e.target.value)}
                placeholder="مثال: المدينة المنورة"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label htmlFor="deathNotes" className={styles.label}>ملاحظات الوفاة</label>
              <textarea
                id="deathNotes"
                className={styles.textarea}
                value={formData.deathNotes}
                onChange={(e) => updateField('deathNotes', e.target.value)}
                placeholder="مثال: توفي بسلام في منزله"
                maxLength={2000}
                rows={2}
              />
            </div>
          </>
        )}

        <hr className={styles.sectionDivider} />

        {/* Privacy */}
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={formData.isPrivate}
            onChange={(e) => updateField('isPrivate', e.target.checked)}
            className={styles.checkbox}
          />
          إخفاء المعلومات الشخصية
        </label>

        {/* Notes */}
        <div className={styles.fieldGroup}>
          <label htmlFor="notes" className={styles.label}>ملاحظات</label>
          <textarea
            id="notes"
            className={styles.textarea}
            value={formData.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            placeholder="أضف ملاحظات عن هذا الشخص..."
            maxLength={5000}
            rows={3}
          />
        </div>
      </form>
    </Modal>
  );
}

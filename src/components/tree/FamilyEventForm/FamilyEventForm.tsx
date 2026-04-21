'use client';

import { useState, useCallback, type FormEvent } from 'react';
import clsx from 'clsx';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { PlaceComboBox } from '@/components/ui/PlaceComboBox';
import { Button } from '@/components/ui/Button';
import styles from './FamilyEventForm.module.css';

export interface FamilyEventFormData {
  isUmmWalad?: boolean;
  marriageContractDate: string;
  marriageContractHijriDate: string;
  marriageContractPlace: string;
  marriageContractPlaceId?: string | null;
  marriageContractDescription: string;
  marriageContractNotes: string;
  marriageDate: string;
  marriageHijriDate: string;
  marriagePlace: string;
  marriagePlaceId?: string | null;
  marriageDescription: string;
  marriageNotes: string;
  isDivorced: boolean;
  divorceDate: string;
  divorceHijriDate: string;
  divorcePlace: string;
  divorcePlaceId?: string | null;
  divorceDescription: string;
  divorceNotes: string;
}

interface FamilyEventFormProps {
  initialData?: Partial<FamilyEventFormData>;
  onSubmit: (data: FamilyEventFormData) => Promise<void>;
  onClose: () => void;
  isLoading?: boolean;
  error?: string;
  workspaceId?: string;
  enableUmmWalad?: boolean;
  /**
   * @deprecated Use `initialData.isUmmWalad` instead. Kept for backward compatibility.
   * When provided, overrides the initial isUmmWalad value from initialData.
   */
  isUmmWalad?: boolean;
}

const EMPTY_FORM: FamilyEventFormData = {
  isUmmWalad: false,
  marriageContractDate: '',
  marriageContractHijriDate: '',
  marriageContractPlace: '',
  marriageContractDescription: '',
  marriageContractNotes: '',
  marriageDate: '',
  marriageHijriDate: '',
  marriagePlace: '',
  marriageDescription: '',
  marriageNotes: '',
  isDivorced: false,
  divorceDate: '',
  divorceHijriDate: '',
  divorcePlace: '',
  divorceDescription: '',
  divorceNotes: '',
};

/** Fields that are cleared when isUmmWalad is enabled */
const MARC_MARR_KEYS: (keyof FamilyEventFormData)[] = [
  'marriageContractDate', 'marriageContractHijriDate', 'marriageContractPlace',
  'marriageContractDescription', 'marriageContractNotes',
  'marriageDate', 'marriageHijriDate', 'marriagePlace',
  'marriageDescription', 'marriageNotes',
];

function hasMarriageContractData(data: Partial<FamilyEventFormData>): boolean {
  return !!(
    data.marriageContractDate ||
    data.marriageContractHijriDate ||
    data.marriageContractPlace ||
    data.marriageContractDescription ||
    data.marriageContractNotes
  );
}

function hasMarriageData(data: Partial<FamilyEventFormData>): boolean {
  return !!(
    data.marriageDate ||
    data.marriageHijriDate ||
    data.marriagePlace ||
    data.marriageDescription ||
    data.marriageNotes
  );
}

function hasDivorceData(data: Partial<FamilyEventFormData>): boolean {
  return !!(
    data.isDivorced ||
    data.divorceDate ||
    data.divorceHijriDate ||
    data.divorcePlace ||
    data.divorceDescription ||
    data.divorceNotes
  );
}

export function FamilyEventForm({
  initialData,
  onSubmit,
  onClose,
  isLoading = false,
  error,
  workspaceId,
  enableUmmWalad,
  isUmmWalad: isUmmWaladProp,
}: FamilyEventFormProps) {
  const [formData, setFormData] = useState<FamilyEventFormData>(() => ({
    ...EMPTY_FORM,
    ...initialData,
    // Prop override takes precedence over initialData when explicitly provided
    ...(isUmmWaladProp !== undefined ? { isUmmWalad: isUmmWaladProp } : {}),
  }));

  const isUmmWalad = formData.isUmmWalad ?? false;

  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (initialData && hasMarriageContractData(initialData)) initial.add('contract');
    if (initialData && hasMarriageData(initialData)) initial.add('marriage');
    if (initialData && hasDivorceData(initialData)) initial.add('divorce');
    return initial;
  });

  const toggleSection = useCallback((section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }, []);

  const updateField = useCallback(
    <K extends keyof FamilyEventFormData>(key: K, value: FamilyEventFormData[K]) => {
      setFormData((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  /** Toggle isUmmWalad with a confirmation when enabling it would clear MARC/MARR data */
  const handleUmmWaladToggle = useCallback((checked: boolean) => {
    if (!checked) {
      // Disabling umm walad — no data loss, just allow it
      updateField('isUmmWalad', false);
      return;
    }
    // Enabling umm walad — check if initial data has any MARC/MARR values
    const hasExistingMarcMarr = initialData && (
      hasMarriageContractData(initialData) || hasMarriageData(initialData)
    );
    if (hasExistingMarcMarr) {
      const confirmed = window.confirm(
        'تفعيل أم ولد سيحذف بيانات عقد القران والزفاف. هل تريد المتابعة؟',
      );
      if (!confirmed) return;
    }
    // Clear all MARC/MARR fields and enable umm walad
    setFormData((prev) => {
      const next = { ...prev, isUmmWalad: true };
      for (const key of MARC_MARR_KEYS) {
        (next as Record<string, unknown>)[key] = '';
      }
      // Also clear place IDs
      next.marriageContractPlaceId = null;
      next.marriagePlaceId = null;
      return next;
    });
  }, [initialData, updateField]);

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
        form="family-event-form"
        loading={isLoading}
      >
        حفظ
      </Button>
    </>
  );

  const chevronSvg = (expanded: boolean) => (
    <svg
      className={clsx(styles.chevron, { [styles.chevronExpanded]: expanded })}
      viewBox="0 0 24 24"
      fill="none"
    >
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isUmmWalad ? 'بيانات أم ولد' : 'أحداث الزواج'}
      actions={actions}
      className={styles.modal}
    >
      <form
        id="family-event-form"
        className={styles.form}
        onSubmit={handleSubmit}
      >
        {error && <div className={styles.error}>{error}</div>}

        {/* Umm Walad toggle — visible when workspace enableUmmWalad=true */}
        {enableUmmWalad && (
          <label className={styles.ummWaladLabel}>
            <input
              type="checkbox"
              checked={isUmmWalad}
              onChange={(e) => handleUmmWaladToggle(e.target.checked)}
              className={styles.checkbox}
              aria-label="أم ولد"
            />
            أم ولد
          </label>
        )}

        {/* Marriage Contract Section */}
        {!isUmmWalad && <div className={styles.eventSection}>
          <button
            type="button"
            className={styles.eventSectionHeader}
            onClick={() => toggleSection('contract')}
          >
            عقد القران
            {chevronSvg(expandedSections.has('contract'))}
          </button>
          {expandedSections.has('contract') && (
            <div className={styles.eventSectionContent}>
              <Input
                id="marriageContractDate"
                label="تاريخ عقد القران"
                value={formData.marriageContractDate}
                onChange={(e) => updateField('marriageContractDate', e.target.value)}
                placeholder="مثال: 2020"
              />
              <div className={styles.hijriFieldAccented}>
                <Input
                  id="marriageContractHijriDate"
                  label="التاريخ الهجري"
                  value={formData.marriageContractHijriDate}
                  onChange={(e) => updateField('marriageContractHijriDate', e.target.value)}
                  placeholder="مثال: 5 رمضان 1441"
                />
              </div>
              {workspaceId ? (
                <PlaceComboBox
                  id="marriageContractPlace"
                  label="المكان"
                  value={formData.marriageContractPlace}

                  onChange={(val, pid) => {
                    updateField('marriageContractPlace', val);
                    updateField('marriageContractPlaceId', pid);
                  }}
                  workspaceId={workspaceId}
                  placeholder="مثال: مكة المكرمة"
                />
              ) : (
                <Input
                  id="marriageContractPlace"
                  label="المكان"
                  value={formData.marriageContractPlace}
                  onChange={(e) => updateField('marriageContractPlace', e.target.value)}
                  placeholder="مثال: مكة المكرمة"
                />
              )}
              <Input
                id="marriageContractDescription"
                label="الوصف"
                value={formData.marriageContractDescription}
                onChange={(e) => updateField('marriageContractDescription', e.target.value)}
                placeholder="وصف مختصر"
              />
              <div className={styles.fieldGroup}>
                <label htmlFor="marriageContractNotes" className={styles.label}>ملاحظات</label>
                <textarea
                  id="marriageContractNotes"
                  className={styles.textarea}
                  value={formData.marriageContractNotes}
                  onChange={(e) => updateField('marriageContractNotes', e.target.value)}
                  placeholder="ملاحظات إضافية..."
                  maxLength={2000}
                  rows={2}
                />
              </div>
            </div>
          )}
        </div>}

        {/* Wedding Section */}
        {!isUmmWalad && <div className={styles.eventSection}>
          <button
            type="button"
            className={styles.eventSectionHeader}
            onClick={() => toggleSection('marriage')}
          >
            الزفاف
            {chevronSvg(expandedSections.has('marriage'))}
          </button>
          {expandedSections.has('marriage') && (
            <div className={styles.eventSectionContent}>
              <Input
                id="marriageDate"
                label="تاريخ الزفاف"
                value={formData.marriageDate}
                onChange={(e) => updateField('marriageDate', e.target.value)}
                placeholder="مثال: 2021"
              />
              <div className={styles.hijriFieldAccented}>
                <Input
                  id="marriageHijriDate"
                  label="التاريخ الهجري"
                  value={formData.marriageHijriDate}
                  onChange={(e) => updateField('marriageHijriDate', e.target.value)}
                  placeholder="مثال: 10 شوال 1442"
                />
              </div>
              {workspaceId ? (
                <PlaceComboBox
                  id="marriagePlace"
                  label="المكان"
                  value={formData.marriagePlace}

                  onChange={(val, pid) => {
                    updateField('marriagePlace', val);
                    updateField('marriagePlaceId', pid);
                  }}
                  workspaceId={workspaceId}
                  placeholder="مثال: جدة"
                />
              ) : (
                <Input
                  id="marriagePlace"
                  label="المكان"
                  value={formData.marriagePlace}
                  onChange={(e) => updateField('marriagePlace', e.target.value)}
                  placeholder="مثال: جدة"
                />
              )}
              <Input
                id="marriageDescription"
                label="الوصف"
                value={formData.marriageDescription}
                onChange={(e) => updateField('marriageDescription', e.target.value)}
                placeholder="وصف مختصر"
              />
              <div className={styles.fieldGroup}>
                <label htmlFor="marriageNotes" className={styles.label}>ملاحظات</label>
                <textarea
                  id="marriageNotes"
                  className={styles.textarea}
                  value={formData.marriageNotes}
                  onChange={(e) => updateField('marriageNotes', e.target.value)}
                  placeholder="ملاحظات إضافية..."
                  maxLength={2000}
                  rows={2}
                />
              </div>
            </div>
          )}
        </div>}

        {/* Divorce Section — hidden for umm walad (no marriage to dissolve) */}
        {!isUmmWalad && <div className={clsx(styles.eventSection, styles.divorceSection)}>
          <button
            type="button"
            className={styles.eventSectionHeader}
            onClick={() => toggleSection('divorce')}
          >
            الانفصال
            {chevronSvg(expandedSections.has('divorce'))}
          </button>
          {expandedSections.has('divorce') && (
            <div className={styles.eventSectionContent}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={formData.isDivorced}
                  onChange={(e) => updateField('isDivorced', e.target.checked)}
                  className={styles.checkbox}
                  aria-label="مطلقان"
                />
                مطلقان
              </label>
              {formData.isDivorced && (
                <>
                  <Input
                    id="divorceDate"
                    label="تاريخ الانفصال"
                    value={formData.divorceDate}
                    onChange={(e) => updateField('divorceDate', e.target.value)}
                    placeholder="مثال: 2023"
                  />
                  <div className={styles.hijriFieldAccented}>
                    <Input
                      id="divorceHijriDate"
                      label="التاريخ الهجري"
                      value={formData.divorceHijriDate}
                      onChange={(e) => updateField('divorceHijriDate', e.target.value)}
                      placeholder="مثال: 1 ذو الحجة 1444"
                    />
                  </div>
                  {workspaceId ? (
                    <PlaceComboBox
                      id="divorcePlace"
                      label="المكان"
                      value={formData.divorcePlace}

                      onChange={(val, pid) => {
                        updateField('divorcePlace', val);
                        updateField('divorcePlaceId', pid);
                      }}
                      workspaceId={workspaceId}
                      placeholder="المكان"
                    />
                  ) : (
                    <Input
                      id="divorcePlace"
                      label="المكان"
                      value={formData.divorcePlace}
                      onChange={(e) => updateField('divorcePlace', e.target.value)}
                      placeholder="المكان"
                    />
                  )}
                  <Input
                    id="divorceDescription"
                    label="الوصف"
                    value={formData.divorceDescription}
                    onChange={(e) => updateField('divorceDescription', e.target.value)}
                    placeholder="وصف مختصر"
                  />
                  <div className={styles.fieldGroup}>
                    <label htmlFor="divorceNotes" className={styles.label}>ملاحظات</label>
                    <textarea
                      id="divorceNotes"
                      className={styles.textarea}
                      value={formData.divorceNotes}
                      onChange={(e) => updateField('divorceNotes', e.target.value)}
                      placeholder="ملاحظات إضافية..."
                      maxLength={2000}
                      rows={2}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>}
      </form>
    </Modal>
  );
}

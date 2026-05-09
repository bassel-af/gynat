'use client';

import { useState, useCallback, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { matchesSearch } from '@/lib/utils/search';
import styles from './MoveSubtreeModal.module.css';

export type MoveSubtreeOption =
  | {
      kind: 'family';
      /** Existing FAM record id. */
      familyId: string;
      /** "أب + أم" / single parent name / "عائلة بدون والدين". */
      parentNames: string;
    }
  | {
      kind: 'solo';
      /** Free-floating individual not in any FAM as a parent. Picking this creates a new
       * one-parent FAM (HUSB-only or WIFE-only based on sex) and links the target as CHIL. */
      individualId: string;
      name: string;
      sex: 'M' | 'F';
    };

export type MoveSubtreeIntent = 'assign' | 'change';

export interface MoveSubtreeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (option: MoveSubtreeOption) => void;
  options: MoveSubtreeOption[];
  personName: string;
  descendantCount: number;
  /** 'assign' when the person currently has no parents; 'change' when they already do. */
  intent: MoveSubtreeIntent;
  /** Names of previous parents who would become disconnected after the move and will be deleted. */
  orphanedParentNames?: string[];
  loading?: boolean;
}

type Step = 'select' | 'confirm';

function optionKey(option: MoveSubtreeOption): string {
  return option.kind === 'family' ? `family:${option.familyId}` : `solo:${option.individualId}`;
}

function optionDisplayLabel(option: MoveSubtreeOption): string {
  return option.kind === 'family' ? option.parentNames : option.name;
}

function optionSearchHaystack(option: MoveSubtreeOption): string {
  return option.kind === 'family' ? option.parentNames : option.name;
}

/**
 * Build the confirmation sentence. Each shape reads naturally on its own — we don't
 * try to compose a single template across kinds because Arabic agreement (dual vs.
 * singular, masculine vs. feminine) doesn't survive simple substitution.
 */
function buildMainSentence(
  option: MoveSubtreeOption,
  personName: string,
  descendantCount: number,
  intent: MoveSubtreeIntent,
): string {
  const tail = descendantCount > 0 ? ` و ${descendantCount} من الذرية` : '';
  if (option.kind === 'family') {
    if (intent === 'assign') {
      return `سيتم تعيين ${option.parentNames} والدين لـ ${personName}${tail}. هل تريد المتابعة؟`;
    }
    return `سيتم تغيير والدي ${personName}${tail} إلى ${option.parentNames}. هل تريد المتابعة؟`;
  }
  // Solo individual — single-parent FAM will be created.
  const roleSingle = option.sex === 'F' ? 'أمًّا' : 'أبًا';
  if (intent === 'assign') {
    return `سيتم تعيين ${option.name} ${roleSingle} لـ ${personName}${tail}. هل تريد المتابعة؟`;
  }
  const roleParen = option.sex === 'F' ? 'أم فقط' : 'أب فقط';
  return `سيتم تغيير والدي ${personName}${tail} إلى ${option.name} (${roleParen}). هل تريد المتابعة؟`;
}

export function MoveSubtreeModal({
  isOpen,
  onClose,
  onConfirm,
  options,
  personName,
  descendantCount,
  intent,
  orphanedParentNames = [],
  loading = false,
}: MoveSubtreeModalProps) {
  const [step, setStep] = useState<Step>('select');
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    setStep('select');
    setQuery('');
    setSelectedKey(null);
    onClose();
  }, [onClose]);

  const filteredOptions = useMemo(() => {
    if (!query.trim()) return options;
    return options.filter((o) => matchesSearch(optionSearchHaystack(o), query));
  }, [options, query]);

  const selectedOption = useMemo(
    () => options.find((o) => optionKey(o) === selectedKey) ?? null,
    [options, selectedKey],
  );

  const handleNext = useCallback(() => {
    if (!selectedKey) return;
    setStep('confirm');
  }, [selectedKey]);

  const handleBack = useCallback(() => {
    setStep('select');
  }, []);

  const handleConfirm = useCallback(() => {
    if (selectedOption) onConfirm(selectedOption);
  }, [selectedOption, onConfirm]);

  if (step === 'confirm' && selectedOption) {
    const confirmTitle = intent === 'assign' ? 'تأكيد تعيين الوالدين' : 'تأكيد تغيير الوالدين';
    const loadingLabel = intent === 'assign' ? 'جارٍ التعيين...' : 'جارٍ التغيير...';
    const verbBase = intent === 'assign' ? 'تعيين' : 'تغيير';
    const mainSentence = buildMainSentence(selectedOption, personName, descendantCount, intent);
    const orphanSentence = orphanedParentNames.length === 1
      ? `سيتم حذف ${orphanedParentNames[0]} لأنه لن يبقى متصلاً بأي شخص في الشجرة.`
      : orphanedParentNames.length > 1
        ? `سيتم حذف ${orphanedParentNames.join(' و')} لأنهم لن يبقوا متصلين بأي شخص في الشجرة.`
        : null;
    const detailValue = selectedOption.kind === 'family'
      ? selectedOption.parentNames
      : `${selectedOption.name} (عائلة جديدة)`;
    return (
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={confirmTitle}
        actions={
          <>
            <Button variant="ghost" size="md" onClick={handleBack} disabled={loading}>
              رجوع
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleConfirm}
              disabled={loading}
              loading={loading}
            >
              {loading ? loadingLabel : 'تأكيد'}
            </Button>
          </>
        }
        className={styles.modal}
      >
        <div className={styles.confirmContent}>
          <div className={styles.confirmWarning}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className={styles.confirmIcon}>
              <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className={styles.confirmText}>{mainSentence}</span>
          </div>
          {orphanSentence && (
            <div className={styles.orphanWarning}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className={styles.orphanIcon}>
                <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className={styles.orphanText}>{orphanSentence}</span>
            </div>
          )}
          <div className={styles.confirmDetail}>
            <div className={styles.confirmRow}>
              <span className={styles.confirmLabel}>{verbBase} إلى:</span>
              <span className={styles.confirmValue}>{detailValue}</span>
            </div>
          </div>
        </div>
      </Modal>
    );
  }

  const pickerTitle = intent === 'assign' ? 'تعيين والدين موجودين' : 'تغيير الوالدين';
  const emptyMessage = intent === 'assign'
    ? 'لا يوجد أحد متاح لتعيينه والدًا'
    : 'لا توجد عائلات أو أشخاص متاحون للنقل';
  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={pickerTitle}
      actions={
        <>
          <Button variant="ghost" size="md" onClick={handleClose}>
            إلغاء
          </Button>
          <Button
            variant="primary"
            size="md"
            disabled={!selectedKey}
            onClick={handleNext}
          >
            التالي
          </Button>
        </>
      }
      className={styles.modal}
    >
      <div className={styles.searchWrapper}>
        <svg viewBox="0 0 24 24" fill="none" className={styles.searchIcon}>
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
          <path d="M20 20L16.5 16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث بالاسم..."
          className={styles.searchInput}
          autoComplete="off"
          autoFocus
        />
        {query && (
          <button
            type="button"
            className={styles.clearButton}
            onClick={() => setQuery('')}
            aria-label="مسح البحث"
          >
            <svg viewBox="0 0 16 16" fill="none" className={styles.clearIcon}>
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>

      <div className={styles.list} role="radiogroup" aria-label="اختر الوالد أو العائلة">
        {filteredOptions.length === 0 ? (
          <div className={styles.emptyState}>
            {query.trim() ? 'لا توجد نتائج' : emptyMessage}
          </div>
        ) : (
          filteredOptions.map((option) => {
            const key = optionKey(option);
            const selected = selectedKey === key;
            return (
              <label
                key={key}
                className={`${styles.row} ${selected ? styles.rowSelected : ''}`}
              >
                <input
                  type="radio"
                  name="move-subtree-option"
                  value={key}
                  checked={selected}
                  onChange={() => setSelectedKey(key)}
                  className={styles.radioInput}
                />
                <span className={styles.familyLabel}>{optionDisplayLabel(option)}</span>
                {option.kind === 'solo' && (
                  <span className={styles.newFamilyBadge}>عائلة جديدة</span>
                )}
              </label>
            );
          })
        )}
      </div>

      <div className={styles.resultCount}>
        {options.length > 0 && (
          <span>
            {query.trim()
              ? `${filteredOptions.length} من ${options.length}`
              : `${options.length} خيار`}
          </span>
        )}
      </div>
    </Modal>
  );
}

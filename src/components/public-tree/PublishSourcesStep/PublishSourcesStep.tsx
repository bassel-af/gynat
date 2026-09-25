'use client';

import clsx from 'clsx';
import type { PublishSourcesSummary } from '@/lib/tree/source-entries-api';
import {
  treeEntryPending,
  type PublishSourcesChoice,
  type PublishSourcesMode,
} from '@/lib/tree/publish-sources';
import { SourcesManager } from '@/components/sources/SourcesManager';
import { sourceCountLabel } from '@/components/sources/arabicDigits';
import styles from './PublishSourcesStep.module.css';

export interface PublishSourcesStepProps {
  workspaceId: string;
  treeId?: string;
  summary: PublishSourcesSummary;
  value: PublishSourcesChoice;
  onChange: (next: PublishSourcesChoice) => void;
  onContinue: () => void;
  onBack: () => void;
}

const OPTIONS: { mode: PublishSourcesMode; label: string; hint: string }[] = [
  { mode: 'all', label: 'كلها', hint: 'تظهر كل المصادر لزوار الشجرة المنشورة' },
  { mode: 'none', label: 'لا شيء', hint: 'يبقى كل مصدر كما هو' },
  { mode: 'pick', label: 'أختار بنفسي', hint: 'اختر من القائمة ما يظهر للزوار' },
];

/**
 * The publish flow's ONE sources question — «المصادر في الشجرة المنشورة».
 * Presentational: the container applies the choice after the publish
 * succeeded. «لا شيء» is the default and changes nothing. The tree-wide entry
 * is not in the list or bulk actions, so it is offered as its own checkbox.
 */
export function PublishSourcesStep({
  workspaceId,
  treeId,
  summary,
  value,
  onChange,
  onContinue,
  onBack,
}: PublishSourcesStepProps) {
  const pending = summary.pendingIds.length;
  const hasTreeEntry = treeEntryPending(summary);

  const setMode = (mode: PublishSourcesMode) =>
    onChange({
      ...value,
      mode,
      // «كلها» carries the tree-wide entry along; «لا شيء» leaves it too.
      includeTreeEntry: mode === 'all' ? true : mode === 'none' ? false : value.includeTreeEntry,
    });

  return (
    <div className={styles.step}>
      <h2 className={styles.title}>المصادر في الشجرة المنشورة</h2>

      {pending > 0 && (
        <>
          <p className={styles.lead}>
            لديك {sourceCountLabel(pending)} يراها أعضاء مساحة العائلة أو المشرفون فقط
            {summary.publicCount > 0 && <>، و{sourceCountLabel(summary.publicCount)} يظهر لهم أصلًا</>}
            . أيّها يظهر لزوار الشجرة المنشورة؟
          </p>

          <div className={styles.options} role="radiogroup" aria-label="أيّ المصادر يظهر للزوار">
            {OPTIONS.map((o) => (
              <label key={o.mode} className={clsx(styles.option, { [styles.optionActive]: value.mode === o.mode })}>
                <input
                  type="radio"
                  name="publish-sources"
                  className={styles.radio}
                  checked={value.mode === o.mode}
                  onChange={() => setMode(o.mode)}
                  aria-label={o.label}
                />
                <span className={styles.optionText}>
                  <span className={styles.optionLabel}>{o.label}</span>
                  <span className={styles.optionHint}>{o.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </>
      )}

      {pending === 0 && (
        <p className={styles.lead}>مصدر الشجرة لا يراه إلا أعضاء مساحة العائلة أو المشرفون. هل يظهر لزوار الشجرة المنشورة؟</p>
      )}

      {hasTreeEntry && (
        <label className={styles.treeEntry}>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={value.includeTreeEntry}
            onChange={(e) => onChange({ ...value, includeTreeEntry: e.target.checked })}
            aria-label="ومصدر الشجرة"
          />
          <span>ومصدر الشجرة</span>
        </label>
      )}

      {value.mode === 'pick' && pending > 0 && (
        <div className={styles.picker}>
          <SourcesManager
            workspaceId={workspaceId}
            slug=""
            treeId={treeId}
            selection={{
              selected: new Set(value.pickedIds),
              onChange: (next) => onChange({ ...value, pickedIds: [...next] }),
            }}
          />
        </div>
      )}

      {value.mode !== 'none' && (
        <p className={styles.warning}>تأكد أن الملفات لا تحوي بيانات شخصية لأحياء (رقم هوية، صورة، عنوان)</p>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.continueBtn} onClick={onContinue}>
          متابعة
        </button>
        <button type="button" className={styles.backBtn} onClick={onBack}>
          رجوع
        </button>
      </div>
    </div>
  );
}

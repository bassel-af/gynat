'use client';

import { useId } from 'react';
import clsx from 'clsx';
import type { SourceVisibilityLevel } from '@/lib/tree/source-visibility';
import { AlertIcon, GlobeIcon, LinkIcon, LockIcon } from './SourceIcons';
import { peopleCountLabel, toArabicDigits } from './arabicDigits';
import styles from './SourceVisibilityPicker.module.css';

/** The tree's publish level (the `TreeVisibility` DB values). */
export type TreePublishLevel = 'private' | 'public_link' | 'public_listed';

export interface SourceVisibilityPickerProps {
  value: SourceVisibilityLevel;
  onChange: (level: SourceVisibilityLevel) => void;
  /** Only workspace admins may pick «أعضاء مساحة العائلة» or the public level. */
  isAdmin: boolean;
  /** The CURRENT tree's publish level; null while unknown (no status line). */
  treeVisibility: TreePublishLevel | null;
  /** The entry has (or will have) files — drives the level-3 soft warning. */
  hasFiles: boolean;
  /**
   * A source for several people: how many (`total`, as this viewer sees
   * them) and how many of those the published tree shows (`shown`). Turns
   * the files warning into the shared-source sentence when `total` > 1.
   */
  sharedPeople?: { total: number; shown: number };
  disabled?: boolean;
}

export const SOURCE_LEVEL_LABELS: Record<SourceVisibilityLevel, string> = {
  admins: 'المشرفون فقط',
  members: 'أعضاء مساحة العائلة',
  public: 'أعضاء مساحة العائلة وزوار الشجرة المنشورة',
};

const PUBLIC_SUFFIX = 'فقط إذا قمت بنشرها للعامة';
const ADMIN_ONLY_HINT = 'تغيير من يرى المصدر متاح للمشرفين فقط';
const FILES_WARNING = 'تأكد أن الملفات لا تحوي بيانات شخصية لأحياء (رقم هوية، صورة، عنوان)';

function sharedFilesWarning({ total, shown }: { total: number; shown: number }): string {
  return `هذا المصدر لـ ${peopleCountLabel(total)}، ويظهر على الأشخاص الظاهرين في الشجرة المنشورة (${toArabicDigits(shown)} من ${toArabicDigits(total)}). تأكد أن الملفات لا تحوي بيانات شخصية لأحياء.`;
}

const STATUS_LINES: Record<TreePublishLevel, { text: string; Icon: typeof LockIcon }> = {
  private: {
    text: 'الشجرة حاليًا غير منشورة، فلن يراه أحد من خارج مساحة العائلة ما لم تنشرها بنفسك.',
    Icon: LockIcon,
  },
  public_link: { text: 'الشجرة حاليًا منشورة برابط: يراه كل من لديه الرابط.', Icon: LinkIcon },
  public_listed: {
    text: 'الشجرة حاليًا منشورة للعامة وتظهر في محركات البحث: يراه كل من يزورها.',
    Icon: GlobeIcon,
  },
};

const LEVELS: SourceVisibilityLevel[] = ['admins', 'members', 'public'];

/**
 * «من يرى هذا المصدر؟» — the three-level choice for one source entry, with the
 * live publish status of the current tree under the public level. Shared by
 * the person form and the «المصادر» page.
 */
export function SourceVisibilityPicker({
  value,
  onChange,
  isAdmin,
  treeVisibility,
  hasFiles,
  sharedPeople,
  disabled = false,
}: SourceVisibilityPickerProps) {
  const name = useId();
  const status = treeVisibility ? STATUS_LINES[treeVisibility] : null;

  return (
    <fieldset className={styles.picker} disabled={disabled}>
      <legend className={styles.legend}>من يرى هذا المصدر؟</legend>

      {LEVELS.map((level) => {
        const locked = !isAdmin && level !== 'admins';
        const id = `${name}-${level}`;
        return (
          <div key={level} className={styles.optionWrap}>
            <label
              htmlFor={id}
              className={clsx(styles.option, {
                [styles.optionChecked]: value === level,
                [styles.optionLocked]: locked,
              })}
            >
              <input
                id={id}
                type="radio"
                name={name}
                value={level}
                checked={value === level}
                disabled={locked}
                onChange={() => onChange(level)}
                className={styles.radio}
              />
              <span className={styles.optionText}>
                <span className={styles.optionLabel}>
                  {level === 'admins' && <LockIcon size={13} className={styles.optionIcon} />}
                  {SOURCE_LEVEL_LABELS[level]}
                </span>
                {level === 'public' && <span className={styles.optionSuffix}>{PUBLIC_SUFFIX}</span>}
              </span>
            </label>

            {level === 'public' && status && (
              <p className={styles.status}>
                <status.Icon size={13} className={styles.statusIcon} />
                <span>{status.text}</span>
              </p>
            )}
          </div>
        );
      })}

      {!isAdmin && <p className={styles.hint}>{ADMIN_ONLY_HINT}</p>}

      {value === 'public' && hasFiles && (
        <p className={styles.warning} role="note">
          <AlertIcon size={14} className={styles.statusIcon} />
          <span>{sharedPeople && sharedPeople.total > 1 ? sharedFilesWarning(sharedPeople) : FILES_WARNING}</span>
        </p>
      )}
    </fieldset>
  );
}

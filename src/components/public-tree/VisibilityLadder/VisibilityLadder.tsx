'use client';

import clsx from 'clsx';
import styles from './VisibilityLadder.module.css';

export type VisibilityLevel = 'private' | 'link' | 'search';

export interface VisibilityLadderProps {
  /** Currently selected visibility level. Controlled. */
  level: VisibilityLevel;
  /**
   * Fired when the admin picks a different level. The visibility state machine
   * (publish checkpoint on the way up, make-private dialog on the way down)
   * lives outside this component — it only reports the chosen level.
   */
  onLevelChange?: (level: VisibilityLevel) => void;
  /** "Others may include this tree in their collections" opt-in. Controlled. */
  allowReuse: boolean;
  onAllowReuseChange?: (allow: boolean) => void;
  className?: string;
}

interface LevelDef {
  level: VisibilityLevel;
  label: string;
  desc: string;
  /** Marks the higher-consequence search level. */
  further?: boolean;
}

const LEVELS: LevelDef[] = [
  {
    level: 'private',
    label: 'خاصة — للأعضاء فقط',
    desc: 'لا يراها إلا من تدعوهم إلى مساحة العائلة. هذا هو الوضع الافتراضي.',
  },
  {
    level: 'link',
    label: 'عامة عبر الرابط',
    desc: 'يستطيع من يملك الرابط مشاهدتها، ولا تظهر في نتائج محركات البحث. خطوة أولى آمنة.',
  },
  {
    level: 'search',
    label: 'عامة وتظهر في محركات البحث',
    desc: 'قد تظهر شجرة العائلة في نتائج محركات البحث مثل Google. قرار يصعب التراجع عنه تماما — يمر بمراجعة وتنبيه.',
    further: true,
  },
];

/**
 * The three-level visibility control (admin-only) for a family tree. A ladder of
 * radio-cards — not a switch — because the steps are not symmetric: going more
 * private is easy, but being listed in search is effectively one-way.
 *
 * Presentational only. Selecting a level reports intent via `onLevelChange`;
 * the actual publish checkpoint / make-private flows are wired by the caller.
 */
export function VisibilityLadder({
  level,
  onLevelChange,
  allowReuse,
  onAllowReuseChange,
  className,
}: VisibilityLadderProps) {
  const isPublic = level !== 'private';

  return (
    <div className={clsx(styles.panel, className)}>
      <div className={styles.header}>
        <div className={styles.kicker}>النشر والظهور · للمسؤول فقط</div>
        <h3 className={styles.title}>من يستطيع رؤية شجرة العائلة؟</h3>
      </div>

      <div className={styles.ladder} role="radiogroup" aria-label="مستوى الظهور">
        {LEVELS.map((def) => {
          const active = def.level === level;
          return (
            <button
              key={def.level}
              type="button"
              role="radio"
              aria-checked={active}
              className={clsx(styles.item, {
                [styles.itemActive]: active,
                [styles.itemFurther]: def.further,
              })}
              onClick={() => onLevelChange?.(def.level)}
            >
              <span className={styles.radio} aria-hidden="true" />
              <span className={styles.text}>
                <span className={styles.label}>
                  {def.label}
                  {def.level === 'private' && active && (
                    <span className={styles.currentTag}>الحالة الحالية</span>
                  )}
                  {def.further && <span className={styles.furtherTag}>خطوة أبعد</span>}
                </span>
                <span className={styles.desc}>{def.desc}</span>
              </span>
            </button>
          );
        })}
      </div>

      <label className={clsx(styles.reuseRow, { [styles.reuseRowDisabled]: !isPublic })}>
        <input
          type="checkbox"
          className={styles.reuseCheckboxInput}
          checked={allowReuse}
          disabled={!isPublic}
          onChange={(e) => onAllowReuseChange?.(e.target.checked)}
        />
        <span className={clsx(styles.checkbox, { [styles.checkboxChecked]: allowReuse })} aria-hidden="true">
          {allowReuse && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        <span className={styles.reuseText}>
          <span className={styles.reuseLabel}>
            السماح للآخرين بضم هذه الشجرة إلى مجموعاتهم
            <span className={styles.seamTag}>يفعل مع ميزة المجموعات لاحقا</span>
          </span>
          <span className={styles.reuseHint}>
            (غير مفعل افتراضيا) — «أن يشاهد» شيء، و«أن يعاد استخدامه» في مواد الآخرين شيء آخر.
          </span>
        </span>
      </label>
    </div>
  );
}

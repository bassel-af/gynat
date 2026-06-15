'use client';

import clsx from 'clsx';
import styles from './ReportForm.module.css';

export interface ReportFormProps {
  /** Submit handler — wired to the report endpoint in the TDD phase. */
  onSubmit?: () => void;
  /** Cancel / dismiss handler. */
  onCancel?: () => void;
  className?: string;
}

const REASONS = [
  'ظهور بيانات شخصٍ حيّ دون موافقته',
  'معلوماتٌ غير صحيحة',
  'محتوى مسيء',
  'سببٌ آخر',
] as const;

/**
 * Public, no-account-required report form — so a person exposed in a public
 * tree (who may not be a platform member) can ask for removal.
 *
 * Presentational only: fields are uncontrolled placeholders; `onSubmit` is a
 * placeholder for the TDD phase to wire.
 */
export function ReportForm({ onSubmit, onCancel, className }: ReportFormProps) {
  return (
    <form
      className={clsx(styles.form, className)}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
    >
      <div className={styles.head}>
        <h2 className={styles.title}>الإبلاغ عن محتوى</h2>
        <p className={styles.sub}>
          إن ظهرت بياناتُك أو بيانات أحد أقاربك في شجرةٍ عامّة دون موافقة، أخبِرنا وسنراجع الأمر.
          لا حاجة لتسجيل الدخول.
        </p>
      </div>

      <div className={styles.body}>
        <div className={styles.row}>
          <label className={styles.label} htmlFor="report-reason">
            ما الذي تُبلِغ عنه؟
          </label>
          <select id="report-reason" className={styles.select} defaultValue="">
            <option value="" disabled>
              اختر السبب…
            </option>
            {REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {reason}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.row}>
          <label className={styles.label} htmlFor="report-person">
            مَن الفرد المتأثّر؟
          </label>
          <input
            id="report-person"
            className={styles.input}
            placeholder="اسم الفرد كما يظهر في الشجرة"
            autoComplete="off"
          />
        </div>

        <div className={styles.row}>
          <label className={styles.label} htmlFor="report-contact">
            وسيلة تواصلٍ (اختياريّة)
          </label>
          <input
            id="report-contact"
            className={styles.input}
            placeholder="بريدٌ إلكترونيّ لنردّ عليك"
            autoComplete="off"
          />
        </div>

        <div className={styles.row}>
          <label className={styles.label} htmlFor="report-details">
            تفاصيل إضافيّة
          </label>
          <textarea
            id="report-details"
            className={styles.textarea}
            rows={4}
            placeholder="اشرح لنا الأمر باختصار…"
          />
        </div>

        <div className={styles.actions}>
          <button type="submit" className={styles.submit}>
            إرسال البلاغ
          </button>
          {onCancel && (
            <button type="button" className={styles.cancel} onClick={onCancel}>
              إلغاء
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

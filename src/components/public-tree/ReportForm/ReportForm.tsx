'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Alert } from '@/components/ui';
import type { ReportInput } from '@/lib/tree/report-schemas';
import styles from './ReportForm.module.css';

export interface ReportFormProps {
  /**
   * Submit handler — receives the payload already shaped for the report endpoint
   * (`{ reason, reporterContact }`). The category + affected person + free
   * details are composed into the single `reason` string.
   */
  onSubmit?: (payload: ReportInput) => void | Promise<void>;
  /** Cancel / dismiss handler. */
  onCancel?: () => void;
  /** Disables the form and shows a busy label while a request is in flight. */
  submitting?: boolean;
  /** A submission error to surface to the reporter. */
  error?: string | null;
  /** When true, the form is replaced by a thank-you confirmation. */
  submitted?: boolean;
  className?: string;
}

const REASONS = [
  'ظهور بيانات شخصٍ حيّ دون موافقته',
  'معلوماتٌ غير صحيحة',
  'محتوى مسيء',
  'سببٌ آخر',
] as const;

/** Compose the form fields into the single `reason` the endpoint expects. */
function composeReason(category: string, person: string, details: string): string {
  return [
    category.trim(),
    person.trim() ? `الفرد المتأثّر: ${person.trim()}` : '',
    details.trim(),
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Public, no-account-required report form — so a person exposed in a public
 * tree (who may not be a platform member) can ask for removal.
 *
 * Collects the complaint, composes it into a `{ reason, reporterContact }`
 * payload, and hands it to `onSubmit`. The page-level container performs the
 * actual POST and feeds back `submitting` / `error` / `submitted`.
 */
export function ReportForm({
  onSubmit,
  onCancel,
  submitting = false,
  error,
  submitted = false,
  className,
}: ReportFormProps) {
  const [validationError, setValidationError] = useState<string | null>(null);

  if (submitted) {
    return (
      <div className={clsx(styles.form, className)}>
        <div className={styles.head}>
          <h2 className={styles.title}>تمّ استلام بلاغك</h2>
          <p className={styles.sub}>
            شكراً لك. سيراجع المشرفون بلاغك ويتّخذون الإجراء المناسب. إن تركت وسيلة
            تواصلٍ فقد نعود إليك.
          </p>
        </div>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const category = String(fd.get('reason') ?? '').trim();
    if (!category) {
      setValidationError('الرجاء اختيار سبب البلاغ.');
      return;
    }
    setValidationError(null);
    const reason = composeReason(
      category,
      String(fd.get('person') ?? ''),
      String(fd.get('details') ?? ''),
    );
    const contact = String(fd.get('contact') ?? '').trim();
    onSubmit?.(contact ? { reason, reporterContact: contact } : { reason });
  };

  const alert = error ?? validationError;

  return (
    <form className={clsx(styles.form, className)} onSubmit={handleSubmit}>
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
          <select
            id="report-reason"
            name="reason"
            className={styles.select}
            defaultValue=""
            disabled={submitting}
          >
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
            name="person"
            className={styles.input}
            placeholder="اسم الفرد كما يظهر في الشجرة"
            autoComplete="off"
            maxLength={120}
            disabled={submitting}
          />
        </div>

        <div className={styles.row}>
          <label className={styles.label} htmlFor="report-contact">
            وسيلة تواصلٍ (اختياريّة)
          </label>
          <input
            id="report-contact"
            name="contact"
            className={styles.input}
            placeholder="بريدٌ إلكترونيّ لنردّ عليك"
            autoComplete="off"
            maxLength={200}
            disabled={submitting}
          />
        </div>

        <div className={styles.row}>
          <label className={styles.label} htmlFor="report-details">
            تفاصيل إضافيّة
          </label>
          <textarea
            id="report-details"
            name="details"
            className={styles.textarea}
            rows={4}
            placeholder="اشرح لنا الأمر باختصار…"
            maxLength={1800}
            disabled={submitting}
          />
        </div>

        {alert && (
          <Alert variant="error" className={styles.alertSlot}>
            {alert}
          </Alert>
        )}

        <div className={styles.actions}>
          <button type="submit" className={styles.submit} disabled={submitting}>
            {submitting ? 'جارٍ الإرسال…' : 'إرسال البلاغ'}
          </button>
          {onCancel && (
            <button
              type="button"
              className={styles.cancel}
              onClick={onCancel}
              disabled={submitting}
            >
              إلغاء
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

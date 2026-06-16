'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ReportForm } from '@/components/public-tree';
import type { ReportInput } from '@/lib/tree/report-schemas';
import styles from './report.module.css';

export interface ReportPageClientProps {
  slug: string;
  familyName: string;
}

/**
 * Wires the presentational `ReportForm` to the public report endpoint
 * (`POST /api/family/[slug]/report`). Anonymous, so it uses a plain `fetch`
 * (no Bearer token). The endpoint always returns a neutral success and never
 * auto-takes-down — an admin reviews every report.
 */
export default function ReportPageClient({ slug, familyName }: ReportPageClientProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(payload: ReportInput) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/family/${slug}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        if (res.status === 429) {
          throw new Error('لقد أرسلت بلاغاتٍ كثيرة. الرجاء المحاولة بعد قليل.');
        }
        throw new Error('تعذّر إرسال البلاغ. الرجاء المحاولة مرّةً أخرى.');
      }
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر إرسال البلاغ.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page} dir="rtl">
      <div className={styles.inner}>
        <p className={styles.context}>
          بخصوص شجرة عائلة <span className={styles.family}>{familyName}</span>
        </p>
        <ReportForm
          onSubmit={handleSubmit}
          submitting={submitting}
          submitted={submitted}
          error={error}
          className={styles.form}
        />
        <Link href={`/family/${slug}`} className={styles.back}>
          العودة إلى الشجرة
        </Link>
      </div>
    </main>
  );
}

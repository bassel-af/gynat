'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api/client';
import { useToast } from '@/context/ToastContext';
import styles from './create.module.css';

const SLUG_PATTERN = /^[a-z0-9-]+$/;

export default function CreateWorkspacePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [nameAr, setNameAr] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  function validate(): boolean {
    const errors: Record<string, string> = {};

    if (!nameAr.trim()) {
      errors.nameAr = 'الاسم بالعربية مطلوب';
    }

    if (!slug.trim()) {
      errors.slug = 'المعرف مطلوب';
    } else if (!SLUG_PATTERN.test(slug)) {
      errors.slug = 'المعرف يجب أن يحتوي على أحرف إنجليزية صغيرة وأرقام وشرطات فقط';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!validate()) return;

    setLoading(true);

    try {
      const res = await apiFetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nameAr: nameAr.trim(),
          slug: slug.trim().normalize('NFC'),
          description: description.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        setError(body.error || 'فشل في إنشاء مساحة العائلة');
        setLoading(false);
        return;
      }

      showToast('تم إنشاء مساحة العائلة بنجاح', 'success');
      router.push('/workspaces');
    } catch {
      setError('فشل في إنشاء مساحة العائلة');
      setLoading(false);
    }
  }

  return (
    <main className={styles.root}>
      <div className={styles.content}>
        <div className={styles.card}>
          <Link href="/workspaces" className={styles.backLink}>
            <span aria-hidden>→</span>
            العودة إلى المساحات
          </Link>

          <span className={styles.kicker}>مساحة جديدة</span>
          <h1 className={styles.title}>ابدأ بيتاً جديداً لعائلتك</h1>
          <p className={styles.subtitle}>
            اختَر اسماً يعكس هُويّة العائلة ومعرّفاً سهلاً للمشاركة.
          </p>

          <form onSubmit={handleSubmit} className={styles.form} noValidate>
            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.field}>
              <label htmlFor="nameAr" className={styles.label}>اسم العائلة</label>
              <input
                id="nameAr"
                type="text"
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                className={styles.input}
                placeholder="مثال: الهاشمي"
                required
              />
              {fieldErrors.nameAr && (
                <span className={styles.fieldError}>{fieldErrors.nameAr}</span>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor="slug" className={styles.label}>المُعرِّف</label>
              <input
                id="slug"
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                className={styles.input}
                placeholder="al-hashimi"
                required
                dir="ltr"
              />
              <span className={styles.hint}>
                أحرفٌ إنجليزيّة صغيرة وأرقام وشرطات فقط — يظهر في الرابط.
              </span>
              {fieldErrors.slug && (
                <span className={styles.fieldError}>{fieldErrors.slug}</span>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor="description" className={styles.label}>وصفٌ موجز</label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={styles.textarea}
                placeholder="نبذةٌ قصيرةٌ عن العائلة أو فرعها (اختياري)"
              />
            </div>

            <button type="submit" className={styles.button} disabled={loading}>
              {loading ? 'جاري الإنشاء…' : 'إنشاء المساحة'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api/client';
import { useToast } from '@/context/ToastContext';
import { CenteredCardLayout } from '@/components/ui/CenteredCardLayout';
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
          slug: slug.trim(),
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
    <CenteredCardLayout className={styles.cardWide}>
      <Link href="/workspaces" className={styles.backLink}>
        &rarr; العودة للمساحات
      </Link>
      <div className={styles.icon}>
        <iconify-icon icon="material-symbols:add-home-work" width="48" height="48" />
      </div>
      <h1 className={styles.title}>إنشاء مساحة عائلية</h1>
      <p className={styles.subtitle}>أنشئ مساحة عائلية جديدة لعائلتك</p>

      <form onSubmit={handleSubmit} className={styles.form}>
        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.field}>
          <label htmlFor="nameAr" className={styles.label}>اسم العائلة *</label>
          <input
            id="nameAr"
            type="text"
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            className={styles.input}
            placeholder="مثال: السعيد"
            required
          />
          {fieldErrors.nameAr && (
            <span className={styles.fieldError}>{fieldErrors.nameAr}</span>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="slug" className={styles.label}>المعرف (slug) *</label>
          <input
            id="slug"
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            className={styles.input}
            placeholder="al-saeed"
            dir="ltr"
            required
          />
          <span className={styles.hint}>
            أحرف إنجليزية صغيرة وأرقام وشرطات فقط
          </span>
          {fieldErrors.slug && (
            <span className={styles.fieldError}>{fieldErrors.slug}</span>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="description" className={styles.label}>الوصف</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={styles.textarea}
            placeholder="وصف اختياري لمساحة العائلة"
          />
        </div>

        <button type="submit" className={styles.button} disabled={loading}>
          {loading ? 'جاري الإنشاء...' : 'إنشاء مساحة العائلة'}
        </button>
      </form>
    </CenteredCardLayout>
  );
}

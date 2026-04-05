'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CenteredCardLayout } from '@/components/ui/CenteredCardLayout';
import styles from './forgot-password.module.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
      });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      setSent(true);
    } catch {
      setError('حدث خطأ أثناء إرسال رابط إعادة التعيين');
    } finally {
      setLoading(false);
    }
  }

  return (
    <CenteredCardLayout>
      <div className={styles.icon}>
        <iconify-icon icon="material-symbols:lock-reset" width="48" height="48" />
      </div>
      <h1 className={styles.title}>نسيت كلمة المرور</h1>

      {sent ? (
        <>
          <div className={styles.success}>
            تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني.
            تحقق من صندوق الوارد.
          </div>
          <a href="/auth/login" className={styles.backLink}>
            &rarr; العودة لتسجيل الدخول
          </a>
        </>
      ) : (
        <>
          <p className={styles.subtitle}>
            أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة تعيين كلمة المرور
          </p>

          <form onSubmit={handleSubmit} className={styles.form}>
            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.field}>
              <label htmlFor="email" className={styles.label}>البريد الإلكتروني</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={styles.input}
                placeholder="name@example.com"
                dir="ltr"
                required
              />
            </div>

            <button type="submit" className={styles.button} disabled={loading}>
              {loading ? 'جاري الإرسال...' : 'إرسال رابط إعادة التعيين'}
            </button>
          </form>

          <a href="/auth/login" className={styles.backLink}>
            &rarr; العودة لتسجيل الدخول
          </a>
        </>
      )}
    </CenteredCardLayout>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CenteredCardLayout } from '@/components/ui/CenteredCardLayout/CenteredCardLayout';
import { passwordStrengthSchema } from '@/lib/profile/validation';
import {
  preloadZxcvbn,
  checkPasswordStrength,
} from '@/lib/profile/password-strength';
import { usePasswordStrength } from '@/hooks/usePasswordStrength';
import { RequirementsList, StrengthMeter } from '@/components/ui/PasswordStrength';
import styles from './reset-password.module.css';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  const { requirements, score, label, feedback } = usePasswordStrength(newPassword, email);
  const allRequirementsMet = requirements.every((r) => r.met);

  // Check session on mount
  useEffect(() => {
    preloadZxcvbn();
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace('/auth/forgot-password');
      } else {
        setEmail(data.user.email ?? '');
        setReady(true);
      }
    });
  }, [router]);

  const clearMessages = useCallback(() => {
    setError('');
    setFieldErrors({});
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    // Structural validation
    const result = passwordStrengthSchema.safeParse(newPassword);
    if (!result.success) {
      const msg = result.error.issues[0]?.message;
      if (msg) setFieldErrors({ newPassword: msg });
      return;
    }

    if (newPassword !== confirmPassword) {
      setFieldErrors({ confirmPassword: 'كلمتا المرور غير متطابقتين' });
      return;
    }

    // zxcvbn check
    const strength = checkPasswordStrength(newPassword, [email].filter(Boolean));
    if (strength === null) {
      setError('جاري التحميل، حاول مرة أخرى');
      return;
    }
    if (strength.score < 3) {
      setError(strength.feedback[0] || 'كلمة المرور ضعيفة، اختر كلمة مرور أقوى');
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
      if (updateErr) {
        setError(updateErr.message);
        return;
      }
      await supabase.auth.signOut();
      setDone(true);
    } catch {
      setError('حدث خطأ أثناء إعادة تعيين كلمة المرور');
    } finally {
      setLoading(false);
    }
  }, [newPassword, confirmPassword, email, clearMessages]);

  const canSubmit =
    allRequirementsMet &&
    (score === null || score >= 3) &&
    confirmPassword.length > 0 &&
    newPassword === confirmPassword;

  if (!ready && !done) {
    return (
      <CenteredCardLayout>
        <div className={styles.loading}>جاري التحميل...</div>
      </CenteredCardLayout>
    );
  }

  return (
    <CenteredCardLayout>
      <div className={styles.icon}>
        <iconify-icon icon="material-symbols:lock-reset" width="48" height="48" />
      </div>
      <h1 className={styles.title}>إعادة تعيين كلمة المرور</h1>

      {done ? (
        <>
          <div className={styles.success}>
            تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.
          </div>
          <a href="/auth/login" className={styles.backLink}>
            &rarr; تسجيل الدخول
          </a>
        </>
      ) : (
        <>
          <p className={styles.subtitle}>
            أدخل كلمة المرور الجديدة
          </p>

          <form onSubmit={handleSubmit} className={styles.form}>
            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.field}>
              <label htmlFor="new-password" className={styles.label}>كلمة المرور الجديدة</label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); clearMessages(); }}
                className={`${styles.input} ${fieldErrors.newPassword ? styles.inputError : ''}`}
                placeholder="٨ أحرف على الأقل"
                maxLength={256}
                disabled={loading}
                autoComplete="new-password"
                autoFocus
              />
              {fieldErrors.newPassword && (
                <span className={styles.fieldError}>{fieldErrors.newPassword}</span>
              )}

              {newPassword.length > 0 && (
                <>
                  <RequirementsList requirements={requirements} />
                  <StrengthMeter score={score} label={label} feedback={feedback} />
                </>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor="confirm-password" className={styles.label}>تأكيد كلمة المرور</label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); clearMessages(); }}
                className={`${styles.input} ${fieldErrors.confirmPassword ? styles.inputError : ''}`}
                placeholder="أعد إدخال كلمة المرور الجديدة"
                maxLength={256}
                disabled={loading}
                autoComplete="new-password"
              />
              {fieldErrors.confirmPassword && (
                <span className={styles.fieldError}>{fieldErrors.confirmPassword}</span>
              )}
            </div>

            <button type="submit" className={styles.button} disabled={!canSubmit || loading}>
              {loading ? 'جاري الحفظ...' : 'حفظ كلمة المرور الجديدة'}
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

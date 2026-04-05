'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { validateRedirectPath } from '@/lib/auth/validate-redirect';
import { passwordStrengthSchema } from '@/lib/profile/validation';
import { preloadZxcvbn, checkPasswordStrength } from '@/lib/profile/password-strength';
import { CenteredCardLayout } from '@/components/ui/CenteredCardLayout';
import styles from '../auth.module.css';

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const searchParams = useSearchParams();
  const next = validateRedirectPath(searchParams.get('next'));
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { preloadZxcvbn(); }, []);

  async function handleGoogleSignup() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const passwordResult = passwordStrengthSchema.safeParse(password);
    if (!passwordResult.success) {
      setError(passwordResult.error.issues[0].message);
      setLoading(false);
      return;
    }

    const strength = checkPasswordStrength(password, [email, displayName].filter(Boolean));
    if (strength === null) {
      setError('جاري التحميل، حاول مرة أخرى');
      setLoading(false);
      return;
    }
    if (strength.score < 3) {
      setError(strength.feedback[0] || 'كلمة المرور ضعيفة، اختر كلمة مرور أقوى');
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Sync user if session is available
    // (email confirmation may prevent immediate session)
    if (data.session) {
      await fetch('/api/auth/sync-user', {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
    }

    window.location.href = next;
  }

  return (
    <CenteredCardLayout>
      <div className={styles.icon}>
        <iconify-icon icon="material-symbols:account-tree" width="48" height="48" />
      </div>
      <h1 className={styles.title}>إنشاء حساب</h1>
      <p className={styles.subtitle}>سجّل حساباً جديداً في منصة سلالة</p>

      <form onSubmit={handleSubmit} className={styles.form}>
        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.field}>
          <label htmlFor="displayName" className={styles.label}>الاسم</label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={styles.input}
            placeholder="الاسم الكامل"
            required
          />
        </div>

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

        <div className={styles.field}>
          <label htmlFor="password" className={styles.label}>كلمة المرور</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={styles.input}
            placeholder="٨ أحرف على الأقل"
            dir="ltr"
            minLength={8}
            required
          />
        </div>

        <button type="submit" className={styles.button} disabled={loading}>
          {loading ? 'جاري التسجيل...' : 'إنشاء حساب'}
        </button>
      </form>

      <div className={styles.divider}>
        <span className={styles.dividerText}>أو</span>
      </div>

      <button
        type="button"
        className={styles.googleButton}
        onClick={handleGoogleSignup}
      >
        <svg className={styles.googleIcon} viewBox="0 0 24 24" width="20" height="20">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        التسجيل بحساب Google
      </button>

      <p className={styles.switchLink}>
        لديك حساب بالفعل؟{' '}
        <a href={`/auth/login${next !== '/workspaces' ? `?next=${encodeURIComponent(next)}` : ''}`}>تسجيل الدخول</a>
      </p>
    </CenteredCardLayout>
  );
}

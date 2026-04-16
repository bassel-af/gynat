'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { validateRedirectPath } from '@/lib/auth/validate-redirect';
import { CenteredCardLayout } from '@/components/ui/CenteredCardLayout';
import { AcknowledgmentModal } from '@/components/AcknowledgmentModal/AcknowledgmentModal';
import styles from '../auth.module.css';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const next = validateRedirectPath(searchParams.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginMode, setLoginMode] = useState<'password' | 'magiclink'>('password');
  const [magicLinkStatus, setMagicLinkStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  async function handleGoogleLogin() {
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

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Sync user to public.users table
    if (data.session) {
      await fetch('/api/auth/sync-user', {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
    }

    window.location.href = next;
  }

  // NOTE: signInWithOtp creates a new GoTrue account if the email doesn't exist.
  // The account is passwordless and only activates after the user clicks the link.
  // This is a deliberate trade-off — it prevents email enumeration at the cost of
  // potential ghost accounts. Users can later set a password via forgot-password.
  async function sendMagicLink() {
    setError('');
    setMagicLinkStatus('sending');

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (error) {
      setError(error.message);
      setMagicLinkStatus('idle');
      return;
    }

    setMagicLinkStatus('sent');
    setResendCooldown(30);
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    await sendMagicLink();
  }

  return (
    <CenteredCardLayout>
      <AcknowledgmentModal />
      <div className={styles.icon}>
        <iconify-icon icon="material-symbols:account-tree" width="48" height="48" />
      </div>
      <h1 className={styles.title}>تسجيل الدخول</h1>
      <p className={styles.subtitle}>
        {loginMode === 'password'
          ? 'أدخل بياناتك للوصول إلى منصة سلالة'
          : 'أدخل بريدك الإلكتروني للوصول إلى منصة سلالة'}
      </p>

      {loginMode === 'password' ? (
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

          <div className={styles.field}>
            <label htmlFor="password" className={styles.label}>كلمة المرور</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              placeholder="••••••••"
              dir="ltr"
              required
            />
            <a
              href="/auth/forgot-password"
              className={styles.forgotLink}
            >
              نسيت كلمة المرور؟
            </a>
          </div>

          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? 'جاري الدخول...' : 'دخول'}
          </button>
        </form>
      ) : magicLinkStatus === 'sent' ? (
        <div>
          <div className={styles.successMessage}>
            تم إرسال رابط الدخول إلى بريدك الإلكتروني. تحقق من صندوق الوارد.
          </div>
          <button
            type="button"
            className={styles.resendLink}
            aria-disabled={resendCooldown > 0 ? 'true' : undefined}
            onClick={() => {
              if (resendCooldown > 0) return;
              sendMagicLink();
            }}
          >
            أرسل مرة أخرى
          </button>
        </div>
      ) : (
        <form onSubmit={handleMagicLink} className={styles.form}>
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

          <button
            type="submit"
            className={styles.button}
            disabled={magicLinkStatus === 'sending'}
          >
            {magicLinkStatus === 'sending' ? 'جاري الإرسال...' : 'إرسال رابط الدخول'}
          </button>
        </form>
      )}

      <button
        type="button"
        className={styles.modeSwitch}
        onClick={() => {
          setLoginMode(loginMode === 'password' ? 'magiclink' : 'password');
          setError('');
          setMagicLinkStatus('idle');
        }}
      >
        {loginMode === 'password'
          ? 'الدخول برابط سريع بدون كلمة مرور'
          : 'الدخول بكلمة المرور'}
      </button>

      <div className={styles.divider}>
        <span className={styles.dividerText}>أو</span>
      </div>

      <button
        type="button"
        className={styles.googleButton}
        onClick={handleGoogleLogin}
      >
        <svg className={styles.googleIcon} viewBox="0 0 24 24" width="20" height="20">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        تسجيل الدخول بحساب Google
      </button>

      <p className={styles.switchLink}>
        ليس لديك حساب؟{' '}
        <a href={`/auth/signup${next !== '/workspaces' ? `?next=${encodeURIComponent(next)}` : ''}`}>إنشاء حساب</a>
      </p>
    </CenteredCardLayout>
  );
}

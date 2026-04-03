'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Spinner } from '@/components/ui/Spinner';
import styles from './confirm.module.css';

/**
 * Confirmation states:
 * - loading: initial state while processing the URL fragment
 * - first-confirm: first of two email-change confirmations accepted
 * - email-changed: both email-change confirmations complete (has session)
 * - general-success: other auth confirmation (signup, recovery) complete
 * - error: confirmation failed
 */
type ConfirmState = 'loading' | 'first-confirm' | 'email-changed' | 'general-success' | 'error';

function SuccessIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

/**
 * Handles auth confirmation redirects from GoTrue's /verify endpoint.
 *
 * GoTrue redirects here with auth tokens in the URL fragment (#access_token=...).
 * Fragments are invisible to the server, so this must be a client-side page.
 * The Supabase browser client detects the fragment and establishes the session.
 * After the session is established, we sync the user and redirect.
 */
export default function AuthConfirmPage() {
  const [state, setState] = useState<ConfirmState>('loading');
  const [countdown, setCountdown] = useState(3);
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    async function handleConfirmation() {
      const supabase = createClient();
      const hash = window.location.hash;
      const params = new URLSearchParams(hash.substring(1));

      // Check for partial confirmation first (dual email change flow)
      // GoTrue sends #message=... for the first confirmation
      if (hash.includes('message=')) {
        const message = params.get('message');
        if (message?.includes('Confirmation link accepted')) {
          setState('first-confirm');
          return;
        }
      }

      // Try to establish session from fragment tokens
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        setState('error');
        return;
      }

      // Session established -- sync user to DB
      try {
        const { apiFetch } = await import('@/lib/api/client');
        await apiFetch('/api/auth/sync-user', { method: 'POST' });
      } catch {
        // Non-blocking -- user sync can happen on next login
      }

      // Determine the confirmation type
      const type = params.get('type');
      if (type === 'email_change') {
        setState('email-changed');
      } else {
        setState('general-success');
      }
    }

    handleConfirmation();
  }, []);

  // Auto-redirect countdown for terminal success states
  useEffect(() => {
    if (state !== 'email-changed' && state !== 'general-success') return;

    const target = state === 'email-changed'
      ? '/dashboard/profile?email_changed=true'
      : '/dashboard';

    if (countdown <= 0) {
      window.location.href = target;
      return;
    }

    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [state, countdown]);

  return (
    <main className={styles.container}>
      <div className={styles.card}>
        {/* Brand */}
        <div className={styles.brand}>
          <div className={styles.brandIcon} aria-hidden="true">س</div>
          <h2 className={styles.brandName}>سلالة</h2>
        </div>

        {/* Loading */}
        {state === 'loading' && (
          <div className={styles.loadingState}>
            <Spinner size="lg" />
            <p className={styles.loadingText}>جاري التأكيد...</p>
          </div>
        )}

        {/* First of two email-change confirmations */}
        {state === 'first-confirm' && (
          <>
            <div className={`${styles.statusIcon} ${styles.statusIconSuccess}`} aria-hidden="true">
              <SuccessIcon />
            </div>
            <h1 className={styles.title}>تم تأكيد الرابط الأول بنجاح</h1>
            <p className={styles.description}>
              تحقق من صندوق الوارد للبريد الآخر واضغط على رابط التأكيد لإتمام تغيير البريد الإلكتروني
            </p>
            <Link href="/dashboard/profile" className={styles.link}>
              العودة إلى الملف الشخصي
            </Link>
          </>
        )}

        {/* Email change complete */}
        {state === 'email-changed' && (
          <>
            <div className={`${styles.statusIcon} ${styles.statusIconSuccess}`} aria-hidden="true">
              <SuccessIcon />
            </div>
            <h1 className={styles.title}>تم تغيير بريدك الإلكتروني بنجاح</h1>
            <p className={styles.description}>
              سيتم توجيهك إلى صفحة الملف الشخصي
            </p>
            <p className={styles.countdown}>
              {countdown > 0 ? `التوجيه خلال ${countdown} ثوانٍ...` : 'جاري التوجيه...'}
            </p>
            <Link href="/dashboard/profile?email_changed=true" className={styles.link}>
              الذهاب الآن
            </Link>
          </>
        )}

        {/* General auth success (signup, recovery) */}
        {state === 'general-success' && (
          <>
            <div className={`${styles.statusIcon} ${styles.statusIconSuccess}`} aria-hidden="true">
              <SuccessIcon />
            </div>
            <h1 className={styles.title}>تم التأكيد بنجاح</h1>
            <p className={styles.description}>
              سيتم توجيهك إلى لوحة التحكم
            </p>
            <p className={styles.countdown}>
              {countdown > 0 ? `التوجيه خلال ${countdown} ثوانٍ...` : 'جاري التوجيه...'}
            </p>
            <Link href="/dashboard" className={styles.link}>
              الذهاب الآن
            </Link>
          </>
        )}

        {/* Error */}
        {state === 'error' && (
          <>
            <div className={`${styles.statusIcon} ${styles.statusIconError}`} aria-hidden="true">
              <ErrorIcon />
            </div>
            <h1 className={styles.title}>فشل في تأكيد الرابط</h1>
            <p className={styles.description}>
              قد يكون الرابط منتهي الصلاحية أو غير صالح. يرجى المحاولة مرة أخرى.
            </p>
            <Link href="/auth/login" className={styles.link}>
              تسجيل الدخول
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

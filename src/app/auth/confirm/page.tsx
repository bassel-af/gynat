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

// Capture hash IMMEDIATELY at module load before Supabase's createBrowserClient
// auto-detects and consumes #access_token fragments.
const initialHash = typeof window !== 'undefined' ? window.location.hash : '';
const initialSearch = typeof window !== 'undefined' ? window.location.search : '';

/**
 * Handles auth confirmation redirects from GoTrue's /verify endpoint.
 *
 * GoTrue can redirect here in two ways depending on the auth flow:
 * 1. Implicit: tokens in hash fragment (#access_token=...&type=email_change)
 * 2. PKCE: authorization code in query string (?code=xxx)
 *
 * For email change specifically, GoTrue uses dual confirmation (both old and
 * new email addresses). The first confirmation redirects with #message=...,
 * the second redirects with tokens (implicit) or code (PKCE).
 *
 * IMPORTANT: When PKCE is used, the code_verifier is stored in the browser
 * that initiated the email change. If the second confirmation link is opened
 * in a different browser, code exchange will fail. However, the email change
 * is already complete on GoTrue's side, so we show success regardless.
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
      const hash = initialHash;
      const search = initialSearch;

      console.log('[auth/confirm] Starting confirmation handler');
      console.log('[auth/confirm] Hash:', hash ? hash.substring(0, 80) + '...' : '(empty)');
      console.log('[auth/confirm] Search:', search || '(empty)');
      console.log('[auth/confirm] Full URL:', window.location.href);

      const hashParams = new URLSearchParams(hash.substring(1));
      const searchParams = new URLSearchParams(search.substring(1));

      // ────────────────────────────────────────────────────────
      // 1. Check for partial confirmation (first of dual email change)
      //    GoTrue sends #message=... for the first confirmation.
      //    Also check query params as a fallback.
      // ────────────────────────────────────────────────────────
      const message = hashParams.get('message') || searchParams.get('message');
      if (message) {
        console.log('[auth/confirm] Message detected:', message);
        if (message.includes('Confirmation link accepted')) {
          console.log('[auth/confirm] -> first-confirm state');
          setState('first-confirm');
          return;
        }
      }

      // ────────────────────────────────────────────────────────
      // 2. Check for implicit grant tokens in hash fragment
      //    GoTrue sends #access_token=...&type=email_change
      // ────────────────────────────────────────────────────────
      const hashAccessToken = hashParams.get('access_token');
      const hashType = hashParams.get('type');

      if (hashAccessToken && hashType) {
        console.log('[auth/confirm] Implicit grant detected. type:', hashType);
        const refreshToken = hashParams.get('refresh_token');
        if (refreshToken) {
          try {
            console.log('[auth/confirm] Attempting setSession with hash tokens');
            await supabase.auth.setSession({
              access_token: hashAccessToken,
              refresh_token: refreshToken,
            });
            console.log('[auth/confirm] setSession succeeded, syncing user');
            await syncUser();
          } catch (e) {
            console.warn('[auth/confirm] setSession/sync failed (non-blocking):', e);
          }
        }
        setState(hashType === 'email_change' ? 'email-changed' : 'general-success');
        console.log('[auth/confirm] -> state:', hashType === 'email_change' ? 'email-changed' : 'general-success');
        return;
      }

      // ────────────────────────────────────────────────────────
      // 3. Check for PKCE authorization code in query string
      //    GoTrue sends ?code=xxx when PKCE flow was used.
      //
      //    The Supabase client's _initialize() also detects ?code= and
      //    tries to exchange it (using the code_verifier from localStorage).
      //    - In the browser that initiated the change: _initialize()
      //      succeeds, establishes session, and consumes the code.
      //    - In a different browser: _initialize() fails silently (no
      //      code_verifier), so we fall through here.
      //
      //    Either way, the email change is already complete on GoTrue's
      //    side — we just need to show success.
      // ────────────────────────────────────────────────────────
      const code = searchParams.get('code');
      if (code) {
        console.log('[auth/confirm] PKCE code detected in query string');

        // Wait for _initialize() to finish — it may have already exchanged
        // the code if the code_verifier was in this browser's storage.
        // We use getSession() which internally awaits initializePromise.
        const { data: { session: pkceSession } } = await supabase.auth.getSession();
        console.log('[auth/confirm] After init, session:', pkceSession ? 'yes' : 'no');

        if (pkceSession) {
          // _initialize() succeeded in exchanging the code.
          console.log('[auth/confirm] Session established via PKCE, user email:', pkceSession.user?.email);
          await syncUser();
          setState('email-changed');
          console.log('[auth/confirm] -> email-changed state (PKCE session established)');
          return;
        }

        // No session — _initialize() couldn't exchange the code (different
        // browser, no code_verifier). The email change is complete on
        // GoTrue's side regardless. Show success.
        console.log('[auth/confirm] No session after PKCE (different browser). Showing success anyway.');
        setState('email-changed');
        return;
      }

      // ────────────────────────────────────────────────────────
      // 4. Check for GoTrue error in hash or query params
      // ────────────────────────────────────────────────────────
      const errorCode = hashParams.get('error_code') || searchParams.get('error_code');
      const errorDesc = hashParams.get('error_description') || searchParams.get('error_description');
      if (errorCode || errorDesc) {
        console.log('[auth/confirm] GoTrue error detected:', errorCode, errorDesc);
        setState('error');
        return;
      }

      // ────────────────────────────────────────────────────────
      // 5. Fallback: check existing session
      //    Handles direct navigation to /auth/confirm
      // ────────────────────────────────────────────────────────
      console.log('[auth/confirm] No tokens/code/message found, checking existing session');
      const { data: { session } } = await supabase.auth.getSession();
      console.log('[auth/confirm] Existing session:', session ? 'yes' : 'no');

      if (!session) {
        console.log('[auth/confirm] -> error state (no session, no tokens)');
        setState('error');
        return;
      }

      console.log('[auth/confirm] -> general-success (has existing session)');
      setState('general-success');
    }

    handleConfirmation();
  }, []);

  // Auto-redirect countdown for success states
  useEffect(() => {
    if (state !== 'email-changed' && state !== 'general-success' && state !== 'first-confirm') return;

    const target = state === 'first-confirm'
      ? '/profile'
      : state === 'email-changed'
        ? '/profile?email_changed=true'
        : '/workspaces';

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
          <div className={styles.brandIcon} aria-hidden="true">ج</div>
          <h2 className={styles.brandName}>جينات</h2>
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
            <Link href="/profile" className={styles.link}>
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
            <Link href="/profile?email_changed=true" className={styles.link}>
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
              سيتم توجيهك إلى المساحات
            </p>
            <p className={styles.countdown}>
              {countdown > 0 ? `التوجيه خلال ${countdown} ثوانٍ...` : 'جاري التوجيه...'}
            </p>
            <Link href="/workspaces" className={styles.link}>
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

/** Best-effort sync of the GoTrue user to public.users */
async function syncUser() {
  try {
    const { apiFetch } = await import('@/lib/api/client');
    const res = await apiFetch('/api/auth/sync-user', { method: 'POST' });
    console.log('[auth/confirm] sync-user response:', res.status);
  } catch (e) {
    console.warn('[auth/confirm] sync-user failed (non-blocking):', e);
  }
}

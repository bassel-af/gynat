'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AcknowledgmentModal } from '@/components/AcknowledgmentModal/AcknowledgmentModal';
import styles from './page.module.css';

// Capture the hash IMMEDIATELY at module load, before Supabase's
// createBrowserClient auto-detects and consumes #access_token fragments.
const initialHash = typeof window !== 'undefined' ? window.location.hash : '';
const initialSearch = typeof window !== 'undefined' ? window.location.search : '';

export default function Home() {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    console.log('[root] Page loaded');
    console.log('[root] Hash:', initialHash ? initialHash.substring(0, 80) + '...' : '(empty)');
    console.log('[root] Search:', initialSearch || '(empty)');

    // GoTrue redirects here with auth tokens in the URL fragment after email
    // verification (e.g., email change, signup confirmation). Detect and
    // forward to /auth/confirm which handles the fragment client-side.

    // Case 1: Implicit grant — tokens or auth messages in hash fragment
    if (initialHash && (initialHash.includes('access_token=') || initialHash.includes('message=') || initialHash.includes('error'))) {
      console.log('[root] Forwarding hash fragment to /auth/confirm');
      window.location.href = '/auth/confirm' + initialHash;
      return;
    }

    // Case 2: PKCE — authorization code in query string
    const rootSearchParams = new URLSearchParams(initialSearch);
    if (rootSearchParams.has('code')) {
      console.log('[root] Forwarding PKCE code to /auth/confirm');
      window.location.href = '/auth/confirm' + initialSearch;
      return;
    }

    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        window.location.href = '/workspaces';
      } else {
        setChecking(false);
      }
    });
  }, []);

  if (checking) {
    return null;
  }

  return (
    <main className={styles.container}>
      <AcknowledgmentModal />
      <div className={styles.card}>
        <div className={styles.icon}>
          <iconify-icon icon="material-symbols:family-restroom" width="48" height="48" />
        </div>
        <h1 className={styles.title}>شجرة العائلة</h1>
        <p className={styles.subtitle}>
          أنشئ شجرة عائلتك وشاركها مع أفراد عائلتك
        </p>
        <a href="/auth/signup" className={styles.signupButton}>
          إنشاء حساب جديد
        </a>
        <p className={styles.switchLink}>
          لديك حساب؟{' '}
          <a href="/auth/login">تسجيل الدخول</a>
        </p>
        <div className={styles.divider}>
          <span className={styles.dividerDot} />
        </div>
        <p className={styles.contact}>
          <span className={styles.contactLabel}>تواصل معنا</span>
          <a href="mailto:contact@autoflowa.com">contact@autoflowa.com</a>
        </p>
      </div>
    </main>
  );
}

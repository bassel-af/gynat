'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import styles from './page.module.css';

export default function Home() {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // GoTrue redirects here with auth tokens in the URL fragment after email
    // verification (e.g., email change, signup confirmation). Detect and
    // forward to /auth/confirm which handles the fragment client-side.
    const hash = window.location.hash;
    if (hash && (hash.includes('access_token=') || hash.includes('message='))) {
      window.location.href = '/auth/confirm' + hash;
      return;
    }

    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        window.location.href = '/dashboard';
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
      <div className={styles.card}>
        <div className={styles.icon}>
          <iconify-icon icon="material-symbols:family-restroom" width="48" height="48" />
        </div>
        <h1 className={styles.title}>شجرة العائلة</h1>
        <p className={styles.subtitle}>
          يمكنك الوصول إلى شجرة عائلتك من خلال الرابط المخصص لها
        </p>
        <div className={styles.divider}>
          <span className={styles.dividerDot} />
        </div>
        <p className={styles.contact}>
          <span className={styles.contactLabel}>تواصل معنا</span>
          <a href="mailto:contact@autoflowa.com">contact@autoflowa.com</a>
        </p>
        <p className={styles.switchLink}>
          <a href="/auth/login">تسجيل الدخول</a>
        </p>
      </div>
    </main>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AcknowledgmentModal } from '@/components/AcknowledgmentModal/AcknowledgmentModal';
import { FigureCluster } from '@/components/heritage/FigureCluster';
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

    if (initialHash && (initialHash.includes('access_token=') || initialHash.includes('message=') || initialHash.includes('error'))) {
      console.log('[root] Forwarding hash fragment to /auth/confirm');
      window.location.href = '/auth/confirm' + initialHash;
      return;
    }

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
    <main className={styles.root}>
      <AcknowledgmentModal />

      <div className={styles.page}>
        <nav className={styles.nav}>
          <div className={styles.wordmark}>سُلالَة</div>
          <div className={styles.navLinks}>
            <a href="/islamic-gedcom" className={styles.navLink}>مرجع GEDCOM الإسلامي</a>
            <a href="/policy" className={styles.navLink}>السياسة</a>
            <a href="/auth/login" className={styles.navLoginBtn}>تسجيل الدخول</a>
          </div>
        </nav>

        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <span className={styles.eyebrow}>نَسَبٌ موثَّق · ذاكرةٌ مصونة</span>
            <h1 className={styles.title}>
              شَجَرةُ عائلتك
              <span className={styles.titleAccent}>محفوظةٌ كما تستحق</span>
            </h1>
            <p className={styles.lead}>
              منصّةٌ راقية لتوثيق الأنساب، تحفظ أسماء الأجداد وحكاياتهم،
              وتصِل أبناء الأسرة عبر الأجيال في تصميمٍ يليق بتراثهم.
            </p>
            <div className={styles.actions}>
              <a href="/auth/signup" className={styles.btnPrimary}>إنشاء حساب جديد</a>
              <a href="/auth/login" className={styles.btnGhost}>لديّ حسابٌ بالفعل</a>
            </div>
          </div>

          <div className={styles.showcase}>
            <div className={styles.ring} />
            <div className={styles.medallion}>
              <div className={styles.figures}>
                <FigureCluster variant="medallion" />
              </div>
              <div className={styles.medallionLabel}>ثلاثة أجيال · بيتٌ واحد</div>
            </div>
            <div className={`${styles.chip} ${styles.chipTop}`}>
              <div className={styles.chipLabel}>حفظٌ آمن</div>
              <div className={styles.chipValue}>مُشفَّر · طبقتان</div>
            </div>
            <div className={`${styles.chip} ${styles.chipBottom}`}>
              <div className={styles.chipLabel}>تقويم هجري</div>
              <div className={styles.chipValue}>مُدمَج</div>
            </div>
          </div>
        </section>

        <footer className={styles.footer}>
          <div>
            <a href="mailto:contact@autoflowa.com">contact@autoflowa.com</a>
          </div>
          <div className={styles.footerAyah}>﴾ وَمِنْ آيَاتِهِ أَنْ خَلَقَ لَكُم مِّنْ أَنفُسِكُمْ أَزْوَاجًا ﴿</div>
        </footer>
      </div>
    </main>
  );
}

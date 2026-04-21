/**
 * Public navigation bar for standalone reference pages (/policy, /islamic-gedcom).
 *
 * Sticky top bar with:
 *   - wordmark "جينات" on the visual right (first in RTL reading order) → /
 *   - compact "back to home" chip in the center → /
 *   - cross-link to the *other* reference page (never self-link) in the center
 *   - outlined "تسجيل الدخول" pill on the visual left → /auth/login
 *
 * Server-component: no state, no hooks.
 */
import Link from 'next/link';
import styles from './PublicNav.module.css';

type PublicNavProps = {
  currentPage: 'policy' | 'islamic-gedcom';
};

const CROSS_LINK = {
  policy: { href: '/islamic-gedcom', label: 'مرجع GEDCOM الإسلامي' },
  'islamic-gedcom': { href: '/policy', label: 'السياسة' },
} as const;

export function PublicNav({ currentPage }: PublicNavProps) {
  const cross = CROSS_LINK[currentPage];

  return (
    <nav className={styles.nav} aria-label="التنقل الرئيسي">
      <div className={styles.inner}>
        <Link href="/" className={styles.wordmark} aria-label="جينات — الصفحة الرئيسية">
          <span className={styles.wordmarkText}>جينات</span>
        </Link>

        <div className={styles.links}>
          <Link href="/" className={styles.backChip}>
            <span className={styles.backArrow} aria-hidden="true">
              →
            </span>
            <span>الرئيسية</span>
          </Link>
          <Link href={cross.href} className={styles.crossLink}>
            {cross.label}
          </Link>
        </div>

        <Link href="/auth/login" className={styles.loginBtn}>
          تسجيل الدخول
        </Link>
      </div>
    </nav>
  );
}

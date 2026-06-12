import { AcknowledgmentModal } from '@/components/AcknowledgmentModal/AcknowledgmentModal';
import { FigureCluster } from '@/components/heritage/FigureCluster';
import LandingRedirector from './LandingRedirector';
import styles from './page.module.css';

export default function Home() {
  return (
    <main className={styles.root}>
      <AcknowledgmentModal />
      <LandingRedirector />

      <div className={styles.page}>
        <nav className={styles.nav}>
          <div className={styles.wordmark}>جينات</div>
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
              <div className={styles.medallionLabel}>جذورٌ راسخة · فروعٌ ممتدّة</div>
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
            <a href="mailto:contact@gynat.com">contact@gynat.com</a>
          </div>
          <div className={styles.footerMobileLink}>
            <a href="/islamic-gedcom">مرجع GEDCOM الإسلامي</a>
          </div>
          <div className={styles.footerAyah}>﴿ وَمِنْ آيَاتِهِ أَنْ خَلَقَ لَكُم مِّنْ أَنفُسِكُمْ أَزْوَاجًا ﴾</div>
        </footer>
      </div>
    </main>
  );
}

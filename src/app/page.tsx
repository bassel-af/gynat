import { AcknowledgmentModal } from '@/components/AcknowledgmentModal/AcknowledgmentModal';
import { FigureCluster } from '@/components/heritage/FigureCluster';
import LandingRedirector from './LandingRedirector';
import { SITE_CONTACT_EMAIL } from '@/lib/site';
import styles from './page.module.css';

const faqItems = [
  {
    q: 'هل بياناتي آمنة؟',
    a: 'نعم. بيانات عائلتك خاصّةٌ تماماً ولا تُشارَك مع أيّ طرف. نحفظها بطبقتين من التشفير، وأنت وحدك من يقرّر مَن يصل إلى شجرة العائلة.',
  },
  {
    q: 'هل يدعم التقويم الهجري؟',
    a: 'نعم. يمكنك تسجيل تواريخ الميلاد والوفاة والزواج بالتقويم الهجري والميلادي معاً، واختيار التقويم الذي يظهر لك افتراضياً.',
  },
  {
    q: 'هل يمكنني استيراد ملف GEDCOM؟',
    a: 'نعم. يدعم جينات استيراد ملفات GEDCOM، كما يمكنك تصدير شجرة نسب عائلتك بصيغة GEDCOM في أيّ وقت. للتفاصيل التقنية راجع مرجع GEDCOM الإسلامي.',
  },
  {
    q: 'ما الفرق بين النسب والرَضاعة في المنصّة؟',
    a: 'النسب هو صلة القرابة بالدم التي تُبنى عليها شجرة العائلة. أمّا الرَضاعة فهي علاقةٌ شرعيةٌ منفصلة توثّقها المنصّة دون أن تُغيّر شجرة النسب، فتبقى صلة الرحم من الرضاعة محفوظةً إلى جانب النسب.',
  },
  {
    q: 'هل التطبيق مجاني؟',
    a: 'نعم، استخدام جينات مجاني بالكامل.',
  },
  {
    q: 'هل يمكنني نشر عائلتي للعموم؟',
    a: 'لا. شجرة عائلتك خاصّةٌ بشكلٍ افتراضي ولا تظهر لأحدٍ خارج من تدعوهم أنت. ونعمل حالياً على إضافة خيارٍ اختياريّ — قريباً بإذن الله — يتيح لمن يرغب نشر العائلات التاريخية للعموم.',
  },
  {
    q: 'هل يمكنني تصدير بياناتي إذا أردت؟',
    a: 'نعم. بياناتك ملكك دائماً، ويمكنك تصدير شجرة العائلة كاملةً بصيغة GEDCOM في أيّ وقت دون قيود.',
  },
] as const;

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqItems.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.a,
    },
  })),
};

const webApplicationSchema = {
  '@context': 'https://schema.org',
  // WebApplication: the SoftwareApplication subtype for browser-based apps that
  // aren't downloaded/installed (Google supports it for the software-app result).
  '@type': 'WebApplication',
  name: 'جينات',
  applicationCategory: 'LifestyleApplication',
  operatingSystem: 'All',
  browserRequirements: 'Requires a modern web browser with JavaScript enabled.',
  inLanguage: 'ar',
  url: 'https://gynat.com',
  description:
    'جينات منصّة عربية لبناء شجرة العائلة وتوثيق الأنساب عبر الأجيال، بدعم التقويم الهجري وتسجيل الرضاعة، مع تشفير مزدوج وصلاحيات مشاركة دقيقة تحفظ خصوصية بيانات العائلة.',
  // Genuinely free (matches FAQ "مجاني بالكامل") — truthful, not fabricated data.
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  publisher: {
    '@type': 'Organization',
    name: 'جينات',
    url: 'https://gynat.com',
  },
};

// Renders an FAQ answer, turning the GEDCOM-reference phrase into a link to the
// reference page. The answer strings stay plain text so the FAQPage JSON-LD
// above remains valid (structured data should not contain markup).
function renderFaqAnswer(answer: string) {
  const phrase = 'مرجع GEDCOM الإسلامي';
  const idx = answer.indexOf(phrase);
  if (idx === -1) return answer;
  return (
    <>
      {answer.slice(0, idx)}
      <a href="/islamic-gedcom" className={styles.inlineLink}>
        {phrase}
      </a>
      {answer.slice(idx + phrase.length)}
    </>
  );
}

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
            <a href={`mailto:${SITE_CONTACT_EMAIL}`}>{SITE_CONTACT_EMAIL}</a>
          </div>
          <div className={styles.footerMobileLink}>
            <a href="/islamic-gedcom">مرجع GEDCOM الإسلامي</a>
          </div>
          <div className={styles.footerAyah}>﴿ وَمِنْ آيَاتِهِ أَنْ خَلَقَ لَكُم مِّنْ أَنفُسِكُمْ أَزْوَاجًا ﴾</div>
        </footer>
      </div>

      <div className={styles.contentBand}>
        {/* ── Section A — لماذا جينات؟ ── */}
        <section className={styles.section} aria-labelledby="why-gynat">
          <h2 id="why-gynat" className={styles.sectionTitle}>لماذا جينات؟</h2>
          <p className={styles.sectionIntro}>
            جينات منصّةٌ عربيةٌ لبناء شجرة العائلة وتوثيق الأنساب، صُمّمت خصّيصاً
            لاحتياجات الأسرة العربية والمسلمة — من التقويم الهجري إلى علاقات
            الرَضاعة، مع حفظٍ آمنٍ يحترم خصوصية بياناتك.
          </p>

          <div className={styles.featureGrid}>
            <article className={styles.featureCard}>
              <h3 className={styles.cardTitle}>التقويم الهجري</h3>
              <p className={styles.cardText}>
                سجّل تواريخ الميلاد والوفاة والزواج بالتقويم الهجري والميلادي
                معاً، فتبقى تواريخ عائلتك موثّقةً كما اعتادها الأجداد.
              </p>
            </article>

            <article className={styles.featureCard}>
              <h3 className={styles.cardTitle}>الرَضاعة والنَسَب</h3>
              <p className={styles.cardText}>
                يوثّق <span className={styles.brand}>جينات</span> علاقات الرضاعة
                إلى جانب النسب، فتُحفظ صلة الرحم من الرضاعة كجزءٍ أصيلٍ من شجرة
                العائلة.
              </p>
            </article>

            <article className={styles.featureCard}>
              <h3 className={styles.cardTitle}>تشفير مزدوج وخصوصية تامة</h3>
              <p className={styles.cardText}>
                بيانات عائلتك خاصّةٌ ولا تُشارَك مع أحد. نحميها بطبقتين من
                التشفير. (وقريباً، بإذن الله، خيارٌ اختياريّ لنشر العائلات
                التاريخية للعموم لمن يرغب.)
              </p>
            </article>

            <article className={styles.featureCard}>
              <h3 className={styles.cardTitle}>صلاحيات المشاركة</h3>
              <p className={styles.cardText}>
                أنت تتحكّم بمن يرى ومن يُعدّل في شجرة العائلة، فرداً فرداً،
                فتبقى إدارة بيانات أسرتك بين يديك.
              </p>
            </article>

            <article className={styles.featureCard}>
              <h3 className={styles.cardTitle}>سجل التعديلات</h3>
              <p className={styles.cardText}>
                كلّ تغييرٍ في الشجرة محفوظٌ ومعروفٌ مَن أجراه ومتى، لتوثيق
                الأنساب بثقةٍ ودون فقدان أيّ معلومة.
              </p>
            </article>

            <article className={styles.featureCard}>
              <h3 className={styles.cardTitle}>استيراد وتصدير GEDCOM</h3>
              <p className={styles.cardText}>
                استورد سجلّاتك بصيغة GEDCOM، وصدّر شجرة نسب عائلتك متى شئت —
                بياناتك ملكك دائماً. تعرّف على{' '}
                <a href="/islamic-gedcom" className={styles.inlineLink}>
                  مرجع GEDCOM الإسلامي
                </a>
                .
              </p>
            </article>
          </div>
        </section>

        {/* ── Section B — كيف تعمل ── */}
        <section className={styles.section} aria-labelledby="how-it-works">
          <h2 id="how-it-works" className={styles.sectionTitle}>كيف تعمل</h2>

          <ol className={styles.steps}>
            <li className={styles.step}>
              <span className={styles.stepBadge} aria-hidden="true">١</span>
              <div className={styles.stepBody}>
                <h3 className={styles.cardTitle}>أنشئ مساحة لعائلتك</h3>
                <p className={styles.cardText}>
                  ابدأ بإنشاء حسابٍ مجاني، ثم أنشئ مساحةً خاصةً لعائلتك تكون
                  نقطة انطلاق شجرة العائلة.
                </p>
              </div>
            </li>

            <li className={styles.step}>
              <span className={styles.stepBadge} aria-hidden="true">٢</span>
              <div className={styles.stepBody}>
                <h3 className={styles.cardTitle}>ابنِ الشجرة أو استورد ملف GEDCOM</h3>
                <p className={styles.cardText}>
                  أضِف الأجداد والأبناء يدوياً خطوةً بخطوة، أو استورد ملف
                  GEDCOM جاهزاً لتبدأ توثيق الأنساب فوراً.
                </p>
              </div>
            </li>

            <li className={styles.step}>
              <span className={styles.stepBadge} aria-hidden="true">٣</span>
              <div className={styles.stepBody}>
                <h3 className={styles.cardTitle}>ادعُ أقاربك بالصلاحيات التي تختارها</h3>
                <p className={styles.cardText}>
                  ادعُ أفراد العائلة للمشاركة في بناء شجرة النسب، وحدّد لكلٍّ
                  منهم صلاحية المشاهدة أو التعديل كما تشاء.
                </p>
              </div>
            </li>
          </ol>
        </section>

        {/* ── Section B2 — مشاركة الفرع المشترك بين عائلتين (بعد "كيف تعمل") ── */}
        <section className={styles.section} aria-labelledby="branch-sharing">
          <h2 id="branch-sharing" className={styles.sectionTitle}>
            عائلتان تجمعهما قرابة؟ شاركوا الفرع المشترك
          </h2>

          <div className={styles.branchBand}>
            <p className={styles.branchLead}>
              حين تتّصل عائلتان بصِهرٍ أو قرابة، يكون لهما عادةً فرعٌ مشترك من
              الأجداد والأبناء. مع <span className={styles.brand}>جينات</span> لا
              حاجة لأن تُدخل كلّ عائلةٍ هذا الفرع من جديد: يكفي أن يشاركه مسؤول
              إحدى العائلتين، فيظهر في شجرة العائلة الأخرى مرتبطاً لا مكرَّراً.
            </p>

            <p className={styles.branchText}>
              كأنّكما تنظران إلى الغصن نفسه من شجرتين متجاورتين — غصنٌ واحد يراه
              الطرفان، وأيّ تحديثٍ عليه يظهر للعائلتين مباشرةً، فلا تتعارض
              الإصدارات.
            </p>

            <p className={styles.branchReassurance}>
              هذه المشاركة اختياريةٌ بالكامل ويتحكّم بها مسؤول العائلة وحده. لا
              شيء يصبح علنياً ولا قابلاً للبحث، ولا تُكشَف الشجرة كاملة — يُشارَك
              الفرع الذي تختاره أنت فقط وبالعمق المطلوب، مع العائلة التي تحدّدها
              أنت، ويمكن إيقاف
              الوصول متى شئت. تبقى بقيّة بيانات عائلتك خاصّةً كما هي دائماً.
            </p>
          </div>
        </section>

        {/* ── Section C — أسئلة شائعة ── */}
        <section className={styles.section} aria-labelledby="faq">
          <h2 id="faq" className={styles.sectionTitle}>أسئلة شائعة</h2>

          <div className={styles.faqList}>
            {faqItems.map((item) => (
              <div className={styles.faqItem} key={item.q}>
                <h3 className={styles.faqQuestion}>{item.q}</h3>
                <p className={styles.faqAnswer}>{renderFaqAnswer(item.a)}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ── Section D — richer site-links footer ── */}
      <footer className={styles.siteFooter}>
        <div className={styles.contentBand}>
          <nav aria-label="روابط الموقع" className={styles.siteFooterNav}>
            <a href="/policy" className={styles.siteFooterLink}>السياسات</a>
            <a href="/islamic-gedcom" className={styles.siteFooterLink}>مرجع GEDCOM الإسلامي</a>
            <a href="/auth/login" className={styles.siteFooterLink}>تسجيل الدخول</a>
            <a href="/auth/signup" className={styles.siteFooterLink}>إنشاء حساب</a>
            <a href={`mailto:${SITE_CONTACT_EMAIL}`} className={styles.siteFooterLink}>{SITE_CONTACT_EMAIL}</a>
          </nav>
          <p className={styles.siteFooterBrand}>جينات — لتوثيق شجرة العائلة والأنساب</p>
        </div>
      </footer>

      {/*
        Native <script> (not next/script): in a Server Component this renders a
        literal, statically-present <script type="application/ld+json"> into the
        initial HTML so crawlers read the FAQPage without executing JS. next/script
        defers JSON-LD into the flight payload, which is not statically crawlable.
      */}
      <script
        id="faq-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        id="webapplication-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webApplicationSchema) }}
      />
    </main>
  );
}

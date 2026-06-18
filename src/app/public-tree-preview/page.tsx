'use client';

/**
 * Public Tree — STATIC, NON-FUNCTIONAL mockups.
 *
 * Purpose: confirm shared understanding of the Public Tree feature with the
 * product owner BEFORE any implementation. Nothing here is wired to data or
 * logic — every value is hard-coded placeholder content. Scoped to the
 * /public-tree-preview route (noindex + production guard in layout.tsx).
 *
 * Style: "jeweled heritage" (obsidian + emerald + gold, glass), matching the
 * canonical /design-preview prototype. RTL / Arabic throughout, plain language.
 */

import { FigureMan, FigureWoman, NodeFigure } from '@/components/heritage/FigureCluster';
import styles from './page.module.css';

// ---------------------------------------------------------------------------
// Placeholder tree nodes for the read-only public canvas
// ---------------------------------------------------------------------------

type Node = {
  id: string;
  name: string;
  years: string;
  gender: 'male' | 'female';
  x: number;
  y: number;
  patriarch?: boolean;
  selected?: boolean;
  living?: boolean;
  privatePerson?: boolean;
};

const canvasNodes: Node[] = [
  { id: 'p1', name: 'محمد السعيد', years: '١٨٧٠ – ١٩٤٥', gender: 'male', x: 50, y: 8, patriarch: true, selected: true },
  { id: 'p2', name: 'أحمد السعيد', years: '١٩٠٢ – ١٩٧٨', gender: 'male', x: 26, y: 40 },
  { id: 'w2', name: 'فاطمة الدبّاغ', years: '١٩٠٨ – ١٩٨٤', gender: 'female', x: 41, y: 40 },
  { id: 'p3', name: 'خالد السعيد', years: '١٩٠٦ – ١٩٨٢', gender: 'male', x: 64, y: 40 },
  { id: 'p4', name: 'يوسف السعيد', years: 'حيّ', gender: 'male', x: 16, y: 74, living: true },
  { id: 'p5', name: 'ليلى السعيد', years: 'حيّة', gender: 'female', x: 36, y: 74, living: true },
  { id: 'priv', name: 'فردٌ خاصّ', years: '—', gender: 'male', x: 60, y: 74, privatePerson: true },
  { id: 'p7', name: 'نور السعيد', years: 'حيّة', gender: 'female', x: 80, y: 74, living: true },
];

const canvasPaths = [
  'M 50 14 C 50 24, 33 30, 33 36',
  'M 50 14 C 50 24, 64 30, 64 36',
  'M 30 44 L 38 44',
  'M 33 48 C 33 60, 16 68, 16 70',
  'M 33 48 C 33 60, 36 68, 36 70',
  'M 64 48 C 64 60, 60 68, 60 70',
  'M 64 48 C 64 60, 80 68, 80 70',
];

const sidebarPeople = [
  { id: 's1', name: 'محمد السعيد', dates: '١٨٧٠ – ١٩٤٥', gender: 'male' as const, active: true },
  { id: 's2', name: 'أحمد بن محمد السعيد', dates: '١٩٠٢ – ١٩٧٨', gender: 'male' as const },
  { id: 's3', name: 'خالد بن محمد السعيد', dates: '١٩٠٦ – ١٩٨٢', gender: 'male' as const },
  { id: 's4', name: 'فاطمة الدبّاغ', dates: '١٩٠٨ – ١٩٨٤', gender: 'female' as const },
  { id: 's5', name: 'يوسف بن أحمد السعيد', dates: 'حيّ', gender: 'male' as const },
  { id: 's6', name: 'ليلى بنت أحمد السعيد', dates: 'حيّة', gender: 'female' as const },
];

// people for the publish checkpoint, grouped by household
const attentionPeople = [
  { id: 'a1', name: 'سامي السعيد', meta: 'بلا تاريخ ميلاد · بلا علامة وفاة', gender: 'male' as const },
  { id: 'a2', name: 'هدى السعيد', meta: 'بلا تاريخ ميلاد · بلا علامة وفاة', gender: 'female' as const },
];

const households = [
  {
    title: 'بيت أحمد السعيد',
    count: 3,
    people: [
      { id: 'h1', name: 'يوسف بن أحمد', meta: 'وُلد ١٩٧٢', gender: 'male' as const },
      { id: 'h2', name: 'ليلى بنت أحمد', meta: 'وُلدت ١٩٧٥', gender: 'female' as const },
      { id: 'h3', name: 'رنا بنت أحمد', meta: 'وُلدت ١٩٨٠', gender: 'female' as const },
    ],
  },
  {
    title: 'بيت خالد السعيد',
    count: 2,
    people: [
      { id: 'h4', name: 'عمر بن خالد', meta: 'وُلد ١٩٧٨', gender: 'male' as const },
      { id: 'h5', name: 'مريم بنت خالد', meta: 'وُلدت ١٩٨٢', gender: 'female' as const },
    ],
  },
];

// ===========================================================================

export default function PublicTreePreviewPage() {
  return (
    <main className={styles.root}>
      {/* shared gold gradient for canvas lines */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <defs>
          <linearGradient id="ptGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e6cf9e" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#c8a865" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#8c7441" stopOpacity="0.3" />
          </linearGradient>
        </defs>
      </svg>

      <div className={styles.page}>
        {/* ===== DOC NAV ===== */}
        <nav className={styles.docNav}>
          <div className={styles.wordmark}>جينات</div>
          <div className={styles.docBadge}>
            <span className={styles.docDot} />
            نماذج أوّليّة · شجرة العائلة العامّة
          </div>
        </nav>

        {/* ===== DOC INTRO ===== */}
        <header className={styles.docIntro}>
          <h1 className={styles.docIntroTitle}>نماذج «الشجرة العامّة»</h1>
          <p className={styles.docIntroLead}>
            هذه صفحاتٌ تجريبيّة ثابتة — للعرض فقط — تُجسّد كيف ستبدو ميزة نشر شجرة العائلة للعموم،
            قبل أن نبدأ ببنائها فعليّاً. الهدف أن نتّفق على الشكل والتجربة مبكّراً. لا توجد بياناتٌ حقيقيّة،
            والأزرار لا تعمل. كلّ قسمٍ مذيّلٌ بشرحٍ بسيط، ومُبيَّنٌ فيه ما يحتاج تأكيدك.
          </p>
          <div className={styles.docTocRow}>
            <a className={styles.docTocChip} href="#viewer">١. واجهة الزائر العامّة</a>
            <a className={styles.docTocChip} href="#person">٢. لوحة الفرد</a>
            <a className={styles.docTocChip} href="#states">٣. حالات الصفحة</a>
            <a className={styles.docTocChip} href="#publish">٤. خطوات النشر</a>
            <a className={styles.docTocChip} href="#checkpoint">٥. مراجعة قبل النشر</a>
            <a className={styles.docTocChip} href="#private">٦. إيقاف النشر</a>
            <a className={styles.docTocChip} href="#report">٧. صفحة الإبلاغ</a>
            <a className={styles.docTocChip} href="#seo">٨. الظهور في محركات البحث</a>
          </div>
        </header>

        {/* =================================================================
            1. PUBLIC VIEWER (desktop + mobile)
           ================================================================= */}
        <section className={styles.section} id="viewer">
          <div className={styles.sectionHead}>
            <span className={styles.sectionKicker}>القسم الأوّل</span>
            <h2 className={styles.sectionTitle}>واجهة الزائر العامّة</h2>
            <p className={styles.sectionHint}>
              ما يراه زائرٌ لا يملك حساباً حين يفتح رابط شجرة عائلةٍ منشورة: الشجرة للعرض فقط —
              بلا أيّ أدوات تعديل، بلا معلومات الأعضاء — مع بحثٍ، واختيار التقويم، ودعوةٍ لطيفة لإنشاء شجرته.
            </p>
          </div>

          {/* --- desktop frame --- */}
          <span className={styles.frameLabel}>سطح المكتب</span>
          <div className={styles.browser}>
            <div className={styles.browserBar}>
              <div className={styles.browserDots}><span /><span /><span /></div>
              <div className={styles.browserUrl}>
                <span className={styles.lock}>🔒</span>
                gynat.com<span className={styles.urlPath}>/family/al-saeed</span>
              </div>
            </div>
            <div className={styles.browserBody}>
              <PublicViewer />
            </div>
          </div>
          <div className={styles.caption}>
            <span className={styles.captionIcon}>✦</span>
            <span>
              الشجرة نفسها التي تستخدمها العائلات اليوم، لكن للقراءة فقط. الشريط العلويّ يحمل اسم العائلة،
              مفتاحَ التقويم (هجري / ميلادي)، وعلامة «جينات». لا يوجد زرّ تعديل أو إضافة أو حذف.
              الأفراد الأحياء تظهر أسماؤهم وصِلاتهم، لكن تاريخ ميلادهم الدقيق محجوب — يظهر «حيّ» بدلاً منه.
              والأفراد المعلَّمون كـ«خاصّ» يظهرون كبطاقةٍ محايدة بلا تفاصيل.
            </span>
          </div>

          {/* --- mobile frame --- */}
          <div className={styles.subHead}>
            <span className={styles.subHeadTag}>الهاتف</span>
            <span className={styles.subHeadNote}>الشجرة بملء الشاشة، والقائمة تنزلق من الجانب</span>
          </div>
          <div className={styles.phone}>
            <div className={styles.phoneScreen}>
              <div className={styles.phoneNotch} />
              <PublicViewerMobile />
            </div>
          </div>
          <div className={styles.caption}>
            <span className={styles.captionIcon}>✦</span>
            <span>
              على الهاتف، تملأ الشجرةُ الشاشة، وتظهر دعوة «ابدأ شجرة عائلتك» كزرٍّ هادئ في الأسفل لا يحجب المشهد.
            </span>
          </div>
        </section>

        {/* =================================================================
            2. PERSON PANEL — full / living-trimmed / private
           ================================================================= */}
        <section className={styles.section} id="person">
          <div className={styles.sectionHead}>
            <span className={styles.sectionKicker}>القسم الثاني</span>
            <h2 className={styles.sectionTitle}>لوحة الفرد</h2>
            <p className={styles.sectionHint}>
              حين ينقر الزائر على فردٍ في الشجرة تظهر لوحتُه. ثلاث حالات: فردٌ متوفّى تظهر تفاصيله كاملة،
              فردٌ حيٌّ يظهر باسمه وصِلاته لكن بلا تاريخ ميلادٍ دقيق، وفردٌ خاصّ يظهر كبطاقةٍ محترمة بلا تفاصيل.
            </p>
          </div>

          <div className={styles.panelStage}>
            <PersonPanelFull />
            <PersonPanelLiving />
          </div>

          <div className={styles.subHead}>
            <span className={styles.subHeadTag}>الفرد الخاصّ</span>
            <span className={styles.subHeadNote}>محجوبٌ من المصدر — لا يصل الجهاز أيّ تفصيل</span>
          </div>
          <div style={{ maxWidth: 440 }}>
            <PersonPanelPrivate />
          </div>

          <div className={styles.caption}>
            <span className={styles.captionIcon}>✦</span>
            <span>
              السيرة الذاتيّة (الحكاية) والملاحظات تُعرض كاملةً للجميع — أحياءً كانوا أو متوفّين — لأنّها محتوى
              كتبه صاحب الشجرة بنفسه، فوجودُها دليل رغبةٍ في مشاركتها. ما يُحجب للأحياء هو تاريخ الميلاد الدقيق فقط.
              الفرد «الخاصّ» لا تصل تفاصيلُه إلى المتصفّح أصلاً — يُزيلها الخادم قبل الإرسال.
            </span>
          </div>
        </section>

        {/* =================================================================
            3. STATES — loading / empty / unavailable
           ================================================================= */}
        <section className={styles.section} id="states">
          <div className={styles.sectionHead}>
            <span className={styles.sectionKicker}>القسم الثالث</span>
            <h2 className={styles.sectionTitle}>حالات الصفحة</h2>
            <p className={styles.sectionHint}>
              كيف تبدو الصفحة أثناء التحميل، أو حين لا توجد معلوماتٌ معروضة، أو حين تكون الشجرة غير متاحة
              (أُوقف عرضُها، أو الرابط غير صحيح). كلّها بلغةٍ هادئة، بلا رموزٍ تقنيّة.
            </p>
          </div>

          <div className={styles.frameRow}>
            <div className={styles.frameRowSplit}>
              <StateLoading />
              <StateEmpty />
            </div>
            <StateUnavailable />
          </div>

          <div className={styles.caption}>
            <span className={styles.captionIcon}>✦</span>
            <span>
              شاشة «غير متاحة» هي نفسها التي يصل إليها الزائر إذا أوقفت العائلةُ النشر لاحقاً —
              فلا يرى رسالة خطأٍ مزعجة، بل دعوةً لطيفة للعودة إلى الصفحة الرئيسيّة.
            </span>
          </div>
        </section>

        {/* =================================================================
            4. PUBLISH FLOW — visibility ladder + reuse opt-in
           ================================================================= */}
        <section className={styles.section} id="publish">
          <div className={styles.sectionHead}>
            <span className={styles.sectionKicker}>القسم الرابع</span>
            <h2 className={styles.sectionTitle}>خطوات النشر</h2>
            <p className={styles.sectionHint}>
              داخل إعدادات مساحة العائلة، يرى المسؤول (فقط) هذا الاختيار: ثلاث درجاتٍ للظهور، من الأكثر خصوصيّةً
              إلى الأكثر انفتاحاً. الانتقال نحو الأكثر انفتاحاً يمرّ بخطوة مراجعةٍ (القسم الخامس).
            </p>
          </div>

          <VisibilityLadder />

          <div className={styles.caption}>
            <span className={styles.captionIcon}>✦</span>
            <span>
              اخترنا «سُلَّماً» من ثلاث بطاقاتٍ بدل مفتاحٍ بسيط، لأنّ القرارات هنا غير متماثلة: العودة إلى الخصوصيّة
              سهلة، لكن الظهور في Google يصعب التراجع عنه تماماً — لذلك هو درجةٌ منفصلة ومميَّزة. وخانة «السماح بالضمّ
              إلى المجموعات» منفصلةٌ عمداً: «أن يُشاهَد» شيء، و«أن يُعاد استخدامه» شيءٌ آخر.
            </span>
          </div>
        </section>

        {/* =================================================================
            5. PUBLISH CHECKPOINT — the gate
           ================================================================= */}
        <section className={styles.section} id="checkpoint">
          <div className={styles.sectionHead}>
            <span className={styles.sectionKicker}>القسم الخامس · الأهمّ</span>
            <h2 className={styles.sectionTitle}>مراجعةٌ قبل النشر</h2>
            <p className={styles.sectionHint}>
              قبل أن تصبح الشجرة عامّة، يُعرض على المسؤول كلُّ الأشخاص الأحياء — مجموعين حسب البيت — ليراجعهم
              ويُصحّح أيّ خطأٍ قبل النشر. ثمّ يكتب اسم العائلة بيده للتأكيد. وإن اختار الظهور في محركات البحث، يرى تنبيهاً
              صريحاً بأنّ هذا القرار يصعب التراجع عنه.
            </p>
          </div>

          <PublishCheckpoint />

          <div className={`${styles.caption} ${styles.confirmCaption}`}>
            <span className={styles.captionIcon}>★</span>
            <span>
              <strong>قرارٌ يحتاج تأكيدك:</strong> رتّبنا الأشخاص حسب البيت (بيت فلان، بيت فلان) ليسهُل تصفّحهم،
              مع تقديم «من يحتاجون انتباهاً» (بلا تاريخ ميلاد) في الأعلى. وكلّ شخصٍ يمكن تعديله أو وضع علامة «خاصّ» عليه
              من هنا مباشرةً — فالمراجعة ليست للإقرار فقط بل لتصحيح الأخطاء. كما أنّ عبارة التأكيد هي «اسم العائلة»
              الذي يعرفه المسؤول، لا الرابط الطويل. هل هذا الترتيب مناسب؟
            </span>
          </div>
        </section>

        {/* =================================================================
            6. MAKE PRIVATE DIALOG
           ================================================================= */}
        <section className={styles.section} id="private">
          <div className={styles.sectionHead}>
            <span className={styles.sectionKicker}>القسم السادس</span>
            <h2 className={styles.sectionTitle}>إيقاف النشر</h2>
            <p className={styles.sectionHint}>
              حين تقرّر العائلة إيقاف نشر شجرتها للعموم. نافذةٌ هادئة وصادقة: تُوضِح أنّ النشر يتوقّف فوراً، لكنّها
              لا تُخفي أنّ ما حفظه آخرون قد يبقى لديهم، وتُشير بوضوحٍ إلى طريق الإزالة النهائيّة.
            </p>
          </div>

          <MakePrivateDialog />

          <div className={styles.caption}>
            <span className={styles.captionIcon}>✦</span>
            <span>
              النبرة هادئةٌ ومباشرة (لا تخويف)، فهذا إجراءٌ مشروع ومدعوم. زرّ «طلب إزالة نهائيّة» بارزٌ وواضح،
              لأنّه الطريق الوحيد لإزالة المعلومات من كلّ مكان — بما في ذلك نسخ العائلات الأخرى.
            </span>
          </div>
        </section>

        {/* =================================================================
            7. REPORT PAGE
           ================================================================= */}
        <section className={styles.section} id="report">
          <div className={styles.sectionHead}>
            <span className={styles.sectionKicker}>القسم السابع</span>
            <h2 className={styles.sectionTitle}>صفحة الإبلاغ</h2>
            <p className={styles.sectionHint}>
              صفحةٌ عامّة لا تتطلّب حساباً — حتّى يستطيع شخصٌ ظهرت بياناتُه دون علمه أن يطلب إزالتها.
              يصل إليها الزائر من أسفل أيّ شجرةٍ عامّة، ومن نافذة «إيقاف النشر».
            </p>
          </div>

          <ReportForm />

          <div className={styles.caption}>
            <span className={styles.captionIcon}>✦</span>
            <span>
              نموذجٌ بسيط ومحترم: ما الذي تُبلِغ عنه، مَن المتأثّر، وسيلة تواصلٍ اختياريّة، وتفاصيل حرّة.
              بلا تسجيل دخول — لأنّ المتأثّر قد لا يكون عضواً في المنصّة أصلاً.
            </span>
          </div>
        </section>

        {/* =================================================================
            8. READABLE SEO PAGES
           ================================================================= */}
        <section className={styles.section} id="seo">
          <div className={styles.sectionHead}>
            <span className={styles.sectionKicker}>القسم الثامن</span>
            <h2 className={styles.sectionTitle}>الظهور في محرّكات البحث</h2>
            <p className={styles.sectionHint}>
              لا حاجة لصفحاتٍ منفصلة لكلّ فرد أو للعائلة. ستعتمد الفهرسة على صفحة الشجرة العامّة نفسها.
            </p>
          </div>

          <div className={styles.deferredNote}>
            <div className={styles.deferredBadge}>لاحقاً</div>
            <h3 className={styles.deferredTitle}>الفهرسة ستعتمد على صفحة الشجرة نفسها</h3>
            <p className={styles.deferredText}>
              الوصف + اللوحة الجانبيّة + الإحصائيّات على صفحة الشجرة العامّة هي ما ستراه محرّكات البحث.
              التفاصيل الدقيقة لما يُعرض في الصفحة لتكون قابلةً للفهرسة ستأتي لاحقاً.
            </p>
          </div>
        </section>

        <div className={styles.footnote}>
          ﴾ وَجَعَلْنَاكُمْ شُعُوبًا وَقَبَائِلَ لِتَعَارَفُوا ﴿
        </div>
      </div>
    </main>
  );
}

// ===========================================================================
// PUBLIC VIEWER (desktop)
// ===========================================================================

function PublicViewer() {
  return (
    <div className={styles.viewerStage}>
      <div className={styles.publicHeader}>
        <div className={styles.publicHeaderName}>
          <span className={styles.publicHeaderCrest} />
          <div>
            <div className={styles.publicHeaderTitle}>عائلة السعيد</div>
            <div className={styles.publicHeaderSub}>حلب · ٦ أجيال موثّقة</div>
          </div>
        </div>
        <div className={styles.publicHeaderTools}>
          <div className={styles.calToggle}>
            <button type="button" className={`${styles.calSeg} ${styles.calSegActive}`}>هجري</button>
            <button type="button" className={styles.calSeg}>ميلادي</button>
          </div>
          <a className={styles.publicWordmark}>جينات</a>
        </div>
      </div>

      <div className={styles.canvas}>
        <div className={styles.canvasSurface}>
          <svg className={styles.canvasLines} viewBox="0 0 100 100" preserveAspectRatio="none">
            {canvasPaths.map((d, i) => <path key={i} d={d} />)}
          </svg>
          {canvasNodes.map((n) => <CanvasNode key={n.id} node={n} />)}
        </div>
        <div className={styles.canvasControls}>
          <button type="button" className={styles.canvasCtrlBtn} aria-label="تكبير">+</button>
          <button type="button" className={styles.canvasCtrlBtn} aria-label="تصغير">−</button>
          <button type="button" className={styles.canvasCtrlBtn} aria-label="توسيط">⌂</button>
        </div>
      </div>

      <aside className={styles.viewerSidebar}>
        <div className={styles.searchBox}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.5" />
            <path d="M20 20L16.5 16.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <input placeholder="ابحث عن شخص في العائلة…" defaultValue="" />
        </div>
        <div className={styles.statRow}>
          <div className={styles.statPill}>
            <span className={styles.statPillValue}>٢٤٨</span>
            <span className={styles.statPillLabel}>فرد</span>
          </div>
          <div className={styles.statPill}>
            <span className={styles.statPillValue}>٦</span>
            <span className={styles.statPillLabel}>أجيال</span>
          </div>
        </div>
        <ul className={styles.peopleList}>
          {sidebarPeople.map((p) => (
            <li
              key={p.id}
              className={`${styles.peopleItem} ${p.active ? styles.peopleItemActive : ''} ${p.gender === 'male' ? styles.peopleItemMale : styles.peopleItemFemale}`}
            >
              <span className={styles.peopleName}>{p.name}</span>
              <span className={styles.peopleDates}>{p.dates}</span>
            </li>
          ))}
        </ul>
        <div className={styles.growthCta}>
          <div className={styles.growthEyebrow}>أنشئ شجرتك</div>
          <div className={styles.growthLine}>وثّق نسب عائلتك واحفظ أسماء أجدادك</div>
          <div className={styles.growthActions}>
            <button type="button" className={styles.btnPrimarySm}>ابدأ شجرة عائلتك</button>
            <button type="button" className={styles.btnGhostSm}>كيف تعمل؟</button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function CanvasNode({ node }: { node: Node }) {
  return (
    <div
      className={[
        styles.node,
        node.patriarch ? styles.nodePatriarch : '',
        node.selected ? styles.nodeSelected : '',
        node.privatePerson ? styles.nodePrivate : '',
      ].join(' ')}
      style={{ left: `${node.x}%`, top: `${node.y}%` }}
    >
      <div className={`${styles.nodeAvatar} ${node.gender === 'female' ? styles.female : ''}`}>
        <NodeFigure gender={node.gender} />
      </div>
      <div className={styles.nodeName}>{node.name}</div>
      {node.living ? (
        <span className={styles.nodeLivingMark}>حيّ · الميلاد محجوب</span>
      ) : (
        <div className={styles.nodeYears}>{node.years}</div>
      )}
    </div>
  );
}

// ===========================================================================
// PUBLIC VIEWER (mobile)
// ===========================================================================

function PublicViewerMobile() {
  const mobileNodes: Node[] = [
    { id: 'm1', name: 'محمد السعيد', years: '١٨٧٠ – ١٩٤٥', gender: 'male', x: 50, y: 16, patriarch: true },
    { id: 'm2', name: 'أحمد السعيد', years: '١٩٠٢ – ١٩٧٨', gender: 'male', x: 30, y: 50 },
    { id: 'm3', name: 'خالد السعيد', years: '١٩٠٦ – ١٩٨٢', gender: 'male', x: 70, y: 50 },
    { id: 'm4', name: 'يوسف', years: 'حيّ', gender: 'male', x: 30, y: 82, living: true },
  ];
  const mobilePaths = [
    'M 50 24 C 50 34, 30 42, 30 46',
    'M 50 24 C 50 34, 70 42, 70 46',
    'M 30 58 C 30 70, 30 76, 30 78',
  ];
  return (
    <div className={styles.viewerStage} style={{ height: '100%', flexDirection: 'column' }}>
      <div className={styles.publicHeader} style={{ left: 12, right: 12, top: 30 }}>
        <div className={styles.publicHeaderName}>
          <span className={styles.publicHeaderCrest} />
          <div className={styles.publicHeaderTitle}>عائلة السعيد</div>
        </div>
        <div className={styles.calToggle}>
          <button type="button" className={`${styles.calSeg} ${styles.calSegActive}`}>هجري</button>
          <button type="button" className={styles.calSeg}>ميلادي</button>
        </div>
      </div>

      <div className={styles.canvas}>
        <div className={styles.canvasSurface}>
          <svg className={styles.canvasLines} viewBox="0 0 100 100" preserveAspectRatio="none">
            {mobilePaths.map((d, i) => <path key={i} d={d} />)}
          </svg>
          {mobileNodes.map((n) => <CanvasNode key={n.id} node={n} />)}
        </div>
      </div>

      <button
        type="button"
        className={styles.btnPrimary}
        style={{ position: 'absolute', bottom: 18, left: 18, right: 18, zIndex: 30 }}
      >
        ابدأ شجرة عائلتك
      </button>
    </div>
  );
}

// ===========================================================================
// PERSON PANELS
// ===========================================================================

function PersonPanelFull() {
  return (
    <div className={styles.personPanel}>
      <header className={styles.personPanelHeader}>
        <div className={styles.personAvatarLg}>
          <FigureMan />
          <span className={`${styles.personBadge} ${styles.personBadgeGold}`}>الجدّ الأوّل</span>
        </div>
        <h3 className={styles.personName}>محمد السعيد</h3>
        <div className={styles.personKunya}>أبو أحمد</div>
        <div className={styles.personDates}>
          <span>١٢٨٧ – ١٣٦٤ هـ</span>
          <span className={styles.dateDivider}>◆</span>
          <span>١٨٧٠ – ١٩٤٥ م</span>
        </div>
      </header>
      <div className={styles.personBody}>
        <section className={styles.field}>
          <div className={styles.fieldLabel}>الميلاد</div>
          <div className={styles.fieldValue}>حلب · الحيّ القديم</div>
          <div className={styles.fieldHint}>١٢٨٧ هـ ≡ ١٨٧٠ م</div>
        </section>
        <section className={styles.field}>
          <div className={styles.fieldLabel}>الزوجات</div>
          <div className={styles.relRow}>
            <a className={styles.relChip}><span className={styles.relAvatar}><FigureWoman /></span>فاطمة الدبّاغ</a>
            <a className={styles.relChip}><span className={styles.relAvatar}><FigureWoman /></span>عائشة الدالاتي</a>
          </div>
        </section>
        <section className={styles.field}>
          <div className={styles.fieldLabel}>الذرّيّة · ٤</div>
          <div className={styles.relRow}>
            <a className={styles.relChip}><span className={styles.relAvatar}><FigureMan /></span>أحمد</a>
            <a className={styles.relChip}><span className={styles.relAvatar}><FigureMan /></span>خالد</a>
            <a className={styles.relChip}><span className={styles.relAvatar}><FigureWoman /></span>فاطمة</a>
            <a className={styles.relChip}><span className={styles.relAvatar}><FigureMan /></span>حسن</a>
          </div>
        </section>
        <section className={styles.field}>
          <div className={styles.fieldLabel}>سيرةٌ مختصرة</div>
          <p className={styles.personBio}>
            من أعيان تجّار حلب، رحل بأسرته إلى دمشق سنة ١٣٢٤ هـ، وأسّس بيت السعيد الكبير في حيّ الصّالحيّة.
            شهِدَ له أهلُ بلده بكرم الضّيافة وصِدق المعاملة.
          </p>
        </section>
      </div>
      <footer className={styles.panelFooter}>
        <a className={styles.panelFooterLink}>صفحة هذا الفرد للقراءة ←</a>
      </footer>
    </div>
  );
}

function PersonPanelLiving() {
  return (
    <div className={styles.personPanel}>
      <header className={styles.personPanelHeader}>
        <div className={styles.personAvatarLg}>
          <FigureMan />
          <span className={styles.personBadge}>على قيد الحياة</span>
        </div>
        <h3 className={styles.personName}>يوسف السعيد</h3>
        <div className={styles.personKunya}>أبو محمّد</div>
        <div className={styles.personDates}>
          <span className={styles.fieldWithheld}>تاريخ الميلاد محجوب</span>
        </div>
      </header>
      <div className={styles.personBody}>
        <section className={styles.field}>
          <div className={styles.fieldLabel}>الميلاد</div>
          <div className={styles.fieldWithheld}>غير معروضٍ للأفراد الأحياء</div>
        </section>
        <section className={styles.field}>
          <div className={styles.fieldLabel}>الوالد</div>
          <div className={styles.relRow}>
            <a className={styles.relChip}><span className={styles.relAvatar}><FigureMan /></span>أحمد السعيد</a>
          </div>
        </section>
        <section className={styles.field}>
          <div className={styles.fieldLabel}>الذرّيّة · ٢</div>
          <div className={styles.relRow}>
            <a className={styles.relChip}><span className={styles.relAvatar}><FigureMan /></span>محمّد</a>
            <a className={styles.relChip}><span className={styles.relAvatar}><FigureWoman /></span>سلمى</a>
          </div>
        </section>
        <section className={styles.field}>
          <div className={styles.fieldLabel}>سيرةٌ مختصرة</div>
          <p className={styles.personBio}>
            مهندسٌ مدنيّ، أسهم في ترميم عددٍ من البيوت التراثيّة في المدينة القديمة، وهو من رعاة توثيق
            شجرة العائلة. (تُعرض السيرة كاملةً لأنّها كتابةٌ مقصودة.)
          </p>
        </section>
      </div>
      <footer className={styles.panelFooter}>
        <a className={styles.panelFooterLink}>صفحة هذا الفرد للقراءة ←</a>
      </footer>
    </div>
  );
}

function PersonPanelPrivate() {
  return (
    <div className={styles.personPanel}>
      <header className={styles.personPanelHeader}>
        <div className={`${styles.personAvatarLg} ${styles.personAvatarPrivate}`}>
          <FigureMan />
        </div>
        <h3 className={styles.personName}>فردٌ خاصّ</h3>
        <p className={styles.privateNote}>
          اختارت العائلةُ عدم عرض تفاصيل هذا الفرد.<br />
          يبقى موضعُه في الشجرة محفوظاً دون أيّ معلومات.
        </p>
      </header>
      <footer className={styles.panelFooter}>
        <a className={styles.panelFooterLink}>الإبلاغ عن هذه الشجرة</a>
      </footer>
    </div>
  );
}

// ===========================================================================
// STATES
// ===========================================================================

function StateLoading() {
  return (
    <div>
      <span className={styles.frameLabel}>أثناء التحميل</span>
      <div className={styles.statePanel}>
        <div className={styles.stateRing}>
          <div className={styles.stateSpinner} />
        </div>
        <h3 className={styles.stateTitle}>جاري تحميل شجرة العائلة…</h3>
        <p className={styles.stateText}>لحظاتٌ قليلة ريثما نُحضِر الأجداد.</p>
      </div>
    </div>
  );
}

function StateEmpty() {
  return (
    <div>
      <span className={styles.frameLabel}>لا معلومات معروضة</span>
      <div className={styles.statePanel}>
        <div className={styles.stateRing} />
        <h3 className={styles.stateTitle}>لا تتوفّر معلوماتٌ معروضة</h3>
        <p className={styles.stateText}>هذه الشجرة لا تحتوي حاليّاً على أفرادٍ معروضين للعموم.</p>
        <button type="button" className={styles.btnPrimary}>ابدأ شجرة عائلتك</button>
      </div>
    </div>
  );
}

function StateUnavailable() {
  return (
    <div>
      <span className={styles.frameLabel}>غير متاحة (أُوقف النشر أو رابطٌ غير صحيح)</span>
      <div className={styles.statePanel}>
        <div className={styles.stateWordmark}>جينات</div>
        <div className={styles.stateRing} />
        <h3 className={styles.stateTitle}>هذه الشجرة غير متاحة للعرض حاليّاً</h3>
        <p className={styles.stateText}>
          قد تكون العائلةُ قد أوقفت عرضَها للعموم، أو أنّ الرابط غير صحيح.
        </p>
        <button type="button" className={styles.btnGhost}>العودة إلى الصفحة الرئيسيّة</button>
      </div>
    </div>
  );
}

// ===========================================================================
// VISIBILITY LADDER
// ===========================================================================

function VisibilityLadder() {
  return (
    <div className={styles.ladderPanel}>
      <div className={styles.ladderHeader}>
        <div className={styles.ladderKicker}>النشر والظهور · للمسؤول فقط</div>
        <h3 className={styles.ladderTitle}>مَن يستطيع رؤية شجرة العائلة؟</h3>
      </div>

      <div className={styles.ladder}>
        <div className={`${styles.ladderItem} ${styles.ladderItemActive}`}>
          <div className={styles.ladderRadio} />
          <div className={styles.ladderText}>
            <div className={styles.ladderLabel}>
              خاصّة — للأعضاء فقط
              <span className={styles.currentTag}>الحالة الحاليّة</span>
            </div>
            <div className={styles.ladderDesc}>
              لا يراها إلّا مَن تدعوهم إلى مساحة العائلة. هذا هو الوضع الافتراضيّ.
            </div>
          </div>
        </div>

        <div className={styles.ladderItem}>
          <div className={styles.ladderRadio} />
          <div className={styles.ladderText}>
            <div className={styles.ladderLabel}>عامّة عبر الرابط</div>
            <div className={styles.ladderDesc}>
              يستطيع مَن يملك الرابط مشاهدتها، ولا تظهر في نتائج محركات البحث. خطوةٌ أولى آمنة.
            </div>
          </div>
        </div>

        <div className={`${styles.ladderItem} ${styles.ladderItemFurther}`}>
          <div className={styles.ladderRadio} />
          <div className={styles.ladderText}>
            <div className={styles.ladderLabel}>
              عامّة وتظهر في محركات البحث
              <span className={styles.furtherTag}>خطوةٌ أبعد</span>
            </div>
            <div className={styles.ladderDesc}>
              قد تظهر شجرة العائلة في نتائج Google. قرارٌ يصعب التراجع عنه تماماً — يمرّ بمراجعةٍ وتنبيه.
            </div>
          </div>
        </div>
      </div>

      <div className={styles.reuseRow}>
        <div className={`${styles.checkbox}`}>{''}</div>
        <div className={styles.reuseText}>
          <div className={styles.reuseLabel}>
            السماح للآخرين بضمّ هذه الشجرة إلى مجموعاتهم
            <span className={styles.seamTag}>يُفعَّل مع ميزة المجموعات لاحقاً</span>
          </div>
          <div className={styles.reuseHint}>
            (غير مفعّل افتراضيّاً) — «أن يُشاهَد» شيء، و«أن يُعاد استخدامه» في موادّ الآخرين شيءٌ آخر.
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// PUBLISH CHECKPOINT
// ===========================================================================

function PublishCheckpoint() {
  return (
    <div className={styles.checkpointStage}>
      <div className={styles.checkpoint}>
        <div className={styles.checkpointHead}>
          <div className={styles.checkpointKicker}>مراجعةٌ قبل النشر</div>
          <h3 className={styles.checkpointTitle}>الأشخاص الأحياء في الشجرة</h3>
          <p className={styles.checkpointLead}>
            هؤلاء أكثر مَن قد يتأثّر بالنشر. راجِعهم قبل المتابعة — وإن وجدتَ خطأً، صحِّحه الآن:
            أضِف تاريخ وفاة، أو ضع علامة «خاصّ» على مَن لا تريد عرضه.
          </p>
        </div>

        <div className={styles.checkpointCount}>
          <span className={styles.checkpointCountNum}>٤٧</span>
          <span className={styles.checkpointCountText}>
            سيُعرض ٤٧ فرداً حيّاً للعموم (بأسمائهم وصِلاتهم، دون تاريخ ميلادهم الدقيق).
          </span>
        </div>

        <div className={styles.checkpointTools}>
          <div className={styles.checkpointSearch}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2.5" />
              <path d="M20 20L16.5 16.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <input placeholder="ابحث عن اسمٍ للوصول إليه بسرعة…" />
          </div>
        </div>

        <div className={styles.checkpointGroups}>
          {/* attention group first */}
          <div className={styles.attentionGroup}>
            <div className={styles.groupHead}>
              <div className={`${styles.groupTitle} ${styles.groupTitleAttention}`}>
                <span className={styles.groupTitleIcon}>⚑</span>
                يحتاجون انتباهاً — بلا تاريخ ميلاد
              </div>
              <span className={styles.groupCount}>{attentionPeople.length} أفراد</span>
            </div>
            <div className={styles.personGrid}>
              {attentionPeople.map((p) => (
                <CheckpointChip key={p.id} person={p} warn />
              ))}
            </div>
          </div>

          {/* households */}
          {households.map((h) => (
            <div key={h.title} className={styles.householdGroup}>
              <div className={styles.groupHead}>
                <div className={styles.groupTitle}>
                  <span className={styles.groupTitleIcon}>⌂</span>
                  {h.title}
                </div>
                <span className={styles.groupCount}>{h.count} أفراد</span>
              </div>
              <div className={styles.personGrid}>
                {h.people.map((p) => (
                  <CheckpointChip key={p.id} person={p} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* irreversibility note — shown only for the "searchable" choice */}
        <div className={styles.irreversible}>
          <div className={styles.irreversibleIcon}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h4 className={styles.irreversibleTitle}>الظهور في محركات البحث قرارٌ يصعب التراجع عنه</h4>
            <p className={styles.irreversibleText}>
              بمجرّد ظهور الشجرة في محرّكات البحث، قد تبقى بعض النسخ محفوظةً لدى Google أو أرشيف الإنترنت
              حتّى لو أوقفتَ النشر لاحقاً. هذا التنبيه يظهر فقط حين تختار «الظهور في محركات البحث».
            </p>
          </div>
        </div>

        {/* type to confirm */}
        <div className={styles.confirmZone}>
          <div className={styles.confirmLabel}>
            للتأكيد، اكتب اسم العائلة <strong>«عائلة السعيد»</strong> في الحقل أدناه:
          </div>
          <input className={styles.confirmInput} placeholder="عائلة السعيد" />
        </div>

        <div className={styles.checkpointActions}>
          <button type="button" className={`${styles.btnPublish} ${styles.btnPublishDisabled}`}>
            نشر الشجرة
          </button>
          <button type="button" className={styles.btnGhost}>إلغاء</button>
          <span className={styles.checkpointHint}>
            <span className={styles.checkpointHintDot} />
            الزرّ يبقى مُعطّلاً حتّى تكتب اسم العائلة
          </span>
        </div>
      </div>
    </div>
  );
}

function CheckpointChip({
  person,
  warn = false,
}: {
  person: { name: string; meta: string; gender: 'male' | 'female' };
  warn?: boolean;
}) {
  return (
    <div className={styles.checkChip}>
      <div className={`${styles.checkChipAvatar} ${person.gender === 'female' ? styles.female : ''}`}>
        <NodeFigure gender={person.gender} />
      </div>
      <div className={styles.checkChipText}>
        <div className={styles.checkChipName}>{person.name}</div>
        <div className={`${styles.checkChipMeta} ${warn ? styles.checkChipMetaWarn : ''}`}>{person.meta}</div>
      </div>
      <div className={styles.checkChipActions}>
        <button type="button" className={styles.miniBtn}>تعديل</button>
        <button type="button" className={styles.miniBtn}>خاصّ</button>
      </div>
    </div>
  );
}

// ===========================================================================
// MAKE PRIVATE DIALOG
// ===========================================================================

function MakePrivateDialog() {
  return (
    <div className={styles.modalStage}>
      <div className={styles.modal}>
        <div className={styles.modalIcon}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
            <path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </div>
        <h3 className={styles.modalTitle}>إيقاف النشر</h3>
        <p className={styles.modalLead}>
          ستتوقّف الشجرة عن الظهور للعموم فوراً، وسنطلب من محرّكات البحث إزالتها.
        </p>
        <div className={styles.honestBlock}>
          لكن إذا كانت أجزاءٌ من شجرتك قد أُضيفت إلى مجموعات عائلاتٍ أخرى، فستبقى لديهم كنسخةٍ محفوظة،
          ولن يختفي تلقائيّاً ما سبق أن حفظته محرّكاتُ البحث أو أرشيف الإنترنت.
        </div>
        <a className={styles.reportLink}>
          <span className={styles.reportLinkIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M4 4v16M4 5h12l-2 4 2 4H4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className={styles.reportLinkText}>
            <div className={styles.reportLinkTitle}>طلب إزالةٍ نهائيّة</div>
            <div className={styles.reportLinkSub}>إن كانت هناك معلوماتٌ يجب إزالتها من كلّ مكانٍ لأجل الخصوصيّة</div>
          </span>
          <span className={styles.reportLinkArrow}>←</span>
        </a>
        <div className={styles.modalActions}>
          <button type="button" className={styles.btnPrimary}>إيقاف النشر</button>
          <button type="button" className={styles.btnGhost}>تراجُع</button>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// REPORT FORM
// ===========================================================================

function ReportForm() {
  return (
    <div className={styles.reportForm}>
      <div className={styles.reportHead}>
        <h3 className={styles.reportTitle}>الإبلاغ عن محتوى</h3>
        <p className={styles.reportSub}>
          إن ظهرت بياناتُك أو بيانات أحد أقاربك في شجرةٍ عامّة دون موافقة، أخبِرنا وسنراجع الأمر.
          لا حاجة لتسجيل الدخول.
        </p>
      </div>
      <div className={styles.reportBody}>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>ما الذي تُبلِغ عنه؟</label>
          <select className={styles.formSelect} defaultValue="">
            <option value="" disabled>اختر السبب…</option>
            <option>ظهور بيانات شخصٍ حيّ دون موافقته</option>
            <option>معلوماتٌ غير صحيحة</option>
            <option>محتوى مسيء</option>
            <option>سببٌ آخر</option>
          </select>
        </div>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>مَن الفرد المتأثّر؟</label>
          <input className={styles.formInput} placeholder="اسم الفرد كما يظهر في الشجرة" />
        </div>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>وسيلة تواصلٍ (اختياريّة)</label>
          <input className={styles.formInput} placeholder="بريدٌ إلكترونيّ لنردّ عليك" />
        </div>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>تفاصيل إضافيّة</label>
          <textarea className={styles.formTextarea} rows={4} placeholder="اشرح لنا الأمر باختصار…" />
        </div>
        <div className={styles.modalActions}>
          <button type="button" className={styles.btnPrimary}>إرسال البلاغ</button>
          <button type="button" className={styles.btnGhost}>إلغاء</button>
        </div>
      </div>
    </div>
  );
}

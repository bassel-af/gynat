'use client';

import styles from './page.module.css';

// ---------- SVG primitives ---------------------------------------------

function FigureMan({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <defs>
        <linearGradient id="manGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#e6cf9e" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#8c7441" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="15" r="7" fill="url(#manGrad)" />
      <path
        d="M 10 42 Q 10 27 24 27 Q 38 27 38 42 Z"
        fill="url(#manGrad)"
      />
    </svg>
  );
}

function FigureWoman({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <defs>
        <linearGradient id="womanGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f4d9c0" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#7b4b55" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="14" r="7" fill="url(#womanGrad)" />
      <path
        d="M 8 44 Q 12 28 24 26 Q 36 28 40 44 Z"
        fill="url(#womanGrad)"
      />
      {/* hair veil silhouette */}
      <path
        d="M 16 9 Q 24 4 32 9 L 32 16 Q 28 14 24 14 Q 20 14 16 16 Z"
        fill="#0f1528"
        opacity="0.55"
      />
    </svg>
  );
}

/** Decorative cluster of silhouettes used in hero medallion and card corners */
function FigureCluster({ variant = 'medallion' }: { variant?: 'medallion' | 'corner' }) {
  if (variant === 'corner') {
    return (
      <svg viewBox="0 0 140 120" aria-hidden>
        <defs>
          <linearGradient id="clusterC" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#c8a865" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#1a5d4a" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        {/* 3 overlapping figures */}
        <g fill="url(#clusterC)">
          <circle cx="35" cy="48" r="10" />
          <path d="M 15 100 Q 15 70 35 70 Q 55 70 55 100 Z" />
          <circle cx="70" cy="40" r="11" />
          <path d="M 48 105 Q 48 68 70 68 Q 92 68 92 105 Z" />
          <circle cx="105" cy="50" r="9" />
          <path d="M 88 100 Q 88 72 105 72 Q 122 72 122 100 Z" />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 320 340" aria-hidden>
      <defs>
        <linearGradient id="heroFigGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#e6cf9e" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#1a5d4a" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id="heroFigGrad2" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f4d9c0" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#7b4b55" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      {/* patriarch center back */}
      <g fill="url(#heroFigGrad)">
        <circle cx="160" cy="78" r="26" />
        <path d="M 112 230 Q 112 125 160 125 Q 208 125 208 230 Z" />
      </g>
      {/* woman left front */}
      <g fill="url(#heroFigGrad2)">
        <circle cx="95" cy="148" r="22" />
        <path d="M 52 280 Q 52 188 95 188 Q 138 188 138 280 Z" />
        <path
          d="M 75 140 Q 95 128 115 140 L 115 155 Q 105 150 95 150 Q 85 150 75 155 Z"
          fill="#0b1222"
          opacity="0.5"
        />
      </g>
      {/* man right front */}
      <g fill="url(#heroFigGrad)">
        <circle cx="228" cy="152" r="22" />
        <path d="M 186 284 Q 186 192 228 192 Q 270 192 270 284 Z" />
      </g>
      {/* child tiny in front */}
      <g fill="url(#heroFigGrad2)">
        <circle cx="160" cy="212" r="14" />
        <path d="M 138 300 Q 138 240 160 240 Q 182 240 182 300 Z" />
      </g>
    </svg>
  );
}

/** Avatar-sized silhouette for tree nodes */
function NodeFigure({ gender }: { gender: 'male' | 'female' }) {
  if (gender === 'female') return <FigureWoman />;
  return <FigureMan />;
}

// ---------- Tree node positions (tuned for 3D canvas) ------------------

type TreeNode = {
  id: string;
  name: string;
  years: string;
  gender: 'male' | 'female';
  x: number;
  y: number;
  patriarch?: boolean;
};

const treeNodes: TreeNode[] = [
  // Generation 1 — patriarch
  { id: 'p1', name: 'محمد السعيد', years: '١٨٧٠ – ١٩٤٥', gender: 'male', x: 50, y: 10, patriarch: true },

  // Generation 2 — sons & wives
  { id: 'p2', name: 'أحمد السعيد', years: '١٩٠٢ – ١٩٧٨', gender: 'male', x: 22, y: 42 },
  { id: 'w2', name: 'فاطمة الدَبّاغ', years: '١٩٠٨ – ١٩٨٤', gender: 'female', x: 36, y: 42 },
  { id: 'p3', name: 'خالد السعيد', years: '١٩٠٦ – ١٩٨٢', gender: 'male', x: 64, y: 42 },
  { id: 'w3', name: 'عائشة الدالاتي', years: '١٩١٠ – ١٩٨٩', gender: 'female', x: 78, y: 42 },

  // Generation 3 — grandchildren
  { id: 'p4', name: 'يوسف', years: '١٩٣٥ – ٢٠١٢', gender: 'male', x: 12, y: 75 },
  { id: 'p5', name: 'ليلى', years: '١٩٣٨', gender: 'female', x: 28, y: 75 },
  { id: 'p6', name: 'سامي', years: '١٩٤٠ – ٢٠٠٥', gender: 'male', x: 58, y: 75 },
  { id: 'p7', name: 'نور', years: '١٩٤٥', gender: 'female', x: 74, y: 75 },
];

/** Paths connecting generations, specified in % coords matched to treeNodes */
const treePaths: string[] = [
  // patriarch → gen2 couples
  'M 50 18 C 50 28, 29 32, 29 38',
  'M 50 18 C 50 28, 71 32, 71 38',
  // couple bonds (horizontal)
  'M 26 45 L 33 45',
  'M 68 45 L 75 45',
  // gen2 → gen3
  'M 29 50 C 29 60, 12 68, 12 70',
  'M 29 50 C 29 60, 28 68, 28 70',
  'M 71 50 C 71 60, 58 68, 58 70',
  'M 71 50 C 71 60, 74 68, 74 70',
];

// ---------- Workspace cards data --------------------------------------

const workspaces = [
  { name: 'آل الدَبّاغ', meta: 'حلب · تأسست ٢٠٢٣', members: 48, generations: 6, events: 124, active: true },
  { name: 'آل شربك', meta: 'دمشق · تأسست ٢٠٢٤', members: 32, generations: 5, events: 87, active: true },
  { name: 'آل الدالاتي', meta: 'حماة · تأسست ٢٠٢٤', members: 21, generations: 4, events: 56, active: false },
];

// ---------- Sidebar mock tree nodes (background context) --------------

type MockNode = { id: string; name: string; years: string; gender: 'male' | 'female'; x: number; y: number; size?: 'sm' | 'md' | 'lg' };

const mockCanvasNodes: MockNode[] = [
  { id: 'm1', name: 'إبراهيم', years: '١٨٤٥ – ١٩٢٢', gender: 'male', x: 42, y: 12, size: 'md' },
  { id: 'm2', name: 'محمد السعيد', years: '١٨٧٠ – ١٩٤٥', gender: 'male', x: 44, y: 38, size: 'lg' },
  { id: 'm3', name: 'رقيّة', years: '١٨٧٥ – ١٩٥٠', gender: 'female', x: 66, y: 38, size: 'md' },
  { id: 'm4', name: 'أحمد', years: '١٩٠٢ – ١٩٧٨', gender: 'male', x: 28, y: 68, size: 'sm' },
  { id: 'm5', name: 'خالد', years: '١٩٠٦ – ١٩٨٢', gender: 'male', x: 48, y: 68, size: 'sm' },
  { id: 'm6', name: 'مريم', years: '١٩١٠ – ١٩٩٠', gender: 'female', x: 68, y: 68, size: 'sm' },
  { id: 'm7', name: 'يوسف', years: '١٩٣٥', gender: 'male', x: 84, y: 40, size: 'sm' },
];

// ---------- Relations in person sidebar --------------------------------

const sidebarChildren = [
  { id: 'c1', name: 'أحمد', gender: 'male' as const },
  { id: 'c2', name: 'خالد', gender: 'male' as const },
  { id: 'c3', name: 'فاطمة', gender: 'female' as const },
  { id: 'c4', name: 'حسن', gender: 'male' as const },
];

// ======================================================================

export default function DesignPreviewPage() {
  return (
    <main className={styles.root}>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <defs>
          <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e6cf9e" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#c8a865" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#8c7441" stopOpacity="0.3" />
          </linearGradient>
        </defs>
      </svg>

      <div className={styles.page}>
        {/* ============ NAV ============ */}
        <nav className={styles.navStrip}>
          <div className={styles.wordmark}>جينات</div>
          <div className={styles.navPill}>
            <span className={styles.navDot} />
            معاينة التصميم · الإصدار التمهيدي
          </div>
        </nav>

        {/* ============ HERO ============ */}
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <span className={styles.eyebrow}>نَسَبٌ موثَّق · ذاكرةٌ مصونة</span>
            <h1 className={styles.heroTitle}>
              شَجَرةُ عائلتك
              <span className={styles.heroTitleAccent}>محفوظةٌ كما تستحق</span>
            </h1>
            <p className={styles.heroLead}>
              منصّةٌ راقية لتوثيق الأنساب، تحفظ أسماء الأجداد وحكاياتهم،
              وتصِل أبناء الأسرة عبر الأجيال في تصميمٍ يليق بتراثهم.
            </p>
            <div className={styles.heroActions}>
              <button type="button" className={styles.btnPrimary}>ابدأ مساحة العائلة</button>
              <button type="button" className={styles.btnGhost}>اطّلع على عرضٍ حيّ</button>
            </div>
          </div>

          <div className={styles.heroShowcase}>
            <div className={styles.medallionRing} />
            <div className={styles.medallion}>
              <div className={styles.figureCluster}>
                <FigureCluster variant="medallion" />
              </div>
              <div className={styles.medallionLabel}>ثلاثة أجيال · بيتٌ واحد</div>
            </div>
            <div className={`${styles.statChip} ${styles.statChipTop}`}>
              <div className={styles.statChipLabel}>أفراد موثَّقون</div>
              <div className={styles.statChipValue}>٢٫٤٨٠+</div>
            </div>
            <div className={`${styles.statChip} ${styles.statChipBottom}`}>
              <div className={styles.statChipLabel}>عائلات نشِطة</div>
              <div className={styles.statChipValue}>١٢٧</div>
            </div>
          </div>
        </section>

        {/* ============ WORKSPACE CARDS ============ */}
        <section className={styles.cardsSection}>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.sectionKicker}>مساحات العائلة</span>
              <h2 className={styles.sectionTitle}>بيوتٌ يجتمع فيها الأحبّة</h2>
            </div>
            <p className={styles.sectionHint}>
              كلّ مساحةٍ مستقلّة بصلاحياتها وأعضائها، يمكن ربط بعضها ببعضٍ عبر مؤشرات الفروع.
            </p>
          </div>

          <div className={styles.cardGrid}>
            {workspaces.map((ws) => (
              <article key={ws.name} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3 className={styles.cardName}>{ws.name}</h3>
                    <div className={styles.cardMeta}>{ws.meta}</div>
                  </div>
                  {ws.active && <span className={styles.cardBadge}>نشِطة</span>}
                </div>

                <div className={styles.cardStats}>
                  <div className={styles.cardStat}>
                    <div className={styles.cardStatValue}>{ws.members}</div>
                    <div className={styles.cardStatLabel}>عضو</div>
                  </div>
                  <div className={styles.cardStat}>
                    <div className={styles.cardStatValue}>{ws.generations}</div>
                    <div className={styles.cardStatLabel}>جيل</div>
                  </div>
                  <div className={styles.cardStat}>
                    <div className={styles.cardStatValue}>{ws.events}</div>
                    <div className={styles.cardStatLabel}>حدث</div>
                  </div>
                </div>

                <div className={styles.cardFigures}>
                  <FigureCluster variant="corner" />
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ============ TREE STAGE ============ */}
        <section className={styles.treeSection}>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.sectionKicker}>واجهة الشجرة</span>
              <h2 className={styles.sectionTitle}>تجربةٌ مائلة، مَنظرٌ عميق</h2>
            </div>
            <p className={styles.sectionHint}>
              مَيَلانٌ خفيف ثلاثيّ الأبعاد يمنح الشجرة حضوراً بصريّاً
              دون أن يخلّ بوضوح القراءة العربية.
            </p>
          </div>

          <div className={styles.treeStage}>
            <div className={styles.treeControls}>
              <button type="button" className={styles.treeCtrlBtn} aria-label="تكبير">+</button>
              <button type="button" className={styles.treeCtrlBtn} aria-label="تصغير">−</button>
              <button type="button" className={styles.treeCtrlBtn} aria-label="إعادة تعيين">⌂</button>
            </div>

            <div className={styles.treeCanvas}>
              <div className={styles.treeSurface}>
                <svg className={styles.treeLines} viewBox="0 0 100 100" preserveAspectRatio="none">
                  {treePaths.map((d, i) => (
                    <path key={i} d={d} />
                  ))}
                </svg>

                {treeNodes.map((n) => (
                  <div
                    key={n.id}
                    className={`${styles.treeNode} ${n.patriarch ? styles.treeNodePatriarch : ''}`}
                    style={{
                      left: `${n.x}%`,
                      top: `${n.y}%`,
                      transform: 'translate(-50%, 0)',
                    }}
                  >
                    <div className={`${styles.nodeAvatar} ${n.gender === 'female' ? styles.female : ''}`}>
                      <NodeFigure gender={n.gender} />
                    </div>
                    <div className={styles.nodeName}>{n.name}</div>
                    <div className={styles.nodeYears}>{n.years}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.treeStageCaption}>
              مَيَلانٌ خفيف · ١٠°
            </div>
          </div>
        </section>

        {/* ============ PERSON SIDEBAR ============ */}
        <section className={styles.sidebarSection}>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.sectionKicker}>لوحة الفرد</span>
              <h2 className={styles.sectionTitle}>كلُّ حياةٍ في صفحة</h2>
            </div>
            <p className={styles.sectionHint}>
              عند اختيار فردٍ من الشجرة تنزلق لوحتُه الجانبيّة بتفاصيله الكاملة:
              المولد، الوفاة، الذريّة، والسيرة.
            </p>
          </div>

          <div className={styles.sidebarStage}>
            {/* faded canvas context behind the sidebar */}
            <div className={styles.sidebarCanvas} aria-hidden>
              <svg className={styles.sidebarCanvasLines} viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M 44 18 C 44 30, 28 54, 28 64" />
                <path d="M 44 18 C 44 30, 48 54, 48 64" />
                <path d="M 44 18 C 44 30, 68 54, 68 64" />
                <path d="M 56 40 C 62 40, 66 40, 66 40" />
                <path d="M 44 40 C 60 40, 80 40, 84 40" />
              </svg>
              {mockCanvasNodes.map((n) => (
                <div
                  key={n.id}
                  className={`${styles.mockNode} ${n.size === 'lg' ? styles.mockNodeLg : ''} ${n.size === 'md' ? styles.mockNodeMd : ''}`}
                  style={{ left: `${n.x}%`, top: `${n.y}%` }}
                >
                  <div className={`${styles.mockAvatar} ${n.gender === 'female' ? styles.female : ''}`}>
                    <NodeFigure gender={n.gender} />
                  </div>
                  <div className={styles.mockNodeText}>
                    <div>{n.name}</div>
                    <span>{n.years}</span>
                  </div>
                </div>
              ))}
              <div className={styles.sidebarCanvasVignette} />
            </div>

            <aside className={styles.personSidebar} aria-label="تفاصيل الفرد">
              <button type="button" className={styles.sidebarClose} aria-label="إغلاق">×</button>

              <header className={styles.personHeader}>
                <div className={styles.personAvatarLarge}>
                  <FigureMan />
                  <span className={styles.personBadge}>الجدّ الأوّل</span>
                </div>
                <h3 className={styles.personName}>محمد السعيد</h3>
                <div className={styles.personKunya}>أبو أحمد</div>
                <div className={styles.personDates}>
                  <span>١٢٨٧ – ١٣٦٤ هـ</span>
                  <span className={styles.dateDivider}>◆</span>
                  <span>١٨٧٠ – ١٩٤٥ م</span>
                </div>
              </header>

              <nav className={styles.personTabs} role="tablist">
                <button type="button" className={`${styles.personTab} ${styles.personTabActive}`}>التفاصيل</button>
                <button type="button" className={styles.personTab}>الصِّلات</button>
                <button type="button" className={styles.personTab}>الأحداث</button>
                <button type="button" className={styles.personTab}>السجلّ</button>
              </nav>

              <div className={styles.personBody}>
                <section className={styles.personField}>
                  <div className={styles.personFieldLabel}>الميلاد</div>
                  <div className={styles.personFieldValue}>حلب · الحيّ القديم</div>
                  <div className={styles.personFieldHint}>١٢٨٧ هـ ≡ ١٨٧٠ م</div>
                </section>

                <section className={styles.personField}>
                  <div className={styles.personFieldLabel}>الوفاة</div>
                  <div className={styles.personFieldValue}>دمشق · حيّ الصّالحيّة</div>
                  <div className={styles.personFieldHint}>١٣٦٤ هـ ≡ ١٩٤٥ م</div>
                </section>

                <section className={styles.personField}>
                  <div className={styles.personFieldLabel}>الزّوجات</div>
                  <div className={styles.relationRow}>
                    <div className={styles.relationChip}>
                      <span className={styles.relationAvatar}><FigureWoman /></span>
                      فاطمة الدبّاغ
                    </div>
                    <div className={styles.relationChip}>
                      <span className={styles.relationAvatar}><FigureWoman /></span>
                      عائشة الدالاتي
                    </div>
                  </div>
                </section>

                <section className={styles.personField}>
                  <div className={styles.personFieldLabel}>الذرّيّة · {sidebarChildren.length}</div>
                  <div className={styles.relationRow}>
                    {sidebarChildren.map((c) => (
                      <div key={c.id} className={styles.relationChip}>
                        <span className={styles.relationAvatar}>
                          <NodeFigure gender={c.gender} />
                        </span>
                        {c.name}
                      </div>
                    ))}
                  </div>
                </section>

                <section className={styles.personField}>
                  <div className={styles.personFieldLabel}>سيرةٌ مختصرة</div>
                  <p className={styles.personBio}>
                    من أعيان تجّار حلب، رحل بأسرته إلى دمشق سنة ١٣٢٤ هـ،
                    وأسّس بيت السعيد الكبير في حيّ الصّالحيّة. شهِدَ له أهلُ بلده
                    بكرم الضّيافة وصِدق المعاملة.
                  </p>
                </section>

                <section className={styles.personField}>
                  <div className={styles.personFieldLabel}>وسوم</div>
                  <div className={styles.tagRow}>
                    <span className={styles.tagGold}>جدّ الأسرة</span>
                    <span className={styles.tagEmerald}>موثّق</span>
                    <span className={styles.tagMuted}>عاش ٧٥ عاماً</span>
                  </div>
                </section>
              </div>

              <footer className={styles.personActions}>
                <button type="button" className={styles.btnEmerald}>تعديل الفرد</button>
                <button type="button" className={styles.btnGhostSmall} aria-label="إضافة ابن">＋ ابن</button>
                <button type="button" className={styles.btnGhostSmall} aria-label="حذف">⌫</button>
              </footer>
            </aside>
          </div>
        </section>

        {/* ============ FORMS ============ */}
        <section className={styles.formsSection}>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.sectionKicker}>الاستمارات</span>
              <h2 className={styles.sectionTitle}>تحريرٌ هادئ، دقيق</h2>
            </div>
            <p className={styles.sectionHint}>
              حقولٌ مضيئة بحدودٍ ذهبيّة على الإلتقاط، توأمةٌ للتواريخ الهجريّة والميلاديّة،
              ومفاتيحُ تبديلٍ تُشعرُك بصقل الجوهر.
            </p>
          </div>

          <div className={styles.formGrid}>
            <form className={styles.formPanel} onSubmit={(e) => e.preventDefault()}>
              <div className={styles.formPanelHeader}>
                <span className={styles.formPanelKicker}>تعديل فرد</span>
                <h3 className={styles.formPanelTitle}>محمد السعيد</h3>
                <div className={styles.formPanelHint}>آخر تعديل: قبل ٣ أيّام</div>
              </div>

              <div className={styles.formBody}>
                <div className={styles.formRow}>
                  <label className={styles.formLabel}>الاسم الكامل</label>
                  <input className={styles.formInput} defaultValue="محمد السعيد" />
                </div>

                <div className={styles.formRow}>
                  <label className={styles.formLabel}>الكُنية</label>
                  <input className={styles.formInput} defaultValue="أبو أحمد" placeholder="اختياري" />
                  <div className={styles.formHint}>
                    <span className={styles.formHintDot} />
                    الكُنية اختياريّة وتُعرض في البطاقة
                  </div>
                </div>

                <div className={styles.formRow}>
                  <label className={styles.formLabel}>الجِنس</label>
                  <div className={styles.segmented}>
                    <button type="button" className={`${styles.segment} ${styles.segmentActive}`}>ذكر</button>
                    <button type="button" className={styles.segment}>أنثى</button>
                  </div>
                </div>

                <div className={styles.formRow}>
                  <label className={styles.formLabel}>تاريخ الميلاد</label>
                  <div className={styles.formRowSplit}>
                    <div className={styles.formInputGroup}>
                      <input className={styles.formInput} defaultValue="١٢٨٧/٠٤/١٢" />
                      <span className={styles.formInputSuffix}>هـ</span>
                    </div>
                    <div className={styles.formInputGroup}>
                      <input className={styles.formInput} defaultValue="١٨٧٠/٠٣/٠٨" />
                      <span className={styles.formInputSuffix}>م</span>
                    </div>
                  </div>
                </div>

                <div className={styles.formRow}>
                  <label className={styles.formLabel}>مكان الميلاد</label>
                  <div className={styles.autocomplete}>
                    <input className={styles.formInput} defaultValue="حل" placeholder="ابحث عن مدينة…" />
                    <ul className={styles.autocompleteList} role="listbox">
                      <li className={styles.autocompleteActive} role="option" aria-selected="true">
                        <span>حلب</span>
                        <span className={styles.autocompleteHint}>سوريا · محافظة حلب</span>
                      </li>
                      <li role="option">
                        <span>حلبا</span>
                        <span className={styles.autocompleteHint}>لبنان · عكّار</span>
                      </li>
                      <li role="option">
                        <span>حلحول</span>
                        <span className={styles.autocompleteHint}>فلسطين · الخليل</span>
                      </li>
                      <li className={styles.autocompleteAddNew} role="option">
                        ＋ إضافة «حل» كمكانٍ خاصّ بالعائلة
                      </li>
                    </ul>
                  </div>
                </div>

                <div className={styles.formRow}>
                  <label className={styles.formLabel}>سيرةٌ مختصرة</label>
                  <textarea
                    className={styles.formTextarea}
                    rows={4}
                    defaultValue="من أعيان تجّار حلب، رحل بأسرته إلى دمشق سنة ١٣٢٤ هـ…"
                  />
                  <div className={styles.formCharCount}>٥٢ / ١٠٠٠ حرف</div>
                </div>

                <div className={styles.formToggles}>
                  <label className={styles.switch}>
                    <input type="checkbox" defaultChecked />
                    <span className={styles.switchTrack}><span className={styles.switchThumb} /></span>
                    <span>متوفّى</span>
                  </label>
                  <label className={styles.switch}>
                    <input type="checkbox" />
                    <span className={styles.switchTrack}><span className={styles.switchThumb} /></span>
                    <span>خصوصيّة</span>
                  </label>
                  <label className={styles.switch}>
                    <input type="checkbox" />
                    <span className={styles.switchTrack}><span className={styles.switchThumb} /></span>
                    <span>أمّ ولد</span>
                  </label>
                </div>
              </div>

              <div className={styles.formActions}>
                <button type="submit" className={styles.btnPrimary}>حفظ التعديلات</button>
                <button type="button" className={styles.btnGhost}>إلغاء</button>
                <div className={styles.formStatus}>
                  <span className={styles.formStatusDot} />
                  مُسوّدةٌ محفوظةٌ تلقائيّاً
                </div>
              </div>
            </form>

            <aside className={styles.formSideHints}>
              <div className={styles.hintCard}>
                <span className={styles.hintIcon}>☪</span>
                <h4 className={styles.hintTitle}>التقاويم المزدوجة</h4>
                <p className={styles.hintBody}>
                  أدخلِ التاريخ بالهجريّ أو الميلاديّ أو كليهما — كما في سجلّات العائلة.
                </p>
              </div>
              <div className={styles.hintCard}>
                <span className={styles.hintIcon}>✦</span>
                <h4 className={styles.hintTitle}>الأماكن المحفوظة</h4>
                <p className={styles.hintBody}>
                  قاعدةٌ عالميّة من المدن، ويمكنك إضافة أماكن خاصّة بعائلتك كـ«دار الجدّ».
                </p>
              </div>
              <div className={styles.hintCard}>
                <span className={styles.hintIcon}>✧</span>
                <h4 className={styles.hintTitle}>الكُنية المستحبّة</h4>
                <p className={styles.hintBody}>
                  الكُنية (أبو فلان / أمّ فلان) تُبرز الفرد في الشجرة وتُستخدم في النَّسَب.
                </p>
              </div>
              <div className={styles.hintCard}>
                <span className={styles.hintIcon}>⌘</span>
                <h4 className={styles.hintTitle}>اختصارات سريعة</h4>
                <p className={styles.hintBody}>
                  <kbd className={styles.kbd}>⌘</kbd>
                  <kbd className={styles.kbd}>S</kbd>
                  للحفظ،&nbsp;
                  <kbd className={styles.kbd}>⌘</kbd>
                  <kbd className={styles.kbd}>Z</kbd>
                  للتراجع.
                </p>
              </div>
            </aside>
          </div>
        </section>

        {/* ============ MODALS ============ */}
        <section className={styles.modalsSection}>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.sectionKicker}>النّوافذ الطّافية</span>
              <h2 className={styles.sectionTitle}>قراراتٌ مصونةٌ بحاجز</h2>
            </div>
            <p className={styles.sectionHint}>
              طبقةٌ ضبابيّةٌ ثقيلة تُبرز القرار وتفصله عن المشهد.
              اللّون الذّهبيّ للحالات الاعتياديّة، والكَهرمانيّ للتحذيرات.
            </p>
          </div>

          <div className={styles.modalsStage}>
            <div className={styles.modalsBackdrop} aria-hidden>
              <div className={styles.modalsBackdropGrid} />
              {mockCanvasNodes.slice(0, 4).map((n) => (
                <div
                  key={n.id}
                  className={`${styles.mockNode} ${styles.mockNodeFaded}`}
                  style={{ left: `${n.x}%`, top: `${n.y + 10}%` }}
                >
                  <div className={`${styles.mockAvatar} ${n.gender === 'female' ? styles.female : ''}`}>
                    <NodeFigure gender={n.gender} />
                  </div>
                  <div className={styles.mockNodeText}>
                    <div>{n.name}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.modalsRow}>
              {/* --- Modal 1: Cascade delete (danger) --- */}
              <div className={`${styles.modal} ${styles.modalDanger}`} role="dialog" aria-modal="true">
                <div className={styles.modalIcon}>
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <path d="M12 3 L22 20 L2 20 Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="M12 10 L12 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <circle cx="12" cy="17" r="0.9" fill="currentColor" />
                  </svg>
                </div>
                <div className={styles.modalHead}>
                  <span className={styles.modalKicker}>تحذير — قرارٌ نهائيّ</span>
                  <h3 className={styles.modalTitle}>حَذْفُ سلسلةٍ كاملة</h3>
                  <p className={styles.modalLead}>
                    سيؤدّي حذفُ «أحمد السعيد» إلى إزالة <strong>١٢ فرداً</strong> من ذرّيّته،
                    وكسرِ مؤشّرَيْن خارجيّيْن من عائلة الدبّاغ.
                  </p>
                </div>

                <div className={styles.modalAffected}>
                  <div className={styles.modalSubLabel}>الأسماء المتأثّرة</div>
                  <div className={styles.modalChips}>
                    <span className={styles.nameChip}>يوسف</span>
                    <span className={styles.nameChip}>ليلى</span>
                    <span className={styles.nameChip}>سامي</span>
                    <span className={styles.nameChip}>نور</span>
                    <span className={styles.nameChip}>حسن</span>
                    <span className={styles.nameChip}>رقيّة</span>
                    <span className={styles.nameChipMuted}>+٦ أسماء</span>
                  </div>
                </div>

                <div className={styles.modalConfirm}>
                  <label className={styles.modalConfirmLabel}>
                    اكتب <strong>«أحمد السعيد»</strong> للتأكيد:
                  </label>
                  <input className={`${styles.formInput} ${styles.formInputDanger}`} placeholder="أحمد السعيد" />
                </div>

                <div className={styles.modalActions}>
                  <button type="button" className={styles.btnDanger} disabled>
                    حَذْفٌ نهائيّ
                  </button>
                  <button type="button" className={styles.btnGhost}>إلغاء</button>
                </div>
              </div>

              {/* --- Modal 2: Share branch --- */}
              <div className={styles.modal} role="dialog" aria-modal="true">
                <div className={`${styles.modalIcon} ${styles.modalIconGold}`}>
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <circle cx="6" cy="12" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    <circle cx="18" cy="6" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    <circle cx="18" cy="18" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M8 11 L16 7 M8 13 L16 17" stroke="currentColor" strokeWidth="1.2" />
                  </svg>
                </div>
                <div className={styles.modalHead}>
                  <span className={styles.modalKicker}>مؤشِّر فرع</span>
                  <h3 className={styles.modalTitle}>مشاركةُ فرعٍ مع عائلةٍ صديقة</h3>
                  <p className={styles.modalLead}>
                    أنشئ رمزاً آمناً يسمح لعائلة الدبّاغ برؤية ذرّيّة «محمد السعيد»
                    كجزءٍ من شجرتها — مع تحكُّمٍ كاملٍ في العُمق والصلاحية.
                  </p>
                </div>

                <div className={styles.shareTokenBox}>
                  <div className={styles.shareTokenLabel}>الرّمز الحاليّ</div>
                  <div className={styles.shareTokenValue}>
                    <span className={styles.shareTokenPrefix}>sl-branch-</span>
                    <code>a7f3b2e9c4d1</code>
                    <button type="button" className={styles.shareCopyBtn} aria-label="نسخ">
                      نسخ
                    </button>
                  </div>
                </div>

                <div className={styles.modalSettings}>
                  <div className={styles.modalSettingRow}>
                    <div>
                      <div className={styles.modalSettingLabel}>عُمق الفرع</div>
                      <div className={styles.modalSettingHint}>كم جيلاً تَحت الجذر</div>
                    </div>
                    <div className={styles.depthField}>
                      <input
                        type="text"
                        inputMode="numeric"
                        className={styles.depthInput}
                        defaultValue="٥"
                        aria-label="عدد الأجيال"
                      />
                      <span className={styles.depthSuffix}>أجيال</span>
                    </div>
                  </div>

                  <div className={styles.modalSettingRow}>
                    <div>
                      <div className={styles.modalSettingLabel}>الصلاحية</div>
                      <div className={styles.modalSettingHint}>ينتهي الرّمز تلقائيّاً</div>
                    </div>
                    <input className={styles.formInputSm} defaultValue="٢٠٢٧/٠٤/٢٠" />
                  </div>

                  <div className={styles.modalSettingRow}>
                    <div>
                      <div className={styles.modalSettingLabel}>ربطُ الأطفال بالمرسى</div>
                      <div className={styles.modalSettingHint}>يظهرون أبناءً للمرسى المُختار</div>
                    </div>
                    <label className={styles.switch}>
                      <input type="checkbox" defaultChecked />
                      <span className={styles.switchTrack}><span className={styles.switchThumb} /></span>
                    </label>
                  </div>
                </div>

                <div className={styles.modalActions}>
                  <button type="button" className={styles.btnPrimary}>إنشاءُ الرّمز</button>
                  <button type="button" className={styles.btnGhost}>إغلاق</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ SYSTEM / PALETTE ============ */}
        <section>
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.sectionKicker}>نظام التصميم</span>
              <h2 className={styles.sectionTitle}>اللغة البصريّة</h2>
            </div>
          </div>

          <div className={styles.systemGrid}>
            {/* Palette */}
            <div className={styles.systemCard}>
              <span className={styles.systemLabel}>ألوان التراث</span>
              <div className={styles.swatchRow}>
                <div className={styles.swatch} style={{ background: '#070b18' }} />
                <div className={styles.swatch} style={{ background: 'linear-gradient(135deg,#1a5d4a,#0f3a2d)' }} />
                <div className={styles.swatch} style={{ background: 'linear-gradient(135deg,#e6cf9e,#c8a865)' }} />
                <div className={styles.swatch} style={{ background: '#f4ead4' }} />
              </div>
              <div className={styles.swatchLabels}>
                <span>ليل</span>
                <span>زمردي</span>
                <span>ذهبي</span>
                <span>ورقي</span>
              </div>
              <ul className={styles.principleList} style={{ marginTop: 20 }}>
                <li>خلفيةٌ ليلية عميقة تُبرز المحتوى بدل أن تنافسه.</li>
                <li>ذهبيٌّ عتيق بدل الأزرق المؤسّسي لإحساسٍ أصيل.</li>
              </ul>
            </div>

            {/* Typography */}
            <div className={styles.systemCard}>
              <span className={styles.systemLabel}>الخطوط</span>
              <div className={styles.fontSample}>
                <div className={styles.fontSampleLabel}>العناوين · Reem Kufi</div>
                <div className={styles.fontSampleDisplay}>شَجَرةُ عائلتي</div>
              </div>
              <div className={styles.fontSample}>
                <div className={styles.fontSampleLabel}>الحِليَة · Aref Ruqaa</div>
                <div className={styles.fontSampleScript}>بسم الله الرحمن الرحيم</div>
              </div>
              <div className={styles.fontSample}>
                <div className={styles.fontSampleLabel}>المتن · Plex Sans Arabic</div>
                <div className={styles.fontSampleBody}>
                  نصٌّ تجريبيٌّ لقراءةٍ مريحةٍ وطويلة.
                </div>
              </div>
            </div>

            {/* Principles */}
            <div className={styles.systemCard}>
              <span className={styles.systemLabel}>المبادئ</span>
              <ul className={styles.principleList}>
                <li>زجاجٌ مُضبّب بحدودٍ ذهبيّةٍ رقيقة — عمقٌ بلا ضجيج.</li>
                <li>حضورٌ إنسانيّ: ظلال شخصيات بدل أيقوناتٍ عامّة.</li>
                <li>مَيَلانٌ ثلاثيّ الأبعاد محسوب لا يُشتّت القراءة.</li>
                <li>حركةٌ هادئة: ظهورٌ مُتدرّج وتحوّماتٌ لطيفة.</li>
              </ul>
            </div>
          </div>
        </section>

        <div className={styles.footnote}>
          ﴾ وَمِنْ آيَاتِهِ أَنْ خَلَقَ لَكُم مِّنْ أَنفُسِكُمْ أَزْوَاجًا ﴿
        </div>
      </div>
    </main>
  );
}

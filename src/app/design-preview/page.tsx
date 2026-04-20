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
          <div className={styles.wordmark}>صُلالَة</div>
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

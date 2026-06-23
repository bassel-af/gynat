'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { NodeFigure, FigureCluster } from '@/components/heritage/FigureCluster';
import styles from './page.module.css';

// =====================================================================
// MOCK DATA — believable family, several generations, all states.
// Purely static; no wiring. Every "person" carries an id so links can
// look real (href="#<id>") even though navigation is inert here.
// =====================================================================

type Gender = 'male' | 'female';

type Chip = {
  id: string;
  name: string;
  years?: string;
  gender: Gender;
  private?: boolean;
  /** Parent's id, when that parent is also shown in this section (drives the
      relationship hover/focus highlight: cousin→uncle, grandchild→child…). */
  parentId?: string;
};

// A married-in mother, rendered as: «<her name> بنت <her father> بن <his father>…».
// `fathers` is her OWN fathers-only chain, ordered nearest → oldest
// (her father first). `mother` is HER mother — the recursion into the female
// line (mother → her mother → her mother …), unbounded, collapsed by default.
type Mother = Chip & {
  gender: 'female';
  fathers: Chip[];
  mother?: Mother;
};

// A spine ancestor that also carries his married-in mother (recursive).
type SpineChip = Chip & { mother?: Mother };

// The subject of the page
const subject = {
  id: 'p-basel',
  given: 'باسل',
  surname: 'آل السعيد',
  kunya: 'أبو عمر',
  gender: 'male' as Gender,
  hijri: '١٤٠٠ هـ',
  greg: '١٩٨٠ م',
  living: true,
  birthPlace: 'حلب · الحي القديم',
  notes:
    'هاجر إلى دمشق عام ١٤١٠ هـ ثم عاد إلى حلب. تتطابق سنة ميلاده في سجل العائلة مع ما ورد في وثيقة النفوس. يُراجَع اسم جده الأكبر للتثبت من ضبطه.',
};

// Paternal nasab chain (oldest → person). Each token a separate link.
// Includes one private/خاص ancestor to show that state.
// Each spine man also carries his married-in mother + her fathers-only line.
const paternalChain: SpineChip[] = [
  {
    id: 'p-ibrahim',
    name: 'إبراهيم',
    years: '١٨٢٠ – ١٨٩٥',
    gender: 'male',
    // إبراهيم's mother حفصة + her fathers (with a خاص father in her chain),
    // and one further level into her own mother.
    mother: {
      id: 'pm-ib',
      name: 'حفصة الزعبي',
      years: '١٨٠٠ – ١٨٧٥',
      gender: 'female',
      fathers: [
        { id: 'pm-ib-f', name: 'عبدالله الزعبي', years: '١٧٧٠ – ١٨٤٠', gender: 'male' },
        { id: 'pm-ib-priv', name: 'خاص', gender: 'male', private: true },
      ],
      mother: {
        id: 'pm-ib-m',
        name: 'سارة الزعبي',
        years: '١٧٨٠ – ١٨٥٠',
        gender: 'female',
        fathers: [{ id: 'pm-ib-m-f', name: 'حسن المغربي', years: '١٧٥٠ – ١٨٢٠', gender: 'male' }],
      },
    },
  },
  { id: 'p-private-anc', name: 'خاص', gender: 'male', private: true },
  {
    id: 'p-omar1',
    name: 'عمر',
    years: '١٨٧٠ – ١٩٤٠',
    gender: 'male',
    mother: {
      id: 'pm-omar',
      name: 'آمنة القدسي',
      years: '١٨٥٠ – ١٩٢٥',
      gender: 'female',
      fathers: [
        { id: 'pm-omar-f', name: 'يوسف القدسي', years: '١٨٤٥ – ١٩١٠', gender: 'male' },
        { id: 'pm-omar-gf', name: 'مصطفى القدسي', years: '١٨٢٠ – ١٨٩٠', gender: 'male' },
      ],
    },
  },
  {
    id: 'p-khaled',
    name: 'خالد',
    years: '١٩٠٠ – ١٩٧٢',
    gender: 'male',
    mother: {
      id: 'pm-khaled',
      name: 'خديجة المللي',
      years: '١٨٨٠ – ١٩٦٠',
      gender: 'female',
      fathers: [{ id: 'pm-khaled-f', name: 'سعيد المللي', years: '١٨٥٥ – ١٩٢٠', gender: 'male' }],
    },
  },
  {
    id: 'p-abdulnasser',
    name: 'عبدالناصر',
    years: '١٩٤٥ – ٢٠١٨',
    gender: 'male',
    mother: {
      id: 'pm-an',
      name: 'فاطمة الحموي',
      years: '١٩٢٢ – ٢٠٠٥',
      gender: 'female',
      fathers: [
        { id: 'pm-an-f', name: 'محمود الحموي', years: '١٩٠٠ – ١٩٧٨', gender: 'male' },
        { id: 'pm-an-gf', name: 'إبراهيم الحموي', years: '١٨٧٥ – ١٩٤٥', gender: 'male' },
      ],
    },
  },
];

// نسب الأم — the mother's PATERNAL chain (fathers only). Only the mother
// herself is female (at the bottom); above her it is her father, his father…
// Oldest → mother. e.g. رقية بنت حسن بن سليمان.
// Each MAN on this spine also carries HIS married-in mother + her fathers-line.
// رقية (the mother herself) does not carry one — her line is THIS whole column.
const maternalChain: SpineChip[] = [
  {
    id: 'm-suleiman',
    name: 'سليمان الدباغ',
    years: '١٨٥٠ – ١٩٢٠',
    gender: 'male',
    mother: {
      id: 'mm-sul',
      name: 'زينب الكردية',
      years: '١٨٢٥ – ١٩٠٠',
      gender: 'female',
      fathers: [{ id: 'mm-sul-f', name: 'عمر الكردي', years: '١٨٠٠ – ١٨٧٠', gender: 'male' }],
    },
  },
  {
    id: 'm-hasan',
    name: 'حسن الدباغ',
    years: '١٩١٥ – ١٩٨٨',
    gender: 'male',
    mother: {
      id: 'mm-has',
      name: 'صفية العطار',
      years: '١٨٩٠ – ١٩٧٠',
      gender: 'female',
      fathers: [
        { id: 'mm-has-f', name: 'كامل العطار', years: '١٨٧٠ – ١٩٤٠', gender: 'male' },
        { id: 'mm-has-gf', name: 'أحمد العطار', years: '١٨٤٥ – ١٩١٥', gender: 'male' },
      ],
    },
  },
  // رقية — the person's OWN mother. Deep recursion into her female line so the
  // progressive «نسب أمها» drill-up is demonstrable (4 nested mothers).
  {
    id: 'm-mother',
    name: 'رقية الدباغ',
    years: '١٩٥٠',
    gender: 'female',
    mother: {
      id: 'rq-m1',
      name: 'نجيبة الحفار',
      years: '١٩٢٥ – ٢٠١٠',
      gender: 'female',
      fathers: [{ id: 'rq-m1-f', name: 'توفيق الحفار', years: '١٩٠٠ – ١٩٧٢', gender: 'male' }],
      mother: {
        id: 'rq-m2',
        name: 'مريم السمان',
        years: '١٩٠٠ – ١٩٧٥',
        gender: 'female',
        fathers: [
          { id: 'rq-m2-f', name: 'رشيد السمان', years: '١٨٧٠ – ١٩٤٠', gender: 'male' },
          { id: 'rq-m2-gf', name: 'خاص', gender: 'male', private: true },
        ],
        mother: {
          id: 'rq-m3',
          name: 'لطيفة البارودي',
          years: '١٨٧٥ – ١٩٥٠',
          gender: 'female',
          fathers: [{ id: 'rq-m3-f', name: 'عبد الرحمن البارودي', years: '١٨٤٥ – ١٩٢٠', gender: 'male' }],
          mother: {
            id: 'rq-m4',
            name: 'عائشة الجابري',
            years: '١٨٥٠ – ١٩٢٥',
            gender: 'female',
            fathers: [{ id: 'rq-m4-f', name: 'سليم الجابري', years: '١٨٢٠ – ١٨٩٥', gender: 'male' }],
          },
        },
      },
    },
  },
];

const spouses: Chip[] = [
  { id: 's-layla', name: 'ليلى الدالاتي', years: '١٩٨٤', gender: 'female' },
  { id: 's-mariam', name: 'مريم الدباغ', years: '١٩٨٨', gender: 'female' },
];

const children: Chip[] = [
  { id: 'c-omar', name: 'عمر', years: '٢٠٠٨', gender: 'male' },
  { id: 'c-yousef', name: 'يوسف', years: '٢٠١٠', gender: 'male' },
  { id: 'c-noor', name: 'نور', years: '٢٠١٣', gender: 'female' },
  { id: 'c-sara', name: 'سارة', years: '٢٠١٦', gender: 'female' },
];

// الأحفاد — grandchildren (parentId → one of the person's OWN children).
// عمر has two (shared parent), نور has one; سارة has none (highlight variety).
const grandchildren: Chip[] = [
  { id: 'g-tasnim', name: 'تسنيم', gender: 'female', parentId: 'c-omar' },
  { id: 'g-ziad', name: 'زياد', gender: 'male', parentId: 'c-omar' },
  { id: 'g-lina', name: 'لينا', gender: 'female', parentId: 'c-noor' },
];

const siblings: Chip[] = [
  { id: 'sib-ahmad', name: 'أحمد', years: '١٩٧٨', gender: 'male' },
  { id: 'sib-huda', name: 'هدى', years: '١٩٨٢', gender: 'female' },
  { id: 'sib-private', name: 'خاص', gender: 'female', private: true },
];

const paternalUncles: Chip[] = [
  { id: 'u-walid', name: 'وليد', years: '١٩٤٢ – ٢٠٠٩', gender: 'male' },
  { id: 'u-sami', name: 'سامي', years: '١٩٤٨', gender: 'male' },
];

// الأخوال — maternal uncles (the mother's brothers)
const maternalUncles: Chip[] = [
  { id: 'mu-ghassan', name: 'غسان الدباغ', years: '١٩٥٢', gender: 'male' },
  { id: 'mu-anwar', name: 'أنور الدباغ', years: '١٩٥٥ – ٢٠٢١', gender: 'male' },
];

// أولاد العمومة — children of the paternal uncles (parentId → an عم)
const paternalCousins: Chip[] = [
  { id: 'pc-tareq', name: 'طارق', gender: 'male', parentId: 'u-walid' },
  { id: 'pc-rana', name: 'رنا', gender: 'female', parentId: 'u-walid' },
  { id: 'pc-fadi', name: 'فادي', gender: 'male', parentId: 'u-sami' },
  { id: 'pc-dima', name: 'ديمة', gender: 'female', parentId: 'u-sami' },
];

// أبناء الأخوال — children of the maternal uncles (parentId → a خال)
const maternalCousins: Chip[] = [
  { id: 'mc-kareem', name: 'كريم', gender: 'male', parentId: 'mu-ghassan' },
  { id: 'mc-salma', name: 'سلمى', gender: 'female', parentId: 'mu-ghassan' },
  { id: 'mc-jad', name: 'جاد', gender: 'male', parentId: 'mu-anwar' },
];

// Rada'a (milk-kinship) relations — distinct, religiously meaningful.
const radaFather: Chip[] = [
  { id: 'r-father', name: 'عبد القادر الحلبي', years: '١٩٤٤ – ٢٠١٢', gender: 'male' },
];
const radaMother: Chip[] = [
  { id: 'r-mother', name: 'زينب الحلبي', years: '١٩٤٨', gender: 'female' },
];
const radaSiblings: Chip[] = [
  { id: 'r-sib-bilal', name: 'بلال الحلبي', years: '١٩٧٩', gender: 'male' },
  { id: 'r-sib-aisha', name: 'عائشة الحلبي', years: '١٩٨١', gender: 'female' },
];

// =====================================================================
// Reusable link primitives — EVERY person name is a link.
// =====================================================================

/** Inline person link used inside the nasab ribbon. */
function PersonName({ chip, kind = 'default' }: { chip: Chip; kind?: 'default' | 'lead' }) {
  if (chip.private) {
    return <span className={styles.privateInline} aria-label="فرد خاص">خاص</span>;
  }
  return (
    <a
      href={`#${chip.id}`}
      className={`${styles.personLink} ${kind === 'lead' ? styles.personLinkLead : ''}`}
    >
      {chip.name}
    </a>
  );
}

// ---------------------------------------------------------------------------
// Relationship highlight — hovering/focusing/tapping a chip in the family
// section highlights that person's parent + children that are ALSO shown here.
// ---------------------------------------------------------------------------

type HighlightState = {
  activeId: string | null;
  relatedIds: ReadonlySet<string>;
  /** Set the active person (hover / focus / tap). */
  activate: (id: string | null) => void;
  /** Toggle for touch: tapping the active chip again clears it. */
  toggle: (id: string) => void;
};

const HighlightContext = createContext<HighlightState | null>(null);

/**
 * Provider over the family section. Given the full set of chips shown in the
 * section, it precomputes, for every id, the ids of its parent + children that
 * are themselves present (so the highlight only lights up VISIBLE relatives).
 */
function FamilyHighlightProvider({
  chips,
  children,
}: {
  chips: Chip[];
  children: React.ReactNode;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  // id → set of related (parent + children) ids that are present in the section.
  const relationsById = useMemo(() => {
    const present = new Set(chips.map((c) => c.id));
    const map = new Map<string, Set<string>>();
    const ensure = (id: string) => {
      let s = map.get(id);
      if (!s) { s = new Set(); map.set(id, s); }
      return s;
    };
    for (const c of chips) {
      if (c.parentId && present.has(c.parentId)) {
        ensure(c.id).add(c.parentId);   // child → its parent
        ensure(c.parentId).add(c.id);   // parent → its child
      }
    }
    return map;
  }, [chips]);

  const activate = useCallback((id: string | null) => setActiveId(id), []);
  const toggle = useCallback(
    (id: string) => setActiveId((cur) => (cur === id ? null : id)),
    [],
  );

  const value = useMemo<HighlightState>(
    () => ({
      activeId,
      relatedIds: activeId ? relationsById.get(activeId) ?? new Set() : new Set(),
      activate,
      toggle,
    }),
    [activeId, relationsById, activate, toggle],
  );

  // Tapping empty space inside the section clears the active highlight (touch).
  const onBackgroundClick = useCallback(
    (e: React.MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-chip]')) setActiveId(null);
    },
    [],
  );

  return (
    <HighlightContext.Provider value={value}>
      <div onClick={onBackgroundClick}>{children}</div>
    </HighlightContext.Provider>
  );
}

/** A relation chip (avatar + linked name + optional years). */
function RelationChip({ chip }: { chip: Chip }) {
  const hl = useContext(HighlightContext);

  if (chip.private) {
    return (
      <span className={`${styles.relationChip} ${styles.relationChipPrivate}`}>
        <span className={styles.relationAvatar}>
          <NodeFigure gender={chip.gender} />
        </span>
        <span className={styles.relationText}>
          <span className={styles.privateName}>خاص</span>
        </span>
      </span>
    );
  }

  const isActive = hl?.activeId === chip.id;
  const isRelated = hl?.relatedIds.has(chip.id) ?? false;
  // While SOMETHING is active and this chip is neither it nor a relative, dim it.
  const isMuted = !!hl?.activeId && !isActive && !isRelated;

  const cls = [
    styles.relationChip,
    isActive ? styles.chipActive : '',
    isRelated ? styles.chipRelated : '',
    isMuted ? styles.chipMuted : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <a
      href={`#${chip.id}`}
      className={cls}
      data-chip="1"
      // Desktop ONLY: hover + keyboard focus highlight relatives.
      // Pointer-hover is mouse-only. On TOUCH there is no highlight at all —
      // a tap just opens the person (the related father/son is usually
      // off-screen on a phone, so highlighting it is pointless; the person's
      // own page is the better, fully-visible relationship view).
      onPointerEnter={(e) => { if (e.pointerType !== 'touch') hl?.activate(chip.id); }}
      onPointerLeave={(e) => { if (e.pointerType !== 'touch') hl?.activate(null); }}
      onFocus={() => hl?.activate(chip.id)}
      onBlur={() => hl?.activate(null)}
    >
      <span className={styles.relationAvatar}>
        <NodeFigure gender={chip.gender} />
      </span>
      <span className={styles.relationText}>
        <span className={styles.relationName}>{chip.name}</span>
        {chip.years && <span className={styles.relationYears}>{chip.years}</span>}
      </span>
    </a>
  );
}

/** Small inline person link tuned for the green mother-ribbon. */
function MotherName({ chip }: { chip: Chip }) {
  if (chip.private) {
    return <span className={styles.motherPrivate}>خاص</span>;
  }
  return (
    <a href={`#${chip.id}`} className={styles.motherLink}>
      {chip.name}
    </a>
  );
}

/**
 * One mother's nasab as a green ribbon: «<her name> بنت <father> بن <grandfather>».
 * `mother.fathers` is ordered nearest → oldest (her father first), all male,
 * fathers-only. The connector before the FIRST father is «بنت» (she is female);
 * deeper connectors are «بن» (descending from a male).
 */
function MotherRibbon({ mother }: { mother: Mother }) {
  return (
    <div className={styles.motherRibbon}>
      <span className={styles.motherAvatar}>
        <NodeFigure gender="female" />
      </span>
      <MotherName chip={mother} />
      {mother.years && <span className={styles.motherYears}>{mother.years}</span>}
      {mother.fathers.map((f, i) => (
        <span key={f.id} className={styles.motherSeg}>
          <span className={styles.motherConnector}>{i === 0 ? 'بنت' : 'بن'}</span>
          <MotherName chip={f} />
        </span>
      ))}
    </div>
  );
}

/**
 * Recursive, collapsed-by-default disclosure into the FEMALE line.
 * `mother` is the woman whose nasab opens here; `childGender` is the gender of
 * the person SHE is the mother of (drives «نسب أمه» vs «نسب أمها» on the label).
 * Native <details> → touch + keyboard friendly, zero JS state, at every level.
 */
function MotherDisclosure({ mother, childGender }: { mother: Mother; childGender: Gender }) {
  return (
    <details className={styles.motherDisclosure}>
      <summary className={styles.motherSummary}>
        <span className={styles.motherSummaryDot} aria-hidden />
        {childGender === 'female' ? 'نسب أمها' : 'نسب أمه'}
        <span className={styles.motherChevron} aria-hidden>⌄</span>
      </summary>
      <div className={styles.motherBody}>
        <MotherRibbon mother={mother} />
        {/* Recurse into HER mother — unbounded, still collapsed by default. */}
        {mother.mother && <MotherDisclosure mother={mother.mother} childGender="female" />}
      </div>
    </details>
  );
}

/** A node in one of the bloodline columns. */
function LineageNode({
  chip,
  badge,
  variant,
}: {
  chip: SpineChip;
  badge?: string;
  variant: 'paternal' | 'maternal';
}) {
  const inner = (
    <>
      <span className={styles.lineageAvatar}>
        <NodeFigure gender={chip.gender} />
      </span>
      <span className={styles.lineageText}>
        <span className={styles.lineageName}>
          {chip.private ? <span className={styles.privateName}>خاص</span> : chip.name}
        </span>
        {chip.years && <span className={styles.lineageYears}>{chip.years}</span>}
      </span>
      {badge && <span className={styles.lineageBadge}>{badge}</span>}
    </>
  );

  const cls = `${styles.lineageNode} ${styles[variant]} ${chip.private ? styles.lineageNodePrivate : ''}`;

  const card = chip.private ? (
    <div className={cls}>{inner}</div>
  ) : (
    <a href={`#${chip.id}`} className={cls}>
      {inner}
    </a>
  );

  return (
    <div className={styles.lineageNodeWrap}>
      {card}
      {chip.mother && <MotherDisclosure mother={chip.mother} childGender={chip.gender} />}
    </div>
  );
}

function ChipGroup({ label, count, chips }: { label: string; count?: number; chips: Chip[] }) {
  return (
    <section className={styles.familyGroup}>
      <div className={styles.familyGroupLabel}>
        {label}
        {typeof count === 'number' && <span className={styles.familyGroupCount}>{count}</span>}
      </div>
      <div className={styles.relationRow}>
        {chips.map((c) => (
          <RelationChip key={c.id} chip={c} />
        ))}
      </div>
    </section>
  );
}

// All chips rendered inside the family section — the universe over which the
// relationship highlight is computed. (Spouses + record people are excluded;
// the highlight is about parent↔child links shown here.)
const familyChips: Chip[] = [
  ...children,
  ...grandchildren,
  ...siblings,
  ...paternalUncles,
  ...maternalUncles,
  ...paternalCousins,
  ...maternalCousins,
];

// =====================================================================

export default function PersonPreviewPage() {
  return (
    <main className={styles.root}>
      <div className={styles.page}>
        {/* ============ TOP BAR ============ */}
        <nav className={styles.topbar}>
          <a href="#back" className={styles.backLink}>
            <span aria-hidden>→</span> رجوع إلى الشجرة
          </a>
          <span className={styles.previewTag}>
            <span className={styles.previewDot} /> صفحة الشخص · معاينة
          </span>
        </nav>

        {/* ============ HERO — nasab ribbon ============ */}
        <header className={styles.hero}>
          <span className={styles.eyebrow}>صفحة الشخص</span>

          {/* The signature: full patronymic chain, one continuous ribbon.
              Names are readable body font; only flourishes are display/script. */}
          <div className={styles.ribbonScroller}>
            <h1 className={styles.ribbon}>
              <PersonName chip={{ id: subject.id, name: subject.given, gender: subject.gender }} kind="lead" />
              {[...paternalChain].reverse().map((anc) => (
                <span key={anc.id} className={styles.ribbonSegment}>
                  <span className={styles.nasabConnector}>
                    {anc.gender === 'female' ? 'بنت' : 'بن'}
                  </span>
                  <PersonName chip={anc} />
                </span>
              ))}
              <span className={styles.ribbonSurname}>{subject.surname}</span>
            </h1>
          </div>

          <div className={styles.heroMeta}>
            {subject.kunya && <span className={styles.kunya}>{subject.kunya}</span>}
            <span className={styles.metaDivider}>◆</span>
            <span className={styles.dates}>
              {subject.hijri} <span className={styles.dateSep}>≡</span> {subject.greg}
            </span>
          </div>

          <div className={styles.tagRow}>
            <span className={styles.tagEmerald}>على قيد الحياة</span>
            <span className={styles.tagMuted}>من بيت السعيد</span>
          </div>
        </header>

        {/* ============ TWO BLOODLINES BAND ============ */}
        <section className={styles.bloodlines}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>سلسلتا النسب</h2>
            <p className={styles.sectionHint}>
              نسب الأب ونسب الأم جنبا إلى جنب. ولكل جد على السلسلة أمٌّ تزوجت في
              العائلة — افتح «نسب أمه» لترى اسمها ونسب آبائها.
            </p>
          </div>

          <div className={styles.bloodlinesGrid}>
            {/* PATERNAL — right (lead) */}
            <div className={`${styles.lineageColumn} ${styles.colPaternal}`}>
              <div className={styles.lineageColHead}>
                <span className={styles.lineageColKicker}>نسب الأب</span>
              </div>
              <div className={styles.lineageStack}>
                <div className={styles.lineageRoot}>أقدم سلف موثق</div>
                {paternalChain.map((anc, i) => (
                  <LineageNode
                    key={anc.id}
                    chip={anc}
                    variant="paternal"
                    badge={i === paternalChain.length - 1 ? 'الأب' : undefined}
                  />
                ))}
                <div className={`${styles.lineageNode} ${styles.lineageSelf}`}>
                  <span className={styles.lineageAvatar}>
                    <NodeFigure gender={subject.gender} />
                  </span>
                  <span className={styles.lineageText}>
                    <span className={styles.lineageName}>{subject.given}</span>
                    <span className={styles.lineageYears}>الشخص المعروض</span>
                  </span>
                </div>
              </div>
            </div>

            {/* MATERNAL — left */}
            <div className={`${styles.lineageColumn} ${styles.colMaternal}`}>
              <div className={styles.lineageColHead}>
                <span className={styles.lineageColKicker}>نسب الأم</span>
              </div>
              <div className={styles.lineageStack}>
                <div className={styles.lineageRoot}>أقدم سلف موثق</div>
                {maternalChain.map((anc, i) => (
                  <LineageNode
                    key={anc.id}
                    chip={anc}
                    variant="maternal"
                    badge={i === maternalChain.length - 1 ? 'الأم' : undefined}
                  />
                ))}
                <div className={`${styles.lineageNode} ${styles.lineageSelf} ${styles.lineageSelfMuted}`}>
                  <span className={styles.lineageAvatar}>
                    <NodeFigure gender={subject.gender} />
                  </span>
                  <span className={styles.lineageText}>
                    <span className={styles.lineageName}>{subject.given}</span>
                    <span className={styles.lineageYears}>الشخص المعروض</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ IMMEDIATE & EXTENDED FAMILY ============ */}
        <section className={styles.family}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>الأسرة والصلات</h2>
            <p className={styles.sectionHint}>
              الزواج، الذرية والأحفاد، الإخوة، وأبناء العمومة والأخوال.
            </p>
          </div>

          <FamilyHighlightProvider chips={familyChips}>

          {/* Per-marriage grouping (polygamy) */}
          <div className={styles.marriagesWrap}>
            <div className={styles.marriageCard}>
              <div className={styles.marriageHead}>
                <span className={styles.marriageLabel}>الزواج الأول</span>
                <RelationChip chip={spouses[0]} />
                <span className={styles.marriageMeta}>عقد ١٤٢٧ هـ · حلب</span>
              </div>
              <div className={styles.familyGroupLabel}>
                الذرية <span className={styles.familyGroupCount}>3</span>
              </div>
              <div className={styles.relationRow}>
                {children.slice(0, 3).map((c) => (
                  <RelationChip key={c.id} chip={c} />
                ))}
              </div>
            </div>

            <div className={styles.marriageCard}>
              <div className={styles.marriageHead}>
                <span className={styles.marriageLabel}>الزواج الثاني</span>
                <RelationChip chip={spouses[1]} />
                <span className={styles.marriageMeta}>عقد ١٤٣٦ هـ · دمشق</span>
              </div>
              <div className={styles.familyGroupLabel}>
                الذرية <span className={styles.familyGroupCount}>1</span>
              </div>
              <div className={styles.relationRow}>
                {children.slice(3).map((c) => (
                  <RelationChip key={c.id} chip={c} />
                ))}
              </div>
            </div>
          </div>

          {/* الأحفاد — grandchildren follow the children */}
          <div className={styles.grandchildrenWrap}>
            <ChipGroup label="الأحفاد" count={grandchildren.length} chips={grandchildren} />
          </div>

          <div className={styles.familyColumns}>
            <ChipGroup label="الإخوة والأخوات" count={siblings.length} chips={siblings} />
            <ChipGroup label="الأعمام" count={paternalUncles.length} chips={paternalUncles} />
            <ChipGroup label="الأخوال" count={maternalUncles.length} chips={maternalUncles} />
            <ChipGroup label="أولاد العمومة" count={paternalCousins.length} chips={paternalCousins} />
            <ChipGroup label="أبناء الأخوال" count={maternalCousins.length} chips={maternalCousins} />
          </div>

          </FamilyHighlightProvider>

          {/* Rada'a — distinct emerald sub-section (no parent↔child highlight here) */}
          <div className={styles.radaBlock}>
            <div className={styles.radaHead}>
              <span className={styles.radaKicker}>صلات الرضاعة</span>
              <span className={styles.radaSub}>قرابة شرعية محفوظة إلى جانب النسب</span>
            </div>
            <div className={styles.familyColumns}>
              <ChipGroup label="الأب من الرضاعة" chips={radaFather} />
              <ChipGroup label="الأم من الرضاعة" chips={radaMother} />
              <ChipGroup label="الإخوة من الرضاعة" count={radaSiblings.length} chips={radaSiblings} />
            </div>
          </div>
        </section>
        {/* /family */}

        {/* ============ THE RECORD ============ */}
        <section className={styles.record}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>السجل</h2>
            <p className={styles.sectionHint}>المولد، والمكان، والملاحظات.</p>
          </div>

          <div className={styles.recordGrid}>
            <div className={styles.recordField}>
              <div className={styles.recordLabel}>الميلاد</div>
              <div className={styles.recordValue}>{subject.birthPlace}</div>
              <div className={styles.recordHint}>{subject.hijri} ≡ {subject.greg}</div>
            </div>

            {/* Death field only for deceased — never show الوفاة for a living
                person (the "على قيد الحياة" tag at the top already says so, and a
                dash here reads as "this person is dead" at a glance). */}
            {!subject.living && (
              <div className={styles.recordField}>
                <div className={styles.recordLabel}>الوفاة</div>
                <div className={styles.recordValue}>—</div>
              </div>
            )}

            <div className={styles.recordField}>
              <div className={styles.recordLabel}>الكنية</div>
              <div className={styles.recordValue}>{subject.kunya}</div>
            </div>

            <div className={styles.recordField}>
              <div className={styles.recordLabel}>البيت</div>
              <div className={styles.recordValue}>{subject.surname}</div>
            </div>

            {/* سيرة مختصرة (biography) intentionally deferred to its own chunk —
                needs a new data-model field + GEDCOM _BIO tag. Not in this page. */}
            <div className={`${styles.recordField} ${styles.recordFieldWide}`}>
              <div className={styles.recordLabel}>ملاحظات</div>
              <p className={styles.recordBio}>{subject.notes}</p>
            </div>
          </div>

          <div className={styles.recordOrnament} aria-hidden>
            <FigureCluster variant="trio" />
          </div>
        </section>

        {/* ============ VIEW IN TREE ============ */}
        <div className={styles.actions}>
          <a href="#tree" className={styles.treeBtn}>
            <span aria-hidden>⌖</span> عرض في الشجرة
          </a>
        </div>

        <div className={styles.footnote}>
          ﴿ وَجَعَلْنَاكُمْ شُعُوبًا وَقَبَائِلَ لِتَعَارَفُوا ﴾
        </div>
      </div>
    </main>
  );
}

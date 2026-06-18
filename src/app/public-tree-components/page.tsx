'use client';

/**
 * Public Tree — COMPONENT PREVIEW HARNESS.
 *
 * Renders the REAL, production presentational components (from
 * `@/components/public-tree`) fed by static fixtures, so the owner can review
 * the actual UI. This harness is NOT the live public route — it has no data
 * fetching and no feature logic; it only mounts the components.
 *
 * Dev-only: noindex + production `notFound()` guard in layout.tsx.
 */

import { useState } from 'react';
import type { CalendarPreference } from '@/lib/calendar-helpers';
import {
  PublicTreeHeader,
  PublicGrowthCTA,
  PublicTreeState,
  MakePrivateDialog,
  ReportForm,
  VisibilityLadder,
  type VisibilityLevel,
  PublishCheckpoint,
  PublishFlow,
} from '@/components/public-tree';
import { SAMPLE_CHECKPOINT_DATA } from '@/components/public-tree/PublishFlow/sample-data';
import { checkpointData } from './fixtures';
import styles from './page.module.css';

/** Zero-living case — the checkpoint should skip the whole review section. */
const EMPTY_CHECKPOINT_DATA = { livingCount: 0, attention: [], households: [] };

export default function PublicTreeComponentsPage() {
  const [calendar, setCalendar] = useState<CalendarPreference>('hijri');
  const [makePrivateOpen, setMakePrivateOpen] = useState(false);
  const [visibility, setVisibility] = useState<VisibilityLevel>('private');
  const [allowReuse, setAllowReuse] = useState(false);
  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const [checkpointSearchable, setCheckpointSearchable] = useState(false);
  const [checkpointZeroOpen, setCheckpointZeroOpen] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);
  const [flowFromLevel, setFlowFromLevel] = useState<VisibilityLevel>('private');

  return (
    <main className={`heritage-surface ${styles.root}`}>
      <div className={styles.page}>
        <header className={styles.docHead}>
          <div className={styles.wordmark}>جينات</div>
          <span className={styles.docBadge}>معاينة المكوّنات · الشجرة العامّة</span>
        </header>

        <p className={styles.docIntro}>
          هذه معاينةٌ للمكوّنات الحقيقيّة لميزة «الشجرة العامّة» وهي تُبنى — بمحتوى تجريبيّ ثابت، بلا بياناتٍ
          حقيقيّة وبلا منطق. الغرض مراجعة الشكل النهائيّ مبكّراً. الرحلة الكاملة القابلة للنقر مُدمجة في صفحة
          الشجرة الحقيقيّة عبر زرّ «نشر الشجرة»؛ وهنا نسخةٌ منها للمعاينة المعزولة.
        </p>

        {/* ===== Full clickable journey ===== */}
        <Section title="الرحلة الكاملة (قابلة للنقر)" note="اختيار الظهور ← المراجعة ← التأكيد ← رابط المشاركة">
          <div className={styles.launchRow}>
            <button
              type="button"
              className={styles.launchBtn}
              onClick={() => { setFlowFromLevel('private'); setFlowOpen(true); }}
            >
              ابدأ رحلة النشر (من خاصّة)
            </button>
            <button
              type="button"
              className={styles.launchBtn}
              onClick={() => { setFlowFromLevel('link'); setFlowOpen(true); }}
            >
              منشورة عبر الرابط (لوحة الإدارة)
            </button>
            <button
              type="button"
              className={styles.launchBtn}
              onClick={() => { setFlowFromLevel('search'); setFlowOpen(true); }}
            >
              منشورة وتظهر في محركات البحث (لوحة الإدارة)
            </button>
          </div>
          <PublishFlow
            isOpen={flowOpen}
            onClose={() => setFlowOpen(false)}
            familyName="عائلة السعيد"
            currentLevel={flowFromLevel}
            checkpointData={SAMPLE_CHECKPOINT_DATA}
            shareUrl="https://gynat.com/family/al-saeed"
          />
        </Section>

        {/* ===== PublicTreeHeader ===== */}
        <Section title="شريط الزائر العلويّ" note="اسم العائلة · مفتاح التقويم · علامة جينات">
          <div className={styles.headerStage}>
            <PublicTreeHeader
              familyName="عائلة السعيد"
              subtitle="حلب · ٦ أجيال موثّقة"
              calendar={calendar}
              onCalendarChange={setCalendar}
            />
          </div>
          <p className={styles.live}>التقويم المختار حاليّاً: {calendar === 'hijri' ? 'هجري' : 'ميلادي'} (تفاعليّ للمعاينة)</p>
        </Section>

        {/* ===== PublicGrowthCTA ===== */}
        <Section title="دعوة إنشاء شجرة" note="بطاقة لسطح المكتب · زرّ للهاتف">
          <div className={styles.ctaRow}>
            <div className={styles.ctaCard}>
              <span className={styles.miniLabel}>بطاقة (سطح المكتب)</span>
              <PublicGrowthCTA variant="card" />
            </div>
            <div className={styles.ctaBar}>
              <span className={styles.miniLabel}>زرّ (الهاتف)</span>
              <PublicGrowthCTA variant="bar" />
            </div>
          </div>
        </Section>

        {/* ===== State screens ===== */}
        <Section title="حالات الصفحة" note="تحميل · لا معلومات · غير متاحة">
          <div className={styles.stateGrid}>
            <PublicTreeState variant="loading" />
            <PublicTreeState variant="empty" />
            <PublicTreeState variant="unavailable" />
          </div>
        </Section>

        {/* ===== VisibilityLadder ===== */}
        <Section title="سُلَّم الظهور" note="ثلاث درجات + خانة الضمّ إلى المجموعات">
          <VisibilityLadder
            level={visibility}
            onLevelChange={setVisibility}
            allowReuse={allowReuse}
            onAllowReuseChange={setAllowReuse}
          />
          <p className={styles.live}>
            الدرجة المختارة: {visibility === 'private' ? 'خاصّة' : visibility === 'link' ? 'عبر الرابط' : 'تظهر في محركات البحث'}
            {' · '}الضمّ: {allowReuse ? 'مسموح' : 'غير مسموح'} (تفاعليّ للمعاينة)
          </p>
        </Section>

        {/* ===== PublishCheckpoint ===== */}
        <Section title="مراجعة قبل النشر" note="عرض الأحياء + تصحيح + كتابة الاسم للتأكيد">
          <div className={styles.launchRow}>
            <button type="button" className={styles.launchBtn} onClick={() => { setCheckpointSearchable(false); setCheckpointOpen(true); }}>
              افتح المراجعة (نشر عبر الرابط)
            </button>
            <button type="button" className={styles.launchBtn} onClick={() => { setCheckpointSearchable(true); setCheckpointOpen(true); }}>
              افتح المراجعة (الظهور في محركات البحث — مع التنبيه)
            </button>
            <button type="button" className={styles.launchBtn} onClick={() => { setCheckpointSearchable(false); setCheckpointZeroOpen(true); }}>
              افتح المراجعة (لا أحياء — تأكيد مباشر)
            </button>
          </div>
          <PublishCheckpoint
            isOpen={checkpointOpen}
            data={checkpointData}
            confirmPhrase="عائلة السعيد"
            showIrreversible={checkpointSearchable}
            onClose={() => setCheckpointOpen(false)}
            onPublish={() => setCheckpointOpen(false)}
          />
          <PublishCheckpoint
            isOpen={checkpointZeroOpen}
            data={EMPTY_CHECKPOINT_DATA}
            confirmPhrase="عائلة السعيد"
            onClose={() => setCheckpointZeroOpen(false)}
            onPublish={() => setCheckpointZeroOpen(false)}
          />
        </Section>

        {/* ===== MakePrivateDialog ===== */}
        <Section title="إيقاف النشر" note="نافذةٌ هادئة مع طريق الإزالة النهائيّة">
          <button type="button" className={styles.launchBtn} onClick={() => setMakePrivateOpen(true)}>
            افتح نافذة «إيقاف النشر»
          </button>
          <MakePrivateDialog
            isOpen={makePrivateOpen}
            onClose={() => setMakePrivateOpen(false)}
            onConfirm={() => setMakePrivateOpen(false)}
            reportHref="/family/al-saeed/report"
          />
        </Section>

        {/* ===== ReportForm ===== */}
        <Section title="صفحة الإبلاغ" note="عامّة · بلا تسجيل دخول">
          <div className={styles.centerStage}>
            <ReportForm />
          </div>
        </Section>

        <p className={styles.docFoot}>
          واجهة الزائر الكاملة (الشجرة + اللوحة الجانبيّة) تُعرض في صفحةٍ مستقلّة على
          «public-tree-view-preview».
        </p>
      </div>
    </main>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {note && <span className={styles.sectionNote}>{note}</span>}
      </div>
      {children}
    </section>
  );
}

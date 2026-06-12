'use client';

import { useEffect, useRef, useState } from 'react';
import {
  useRerootTransition,
  useOptionalRerootTransition,
  type RerootMode,
} from '@/context/RerootTransitionContext';
import styles from './RerootTransition.module.css';

/**
 * Visual overlays for the re-root transition prototype. Rendered inside the
 * `#tree-container` so they sit on top of the canvas. All are purely
 * presentational and never block pointer events.
 */
export function RerootOverlays() {
  // Safe no-op when rendered outside the provider (e.g. the /test canvas route).
  const ctx = useOptionalRerootTransition();
  if (!ctx) return null;
  return (
    <>
      <RerootVeil />
      <RerootFlash />
      <RerootBanner />
      <RerootDebugPanel />
    </>
  );
}

/* ---- Portal flash: a brief gold burst at centre masking the icon→tree swap ---- */

function RerootFlash() {
  const { flash } = useRerootTransition();
  if (!flash) return null;
  return <div aria-hidden className={styles.flash} />;
}

/* ---- Veil: intensified curtain (A) + journey darkening, with gold meridian ---- */

function RerootVeil() {
  const { veilState, veilKind, meridian } = useRerootTransition();
  if (veilState === 'hidden') return null;
  const kindClass = veilKind === 'journey' ? styles.veilJourney : styles.veilCurtain;
  const stateClass = veilState === 'in' ? styles.veilIn : styles.veilOut;
  return (
    <div aria-hidden className={`${styles.veil} ${kindClass} ${stateClass}`}>
      {/* Theatrical drape: two panels that meet in the middle (curtain only). */}
      {veilKind === 'curtain' && (
        <>
          <span className={`${styles.drape} ${styles.drapeStart}`} />
          <span className={`${styles.drape} ${styles.drapeEnd}`} />
          <span className={styles.seam} />
        </>
      )}
      {/* Gold meridian that sweeps across at the flight apex (journey). */}
      {meridian && <span className={styles.meridian} />}
    </div>
  );
}

/* ---- Banner (shared) ---- */

function RerootBanner() {
  const { banner } = useRerootTransition();
  // Keep the banner mounted briefly after it clears so it can animate out.
  const [shown, setShown] = useState(banner);
  const [leaving, setLeaving] = useState(false);
  const leaveTimer = useRef<number | null>(null);

  useEffect(() => {
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    if (banner) {
      setShown(banner);
      setLeaving(false);
    } else if (shown) {
      setLeaving(true);
      leaveTimer.current = window.setTimeout(() => {
        setShown(null);
        setLeaving(false);
      }, 280);
    }
    return () => {
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [banner]);

  if (!shown) return null;

  return (
    <div className={styles.bannerWrap}>
      <div
        role="status"
        aria-live="polite"
        className={`${styles.banner} ${leaving ? styles.bannerLeaving : ''}`}
      >
        <span className={styles.bannerTitle}>{shown.title}</span>
        {shown.subtitle && <span className={styles.bannerSubtitle}>{shown.subtitle}</span>}
      </div>
    </div>
  );
}

/* ---- Debug panel ---- */

const MODE_OPTIONS: { mode: RerootMode; label: string; sub: string }[] = [
  { mode: 'portal', label: 'بوابة', sub: 'D · من الأيقونة' },
  { mode: 'off', label: 'بدون', sub: 'فوري (الحالي)' },
  { mode: 'curtain', label: 'ستارة', sub: 'A · مكثّفة' },
  { mode: 'journey', label: 'رحلة', sub: 'B · طيران' },
  { mode: 'sweep', label: 'اجتياح', sub: 'C · انزلاق' },
];

function useDebugVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const isDev = process.env.NODE_ENV !== 'production';
    const flagged =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('rerootlab');
    setVisible(isDev || flagged);
  }, []);
  return visible;
}

function RerootDebugPanel() {
  const { mode, setMode } = useRerootTransition();
  const visible = useDebugVisible();
  const [open, setOpen] = useState(true);

  if (!visible) return null;

  if (!open) {
    return (
      <button
        type="button"
        className={`${styles.debugPanel} ${styles.debugCollapsed}`}
        onClick={() => setOpen(true)}
        title="تجربة انتقال الجذر"
      >
        <span className={styles.debugTitle}>⚑ انتقال</span>
      </button>
    );
  }

  return (
    <div className={styles.debugPanel}>
      <div className={styles.debugHeader}>
        <span className={styles.debugTitle}>⚑ تجربة الانتقال</span>
        <button
          type="button"
          className={styles.debugToggle}
          onClick={() => setOpen(false)}
          aria-label="إخفاء"
        >
          ✕
        </button>
      </div>
      <div className={styles.debugButtons}>
        {MODE_OPTIONS.map((opt) => (
          <button
            key={opt.mode}
            type="button"
            className={`${styles.debugBtn} ${mode === opt.mode ? styles.debugBtnActive : ''}`}
            onClick={() => setMode(opt.mode)}
          >
            <span className={styles.debugBtnLabel}>{opt.label}</span>
            <span className={styles.debugBtnSub}>{opt.sub}</span>
          </button>
        ))}
      </div>
      <p className={styles.debugHint}>
        جرّب: نتيجة بحث بعيدة · شارة «عرض العائلة» · الجد الأعلى · زر العودة
      </p>
    </div>
  );
}

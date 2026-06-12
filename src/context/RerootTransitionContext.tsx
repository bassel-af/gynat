'use client';

/**
 * RerootTransitionContext — DEBUG/PROTOTYPE harness for re-root navigation feedback.
 *
 * Problem (from user testing): when an action rebuilds the tree around a new root
 * — search-result click, spouse "view family" badge, root dropdown, back chip —
 * the change happened "in place" and never communicated that we TRAVELLED to a
 * place that wasn't on screen before. The earlier in-place treatments (veil /
 * settle / travel card) looked nice but didn't convey spatial displacement.
 *
 * This revision trials treatments built around MOVEMENT THROUGH SPACE:
 *
 *   - 'curtain' — an intensified theatrical curtain: a near-opaque obsidian
 *                 drape with a sweeping gold seam closes, the relayout happens
 *                 hidden behind it, then it parts and the landed person ignites.
 *   - 'journey' — a lineage-atlas flight: the camera lifts OFF the current branch
 *                 (zooms far out into the dark), a gold meridian sweeps across,
 *                 then it DESCENDS onto the new location and the person ignites.
 *                 This is the strongest "we flew somewhere else" cue.
 *   - 'sweep'   — a directional push: the whole canvas slides off one edge and
 *                 the new place slides in from the other — a spatial page-turn.
 *   - 'off'     — current instant behaviour (baseline).
 *
 * Cooperating with the hardened focus timing: setting a new root rebuilds the
 * layout, and FamilyTree's focus effect waits for that relayout before scrolling
 * to the focused person. We never need a node's final position early — the camera
 * "descent" reuses that existing scroll, and the bloom is fired reactively from
 * the focus effect's success branch via `signalLanded`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useToast } from '@/context/ToastContext';

export type RerootMode = 'off' | 'curtain' | 'journey' | 'sweep' | 'portal';

const STORAGE_KEY = 'reroot-transition-mode-v3';

// Timing constants (ms) — gathered here so the feel is easy to tune.
const CURTAIN_IN = 200; // drape closes; commit once it's opaque
const CURTAIN_OUT = 340; // drape parts after landing
const CURTAIN_SAFETY = 600; // force-part if no land signal (dropdown/back)
const LIFT_MS = 400; // journey: zoom-out flight time before the swap
const JOURNEY_SAFETY = 640; // journey: reveal fallback after commit
const SWEEP_OUT = 320; // sweep: slide the old place out
const SWEEP_SAFETY = 720; // sweep: settle fallback
const PORTAL_OUT = 360; // portal: let the lead-in camera move finish before the swap
const PORTAL_SAFETY = 700; // portal: banner fallback after commit
const BANNER_DURATION = 3800; // arrival banner auto-fade
const BLOOM_DURATION = 1100; // landing bloom one-shot

export interface RerootBanner {
  title: string;
  subtitle?: string;
}

export interface RerootRequest {
  /** Performs the actual root/focus state change (setSelectedRootId, etc.). */
  commit: () => void;
  /** Caption shown after arrival. Null = no banner. */
  banner: RerootBanner | null;
  /** Whether to bloom the person we land on (focus paths). Default true. */
  bloom?: boolean;
}

/** Imperative camera/canvas controller registered by FamilyTree. */
export interface StageController {
  /** Journey: zoom the viewport far out ("lift off"). */
  liftOff: () => void;
  /** Sweep: slide the current canvas off-screen. */
  sweepOut: () => void;
  /** Sweep: bring the new canvas in from the opposite edge. */
  sweepIn: () => void;
  /**
   * Portal: lead the camera into the clicked icon (screen coords) and arm the
   * reveal. The reveal (whole new tree small → glide to the person) runs in
   * FamilyTree's focus effect, once the new layout exists.
   */
  portalBegin: (x: number, y: number) => void;
}

type VeilState = 'hidden' | 'in' | 'out';

interface RerootTransitionValue {
  mode: RerootMode;
  setMode: (m: RerootMode) => void;
  /** Entry points call this instead of mutating root/focus directly. */
  reroot: (req: RerootRequest) => void;
  /** FamilyTree's focus effect calls this once the landed node is resolved. */
  signalLanded: (personId: string) => void;
  /** FamilyTree registers its camera/canvas controller here. */
  registerStage: (controller: StageController) => () => void;
  // Reactive view-state for the overlay components:
  veilState: VeilState;
  /** Heavier "curtain" styling vs. the journey's darkening pulse. */
  veilKind: 'curtain' | 'journey';
  /** Show the gold meridian sweep line (journey apex). */
  meridian: boolean;
  /** Brief radial flash at screen centre to mask the portal content swap. */
  flash: boolean;
  banner: RerootBanner | null;
}

const TransitionCtx = createContext<RerootTransitionValue | null>(null);

// Lightweight context the tree nodes subscribe to — only changes when the bloom
// target changes (twice per transition), so the canvas doesn't re-render on every
// banner/veil tick.
const BloomCtx = createContext<string | null>(null);

function readInitialMode(): RerootMode {
  if (typeof window === 'undefined') return 'portal';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (
    stored === 'off' ||
    stored === 'curtain' ||
    stored === 'journey' ||
    stored === 'sweep' ||
    stored === 'portal'
  ) {
    return stored;
  }
  return 'portal';
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const TRANSIT_BANNER: RerootBanner = { title: 'ننتقل إلى موضع آخر…' };

export function RerootTransitionProvider({ children }: { children: React.ReactNode }) {
  const { showToast } = useToast();

  const [mode, setModeState] = useState<RerootMode>(readInitialMode);
  const [veilState, setVeilState] = useState<VeilState>('hidden');
  const [veilKind, setVeilKind] = useState<'curtain' | 'journey'>('curtain');
  const [meridian, setMeridian] = useState(false);
  const [flash, setFlash] = useState(false);
  const [banner, setBanner] = useState<RerootBanner | null>(null);
  const [bloomId, setBloomId] = useState<string | null>(null);

  // Refs so `signalLanded` / `reroot` stay stable (the focus effect depends on
  // signalLanded — keeping it stable avoids re-running the hardened timing logic).
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const bloomOnLandRef = useRef(true);
  const arrivalBannerRef = useRef<RerootBanner | null>(null);
  const timersRef = useRef<number[]>([]);
  const stageRef = useRef<StageController | null>(null);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  }, []);

  const addTimer = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
  }, []);

  const setMode = useCallback((m: RerootMode) => {
    setModeState(m);
    modeRef.current = m;
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, m);
  }, []);

  const registerStage = useCallback((controller: StageController) => {
    stageRef.current = controller;
    return () => {
      if (stageRef.current === controller) stageRef.current = null;
    };
  }, []);

  const armBloom = useCallback(
    (personId: string) => {
      setBloomId(personId);
      addTimer(() => setBloomId(null), BLOOM_DURATION);
    },
    [addTimer],
  );

  const showArrivalBanner = useCallback(() => {
    const arrival = arrivalBannerRef.current;
    if (!arrival) return;
    setBanner(arrival);
    addTimer(() => setBanner(null), BANNER_DURATION);
  }, [addTimer]);

  const partVeil = useCallback(() => {
    setMeridian(false);
    setVeilState((prev) => (prev === 'in' ? 'out' : prev));
    addTimer(() => setVeilState('hidden'), CURTAIN_OUT);
  }, [addTimer]);

  const reroot = useCallback(
    (req: RerootRequest) => {
      const activeMode = modeRef.current;
      clearTimers();
      // Reset any lingering overlay state from a previous (interrupted) reroot.
      setVeilState('hidden');
      setMeridian(false);
      setFlash(false);
      setBloomId(null);

      bloomOnLandRef.current = req.bloom !== false;
      arrivalBannerRef.current = req.banner;

      if (activeMode === 'off') {
        req.commit();
        return;
      }

      if (prefersReducedMotion()) {
        // No motion: commit immediately, lean on banner + toast for feedback.
        req.commit();
        showArrivalBanner();
        if (req.banner) showToast(req.banner.title, 'info');
        return;
      }

      if (activeMode === 'curtain') {
        setVeilKind('curtain');
        setBanner(null);
        setVeilState('in');
        // Defer the relayout until the drape is ~opaque so the swap is hidden.
        addTimer(() => {
          req.commit();
          addTimer(() => partVeil(), CURTAIN_SAFETY);
        }, CURTAIN_IN);
        return;
      }

      if (activeMode === 'journey') {
        setVeilKind('journey');
        setBanner(TRANSIT_BANNER);
        setVeilState('in');
        setMeridian(true);
        stageRef.current?.liftOff();
        // Swap at the apex of the flight, masked by the darkening + min zoom.
        addTimer(() => {
          req.commit();
          addTimer(() => {
            partVeil();
            showArrivalBanner();
          }, JOURNEY_SAFETY);
        }, LIFT_MS);
        return;
      }

      if (activeMode === 'sweep') {
        setBanner(TRANSIT_BANNER);
        stageRef.current?.sweepOut();
        addTimer(() => {
          req.commit();
          stageRef.current?.sweepIn();
          addTimer(() => showArrivalBanner(), SWEEP_SAFETY);
        }, SWEEP_OUT);
        return;
      }

      if (activeMode === 'portal') {
        // No person to zoom to (dropdown / back) — just commit with the banner.
        if (req.bloom === false) {
          setBanner(null);
          req.commit();
          showArrivalBanner();
          return;
        }
        // Lead the camera into the clicked icon; the focus effect then reveals
        // the whole destination tree there and glides to the person.
        setBanner(null);
        stageRef.current?.portalBegin(lastPointer.x, lastPointer.y);
        addTimer(() => {
          req.commit();
          // A quick flash masks the icon→tree content swap at the apex.
          setFlash(true);
          addTimer(() => setFlash(false), 260);
          addTimer(() => showArrivalBanner(), PORTAL_SAFETY);
        }, PORTAL_OUT);
        return;
      }
    },
    [addTimer, clearTimers, partVeil, showArrivalBanner, showToast],
  );

  const signalLanded = useCallback(
    (personId: string) => {
      const activeMode = modeRef.current;
      if (activeMode === 'curtain' || activeMode === 'journey') {
        partVeil();
        showArrivalBanner();
      } else if (activeMode === 'sweep' || activeMode === 'portal') {
        showArrivalBanner();
      }
      if (bloomOnLandRef.current && personId) armBloom(personId);
    },
    [armBloom, partVeil, showArrivalBanner],
  );

  // Track the last pointer position so the portal can dive into the clicked icon.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      lastPointer.x = e.clientX;
      lastPointer.y = e.clientY;
    };
    window.addEventListener('pointerdown', onDown, { capture: true });
    return () => window.removeEventListener('pointerdown', onDown, { capture: true });
  }, []);

  const value = useMemo<RerootTransitionValue>(
    () => ({
      mode,
      setMode,
      reroot,
      signalLanded,
      registerStage,
      veilState,
      veilKind,
      meridian,
      flash,
      banner,
    }),
    [mode, setMode, reroot, signalLanded, registerStage, veilState, veilKind, meridian, flash, banner],
  );

  return (
    <TransitionCtx.Provider value={value}>
      <BloomCtx.Provider value={bloomId}>{children}</BloomCtx.Provider>
    </TransitionCtx.Provider>
  );
}

// Module-level pointer tracker shared by the (single) provider instance.
const lastPointer = { x: 0, y: 0 };

export function useRerootTransition(): RerootTransitionValue {
  const ctx = useContext(TransitionCtx);
  if (!ctx) throw new Error('useRerootTransition must be used within RerootTransitionProvider');
  return ctx;
}

/** Safe variant for components that may render outside the provider (e.g. /test). */
export function useOptionalRerootTransition(): RerootTransitionValue | null {
  return useContext(TransitionCtx);
}

/** Subscribed by tree nodes; returns the person id to bloom, or null. */
export function useBloomId(): string | null {
  return useContext(BloomCtx);
}

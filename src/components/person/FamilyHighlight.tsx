'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import Link from 'next/link';
import { NodeFigure } from '@/components/heritage/FigureCluster';
import type { PersonChip } from '@/lib/tree/person-projection';
import { useCalendarPreference } from '@/hooks/useCalendarPreference';
import { chipYears } from './yearFormat';
import styles from './person.module.css';

// ---------------------------------------------------------------------------
// Relationship highlight — hovering/focusing/tapping a chip in the family
// section highlights that person's parent + children that are ALSO shown here.
// PORTED VERBATIM from the approved mockup (design-preview/person).
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
export function FamilyHighlightProvider({
  chips,
  children,
}: {
  chips: PersonChip[];
  children: React.ReactNode;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  // id → set of related (parent + children) ids that are present in the section.
  // Relation chips are always non-private (so they carry an id); a defensive
  // skip on a missing id keeps this total.
  const relationsById = useMemo(() => {
    const present = new Set(chips.map((c) => c.id).filter((id): id is string => !!id));
    const map = new Map<string, Set<string>>();
    const ensure = (id: string) => {
      let s = map.get(id);
      if (!s) {
        s = new Set();
        map.set(id, s);
      }
      return s;
    };
    for (const c of chips) {
      if (c.id && c.parentId && present.has(c.parentId)) {
        ensure(c.id).add(c.parentId); // child → its parent
        ensure(c.parentId).add(c.id); // parent → its child
      }
    }
    return map;
  }, [chips]);

  const activate = useCallback((id: string | null) => setActiveId(id), []);
  const toggle = useCallback((id: string) => setActiveId((cur) => (cur === id ? null : id)), []);

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
  const onBackgroundClick = useCallback((e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest('[data-chip]')) setActiveId(null);
  }, []);

  return (
    <HighlightContext.Provider value={value}>
      <div onClick={onBackgroundClick}>{children}</div>
    </HighlightContext.Provider>
  );
}

/**
 * A relation chip (avatar + linked name + optional years). Relation chips are
 * ALWAYS a real, clickable person — the projection omits private people from
 * every relation group entirely (no chip, no placeholder), so there is no
 * private branch here.
 */
export function RelationChip({
  chip,
  hrefFor,
}: {
  chip: PersonChip;
  /** Builds the navigation href for the person. */
  hrefFor: (id: string) => string;
}) {
  const hl = useContext(HighlightContext);
  const { preference } = useCalendarPreference();

  const years = chipYears(chip, preference);
  // Relation chips are non-private and always carry an id; `''` is an
  // unreachable fallback that keeps the highlight lookups total.
  const id = chip.id ?? '';
  const isActive = hl?.activeId === id;
  const isRelated = hl?.relatedIds.has(id) ?? false;
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
    <Link
      href={hrefFor(id)}
      className={cls}
      data-chip="1"
      // Desktop ONLY: hover + keyboard focus highlight relatives.
      // Pointer-hover is mouse-only. On TOUCH there is no highlight at all —
      // a tap just opens the person (the related father/son is usually
      // off-screen on a phone, so highlighting it is pointless; the person's
      // own page is the better, fully-visible relationship view).
      onPointerEnter={(e) => {
        if (e.pointerType !== 'touch') hl?.activate(id);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== 'touch') hl?.activate(null);
      }}
      onFocus={() => hl?.activate(id)}
      onBlur={() => hl?.activate(null)}
    >
      <span className={styles.relationAvatar}>
        <NodeFigure gender={chip.gender} />
      </span>
      <span className={styles.relationText}>
        <span className={styles.relationName}>{chip.name}</span>
        {years && <span className={styles.relationYears}>{years}</span>}
      </span>
    </Link>
  );
}

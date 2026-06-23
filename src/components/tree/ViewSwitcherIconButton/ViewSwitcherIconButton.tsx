'use client';

import Link from 'next/link';
import {
  getNextViewMode,
  type TreeViewModeId,
  type ViewModeContext,
} from '@/lib/tree/view-modes';

interface ViewSwitcherIconButtonProps {
  /** The mode the member is currently looking at. */
  currentMode: TreeViewModeId;
  /** Context for building the destination href (slug + person + extra tree). */
  ctx: ViewModeContext;
  /** Host-provided styling so it matches its sibling action buttons (e.g.
      PersonDetail's `focusButton`). */
  className?: string;
}

/**
 * The compact ICON view-switcher used in the CANVAS sidebar (PersonDetail's
 * action cluster, `currentMode="tree"`). It renders the NEXT mode's icon (a "go
 * there" affordance) and links to that mode's route. Because the canvas + person
 * routes share the `(canvas)/layout.tsx`, the navigation is a child-segment swap
 * — no provider remount, instant toggle.
 *
 * NOTE: this is the canvas-side affordance only. The PERSON page has its own,
 * visually distinct gold-pill switcher (`src/components/person/ViewSwitcherButton`)
 * — both build their hrefs from the single source `@/lib/tree/view-modes`.
 */
export function ViewSwitcherIconButton({
  currentMode,
  ctx,
  className,
}: ViewSwitcherIconButtonProps) {
  const next = getNextViewMode(currentMode);
  const Icon = next.icon;
  const label = next.id === 'person' ? 'عرض صفحة الشخص' : 'عرض في الشجرة';

  return (
    <Link
      href={next.href(ctx)}
      className={className}
      aria-label={label}
      title={label}
    >
      <Icon />
    </Link>
  );
}

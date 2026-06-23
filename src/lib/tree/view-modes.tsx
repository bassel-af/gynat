/**
 * The two ways a member can look at the same family data: the spatial canvas
 * (the React Flow tree) and the focused, document-style person page. They share
 * one route shell (`tree/layout.tsx`) so toggling between them is a route push,
 * not a remount — the sidebar, toolbar, providers and fetched data persist.
 *
 * The view-switcher button always shows the NEXT mode's icon (a "go there"
 * affordance), so a person on the canvas sees the person-page icon, and a
 * person on the person page sees the tree icon back to the canvas.
 */

import type { ComponentType, SVGProps } from 'react';

export type TreeViewModeId = 'tree' | 'person';

/**
 * Everything an href builder may need. `individualId` is required to address a
 * person page and to re-center the canvas on return; `treeId` (an `extra` tree)
 * is threaded through both modes so the toggle never silently jumps to `main`.
 */
export interface ViewModeContext {
  slug: string;
  individualId?: string;
  treeId?: string;
}

export interface TreeViewMode {
  id: TreeViewModeId;
  /** Arabic label for the destination this mode represents. No tashkeel. */
  labelAr: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Builds the route for this mode given the current context. */
  href: (ctx: ViewModeContext) => string;
}

/**
 * On return to the canvas we ask the tree to re-center on the person the member
 * was just reading. The `tree/layout.tsx` reads this param once and feeds it to
 * the focus mechanism, then strips it.
 */
export const FOCUS_PARAM = 'focus';

function buildTreeQuery(ctx: ViewModeContext, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  if (ctx.treeId) params.set('treeId', ctx.treeId);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Crosshair / target — "look at this in the spatial tree". */
const TreeIcon: ComponentType<SVGProps<SVGSVGElement>> = (props) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" {...props}>
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    <path
      d="M12 2V5M12 19V22M2 12H5M19 12H22"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

/** Person card / document — "open the focused person page". */
const PersonIcon: ComponentType<SVGProps<SVGSVGElement>> = (props) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" {...props}>
    <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
    <path
      d="M5 21a7 7 0 0114 0"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export const TREE_VIEW_MODES: readonly TreeViewMode[] = [
  {
    id: 'tree',
    labelAr: 'الشجرة',
    icon: TreeIcon,
    // Return to the canvas centered on the person the member was reading.
    href: (ctx) =>
      `/workspaces/${ctx.slug}/tree${buildTreeQuery(
        ctx,
        ctx.individualId ? { [FOCUS_PARAM]: ctx.individualId } : undefined,
      )}`,
  },
  {
    id: 'person',
    labelAr: 'الشخص',
    icon: PersonIcon,
    href: (ctx) =>
      `/workspaces/${ctx.slug}/tree/person/${ctx.individualId ?? ''}${buildTreeQuery(ctx)}`,
  },
] as const;

export function getViewMode(id: TreeViewModeId): TreeViewMode {
  const mode = TREE_VIEW_MODES.find((m) => m.id === id);
  if (!mode) throw new Error(`Unknown tree view mode: ${id}`);
  return mode;
}

/** The mode the switcher should navigate TO from the given current mode. */
export function getNextViewMode(current: TreeViewModeId): TreeViewMode {
  return current === 'tree' ? getViewMode('person') : getViewMode('tree');
}

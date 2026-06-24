/**
 * Responsive breakpoints for the workspace sidebar drawer, kept in sync with
 * `src/components/ui/Sidebar/Sidebar.module.css`:
 *   - `> 768px`  → desktop: the sidebar is a fixed panel (no overlay).
 *   - `≤ 768px`  → the sidebar collapses to an overlay DRAWER (+ a FAB toggle).
 *   - `≤ 600px`  → phone-specific drawer styling.
 *
 * These predicates use `window.matchMedia` rather than `window.innerWidth` on
 * purpose: `innerWidth` includes the scrollbar gutter, so on a narrow desktop
 * browser window it can disagree with the CSS layout width by ~15px right at a
 * breakpoint. That mismatch made the drawer close intermittently for a user on
 * a narrow desktop Safari window. `matchMedia` evaluates the SAME media query
 * the CSS uses, so JS and CSS always agree.
 */
export const DRAWER_MAX_WIDTH = 768;
export const PHONE_MAX_WIDTH = 600;

/** SSR-safe `matchMedia(...).matches`; false when `window.matchMedia` is absent. */
function mediaMatches(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(query).matches;
}

/**
 * Should a "view this person" interaction (a sidebar person/relationship click,
 * or a navigation into the person page) auto-COLLAPSE the drawer?
 *
 * Only on a TABLET-sized drawer (601–768px), where the drawer is an overlay over
 * a usable page/canvas — collapsing it reveals the result. On a PHONE (≤600px)
 * the drawer is the primary surface and the member browses person→person inside
 * it, so it stays open. On desktop (>768px) there is no drawer to collapse.
 */
export function shouldCollapseDrawerOnPersonView(): boolean {
  return mediaMatches(`(min-width: ${PHONE_MAX_WIDTH + 1}px) and (max-width: ${DRAWER_MAX_WIDTH}px)`);
}

/**
 * Is the viewport currently in "overlay drawer" territory at all (≤768px)?
 * Used by the body-scroll-lock and the mobile back-button interception — the
 * "is there a drawer to manage" predicate, independent of the phone/tablet line.
 */
export function isDrawerViewport(): boolean {
  return mediaMatches(`(max-width: ${DRAWER_MAX_WIDTH}px)`);
}

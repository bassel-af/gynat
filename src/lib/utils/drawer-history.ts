/**
 * The mobile sidebar drawer's history SENTINEL.
 *
 * While the overlay drawer is open (≤768px, on the canvas), `Sidebar` pushes a
 * same-URL history entry carrying this key so a hardware Back closes the drawer
 * instead of leaving the page.
 *
 * Any in-drawer control that LEAVES the page must therefore REPLACE that
 * sentinel rather than push on top of it — otherwise the stack becomes
 * [tree, sentinel, next] and the user's second Back lands on the invisible
 * same-URL sentinel (a dead press).
 */
export const DRAWER_HISTORY_SENTINEL_KEY = 'mobileSidebarDetail';

/** Is the CURRENT history entry the drawer's sentinel? (Client-only callers.) */
export function isOnDrawerHistorySentinel(): boolean {
  return window.history.state?.[DRAWER_HISTORY_SENTINEL_KEY] === true;
}

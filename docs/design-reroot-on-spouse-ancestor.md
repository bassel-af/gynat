# Design Spec: Re-root on Spouse's Ancestor (Solution 1)

## Overview

This document specifies the UX design for Solution 1 from `docs/in-law-visibility.md`. The goal is to let users navigate from a married-in spouse to that spouse's family tree, and then easily return to the original root.

Three elements are defined:

1. **Married-in spouse indicator** -- a visual mark on spouse cards that have relatives in the database
2. **Re-root trigger** -- how the user initiates navigation to the spouse's ancestor
3. **Back-to-original-root control** -- a persistent canvas-level control to return

---

## Terminology

- **Married-in spouse**: A spouse card that appears beside a descendant of the current root, but who is _not_ themselves a descendant of the current root. Their `familyAsChild` reference points to a family whose parent(s) exist in the database but are not visible in the current tree.
- **Has relatives**: The married-in spouse has at least one of: parent records, sibling records, or both in the database. This is the condition for showing the indicator.
- **Topmost ancestor**: The individual with no parents who the spouse descends from, found by walking up `familyAsChild` chains.

---

## 1. Married-In Spouse Indicator

### What it looks like

A small **family-tree icon badge** positioned at the top-left corner of the spouse card (top-left because the layout is RTL -- this places it on the "outward" corner, away from the spouse connector line which joins on the right side of the card). Top placement signals "this person has ancestors above them that aren't shown in the current tree."

The badge is a 22x22px circle with a subtle semi-transparent background (`rgba(99, 179, 237, 0.15)`) and a 1px border (`rgba(99, 179, 237, 0.3)`). Inside it sits a 14px tree/sitemap icon in `--color-primary-light` (`#63b3ed`). The icon choice is a simplified "sitemap" or "git-branch" glyph (available from Iconify as `lucide:git-branch` or `lucide:network`) to communicate "this person has a family tree to explore."

```
                                              [tree icon badge]
+-----------------------+     spouse-line     +-----------------------+
|      Husband Card     |--------------------||    Wife (Married-In)  |
|                       |                    ||                       |
+-----------------------+                    |+-----------------------+
```

### Visual states

| State | Appearance |
|-------|-----------|
| Default | Circle badge with 0.15 alpha background, icon at 0.7 opacity |
| Hover | Background brightens to 0.25 alpha, icon at full opacity, subtle scale(1.1) transform, cursor changes to `pointer` |
| Active/pressed | scale(0.95), background at 0.3 alpha |
| Dimmed (lineage highlight active, spouse is dimmed) | Badge inherits the parent card's dimmed opacity; do not hide it |

### When to show

The badge appears **only** when all conditions are met:

1. The person is rendered as a spouse card (not the primary/hub person in the node)
2. The person is _not_ a descendant of the current `selectedRootId`
3. The person has at least one parent or sibling in the database (i.e., there is family data to navigate to)

The detection logic should be computed once when building tree nodes, not on every render. A boolean flag `hasExternalFamily` should be added to the spouse data passed into `PersonNodeData`.

### Positioning (RTL specifics)

In RTL layout, the spouse card sits to the _left_ of the primary person card. The badge is positioned:

```css
position: absolute;
top: -8px;
left: -8px;    /* In RTL, "left" is the outward/far edge of the spouse card */
```

This places the badge slightly overlapping the bottom-left corner of the card, clearly associated with the spouse but not occluding the name or dates.

### Accessibility

- `role="button"` with `tabindex="0"`
- `aria-label="عرض عائلة [spouse name]"` (e.g., "عرض عائلة فاطمة")
- Keyboard accessible: Enter/Space triggers the re-root action
- Focus ring: `box-shadow: 0 0 0 3px rgba(99, 179, 237, 0.25)`

---

## 2. Re-Root Trigger

### How it works

Clicking (or tapping, or pressing Enter on) the married-in spouse indicator badge triggers the following sequence:

1. The system looks up the spouse's topmost ancestor (walk up `familyAsChild` chain until an individual with no parents is found)
2. `selectedRootId` is updated to the topmost ancestor's ID via `setSelectedRootId()`
3. The tree re-renders from that new root using the existing layout algorithm -- no new layout code needed
4. The viewport smoothly animates to center on the new root at the top (using the existing `scrollToNode()` function with `position: 'top'`)

### Why not a context menu or hover panel

A direct click on the badge is the simplest interaction. Context menus add friction and are unfamiliar in tree UIs. A hover panel would be problematic on mobile (no hover). The badge itself is the affordance and the trigger, keeping the interaction to a single tap/click.

### Sidebar integration

When a married-in spouse is selected in the sidebar's PersonDetail view, a secondary action should also be available. In the "hero actions" row of the PersonDetail, a button labeled **"عرض شجرة عائلتها"** (or **"عرض شجرة عائلته"** for male spouses) should appear, but _only_ when the same `hasExternalFamily` condition is true. This button triggers the same re-root logic.

This button should use the existing `focusButton` style (36x36px circular icon button) but with a tree/sitemap icon, matching the canvas badge icon for visual consistency. On mobile, where the canvas badge may be small and hard to tap, this sidebar button provides a comfortable alternative path.

---

## 3. Back-to-Original-Root Control (Root Navigation Chip)

### Concept

When the user has re-rooted away from the initial/original root, a **floating navigation chip** appears on the canvas. This chip serves two purposes: it tells the user they are viewing a different root, and it provides one-click navigation back.

### Appearance

The chip is a **pill-shaped floating element** positioned at the **top-left** of the canvas (top-left in RTL places it on the far side from the sidebar, which is on the right). It uses the same dark gradient as the sidebar toggle button (`--gradient-toggle`) to feel like a native part of the app's chrome, not a tree node.

```
+------------------------------------------+
|  [arrow-right icon]  العودة لشجرة سعيد   |
+------------------------------------------+
```

Specifications:

| Property | Value |
|----------|-------|
| Background | `var(--gradient-toggle)` (dark gradient: #1a1f36 to #252b48) |
| Border | `1px solid var(--alpha-white-15)` |
| Border radius | `var(--radius-full)` (pill shape, 20px) |
| Padding | `var(--space-2) var(--space-7)` (6px 16px) |
| Font size | `var(--font-size-sm)` (12px) |
| Font weight | `var(--font-weight-medium)` (500) |
| Text color | `var(--color-text-inverse)` (white) |
| Icon | Right-pointing arrow (since RTL, right arrow = "back") at 16px, color `var(--color-primary-light)` |
| Shadow | `var(--shadow-xl)` |
| Z-index | 10 (above tree nodes but below sidebar) |
| Max width | `260px` with `text-overflow: ellipsis` for long names |

### Position

```css
position: absolute;
top: var(--space-7);      /* 16px from top */
left: var(--space-7);     /* 16px from left edge (far side in RTL) */
z-index: 10;
```

On mobile (below 768px), the position shifts down slightly to avoid conflict with the sidebar toggle button (which is at `top: 16px; right: 16px` in RTL):

```css
@media (max-width: 768px) {
  top: var(--space-7);    /* Same top position */
  left: var(--space-5);   /* 12px from left -- the toggle is on the opposite (right) side */
}
```

### Label text

The chip label reads: **"العودة لشجرة [root ancestor name]"** where the name is the display name of the `initialRootId` person. If the name is long, it truncates with ellipsis.

Example: `العودة لشجرة سعيد بن محمد`

### Behavior

- **Click**: Sets `selectedRootId` back to `initialRootId`. The tree re-renders and the viewport scrolls to the original root. The chip disappears (since `selectedRootId === initialRootId` again).
- **Visibility condition**: The chip is visible only when `selectedRootId !== initialRootId`. Both values already exist in `TreeContext`.

### Interactive states

| State | Appearance |
|-------|-----------|
| Default | As described above |
| Hover | Background lightens slightly (add `filter: brightness(1.15)`), icon translates 3px to the right (`transform: translateX(3px)` for the arrow) |
| Active/pressed | `transform: scale(0.97)` |
| Focus | `box-shadow: var(--shadow-focus-primary)` focus ring |

### Entrance/exit animation

- **Entrance** (when user re-roots away): Slide in from the left with a fade. Duration: `var(--transition-slow)` (300ms, `cubic-bezier(0.4, 0, 0.2, 1)`).

```css
@keyframes chipSlideIn {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
```

- **Exit** (when user clicks back): The chip fades out quickly (150ms) before the tree transitions. In practice, since the chip's visibility is driven by `selectedRootId !== initialRootId`, it disappears immediately upon state change; the animation applies only to entrance.

---

## 4. Transitions Between States

### Re-root flow (forward navigation)

1. User clicks the badge on a married-in spouse card
2. Badge shows a brief press animation (`scale(0.95)`, 150ms)
3. `selectedRootId` updates to the spouse's topmost ancestor
4. The tree re-renders with the new root. React Flow handles the node/edge diff.
5. The viewport smoothly scrolls to the new root at the top of the canvas (500ms, using existing `scrollToNode` with `position: 'top'`)
6. The "back" chip slides in from the left (300ms entrance animation)
7. If a person was selected in the sidebar, `selectedPersonId` is cleared (the previous person is no longer visible)

### Return flow (back navigation)

1. User clicks the floating "back" chip
2. `selectedRootId` updates to `initialRootId`
3. The tree re-renders back to the original root
4. The viewport smoothly scrolls to the original root at the top (500ms)
5. The chip disappears (condition `selectedRootId !== initialRootId` is false)

### No additional loading states needed

Since all data is already loaded in memory (`GedcomData` contains all individuals and families), there is no fetch delay. The re-root is instantaneous from a data perspective; only the layout and viewport animation need time.

---

## 5. Mobile Considerations

### Badge size

On mobile (below 768px), the badge size increases from 22x22px to 28x28px for better tap targets (meeting the 44px minimum touch target with the overlapping card area). The icon inside scales to 16px.

### Badge tap behavior

On mobile, tapping the badge does two things:
1. Triggers the re-root (same as desktop click)
2. Closes the mobile sidebar if it is open (to show the new tree)

### Back chip on mobile

The floating "back" chip is the same element on mobile, positioned at `top-left` of the canvas. Since the sidebar toggle is at `top-right`, there is no conflict.

On very small screens (below 480px), the chip text shortens to just **"العودة"** (omitting the ancestor name) to save horizontal space. The chip retains its full label as a `title` attribute for long-press/tooltip.

### Sidebar PersonDetail integration

On mobile, the sidebar "view family tree" button in the PersonDetail hero section is particularly important because:
- The canvas badge may be small and partially overlapping the card edge
- Users on mobile are already looking at the sidebar detail panel
- The button label is explicit and unambiguous

When tapped, this button:
1. Triggers the re-root
2. Closes the mobile sidebar
3. The canvas animates to the new root

---

## 6. State Management Summary

### New state needed

No new context state is required. The existing `TreeContext` already has:
- `selectedRootId` -- the current root
- `initialRootId` -- the original/default root (set once on data load)
- `setSelectedRootId()` -- the setter

### New computed values needed

In `buildTreeData` (or a preparation step before it):
- For each spouse in a node, compute `hasExternalFamily: boolean` -- whether the spouse has parents/siblings in the database and is not a descendant of the current `selectedRootId`
- For a spouse with `hasExternalFamily`, compute `topAncestorId: string` -- the ID of their topmost ancestor (walk up `familyAsChild` until no parent found)

Both values should be passed through `PersonNodeData` > `SpouseWithColor` so the `PersonNode` component can render the badge and attach the click handler.

### New callback needed

A single new callback: `onRerootToSpouse(topAncestorId: string)` passed through `PersonNodeData`. Implementation:

```
onRerootToSpouse = (id) => setSelectedRootId(id)
```

---

## 7. Component Changes Summary

| Component | Change |
|-----------|--------|
| `FamilyTree.tsx` > `PersonNode` | Add badge rendering inside `renderPersonCard` for spouses with `hasExternalFamily`. Attach click handler. |
| `FamilyTree.tsx` > `buildTreeData` | Compute `hasExternalFamily` and `topAncestorId` for each spouse. Pass through `SpouseWithColor`. |
| `FamilyTree.tsx` > `FamilyTreeInner` | Render the floating "back" chip when `selectedRootId !== initialRootId`. |
| `tree-global.css` | Add styles for `.spouse-family-badge` (the indicator) and `.root-back-chip` (the floating pill). |
| `PersonDetail.tsx` | Add "view family tree" button in hero actions for married-in spouses with external family. |
| `PersonDetail.module.css` | Style the new hero button (reuses existing `focusButton` pattern). |
| `TreeContext.tsx` | No changes needed -- `initialRootId` and `selectedRootId` already exist. |
| `SpouseWithColor` interface | Add `hasExternalFamily: boolean` and `topAncestorId: string \| null`. |

---

## 8. Visual Reference (ASCII Wireframe)

### Desktop - normal state (viewing original root)

```
+------------------------------------------------------------------+
|                                                      [sidebar]   |
|    Canvas                                            |           |
|                                                      |  Search   |
|                                        [b] <-- badge |  Stats    |
|         +--------+    ----    +--------+             |  People   |
|         | Ahmad  |----line----|  Fatma |             |  ...      |
|         |        |            |        |             |           |
|         +--------+            +--------+             |           |
|              |                                       |           |
|         +---------+                                  |           |
|         | Child 1 |                                  |           |
|         +---------+                                  |           |
+------------------------------------------------------------------+
```

### Desktop - after re-rooting to Fatma's ancestor

```
+------------------------------------------------------------------+
| [العودة لشجرة سعيد]                                 [sidebar]   |
|  ^ back chip                                         |           |
|    Canvas (now showing Fatma's                       |  Search   |
|    ancestor's tree)                                  |  Stats    |
|                                                      |  People   |
|         +-----------+                                |  ...      |
|         | Fatma's   |                                |           |
|         | Grandpa   |                                |           |
|         +-----------+                                |           |
|              |                                       |           |
|         +-----------+                                |           |
|         | Fatma's   |                                |           |
|         | Father    |                                |           |
|         +-----------+                                |           |
|              |                                       |           |
|    +--------+    ----    +--------+                  |           |
|    | Ahmad  |----line----| Fatma  |                  |           |
|    +--------+            +--------+                  |           |
+------------------------------------------------------------------+
```

### Mobile - badge and back chip

```
+-------------------------+
|                   [ham] |  <-- sidebar toggle (top-right)
| [العودة]                |  <-- back chip (top-left, short label)
|                         |
|                  [b]    |  <-- badge (28px on mobile)
|   +------+  --  +------+
|   |Ahmad |  --  |Fatma |
|   |      |      |      |
|   +------+      +------+
|       |                 |
|   +--------+           |
|   | Child  |           |
|   +--------+           |
+-------------------------+
```

---

## 9. Edge Cases

| Scenario | Behavior |
|----------|----------|
| Spouse has no parents or siblings in DB | No badge shown. No action available. |
| Spouse IS a descendant of the current root | No badge shown. They are already visible in this tree. |
| User re-roots, then re-roots again from the new tree | The "back" chip always points to `initialRootId` (the very first root), not the intermediate one. This prevents a "stack" of roots and keeps navigation simple. |
| User manually changes root via sidebar dropdown | If the new root equals `initialRootId`, the back chip disappears. If different, the back chip remains, still pointing to `initialRootId`. |
| Spouse's topmost ancestor IS the current root | This should not happen (the spouse would be a descendant of the current root, so the badge wouldn't show). But guard against it: if `topAncestorId === selectedRootId`, do not show the badge. |
| Data has circular references (malformed) | The topmost-ancestor lookup should use a visited set to prevent infinite loops, with a maximum walk depth of 100. |
| Private spouse | If the spouse is `isPrivate`, they are already excluded from rendering. No badge needed. |

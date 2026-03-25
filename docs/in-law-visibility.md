# In-Law Family Visibility

## Problem

The tree canvas renders top-down from a single root ancestor, showing all descendants downward. This works well for the direct lineage but creates a blind spot: when a descendant X marries someone Y who is not a descendant of the root, Y's own family (parents, siblings, extended relatives) is completely invisible in the tree.

Y appears as a spouse card next to X, and their shared children appear below them — but there is no way to see who Y's parents are, whether Y has siblings, or where Y comes from. This is especially notable when Y shares the same family name (i.e., comes from a related but separate branch not connected to the current root).

The information may exist in the database, but the current layout has no mechanism to surface it.

## Solutions

We will implement all four solutions below and offer them as user-facing options in the canvas.

---

### Solution 1 — Re-root on Spouse's Ancestor

**Concept**: A button on any married-in spouse's card (e.g., "عرض عائلتهم") navigates the tree to that spouse's topmost ancestor. The tree re-renders using the same top-down layout, now starting from the spouse's root.

**Behavior**:
- User clicks the button on spouse Y's card
- The system finds Y's topmost ancestor (the individual with no parents who Y descends from)
- `selectedRootId` is updated to that ancestor
- The tree re-renders from that new root, using the existing layout algorithm
- A back button or breadcrumb allows returning to the previous root

**Advantages**:
- Reuses the existing layout algorithm entirely — minimal implementation effort
- Familiar UX; the tree looks and behaves exactly the same, just from a different starting point

**Limitations**:
- You lose the current view — it's a full navigation, not a combined view
- You cannot see both family lines simultaneously

---

### Solution 2 — Spouse Family Sidebar

**Concept**: A secondary sidebar on the opposite side of the screen (left side, since the existing sidebar is on the right) that displays a married-in spouse's immediate family: parents, siblings, and optionally their spouses/children.

**Behavior**:
- User clicks a married-in spouse Y in the tree
- A left-side panel opens showing Y's family:
  - Parents (father, mother)
  - Siblings (with indication of sex)
  - Optionally: each sibling's spouse and children (one level)
- Clicking a person in this sidebar could trigger Solution 1 (re-root to see their full tree)

**Advantages**:
- Does not disturb the main tree view or the existing right sidebar
- Quick glance at the in-law family without navigating away
- Lightweight — no canvas layout changes needed

**Limitations**:
- Disconnected from the canvas visually — the in-law family is in a panel, not in the tree
- Limited to immediate family; deeper exploration requires Solution 1

---

### Solution 3 — Multi-Root View

**Concept**: Allow pinning multiple root ancestors simultaneously so that several family lines render side-by-side on the same canvas.

**Behavior**:
- User can pin additional roots alongside the current one (e.g., via a "Pin this root" action)
- Each pinned root renders its own top-down descendant tree on the canvas
- The trees are laid out horizontally next to each other with clear separation
- Shared individuals (e.g., a spouse who appears in both trees) could be visually linked with a connector line across trees
- Users can unpin roots to remove them from the view

**Advantages**:
- See multiple family lines at once without leaving the canvas
- Enables visual comparison between branches
- Shared individuals (married-in spouses) can be highlighted as connection points between trees

**Limitations**:
- Canvas can become very wide with multiple large trees
- Layout algorithm needs to handle independent subtrees with inter-tree connectors
- UX complexity: managing which roots are pinned, zoom/pan across multiple trees
- Significant implementation effort

---

### Solution 4 — Dual-Ancestry View

**Concept**: For a selected couple (X and Y), the tree renders both ancestral lines simultaneously — X's ancestors and Y's ancestors — converging at the couple, with shared descendants below.

**Behavior**:
- User selects a couple (or clicks a "show both families" option on a couple)
- The layout renders:
  - X's ancestors fanning upward on one side
  - Y's ancestors fanning upward on the other side
  - X and Y as the central couple
  - Their shared descendants below
- The couple sits at the visual convergence point of two family lines

**Advantages**:
- The most complete view — both lineages visible in a single canvas
- Visually communicates how two families are connected through marriage
- Useful for understanding inter-family marriages within the same broader clan

**Limitations**:
- Requires a new layout algorithm (dual upward trees + shared downward tree)
- Can become visually complex when both ancestral lines are deep
- Most implementation effort of the four solutions


Improve seed:
Seed invisible spouse' relatives (if they are from the same family)
/**
 * Sources («المصادر») — the ONE visibility gate. Every surface that shows a
 * source entry (sidebar, person page, «المصادر» page, public tree, file serve,
 * copy paths) decides through these functions and nothing else.
 *
 * Pure and FAIL-CLOSED: any unknown visibility, viewer kind or malformed
 * person context answers `false`.
 *
 * | Viewer  | Sees                                                           |
 * |---------|----------------------------------------------------------------|
 * | admin   | every entry, including on private people                       |
 * | member  | `members` + `public` entries, never on a private person        |
 * | public  | `public` entries only, on a person the public tree shows       |
 *
 * `admin` means workspace_admin of the workspace that OWNS the tree. A viewer
 * reaching data through a branch pointer is never admin of the source
 * workspace.
 */

/** Mirrors the Prisma `SourceVisibility` enum (stored as plaintext). */
export type SourceVisibilityLevel = 'admins' | 'members' | 'public';

export type SourceViewerKind = 'admin' | 'member' | 'public';

export interface SourceViewer {
  kind: SourceViewerKind;
}

export interface SourcePersonContext {
  isPrivate: boolean;
  /**
   * Borrowed via a branch pointer (`_pointed`). v1: sources of a borrowed
   * branch are served from the owning workspace only, so nobody sees them
   * through the borrowing tree.
   */
  pointed?: boolean;
  /**
   * The public tree already shows this person (not private, not a hidden
   * living person). Only consulted for the `public` viewer; missing = false.
   */
  publicShown?: boolean;
}

/** Minimum level each viewer kind may see. Anything not listed → nothing. */
const VISIBLE_LEVELS: Record<SourceViewerKind, ReadonlySet<string>> = {
  admin: new Set(['admins', 'members', 'public']),
  member: new Set(['members', 'public']),
  public: new Set(['public']),
};

function viewerLevels(viewer: SourceViewer | null | undefined): ReadonlySet<string> | null {
  const kind = viewer?.kind;
  if (kind !== 'admin' && kind !== 'member' && kind !== 'public') return null;
  return VISIBLE_LEVELS[kind];
}

/** May this viewer see sources on this person at all (ignoring entry level)? */
function canViewPersonSources(person: SourcePersonContext, kind: SourceViewerKind): boolean {
  // Borrowed people: served from the owning workspace only (v1), for everyone.
  if (person.pointed !== undefined && person.pointed !== false) return false;
  if (kind === 'admin') return true;
  // Anything but an explicit `false` counts as private.
  if (person.isPrivate !== false) return false;
  if (kind === 'member') return true;
  return person.publicShown === true;
}

/**
 * The gate. `person` is null for the tree-wide entry («مصدر الشجرة»).
 */
export function canViewSourceEntry(
  entry: { visibility: SourceVisibilityLevel },
  person: SourcePersonContext | null,
  viewer: SourceViewer,
): boolean {
  const levels = viewerLevels(viewer);
  if (!levels) return false;
  if (typeof entry?.visibility !== 'string' || !levels.has(entry.visibility)) return false;
  if (person === null) return true;
  return canViewPersonSources(person, viewer.kind);
}

/** The subset of a person's entries this viewer may see, order preserved. */
export function filterEntriesForViewer<T extends { visibility: SourceVisibilityLevel }>(
  entries: readonly T[],
  person: SourcePersonContext | null,
  viewer: SourceViewer,
): T[] {
  return entries.filter((e) => canViewSourceEntry(e, person, viewer));
}

/**
 * The tree-wide entry shown on a person as «من مصدر الشجرة», or null. It
 * shows only when the person has NO own entry visible to this viewer, the
 * viewer may see sources on this person at all, and the tree entry itself
 * passes the gate.
 */
export function inheritedTreeEntry<
  T extends { visibility: SourceVisibilityLevel },
  U extends { visibility: SourceVisibilityLevel },
>(
  ownEntries: readonly U[],
  treeEntry: T | null,
  person: SourcePersonContext,
  viewer: SourceViewer,
): T | null {
  if (!treeEntry) return null;
  if (filterEntriesForViewer(ownEntries, person, viewer).length > 0) return null;
  // Both the person-level gate and the tree-entry gate must pass.
  if (!canViewSourceEntry(treeEntry, person, viewer)) return null;
  if (!canViewSourceEntry(treeEntry, null, viewer)) return null;
  return treeEntry;
}

// ---------------------------------------------------------------------------
// Shared sources — one source linked to MANY people (rework R1)
// ---------------------------------------------------------------------------

/** What the per-source helpers need from a source row. */
export interface SharedSourceGateInput {
  visibility: SourceVisibilityLevel;
  /** «مصدر الشجرة» — explicit flag, never inferred from having no links. */
  isTreeWide: boolean;
}

/**
 * The linked people on whom this viewer may see this source, order kept.
 * The ONLY input for names, counts and «مشترك مع» — a count never includes a
 * person this returns nothing for.
 */
export function visibleLinkedPeople<P extends SourcePersonContext>(
  source: { visibility: SourceVisibilityLevel; isTreeWide?: boolean },
  people: readonly P[],
  viewer: SourceViewer,
): P[] {
  return people.filter((p) => canViewSourceEntry(source, p, viewer));
}

/**
 * May this viewer see the source at all (member file route, preview,
 * suggestions)? Admin: always, orphans included. Tree-wide source: the
 * tree-wide gate. Otherwise: at least one visible linked person — so a member
 * or visitor never sees an orphan.
 */
export function canViewSourceAnywhere(
  source: SharedSourceGateInput,
  people: readonly SourcePersonContext[],
  viewer: SourceViewer,
): boolean {
  if (!canViewSourceEntry(source, null, viewer)) return false;
  if (source.isTreeWide === true) return true;
  if (viewer.kind === 'admin') return true;
  return visibleLinkedPeople(source, people, viewer).length > 0;
}

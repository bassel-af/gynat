/**
 * Sources («المصادر») leak-guard helpers. Sources are NEVER part of
 * `GedcomData` or any tree-derived payload — they are served only by the
 * per-person sources route through `src/lib/tree/source-visibility.ts`.
 */

/** Denylist: any key that looks like a source / citation. */
export const SOURCE_KEY_PATTERN = /source|citation|sourceEntr|sourceLink/i;

/**
 * Keys that match the pattern but are branch-pointer PROVENANCE (a workspace
 * id), not evidence. Anything else matching the pattern is a leak.
 */
const PROVENANCE_KEYS = new Set(['_sourceWorkspaceId', 'sourceWorkspaceId']);

/** Deep-walk a value and return the dotted paths of every source-like key. */
export function findSourceKeys(value: unknown, path = '$', seen = new Set<unknown>()): string[] {
  if (value === null || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);
  const hits: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${path}.${key}`;
    if (SOURCE_KEY_PATTERN.test(key) && !PROVENANCE_KEYS.has(key)) hits.push(childPath);
    hits.push(...findSourceKeys(child, childPath, seen));
  }
  return hits;
}

/** Stray source-shaped values a buggy upstream might attach. */
export const STRAY_SOURCES = [{ id: 'SRC-1', text: 'طبقات ابن سعد، ص ٩٠', visibility: 'admins' }];

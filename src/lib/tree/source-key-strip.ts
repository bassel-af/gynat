import type { GedcomData } from '@/lib/gedcom/types'

/**
 * Sources («المصادر») are NEVER part of `GedcomData` — they are served only by
 * the per-person sources route through `source-visibility.ts`. This is the
 * fail-closed backstop on the tree's output paths (`redactForPublic`,
 * `redactPrivateIndividuals`, `extractPointedSubtree`): if an upstream bug ever
 * attaches a source-shaped key to an individual, a family or the root, it is
 * dropped here instead of riding out to a viewer or across a workspace.
 */
/** Covers `sourceEntries`, shared-source `sourceLinks`, `citations`, … */
const SOURCE_KEY_PATTERN = /source|citation/i

/** Branch-pointer provenance (a workspace id), not evidence — kept. */
const PROVENANCE_KEYS: ReadonlySet<string> = new Set(['_sourceWorkspaceId'])

function isSourceKey(key: string): boolean {
  return SOURCE_KEY_PATTERN.test(key) && !PROVENANCE_KEYS.has(key)
}

/** A copy of `obj` without source-shaped keys; the SAME reference when clean. */
function withoutSourceKeys<T extends object>(obj: T): T {
  const keys = Object.keys(obj)
  if (!keys.some(isSourceKey)) return obj
  const copy: Record<string, unknown> = {}
  for (const key of keys) {
    if (!isSourceKey(key)) copy[key] = (obj as Record<string, unknown>)[key]
  }
  return copy as T
}

function stripRecord<T extends object>(record: Record<string, T>): Record<string, T> {
  let out: Record<string, T> | null = null
  for (const [id, value] of Object.entries(record)) {
    const clean = withoutSourceKeys(value)
    if (clean !== value) {
      out ??= { ...record }
      out[id] = clean
    }
  }
  return out ?? record
}

/**
 * Drop source-shaped keys from the root, every individual and every family.
 * Pure: never mutates the input; untouched records keep their references.
 */
export function stripSourceKeys(data: GedcomData): GedcomData {
  const individuals = stripRecord(data.individuals)
  const families = stripRecord(data.families)
  const root = withoutSourceKeys(data)
  if (root === data && individuals === data.individuals && families === data.families) return data
  return { ...root, individuals, families }
}

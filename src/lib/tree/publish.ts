/**
 * Public Tree — publish / visibility helpers (PRD §1.3, §7.2, §7.11).
 *
 * Pure mapping + validation logic shared by the publish-preview and
 * visibility-PATCH routes. DB work stays in the routes.
 */

import { stripArabicDiacritics } from '@/lib/utils/search'

/** The DB enum values for tree visibility. */
export type TreeVisibilityValue = 'private' | 'public_link' | 'public_listed'

/** The UI ladder values (VisibilityLadder component). */
export type UiVisibilityLevel = 'private' | 'link' | 'search'

const UI_TO_DB: Record<UiVisibilityLevel, TreeVisibilityValue> = {
  private: 'private',
  link: 'public_link',
  search: 'public_listed',
}

const DB_TO_UI: Record<TreeVisibilityValue, UiVisibilityLevel> = {
  private: 'private',
  public_link: 'link',
  public_listed: 'search',
}

export function mapUiLevelToVisibility(level: UiVisibilityLevel): TreeVisibilityValue {
  return UI_TO_DB[level]
}

export function mapVisibilityToUiLevel(visibility: TreeVisibilityValue): UiVisibilityLevel {
  return DB_TO_UI[visibility]
}

/**
 * Validate the publisher's typed confirmation phrase against the expected one
 * (PRD §1.3 type-to-confirm; §7.2 "something the admin recognizes — the family
 * name / chosen title, independent of the link"). Diacritic-insensitive and
 * whitespace-trimmed, matching the existing cascade-delete confirmation. An
 * empty expected phrase always fails — you can never confirm against nothing.
 */
export function validateConfirmationPhrase(typed: string, expected: string): boolean {
  const typedNorm = stripArabicDiacritics(typed.trim())
  const expectedNorm = stripArabicDiacritics(expected.trim())
  if (!expectedNorm) return false
  if (!typedNorm) return false
  return typedNorm === expectedNorm
}

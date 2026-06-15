/**
 * Public Tree — auto-generated public URL slug (PRD §7.11).
 *
 * The user NEVER chooses the public address. One scheme for BOTH public levels:
 * a compact random code (letters+numbers, NOT a dashed UUID), long enough to be
 * unguessable so link-only trees can't be enumerated. The family name is never
 * derived into the slug.
 *
 * Uniqueness against the DB's `publicSlug @unique` is the caller's concern
 * (retry on collision); this helper only generates a candidate.
 */

import { randomBytes } from 'crypto'

// lowercase alphanumeric — no ambiguous separators, URL-safe everywhere.
const CODE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** Length of the public slug code. ≥20 keeps it practically unguessable. */
export const PUBLIC_SLUG_CODE_LENGTH = 22

function randomCode(length: number): string {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += CODE_CHARS[bytes[i] % CODE_CHARS.length]
  }
  return out
}

/** Generate an unguessable public slug candidate (same scheme for all levels). */
export function generatePublicSlug(): string {
  return randomCode(PUBLIC_SLUG_CODE_LENGTH)
}

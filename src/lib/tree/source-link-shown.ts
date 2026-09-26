/**
 * Sources — "does the public tree show this LINKED person in full?", read
 * straight from a person DB row (server-only: decrypts the birth date).
 *
 * The one server-side bridge between a stored person row and the pure
 * `isShownOnPublicTree` rule. Used by the publish summary (counting people a
 * level-3 source shows on) and by a cross-family source copy (a link travels
 * into another family ONLY when that family's public tree would show the
 * person). The birth date is decrypted in memory with the person's OWN
 * workspace key and never leaves this function.
 */
import { decryptField } from '@/lib/crypto/workspace-encryption';
import { isShownOnPublicTree } from '@/lib/tree/public-shown';
import type { Individual } from '@/lib/gedcom/types';

export interface LinkedPersonRow {
  isPrivate: boolean;
  isDeceased: boolean;
  birthDate: Uint8Array | Buffer | null;
}

/** Fail-closed: a missing row counts as not shown. */
export function isLinkedPersonShown(
  person: LinkedPersonRow | null | undefined,
  key: Buffer,
  now: Date,
): boolean {
  if (!person || person.isPrivate !== false) return false;
  const birth = person.birthDate ? decryptField(Buffer.from(person.birthDate), key) : '';
  const ind = { isPrivate: person.isPrivate, isDeceased: person.isDeceased, birth } as Individual;
  return isShownOnPublicTree(ind, now);
}

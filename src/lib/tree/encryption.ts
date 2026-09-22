/**
 * Tree domain encryption adapter — Phase 10b Layer 2.
 *
 * Bridges the generic AES-256-GCM primitives in `src/lib/crypto/workspace-encryption.ts`
 * to the tree domain (Individual, Family, RadaFamily, AncestryJump, TreeEditLog).
 *
 * Responsibilities:
 *   - Fetch/create per-workspace data keys (wrapped with the master key, stored
 *     in `Workspace.encryptedKey`).
 *   - Encrypt plaintext fields before they hit Prisma .create()/.update().
 *   - Decrypt Bytes fields returned by Prisma before handing them to the mapper.
 *   - Wrap/unwrap TreeEditLog snapshot JSON inside a `{ _encrypted, data }`
 *     envelope so snapshotBefore/snapshotAfter stays Json? in the schema.
 *   - Encrypt/decrypt the human-readable TreeEditLog.description field.
 *
 * Everything here is stateless — callers are expected to unwrap the workspace
 * key once per request via `getOrCreateWorkspaceKey`/`getWorkspaceKey` and pass
 * the Buffer to the encrypt/decrypt helpers explicitly.
 */

import { prisma } from '@/lib/db';
import { getMasterKey } from '@/lib/crypto/master-key';
import {
  generateWorkspaceKey,
  wrapKey,
  unwrapKey,
  encryptField,
  decryptField,
  encryptFieldNullable,
  decryptFieldNullable,
} from '@/lib/crypto/workspace-encryption';

// ---------------------------------------------------------------------------
// Field lists — single source of truth for "which columns are encrypted"
// ---------------------------------------------------------------------------

export const INDIVIDUAL_ENCRYPTED_FIELDS = [
  'givenName',
  'surname',
  'fullName',
  'birthDate',
  'birthPlace',
  'birthDescription',
  'birthNotes',
  'birthHijriDate',
  'deathDate',
  'deathPlace',
  'deathDescription',
  'deathNotes',
  'deathHijriDate',
  'kunya',
  'notes',
] as const;

export type IndividualEncryptedField = (typeof INDIVIDUAL_ENCRYPTED_FIELDS)[number];

export const FAMILY_ENCRYPTED_FIELDS = [
  'marriageContractDate',
  'marriageContractHijriDate',
  'marriageContractPlace',
  'marriageContractDescription',
  'marriageContractNotes',
  'marriageDate',
  'marriageHijriDate',
  'marriagePlace',
  'marriageDescription',
  'marriageNotes',
  'divorceDate',
  'divorceHijriDate',
  'divorcePlace',
  'divorceDescription',
  'divorceNotes',
] as const;

export type FamilyEncryptedField = (typeof FAMILY_ENCRYPTED_FIELDS)[number];

export const RADA_FAMILY_ENCRYPTED_FIELDS = ['notes'] as const;

export type RadaFamilyEncryptedField = (typeof RADA_FAMILY_ENCRYPTED_FIELDS)[number];

export const ANCESTRY_JUMP_ENCRYPTED_FIELDS = ['notes'] as const;

export type AncestryJumpEncryptedField = (typeof ANCESTRY_JUMP_ENCRYPTED_FIELDS)[number];

// ---------------------------------------------------------------------------
// Workspace key resolution
// ---------------------------------------------------------------------------

/**
 * Load (and if missing, generate) the unwrapped data key for a workspace.
 * Looks up `Workspace.encryptedKey`; if null, generates a fresh 32-byte key,
 * wraps it with the master key, persists the wrapped form, and returns the
 * plaintext key. Safe to call repeatedly — the DB update only happens on first
 * call for a given workspace.
 *
 * Callers should cache the returned Buffer for the life of a request rather
 * than calling this for every row.
 */
export async function getOrCreateWorkspaceKey(
  workspaceId: string,
): Promise<Buffer> {
  const master = getMasterKey();

  const existing = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { encryptedKey: true },
  });
  if (!existing) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }

  if (existing.encryptedKey) {
    return unwrapKey(Buffer.from(existing.encryptedKey), master);
  }

  const fresh = generateWorkspaceKey();
  const wrapped = wrapKey(fresh, master);
  await prisma.workspace.update({
    where: { id: workspaceId },
    // Cast via unknown — Prisma Bytes type is Uint8Array<ArrayBuffer>
    // while Node Buffer is a runtime-compatible subclass with ArrayBufferLike.
    data: { encryptedKey: wrapped } as unknown as Parameters<typeof prisma.workspace.update>[0]['data'],
  });
  return fresh;
}

/**
 * Read-only variant — throws if the workspace has no key yet. Use in read
 * paths where lazy-creation would mask a bug (or a permission problem).
 */
export async function getWorkspaceKey(workspaceId: string): Promise<Buffer> {
  const master = getMasterKey();
  const record = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { encryptedKey: true },
  });
  if (!record) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }
  if (!record.encryptedKey) {
    throw new Error(
      `Workspace ${workspaceId} has no encrypted_key — this workspace pre-dates Phase 10b or the key column was cleared. Run scripts/encrypt-existing-data.ts.`,
    );
  }
  return unwrapKey(Buffer.from(record.encryptedKey), master);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Prisma's driver adapter returns `Uint8Array` for Bytes columns; user
 * application code may pass `Buffer` directly. Normalize to Buffer so the
 * crypto layer (which checks `Buffer.isBuffer`) accepts the value.
 */
function toBuffer(value: Uint8Array | Buffer | null | undefined): Buffer | null {
  if (value == null) return null;
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

function encryptFieldsOf<K extends string>(
  input: Record<string, unknown>,
  fields: readonly K[],
  key: Buffer,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...input };
  for (const field of fields) {
    if (field in out) {
      const value = out[field];
      if (value === undefined) continue;
      out[field] = encryptFieldNullable(value as string | null | undefined, key);
    }
  }
  return out;
}

function decryptFieldsOf<K extends string>(
  row: Record<string, unknown>,
  fields: readonly K[],
  key: Buffer,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const field of fields) {
    if (field in out) {
      const raw = out[field];
      if (raw === undefined) continue;
      // Legacy / migration pass-through: if the column still holds a plain
      // string (pre-Phase-10b fixture data, or an unencrypted row the
      // migration script is about to re-encrypt), return it unchanged.
      // This is NOT a decrypt fallback — we only skip decryption when the
      // value cannot possibly be ciphertext (it's a JS string, not bytes).
      if (typeof raw === 'string') {
        out[field] = raw;
        continue;
      }
      out[field] = decryptFieldNullable(
        toBuffer(raw as Uint8Array | Buffer | null),
        key,
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Individual
// ---------------------------------------------------------------------------

/**
 * Utility: replace the listed encrypted fields on T from `string | null`
 * to `Buffer | null`, keeping every other field untouched.
 */
export type EncryptedOut<T, K extends string> =
  Omit<T, K> & { [P in K & keyof T]: Buffer | null };

/**
 * Encrypt the listed string fields on an Individual input, leaving every
 * other field untouched. Returns a new object — the caller's input is not
 * mutated. Encrypted fields become `Buffer | null`; null/undefined/empty
 * plaintext becomes `null`. The return type expresses the ciphertext shape
 * so the result can be passed directly to Prisma update/create calls that
 * expect Bytes columns.
 */
export function encryptIndividualInput<T extends Record<string, unknown>>(
  input: T,
  key: Buffer,
): EncryptedOut<T, IndividualEncryptedField> {
  return encryptFieldsOf(input, INDIVIDUAL_ENCRYPTED_FIELDS, key) as EncryptedOut<T, IndividualEncryptedField>;
}

/**
 * Decrypt the listed encrypted fields on an Individual DB row. Accepts
 * either Buffer or Uint8Array (Prisma driver returns Uint8Array).
 * Throws on auth-tag mismatch — never silently returns plaintext on failure.
 */
export function decryptIndividualRow<T extends object>(
  row: T,
  key: Buffer,
): T {
  return decryptFieldsOf(row as unknown as Record<string, unknown>, INDIVIDUAL_ENCRYPTED_FIELDS, key) as unknown as T;
}

// ---------------------------------------------------------------------------
// Family
// ---------------------------------------------------------------------------

export function encryptFamilyInput<T extends Record<string, unknown>>(
  input: T,
  key: Buffer,
): EncryptedOut<T, FamilyEncryptedField> {
  return encryptFieldsOf(input, FAMILY_ENCRYPTED_FIELDS, key) as EncryptedOut<T, FamilyEncryptedField>;
}

export function decryptFamilyRow<T extends object>(
  row: T,
  key: Buffer,
): T {
  return decryptFieldsOf(row as unknown as Record<string, unknown>, FAMILY_ENCRYPTED_FIELDS, key) as unknown as T;
}

// ---------------------------------------------------------------------------
// RadaFamily
// ---------------------------------------------------------------------------

export function encryptRadaFamilyInput<T extends Record<string, unknown>>(
  input: T,
  key: Buffer,
): EncryptedOut<T, RadaFamilyEncryptedField> {
  return encryptFieldsOf(input, RADA_FAMILY_ENCRYPTED_FIELDS, key) as EncryptedOut<T, RadaFamilyEncryptedField>;
}

export function decryptRadaFamilyRow<T extends object>(
  row: T,
  key: Buffer,
): T {
  return decryptFieldsOf(row as unknown as Record<string, unknown>, RADA_FAMILY_ENCRYPTED_FIELDS, key) as unknown as T;
}

// ---------------------------------------------------------------------------
// AncestryJump («قفزة نسب»)
// ---------------------------------------------------------------------------

export function encryptAncestryJumpInput<T extends Record<string, unknown>>(
  input: T,
  key: Buffer,
): EncryptedOut<T, AncestryJumpEncryptedField> {
  return encryptFieldsOf(input, ANCESTRY_JUMP_ENCRYPTED_FIELDS, key) as EncryptedOut<T, AncestryJumpEncryptedField>;
}

export function decryptAncestryJumpRow<T extends object>(
  row: T,
  key: Buffer,
): T {
  return decryptFieldsOf(row as unknown as Record<string, unknown>, ANCESTRY_JUMP_ENCRYPTED_FIELDS, key) as unknown as T;
}

// ---------------------------------------------------------------------------
// Audit snapshots
// ---------------------------------------------------------------------------

/**
 * Marker type used to distinguish encrypted snapshots from legacy plaintext
 * JSON rows that may exist in the audit log prior to the Phase 10b migration.
 * Uses `any`-typed index signature (same pattern as `audit.ts` JsonObject) so
 * the shape is directly assignable to Prisma's `InputJsonObject` without
 * hitting the array-branch narrowing the strict checker would otherwise pick.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export interface EncryptedSnapshotEnvelope {
  [key: string]: any;
  _encrypted: true;
  /** Base64-encoded ciphertext (iv || authTag || ciphertext). */
  data: string;
}

function isEnvelope(value: unknown): value is EncryptedSnapshotEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { _encrypted?: unknown })._encrypted === true &&
    typeof (value as { data?: unknown }).data === 'string'
  );
}

/**
 * Encrypt a JSON-serializable snapshot into a `{ _encrypted, data }` envelope
 * suitable for storing in a `Json?` column. Returns null for null input.
 *
 * Overloads: callers passing a non-null snapshot get back a non-null envelope,
 * so the result drops cleanly into Prisma `Json?` fields without a null-union.
 */
export function encryptSnapshot(
  snapshot: object,
  key: Buffer,
): EncryptedSnapshotEnvelope;
export function encryptSnapshot(
  snapshot: null,
  key: Buffer,
): null;
export function encryptSnapshot(
  snapshot: object | null,
  key: Buffer,
): EncryptedSnapshotEnvelope | null;
export function encryptSnapshot(
  snapshot: object | null,
  key: Buffer,
): EncryptedSnapshotEnvelope | null {
  if (snapshot === null) return null;
  const json = JSON.stringify(snapshot);
  const ciphertext = encryptField(json, key);
  return {
    _encrypted: true,
    data: ciphertext.toString('base64'),
  };
}

/**
 * Reverse of `encryptSnapshot`. Accepts three shapes:
 *   - null                  → returns null
 *   - envelope              → decrypt + JSON.parse
 *   - anything else         → legacy plaintext snapshot, returned as-is
 *
 * The legacy pass-through is what lets the audit log page continue to render
 * rows created before the Phase 10b migration ran.
 */
export function decryptSnapshot<T = unknown>(
  stored: unknown,
  key: Buffer,
): T | null {
  if (stored === null || stored === undefined) return null;
  if (!isEnvelope(stored)) {
    // Legacy / pre-encryption row — pass through.
    return stored as T;
  }
  const ciphertext = Buffer.from(stored.data, 'base64');
  const json = decryptField(ciphertext, key);
  return JSON.parse(json) as T;
}

// ---------------------------------------------------------------------------
// TreeEditLog.description
// ---------------------------------------------------------------------------

export function encryptDescription(
  description: string | null,
  key: Buffer,
): Buffer | null {
  return encryptFieldNullable(description, key);
}

export function decryptDescription(
  stored: Uint8Array | Buffer | null,
  key: Buffer,
): string | null {
  return decryptFieldNullable(toBuffer(stored), key);
}

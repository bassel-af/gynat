/**
 * Workspace encryption primitives — Phase 10b Layer 2.
 *
 * Pure Node `crypto` primitives. No Prisma, no Next.js, no domain imports.
 * Used by:
 *   - src/lib/crypto/master-key.ts (loads the master key from env)
 *   - src/lib/tree/encryption.ts (domain adapter that encrypts/decrypts fields)
 *   - scripts/encrypt-existing-data.ts (one-time migration)
 *
 * Security constraints (non-negotiable):
 *   - AES-256-GCM only. Never CBC. Never unauthenticated.
 *   - Nonces MUST come from crypto.randomBytes(12). Never deterministic, never reused.
 *   - Decrypt failures MUST throw — never silently return plaintext or "".
 *   - Raw 32-byte Buffer keys used directly, no custom KDF.
 *   - Packed ciphertext format: iv(12) || authTag(16) || ciphertext(N).
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCM,
  type DecipherGCM,
} from 'node:crypto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** AES-256-GCM recommended IV length, in bytes. */
export const IV_LENGTH = 12;

/** AES-GCM authentication tag length, in bytes. */
export const AUTH_TAG_LENGTH = 16;

/** AES-256 key length, in bytes. */
export const WORKSPACE_KEY_LENGTH = 32;

/** AES-256-GCM cipher identifier for Node crypto. */
const CIPHER_ALGORITHM = 'aes-256-gcm' as const;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function assertKey(key: Buffer, label: string): void {
  if (!Buffer.isBuffer(key)) {
    throw new Error(`${label} must be a Buffer`);
  }
  if (key.length !== WORKSPACE_KEY_LENGTH) {
    throw new Error(
      `${label} must be exactly ${WORKSPACE_KEY_LENGTH} bytes (got ${key.length})`,
    );
  }
}

/**
 * Pack iv || authTag || ciphertext into a single Buffer.
 * Layout is fixed across the entire codebase — do not reorder.
 */
function pack(iv: Buffer, authTag: Buffer, ciphertext: Buffer): Buffer {
  if (iv.length !== IV_LENGTH) {
    throw new Error(`iv must be ${IV_LENGTH} bytes`);
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`authTag must be ${AUTH_TAG_LENGTH} bytes`);
  }
  return Buffer.concat(
    [iv, authTag, ciphertext],
    IV_LENGTH + AUTH_TAG_LENGTH + ciphertext.length,
  );
}

/**
 * Unpack a Buffer produced by `pack` into its iv, authTag, ciphertext parts.
 * Throws if the buffer is too short to contain the fixed header — callers
 * then get a hard failure instead of a silent misread.
 */
function unpack(packed: Buffer): {
  iv: Buffer;
  authTag: Buffer;
  ciphertext: Buffer;
} {
  if (!Buffer.isBuffer(packed)) {
    throw new Error('ciphertext must be a Buffer');
  }
  const minLength = IV_LENGTH + AUTH_TAG_LENGTH;
  if (packed.length < minLength) {
    throw new Error(
      `ciphertext too short: expected at least ${minLength} bytes (got ${packed.length})`,
    );
  }
  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  return { iv, authTag, ciphertext };
}

/**
 * Core AES-256-GCM encrypt. Generates a fresh 12-byte random nonce per call.
 * Returns the packed iv || authTag || ciphertext Buffer.
 */
function gcmEncrypt(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(CIPHER_ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  }) as CipherGCM;
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return pack(iv, authTag, ciphertext);
}

/**
 * Core AES-256-GCM decrypt. Verifies the auth tag via `.final()` — any
 * tampering (iv, tag, ciphertext) will throw.
 */
function gcmDecrypt(packed: Buffer, key: Buffer): Buffer {
  const { iv, authTag, ciphertext } = unpack(packed);
  const decipher = createDecipheriv(CIPHER_ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  }) as DecipherGCM;
  decipher.setAuthTag(authTag);
  // decipher.final() throws "Unsupported state or unable to authenticate data"
  // if the auth tag does not verify. We intentionally let that bubble up —
  // callers must treat any throw as "ciphertext is invalid, refuse access".
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ---------------------------------------------------------------------------
// Public API — workspace key generation
// ---------------------------------------------------------------------------

/**
 * Generate a fresh 32-byte AES-256 workspace data key.
 * Call once when a workspace is created; wrap the result with the master key
 * before persisting to `Workspace.encryptedKey`.
 */
export function generateWorkspaceKey(): Buffer {
  return randomBytes(WORKSPACE_KEY_LENGTH);
}

// ---------------------------------------------------------------------------
// Public API — key wrapping
// ---------------------------------------------------------------------------

/**
 * Encrypt (wrap) a 32-byte workspace key with the master key.
 * Output layout: iv(12) || authTag(16) || ciphertext(32) = 60 bytes.
 *
 * @throws if either key is not a 32-byte Buffer, or if plaintextKey is not 32 bytes.
 */
export function wrapKey(plaintextKey: Buffer, masterKey: Buffer): Buffer {
  assertKey(masterKey, 'masterKey');
  assertKey(plaintextKey, 'plaintextKey');
  return gcmEncrypt(plaintextKey, masterKey);
}

/**
 * Decrypt (unwrap) a wrapped workspace key with the master key.
 *
 * @throws on auth tag mismatch (wrong master key, tampered wrapped blob, truncation).
 * @throws if masterKey is not a 32-byte Buffer.
 */
export function unwrapKey(wrappedKey: Buffer, masterKey: Buffer): Buffer {
  assertKey(masterKey, 'masterKey');
  const unwrapped = gcmDecrypt(wrappedKey, masterKey);
  if (unwrapped.length !== WORKSPACE_KEY_LENGTH) {
    // Defensive: if an attacker managed to forge a valid tag for a non-32-byte
    // plaintext (they cannot, but we fail closed anyway), refuse.
    throw new Error(
      `unwrapped key has unexpected length: ${unwrapped.length}`,
    );
  }
  return unwrapped;
}

// ---------------------------------------------------------------------------
// Public API — field encryption
// ---------------------------------------------------------------------------

/**
 * Encrypt raw bytes (e.g. an uploaded source file) with a workspace key.
 * Same layout as `encryptField`: iv(12) || authTag(16) || ciphertext(N).
 *
 * @throws if workspaceKey is not a 32-byte Buffer.
 */
export function encryptBytes(plaintext: Buffer, workspaceKey: Buffer): Buffer {
  assertKey(workspaceKey, 'workspaceKey');
  if (!Buffer.isBuffer(plaintext)) {
    throw new Error('encryptBytes expects a Buffer plaintext');
  }
  return gcmEncrypt(plaintext, workspaceKey);
}

/**
 * Decrypt a packed iv || authTag || ciphertext buffer back to raw bytes.
 *
 * @throws on auth tag mismatch, tampered ciphertext, wrong key, or truncation.
 */
export function decryptBytes(packed: Buffer, workspaceKey: Buffer): Buffer {
  assertKey(workspaceKey, 'workspaceKey');
  return gcmDecrypt(packed, workspaceKey);
}

/**
 * Encrypt a plaintext string with a workspace key.
 * Uses a fresh random 12-byte nonce per call — calling this twice with the
 * same plaintext yields different ciphertexts.
 *
 * Output layout: iv(12) || authTag(16) || ciphertext(N).
 *
 * @throws if workspaceKey is not a 32-byte Buffer.
 */
export function encryptField(plaintext: string, workspaceKey: Buffer): Buffer {
  assertKey(workspaceKey, 'workspaceKey');
  if (typeof plaintext !== 'string') {
    throw new Error('encryptField expects a string plaintext');
  }
  return gcmEncrypt(Buffer.from(plaintext, 'utf8'), workspaceKey);
}

/**
 * Decrypt a packed iv || authTag || ciphertext buffer with a workspace key
 * and return the plaintext string.
 *
 * @throws on auth tag mismatch, tampered ciphertext, wrong key, or truncation.
 *         NEVER silently returns plaintext or an empty string on failure.
 * @throws if workspaceKey is not a 32-byte Buffer.
 */
export function decryptField(
  ciphertext: Buffer,
  workspaceKey: Buffer,
): string {
  assertKey(workspaceKey, 'workspaceKey');
  const plaintext = gcmDecrypt(ciphertext, workspaceKey);
  return plaintext.toString('utf8');
}

// ---------------------------------------------------------------------------
// Public API — nullable wrappers (for optional DB columns)
// ---------------------------------------------------------------------------

/**
 * Encrypt a nullable plaintext. Returns null if the input is null, undefined,
 * or an empty string — matches the semantics of "no data to encrypt".
 * Non-empty strings are encrypted via `encryptField`.
 */
export function encryptFieldNullable(
  plaintext: string | null | undefined,
  workspaceKey: Buffer,
): Buffer | null {
  if (plaintext === null || plaintext === undefined || plaintext === '') {
    return null;
  }
  return encryptField(plaintext, workspaceKey);
}

/**
 * Decrypt a nullable ciphertext. Returns null if the input is null.
 * Non-null ciphertexts are decrypted via `decryptField` — any failure throws.
 */
export function decryptFieldNullable(
  ciphertext: Buffer | null,
  workspaceKey: Buffer,
): string | null {
  if (ciphertext === null) {
    return null;
  }
  return decryptField(ciphertext, workspaceKey);
}

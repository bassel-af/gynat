import { describe, test, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  generateWorkspaceKey,
  encryptBytes,
  decryptBytes,
  IV_LENGTH,
  AUTH_TAG_LENGTH,
} from '@/lib/crypto/workspace-encryption';

describe('encryptBytes / decryptBytes', () => {
  test('round-trips arbitrary binary data', () => {
    const key = generateWorkspaceKey();
    const data = randomBytes(4096);
    const packed = encryptBytes(data, key);
    expect(decryptBytes(packed, key).equals(data)).toBe(true);
  });

  test('uses the iv || tag || ciphertext layout', () => {
    const key = generateWorkspaceKey();
    const data = randomBytes(100);
    const packed = encryptBytes(data, key);
    expect(packed.length).toBe(IV_LENGTH + AUTH_TAG_LENGTH + data.length);
  });

  test('ciphertext differs from the plaintext bytes', () => {
    const key = generateWorkspaceKey();
    const data = Buffer.from('%PDF-1.7 secret scan');
    const packed = encryptBytes(data, key);
    expect(packed.includes(data)).toBe(false);
  });

  test('tampering with the ciphertext makes decryption fail', () => {
    const key = generateWorkspaceKey();
    const packed = encryptBytes(randomBytes(64), key);
    packed[packed.length - 1] ^= 0xff;
    expect(() => decryptBytes(packed, key)).toThrow();
  });

  test('decrypting with the wrong key fails', () => {
    const packed = encryptBytes(randomBytes(64), generateWorkspaceKey());
    expect(() => decryptBytes(packed, generateWorkspaceKey())).toThrow();
  });

  test('rejects a key of the wrong length', () => {
    expect(() => encryptBytes(randomBytes(8), randomBytes(16))).toThrow();
  });
});

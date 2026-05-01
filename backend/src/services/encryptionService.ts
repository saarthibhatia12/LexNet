// ============================================================================
// LexNet Backend — Encryption Service
// ============================================================================
//
// AES-256-GCM encryption and decryption for document files before IPFS upload.
// Uses a random 12-byte IV per operation and verifies the authentication tag
// on decryption.
// ============================================================================

import crypto from 'node:crypto';
import {
  AES_ALGORITHM,
  AES_IV_LENGTH_BYTES,
  AES_AUTH_TAG_LENGTH_BYTES,
  AES_KEY_LENGTH_BYTES,
} from '../utils/constants.js';
import type { EncryptionResult } from '../types/index.js';
import { DecryptionError, ValidationError } from '../types/index.js';
import { logger } from '../config/logger.js';

/**
 * Parse a hex-encoded AES-256 key string into a Buffer.
 * Validates that the key is the correct length (64 hex chars = 32 bytes).
 *
 * @param keyHex - The 64-character hex-encoded key string
 * @returns A 32-byte Buffer containing the key
 * @throws ValidationError if the key is invalid
 */
function parseKey(keyHex: string): Buffer {
  if (!keyHex || keyHex.length !== AES_KEY_LENGTH_BYTES * 2) {
    throw new ValidationError(
      `AES key must be exactly ${AES_KEY_LENGTH_BYTES * 2} hex characters (${AES_KEY_LENGTH_BYTES} bytes)`
    );
  }

  if (!/^[0-9a-fA-F]+$/.test(keyHex)) {
    throw new ValidationError('AES key must contain only hexadecimal characters');
  }

  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt a buffer using AES-256-GCM.
 *
 * - Generates a cryptographically random 12-byte IV for each operation
 * - Returns the ciphertext, IV, and 16-byte authentication tag separately
 * - An empty input buffer returns an empty ciphertext with a valid IV and auth tag
 *
 * @param buffer - The plaintext data to encrypt
 * @param keyHex - The 64-character hex-encoded AES-256 key
 * @returns An EncryptionResult containing ciphertext, iv, and authTag
 * @throws ValidationError if the key is invalid
 */
export function encrypt(buffer: Buffer, keyHex: string): EncryptionResult {
  const key = parseKey(keyHex);

  // Generate a random 12-byte IV — NEVER reuse an IV with the same key
  const iv = crypto.randomBytes(AES_IV_LENGTH_BYTES);

  const cipher = crypto.createCipheriv(AES_ALGORITHM, key, iv, {
    authTagLength: AES_AUTH_TAG_LENGTH_BYTES,
  });

  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  logger.debug('Encryption completed', {
    inputSize: buffer.length,
    outputSize: encrypted.length,
    ivLength: iv.length,
    authTagLength: authTag.length,
  });

  return {
    ciphertext: encrypted,
    iv,
    authTag,
  };
}

/**
 * Decrypt a buffer using AES-256-GCM.
 *
 * - Verifies the authentication tag to ensure data integrity
 * - Throws a DecryptionError if the key is wrong or data is corrupted
 *
 * @param ciphertext - The encrypted data
 * @param iv - The 12-byte initialisation vector used during encryption
 * @param authTag - The 16-byte authentication tag produced during encryption
 * @param keyHex - The 64-character hex-encoded AES-256 key
 * @returns The decrypted plaintext buffer
 * @throws DecryptionError if decryption fails (wrong key, corrupted data, tampered auth tag)
 * @throws ValidationError if the key is invalid
 */
export function decrypt(
  ciphertext: Buffer,
  iv: Buffer,
  authTag: Buffer,
  keyHex: string
): Buffer {
  const key = parseKey(keyHex);

  if (iv.length !== AES_IV_LENGTH_BYTES) {
    throw new DecryptionError(
      `IV must be exactly ${AES_IV_LENGTH_BYTES} bytes, got ${iv.length}`
    );
  }

  if (authTag.length !== AES_AUTH_TAG_LENGTH_BYTES) {
    throw new DecryptionError(
      `Auth tag must be exactly ${AES_AUTH_TAG_LENGTH_BYTES} bytes, got ${authTag.length}`
    );
  }

  try {
    const decipher = crypto.createDecipheriv(AES_ALGORITHM, key, iv, {
      authTagLength: AES_AUTH_TAG_LENGTH_BYTES,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    logger.debug('Decryption completed', {
      inputSize: ciphertext.length,
      outputSize: decrypted.length,
    });

    return decrypted;
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown decryption error';

    logger.warn('Decryption failed', { error: message });

    throw new DecryptionError(
      `Decryption failed: ${message}. This may indicate a wrong key or corrupted/tampered data.`
    );
  }
}

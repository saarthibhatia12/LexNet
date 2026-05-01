// ============================================================================
// LexNet Backend — Encryption Service Tests
// ============================================================================
//
// Tests:
//   1. Encrypt → decrypt roundtrip produces original data
//   2. Wrong key throws DecryptionError
//   3. Corrupted ciphertext throws DecryptionError
//   4. Empty buffer encrypts and decrypts correctly
//   5. Tampered auth tag throws DecryptionError
//   6. Invalid key format throws ValidationError
//   7. Each encryption produces a unique IV (no IV reuse)
// ============================================================================

import { encrypt, decrypt } from '../../src/services/encryptionService.js';
import { DecryptionError, ValidationError } from '../../src/types/index.js';
import crypto from 'node:crypto';

// A valid 64-char hex key (32 bytes) for testing
const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// A different valid key for "wrong key" tests
const WRONG_KEY = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

describe('encryptionService', () => {
  // -------------------------------------------------------------------------
  // Roundtrip
  // -------------------------------------------------------------------------
  describe('encrypt → decrypt roundtrip', () => {
    it('should correctly encrypt and decrypt a normal buffer', () => {
      const plaintext = Buffer.from('The quick brown fox jumps over the lazy dog');
      const { ciphertext, iv, authTag } = encrypt(plaintext, TEST_KEY);

      const decrypted = decrypt(ciphertext, iv, authTag, TEST_KEY);

      expect(decrypted).toEqual(plaintext);
      expect(decrypted.toString('utf8')).toBe(plaintext.toString('utf8'));
    });

    it('should correctly encrypt and decrypt a large buffer', () => {
      // 1 MB of random data
      const plaintext = crypto.randomBytes(1024 * 1024);
      const { ciphertext, iv, authTag } = encrypt(plaintext, TEST_KEY);

      const decrypted = decrypt(ciphertext, iv, authTag, TEST_KEY);

      expect(decrypted).toEqual(plaintext);
    });

    it('should correctly encrypt and decrypt binary data', () => {
      const plaintext = Buffer.from([0x00, 0xFF, 0x80, 0x7F, 0x01, 0xFE]);
      const { ciphertext, iv, authTag } = encrypt(plaintext, TEST_KEY);

      const decrypted = decrypt(ciphertext, iv, authTag, TEST_KEY);

      expect(decrypted).toEqual(plaintext);
    });
  });

  // -------------------------------------------------------------------------
  // Empty buffer
  // -------------------------------------------------------------------------
  describe('empty buffer handling', () => {
    it('should encrypt and decrypt an empty buffer', () => {
      const plaintext = Buffer.alloc(0);
      const { ciphertext, iv, authTag } = encrypt(plaintext, TEST_KEY);

      // Empty plaintext should produce empty ciphertext
      expect(ciphertext.length).toBe(0);
      // But IV and authTag should still be valid
      expect(iv.length).toBe(12);
      expect(authTag.length).toBe(16);

      const decrypted = decrypt(ciphertext, iv, authTag, TEST_KEY);
      expect(decrypted).toEqual(plaintext);
      expect(decrypted.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Wrong key
  // -------------------------------------------------------------------------
  describe('wrong key', () => {
    it('should throw DecryptionError when decrypting with the wrong key', () => {
      const plaintext = Buffer.from('Sensitive document content');
      const { ciphertext, iv, authTag } = encrypt(plaintext, TEST_KEY);

      expect(() => decrypt(ciphertext, iv, authTag, WRONG_KEY)).toThrow(
        DecryptionError
      );
    });
  });

  // -------------------------------------------------------------------------
  // Corrupted ciphertext
  // -------------------------------------------------------------------------
  describe('corrupted ciphertext', () => {
    it('should throw DecryptionError when ciphertext is tampered with', () => {
      const plaintext = Buffer.from('Important legal record');
      const { ciphertext, iv, authTag } = encrypt(plaintext, TEST_KEY);

      // Flip a bit in the ciphertext
      const corrupted = Buffer.from(ciphertext);
      corrupted[0] = corrupted[0]! ^ 0xFF;

      expect(() => decrypt(corrupted, iv, authTag, TEST_KEY)).toThrow(
        DecryptionError
      );
    });
  });

  // -------------------------------------------------------------------------
  // Tampered auth tag
  // -------------------------------------------------------------------------
  describe('tampered auth tag', () => {
    it('should throw DecryptionError when auth tag is tampered with', () => {
      const plaintext = Buffer.from('Another document');
      const { ciphertext, iv, authTag } = encrypt(plaintext, TEST_KEY);

      // Flip a bit in the auth tag
      const tamperedTag = Buffer.from(authTag);
      tamperedTag[0] = tamperedTag[0]! ^ 0xFF;

      expect(() => decrypt(ciphertext, iv, tamperedTag, TEST_KEY)).toThrow(
        DecryptionError
      );
    });
  });

  // -------------------------------------------------------------------------
  // Invalid key format
  // -------------------------------------------------------------------------
  describe('invalid key', () => {
    it('should throw ValidationError for a key that is too short', () => {
      const plaintext = Buffer.from('test');

      expect(() => encrypt(plaintext, 'abcdef')).toThrow(ValidationError);
    });

    it('should throw ValidationError for a key with non-hex characters', () => {
      const key = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';
      const plaintext = Buffer.from('test');

      expect(() => encrypt(plaintext, key)).toThrow(ValidationError);
    });

    it('should throw ValidationError for an empty key', () => {
      const plaintext = Buffer.from('test');

      expect(() => encrypt(plaintext, '')).toThrow(ValidationError);
    });
  });

  // -------------------------------------------------------------------------
  // IV uniqueness
  // -------------------------------------------------------------------------
  describe('IV uniqueness', () => {
    it('should produce different IVs for successive encryptions', () => {
      const plaintext = Buffer.from('Same data encrypted twice');

      const result1 = encrypt(plaintext, TEST_KEY);
      const result2 = encrypt(plaintext, TEST_KEY);

      // IVs should be different (random)
      expect(result1.iv).not.toEqual(result2.iv);

      // Ciphertexts should also differ because of different IVs
      expect(result1.ciphertext).not.toEqual(result2.ciphertext);

      // But both should decrypt to the same plaintext
      const decrypted1 = decrypt(result1.ciphertext, result1.iv, result1.authTag, TEST_KEY);
      const decrypted2 = decrypt(result2.ciphertext, result2.iv, result2.authTag, TEST_KEY);
      expect(decrypted1).toEqual(plaintext);
      expect(decrypted2).toEqual(plaintext);
    });
  });

  // -------------------------------------------------------------------------
  // Invalid IV / auth tag lengths for decrypt
  // -------------------------------------------------------------------------
  describe('invalid IV/authTag lengths', () => {
    it('should throw DecryptionError for wrong IV length', () => {
      const plaintext = Buffer.from('test');
      const { ciphertext, authTag } = encrypt(plaintext, TEST_KEY);
      const badIv = Buffer.alloc(8); // should be 12

      expect(() => decrypt(ciphertext, badIv, authTag, TEST_KEY)).toThrow(
        DecryptionError
      );
    });

    it('should throw DecryptionError for wrong auth tag length', () => {
      const plaintext = Buffer.from('test');
      const { ciphertext, iv } = encrypt(plaintext, TEST_KEY);
      const badTag = Buffer.alloc(8); // should be 16

      expect(() => decrypt(ciphertext, iv, badTag, TEST_KEY)).toThrow(
        DecryptionError
      );
    });
  });
});

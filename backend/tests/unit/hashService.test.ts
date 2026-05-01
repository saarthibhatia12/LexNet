// ============================================================================
// LexNet Backend — Hash Service Tests
// ============================================================================
//
// Tests:
//   1. Known SHA-256 test vectors (NIST/RFC standard)
//   2. Empty input produces the correct SHA-256 hash
//   3. Binary data hashing
//   4. Stream-based hashing matches buffer-based hashing
//   5. Hash output is lowercase hex, 64 characters
// ============================================================================

import { computeSHA256, computeSHA256FromStream } from '../../src/services/hashService.js';
import { Readable } from 'node:stream';

describe('hashService', () => {
  // -------------------------------------------------------------------------
  // Known SHA-256 vectors
  // -------------------------------------------------------------------------
  describe('computeSHA256 — known vectors', () => {
    it('should produce the correct hash for "abc"', () => {
      // NIST FIPS 180-4 test vector for "abc"
      const input = Buffer.from('abc');
      const expected = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

      expect(computeSHA256(input)).toBe(expected);
    });

    it('should produce the correct hash for an empty input', () => {
      // SHA-256 of empty string
      const input = Buffer.alloc(0);
      const expected = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

      expect(computeSHA256(input)).toBe(expected);
    });

    it('should produce the correct hash for "hello world"', () => {
      const input = Buffer.from('hello world');
      const expected = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9';

      expect(computeSHA256(input)).toBe(expected);
    });
  });

  // -------------------------------------------------------------------------
  // Output format
  // -------------------------------------------------------------------------
  describe('output format', () => {
    it('should return a lowercase hex string', () => {
      const hash = computeSHA256(Buffer.from('test'));

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should return exactly 64 characters', () => {
      const hash = computeSHA256(Buffer.from('any content'));

      expect(hash.length).toBe(64);
    });
  });

  // -------------------------------------------------------------------------
  // Binary data
  // -------------------------------------------------------------------------
  describe('binary data', () => {
    it('should hash binary data correctly', () => {
      const binary = Buffer.from([0x00, 0xFF, 0x80, 0x7F]);
      const hash = computeSHA256(binary);

      expect(hash).toMatch(/^[0-9a-f]{64}$/);

      // Same input should always produce the same hash
      expect(computeSHA256(binary)).toBe(hash);
    });
  });

  // -------------------------------------------------------------------------
  // Determinism
  // -------------------------------------------------------------------------
  describe('determinism', () => {
    it('should produce the same hash for the same input', () => {
      const data = Buffer.from('deterministic hashing test');

      const hash1 = computeSHA256(data);
      const hash2 = computeSHA256(data);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = computeSHA256(Buffer.from('input A'));
      const hash2 = computeSHA256(Buffer.from('input B'));

      expect(hash1).not.toBe(hash2);
    });
  });

  // -------------------------------------------------------------------------
  // Stream-based hashing
  // -------------------------------------------------------------------------
  describe('computeSHA256FromStream', () => {
    it('should produce the same hash as buffer-based computation', async () => {
      const data = Buffer.from('stream hashing test content');
      const bufferHash = computeSHA256(data);

      const stream = Readable.from(data);
      const streamHash = await computeSHA256FromStream(stream);

      expect(streamHash).toBe(bufferHash);
    });

    it('should handle an empty stream', async () => {
      const emptyHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

      const stream = Readable.from(Buffer.alloc(0));
      const hash = await computeSHA256FromStream(stream);

      expect(hash).toBe(emptyHash);
    });

    it('should handle chunked data correctly', async () => {
      const fullData = Buffer.from('chunked data spread across multiple reads');
      const expectedHash = computeSHA256(fullData);

      // Create a stream that delivers data in small chunks
      const chunks = [
        fullData.subarray(0, 10),
        fullData.subarray(10, 25),
        fullData.subarray(25),
      ];
      const stream = Readable.from(chunks);
      const hash = await computeSHA256FromStream(stream);

      expect(hash).toBe(expectedHash);
    });

    it('should reject on stream error', async () => {
      const stream = new Readable({
        read() {
          this.destroy(new Error('Simulated read error'));
        },
      });

      await expect(computeSHA256FromStream(stream)).rejects.toThrow(
        'Simulated read error'
      );
    });
  });
});

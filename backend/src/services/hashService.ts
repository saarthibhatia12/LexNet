// ============================================================================
// LexNet Backend — Hash Service
// ============================================================================
//
// SHA-256 hashing for document integrity verification.
// Produces lowercase hex output as required by the blockchain contracts.
// ============================================================================

import crypto from 'node:crypto';
import type { Readable } from 'node:stream';
import { HASH_ALGORITHM, HASH_OUTPUT_FORMAT } from '../utils/constants.js';
import { logger } from '../config/logger.js';

/**
 * Compute the SHA-256 hash of a buffer.
 *
 * @param buffer - The data to hash (can be empty — returns hash of empty input)
 * @returns Lowercase hex-encoded SHA-256 hash string (64 characters)
 */
export function computeSHA256(buffer: Buffer): string {
  const hash = crypto
    .createHash(HASH_ALGORITHM)
    .update(buffer)
    .digest(HASH_OUTPUT_FORMAT);

  logger.debug('SHA-256 hash computed', {
    inputSize: buffer.length,
    hash: hash.substring(0, 16) + '...',
  });

  return hash;
}

/**
 * Compute the SHA-256 hash of a readable stream.
 * Suitable for large files that shouldn't be loaded entirely into memory.
 *
 * @param stream - A readable stream of the data to hash
 * @returns A promise that resolves to a lowercase hex-encoded SHA-256 hash string
 * @throws Error if the stream emits an error
 */
export function computeSHA256FromStream(stream: Readable): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash(HASH_ALGORITHM);

    stream.on('data', (chunk: Buffer) => {
      hash.update(chunk);
    });

    stream.on('end', () => {
      const digest = hash.digest(HASH_OUTPUT_FORMAT);

      logger.debug('SHA-256 hash computed from stream', {
        hash: digest.substring(0, 16) + '...',
      });

      resolve(digest);
    });

    stream.on('error', (error: Error) => {
      logger.error('Stream hashing failed', { error: error.message });
      reject(error);
    });
  });
}

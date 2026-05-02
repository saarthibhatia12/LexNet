// ============================================================================
// LexNet Backend — Verify Controller
// ============================================================================
//
// GET /api/verify/:hash
//
// Public endpoint for document verification. The full verification pipeline:
//   1. Query blockchain (Fabric) for the document record
//   2. If not found → NOT_REGISTERED
//   3. Retrieve encrypted payload from IPFS using the stored CID
//   4. Decrypt using AES-256-GCM
//   5. Recompute SHA-256 of the decrypted content
//   6. Compare recomputed hash with the requested hash
//   7. Match → AUTHENTIC, Mismatch → TAMPERED
//   8. Any service error → ERROR status
// ============================================================================

import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import * as fabricService from '../services/fabricService.js';
import * as ipfsService from '../services/ipfsService.js';
import * as encryptionService from '../services/encryptionService.js';
import * as hashService from '../services/hashService.js';
import type { VerificationResult, EncryptedPayload } from '../types/index.js';
import { DocumentNotFoundError } from '../types/index.js';

/**
 * GET /api/verify/:hash
 *
 * Public endpoint — no authentication required.
 * Returns one of four statuses:
 *   - AUTHENTIC: hash matches, document is genuine
 *   - TAMPERED: hash does not match, document has been altered
 *   - NOT_REGISTERED: no blockchain record exists for this hash
 *   - ERROR: a service failure prevented verification
 */
export async function verifyHandler(
  req: Request,
  res: Response
): Promise<void> {
  const { hash } = req.params;

  // Validate hash parameter
  if (!hash || hash.trim().length === 0) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'Document hash is required',
    });
    return;
  }

  // Validate hash format (SHA-256 = 64 lowercase hex chars)
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    res.status(400).json({
      error: 'ValidationError',
      message: 'Document hash must be a 64-character lowercase hex string (SHA-256)',
    });
    return;
  }

  logger.info('Verification request received', { docHash: hash });

  try {
    // 1. Query blockchain for the document record
    let document;
    try {
      document = await fabricService.verifyDocument(hash);
    } catch (error: unknown) {
      if (error instanceof DocumentNotFoundError) {
        const result: VerificationResult = {
          status: 'NOT_REGISTERED',
          docHash: hash,
          message: 'No blockchain record found for this document hash',
        };

        logger.info('Verification result: NOT_REGISTERED', { docHash: hash });
        res.status(200).json(result);
        return;
      }
      throw error;
    }

    // 2. If verifyDocument returned null → NOT_REGISTERED
    if (!document) {
      const result: VerificationResult = {
        status: 'NOT_REGISTERED',
        docHash: hash,
        message: 'No blockchain record found for this document hash',
      };

      logger.info('Verification result: NOT_REGISTERED', { docHash: hash });
      res.status(200).json(result);
      return;
    }

    // 3. Retrieve the encrypted payload from IPFS
    const ipfsBuffer = await ipfsService.retrieveFromIPFS(document.ipfsCID);

    // 4. Parse the encrypted payload (stored as JSON with base64 fields)
    let encryptedPayload: EncryptedPayload;
    try {
      encryptedPayload = JSON.parse(ipfsBuffer.toString('utf-8')) as EncryptedPayload;
    } catch {
      // If parsing fails, the IPFS content might be raw encrypted data.
      // This is an ERROR scenario — data format is unexpected.
      logger.error('Failed to parse IPFS payload as JSON', {
        docHash: hash,
        ipfsCID: document.ipfsCID,
      });

      const result: VerificationResult = {
        status: 'ERROR',
        docHash: hash,
        document,
        message: 'Failed to parse stored document payload',
      };
      res.status(200).json(result);
      return;
    }

    // 5. Decrypt the payload
    const ciphertext = Buffer.from(encryptedPayload.ciphertext, 'base64');
    const iv = Buffer.from(encryptedPayload.iv, 'base64');
    const authTag = Buffer.from(encryptedPayload.authTag, 'base64');

    const decryptedBuffer = encryptionService.decrypt(
      ciphertext,
      iv,
      authTag,
      env.AES_KEY
    );

    // 6. Recompute SHA-256 of the decrypted content
    const recomputedHash = hashService.computeSHA256(decryptedBuffer);

    // 7. Compare hashes
    if (recomputedHash === hash) {
      const result: VerificationResult = {
        status: 'AUTHENTIC',
        docHash: hash,
        timestamp: document.createdAt,
        document,
        message: 'Document is authentic — hash matches blockchain record',
      };

      logger.info('Verification result: AUTHENTIC', { docHash: hash });
      res.status(200).json(result);
    } else {
      const result: VerificationResult = {
        status: 'TAMPERED',
        docHash: hash,
        timestamp: document.createdAt,
        document,
        message: 'Document has been tampered with — hash mismatch detected',
      };

      logger.warn('Verification result: TAMPERED', {
        docHash: hash,
        recomputedHash,
      });
      res.status(200).json(result);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Verification failed';

    logger.error('Verification pipeline error', {
      docHash: hash,
      error: message,
    });

    const result: VerificationResult = {
      status: 'ERROR',
      docHash: hash,
      message: `Verification failed: ${message}`,
    };

    res.status(200).json(result);
  }
}

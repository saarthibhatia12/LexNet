// ============================================================================
// LexNet Backend — REST Routes
// ============================================================================
//
// Registers all REST API routes on an Express Router:
//
//   POST  /api/auth/hardware     Hardware bridge authentication
//   POST  /api/auth/login        Demo user login
//   GET   /api/verify/:hash      Public document verification
//   GET   /api/health            Health check
//   GET   /api/documents/:hash/pdf  Download document PDF (authenticated)
//
// Middleware applied:
//   - authRateLimiter on /api/auth/* endpoints
//   - authMiddleware on protected endpoints
//   - asyncHandler to catch async errors
// ============================================================================

import { Router } from 'express';
import { hardwareAuthHandler } from './hardwareAuthController.js';
import { loginHandler } from './loginController.js';
import { verifyHandler } from './verifyController.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';
import { authMiddleware } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { logger } from '../config/logger.js';
import type { Request, Response } from 'express';

/**
 * Create and configure the REST API router.
 */
export function createRestRouter(): Router {
  const router = Router();

  // -------------------------------------------------------------------------
  // Health Check — GET /api/health
  // -------------------------------------------------------------------------
  router.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'lexnet-backend',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // -------------------------------------------------------------------------
  // Auth Endpoints — Rate-limited (20 req / 15 min)
  // -------------------------------------------------------------------------

  // POST /api/auth/hardware — Hardware bridge JWT → session JWT
  router.post(
    '/auth/hardware',
    authRateLimiter,
    asyncHandler(hardwareAuthHandler)
  );

  // POST /api/auth/login — Demo user login → session JWT
  router.post(
    '/auth/login',
    authRateLimiter,
    asyncHandler(loginHandler)
  );

  // -------------------------------------------------------------------------
  // Public Endpoints
  // -------------------------------------------------------------------------

  // GET /api/verify/:hash — Public document verification
  router.get(
    '/verify/:hash',
    asyncHandler(verifyHandler)
  );

  // -------------------------------------------------------------------------
  // Protected Endpoints (require valid session JWT)
  // -------------------------------------------------------------------------

  // GET /api/documents/:hash/pdf — Download verified document as PDF
  router.get(
    '/documents/:hash/pdf',
    authMiddleware,
    asyncHandler(async (req: Request, res: Response) => {
      const { hash } = req.params;

      if (!hash || !/^[0-9a-f]{64}$/.test(hash)) {
        res.status(400).json({
          error: 'ValidationError',
          message: 'Document hash must be a 64-character lowercase hex string',
        });
        return;
      }

      // Import services lazily to avoid circular deps at module load time
      const fabricService = await import('../services/fabricService.js');
      const ipfsService = await import('../services/ipfsService.js');
      const encryptionService = await import('../services/encryptionService.js');
      const { env } = await import('../config/env.js');

      // 1. Get document record from blockchain
      const document = await fabricService.getDocument(hash);

      // 2. Retrieve encrypted payload from IPFS
      const ipfsBuffer = await ipfsService.retrieveFromIPFS(document.ipfsCID);

      // 3. Parse and decrypt
      const payload = JSON.parse(ipfsBuffer.toString('utf-8')) as {
        ciphertext: string;
        iv: string;
        authTag: string;
      };

      const decryptedBuffer = encryptionService.decrypt(
        Buffer.from(payload.ciphertext, 'base64'),
        Buffer.from(payload.iv, 'base64'),
        Buffer.from(payload.authTag, 'base64'),
        env.AES_KEY
      );

      logger.info('Document PDF download', {
        docHash: hash,
        size: decryptedBuffer.length,
      });

      // 4. Send as PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="document-${hash.substring(0, 8)}.pdf"`
      );
      res.setHeader('Content-Length', decryptedBuffer.length.toString());
      res.send(decryptedBuffer);
    })
  );

  return router;
}

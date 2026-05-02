// ============================================================================
// LexNet Backend — Hardware Auth Controller
// ============================================================================
//
// POST /api/auth/hardware
//
// Verifies a JWT issued by the hardware bridge (STM32 → Python → this endpoint).
// On success, issues a session JWT (1-hour expiry, role: "official").
//
// Checks performed (per AGENTS.md contract):
//   1. Bearer token is present in the Authorization header
//   2. Token is a valid HS256 JWT signed with JWT_SECRET
//   3. iss === "lexnet-bridge"
//   4. finger_score >= 60
//   5. Token has not expired (max 5 minutes)
//   6. device_id is present and non-empty
// ============================================================================

import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { HardwareJwtPayload, SessionJwtPayload } from '../types/index.js';
import {
  JWT_ALGORITHM,
  HARDWARE_JWT_ISSUER,
  MIN_FINGER_SCORE,
  SESSION_JWT_EXPIRY,
} from '../utils/constants.js';

/**
 * POST /api/auth/hardware
 *
 * Verify a bridge JWT → issue a session JWT.
 */
export async function hardwareAuthHandler(
  req: Request,
  res: Response
): Promise<void> {
  // 1. Extract Bearer token
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    logger.debug('Hardware auth: missing Authorization header');
    res.status(401).json({
      error: 'AuthenticationError',
      message: 'Missing Authorization header',
    });
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    logger.debug('Hardware auth: malformed Authorization header');
    res.status(401).json({
      error: 'AuthenticationError',
      message: 'Authorization header must follow "Bearer <token>" format',
    });
    return;
  }

  const token = parts[1]!;

  // 2. Verify the JWT
  let decoded: HardwareJwtPayload;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
    }) as HardwareJwtPayload;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Token verification failed';

    if (error instanceof jwt.TokenExpiredError) {
      logger.debug('Hardware auth: bridge token expired');
      res.status(401).json({
        error: 'AuthenticationError',
        message: 'Bridge token has expired',
      });
      return;
    }

    logger.debug('Hardware auth: invalid bridge token', { reason: message });
    res.status(401).json({
      error: 'AuthenticationError',
      message: 'Invalid bridge token',
    });
    return;
  }

  // 3. Check issuer — must be exactly "lexnet-bridge"
  if (decoded.iss !== HARDWARE_JWT_ISSUER) {
    logger.warn('Hardware auth: invalid issuer', {
      expected: HARDWARE_JWT_ISSUER,
      received: decoded.iss,
    });
    res.status(401).json({
      error: 'AuthenticationError',
      message: `Invalid token issuer: expected "${HARDWARE_JWT_ISSUER}"`,
    });
    return;
  }

  // 4. Check finger_score >= 60
  if (
    typeof decoded.finger_score !== 'number' ||
    decoded.finger_score < MIN_FINGER_SCORE
  ) {
    logger.warn('Hardware auth: fingerprint score too low', {
      score: decoded.finger_score,
      minimum: MIN_FINGER_SCORE,
    });
    res.status(401).json({
      error: 'AuthenticationError',
      message: `Fingerprint score ${decoded.finger_score} is below minimum threshold ${MIN_FINGER_SCORE}`,
    });
    return;
  }

  // 5. Check device_id is present
  if (!decoded.device_id || decoded.device_id.trim().length === 0) {
    logger.warn('Hardware auth: missing device_id in bridge token');
    res.status(401).json({
      error: 'AuthenticationError',
      message: 'Bridge token missing device_id',
    });
    return;
  }

  // 6. Issue session JWT
  const sessionPayload: Omit<SessionJwtPayload, 'iat' | 'exp'> = {
    userId: decoded.device_id,
    role: 'official',
  };

  const sessionToken = jwt.sign(sessionPayload, env.JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: SESSION_JWT_EXPIRY,
  });

  logger.info('Hardware auth successful — session JWT issued', {
    deviceId: decoded.device_id,
    fingerScore: decoded.finger_score,
    role: 'official',
  });

  res.status(200).json({
    token: sessionToken,
    userId: decoded.device_id,
    role: 'official',
    expiresIn: SESSION_JWT_EXPIRY,
  });
}

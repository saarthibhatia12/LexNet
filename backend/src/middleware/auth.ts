// ============================================================================
// LexNet Backend — JWT Authentication Middleware
// ============================================================================
//
// Extracts the Bearer token from the Authorization header, verifies it
// using HS256, and attaches the decoded payload to `req.user`.
// Returns 401 on any failure.
// ============================================================================

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { SessionJwtPayload } from '../types/index.js';
import { JWT_ALGORITHM } from '../utils/constants.js';

/**
 * Express middleware that verifies a session JWT from the Authorization header.
 *
 * Expected header format: `Authorization: Bearer <token>`
 *
 * On success: attaches the decoded payload to `req.user` and calls next().
 * On failure: responds with 401 and a JSON error body.
 *
 * Checks performed:
 * 1. Authorization header is present
 * 2. Header follows "Bearer <token>" format
 * 3. Token is a valid HS256 JWT signed with JWT_SECRET
 * 4. Token has not expired
 * 5. Payload contains required fields (userId, role)
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  // 1. Check header exists
  if (!authHeader) {
    logger.debug('Auth rejected: missing Authorization header', {
      path: req.path,
      method: req.method,
    });
    res.status(401).json({
      error: 'Authentication required',
      message: 'Missing Authorization header',
    });
    return;
  }

  // 2. Check "Bearer <token>" format
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    logger.debug('Auth rejected: malformed Authorization header', {
      path: req.path,
    });
    res.status(401).json({
      error: 'Authentication required',
      message: 'Authorization header must follow "Bearer <token>" format',
    });
    return;
  }

  const token = parts[1]!;

  // 3. Verify the JWT
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
    }) as SessionJwtPayload;

    // 4. Validate payload structure
    if (!decoded.userId || !decoded.role) {
      logger.warn('Auth rejected: JWT payload missing required fields', {
        path: req.path,
        hasUserId: !!decoded.userId,
        hasRole: !!decoded.role,
      });
      res.status(401).json({
        error: 'Authentication required',
        message: 'Invalid token payload',
      });
      return;
    }

    // 5. Attach user to request
    (req as Request & { user: SessionJwtPayload }).user = decoded;

    logger.debug('Auth successful', {
      userId: decoded.userId,
      role: decoded.role,
      path: req.path,
    });

    next();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Token verification failed';

    // Differentiate between error types for logging
    if (error instanceof jwt.TokenExpiredError) {
      logger.debug('Auth rejected: token expired', { path: req.path });
      res.status(401).json({
        error: 'Authentication required',
        message: 'Token has expired',
      });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      logger.debug('Auth rejected: invalid token', {
        path: req.path,
        reason: message,
      });
      res.status(401).json({
        error: 'Authentication required',
        message: 'Invalid token',
      });
      return;
    }

    // Unexpected error
    logger.error('Auth middleware unexpected error', { error: message });
    res.status(401).json({
      error: 'Authentication required',
      message: 'Token verification failed',
    });
  }
}

/**
 * Optional auth middleware — does NOT reject unauthenticated requests.
 * If a valid JWT is present, attaches `req.user`; otherwise continues silently.
 * Useful for endpoints that behave differently for authenticated users.
 */
export function optionalAuthMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    next();
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    next();
    return;
  }

  const token = parts[1]!;

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
    }) as SessionJwtPayload;

    if (decoded.userId && decoded.role) {
      (req as Request & { user: SessionJwtPayload }).user = decoded;
    }
  } catch {
    // Silently ignore — user is simply unauthenticated
  }

  next();
}

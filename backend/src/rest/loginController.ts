// ============================================================================
// LexNet Backend — Login Controller
// ============================================================================
//
// POST /api/auth/login
//
// Authenticates demo users (hardcoded — acceptable for student project).
// On success, issues a session JWT (1-hour expiry).
//
// Demo users:
//   admin    / admin123   → role: admin
//   registrar / reg456    → role: registrar
//   clerk    / clerk789   → role: clerk
// ============================================================================

import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { SessionJwtPayload } from '../types/index.js';
import { JWT_ALGORITHM, SESSION_JWT_EXPIRY, DEMO_USERS } from '../utils/constants.js';

/**
 * Zod schema for the login request body.
 */
const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * POST /api/auth/login
 *
 * Authenticate a demo user and issue a session JWT.
 */
export async function loginHandler(
  req: Request,
  res: Response
): Promise<void> {
  // Validate request body
  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    const errors = parseResult.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));

    res.status(400).json({
      error: 'ValidationError',
      message: 'Invalid login credentials format',
      details: errors,
    });
    return;
  }

  const { username, password } = parseResult.data;

  // Find matching demo user
  const user = DEMO_USERS.find(
    (u) => u.username === username && u.password === password
  );

  if (!user) {
    logger.warn('Login failed: invalid credentials', { username });
    res.status(401).json({
      error: 'AuthenticationError',
      message: 'Invalid username or password',
    });
    return;
  }

  // Issue session JWT
  const sessionPayload: Omit<SessionJwtPayload, 'iat' | 'exp'> = {
    userId: user.username,
    role: user.role,
  };

  const token = jwt.sign(sessionPayload, env.JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: SESSION_JWT_EXPIRY,
  });

  logger.info('Login successful', {
    username: user.username,
    role: user.role,
  });

  res.status(200).json({
    token,
    userId: user.username,
    role: user.role,
    expiresIn: SESSION_JWT_EXPIRY,
  });
}

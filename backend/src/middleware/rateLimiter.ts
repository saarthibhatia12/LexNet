// ============================================================================
// LexNet Backend — Rate Limiter Middleware
// ============================================================================
//
// Two rate limiters as required by AGENTS.md:
//   - Global: 100 requests per 15 minutes
//   - Auth endpoints: 20 requests per 15 minutes
// ============================================================================

import rateLimit from 'express-rate-limit';
import { logger } from '../config/logger.js';
import {
  RATE_LIMIT_GLOBAL_MAX,
  RATE_LIMIT_AUTH_MAX,
  RATE_LIMIT_WINDOW_MS,
} from '../utils/constants.js';

/**
 * Global rate limiter — 100 requests per 15-minute window per IP.
 * Applied to all routes.
 */
export const globalRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_GLOBAL_MAX,
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false,  // Disable the `X-RateLimit-*` headers
  message: {
    error: 'Too many requests',
    message: `Rate limit exceeded. Maximum ${RATE_LIMIT_GLOBAL_MAX} requests per ${RATE_LIMIT_WINDOW_MS / 60000} minutes.`,
  },
  handler: (_req, res, _next, options) => {
    logger.warn('Global rate limit exceeded', {
      ip: _req.ip,
      path: _req.path,
    });
    res.status(options.statusCode).json(options.message);
  },
  keyGenerator: (req) => {
    // Use X-Forwarded-For if behind a proxy, otherwise req.ip
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? 'unknown';
  },
});

/**
 * Auth endpoint rate limiter — 20 requests per 15-minute window per IP.
 * Applied to authentication routes (/api/auth/*).
 */
export const authRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_AUTH_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts',
    message: `Rate limit exceeded. Maximum ${RATE_LIMIT_AUTH_MAX} authentication requests per ${RATE_LIMIT_WINDOW_MS / 60000} minutes.`,
  },
  handler: (_req, res, _next, options) => {
    logger.warn('Auth rate limit exceeded', {
      ip: _req.ip,
      path: _req.path,
    });
    res.status(options.statusCode).json(options.message);
  },
  keyGenerator: (req) => {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? 'unknown';
  },
});

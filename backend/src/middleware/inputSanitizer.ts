// ============================================================================
// LexNet Backend — Input Sanitizer Middleware
// ============================================================================
//
// Sanitizes all string inputs in req.body, req.query, and req.params
// using DOMPurify to prevent XSS attacks.
//
// AGENTS.md mandates: "DOMPurify on all string inputs in backend"
// ============================================================================

import type { Request, Response, NextFunction } from 'express';
import DOMPurify from 'isomorphic-dompurify';
import { logger } from '../config/logger.js';

/**
 * Recursively sanitize all string values in an object or array.
 * Non-string values are passed through unchanged.
 *
 * @param input - The value to sanitize (can be any type)
 * @returns The sanitized value
 */
function sanitizeValue(input: unknown): unknown {
  if (typeof input === 'string') {
    return DOMPurify.sanitize(input);
  }

  if (Array.isArray(input)) {
    return input.map(sanitizeValue);
  }

  if (input !== null && typeof input === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      sanitized[key] = sanitizeValue(value);
    }
    return sanitized;
  }

  // Numbers, booleans, null, undefined — pass through
  return input;
}

/**
 * Express middleware that sanitizes all string inputs in:
 * - req.body  (POST/PUT/PATCH payloads)
 * - req.query (URL query parameters)
 * - req.params (URL path parameters)
 *
 * This prevents stored XSS by stripping any HTML/script content
 * before it reaches the application logic.
 */
export function inputSanitizer(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  try {
    // Sanitize request body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeValue(req.body);
    }

    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      for (const key of Object.keys(req.query)) {
        const val = req.query[key];
        if (typeof val === 'string') {
          req.query[key] = DOMPurify.sanitize(val);
        }
      }
    }

    // Sanitize URL path parameters
    if (req.params && typeof req.params === 'object') {
      for (const key of Object.keys(req.params)) {
        const val = req.params[key];
        if (typeof val === 'string') {
          req.params[key] = DOMPurify.sanitize(val);
        }
      }
    }

    next();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Sanitization error';
    logger.error('Input sanitization failed', { error: message });
    next();
  }
}

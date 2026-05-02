// ============================================================================
// LexNet Backend — Error Handler Middleware
// ============================================================================
//
// Central error handler that maps typed error classes to HTTP status codes.
// - LexNetError subclasses carry their own statusCode
// - Zod validation errors → 400
// - Unknown errors → 500
// - Stack traces are suppressed in production
// ============================================================================

import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { LexNetError } from '../types/index.js';

/**
 * Express error-handling middleware (4-argument signature).
 *
 * Maps error types to appropriate HTTP status codes:
 *
 * | Error Class         | HTTP Status |
 * |---------------------|-------------|
 * | ValidationError     | 400         |
 * | DecryptionError     | 400         |
 * | AuthenticationError | 401         |
 * | AuthorizationError  | 403         |
 * | DocumentNotFoundError | 404      |
 * | FabricError         | 502         |
 * | IpfsError           | 502         |
 * | Neo4jError          | 502         |
 * | ZodError            | 400         |
 * | LexNetError (base)  | per instance|
 * | Unknown             | 500         |
 *
 * Stack traces are included in development but NEVER in production.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // --- LexNetError hierarchy (carries its own statusCode) ---
  if (err instanceof LexNetError) {
    logger.warn('Handled error', {
      name: err.name,
      statusCode: err.statusCode,
      message: err.message,
      path: req.path,
      method: req.method,
    });

    const body: Record<string, unknown> = {
      error: err.name,
      message: err.message,
    };

    if (env.NODE_ENV === 'development' && err.stack) {
      body['stack'] = err.stack;
    }

    res.status(err.statusCode).json(body);
    return;
  }

  // --- Zod validation errors ---
  if (err instanceof ZodError) {
    logger.warn('Validation error', {
      issues: err.issues.length,
      path: req.path,
    });

    res.status(400).json({
      error: 'ValidationError',
      message: 'Invalid request data',
      details: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  // --- SyntaxError (malformed JSON body) ---
  if (err instanceof SyntaxError && 'body' in err) {
    logger.warn('Malformed JSON in request body', {
      path: req.path,
    });

    res.status(400).json({
      error: 'SyntaxError',
      message: 'Malformed JSON in request body',
    });
    return;
  }

  // --- Unknown / unexpected errors ---
  logger.error('Unhandled error', {
    name: err.name,
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  const body: Record<string, unknown> = {
    error: 'InternalServerError',
    message: env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : err.message,
  };

  if (env.NODE_ENV === 'development' && err.stack) {
    body['stack'] = err.stack;
  }

  res.status(500).json(body);
}

/**
 * Middleware to catch async errors in route handlers.
 * Wraps an async handler so any rejected promise is forwarded to the error handler.
 *
 * Usage:
 *   router.get('/path', asyncHandler(async (req, res) => { ... }));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

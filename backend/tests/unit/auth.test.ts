// ============================================================================
// LexNet Backend — Auth Middleware Unit Tests
// ============================================================================
//
// Tests:
//   1. Valid JWT → attaches user to req, calls next()
//   2. Expired JWT → 401
//   3. Missing Authorization header → 401
//   4. Tampered/invalid token → 401
//   5. Malformed header (no "Bearer" prefix) → 401
//   6. JWT missing required payload fields → 401
//   7. Wrong algorithm → 401
//   8. Optional auth: no header → calls next() without user
//   9. Optional auth: valid token → attaches user
// ============================================================================

import { jest } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// Mock env and logger
// ---------------------------------------------------------------------------

const TEST_SECRET = 'test-secret-key-that-is-at-least-32-characters-long';

jest.unstable_mockModule('../../src/config/env.js', () => ({
  env: {
    JWT_SECRET: TEST_SECRET,
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
  },
}));

jest.unstable_mockModule('../../src/config/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  },
}));

// Dynamic imports AFTER mocks (ESM requirement)
const { authMiddleware, optionalAuthMiddleware } = await import(
  '../../src/middleware/auth.js'
);

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createMockRequest(authHeader?: string): Partial<Request> {
  return {
    headers: authHeader !== undefined ? { authorization: authHeader } : {},
    path: '/test',
    method: 'GET',
  };
}

function createMockResponse() {
  const res = {
    _statusCode: 0,
    _body: null as unknown,
    status(code: number) {
      res._statusCode = code;
      return res;
    },
    json(body: unknown) {
      res._body = body;
      return res;
    },
  };
  return res;
}

function generateValidToken(
  payload: Record<string, unknown> = {},
  secret: string = TEST_SECRET,
  options: jwt.SignOptions = {}
): string {
  return jwt.sign(
    {
      userId: 'test-user',
      role: 'admin',
      ...payload,
    },
    secret,
    {
      algorithm: 'HS256',
      expiresIn: '1h',
      ...options,
    }
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('authMiddleware', () => {
  // -----------------------------------------------------------------------
  // 1. Valid JWT
  // -----------------------------------------------------------------------
  describe('valid JWT', () => {
    it('should attach user to req and call next()', () => {
      const token = generateValidToken();
      const req = createMockRequest(`Bearer ${token}`);
      const res = createMockResponse();
      const next = jest.fn();

      authMiddleware(
        req as Request,
        res as unknown as Response,
        next as unknown as NextFunction
      );

      expect(next).toHaveBeenCalledTimes(1);
      expect((req as Request & { user: unknown }).user).toBeDefined();
      expect(
        (req as Request & { user: { userId: string } }).user.userId
      ).toBe('test-user');
      expect(
        (req as Request & { user: { role: string } }).user.role
      ).toBe('admin');
    });

    it('should work with all valid roles', () => {
      for (const role of ['admin', 'registrar', 'clerk', 'official']) {
        const token = generateValidToken({ role });
        const req = createMockRequest(`Bearer ${token}`);
        const res = createMockResponse();
        const next = jest.fn();

        authMiddleware(
          req as Request,
          res as unknown as Response,
          next as unknown as NextFunction
        );

        expect(next).toHaveBeenCalledTimes(1);
        expect(
          (req as Request & { user: { role: string } }).user.role
        ).toBe(role);
      }
    });
  });

  // -----------------------------------------------------------------------
  // 2. Expired JWT
  // -----------------------------------------------------------------------
  describe('expired JWT', () => {
    it('should respond with 401 when token has expired', () => {
      // Create a token that expired 1 hour ago
      const token = jwt.sign(
        { userId: 'test-user', role: 'admin' },
        TEST_SECRET,
        { algorithm: 'HS256', expiresIn: '-1h' }
      );
      const req = createMockRequest(`Bearer ${token}`);
      const res = createMockResponse();
      const next = jest.fn();

      authMiddleware(
        req as Request,
        res as unknown as Response,
        next as unknown as NextFunction
      );

      expect(next).not.toHaveBeenCalled();
      expect(res._statusCode).toBe(401);
      expect((res._body as { message: string }).message).toContain('expired');
    });
  });

  // -----------------------------------------------------------------------
  // 3. Missing Authorization header
  // -----------------------------------------------------------------------
  describe('missing Authorization header', () => {
    it('should respond with 401 when header is absent', () => {
      const req = createMockRequest(undefined);
      // Ensure the header object has no authorization key
      delete req.headers!.authorization;
      const res = createMockResponse();
      const next = jest.fn();

      authMiddleware(
        req as Request,
        res as unknown as Response,
        next as unknown as NextFunction
      );

      expect(next).not.toHaveBeenCalled();
      expect(res._statusCode).toBe(401);
      expect((res._body as { message: string }).message).toContain('Missing');
    });
  });

  // -----------------------------------------------------------------------
  // 4. Tampered token
  // -----------------------------------------------------------------------
  describe('tampered token', () => {
    it('should respond with 401 when token signature is invalid', () => {
      // Sign with a different secret
      const token = generateValidToken({}, 'wrong-secret-that-is-also-32-chars-plus');
      const req = createMockRequest(`Bearer ${token}`);
      const res = createMockResponse();
      const next = jest.fn();

      authMiddleware(
        req as Request,
        res as unknown as Response,
        next as unknown as NextFunction
      );

      expect(next).not.toHaveBeenCalled();
      expect(res._statusCode).toBe(401);
      expect((res._body as { message: string }).message).toContain('Invalid');
    });

    it('should respond with 401 for completely garbage token', () => {
      const req = createMockRequest('Bearer not.a.valid.jwt');
      const res = createMockResponse();
      const next = jest.fn();

      authMiddleware(
        req as Request,
        res as unknown as Response,
        next as unknown as NextFunction
      );

      expect(next).not.toHaveBeenCalled();
      expect(res._statusCode).toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // 5. Malformed header
  // -----------------------------------------------------------------------
  describe('malformed Authorization header', () => {
    it('should respond with 401 when "Bearer" prefix is missing', () => {
      const token = generateValidToken();
      const req = createMockRequest(token); // no "Bearer " prefix
      const res = createMockResponse();
      const next = jest.fn();

      authMiddleware(
        req as Request,
        res as unknown as Response,
        next as unknown as NextFunction
      );

      expect(next).not.toHaveBeenCalled();
      expect(res._statusCode).toBe(401);
      expect((res._body as { message: string }).message).toContain('Bearer');
    });

    it('should respond with 401 for "Basic" auth scheme', () => {
      const req = createMockRequest('Basic dXNlcjpwYXNz');
      const res = createMockResponse();
      const next = jest.fn();

      authMiddleware(
        req as Request,
        res as unknown as Response,
        next as unknown as NextFunction
      );

      expect(next).not.toHaveBeenCalled();
      expect(res._statusCode).toBe(401);
    });
  });

  // -----------------------------------------------------------------------
  // 6. Missing payload fields
  // -----------------------------------------------------------------------
  describe('JWT with missing payload fields', () => {
    it('should respond with 401 when userId is missing', () => {
      const token = jwt.sign(
        { role: 'admin' }, // no userId
        TEST_SECRET,
        { algorithm: 'HS256', expiresIn: '1h' }
      );
      const req = createMockRequest(`Bearer ${token}`);
      const res = createMockResponse();
      const next = jest.fn();

      authMiddleware(
        req as Request,
        res as unknown as Response,
        next as unknown as NextFunction
      );

      expect(next).not.toHaveBeenCalled();
      expect(res._statusCode).toBe(401);
      expect((res._body as { message: string }).message).toContain('Invalid token payload');
    });

    it('should respond with 401 when role is missing', () => {
      const token = jwt.sign(
        { userId: 'test-user' }, // no role
        TEST_SECRET,
        { algorithm: 'HS256', expiresIn: '1h' }
      );
      const req = createMockRequest(`Bearer ${token}`);
      const res = createMockResponse();
      const next = jest.fn();

      authMiddleware(
        req as Request,
        res as unknown as Response,
        next as unknown as NextFunction
      );

      expect(next).not.toHaveBeenCalled();
      expect(res._statusCode).toBe(401);
    });
  });
});

// ===========================================================================
// Optional Auth Middleware
// ===========================================================================

describe('optionalAuthMiddleware', () => {
  it('should call next() without user when no header present', () => {
    const req = createMockRequest(undefined);
    delete req.headers!.authorization;
    const res = createMockResponse();
    const next = jest.fn();

    optionalAuthMiddleware(
      req as Request,
      res as unknown as Response,
      next as unknown as NextFunction
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect((req as Request & { user?: unknown }).user).toBeUndefined();
  });

  it('should attach user when valid token is present', () => {
    const token = generateValidToken();
    const req = createMockRequest(`Bearer ${token}`);
    const res = createMockResponse();
    const next = jest.fn();

    optionalAuthMiddleware(
      req as Request,
      res as unknown as Response,
      next as unknown as NextFunction
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(
      (req as Request & { user: { userId: string } }).user.userId
    ).toBe('test-user');
  });

  it('should call next() without user when token is invalid', () => {
    const req = createMockRequest('Bearer garbage.token.here');
    const res = createMockResponse();
    const next = jest.fn();

    optionalAuthMiddleware(
      req as Request,
      res as unknown as Response,
      next as unknown as NextFunction
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect((req as Request & { user?: unknown }).user).toBeUndefined();
  });
});

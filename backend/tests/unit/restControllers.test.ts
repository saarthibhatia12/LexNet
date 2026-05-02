// ============================================================================
// LexNet Backend — REST Controllers Unit Tests
// ============================================================================
//
// Tests for Phase BE5 controllers:
//   - hardwareAuthController: bridge JWT verification + session JWT issuance
//   - verifyController: full verification pipeline (4 status cases)
//   - loginController: demo user authentication
//   - routes: health endpoint
// ============================================================================

import { jest } from '@jest/globals';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const TEST_SECRET = 'test-secret-key-that-is-at-least-32-characters-long';
const TEST_AES_KEY = 'a'.repeat(64); // 64 hex chars = 256-bit key
const TEST_DOC_HASH = 'a'.repeat(64); // 64 lowercase hex chars

// ---------------------------------------------------------------------------
// Mock env and logger
// ---------------------------------------------------------------------------

jest.unstable_mockModule('../../src/config/env.js', () => ({
  env: {
    JWT_SECRET: TEST_SECRET,
    AES_KEY: TEST_AES_KEY,
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    VERIFICATION_BASE_URL: 'http://localhost:3000',
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

// ---------------------------------------------------------------------------
// Mock services for verifyController
// ---------------------------------------------------------------------------

const mockVerifyDocument = jest.fn<() => Promise<unknown>>();
const mockRetrieveFromIPFS = jest.fn<() => Promise<Buffer>>();
const mockDecrypt = jest.fn<() => Buffer>();
const mockComputeSHA256 = jest.fn<() => string>();

jest.unstable_mockModule('../../src/services/fabricService.js', () => ({
  verifyDocument: mockVerifyDocument,
  getDocument: jest.fn(),
  storeDocument: jest.fn(),
  getDocumentHistory: jest.fn(),
  transferDocument: jest.fn(),
  addDispute: jest.fn(),
  resolveDispute: jest.fn(),
  getDocumentsByOwner: jest.fn(),
}));

jest.unstable_mockModule('../../src/services/ipfsService.js', () => ({
  uploadToIPFS: jest.fn(),
  retrieveFromIPFS: mockRetrieveFromIPFS,
}));

jest.unstable_mockModule('../../src/services/encryptionService.js', () => ({
  encrypt: jest.fn(),
  decrypt: mockDecrypt,
}));

jest.unstable_mockModule('../../src/services/hashService.js', () => ({
  computeSHA256: mockComputeSHA256,
  computeSHA256FromStream: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Dynamic imports AFTER mocks (ESM requirement)
// ---------------------------------------------------------------------------

const { hardwareAuthHandler } = await import(
  '../../src/rest/hardwareAuthController.js'
);
const { verifyHandler } = await import(
  '../../src/rest/verifyController.js'
);
const { loginHandler } = await import(
  '../../src/rest/loginController.js'
);

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createMockRequest(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    headers: {},
    params: {},
    body: {},
    path: '/test',
    method: 'GET',
    ...overrides,
  };
}

function createMockResponse() {
  const res = {
    _statusCode: 0,
    _body: null as unknown,
    _headers: {} as Record<string, string>,
    status(code: number) {
      res._statusCode = code;
      return res;
    },
    json(body: unknown) {
      res._body = body;
      return res;
    },
    setHeader(name: string, value: string) {
      res._headers[name] = value;
      return res;
    },
    send(data: unknown) {
      res._body = data;
      return res;
    },
  };
  return res;
}

function generateBridgeToken(
  overrides: Record<string, unknown> = {},
  secret: string = TEST_SECRET
): string {
  return jwt.sign(
    {
      device_id: 'A1B2C3D4',
      finger_score: 85,
      iss: 'lexnet-bridge',
      ...overrides,
    },
    secret,
    { algorithm: 'HS256', expiresIn: '5m' }
  );
}

// ===========================================================================
// Hardware Auth Controller Tests
// ===========================================================================

describe('hardwareAuthHandler', () => {
  // -----------------------------------------------------------------------
  // Success case
  // -----------------------------------------------------------------------
  it('should issue session JWT for valid bridge token', async () => {
    const token = generateBridgeToken();
    const req = createMockRequest({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = createMockResponse();

    await hardwareAuthHandler(req as Request, res as unknown as Response);

    expect(res._statusCode).toBe(200);
    const body = res._body as { token: string; userId: string; role: string };
    expect(body.token).toBeDefined();
    expect(body.userId).toBe('A1B2C3D4');
    expect(body.role).toBe('official');

    // Verify the issued session JWT is valid
    const decoded = jwt.verify(body.token, TEST_SECRET) as {
      userId: string;
      role: string;
    };
    expect(decoded.userId).toBe('A1B2C3D4');
    expect(decoded.role).toBe('official');
  });

  // -----------------------------------------------------------------------
  // Missing Authorization header
  // -----------------------------------------------------------------------
  it('should return 401 when Authorization header is missing', async () => {
    const req = createMockRequest();
    const res = createMockResponse();

    await hardwareAuthHandler(req as Request, res as unknown as Response);

    expect(res._statusCode).toBe(401);
    expect((res._body as { message: string }).message).toContain('Missing');
  });

  // -----------------------------------------------------------------------
  // Malformed Authorization header
  // -----------------------------------------------------------------------
  it('should return 401 for malformed Authorization header', async () => {
    const req = createMockRequest({
      headers: { authorization: 'Basic abc123' },
    });
    const res = createMockResponse();

    await hardwareAuthHandler(req as Request, res as unknown as Response);

    expect(res._statusCode).toBe(401);
    expect((res._body as { message: string }).message).toContain('Bearer');
  });

  // -----------------------------------------------------------------------
  // Invalid/expired token
  // -----------------------------------------------------------------------
  it('should return 401 for expired bridge token', async () => {
    const token = jwt.sign(
      { device_id: 'A1B2C3D4', finger_score: 85, iss: 'lexnet-bridge' },
      TEST_SECRET,
      { algorithm: 'HS256', expiresIn: '-1h' }
    );
    const req = createMockRequest({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = createMockResponse();

    await hardwareAuthHandler(req as Request, res as unknown as Response);

    expect(res._statusCode).toBe(401);
    expect((res._body as { message: string }).message).toContain('expired');
  });

  it('should return 401 for token signed with wrong secret', async () => {
    const token = generateBridgeToken({}, 'wrong-secret-with-enough-length-chars');
    const req = createMockRequest({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = createMockResponse();

    await hardwareAuthHandler(req as Request, res as unknown as Response);

    expect(res._statusCode).toBe(401);
    expect((res._body as { message: string }).message).toContain('Invalid');
  });

  // -----------------------------------------------------------------------
  // Wrong issuer
  // -----------------------------------------------------------------------
  it('should return 401 when iss is not "lexnet-bridge"', async () => {
    const token = generateBridgeToken({ iss: 'some-other-service' });
    const req = createMockRequest({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = createMockResponse();

    await hardwareAuthHandler(req as Request, res as unknown as Response);

    expect(res._statusCode).toBe(401);
    expect((res._body as { message: string }).message).toContain('issuer');
  });

  // -----------------------------------------------------------------------
  // Finger score too low
  // -----------------------------------------------------------------------
  it('should return 401 when finger_score < 60', async () => {
    const token = generateBridgeToken({ finger_score: 45 });
    const req = createMockRequest({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = createMockResponse();

    await hardwareAuthHandler(req as Request, res as unknown as Response);

    expect(res._statusCode).toBe(401);
    expect((res._body as { message: string }).message).toContain('score');
  });

  it('should accept finger_score exactly 60', async () => {
    const token = generateBridgeToken({ finger_score: 60 });
    const req = createMockRequest({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = createMockResponse();

    await hardwareAuthHandler(req as Request, res as unknown as Response);

    expect(res._statusCode).toBe(200);
  });

  // -----------------------------------------------------------------------
  // Missing device_id
  // -----------------------------------------------------------------------
  it('should return 401 when device_id is empty', async () => {
    const token = generateBridgeToken({ device_id: '' });
    const req = createMockRequest({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = createMockResponse();

    await hardwareAuthHandler(req as Request, res as unknown as Response);

    expect(res._statusCode).toBe(401);
    expect((res._body as { message: string }).message).toContain('device_id');
  });
});

// ===========================================================================
// Login Controller Tests
// ===========================================================================

describe('loginHandler', () => {
  it('should issue session JWT for valid admin credentials', async () => {
    const req = createMockRequest({
      body: { username: 'admin', password: 'admin123' },
    });
    const res = createMockResponse();

    await loginHandler(req as Request, res as unknown as Response);

    expect(res._statusCode).toBe(200);
    const body = res._body as { token: string; userId: string; role: string };
    expect(body.token).toBeDefined();
    expect(body.userId).toBe('admin');
    expect(body.role).toBe('admin');
  });

  it('should issue session JWT for registrar', async () => {
    const req = createMockRequest({
      body: { username: 'registrar', password: 'reg456' },
    });
    const res = createMockResponse();

    await loginHandler(req as Request, res as unknown as Response);

    expect(res._statusCode).toBe(200);
    expect((res._body as { role: string }).role).toBe('registrar');
  });

  it('should issue session JWT for clerk', async () => {
    const req = createMockRequest({
      body: { username: 'clerk', password: 'clerk789' },
    });
    const res = createMockResponse();

    await loginHandler(req as Request, res as unknown as Response);

    expect(res._statusCode).toBe(200);
    expect((res._body as { role: string }).role).toBe('clerk');
  });

  it('should return 401 for wrong password', async () => {
    const req = createMockRequest({
      body: { username: 'admin', password: 'wrongpassword' },
    });
    const res = createMockResponse();

    await loginHandler(req as Request, res as unknown as Response);

    expect(res._statusCode).toBe(401);
    expect((res._body as { message: string }).message).toContain('Invalid');
  });

  it('should return 401 for unknown username', async () => {
    const req = createMockRequest({
      body: { username: 'hacker', password: 'admin123' },
    });
    const res = createMockResponse();

    await loginHandler(req as Request, res as unknown as Response);

    expect(res._statusCode).toBe(401);
  });

  it('should return 400 for missing username', async () => {
    const req = createMockRequest({
      body: { password: 'admin123' },
    });
    const res = createMockResponse();

    await loginHandler(req as Request, res as unknown as Response);

    expect(res._statusCode).toBe(400);
    expect((res._body as { error: string }).error).toBe('ValidationError');
  });

  it('should return 400 for empty body', async () => {
    const req = createMockRequest({ body: {} });
    const res = createMockResponse();

    await loginHandler(req as Request, res as unknown as Response);

    expect(res._statusCode).toBe(400);
  });
});

// ===========================================================================
// Verify Controller Tests
// ===========================================================================

describe('verifyHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------
  it('should return 400 for empty hash', async () => {
    const req = createMockRequest({ params: { hash: '' } });
    const res = createMockResponse();

    await verifyHandler(req as Request, res as unknown as Response);

    expect(res._statusCode).toBe(400);
    expect((res._body as { error: string }).error).toBe('ValidationError');
  });

  it('should return 400 for non-hex hash', async () => {
    const req = createMockRequest({ params: { hash: 'xyz123' } });
    const res = createMockResponse();

    await verifyHandler(req as Request, res as unknown as Response);

    expect(res._statusCode).toBe(400);
    expect((res._body as { message: string }).message).toContain('SHA-256');
  });

  it('should return 400 for uppercase hex hash', async () => {
    const req = createMockRequest({ params: { hash: 'A'.repeat(64) } });
    const res = createMockResponse();

    await verifyHandler(req as Request, res as unknown as Response);

    expect(res._statusCode).toBe(400);
  });

  // -----------------------------------------------------------------------
  // NOT_REGISTERED — verifyDocument returns null
  // -----------------------------------------------------------------------
  it('should return NOT_REGISTERED when document not found (null)', async () => {
    mockVerifyDocument.mockResolvedValue(null);

    const req = createMockRequest({ params: { hash: TEST_DOC_HASH } });
    const res = createMockResponse();

    await verifyHandler(req as Request, res as unknown as Response);

    expect(res._statusCode).toBe(200);
    const body = res._body as { status: string; docHash: string };
    expect(body.status).toBe('NOT_REGISTERED');
    expect(body.docHash).toBe(TEST_DOC_HASH);
  });

  // -----------------------------------------------------------------------
  // NOT_REGISTERED — verifyDocument throws DocumentNotFoundError
  // -----------------------------------------------------------------------
  it('should return NOT_REGISTERED when DocumentNotFoundError is thrown', async () => {
    const { DocumentNotFoundError } = await import('../../src/types/index.js');
    mockVerifyDocument.mockRejectedValue(new DocumentNotFoundError(TEST_DOC_HASH));

    const req = createMockRequest({ params: { hash: TEST_DOC_HASH } });
    const res = createMockResponse();

    await verifyHandler(req as Request, res as unknown as Response);

    expect(res._statusCode).toBe(200);
    expect((res._body as { status: string }).status).toBe('NOT_REGISTERED');
  });

  // -----------------------------------------------------------------------
  // AUTHENTIC — hashes match
  // -----------------------------------------------------------------------
  it('should return AUTHENTIC when recomputed hash matches', async () => {
    const mockDocument = {
      docHash: TEST_DOC_HASH,
      ipfsCID: 'QmTestCID123',
      ownerId: 'owner1',
      deviceId: 'dev1',
      timestamp: '2024-01-01T00:00:00Z',
      docType: 'sale_deed',
      metadata: {},
      activeDispute: false,
      disputeCaseId: '',
      riskScore: 0,
      createdAt: '2024-01-01T00:00:00Z',
    };

    const encryptedPayload = JSON.stringify({
      ciphertext: Buffer.from('encrypted-data').toString('base64'),
      iv: Buffer.from('123456789012').toString('base64'),
      authTag: Buffer.from('1234567890123456').toString('base64'),
    });

    mockVerifyDocument.mockResolvedValue(mockDocument);
    mockRetrieveFromIPFS.mockResolvedValue(Buffer.from(encryptedPayload));
    mockDecrypt.mockReturnValue(Buffer.from('original-document-content'));
    mockComputeSHA256.mockReturnValue(TEST_DOC_HASH); // matches the request hash

    const req = createMockRequest({ params: { hash: TEST_DOC_HASH } });
    const res = createMockResponse();

    await verifyHandler(req as Request, res as unknown as Response);

    expect(res._statusCode).toBe(200);
    const body = res._body as { status: string; document: unknown };
    expect(body.status).toBe('AUTHENTIC');
    expect(body.document).toEqual(mockDocument);
  });

  // -----------------------------------------------------------------------
  // TAMPERED — hashes don't match
  // -----------------------------------------------------------------------
  it('should return TAMPERED when recomputed hash does not match', async () => {
    const mockDocument = {
      docHash: TEST_DOC_HASH,
      ipfsCID: 'QmTestCID123',
      ownerId: 'owner1',
      deviceId: 'dev1',
      timestamp: '2024-01-01T00:00:00Z',
      docType: 'sale_deed',
      metadata: {},
      activeDispute: false,
      disputeCaseId: '',
      riskScore: 0,
      createdAt: '2024-01-01T00:00:00Z',
    };

    const encryptedPayload = JSON.stringify({
      ciphertext: Buffer.from('encrypted-data').toString('base64'),
      iv: Buffer.from('123456789012').toString('base64'),
      authTag: Buffer.from('1234567890123456').toString('base64'),
    });

    mockVerifyDocument.mockResolvedValue(mockDocument);
    mockRetrieveFromIPFS.mockResolvedValue(Buffer.from(encryptedPayload));
    mockDecrypt.mockReturnValue(Buffer.from('tampered-document-content'));
    mockComputeSHA256.mockReturnValue('b'.repeat(64)); // different hash

    const req = createMockRequest({ params: { hash: TEST_DOC_HASH } });
    const res = createMockResponse();

    await verifyHandler(req as Request, res as unknown as Response);

    expect(res._statusCode).toBe(200);
    expect((res._body as { status: string }).status).toBe('TAMPERED');
  });

  // -----------------------------------------------------------------------
  // ERROR — service failure
  // -----------------------------------------------------------------------
  it('should return ERROR when IPFS retrieval fails', async () => {
    const mockDocument = {
      docHash: TEST_DOC_HASH,
      ipfsCID: 'QmTestCID123',
      ownerId: 'owner1',
      deviceId: 'dev1',
      timestamp: '2024-01-01T00:00:00Z',
      docType: 'sale_deed',
      metadata: {},
      activeDispute: false,
      disputeCaseId: '',
      riskScore: 0,
      createdAt: '2024-01-01T00:00:00Z',
    };

    mockVerifyDocument.mockResolvedValue(mockDocument);
    mockRetrieveFromIPFS.mockRejectedValue(new Error('IPFS connection refused'));

    const req = createMockRequest({ params: { hash: TEST_DOC_HASH } });
    const res = createMockResponse();

    await verifyHandler(req as Request, res as unknown as Response);

    expect(res._statusCode).toBe(200);
    const body = res._body as { status: string; message: string };
    expect(body.status).toBe('ERROR');
    expect(body.message).toContain('IPFS');
  });

  it('should return ERROR when IPFS payload is invalid JSON', async () => {
    const mockDocument = {
      docHash: TEST_DOC_HASH,
      ipfsCID: 'QmTestCID123',
      ownerId: 'owner1',
      deviceId: 'dev1',
      timestamp: '2024-01-01T00:00:00Z',
      docType: 'sale_deed',
      metadata: {},
      activeDispute: false,
      disputeCaseId: '',
      riskScore: 0,
      createdAt: '2024-01-01T00:00:00Z',
    };

    mockVerifyDocument.mockResolvedValue(mockDocument);
    mockRetrieveFromIPFS.mockResolvedValue(Buffer.from('this is not json'));

    const req = createMockRequest({ params: { hash: TEST_DOC_HASH } });
    const res = createMockResponse();

    await verifyHandler(req as Request, res as unknown as Response);

    expect(res._statusCode).toBe(200);
    expect((res._body as { status: string }).status).toBe('ERROR');
  });

  it('should return ERROR when decryption fails', async () => {
    const mockDocument = {
      docHash: TEST_DOC_HASH,
      ipfsCID: 'QmTestCID123',
      ownerId: 'owner1',
      deviceId: 'dev1',
      timestamp: '2024-01-01T00:00:00Z',
      docType: 'sale_deed',
      metadata: {},
      activeDispute: false,
      disputeCaseId: '',
      riskScore: 0,
      createdAt: '2024-01-01T00:00:00Z',
    };

    const encryptedPayload = JSON.stringify({
      ciphertext: Buffer.from('encrypted-data').toString('base64'),
      iv: Buffer.from('123456789012').toString('base64'),
      authTag: Buffer.from('1234567890123456').toString('base64'),
    });

    mockVerifyDocument.mockResolvedValue(mockDocument);
    mockRetrieveFromIPFS.mockResolvedValue(Buffer.from(encryptedPayload));
    mockDecrypt.mockImplementation(() => {
      throw new Error('Decryption failed: wrong key');
    });

    const req = createMockRequest({ params: { hash: TEST_DOC_HASH } });
    const res = createMockResponse();

    await verifyHandler(req as Request, res as unknown as Response);

    expect(res._statusCode).toBe(200);
    const body = res._body as { status: string; message: string };
    expect(body.status).toBe('ERROR');
    expect(body.message).toContain('Decryption');
  });
});

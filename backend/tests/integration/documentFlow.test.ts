// ============================================================================
// LexNet Backend — Document Flow Integration Test
// ============================================================================
//
// Tests the full register → verify cycle with services mocked in-memory:
//
//   1. Login as demo user → get session JWT
//   2. Register document via GraphQL mutation (hash → encrypt → IPFS → Fabric → QR)
//   3. Verify document via GraphQL query → AUTHENTIC
//   4. Verify a non-existent document → NOT_REGISTERED
//   5. Transfer document → verify new owner
//   6. Add dispute → verify dispute flag
//   7. Resolve dispute → verify clear
// ============================================================================

import { jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TEST_AES_KEY = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

// ---------------------------------------------------------------------------
// In-memory stores for mocks
// ---------------------------------------------------------------------------

const fabricStore = new Map<string, Record<string, unknown>>();
const ipfsStore = new Map<string, Buffer>();

// ---------------------------------------------------------------------------
// Mock env and logger BEFORE importing anything else
// ---------------------------------------------------------------------------

jest.unstable_mockModule('../../src/config/env.js', () => ({
  env: {
    PORT: 4099,
    NODE_ENV: 'test',
    JWT_SECRET: TEST_SECRET,
    JWT_EXPIRY: '1h',
    AES_KEY: TEST_AES_KEY,
    NLP_SERVICE_URL: 'http://localhost:5500',
    VERIFICATION_BASE_URL: 'http://localhost:3000',
    NEO4J_URI: 'bolt://localhost:7687',
    NEO4J_USER: 'neo4j',
    NEO4J_PASSWORD: 'test',
    LOG_LEVEL: 'error',
    FABRIC_CONNECTION_PROFILE: './fabric/connection.json',
    FABRIC_WALLET_PATH: './fabric/wallet',
    FABRIC_CHANNEL: 'lexnet-channel',
    FABRIC_CHAINCODE: 'lexnet-cc',
    FABRIC_MSP_ID: 'Org1MSP',
    IPFS_API_URL: 'http://localhost:5001',
    MAX_FILE_SIZE_MB: 50,
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
// Mock isomorphic-dompurify + inputSanitizer (CJS/ESM compat issue in Jest)
// ---------------------------------------------------------------------------

jest.unstable_mockModule('isomorphic-dompurify', () => ({
  default: { sanitize: (input: string) => input },
  sanitize: (input: string) => input,
}));

jest.unstable_mockModule('../../src/middleware/inputSanitizer.js', () => ({
  inputSanitizer: (
    _req: unknown, _res: unknown, next: () => void
  ) => next(),
}));

// ---------------------------------------------------------------------------
// Mock Fabric service — in-memory document store
// ---------------------------------------------------------------------------

jest.unstable_mockModule('../../src/services/fabricService.js', () => ({
  storeDocument: jest.fn(
    async (
      docHash: string,
      ipfsCID: string,
      ownerId: string,
      deviceId: string,
      timestamp: string,
      docType: string,
      metadata: Record<string, unknown>
    ) => {
      fabricStore.set(docHash, {
        docHash,
        ipfsCID,
        ownerId,
        deviceId,
        timestamp,
        docType,
        metadata,
        activeDispute: false,
        disputeCaseId: '',
        riskScore: 0,
        createdAt: timestamp,
      });
    }
  ),
  getDocument: jest.fn(async (docHash: string) => {
    const doc = fabricStore.get(docHash);
    if (!doc) {
      const { DocumentNotFoundError } = await import('../../src/types/index.js');
      throw new DocumentNotFoundError(docHash);
    }
    return doc;
  }),
  getDocumentHistory: jest.fn(async (docHash: string) => {
    const doc = fabricStore.get(docHash);
    return doc ? [doc] : [];
  }),
  verifyDocument: jest.fn(async (docHash: string) => {
    return fabricStore.get(docHash) ?? null;
  }),
  getDocumentsByOwner: jest.fn(async (ownerId: string) => {
    return Array.from(fabricStore.values()).filter(
      (d) => (d as { ownerId: string }).ownerId === ownerId
    );
  }),
  transferDocument: jest.fn(async (docHash: string, newOwnerId: string) => {
    const doc = fabricStore.get(docHash);
    if (doc) {
      (doc as { ownerId: string }).ownerId = newOwnerId;
    }
  }),
  addDispute: jest.fn(async (docHash: string, caseId: string, _filedBy: string) => {
    const doc = fabricStore.get(docHash);
    if (doc) {
      (doc as { activeDispute: boolean; disputeCaseId: string }).activeDispute = true;
      (doc as { activeDispute: boolean; disputeCaseId: string }).disputeCaseId = caseId;
    }
  }),
  resolveDispute: jest.fn(async (docHash: string, _caseId: string) => {
    const doc = fabricStore.get(docHash);
    if (doc) {
      (doc as { activeDispute: boolean; disputeCaseId: string }).activeDispute = false;
      (doc as { activeDispute: boolean; disputeCaseId: string }).disputeCaseId = '';
    }
  }),
}));

// ---------------------------------------------------------------------------
// Mock IPFS service — in-memory buffer store
// ---------------------------------------------------------------------------

jest.unstable_mockModule('../../src/services/ipfsService.js', () => ({
  uploadToIPFS: jest.fn(async (buffer: Buffer) => {
    const cid = `Qm${Buffer.from(buffer).toString('hex').substring(0, 24)}`;
    ipfsStore.set(cid, buffer);
    return { cid, size: buffer.length };
  }),
  retrieveFromIPFS: jest.fn(async (cid: string) => {
    const data = ipfsStore.get(cid);
    if (!data) throw new Error(`IPFS CID not found: ${cid}`);
    return data;
  }),
}));

// ---------------------------------------------------------------------------
// Mock Neo4j service (read-only for this test)
// ---------------------------------------------------------------------------

jest.unstable_mockModule('../../src/services/neo4jService.js', () => ({
  getKnowledgeGraph: jest.fn(async () => ({ nodes: [], edges: [] })),
  searchNodes: jest.fn(async () => []),
  getPropertyTimeline: jest.fn(async (propertyId: string) => ({
    propertyId,
    events: [],
  })),
  runCypher: jest.fn(async () => []),
  close: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Mock NLP trigger (fire-and-forget — no-op in tests)
// ---------------------------------------------------------------------------

jest.unstable_mockModule('../../src/services/nlpTriggerService.js', () => ({
  triggerNlpProcessing: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Mock Fabric config (no real Fabric connection in tests)
// ---------------------------------------------------------------------------

jest.unstable_mockModule('../../src/config/fabric.js', () => ({
  connectToFabric: jest.fn(),
  getContract: jest.fn(),
  disconnectFabric: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Dynamic imports AFTER all mocks
// ---------------------------------------------------------------------------

const { createApp } = await import('../../src/index.js');

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

import type http from 'node:http';
import type { ApolloServer } from '@apollo/server';
import type { GraphQLContext } from '../../src/graphql/directives/authDirective.js';

let httpServer: http.Server;
let apolloServer: ApolloServer<GraphQLContext>;
let baseUrl: string;

beforeAll(async () => {
  const result = await createApp();
  httpServer = result.httpServer;
  apolloServer = result.apolloServer;

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => resolve());
  });

  const addr = httpServer.address();
  const port = typeof addr === 'object' && addr ? addr.port : 4099;
  baseUrl = `http://localhost:${port}`;
});

afterAll(async () => {
  await apolloServer.stop();
  httpServer.close();
});

beforeEach(() => {
  fabricStore.clear();
  ipfsStore.clear();
});

// ---------------------------------------------------------------------------
// Helper: make a GraphQL request
// ---------------------------------------------------------------------------

async function gqlRequest(
  query: string,
  variables: Record<string, unknown> = {},
  token?: string
): Promise<{ data?: Record<string, unknown>; errors?: Array<{ message: string; extensions?: { code: string } }> }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}/graphql`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  return response.json() as Promise<{
    data?: Record<string, unknown>;
    errors?: Array<{ message: string; extensions?: { code: string } }>;
  }>;
}

// ===========================================================================
// Test Cases
// ===========================================================================

describe('Document Flow Integration', () => {
  // -----------------------------------------------------------------------
  // 1. Login → get session JWT
  // -----------------------------------------------------------------------
  it('should login as admin and receive a session JWT', async () => {
    const result = await gqlRequest(`
      mutation Login($username: String!, $password: String!) {
        login(username: $username, password: $password) {
          token
          userId
          role
          expiresIn
        }
      }
    `, { username: 'admin', password: 'admin123' });

    expect(result.errors).toBeUndefined();
    expect(result.data?.login).toBeDefined();
    const login = result.data!.login as { token: string; userId: string; role: string };
    expect(login.token).toBeDefined();
    expect(login.userId).toBe('admin');
    expect(login.role).toBe('admin');
  });

  it('should reject invalid login credentials', async () => {
    const result = await gqlRequest(`
      mutation Login($username: String!, $password: String!) {
        login(username: $username, password: $password) {
          token
        }
      }
    `, { username: 'admin', password: 'wrong' });

    expect(result.errors).toBeDefined();
    expect(result.errors![0]!.extensions?.code).toBe('UNAUTHENTICATED');
  });

  // -----------------------------------------------------------------------
  // 2. Register document → full pipeline
  // -----------------------------------------------------------------------
  it('should register a document and return docHash, ipfsCID, QR', async () => {
    // Login first
    const loginResult = await gqlRequest(`
      mutation { login(username: "registrar", password: "reg456") { token } }
    `);
    const token = (loginResult.data!.login as { token: string }).token;

    // Register a document
    const fileContent = Buffer.from('Test legal document content for integration testing');
    const result = await gqlRequest(`
      mutation RegisterDocument($input: RegisterDocumentInput!) {
        registerDocument(input: $input) {
          docHash
          ipfsCID
          qrCodeBase64
          verificationUrl
          timestamp
        }
      }
    `, {
      input: {
        fileBase64: fileContent.toString('base64'),
        docType: 'sale_deed',
        ownerId: 'owner-001',
        deviceId: 'device-001',
        metadata: { propertyId: 'PROP-100', buyer: 'Alice', seller: 'Bob' },
      },
    }, token);

    expect(result.errors).toBeUndefined();
    const reg = result.data!.registerDocument as {
      docHash: string;
      ipfsCID: string;
      qrCodeBase64: string;
      verificationUrl: string;
    };
    expect(reg.docHash).toMatch(/^[0-9a-f]{64}$/);
    expect(reg.ipfsCID).toMatch(/^Qm/);
    expect(reg.qrCodeBase64.length).toBeGreaterThan(0);
    expect(reg.verificationUrl).toContain('/verify/');
  });

  // -----------------------------------------------------------------------
  // 3. Verify registered document → AUTHENTIC
  // -----------------------------------------------------------------------
  it('should verify a registered document as AUTHENTIC', async () => {
    // Login and register
    const loginResult = await gqlRequest(`
      mutation { login(username: "admin", password: "admin123") { token } }
    `);
    const token = (loginResult.data!.login as { token: string }).token;

    const fileContent = Buffer.from('Verify-this-document-content');
    const regResult = await gqlRequest(`
      mutation RegisterDocument($input: RegisterDocumentInput!) {
        registerDocument(input: $input) { docHash }
      }
    `, {
      input: {
        fileBase64: fileContent.toString('base64'),
        docType: 'court_order',
        ownerId: 'owner-002',
        deviceId: 'device-002',
      },
    }, token);

    const docHash = (regResult.data!.registerDocument as { docHash: string }).docHash;

    // Verify (public — no token)
    const verifyResult = await gqlRequest(`
      query VerifyDocument($docHash: String!) {
        verifyDocument(docHash: $docHash) {
          status
          docHash
          message
        }
      }
    `, { docHash });

    expect(verifyResult.errors).toBeUndefined();
    const verification = verifyResult.data!.verifyDocument as { status: string; docHash: string };
    expect(verification.status).toBe('AUTHENTIC');
    expect(verification.docHash).toBe(docHash);
  });

  // -----------------------------------------------------------------------
  // 4. Verify non-existent document → NOT_REGISTERED
  // -----------------------------------------------------------------------
  it('should return NOT_REGISTERED for unknown document hash', async () => {
    const fakeHash = 'f'.repeat(64);
    const result = await gqlRequest(`
      query VerifyDocument($docHash: String!) {
        verifyDocument(docHash: $docHash) {
          status
          message
        }
      }
    `, { docHash: fakeHash });

    expect(result.errors).toBeUndefined();
    expect(
      (result.data!.verifyDocument as { status: string }).status
    ).toBe('NOT_REGISTERED');
  });

  // -----------------------------------------------------------------------
  // 5. Transfer document → verify new owner
  // -----------------------------------------------------------------------
  it('should transfer document ownership', async () => {
    const loginResult = await gqlRequest(`
      mutation { login(username: "admin", password: "admin123") { token } }
    `);
    const token = (loginResult.data!.login as { token: string }).token;

    // Register
    const fileContent = Buffer.from('Transfer-test-doc');
    const regResult = await gqlRequest(`
      mutation RegisterDocument($input: RegisterDocumentInput!) {
        registerDocument(input: $input) { docHash }
      }
    `, {
      input: {
        fileBase64: fileContent.toString('base64'),
        docType: 'sale_deed',
        ownerId: 'owner-A',
        deviceId: 'device-A',
      },
    }, token);
    const docHash = (regResult.data!.registerDocument as { docHash: string }).docHash;

    // Transfer
    const transferResult = await gqlRequest(`
      mutation TransferDocument($docHash: String!, $newOwnerId: String!) {
        transferDocument(docHash: $docHash, newOwnerId: $newOwnerId) {
          docHash
          ownerId
        }
      }
    `, { docHash, newOwnerId: 'owner-B' }, token);

    expect(transferResult.errors).toBeUndefined();
    expect(
      (transferResult.data!.transferDocument as { ownerId: string }).ownerId
    ).toBe('owner-B');
  });

  // -----------------------------------------------------------------------
  // 6. Add dispute → verify dispute flag
  // -----------------------------------------------------------------------
  it('should add and resolve a dispute', async () => {
    const loginResult = await gqlRequest(`
      mutation { login(username: "admin", password: "admin123") { token } }
    `);
    const token = (loginResult.data!.login as { token: string }).token;

    // Register
    const fileContent = Buffer.from('Dispute-test-doc');
    const regResult = await gqlRequest(`
      mutation RegisterDocument($input: RegisterDocumentInput!) {
        registerDocument(input: $input) { docHash }
      }
    `, {
      input: {
        fileBase64: fileContent.toString('base64'),
        docType: 'sale_deed',
        ownerId: 'owner-C',
        deviceId: 'device-C',
      },
    }, token);
    const docHash = (regResult.data!.registerDocument as { docHash: string }).docHash;

    // Add dispute
    const disputeResult = await gqlRequest(`
      mutation AddDispute($docHash: String!, $caseId: String!) {
        addDispute(docHash: $docHash, caseId: $caseId) {
          docHash
          activeDispute
          disputeCaseId
        }
      }
    `, { docHash, caseId: 'CASE-001' }, token);

    expect(disputeResult.errors).toBeUndefined();
    const disputed = disputeResult.data!.addDispute as {
      activeDispute: boolean;
      disputeCaseId: string;
    };
    expect(disputed.activeDispute).toBe(true);
    expect(disputed.disputeCaseId).toBe('CASE-001');

    // Resolve dispute
    const resolveResult = await gqlRequest(`
      mutation ResolveDispute($docHash: String!, $caseId: String!) {
        resolveDispute(docHash: $docHash, caseId: $caseId) {
          docHash
          activeDispute
        }
      }
    `, { docHash, caseId: 'CASE-001' }, token);

    expect(resolveResult.errors).toBeUndefined();
    expect(
      (resolveResult.data!.resolveDispute as { activeDispute: boolean }).activeDispute
    ).toBe(false);
  });

  // -----------------------------------------------------------------------
  // 7. Auth enforcement — registerDocument without token
  // -----------------------------------------------------------------------
  it('should reject registerDocument without authentication', async () => {
    const result = await gqlRequest(`
      mutation RegisterDocument($input: RegisterDocumentInput!) {
        registerDocument(input: $input) { docHash }
      }
    `, {
      input: {
        fileBase64: Buffer.from('test').toString('base64'),
        docType: 'sale_deed',
        ownerId: 'owner-X',
        deviceId: 'device-X',
      },
    });

    expect(result.errors).toBeDefined();
    expect(result.errors![0]!.extensions?.code).toBe('UNAUTHENTICATED');
  });
});

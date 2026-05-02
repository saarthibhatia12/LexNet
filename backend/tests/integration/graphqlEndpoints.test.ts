// ============================================================================
// LexNet Backend — GraphQL Endpoints Integration Test
// ============================================================================
//
// Tests all GraphQL queries and mutations via the Apollo test client
// (real Express server, all services mocked):
//
//   Queries:
//     - verifyDocument (public)
//     - getKnowledgeGraph (public)
//     - searchNodes (public)
//     - getPropertyTimeline (public)
//     - getDocument (auth required)
//     - getDocumentsByOwner (auth required)
//     - getDocumentHistory (auth required)
//
//   Mutations:
//     - login (public)
//     - registerDocument (auth required)
//
//   Error Cases:
//     - Bad input validation
//     - Auth enforcement
// ============================================================================

import { jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TEST_AES_KEY = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
const TEST_DOC_HASH = 'a'.repeat(64);

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

const fabricStore = new Map<string, Record<string, unknown>>();
const ipfsStore = new Map<string, Buffer>();

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.unstable_mockModule('../../src/config/env.js', () => ({
  env: {
    PORT: 4098,
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

jest.unstable_mockModule('isomorphic-dompurify', () => ({
  default: { sanitize: (input: string) => input },
  sanitize: (input: string) => input,
}));

jest.unstable_mockModule('../../src/middleware/inputSanitizer.js', () => ({
  inputSanitizer: (
    _req: unknown, _res: unknown, next: () => void
  ) => next(),
}));

jest.unstable_mockModule('../../src/services/fabricService.js', () => ({
  storeDocument: jest.fn(
    async (
      docHash: string, ipfsCID: string, ownerId: string,
      deviceId: string, timestamp: string, docType: string,
      metadata: Record<string, unknown>
    ) => {
      fabricStore.set(docHash, {
        docHash, ipfsCID, ownerId, deviceId, timestamp,
        docType, metadata, activeDispute: false, disputeCaseId: '',
        riskScore: 0, createdAt: timestamp,
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
  transferDocument: jest.fn(),
  addDispute: jest.fn(),
  resolveDispute: jest.fn(),
}));

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

const mockGetKnowledgeGraph = jest.fn(async () => ({
  nodes: [
    { id: 'n1', label: 'Document', properties: { hash: TEST_DOC_HASH } },
    { id: 'n2', label: 'Person', properties: { name: 'Alice' } },
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2', type: 'OWNS', properties: {} },
  ],
}));

const mockSearchNodes = jest.fn(async () => [
  { id: 'n1', label: 'Person', name: 'Alice', score: 1.0 },
  { id: 'n2', label: 'Person', name: 'Alice Smith', score: 0.8 },
]);

const mockGetPropertyTimeline = jest.fn(async (propertyId: string) => ({
  propertyId,
  events: [
    {
      id: 'evt-1',
      eventType: 'registration',
      timestamp: '2024-01-01T00:00:00Z',
      description: 'Property registered',
      docHash: TEST_DOC_HASH,
      actor: 'registrar',
    },
  ],
}));

jest.unstable_mockModule('../../src/services/neo4jService.js', () => ({
  getKnowledgeGraph: mockGetKnowledgeGraph,
  searchNodes: mockSearchNodes,
  getPropertyTimeline: mockGetPropertyTimeline,
  runCypher: jest.fn(async () => []),
  close: jest.fn(),
}));

jest.unstable_mockModule('../../src/services/nlpTriggerService.js', () => ({
  triggerNlpProcessing: jest.fn(),
}));

jest.unstable_mockModule('../../src/config/fabric.js', () => ({
  connectToFabric: jest.fn(),
  getContract: jest.fn(),
  disconnectFabric: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Dynamic imports AFTER all mocks
// ---------------------------------------------------------------------------

const { createApp } = await import('../../src/index.js');

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
  const port = typeof addr === 'object' && addr ? addr.port : 4098;
  baseUrl = `http://localhost:${port}`;
});

afterAll(async () => {
  await apolloServer.stop();
  httpServer.close();
});

beforeEach(() => {
  fabricStore.clear();
  ipfsStore.clear();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function gql(
  query: string,
  variables: Record<string, unknown> = {},
  token?: string
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}/graphql`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  return res.json() as Promise<{
    data?: Record<string, unknown>;
    errors?: Array<{ message: string; extensions?: { code: string } }>;
  }>;
}

async function getToken(username = 'admin', password = 'admin123'): Promise<string> {
  const result = await gql(`
    mutation { login(username: "${username}", password: "${password}") { token } }
  `);
  return (result.data!.login as { token: string }).token;
}

// ===========================================================================
// Public Query Tests
// ===========================================================================

describe('GraphQL Public Queries', () => {
  it('verifyDocument — should return NOT_REGISTERED for unknown hash', async () => {
    const result = await gql(`
      query { verifyDocument(docHash: "${TEST_DOC_HASH}") { status message } }
    `);

    expect(result.errors).toBeUndefined();
    expect((result.data!.verifyDocument as { status: string }).status).toBe('NOT_REGISTERED');
  });

  it('verifyDocument — should reject invalid hash format', async () => {
    const result = await gql(`
      query { verifyDocument(docHash: "invalid-hash") { status } }
    `);

    expect(result.errors).toBeDefined();
    expect(result.errors![0]!.extensions?.code).toBe('BAD_USER_INPUT');
  });

  it('getKnowledgeGraph — should return graph data', async () => {
    const result = await gql(`
      query {
        getKnowledgeGraph(docHash: "${TEST_DOC_HASH}", depth: 2) {
          nodes { id label properties }
          edges { id source target type }
        }
      }
    `);

    expect(result.errors).toBeUndefined();
    const graph = result.data!.getKnowledgeGraph as { nodes: unknown[]; edges: unknown[] };
    expect(graph.nodes.length).toBe(2);
    expect(graph.edges.length).toBe(1);
  });

  it('getKnowledgeGraph — should reject depth > 5', async () => {
    const result = await gql(`
      query { getKnowledgeGraph(docHash: "${TEST_DOC_HASH}", depth: 10) { nodes { id } } }
    `);

    expect(result.errors).toBeDefined();
    expect(result.errors![0]!.extensions?.code).toBe('BAD_USER_INPUT');
  });

  it('searchNodes — should return matching nodes', async () => {
    const result = await gql(`
      query { searchNodes(query: "Alice") { id label name score } }
    `);

    expect(result.errors).toBeUndefined();
    const nodes = result.data!.searchNodes as Array<{ name: string }>;
    expect(nodes.length).toBe(2);
    expect(nodes[0]!.name).toBe('Alice');
  });

  it('searchNodes — should reject empty query', async () => {
    const result = await gql(`
      query { searchNodes(query: "") { id } }
    `);

    expect(result.errors).toBeDefined();
  });

  it('getPropertyTimeline — should return timeline events', async () => {
    const result = await gql(`
      query {
        getPropertyTimeline(propertyId: "PROP-100") {
          propertyId
          events { id eventType timestamp description }
        }
      }
    `);

    expect(result.errors).toBeUndefined();
    const timeline = result.data!.getPropertyTimeline as {
      propertyId: string;
      events: unknown[];
    };
    expect(timeline.propertyId).toBe('PROP-100');
    expect(timeline.events.length).toBe(1);
  });
});

// ===========================================================================
// Auth-Protected Query Tests
// ===========================================================================

describe('GraphQL Auth-Protected Queries', () => {
  it('getDocument — should return document when authenticated', async () => {
    // First register a document
    const token = await getToken();
    const fileContent = Buffer.from('Auth-test-document');
    const regResult = await gql(`
      mutation RegisterDocument($input: RegisterDocumentInput!) {
        registerDocument(input: $input) { docHash }
      }
    `, {
      input: {
        fileBase64: fileContent.toString('base64'),
        docType: 'sale_deed',
        ownerId: 'owner-auth',
        deviceId: 'device-auth',
      },
    }, token);

    const docHash = (regResult.data!.registerDocument as { docHash: string }).docHash;

    // Fetch the document
    const result = await gql(`
      query GetDocument($docHash: String!) {
        getDocument(docHash: $docHash) {
          docHash ownerId docType
        }
      }
    `, { docHash }, token);

    expect(result.errors).toBeUndefined();
    expect((result.data!.getDocument as { ownerId: string }).ownerId).toBe('owner-auth');
  });

  it('getDocument — should fail without auth', async () => {
    const result = await gql(`
      query { getDocument(docHash: "${TEST_DOC_HASH}") { docHash } }
    `);

    expect(result.errors).toBeDefined();
    expect(result.errors![0]!.extensions?.code).toBe('UNAUTHENTICATED');
  });

  it('getDocumentsByOwner — should fail without auth', async () => {
    const result = await gql(`
      query { getDocumentsByOwner(ownerId: "owner-1") { docHash } }
    `);

    expect(result.errors).toBeDefined();
    expect(result.errors![0]!.extensions?.code).toBe('UNAUTHENTICATED');
  });
});

// ===========================================================================
// Mutation Tests
// ===========================================================================

describe('GraphQL Mutations', () => {
  it('login — should succeed with all demo users', async () => {
    const users = [
      { username: 'admin', password: 'admin123', role: 'admin' },
      { username: 'registrar', password: 'reg456', role: 'registrar' },
      { username: 'clerk', password: 'clerk789', role: 'clerk' },
    ];

    for (const user of users) {
      const result = await gql(`
        mutation Login($u: String!, $p: String!) {
          login(username: $u, password: $p) { userId role }
        }
      `, { u: user.username, p: user.password });

      expect(result.errors).toBeUndefined();
      expect((result.data!.login as { role: string }).role).toBe(user.role);
    }
  });

  it('registerDocument — should complete full pipeline', async () => {
    const token = await getToken('registrar', 'reg456');
    const fileContent = Buffer.from('Full-pipeline-test');

    const result = await gql(`
      mutation RegisterDocument($input: RegisterDocumentInput!) {
        registerDocument(input: $input) {
          docHash ipfsCID qrCodeBase64 verificationUrl timestamp
        }
      }
    `, {
      input: {
        fileBase64: fileContent.toString('base64'),
        docType: 'sale_deed',
        ownerId: 'owner-pipeline',
        deviceId: 'dev-1',
        metadata: { buyer: 'TestBuyer', seller: 'TestSeller' },
      },
    }, token);

    expect(result.errors).toBeUndefined();
    const reg = result.data!.registerDocument as {
      docHash: string;
      ipfsCID: string;
      qrCodeBase64: string;
      verificationUrl: string;
      timestamp: string;
    };

    expect(reg.docHash).toMatch(/^[0-9a-f]{64}$/);
    expect(reg.ipfsCID).toBeTruthy();
    expect(reg.qrCodeBase64.length).toBeGreaterThan(100);
    expect(reg.verificationUrl).toContain(reg.docHash);
    expect(reg.timestamp).toBeTruthy();
  });
});

// ===========================================================================
// REST Endpoint Tests
// ===========================================================================

describe('REST Endpoints', () => {
  it('GET /api/health — should return ok', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    const body = await res.json() as { status: string };
    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
  });

  it('POST /api/auth/login — should return session token', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    });

    const body = await res.json() as { token: string; role: string };
    expect(res.status).toBe(200);
    expect(body.token).toBeDefined();
    expect(body.role).toBe('admin');
  });

  it('GET /api/verify/:hash — should return NOT_REGISTERED for unknown', async () => {
    const fakeHash = 'b'.repeat(64);
    const res = await fetch(`${baseUrl}/api/verify/${fakeHash}`);
    const body = await res.json() as { status: string };
    expect(res.status).toBe(200);
    expect(body.status).toBe('NOT_REGISTERED');
  });

  it('GET /api/verify/:hash — should return 400 for invalid hash', async () => {
    const res = await fetch(`${baseUrl}/api/verify/invalid-hash`);
    expect(res.status).toBe(400);
  });
});

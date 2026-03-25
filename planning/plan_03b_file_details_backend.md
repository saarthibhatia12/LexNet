# Section 3B — File-by-File Details: Backend (Node.js)

[← Back to Index](file:///C:/Users/sbrbs/.gemini/antigravity/brain/aa37d9b8-3977-4d6d-bd30-54083b104657/implementation_plan.md)

---

## Config Layer (`backend/src/config/`)

### `env.ts`
- **Purpose**: Load and validate all env vars at startup using Zod
- **Exports**: `const env: EnvConfig` — validated, typed config object
- **Schema fields**: `PORT`, `JWT_SECRET`, `JWT_EXPIRY`, `FABRIC_CHANNEL`, `FABRIC_CHAINCODE`, `FABRIC_WALLET_PATH`, `FABRIC_CONNECTION_PROFILE`, `FABRIC_MSP_ID`, `IPFS_API_URL`, `IPFS_GATEWAY_URL`, `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `AES_KEY` (hex, 64 chars = 32 bytes), `NLP_SERVICE_URL`, `VERIFICATION_BASE_URL`
- **Edge cases**: Missing required var → throw with clear name of missing var. Invalid AES_KEY length → throw.

### `fabric.ts`
- **Function**: `async function connectToFabric(): Promise<{ gateway: Gateway; contract: Contract }>` — Loads connection profile JSON, creates wallet from filesystem, connects gateway with discovery enabled, returns contract handle.
- **Imports**: `fabric-network` (Gateway, Wallets, Contract)
- **Edge cases**: Connection profile not found → throw with path. Wallet identity not found → log setup instructions + throw. Peer unreachable → retry 3x with 2s backoff.

### `logger.ts`
- **Exports**: `const logger: Logger` — Winston logger, `info`/`warn`/`error` levels, JSON format, console + `logs/app.log` file transports. Redacts `JWT_SECRET` and `AES_KEY` from log output.

---

## Services Layer (`backend/src/services/`)

### `encryptionService.ts`
- **Functions**:
  - `encrypt(plainBuffer: Buffer, keyHex: string): { ciphertext: Buffer; iv: Buffer; authTag: Buffer }` — AES-256-GCM. Generates random 12-byte IV. Returns ciphertext + 16-byte auth tag.
  - `decrypt(ciphertext: Buffer, keyHex: string, iv: Buffer, authTag: Buffer): Buffer` — Decrypts, verifies auth tag. Throws `DecryptionError` on tamper.
- **Imports**: Node.js `crypto`
- **Edge cases**: Wrong key → `DecryptionError("authentication tag mismatch")`. Empty buffer → return empty. Key not 32 bytes → throw.

### `hashService.ts`
- **Function**: `computeSHA256(buffer: Buffer): string` — Returns lowercase hex SHA-256 digest.
- **Function**: `computeSHA256FromStream(stream: Readable): Promise<string>` — Streaming hash for large files.
- **Imports**: Node.js `crypto`

### `ipfsService.ts`
- **Functions**:
  - `async uploadToIPFS(encryptedBuffer: Buffer): Promise<string>` — Adds to IPFS via HTTP API, returns CID (v1). Pins the content.
  - `async retrieveFromIPFS(cid: string): Promise<Buffer>` — Cat from IPFS, returns full buffer. Timeout: 30s.
- **Imports**: `ipfs-http-client` or raw `fetch` to IPFS API
- **Env vars**: `IPFS_API_URL` (e.g., `http://localhost:5001`)
- **Edge cases**: IPFS daemon down → throw `IPFSUnavailableError`. CID not found → throw `CIDNotFoundError`. File > 50MB → reject before upload.

### `fabricService.ts`
- **Functions**:
  - `async storeDocument(docHash: string, ipfsCID: string, ownerID: string, deviceID: string, timestamp: string, docType: string, metadata: Record<string, string>): Promise<void>` — `contract.submitTransaction('StoreDocument', ...)`
  - `async getDocument(docHash: string): Promise<DocumentRecord | null>` — `contract.evaluateTransaction('GetDocument', docHash)`
  - `async getDocumentHistory(docHash: string): Promise<DocumentRecord[]>` — evaluateTransaction
  - `async transferDocument(docHash: string, newOwnerID: string): Promise<void>` — submitTransaction
  - `async addDispute(docHash: string, caseID: string, filedBy: string): Promise<void>` — submitTransaction
  - `async resolveDispute(docHash: string, caseID: string): Promise<void>` — submitTransaction
  - `async getDocumentsByOwner(ownerID: string): Promise<DocumentRecord[]>` — evaluateTransaction
  - `async verifyDocument(docHash: string): Promise<"EXISTS" | "NOT_FOUND">` — evaluateTransaction
- **Edge cases**: Fabric endorsement failure → parse error message, throw typed error. Transaction timeout → throw `FabricTimeoutError`. JSON parse failure from chaincode → throw `ChaincodeMalformedResponse`.

### `neo4jService.ts`
- **Functions**:
  - `async runCypher<T>(query: string, params: Record<string, unknown>): Promise<T[]>` — Runs Cypher via driver session, maps records to typed objects, closes session.
  - `async getKnowledgeGraph(docHash: string, depth: number): Promise<GraphData>` — Returns nodes + edges within `depth` hops of document.
  - `async searchNodes(query: string, labelFilter?: string): Promise<NodeResult[]>` — Full-text search on name/title properties.
  - `async getPropertyTimeline(propertyId: string): Promise<TimelineEvent[]>` — Ordered events for a property.
  - `close(): void` — Close driver on shutdown.
- **Imports**: `neo4j-driver`
- **Edge cases**: Neo4j down → `Neo4jUnavailableError`. Empty results → return `[]`. Cypher injection prevented by always using parameterized queries (never string interpolation).

### `qrService.ts`
- **Function**: `async generateQR(data: string): Promise<Buffer>` — Generates QR code PNG buffer. Data format: `{VERIFICATION_BASE_URL}/verify/{docHash}`.
- **Function**: `buildVerificationURL(docHash: string): string`
- **Imports**: `qrcode` npm package
- **Edge cases**: Data too long for QR → throw. Empty hash → throw.

### `pdfService.ts`
- **Function**: `async embedQRInPDF(originalPdf: Buffer, qrPng: Buffer): Promise<Buffer>` — Adds new page to PDF with QR code + verification instructions using pdf-lib.
- **Imports**: `pdf-lib`
- **Edge cases**: Corrupted PDF input → throw `InvalidPDFError`. Zero-length PDF → throw.

### `nlpTriggerService.ts`
- **Function**: `async triggerNLPProcessing(docHash: string, ipfsCID: string, metadata: Record<string, string>): Promise<void>` — HTTP POST to `{NLP_SERVICE_URL}/nlp/process` with JSON body. Fire-and-forget (async, non-blocking). Logs any errors but does not throw (NLP failure should not block document registration).
- **Edge cases**: NLP service unreachable → log warning, return silently.

---

## Middleware (`backend/src/middleware/`)

### `auth.ts`
- **Function**: `function authMiddleware(req: Request, res: Response, next: NextFunction): void` — Extracts `Authorization: Bearer <token>` from header → `jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })` → attaches decoded payload to `req.user` → calls `next()`. On failure: 401 response.
- **Edge cases**: No header → 401 "Missing token". Malformed header → 401. Expired token → 401 "Token expired". Invalid signature → 401 "Invalid token".

### `rateLimiter.ts`
- **Exports**: Configured `express-rate-limit` instance: 100 requests per 15 minutes per IP. Separate stricter limit for `/api/auth/*`: 20 per 15 min.

### `errorHandler.ts`
- **Function**: `function globalErrorHandler(err: Error, req: Request, res: Response, next: NextFunction): void` — Maps known error classes to HTTP status codes. Unknown errors → 500 with generic message (no stack trace in production). Logs full error with logger.

### `inputSanitizer.ts`
- **Function**: `function sanitize(req: Request, res: Response, next: NextFunction): void` — Runs DOMPurify on all string fields in `req.body`, `req.query`, `req.params`. Strips HTML/script tags.

---

## REST Controllers (`backend/src/rest/`)

### `hardwareAuthController.ts`
- **Function**: `async function handleHardwareAuth(req: Request, res: Response): Promise<void>`
  1. Extract bridge JWT from `Authorization: Bearer`
  2. Verify with `jwt.verify()` — check `iss === "lexnet-bridge"`
  3. Validate `finger_score >= 60` (re-check, defence in depth)
  4. Issue new session JWT with `{ userId: deviceId, role: "official", exp: 1h }`
  5. Return `{ sessionToken, expiresIn: 3600 }`
- **Error responses**: 401 (invalid bridge token), 403 (finger score too low)

### `verifyController.ts`
- **Function**: `async function handleVerify(req: Request, res: Response): Promise<void>`
  1. Extract `docHash` from `req.params.hash`
  2. Call `fabricService.verifyDocument(docHash)` → if "NOT_FOUND" → return `{ status: "NOT_REGISTERED" }`
  3. Call `fabricService.getDocument(docHash)` → get `ipfsCID`
  4. Call `ipfsService.retrieveFromIPFS(ipfsCID)` → decrypt → recompute SHA-256
  5. Compare computed hash with `docHash`
  6. If match → `{ status: "AUTHENTIC", record, graphData }` (include Neo4j ownership subgraph)
  7. If mismatch → `{ status: "TAMPERED", record }`
- **No auth required** — public endpoint
- **Edge cases**: IPFS timeout → `{ status: "VERIFICATION_ERROR", message: "Storage unavailable" }`. Decryption failure → `{ status: "TAMPERED" }`.

---

## GraphQL Layer (`backend/src/graphql/`)

### `schema.ts` — Full SDL
```graphql
type Query {
  getDocument(docHash: String!): Document
  getDocumentHistory(docHash: String!): [Document!]!
  verifyDocument(docHash: String!): VerificationResult!
  getDocumentsByOwner(ownerId: String!): [Document!]!
  getKnowledgeGraph(docHash: String!, depth: Int = 2): GraphData!
  searchNodes(query: String!, labelFilter: String): [GraphNode!]!
  getPropertyTimeline(propertyId: String!): [TimelineEvent!]!
  getConflicts(limit: Int = 20, offset: Int = 0): [ConflictAlert!]!
  getFlaggedDocuments(minRisk: Float = 50.0): [Document!]!
}

type Mutation {
  registerDocument(input: RegisterDocumentInput!): RegisterResult! @auth
  login(username: String!, password: String!): AuthPayload!
  transferDocument(docHash: String!, newOwnerId: String!): Document! @auth
  addDispute(docHash: String!, caseId: String!): Document! @auth
  resolveDispute(docHash: String!, caseId: String!): Document! @auth
}

input RegisterDocumentInput {
  file: Upload!
  docType: String!
  ownerId: String!
  metadata: JSON
}

type Document {
  docHash: String!; ipfsCID: String!; ownerId: String!; deviceId: String!
  timestamp: String!; docType: String!; metadata: JSON
  activeDispute: Boolean!; riskScore: Float!; createdAt: String!
}

type VerificationResult {
  status: VerificationStatus!; document: Document; graphData: GraphData
}

enum VerificationStatus { AUTHENTIC TAMPERED NOT_REGISTERED VERIFICATION_ERROR }

type GraphData { nodes: [GraphNode!]!; edges: [GraphEdge!]! }
type GraphNode { id: String!; label: String!; type: String!; properties: JSON }
type GraphEdge { source: String!; target: String!; type: String!; properties: JSON }
type TimelineEvent { date: String!; eventType: String!; description: String!; docHash: String }
type ConflictAlert { docHash: String!; riskScore: Float!; flags: [String!]!; detectedAt: String! }
type AuthPayload { token: String!; expiresIn: Int! }
type RegisterResult { docHash: String!; ipfsCID: String!; qrCodeUrl: String!; pdfUrl: String! }
```

### `resolvers/documentResolvers.ts`
- `registerDocument`: Validate input → hash file → encrypt → upload IPFS → store on Fabric → generate QR → embed in PDF → trigger NLP async → return result.
- `getDocument`: Call `fabricService.getDocument()` → return.
- `verifyDocument`: Same logic as REST verify controller (shared via service).
- `getDocumentHistory`: Call `fabricService.getDocumentHistory()`.

### `resolvers/graphResolvers.ts`
- `getKnowledgeGraph`: Call `neo4jService.getKnowledgeGraph()` → transform Neo4j records to `GraphData`.
- `searchNodes`: Call `neo4jService.searchNodes()`.
- All graph resolvers are **read-only** — no auth required.

### `resolvers/authResolvers.ts`
- `login`: Check username/password against hardcoded demo users (or a simple JSON file). Return JWT.
- For demo purposes: 3 users — `admin/admin123`, `registrar/reg456`, `clerk/clerk789`.

> [!CAUTION]
> **Demo-only auth**: Hardcoded users are acceptable for a student project demo. In production, integrate with an LDAP/OAuth2 provider. Document this limitation clearly.

### `directives/authDirective.ts`
- Implements `@auth` directive — checks `context.user` exists (populated by auth middleware). Returns `AuthenticationError` if missing.

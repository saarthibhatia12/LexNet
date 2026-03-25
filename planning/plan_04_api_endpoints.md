# Section 4 — All API Endpoints

[← Back to Index](file:///C:/Users/sbrbs/.gemini/antigravity/brain/aa37d9b8-3977-4d6d-bd30-54083b104657/implementation_plan.md)

---

## REST Endpoints

### `POST /api/auth/hardware`
- **Auth**: Bridge JWT (HS256, `iss: "lexnet-bridge"`)
- **Request**: No body — JWT in `Authorization: Bearer` header
- **Response**: `{ sessionToken: string, expiresIn: 3600 }`
- **Calls**: `jwt.verify()` → issues new session JWT
- **Errors**: 401 invalid token, 403 finger score < 60

### `POST /api/auth/login`
- **Auth**: None (public)
- **Request**: `{ username: string, password: string }`
- **Response**: `{ token: string, expiresIn: 3600, user: { id, role } }`
- **Calls**: Hardcoded user lookup (demo)
- **Errors**: 401 invalid credentials

### `GET /api/verify/:hash`
- **Auth**: None (public — citizen verification)
- **Request**: URL param `hash` (64-char hex SHA-256)
- **Response**: `{ status: "AUTHENTIC"|"TAMPERED"|"NOT_REGISTERED"|"VERIFICATION_ERROR", document?: DocumentRecord, graphData?: GraphData }`
- **Calls**: `fabricService.verifyDocument()` → `fabricService.getDocument()` → `ipfsService.retrieveFromIPFS()` → `encryptionService.decrypt()` → `hashService.computeSHA256()` → `neo4jService.getKnowledgeGraph()`
- **Errors**: 400 invalid hash format, 502 IPFS timeout, 500 internal

### `GET /api/health`
- **Auth**: None
- **Response**: `{ status: "ok", services: { fabric: bool, ipfs: bool, neo4j: bool, nlp: bool } }`

### `GET /api/documents/:hash/pdf`
- **Auth**: Session JWT
- **Response**: PDF binary (original doc with embedded QR) as `application/pdf`
- **Calls**: `ipfsService.retrieveFromIPFS()` → `encryptionService.decrypt()` → stream response

---

## GraphQL Endpoints (`POST /graphql`)

### Queries

| Query | Auth | Input | Returns | Downstream |
|-------|------|-------|---------|------------|
| `getDocument(docHash!)` | JWT | hash string | `Document` | `fabricService.getDocument()` |
| `getDocumentHistory(docHash!)` | JWT | hash string | `[Document]` | `fabricService.getDocumentHistory()` |
| `verifyDocument(docHash!)` | Public | hash string | `VerificationResult` | Fabric → IPFS → decrypt → hash compare → Neo4j |
| `getDocumentsByOwner(ownerId!)` | JWT | owner string | `[Document]` | `fabricService.getDocumentsByOwner()` |
| `getKnowledgeGraph(docHash!, depth=2)` | Public | hash + int | `GraphData` | `neo4jService.getKnowledgeGraph()` |
| `searchNodes(query!, labelFilter?)` | Public | string + optional filter | `[GraphNode]` | `neo4jService.searchNodes()` |
| `getPropertyTimeline(propertyId!)` | Public | property string | `[TimelineEvent]` | `neo4jService.getPropertyTimeline()` |
| `getConflicts(limit=20, offset=0)` | JWT | pagination | `[ConflictAlert]` | `neo4jService` conflict query |
| `getFlaggedDocuments(minRisk=50)` | JWT | threshold | `[Document]` | `fabricService` + risk filter |

### Mutations

| Mutation | Auth | Input | Returns | Downstream |
|----------|------|-------|---------|------------|
| `registerDocument(input!)` | JWT (`@auth`) | `RegisterDocumentInput` (file, docType, ownerId, metadata) | `RegisterResult` (docHash, ipfsCID, qrCodeUrl, pdfUrl) | Hash → encrypt → IPFS → Fabric → QR → PDF → NLP trigger |
| `login(username!, password!)` | Public | credentials | `AuthPayload` (token, expiresIn) | User lookup |
| `transferDocument(docHash!, newOwnerId!)` | JWT (`@auth`) | hash + new owner | `Document` | `fabricService.transferDocument()` |
| `addDispute(docHash!, caseId!)` | JWT (`@auth`) | hash + case | `Document` | `fabricService.addDispute()` |
| `resolveDispute(docHash!, caseId!)` | JWT (`@auth`) | hash + case | `Document` | `fabricService.resolveDispute()` |

---

## NLP Service Endpoints (Internal — not exposed to frontend)

### `POST /nlp/process`
- **Auth**: Internal network only (no JWT — Docker network isolation)
- **Request**: `{ docHash: string, ipfsCID: string, metadata: { docType, ownerId } }`
- **Response**: `{ status: "completed"|"failed", riskScore: float, entitiesFound: int, triplesInserted: int, flags: string[], processingTimeMs: int }`
- **Calls**: IPFS fetch → OCR → NER → Relation extraction → Neo4j insert → Conflict score

### `GET /nlp/health`
- **Response**: `{ status: "ok", models_loaded: bool, tesseract_available: bool }`

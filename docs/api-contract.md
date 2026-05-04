# LexNet API Contract

This document captures the current REST and GraphQL interfaces implemented in the repository, along with the fixed cross-module payload contracts that other services rely on.

## Base URLs

- Backend REST: `http://localhost:4000/api`
- Backend GraphQL: `http://localhost:4000/graphql`
- NLP REST: `http://localhost:5500/nlp`
- IPFS API: `http://localhost:5001/api/v0`

## Authentication

### Bridge JWT -> backend

The hardware bridge sends a short-lived HS256 JWT to `POST /api/auth/hardware`.

```json
{
  "device_id": "A1B2C3D4",
  "finger_score": 85,
  "iat": 1710500000,
  "exp": 1710500300,
  "iss": "lexnet-bridge"
}
```

Backend validation rules:

- `iss` must equal `lexnet-bridge`
- `finger_score >= 60`
- token must be signed with the shared `JWT_SECRET`
- token expiry is 5 minutes

### Session JWT -> frontend

The backend issues a session JWT for demo users and validated bridge devices.

```json
{
  "userId": "registrar",
  "role": "registrar",
  "iat": 1710500000,
  "exp": 1710503600
}
```

Protected REST endpoints require:

```http
Authorization: Bearer <session-jwt>
```

Protected GraphQL fields expect the same header.

## REST API

### `GET /api/health`

Health probe for backend availability.

Response:

```json
{
  "status": "ok",
  "service": "lexnet-backend",
  "timestamp": "2026-05-04T10:15:30.000Z",
  "uptime": 42.381
}
```

### `POST /api/auth/login`

Authenticates hardcoded demo users:

- `admin / admin123`
- `registrar / reg456`
- `clerk / clerk789`

Request:

```json
{
  "username": "registrar",
  "password": "reg456"
}
```

Success response:

```json
{
  "token": "<session-jwt>",
  "userId": "registrar",
  "role": "registrar",
  "expiresIn": "1h"
}
```

Failure responses:

- `400` invalid request shape
- `401` invalid username or password

### `POST /api/auth/hardware`

Exchanges a valid bridge JWT for a backend session JWT.

Headers:

```http
Authorization: Bearer <bridge-jwt>
```

Success response:

```json
{
  "token": "<session-jwt>",
  "userId": "A1B2C3D4",
  "role": "official",
  "expiresIn": "1h"
}
```

Failure responses:

- `401` missing or malformed Authorization header
- `401` expired or invalid bridge token
- `401` invalid issuer
- `401` fingerprint score below threshold

### `GET /api/verify/:hash`

Public verification endpoint.

Path rules:

- `hash` must be a 64-character lowercase SHA-256 hex string

Possible success payloads:

```json
{
  "status": "AUTHENTIC",
  "docHash": "<sha256>",
  "timestamp": "2026-05-04T10:15:30.000Z",
  "document": {
    "docHash": "<sha256>",
    "ipfsCID": "bafy...",
    "ownerId": "PERSON_001",
    "deviceId": "A1B2C3D4",
    "timestamp": "2026-05-04T10:15:30.000Z",
    "docType": "sale_deed",
    "metadata": {
      "propertyId": "PROP_KA_BLR_001",
      "buyer": "Ram Kumar",
      "seller": "Sita Ayyer",
      "value": "5800000"
    },
    "activeDispute": false,
    "disputeCaseId": "",
    "riskScore": 18.5,
    "createdAt": "2026-05-04T10:15:30.000Z"
  },
  "message": "Document is authentic - hash matches blockchain record"
}
```

Other statuses:

- `TAMPERED`
- `NOT_REGISTERED`
- `ERROR`

Input validation failure:

- `400` invalid or missing hash

### `GET /api/documents/:hash/pdf`

Protected download endpoint that returns the decrypted PDF payload for a stored document.

Headers:

```http
Authorization: Bearer <session-jwt>
```

Response:

- `200` PDF bytes
- `400` invalid hash format
- `401` missing or invalid session JWT

## GraphQL schema

The backend mounts Apollo Server at `/graphql`.

### Public queries

```graphql
query VerifyDocument($docHash: String!) {
  verifyDocument(docHash: $docHash) {
    status
    docHash
    timestamp
    message
    document {
      docHash
      ownerId
      docType
      riskScore
    }
  }
}
```

```graphql
query GetKnowledgeGraph($docHash: String!, $depth: Int) {
  getKnowledgeGraph(docHash: $docHash, depth: $depth) {
    nodes {
      id
      label
      properties
    }
    edges {
      id
      source
      target
      type
      properties
    }
  }
}
```

```graphql
query SearchNodes($query: String!) {
  searchNodes(query: $query) {
    id
    label
    name
    score
  }
}
```

```graphql
query GetPropertyTimeline($propertyId: String!) {
  getPropertyTimeline(propertyId: $propertyId) {
    propertyId
    events {
      id
      eventType
      timestamp
      description
      docHash
      actor
    }
  }
}
```

### Protected queries

```graphql
query GetDocument($docHash: String!) {
  getDocument(docHash: $docHash) {
    docHash
    ipfsCID
    ownerId
    deviceId
    timestamp
    docType
    metadata {
      propertyId
      buyer
      seller
      value
    }
    activeDispute
    disputeCaseId
    riskScore
    createdAt
  }
}
```

```graphql
query GetDocumentHistory($docHash: String!) {
  getDocumentHistory(docHash: $docHash) {
    docHash
    ownerId
    activeDispute
    disputeCaseId
    createdAt
  }
}
```

```graphql
query GetDocumentsByOwner($ownerId: String!) {
  getDocumentsByOwner(ownerId: $ownerId) {
    docHash
    ownerId
    docType
    riskScore
    createdAt
  }
}
```

```graphql
query GetDocumentEvents($docHash: String!) {
  getDocumentEvents(docHash: $docHash) {
    id
    eventType
    timestamp
    description
    docHash
    actor
  }
}
```

```graphql
query GetConflicts($limit: Int, $offset: Int) {
  getConflicts(limit: $limit, offset: $offset) {
    docHash
    riskScore
    assessedAt
    flags {
      type
      severity
      description
      relatedDocHash
    }
  }
}
```

```graphql
query GetRiskScore($docHash: String!) {
  getRiskScore(docHash: $docHash) {
    docHash
    riskScore
    assessedAt
    flags {
      type
      severity
      description
    }
  }
}
```

```graphql
query GetFlaggedDocuments($minRisk: Float) {
  getFlaggedDocuments(minRisk: $minRisk) {
    riskScore
    flags {
      type
      severity
      description
    }
    document {
      docHash
      ownerId
      docType
      riskScore
      createdAt
    }
  }
}
```

### Mutations

```graphql
mutation Login($username: String!, $password: String!) {
  login(username: $username, password: $password) {
    token
    userId
    role
    expiresIn
  }
}
```

```graphql
mutation RegisterDocument($input: RegisterDocumentInput!) {
  registerDocument(input: $input) {
    docHash
    ipfsCID
    qrCodeBase64
    verificationUrl
    timestamp
  }
}
```

Register input currently uses base64 file upload through GraphQL JSON input:

```graphql
input RegisterDocumentInput {
  fileBase64: String!
  docType: String!
  ownerId: String!
  deviceId: String!
  metadata: RegisterMetadataInput
}
```

Additional protected mutations:

```graphql
mutation TransferDocument($docHash: String!, $newOwnerId: String!) {
  transferDocument(docHash: $docHash, newOwnerId: $newOwnerId) {
    docHash
    ownerId
    riskScore
  }
}
```

```graphql
mutation AddDispute($docHash: String!, $caseId: String!, $filedBy: String) {
  addDispute(docHash: $docHash, caseId: $caseId, filedBy: $filedBy) {
    docHash
    activeDispute
    disputeCaseId
  }
}
```

```graphql
mutation ResolveDispute($docHash: String!, $caseId: String!) {
  resolveDispute(docHash: $docHash, caseId: $caseId) {
    docHash
    activeDispute
    disputeCaseId
  }
}
```

## Backend -> NLP contract

The backend triggers NLP asynchronously and must not block document registration if NLP fails.

Request:

```http
POST /nlp/process
Content-Type: application/json
```

```json
{
  "docHash": "<sha256>",
  "ipfsCID": "bafy...",
  "metadata": {
    "docType": "sale_deed",
    "ownerId": "PERSON_001"
  }
}
```

Response:

```json
{
  "status": "completed",
  "riskScore": 72.5,
  "entitiesFound": 9,
  "triplesInserted": 6,
  "flags": [
    "RAPID_TRANSFER",
    "OWNERSHIP_CONFLICT"
  ],
  "processingTimeMs": 1243
}
```

## Chaincode signatures

These function signatures are fixed and must not drift:

- `StoreDocument(docHash, ipfsCID, ownerID, deviceID, timestamp, docType, metadataJsonString)`
- `GetDocument(docHash)`
- `GetDocumentHistory(docHash)`
- `TransferDocument(docHash, newOwnerID)`
- `AddDispute(docHash, caseID, filedBy)`
- `ResolveDispute(docHash, caseID)`
- `GetDocumentsByOwner(ownerID)`
- `VerifyDocument(docHash)`

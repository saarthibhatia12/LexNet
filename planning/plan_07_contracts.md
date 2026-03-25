# Section 7 — Inter-Module Communication Contracts

[← Back to Index](file:///C:/Users/sbrbs/.gemini/antigravity/brain/aa37d9b8-3977-4d6d-bd30-54083b104657/implementation_plan.md)

---

## 1. UART: STM32 ↔ Python Bridge

### STM32 → Bridge (16-byte binary packet)
```
Offset  Size  Field         Encoding
0       4     DEVICE_ID     4 raw bytes (e.g. 0xA1B2C3D4), little-endian
4       2     FINGER_SCORE  uint16_t, little-endian (0-300, match quality)
6       8     TIMESTAMP     uint64_t, little-endian (ms since boot / calibrated epoch)
14      2     CRC16         CRC-16/CCITT (poly 0x1021, init 0xFFFF) of bytes [0..13]
```
- Baud: 57600, 8N1
- Python `struct.unpack('<4sHQH', raw_bytes)` decodes the packet

### Bridge → STM32 (1-byte ACK)
```
0x01  = SUCCESS (auth accepted)
0xFF  = FAILURE (CRC fail / score low / API reject)
```

### Validation Rules (Bridge)
1. CRC-16 of bytes [0..13] must match bytes [14..15]
2. `FINGER_SCORE >= 60`
3. `TIMESTAMP` within 30 seconds of current time (after calibration)
4. If any check fails → send 0xFF and log reason

---

## 2. Python Bridge → Node.js Backend (HTTP)

### Request
```
POST /api/auth/hardware
Content-Type: application/json
Authorization: Bearer <JWT>
```
**JWT payload** (HS256, `JWT_SECRET` shared between bridge and backend):
```json
{
  "device_id": "A1B2C3D4",
  "finger_score": 85,
  "iat": 1710500000,
  "exp": 1710500300,
  "iss": "lexnet-bridge"
}
```

### Response (200)
```json
{
  "sessionToken": "eyJhbG...",
  "expiresIn": 3600
}
```

### Error Responses
| Status | Body | Condition |
|--------|------|-----------|
| 401 | `{"error": "Invalid bridge token"}` | JWT verify fails |
| 401 | `{"error": "Token expired"}` | `exp` passed |
| 403 | `{"error": "Finger score below threshold"}` | score < 60 |

---

## 3. Node.js Backend → Hyperledger Fabric SDK

### Call format
```typescript
// Submit (write) — goes through endorsement + ordering
const result = await contract.submitTransaction(
  'StoreDocument',    // function name
  docHash,            // arg 0
  ipfsCID,            // arg 1
  ownerID,            // arg 2
  deviceID,           // arg 3
  timestamp,          // arg 4 (ISO 8601 string)
  docType,            // arg 5
  JSON.stringify(metadata) // arg 6 (stringified JSON)
);

// Evaluate (read) — local query, no consensus
const resultBytes = await contract.evaluateTransaction('GetDocument', docHash);
const record: DocumentRecord = JSON.parse(resultBytes.toString());
```

### Error handling
- `Error: MVCC_READ_CONFLICT` → retry once
- `Error: Chaincode ... not found` → setup error, throw with instructions
- `Error: endorsement failure` → parse reason from Fabric error, throw typed error

---

## 4. Node.js Backend → IPFS Kubo

### Upload
```
POST http://localhost:5001/api/v0/add
Content-Type: multipart/form-data
Body: file=<encrypted_buffer>
```
**Response**: `{ "Hash": "bafybeig...", "Size": "12345" }`

### Retrieve
```
POST http://localhost:5001/api/v0/cat?arg=<CID>
```
**Response**: Raw encrypted bytes

### Pin (keep data available)
```
POST http://localhost:5001/api/v0/pin/add?arg=<CID>
```

---

## 5. Node.js Backend → Neo4j (Bolt Protocol)

### Query format
```typescript
const session = driver.session();
try {
  const result = await session.run(
    'MATCH (d:Document {hash: $hash})-[r]-(n) RETURN d, r, n LIMIT $limit',
    { hash: docHash, limit: neo4j.int(50) }
  );
  // Map result.records to GraphData
} finally {
  await session.close();
}
```

- **Always parameterized** — never concatenate strings into Cypher
- **Session per request** — open, use, close
- **Integer handling**: Use `neo4j.int()` for Neo4j integer type

---

## 6. NLP Pipeline → Neo4j (Batch Insert)

### Insert format (via Python `neo4j` driver)
```python
with driver.session() as session:
    session.execute_write(lambda tx: [
        tx.run(
            "MERGE (p:Person {name: $name}) "
            "MERGE (d:Document {hash: $docHash}) "
            "MERGE (d)-[:INVOLVES {role: $role}]->(p)",
            name=triple.subject,
            docHash=doc_hash,
            role=triple.predicate
        )
        for triple in triples
    ])
```
- All inserts in a **single transaction** for atomicity
- Uses `MERGE` (not `CREATE`) to prevent duplicates
- Returns count via `summary.counters.nodes_created`, `relationships_created`

---

## 7. Frontend → Backend (GraphQL)

### Apollo Client request format
```typescript
const { data } = await client.query({
  query: GET_DOCUMENT,
  variables: { docHash: "abc123..." },
  context: {
    headers: { Authorization: `Bearer ${token}` }
  }
});
```

### File upload (registerDocument mutation)
Uses `apollo-upload-client` for `Upload` scalar:
```typescript
const { data } = await client.mutate({
  mutation: REGISTER_DOCUMENT,
  variables: {
    input: {
      file: selectedFile,  // File object from <input type="file">
      docType: "sale_deed",
      ownerId: "PERSON_001",
      metadata: { propertyId: "PROP_001" }
    }
  }
});
```

### Error handling
- Network error → `onError` link shows toast: "Server unavailable"
- GraphQL error with `UNAUTHENTICATED` → redirect to `/login`
- GraphQL error with `FORBIDDEN` → show "Access denied" message

### WebSocket (optional, stretch goal)
For real-time conflict alerts: `GraphQLWsLink` to `ws://localhost:4000/graphql` for `conflictAlertAdded` subscription.

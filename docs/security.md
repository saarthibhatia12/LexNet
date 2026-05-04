# LexNet Security Notes

LexNet is a student-project system, but the implementation is still expected to enforce concrete security controls across storage, transport, validation, and logging.

## 1. Cryptography

### Document encryption

- Algorithm: `AES-256-GCM`
- Key source: `backend/.env` -> `AES_KEY`
- IV policy: random 12-byte IV for every encryption operation
- Integrity: GCM authentication tag must be verified on decrypt

Operational rule:

- encrypted payloads are stored in IPFS as JSON with `ciphertext`, `iv`, and `authTag` fields encoded in base64

### Document hashing

- Algorithm: `SHA-256`
- Output format: lowercase hex string
- Usage: the SHA-256 digest is the canonical document identifier used in verification, QR payloads, and Fabric ledger lookups

### JWTs

- Algorithm: `HS256`
- Bridge issuer: `lexnet-bridge`
- Bridge token TTL: 5 minutes
- Session token TTL: 1 hour

Rules:

- `JWT_SECRET` must be at least 32 characters
- `JWT_SECRET` must match exactly between backend and hardware bridge
- backend must reject bridge tokens with invalid issuer or low fingerprint score

## 2. Input validation and sanitization

- Backend env vars are validated with Zod at startup
- Login and request payloads are validated before use
- String inputs are sanitized with DOMPurify in backend middleware
- Document hashes are validated as 64-character lowercase SHA-256 hex strings
- GraphQL resolvers reject malformed IDs and search inputs

## 3. Database and query safety

### Neo4j

- Always use parameterized Cypher
- Never concatenate user-controlled strings into Cypher
- Use `MERGE` instead of `CREATE` for graph insertions to avoid accidental duplicates

### Fabric

- Chaincode function signatures are fixed and must not be altered without coordinated changes
- Backend wraps Fabric errors and should not leak raw infrastructure details to users in production mode

## 4. Transport and trust boundaries

### Firmware -> bridge

- 16-byte UART packet protected by CRC-16/CCITT
- low fingerprint scores and stale timestamps are rejected before backend contact

### Bridge -> backend

- Bridge sends a short-lived HS256 JWT over HTTP to the local backend
- Backend performs defense-in-depth validation even if the bridge already accepted the packet

### Backend -> NLP

- NLP trigger is asynchronous
- NLP failure must be logged but must not block document registration

## 5. Abuse controls

- Global rate limit: `100 requests / 15 minutes`
- Auth endpoints: `20 requests / 15 minutes`
- Public verification remains read-only
- Protected document download requires a valid session JWT

## 6. Logging and secrets

- Backend logging uses Winston
- Sensitive values such as `JWT_SECRET` and `AES_KEY` must be redacted from logs
- Do not commit real `.env` files
- Use `.env.example` files as templates only

## 7. Local deployment posture

LexNet is intentionally local-first:

- services bind to localhost-accessible ports during development
- no cloud deployment is required for the project
- Docker is used for local isolation, not for public internet exposure

Because this is a local student project, security assumptions are narrower than production, but the following should still be treated as mandatory:

- do not expose Neo4j or IPFS to the public internet
- do not reuse demo credentials outside local testing
- do not store real legal or biometric records in the sample dataset

## 8. Third-party data usage

The optional `data/scripts/fetch_indiankanoon.py` helper uses the Indian Kanoon shared-token API flow. Token handling should follow the official documentation and the token should be supplied through an environment variable or CLI argument rather than hardcoded into the script.

Reference:

- [Indian Kanoon API documentation](https://api.indiankanoon.org/documentation/)

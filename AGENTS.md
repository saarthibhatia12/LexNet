# AGENTS.md — Strict Rules for AI Coding Agents

> **Every agent working on LexNet MUST read and follow these rules.**
> Violations will cause integration failures between modules.

---

## Project Overview

LexNet is an AI-powered blockchain legal document networking system. It has 7 modules that communicate over strict contracts. **Do not deviate from the interfaces defined here.**

---

## Build Order (MANDATORY)

```
1. Neo4j + IPFS (Docker containers)
2. NLP Pipeline + Blockchain (IN PARALLEL — zero dependency on each other)
3. Firmware + Hardware Bridge (C + Python)
4. Backend (Node.js/TypeScript)
5. Frontend (React/TypeScript)
6. Docker Compose + Docs
```

**Reference**: [`BUILD_ORDER.md`](file:///d:/LexNet/BUILD_ORDER.md) for dependency reasoning.
**Reference**: [`PHASE_WISE_IMPLEMENTATION.md`](file:///d:/LexNet/PHASE_WISE_IMPLEMENTATION.md) for per-module internal phases.

---

## Hard Constraints — Never Break These

1. **All free/open-source** — no paid services except Indian Kanoon non-commercial tier
2. **Fully local** — no cloud deployment, everything runs on localhost via Docker
3. **Security at every layer** — never skip encryption, auth, input sanitization, or parameterized queries
4. **No placeholders** — every function must be concrete with real logic, not `// TODO` stubs
5. **Every error path must be handled** — no silent failures, no unhandled promise rejections

---

## File & Folder Structure

Follow the structure in [`planning/plan_01_file_tree.md`](file:///d:/LexNet/planning/plan_01_file_tree.md) **exactly**. Do not:
- Rename files or folders
- Move files to different locations
- Create files not listed in the plan without explicit user approval
- Use different package names or module names

---

## Inter-Module Contracts — NEVER CHANGE WITHOUT UPDATING ALL SIDES

### UART Packet (STM32 ↔ Python Bridge)
```
Offset  Size  Field         Encoding
0       4     DEVICE_ID     4 raw bytes, little-endian
4       2     FINGER_SCORE  uint16_t, little-endian
6       8     TIMESTAMP     uint64_t, little-endian
14      2     CRC16         CRC-16/CCITT (poly 0x1021, init 0xFFFF) of bytes [0..13]
```
- Baud: 57600, 8N1
- ACK: 0x01 = SUCCESS, 0xFF = FAILURE
- Python decode: `struct.unpack('<4sHQH', raw_bytes)`

### Hardware Bridge JWT (Bridge → Backend)
```json
{
  "device_id": "A1B2C3D4",
  "finger_score": 85,
  "iat": 1710500000,
  "exp": 1710500300,
  "iss": "lexnet-bridge"
}
```
- Algorithm: HS256
- Expiry: 5 minutes
- Backend MUST check `iss === "lexnet-bridge"` and `finger_score >= 60`

### Session JWT (Backend → Frontend)
```json
{
  "userId": "device_id_or_username",
  "role": "official",
  "iat": 1710500000,
  "exp": 1710503600
}
```
- Algorithm: HS256
- Expiry: 1 hour

### Chaincode Function Signatures (NEVER CHANGE)
| Function | Args |
|----------|------|
| `StoreDocument` | docHash, ipfsCID, ownerID, deviceID, timestamp, docType, metadata(JSON string) |
| `GetDocument` | docHash |
| `GetDocumentHistory` | docHash |
| `TransferDocument` | docHash, newOwnerID |
| `AddDispute` | docHash, caseID, filedBy |
| `ResolveDispute` | docHash, caseID |
| `GetDocumentsByOwner` | ownerID |
| `VerifyDocument` | docHash |

### NLP Trigger (Backend → NLP)
```
POST /nlp/process
Body: { "docHash": string, "ipfsCID": string, "metadata": { "docType": string, "ownerId": string } }
Response: { "status": "completed"|"failed", "riskScore": float, "entitiesFound": int, "triplesInserted": int, "flags": string[], "processingTimeMs": int }
```
- Fire-and-forget from backend — NLP failure must NEVER block document registration

---

## Technology & Version Requirements

| Component | Technology | Version |
|-----------|-----------|---------|
| Firmware | C (STM32CubeIDE) | STM32 F446RE |
| Hardware Bridge | Python | 3.11 |
| Blockchain | Hyperledger Fabric | 2.x |
| Chaincode | Go | 1.21 |
| Backend | Node.js + TypeScript | Node 20, ES2022 |
| NLP | Python + Flask | 3.11 |
| Frontend | React + Vite + TailwindCSS 3 | React 18 |
| Graph DB | Neo4j Community | 5.x |
| IPFS | Kubo | 0.27.0 |
| Docker Compose | Docker | 3.8 format |

---

## Coding Standards Per Language

### TypeScript (Backend + Frontend)
- Strict mode enabled in `tsconfig.json`
- Use Zod for runtime validation of ALL external inputs (env vars, request bodies, API responses)
- Use typed errors — never throw raw strings: `throw new DecryptionError("message")`
- Winston logger for all backend logging — **never use `console.log`**
- Always `await` async operations — no fire-and-forget except `nlpTriggerService`

### Python (NLP + Bridge)
- Type hints on ALL function signatures
- Pydantic `BaseSettings` for env var loading (NLP), `python-dotenv` for bridge
- Dataclasses for all data models (`Entity`, `Triple`, `RiskResult`, `ParsedPacket`)
- pytest for all tests
- Never concatenate strings into Cypher queries — always use parameterized queries

### Go (Chaincode)
- Use `contractapi` framework
- All functions return `error`
- JSON struct tags on all fields
- Reject empty string arguments explicitly
- Use `MERGE` not `CREATE` for composite keys

### C (Firmware)
- HAL library only — no bare-metal register access
- All peripheral functions return `HAL_StatusTypeDef`
- `__attribute__((packed))` on all wire-format structs
- Error_Handler() must never return — infinite loop with buzzer_fail()

---

## Security Rules — MANDATORY

1. **AES-256-GCM** for file encryption — random 12-byte IV per operation, verify auth tag on decrypt
2. **SHA-256** for document hashing — lowercase hex output
3. **JWT HS256** for auth — never RS256 (no PKI infrastructure)
4. **CRC-16/CCITT** for UART — poly 0x1021, init 0xFFFF
5. **Rate limiting** — 100 req/15min global, 20 req/15min for auth endpoints
6. **Input sanitization** — DOMPurify on all string inputs in backend
7. **Parameterized queries** — NEVER concatenate user input into Cypher or SQL
8. **Redact secrets in logs** — Winston must filter out JWT_SECRET and AES_KEY

---

## Neo4j Schema — DO NOT MODIFY WITHOUT UPDATING ALL CONSUMERS

### Node Labels (6 total)
`Person`, `Property`, `Document`, `Court`, `LegalAct`, `Organisation`

### Relationship Types (7 total)
`OWNS`, `REFERENCES`, `INVOLVES`, `CONCERNS`, `ISSUED`, `DISPUTES`, `SUPERSEDES`

### Critical Constraints
```cypher
-- NEVER remove or rename these constraints
CREATE CONSTRAINT document_hash IF NOT EXISTS FOR (d:Document) REQUIRE d.hash IS UNIQUE;
CREATE CONSTRAINT property_id IF NOT EXISTS FOR (pr:Property) REQUIRE pr.id IS UNIQUE;
CREATE CONSTRAINT person_name_id IF NOT EXISTS FOR (p:Person) REQUIRE (p.name, p.id) IS UNIQUE;
```

Use `MERGE` (not `CREATE`) for all graph inserts to prevent duplicates.

---

## Environment Variables Convention

- Backend: `backend/.env` — 18 vars (see `planning/plan_05_06_env_db.md`)
- NLP: `nlp/.env` — 9 vars
- Bridge: `hardware-bridge/.env` — 7 vars
- Frontend: `frontend/.env` — 3 vars (all prefixed `VITE_`)
- **JWT_SECRET must be identical** across backend and hardware-bridge
- Every service MUST have a `.env.example` with descriptions

---

## Testing Requirements

| Module | Framework | Minimum Coverage |
|--------|-----------|-----------------|
| Hardware Bridge | pytest | CRC, packet parsing, JWT generation, full bridge flow |
| Chaincode | Go testing + shimtest mock | All 8 functions with edge cases |
| Backend | Jest + ts-jest | All services unit tested + document flow integration test |
| NLP | pytest | OCR, NER, relation extraction, conflict scoring, graph insert |
| Frontend | Vitest + React Testing Library | LoginPage + VerifyPage |

**Never skip tests for services that cross module boundaries.**

---

## Common Pitfalls — READ BEFORE CODING

| Pitfall | Prevention |
|---------|-----------|
| Fabric network won't start | Use `fabric-samples/test-network` as base — never build from scratch |
| D3.js fights React DOM | Use "D3 for math, React for rendering" pattern — D3 computes positions, React renders SVG |
| CRC mismatch firmware↔bridge | Test with identical byte sequences on both sides FIRST |
| Legal-BERT fine-tuning too complex | Fall back to spaCy `EntityRuler` with regex patterns |
| Virtual serial ports on Windows | Use TCP socket mode (`--tcp` flag) instead |
| Neo4j composite constraints fail | Use Community Edition 5.x — check CE limitations |
| NLP blocks document registration | NLP trigger is fire-and-forget — backend must not await NLP completion |

---

## Demo Users (Hardcoded — Acceptable for Student Project)

| Username | Password | Role |
|----------|----------|------|
| `admin` | `admin123` | admin |
| `registrar` | `reg456` | registrar |
| `clerk` | `clerk789` | clerk |

---

## Port Assignments

| Service | Port |
|---------|------|
| Backend (Express + Apollo) | 4000 |
| Frontend (Vite dev server) | 3000 |
| NLP (Flask) | 5500 |
| Neo4j Browser | 7474 |
| Neo4j Bolt | 7687 |
| IPFS API | 5001 |
| IPFS Gateway | 8080 |
| STM32 Simulator (TCP mode) | 9600 |

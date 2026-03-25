# Section 8 — Testing Plan

[← Back to Index](file:///C:/Users/sbrbs/.gemini/antigravity/brain/aa37d9b8-3977-4d6d-bd30-54083b104657/implementation_plan.md)

---

## Firmware (`firmware/`) — Manual Testing Only

No automated unit tests (CubeIDE does not support test frameworks easily).

| Test | Method | Expected |
|------|--------|----------|
| Fingerprint capture | Place enrolled finger on sensor | OLED shows "Match: XX", buzzer beeps 2× short |
| No finger timeout | Wait 10s without placing finger | OLED shows "TIMEOUT" |
| Wrong finger | Place un-enrolled finger | OLED shows "NO MATCH", buzzer 1× long |
| UART packet TX | Monitor UART with logic analyser or Python bridge | 16-byte packet with valid CRC-16 |
| ACK handling | Bridge responds with 0x01 / 0xFF | OLED shows "AUTH OK" / "AUTH FAIL" |

---

## Hardware Bridge (`hardware-bridge/`) — pytest

### Unit Tests

| File | Test Case | Mock/Stub |
|------|-----------|-----------|
| `test_crc16.py` | `test_known_vector` — CRC of `b'\x01\x02\x03\x04'` matches precomputed value | None |
| `test_crc16.py` | `test_empty_input` — CRC of `b''` returns 0xFFFF (init value) | None |
| `test_crc16.py` | `test_matches_firmware` — CRC matches value from C implementation on same data | None |
| `test_packet_parser.py` | `test_valid_packet` — 16-byte valid packet parses correctly | None |
| `test_packet_parser.py` | `test_truncated_packet` — < 16 bytes raises `ValueError` | None |
| `test_packet_parser.py` | `test_bad_crc` — packet with wrong CRC → `validate_packet` returns `(False, "CRC mismatch")` | None |
| `test_packet_parser.py` | `test_stale_timestamp` — timestamp 60s old → `(False, "Timestamp too old")` | `time.time` patched |
| `test_packet_parser.py` | `test_low_score` — score=30 → `(False, "Score below threshold")` | None |
| `test_jwt_generator.py` | `test_jwt_fields` — generated JWT contains `device_id`, `finger_score`, `iss`, `exp` | None |
| `test_jwt_generator.py` | `test_jwt_expiry` — token expires after 5 minutes | `time.time` patched |
| `test_bridge.py` | `test_full_flow_success` — valid packet → JWT → 200 response → 0x01 ACK | `serial.Serial` mocked, `requests.post` mocked |
| `test_bridge.py` | `test_api_failure` — valid packet → JWT → 500 response → 0xFF ACK | `serial.Serial` mocked, `requests.post` returns 500 |
| `test_bridge.py` | `test_serial_timeout` — no data on port → skip, no crash | `serial.Serial.read` returns `b''` |

---

## Blockchain Chaincode (`blockchain/chaincode/`) — Go testing

### Unit Tests (`contract_test.go`)

| Test Case | Setup | Expected |
|-----------|-------|----------|
| `TestStoreDocument_Success` | Empty ledger | Document stored, GetState returns it |
| `TestStoreDocument_Duplicate` | Store doc, then store same hash | Second store returns error "document already exists" |
| `TestGetDocument_Exists` | Store doc | Returns correct `DocumentRecord` |
| `TestGetDocument_NotFound` | Empty ledger | Returns nil, no error |
| `TestTransferDocument_Success` | Store doc with no dispute | Owner updated |
| `TestTransferDocument_BlockedByDispute` | Store + AddDispute | Returns error "document has active dispute" |
| `TestAddDispute_Success` | Store doc | `activeDispute=true`, DisputeRecord created |
| `TestResolveDispute_Success` | Store + AddDispute | `activeDispute=false`, DisputeRecord resolved |
| `TestGetDocumentHistory` | Store + Transfer + AddDispute | History has 3 entries |
| `TestGetDocumentsByOwner` | Store 3 docs, 2 owned by same person | Returns 2 documents |
| `TestVerifyDocument_Exists` | Store doc | Returns "EXISTS" |
| `TestVerifyDocument_NotFound` | Empty | Returns "NOT_FOUND" |

**Mock**: `shimtest.NewMockStub("lexnet-cc", new(LexNetContract))` — Fabric's testing package.

---

## Backend (`backend/`) — Jest + ts-jest

### Unit Tests

| File | Test Case | Mock |
|------|-----------|------|
| `encryptionService.test.ts` | `encrypt_decrypt_roundtrip` — encrypt buffer, decrypt, compare | None |
| `encryptionService.test.ts` | `wrong_key_fails` — decrypt with different key throws | None |
| `encryptionService.test.ts` | `corrupted_ciphertext` — modified bytes throws auth tag error | None |
| `encryptionService.test.ts` | `empty_buffer` — encrypts/decrypts empty buffer | None |
| `hashService.test.ts` | `known_sha256` — hash of "hello" matches known digest | None |
| `hashService.test.ts` | `empty_input` — hash of empty buffer is correct | None |
| `qrService.test.ts` | `generate_valid_qr` — generates PNG buffer, decode matches input | None |
| `fabricService.test.ts` | `storeDocument_success` — mock contract.submitTransaction resolves | `fabric-network` Contract mocked |
| `fabricService.test.ts` | `getDocument_notFound` — mock returns empty bytes | Contract mocked |
| `fabricService.test.ts` | `endorsement_failure` — mock rejects with Fabric error | Contract mocked |
| `auth.test.ts` | `valid_jwt` — middleware sets `req.user`, calls `next()` | None |
| `auth.test.ts` | `expired_jwt` — middleware returns 401 | None |
| `auth.test.ts` | `missing_header` — middleware returns 401 | None |
| `auth.test.ts` | `tampered_jwt` — middleware returns 401 | None |

### Integration Tests

| File | Test Case | Setup |
|------|-----------|-------|
| `documentFlow.test.ts` | `register_then_verify` — upload file → register → verify returns AUTHENTIC | Fabric + IPFS mocked as in-memory stores |
| `documentFlow.test.ts` | `verify_tampered` — register, modify IPFS content, verify returns TAMPERED | IPFS mock returns different bytes |
| `documentFlow.test.ts` | `verify_not_registered` — verify unknown hash returns NOT_REGISTERED | Empty Fabric mock |
| `graphqlEndpoints.test.ts` | All queries and mutations via Apollo test client | All services mocked |

---

## NLP Pipeline (`nlp/`) — pytest

### Unit Tests

| File | Test Case | Mock |
|------|-----------|------|
| `test_ocr.py` | `test_native_pdf` — extract text from text-based PDF | None (test fixture: `data/sample-documents/`) |
| `test_ocr.py` | `test_scanned_pdf` — OCR on known scanned page, check key phrases exist | Tesseract must be installed |
| `test_ocr.py` | `test_encrypted_pdf` — raises `EncryptedPDFError` | None |
| `test_ner.py` | `test_person_extraction` — "Ram Kumar sold property" → `Entity(text="Ram Kumar", label="PERSON")` | Model loaded |
| `test_ner.py` | `test_property_id` — "Sy.No.123/4" → `Entity(text="Sy.No.123/4", label="PROPERTY_ID")` | Model loaded |
| `test_ner.py` | `test_empty_text` — returns `[]` | None |
| `test_rel_extract.py` | `test_ownership_relation` — entities + text → OWNS triple | spaCy loaded |
| `test_rel_extract.py` | `test_no_relations` — unrelated entities → `[]` | None |
| `test_conflict.py` | `test_high_risk` — rapid transfers → score > 70 | Model loaded or rule-based fallback |
| `test_conflict.py` | `test_low_risk` — normal metadata → score < 30 | Model loaded |
| `test_graph_insert.py` | `test_cypher_generation` — triples produce correct MERGE statements | Neo4j driver mocked |
| `test_graph_insert.py` | `test_empty_triples` — returns 0 | Neo4j mocked |

---

## Frontend (`frontend/`) — Vitest + React Testing Library

| File | Test Case | Mock |
|------|-----------|------|
| `LoginPage.test.tsx` | Renders login form with username, password, submit | None |
| `LoginPage.test.tsx` | Empty submit shows validation error | None |
| `LoginPage.test.tsx` | Successful login stores token, redirects | `login` mutation mocked |
| `LoginPage.test.tsx` | Failed login shows error message | Mutation returns error |
| `VerifyPage.test.tsx` | Renders hash input and submit | None |
| `VerifyPage.test.tsx` | Valid hash shows AUTHENTIC result | `verifyDocument` query mocked |
| `VerifyPage.test.tsx` | Tampered shows red TAMPERED badge | Query mocked |
| `VerifyPage.test.tsx` | Invalid hash format shows validation error | None |

# LexNet — Phase-Wise Implementation Plan (Per Module)

> Each module is broken down into internal phases with concrete files, functions, and "done" criteria.
> Use this alongside [`BUILD_ORDER.md`](file:///d:/LexNet/BUILD_ORDER.md) to know **which module to start first**.

---

## Module 1 — Firmware (`firmware/`)

> **Tech**: C (STM32CubeIDE), STM32 F446RE, R307 fingerprint sensor, SSD1306 OLED, buzzer
> **Total files**: ~12 | **Estimated effort**: 20-25 hours

### Phase F1 — Project Setup + CRC (2-3 hrs)
| File | What to do |
|------|------------|
| `lexnet-firmware.ioc` | Open STM32CubeMX → configure USART2 (57600 8N1), I2C1 (400kHz), GPIO pins for buzzer. Generate HAL code |
| `Inc/main.h` | Define pin macros (`FP_UART`, `OLED_I2C`, `BUZZER_PIN`), constants (`SCORE_THRESHOLD=60`, `UART_TIMEOUT=500`), function prototypes |
| `Inc/crc16.h` | Prototype: `uint16_t crc16_ccitt(const uint8_t *data, uint16_t len)` |
| `Src/crc16.c` | CRC-16/CCITT lookup table (poly 0x1021, init 0xFFFF). **This MUST match** the Python bridge's CRC — test with the same byte sequence |

**✅ Done when**: CRC function compiles, produces correct output for known test vectors.

---

### Phase F2 — Peripheral Drivers (5-7 hrs)
| File | What to do |
|------|------------|
| `Inc/oled.h` + `Src/oled.c` | SSD1306 I2C driver: `oled_init()`, `oled_clear()`, `oled_print(text)`, `oled_print_line(line, text)`. Include 5×7 font table |
| `Inc/fingerprint.h` + `Src/fingerprint.c` | R307 UART1 driver: `fp_init(huart)`, `fp_capture()`, `fp_match(&score)`, `fp_get_score(&score)`. Handle 10s capture timeout |
| `Inc/buzzer.h` + `Src/buzzer.c` | GPIO buzz: `buzzer_success()` (2×100ms beep), `buzzer_fail()` (1×500ms beep) |

**✅ Done when**: Each peripheral works independently — OLED shows text, fingerprint captures and matches, buzzer beeps.

---

### Phase F3 — UART Comms + Packet (3-4 hrs)
| File | What to do |
|------|------------|
| `Inc/uart_comm.h` + `Src/uart_comm.c` | Define `AuthPacket` struct (16 bytes packed: device_id[4] + score[2] + timestamp[8] + crc16[2]). Functions: `send_auth_packet(huart, score)`, `receive_ack(huart)` returning 0x01/0xFF/0x00 |

**✅ Done when**: Can see 16-byte packets on logic analyser / serial monitor with valid CRC.

---

### Phase F4 — Main Loop Integration (3-4 hrs)
| File | What to do |
|------|------------|
| `Src/main.c` | HAL init → peripheral init → super-loop: display "Place finger" → capture → match → if match: build packet, send, wait ACK, display result + buzzer. 500ms delay between scans |

**✅ Done when**: Full demo works — finger scan → OLED feedback → UART packet sent → ACK received → buzzer confirmation. Test with the Hardware Bridge simulator.

---

### Phase F5 — Edge Cases + Polish (2-3 hrs)
- UART TX timeout → retry 3x before "COMM ERROR"
- Fingerprint sensor not responding → "SENSOR ERR" + infinite retry
- Buffer overflow protection on UART RX
- `Error_Handler()` → infinite loop with `buzzer_fail()`

**✅ Done when**: All error scenarios produce correct OLED messages and buzzer patterns.

---
---

## Module 2 — Hardware Bridge (`hardware-bridge/`)

> **Tech**: Python 3.11, pyserial, PyJWT, requests
> **Total files**: ~12 | **Estimated effort**: 12-15 hours

### Phase HB1 — Config + CRC + Parser (3-4 hrs)
| File | What to do |
|------|------------|
| `requirements.txt` | `pyserial`, `pyjwt`, `requests`, `python-dotenv`, `pytest` |
| `.env` + `.env.example` | `SERIAL_PORT`, `BAUD_RATE=57600`, `JWT_SECRET`, `API_URL` |
| `src/__init__.py` | Empty |
| `src/config.py` | Load env vars with `dotenv` |
| `src/crc16.py` | `compute_crc16(data: bytes) → int`, `validate_crc16(packet: bytes) → bool`. **Must match firmware CRC exactly** |
| `src/packet_parser.py` | `ParsedPacket` dataclass + `parse_packet(raw)` using `struct.unpack('<4sHQH')` + `validate_packet(pkt)` checks: CRC valid, score≥60, timestamp fresh≤30s |
| `tests/test_crc16.py` | Known vectors, empty input, cross-check with C output |
| `tests/test_packet_parser.py` | Valid packet, truncated, bad CRC, stale timestamp, low score |

**✅ Done when**: All pytest tests pass for CRC and parser.

---

### Phase HB2 — UART Reader + Simulator (2-3 hrs)
| File | What to do |
|------|------------|
| `src/uart_reader.py` | `read_packet(ser, timeout=2.0) → Optional[bytes]` — reads exactly 16 bytes, flushes input first |
| `simulator/stm32_simulator.py` | Sends fake 16-byte packets over virtual serial. Supports `--tcp` flag for TCP socket fallback (avoids Windows COM port issues). Generates valid packets + optionally bad CRC/low score packets |

**✅ Done when**: Simulator sends packets, `uart_reader` receives and prints them.

> **💡 Tip**: On Windows, use `com0com` for virtual serial pairs, OR just use `--tcp` mode with `localhost:9600`.

---

### Phase HB3 — JWT + API Client (2-3 hrs)
| File | What to do |
|------|------------|
| `src/jwt_generator.py` | `generate_hardware_jwt(device_id, finger_score, secret) → str`. Payload: `{device_id, finger_score, iat, exp: iat+300, iss: "lexnet-bridge"}`, HS256 |
| `src/api_client.py` | `post_hardware_auth(api_url, token) → (bool, status_code)`. POST with Bearer token, 5s timeout |
| `tests/test_jwt_generator.py` | Verify JWT fields, expiry at 5 minutes |

**✅ Done when**: JWT generator creates valid tokens, API client handles connection refused / 401 / 5xx gracefully.

---

### Phase HB4 — Main Bridge Loop (3-4 hrs)
| File | What to do |
|------|------------|
| `src/bridge.py` | `main()` → opens serial → loops `process_one_packet()`: read → parse → validate CRC → check score → check timestamp → generate JWT → POST to API → send ACK byte (0x01 or 0xFF) |
| `tests/test_bridge.py` | Full flow with mocked serial + mocked HTTP: success/failure/timeout scenarios |

**✅ Done when**: Bridge + simulator runs end-to-end. Packets are validated, JWTs are sent, ACKs are returned.

---
---

## Module 3 — Blockchain (`blockchain/`)

> **Tech**: Go 1.21, Hyperledger Fabric 2.x, Docker
> **Total files**: ~12 | **Estimated effort**: 25-30 hours (Fabric setup is the hardest part)

### Phase BC1 — Network Setup (8-12 hrs ⚠️)
| File | What to do |
|------|------------|
| `network/configtx.yaml` | 2 orgs: `GovtOrg`, `VerifierOrg`. 1 channel: `lexnet-channel`. Endorsement: `AND('GovtOrg.member')` for writes |
| `network/crypto-config.yaml` | Crypto material for both orgs |
| `network/docker-compose-fabric.yaml` | Peer, orderer, CA containers |
| `network/scripts/generate-crypto.sh` | Runs `cryptogen` + `configtxgen` |
| `network/scripts/setup-network.sh` | Create channel → join peers → install chaincode |
| `network/scripts/teardown-network.sh` | Stop containers, remove volumes + crypto |

> **⚠️ CRITICAL**: **Don't build from scratch**. Clone `fabric-samples/test-network`, copy its docker-compose and scripts, then modify `configtx.yaml` for LexNet orgs. Budget 10+ hours just for this.

**✅ Done when**: `setup-network.sh` runs → peers join channel → `peer lifecycle` commands succeed.

---

### Phase BC2 — Chaincode Models + Entry Point (2-3 hrs)
| File | What to do |
|------|------------|
| `chaincode/lexnet-cc/go.mod` | Module definition, import `contractapi` |
| `chaincode/lexnet-cc/models.go` | `DocumentRecord` struct (11 fields) and `DisputeRecord` struct (6 fields) with JSON tags |
| `chaincode/lexnet-cc/main.go` | Register `LexNetContract`, call `cc.Start()` |

**✅ Done when**: `go build` succeeds, structs marshal/unmarshal correctly.

---

### Phase BC3 — Smart Contract Functions (5-7 hrs)
| File | What to do |
|------|------------|
| `chaincode/lexnet-cc/contract.go` | All 8 functions: `StoreDocument`, `GetDocument`, `GetDocumentHistory`, `TransferDocument`, `AddDispute`, `ResolveDispute`, `GetDocumentsByOwner`, `VerifyDocument` |

Key implementation notes:
- `StoreDocument` → check docHash not duplicate → PutState
- `TransferDocument` → check `activeDispute==false` before allowing
- `AddDispute/ResolveDispute` → use composite key `DISPUTE_{caseId}_{docHash}`
- `GetDocumentsByOwner` → uses composite key index `owner~docHash`

**✅ Done when**: All functions compile and handle edge cases (empty strings, duplicates, dispute blocks).

---

### Phase BC4 — Testing + Deployment (3-4 hrs)
| File | What to do |
|------|------------|
| `chaincode/lexnet-cc/contract_test.go` | 12 test cases using `shimtest.NewMockStub`: store+get, duplicate rejection, transfer blocked by dispute, dispute lifecycle, history, owner query, verify status |

**✅ Done when**: All Go tests pass. Chaincode deployed to test network. Smoke test via `peer chaincode invoke` succeeds.

---
---

## Module 4 — Backend (`backend/`)

> **Tech**: Node.js 20, TypeScript, Express, Apollo Server, Fabric SDK, neo4j-driver
> **Total files**: ~30 | **Estimated effort**: 40-50 hours (this is the central hub)

### Phase BE1 — Project Scaffold + Config (3-4 hrs)
| File | What to do |
|------|------------|
| `package.json` | Dependencies: express, apollo-server-express, fabric-network, neo4j-driver, jsonwebtoken, multer, qrcode, uuid, zod, winston, express-rate-limit, pdf-lib, dompurify, crypto |
| `tsconfig.json` | Strict mode, ES2022 target |
| `.env` + `.env.example` | All 18 env vars (see planning/plan_05_06_env_db.md) |
| `src/config/env.ts` | Zod schema validation: throws with clear error if any var missing/invalid |
| `src/config/logger.ts` | Winston: JSON format, console + file transports, redacts secrets |
| `src/types/index.ts` | TypeScript interfaces: `DocumentRecord`, `VerificationResult`, `GraphData`, `GraphNode`, `GraphEdge`, etc. |
| `src/utils/constants.ts` | Magic numbers, key lengths, default timeouts |

**✅ Done when**: `npm run build` compiles. Config loader validates env vars correctly.

---

### Phase BE2 — Core Services (Encryption + Hash + IPFS) (5-7 hrs)
| File | What to do |
|------|------------|
| `src/services/encryptionService.ts` | AES-256-GCM `encrypt(buffer, keyHex)` → {ciphertext, iv, authTag}; `decrypt(...)` → buffer. Edge cases: wrong key → DecryptionError, empty buffer → return empty |
| `src/services/hashService.ts` | `computeSHA256(buffer)` → hex string. `computeSHA256FromStream(stream)` for large files |
| `src/services/ipfsService.ts` | `uploadToIPFS(buffer)` → CID (pins it). `retrieveFromIPFS(cid)` → buffer. 30s timeout. Reject >50MB |
| `tests/unit/encryptionService.test.ts` | Roundtrip, wrong key, corrupted ciphertext, empty buffer |
| `tests/unit/hashService.test.ts` | Known SHA-256 vectors, empty input |

**✅ Done when**: Encrypt→decrypt roundtrip works. IPFS upload→retrieve works against running Kubo instance.

---

### Phase BE3 — Fabric + Neo4j Services (5-7 hrs)
| File | What to do |
|------|------------|
| `src/config/fabric.ts` | `connectToFabric()` → loads connection profile, creates wallet, returns contract handle. Retry 3x with 2s backoff |
| `src/services/fabricService.ts` | 8 wrapper functions matching chaincode: `storeDocument`, `getDocument`, `getDocumentHistory`, `transferDocument`, `addDispute`, `resolveDispute`, `getDocumentsByOwner`, `verifyDocument`. Maps Fabric errors to typed errors |
| `src/services/neo4jService.ts` | `runCypher<T>()`, `getKnowledgeGraph(docHash, depth)`, `searchNodes(query)`, `getPropertyTimeline(propertyId)`, `close()`. Always parameterized queries |
| `tests/unit/fabricService.test.ts` | Mocked contract calls: success, not found, endorsement failure |

**✅ Done when**: Can submit/evaluate transactions against running Fabric. Can query Neo4j.

---

### Phase BE4 — Middleware + Auth (3-4 hrs)
| File | What to do |
|------|------------|
| `src/middleware/auth.ts` | JWT verification middleware: extract Bearer → verify HS256 → attach `req.user`. 401 on failure |
| `src/middleware/rateLimiter.ts` | 100 req/15min global, 20 req/15min for auth endpoints |
| `src/middleware/errorHandler.ts` | Maps error classes → HTTP status codes. No stack traces in prod |
| `src/middleware/inputSanitizer.ts` | DOMPurify on req.body/query/params |
| `tests/unit/auth.test.ts` | Valid JWT, expired, missing header, tampered |

**✅ Done when**: Auth middleware correctly blocks/passes requests. Rate limiter works.

---

### Phase BE5 — REST Controllers (3-4 hrs)
| File | What to do |
|------|------------|
| `src/rest/routes.ts` | Router: `POST /api/auth/hardware`, `POST /api/auth/login`, `GET /api/verify/:hash`, `GET /api/health`, `GET /api/documents/:hash/pdf` |
| `src/rest/hardwareAuthController.ts` | Verify bridge JWT (check `iss === "lexnet-bridge"`, score≥60) → issue session JWT (1h expiry, role: "official") |
| `src/rest/verifyController.ts` | Public endpoint: Fabric verify → IPFS retrieve → decrypt → recompute SHA-256 → compare → return AUTHENTIC/TAMPERED/NOT_REGISTERED |

**✅ Done when**: `/api/health` returns status. Verify endpoint handles all 4 status cases.

---

### Phase BE6 — QR + PDF + NLP Trigger (3-4 hrs)
| File | What to do |
|------|------------|
| `src/services/qrService.ts` | `generateQR(data)` → PNG buffer. Data: `{VERIFICATION_BASE_URL}/verify/{docHash}` |
| `src/services/pdfService.ts` | `embedQRInPDF(originalPdf, qrPng)` → new PDF with QR page appended (pdf-lib) |
| `src/services/nlpTriggerService.ts` | Fire-and-forget HTTP POST to NLP service. Log errors but never throw (NLP failure must not block registration) |
| `tests/unit/qrService.test.ts` | Generate QR, decode it, verify content matches |

**✅ Done when**: QR generation works. PDF embedding works. NLP trigger sends POST correctly.

---

### Phase BE7 — GraphQL Layer (5-7 hrs)
| File | What to do |
|------|------------|
| `src/graphql/schema.ts` | Full SDL with all types, queries, mutations (see planning docs for complete schema) |
| `src/graphql/directives/authDirective.ts` | `@auth` directive → checks `context.user` exists |
| `src/graphql/resolvers/index.ts` | Aggregates all resolver maps |
| `src/graphql/resolvers/documentResolvers.ts` | `registerDocument` (full pipeline: hash → encrypt → IPFS → Fabric → QR → PDF → NLP), `getDocument`, `verifyDocument`, `getDocumentHistory` |
| `src/graphql/resolvers/graphResolvers.ts` | `getKnowledgeGraph`, `searchNodes` (read-only, no auth) |
| `src/graphql/resolvers/conflictResolvers.ts` | `getConflicts`, `getRiskScore`, `getFlaggedDocuments` |
| `src/graphql/resolvers/authResolvers.ts` | `login` — hardcoded demo users: admin/admin123, registrar/reg456, clerk/clerk789 |
| `src/graphql/resolvers/timelineResolvers.ts` | `getPropertyTimeline`, `getDocumentEvents` |
| `src/utils/validators.ts` | Zod schemas for all request payloads |

**✅ Done when**: All GraphQL queries and mutations work via Apollo Sandbox/Playground.

---

### Phase BE8 — Server Bootstrap + Integration Tests (4-5 hrs)
| File | What to do |
|------|------------|
| `src/index.ts` | Express + Apollo server bootstrap. Register all middleware, routes, GraphQL. Start server on `PORT` |
| `tests/integration/documentFlow.test.ts` | Full register→verify cycle (Fabric/IPFS mocked in-memory) |
| `tests/integration/graphqlEndpoints.test.ts` | All queries/mutations via Apollo test client |
| `tests/jest.config.ts` | Jest + ts-jest configuration |

**✅ Done when**: Server starts. All unit + integration tests pass.

---
---

## Module 5 — NLP Pipeline (`nlp/`)

> **Tech**: Python 3.11, Flask, transformers (Legal-BERT), spaCy, Tesseract, XGBoost, neo4j
> **Total files**: ~20 | **Estimated effort**: 25-30 hours

### Phase NLP1 — Setup + OCR (4-5 hrs)
| File | What to do |
|------|------------|
| `requirements.txt` | transformers, spacy, pytesseract, scikit-learn, xgboost, neo4j, Pillow, pypdf, reportlab, flask, pydantic, pytest |
| `setup.py` | Package definition for `lexnet-nlp` |
| `.env` + `.env.example` | 9 env vars (Flask port, Neo4j, Tesseract path, model paths) |
| `src/__init__.py`, `src/config.py` | Package init + pydantic BaseSettings env loader |
| `scripts/download_models.py` | Download Legal-BERT + `spacy download en_core_web_sm` |
| `src/pipeline/ocr.py` | `extract_text_from_pdf(pdf_path)`: try pypdf first → if <50 chars, run Tesseract OCR → concatenate pages |
| `tests/test_ocr.py` | Test with native PDF fixture + scanned PDF + encrypted PDF error |

**✅ Done when**: OCR extracts text from both native and scanned PDFs.

---

### Phase NLP2 — NER (Named Entity Recognition) (5-7 hrs)
| File | What to do |
|------|------------|
| `src/models/entity.py` | `Entity` dataclass: text, label, start, end, confidence |
| `data/ner_labels.json` | Custom label map: PERSON, PROPERTY_ID, SURVEY_NUMBER, DATE, MONETARY_VALUE, JURISDICTION, LEGAL_SECTION, ORGANISATION |
| `src/pipeline/ner.py` | `extract_entities(text)` → List[Entity]. Use Legal-BERT OR spaCy EntityRuler with regex patterns as fallback. Sliding window for >512 tokens. Filter confidence <0.5 |
| `tests/test_ner.py` | "Ram Kumar sold property" → PERSON entity. "Sy.No.123/4" → PROPERTY_ID. Empty text → [] |

> **💡 Fallback**: If Legal-BERT fine-tuning is too hard, use spaCy `EntityRuler` with regex patterns (70-80% accuracy is fine for demo).

**✅ Done when**: NER extracts at least PERSON, PROPERTY_ID, DATE from test text.

---

### Phase NLP3 — Relation Extraction + Data Models (4-5 hrs)
| File | What to do |
|------|------------|
| `src/models/triple.py` | `Triple` dataclass: subject, predicate, object_, source_span |
| `src/models/risk.py` | `RiskResult` dataclass: score, flags[], explanation |
| `src/pipeline/rel_extract.py` | `extract_relations(text, entities)` → List[Triple]. Rule-based: PERSON+owns+PROPERTY → OWNS triple, etc. Window-based co-occurrence (50 tokens) → INVOLVES relation |
| `src/utils/text_clean.py` | Normalise unicode, strip headers/footers, fix OCR artefacts |
| `tests/test_rel_extract.py` | Test ownership relation, no-relations case |

**✅ Done when**: Given entities + text, produces correct triples for ownership, references, involvement.

---

### Phase NLP4 — Neo4j Graph Insert (3-4 hrs)
| File | What to do |
|------|------------|
| `src/utils/neo4j_driver.py` | Driver singleton: `get_driver()`, `run_query()` |
| `src/pipeline/graph_insert.py` | `insert_triples(triples, doc_hash)` → int. MERGE nodes by unique property (name/ID/hash) → MERGE relationships. All in single transaction |
| `tests/test_graph_insert.py` | Verify correct Cypher MERGE statements. Empty triples → 0 |

**✅ Done when**: Triples are inserted into Neo4j as nodes + relationships. No duplicates on re-run (MERGE behaviour).

---

### Phase NLP5 — Conflict Detection (4-5 hrs)
| File | What to do |
|------|------------|
| `src/pipeline/conflict.py` | `compute_risk_score(doc_hash, metadata, graph_features)` → RiskResult. Feature extraction → XGBoost predict → rule-based flags (RAPID_TRANSFER, INVALID_REFERENCE, OWNERSHIP_CONFLICT) → combined score `max(xgboost, rules)` |
| `scripts/train_conflict_model.py` | Train XGBoost on synthetic CSV (500 rows), save to `data/conflict_model.pkl` |
| `data/scripts/generate_conflict_data.py` | Generate synthetic training data |
| `tests/test_conflict.py` | High risk scenario → score>70. Normal scenario → score<30 |

**✅ Done when**: Conflict detection returns scores + flags. Falls back to rule-based if model file missing.

---

### Phase NLP6 — Flask Server + End-to-End (3-4 hrs)
| File | What to do |
|------|------------|
| `src/app.py` | Flask server: `POST /nlp/process` (runs full pipeline: OCR→NER→Relations→Graph→Conflict), `GET /nlp/health`. Preload models on startup. 120s timeout |

**✅ Done when**: POST to `/nlp/process` with a docHash + IPFS CID → processes doc → inserts into Neo4j → returns risk score.

---
---

## Module 6 — Frontend (`frontend/`)

> **Tech**: React 18, TypeScript, Vite, TailwindCSS, Apollo Client, D3.js
> **Total files**: ~30 | **Estimated effort**: 30-35 hours

### Phase FE1 — Scaffold + Auth (4-5 hrs)
| File | What to do |
|------|------------|
| Scaffold | `npx create-vite@latest ./ --template react-ts` |
| `package.json` | Add: react-router-dom, @apollo/client, d3, tailwindcss, axios, qrcode.react, lucide-react, jsQR |
| `tailwind.config.js` | Custom LexNet theme colours |
| `postcss.config.js` | tailwind + autoprefixer |
| `src/index.css` | Tailwind imports + global styles |
| `src/context/AuthContext.tsx` | State: token, user, isAuthenticated. Functions: login, logout, getToken. On mount: check localStorage |
| `src/hooks/useAuth.ts` | Auth context hook |
| `src/apollo/client.ts` | Apollo Client with httpLink + auth link (Bearer token) + error link (401 → auto-logout) |
| `src/utils/constants.ts` | API base URL, graph colours, risk thresholds |

**✅ Done when**: Vite dev server runs. Apollo Client connects to backend.

---

### Phase FE2 — Login + Navigation (3-4 hrs)
| File | What to do |
|------|------------|
| `src/pages/LoginPage.tsx` | Username + password form. Submit → login mutation → store JWT |
| `src/components/Navbar.tsx` | Top nav: links, auth status, logout button |
| `src/components/Sidebar.tsx` | Side nav for official dashboard |
| `src/components/ProtectedRoute.tsx` | Redirect to /login if no valid JWT |
| `src/App.tsx` | All routes: /login, /dashboard, /register, /graph, /verify, /conflicts, /timeline/:id, /document/:hash |
| `src/main.tsx` | ApolloProvider → BrowserRouter → AuthProvider → App |
| `src/graphql/queries.ts` | All GQL query strings |
| `src/graphql/mutations.ts` | All GQL mutation strings |

**✅ Done when**: Login works. Protected routes redirect. Navigation works between pages.

---

### Phase FE3 — Verification Page (Public) (3-4 hrs)
| File | What to do |
|------|------------|
| `src/pages/VerifyPage.tsx` | Two input methods: paste hash OR upload QR image (decoded with jsQR). Calls verifyDocument query. Pre-fill from URL param `/verify/:hash` |
| `src/components/VerificationResult.tsx` | Badge: green AUTHENTIC / red TAMPERED / grey NOT REGISTERED. Shows doc metadata + ownership graph snippet |
| `tests/VerifyPage.test.tsx` | Render, hash input, mocked query results |

**✅ Done when**: User can verify a document by hash or QR code. Shows correct status badge.

---

### Phase FE4 — Document Registration (4-5 hrs)
| File | What to do |
|------|------------|
| `src/pages/RegisterPage.tsx` | Form: file upload, docType, ownerId, metadata. Fingerprint auth flow: click Authenticate → poll status → on success → send registerDocument mutation → show QR |
| `src/components/FileUpload.tsx` | Drag-and-drop with progress bar. Reject >50MB client-side |
| `src/components/FingerprintStatus.tsx` | STM32 auth status indicator: waiting/success/fail with animation |
| `src/components/QRDisplay.tsx` | QR code render using qrcode.react + download link |

**✅ Done when**: Full registration flow works: upload → authenticate → register → see QR code.

---

### Phase FE5 — Graph Explorer (5-7 hrs)
| File | What to do |
|------|------------|
| `src/pages/GraphExplorerPage.tsx` | D3.js force graph page. Search bar for node search |
| `src/components/GraphCanvas.tsx` | D3.js SVG canvas: `forceSimulation()` + `forceLink` + `forceManyBody(-300)` + `forceCenter`. Node colours by type. Zoom/pan via `d3.zoom()` |
| `src/components/NodeDetail.tsx` | Side panel: clicked node properties + neighbors |
| `src/hooks/useGraph.ts` | Fetch `getKnowledgeGraph` query, transform to D3 node/link format |

> **💡 Pattern**: Use "D3 for math, React for DOM" — D3 computes positions via `forceSimulation`, React renders SVG elements. Use `useRef` for SVG container and `useEffect` for simulation updates.

**✅ Done when**: Graph visualisation renders with coloured nodes, clickable for details, zoom/pan works.

---

### Phase FE6 — Dashboard + Conflicts + Timeline (5-7 hrs)
| File | What to do |
|------|------------|
| `src/pages/DashboardPage.tsx` | Main dashboard: recent docs, risk alerts summary |
| `src/pages/ConflictPage.tsx` | Risk feed (polls every 30s) + flagged documents table with sortable columns. Click → DocumentDetailPage |
| `src/components/RiskBadge.tsx` | Colour-coded: 0-30 green, 31-60 yellow, 61-100 red |
| `src/pages/TimelinePage.tsx` | Chronological event timeline for a property |
| `src/components/TimelineItem.tsx` | Single timeline event card |
| `src/pages/DocumentDetailPage.tsx` | Full doc metadata, blockchain record, graph neighbours |
| `src/components/DocumentCard.tsx` | Document summary card for list views |
| `src/utils/formatters.ts` | Date, hash, risk score display formatters |

**✅ Done when**: All pages render with correct data from backend.

---

### Phase FE7 — Tests + Polish (3-4 hrs)
| File | What to do |
|------|------------|
| `tests/LoginPage.test.tsx` | Render, validation, submit, error state |
| `tests/setup.ts` | Vitest + React Testing Library setup |
| UI polish | Loading states, error messages, responsive design, animations, hover effects |

**✅ Done when**: Key tests pass. UI looks polished across different screen sizes.

---
---

## Module 7 — Infrastructure (`neo4j/`, `docker/`, `data/`, `docs/`)

> **Tech**: Docker Compose, Neo4j, IPFS Kubo, Cypher
> **Estimated effort**: 10-15 hours

### Phase INF1 — Neo4j Schema + Seed (2-3 hrs)
| File | What to do |
|------|------------|
| `neo4j/schema.cypher` | 6 UNIQUE constraints (Person, Property, Document, Court, LegalAct, Organisation) + 5 indexes (docType, date, riskScore, surveyNumber, full-text name search) |
| `neo4j/seed.cypher` | Sample data: 10 persons, 5 properties, 8 documents, relationships between them |

**✅ Done when**: Schema applies without errors. Seed data visible in Neo4j Browser at `http://localhost:7474`.

---

### Phase INF2 — Docker Compose + Dockerfiles (4-5 hrs)
| File | What to do |
|------|------------|
| `docker/docker-compose.yml` | Services: neo4j, ipfs, backend, nlp, bridge-sim, frontend. Health checks. Volume mounts. Environment variables |
| `docker/backend.Dockerfile` | Node 20-slim, npm ci, build, run |
| `docker/nlp.Dockerfile` | Python 3.11-slim, install tesseract-ocr, pip install, spacy download |
| `docker/bridge.Dockerfile` | Python 3.11-slim, pip install, run bridge |

**✅ Done when**: `docker-compose up -d` → all services start and pass health checks.

> **Note**: Fabric containers are separate — start with `blockchain/network/scripts/setup-network.sh` first.

---

### Phase INF3 — Sample Data + Documentation (3-4 hrs)
| File | What to do |
|------|------------|
| `data/scripts/generate_synthetic.py` | Generate 3 synthetic PDFs (sale deed, court order, land record) |
| `data/scripts/fetch_indiankanoon.py` | Fetch sample judgments from Indian Kanoon API |
| `data/scripts/generate_conflict_data.py` | Generate synthetic conflict training CSV (500 rows) |
| `docs/architecture.md` | High-level architecture + diagram |
| `docs/api-contract.md` | REST + GraphQL API documentation |
| `docs/uart-protocol.md` | UART 16-byte packet format spec |
| `docs/deployment-guide.md` | Local setup step-by-step |
| `docs/security.md` | Security measures at each layer |
| `.env.example` | Root-level template for all env vars |

**✅ Done when**: Sample data generates correctly. Docs are complete and accurate.

---
---

## End-to-End Integration Testing

After all modules are built, test both workflows:

### Workflow A — Document Registration
```
Fingerprint scan → OLED feedback → UART packet → Python bridge → JWT →
Node.js API auth → File upload → SHA-256 hash → AES-256 encrypt → IPFS upload →
Blockchain store → QR generate → PDF embed → NLP trigger →
OCR → NER → Relations → Neo4j insert → Conflict score
```

### Workflow B — Document Verification
```
Citizen scans QR → Opens verification URL → Backend queries blockchain →
Fetches from IPFS → Decrypts → Recomputes SHA-256 → Compares →
Returns: AUTHENTIC / TAMPERED / NOT_REGISTERED
```

**✅ Project complete when**: Both workflows run end-to-end locally with Docker.

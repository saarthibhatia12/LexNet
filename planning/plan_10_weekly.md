# Section 10 — Week-by-Week Build Checklist

[← Back to Index](file:///C:/Users/sbrbs/.gemini/antigravity/brain/aa37d9b8-3977-4d6d-bd30-54083b104657/implementation_plan.md)

---

## Week 1 — Topic Finalisation + Synopsis (No Code)
- [ ] Finalise project topic and scope with supervisor
- [ ] Write synopsis / abstract document
- [ ] Set up Git repository with `.gitignore`, `README.md`, `LICENSE`
- [ ] Create monorepo folder structure (empty dirs)
- [ ] Install prerequisites: Docker Desktop, Node.js 20, Python 3.11, Go 1.21

**Files created**: `.gitignore`, `README.md`, `LICENSE`, all `*/README.md` stubs

---

## Week 2 — Blockchain Network + IPFS + Firmware Start

**Student S1 (Embedded)**:
- [ ] `firmware/Inc/main.h` — pin definitions, constants
- [ ] `firmware/Inc/crc16.h` — CRC prototype
- [ ] `firmware/Src/crc16.c` — CRC-16 lookup table
- [ ] `firmware/Src/oled.c` + `Inc/oled.h` — SSD1306 driver (can test with real hardware)
- [ ] `firmware/lexnet-firmware.ioc` — CubeMX pin configuration

**Student S2 (Blockchain)**:
- [ ] `blockchain/network/configtx.yaml` — org + channel config
- [ ] `blockchain/network/crypto-config.yaml` — crypto material config
- [ ] `blockchain/network/docker-compose-fabric.yaml` — peer, orderer, CA containers
- [ ] `blockchain/network/scripts/generate-crypto.sh`
- [ ] `blockchain/network/scripts/setup-network.sh`
- [ ] `blockchain/network/scripts/teardown-network.sh`
- [ ] Get test network running — peers join channel

**Student S3 (AI/ML)**:
- [ ] `nlp/requirements.txt`
- [ ] `nlp/src/__init__.py`, `nlp/src/config.py`
- [ ] `nlp/scripts/download_models.py` — download Legal-BERT + spaCy
- [ ] `nlp/src/pipeline/ocr.py` — Tesseract integration
- [ ] `nlp/tests/test_ocr.py` — test with sample PDF

**Student S4 (Frontend)**:
- [ ] `frontend/` scaffold: `npx create-vite@latest ./ --template react-ts`
- [ ] `frontend/package.json` — add dependencies
- [ ] `frontend/tailwind.config.js`, `postcss.config.js`
- [ ] `frontend/src/index.css` — Tailwind imports + theme
- [ ] `frontend/src/pages/LoginPage.tsx` — form UI
- [ ] `frontend/src/context/AuthContext.tsx`

---

## Week 3 — Chaincode + Bridge + IPFS Docker

**S1**:
- [ ] `firmware/Src/fingerprint.c` + `Inc/fingerprint.h` — R307 driver
- [ ] `firmware/Src/uart_comm.c` + `Inc/uart_comm.h` — packet builder
- [ ] `firmware/Src/buzzer.c` + `Inc/buzzer.h`
- [ ] `firmware/Src/main.c` — main super-loop (integrate all drivers)
- [ ] Test firmware on real STM32 with logic analyser

**S2**:
- [ ] `blockchain/chaincode/lexnet-cc/go.mod`
- [ ] `blockchain/chaincode/lexnet-cc/models.go` — struct definitions
- [ ] `blockchain/chaincode/lexnet-cc/main.go` — entry point
- [ ] `blockchain/chaincode/lexnet-cc/contract.go` — all 8 functions
- [ ] `blockchain/chaincode/lexnet-cc/contract_test.go` — unit tests
- [ ] Deploy chaincode to test network, run smoke test
- [ ] IPFS Docker setup: verify `docker run ipfs/kubo:v0.27.0` works

**S3**:
- [ ] `nlp/src/pipeline/ner.py` — Legal-BERT NER integration
- [ ] `nlp/data/ner_labels.json` — custom label map
- [ ] `nlp/tests/test_ner.py`
- [ ] Start on `nlp/src/pipeline/rel_extract.py` — rule patterns

**S4**:
- [ ] `frontend/src/pages/VerifyPage.tsx` — hash input + QR upload
- [ ] `frontend/src/components/VerificationResult.tsx`
- [ ] `frontend/src/components/Navbar.tsx`, `Sidebar.tsx`
- [ ] `frontend/src/components/ProtectedRoute.tsx`
- [ ] `frontend/src/App.tsx` — route definitions

---

## Week 4 — Smart Contracts Integration + JWT Bridge Start

**S1**:
- [ ] `hardware-bridge/requirements.txt`
- [ ] `hardware-bridge/src/config.py`
- [ ] `hardware-bridge/src/crc16.py` + `tests/test_crc16.py`
- [ ] `hardware-bridge/src/packet_parser.py` + `tests/test_packet_parser.py`
- [ ] `hardware-bridge/src/uart_reader.py`
- [ ] `hardware-bridge/simulator/stm32_simulator.py`

**S2**:
- [ ] `backend/package.json`, `tsconfig.json`
- [ ] `backend/src/config/env.ts` — Zod validation
- [ ] `backend/src/config/fabric.ts` — gateway connection
- [ ] `backend/src/config/logger.ts` — Winston setup
- [ ] `backend/src/services/encryptionService.ts` + tests
- [ ] `backend/src/services/hashService.ts` + tests

**S3**:
- [ ] `nlp/src/pipeline/rel_extract.py` — complete rule-based patterns
- [ ] `nlp/tests/test_rel_extract.py`
- [ ] `nlp/src/models/entity.py`, `triple.py`, `risk.py` — dataclasses
- [ ] `nlp/src/utils/text_clean.py` — text normalisation

**S4**:
- [ ] `frontend/src/apollo/client.ts` — Apollo Client setup
- [ ] `frontend/src/graphql/queries.ts`, `mutations.ts`
- [ ] `frontend/src/pages/RegisterPage.tsx` — form + file upload
- [ ] `frontend/src/components/FileUpload.tsx`

---

## Week 5 — NLP Pipeline + JWT Auth Complete

**S1**:
- [ ] `hardware-bridge/src/jwt_generator.py` + `tests/test_jwt_generator.py`
- [ ] `hardware-bridge/src/api_client.py`
- [ ] `hardware-bridge/src/bridge.py` + `tests/test_bridge.py`
- [ ] Test full bridge flow with simulator

**S2**:
- [ ] `backend/src/services/fabricService.ts` + tests
- [ ] `backend/src/services/ipfsService.ts`
- [ ] `backend/src/middleware/auth.ts` + tests
- [ ] `backend/src/middleware/rateLimiter.ts`
- [ ] `backend/src/rest/routes.ts`
- [ ] `backend/src/rest/hardwareAuthController.ts`

**S3**:
- [ ] `nlp/src/utils/neo4j_driver.py` — driver singleton
- [ ] `nlp/src/pipeline/graph_insert.py` + tests
- [ ] `nlp/src/pipeline/conflict.py` — rule-based scoring first
- [ ] `data/scripts/generate_conflict_data.py` — synthetic training data

**S4**:
- [ ] `frontend/src/components/FingerprintStatus.tsx`
- [ ] `frontend/src/components/QRDisplay.tsx`
- [ ] `frontend/src/hooks/useAuth.ts`
- [ ] `frontend/tests/LoginPage.test.tsx`

---

## Week 6 — Knowledge Graph + Neo4j Integration (⚠️ Convergence Week)

> [!WARNING]
> **S2 + S3 integration session at start of week**: Backend Neo4j service must work with NLP pipeline inserts. Align Cypher queries and schema.

**S1**:
- [ ] Hardware ↔ Bridge ↔ Backend end-to-end test (with simulator)
- [ ] Fix any UART timing or CRC issues discovered

**S2**:
- [ ] `backend/src/services/neo4jService.ts`
- [ ] `backend/src/services/qrService.ts` + tests
- [ ] `backend/src/services/pdfService.ts`
- [ ] `backend/src/services/nlpTriggerService.ts`
- [ ] `neo4j/schema.cypher` — finalise constraints + indexes
- [ ] `neo4j/seed.cypher` — sample data

**S3**:
- [ ] `nlp/src/app.py` — Flask server with `/nlp/process` endpoint
- [ ] `nlp/scripts/train_conflict_model.py` — train XGBoost
- [ ] `nlp/tests/test_conflict.py`
- [ ] Test full NLP pipeline: PDF → OCR → NER → triples → Neo4j

**S4**:
- [ ] `frontend/src/pages/GraphExplorerPage.tsx`
- [ ] `frontend/src/components/GraphCanvas.tsx` — D3.js force graph
- [ ] `frontend/src/components/NodeDetail.tsx`
- [ ] `frontend/src/hooks/useGraph.ts`

---

## Week 7 — Conflict Detection + Full Integration Sprint

**S1**:
- [ ] Polish firmware: error messages, LED indicators, edge case handling
- [ ] `docs/uart-protocol.md` — document packet format

**S2**:
- [ ] `backend/src/graphql/schema.ts` — full SDL
- [ ] `backend/src/graphql/resolvers/` — all resolver files
- [ ] `backend/src/graphql/directives/authDirective.ts`
- [ ] `backend/src/rest/verifyController.ts`
- [ ] `backend/src/index.ts` — server bootstrap
- [ ] `backend/tests/integration/documentFlow.test.ts`

**S3**:
- [ ] `nlp/src/pipeline/conflict.py` — integrate XGBoost model + rule combining
- [ ] Test conflict detection on synthetic conflict scenarios
- [ ] `data/scripts/generate_synthetic.py` — 3 sample PDFs
- [ ] `data/scripts/fetch_indiankanoon.py` — fetch sample judgments

**S4**:
- [ ] `frontend/src/pages/ConflictPage.tsx`
- [ ] `frontend/src/components/RiskBadge.tsx`
- [ ] `frontend/src/pages/TimelinePage.tsx`
- [ ] `frontend/src/components/TimelineItem.tsx`

---

## Week 8 — Dashboard + QR System + Phase 2 Report

**S1**:
- [ ] Demo hardware setup: STM32 + sensor + OLED + buzzer wired and working
- [ ] Record demo video of fingerprint auth flow

**S2**:
- [ ] `docker/docker-compose.yml` — all services
- [ ] `docker/backend.Dockerfile`, `nlp.Dockerfile`, `bridge.Dockerfile`
- [ ] Full docker-compose up → all services healthy

**S3**:
- [ ] End-to-end NLP test: register document → NLP processes → Neo4j updated → conflict scored
- [ ] `nlp/data/conflict_model.pkl` — trained model committed (gitignored, documented)

**S4**:
- [ ] `frontend/src/pages/DashboardPage.tsx` — recent docs, risk alerts
- [ ] `frontend/src/pages/DocumentDetailPage.tsx`
- [ ] `frontend/src/components/DocumentCard.tsx`
- [ ] `frontend/tests/VerifyPage.test.tsx`

**All**:
- [ ] Phase 2 report writing

---

## Week 9 — Integration Testing + Polish

**All students collaborating**:
- [ ] Full Workflow A test: fingerprint → bridge → backend → IPFS → blockchain → QR → NLP → Neo4j
- [ ] Full Workflow B test: scan QR → verify → authentic/tampered/not registered
- [ ] Fix all integration bugs
- [ ] `backend/tests/integration/graphqlEndpoints.test.ts`
- [ ] `docs/architecture.md`, `docs/api-contract.md`, `docs/security.md`
- [ ] `docs/deployment-guide.md`
- [ ] `.env.example` files for all services
- [ ] Sample documents in `data/sample-documents/`

---

## Weeks 10-12 — Polish, Edge Cases, Documentation

- [ ] UI polish: animations, loading states, error messages, responsive design
- [ ] Conflict detection tuning: adjust thresholds, add more rule patterns
- [ ] Security audit: input sanitisation, JWT expiry, rate limiting
- [ ] `backend/src/middleware/inputSanitizer.ts`
- [ ] `backend/src/middleware/errorHandler.ts`
- [ ] Performance testing: 10 documents registered + verified end-to-end
- [ ] `frontend/src/utils/formatters.ts`, `constants.ts`

---

## Weeks 13-14 — Paper Writing + Presentation Prep

- [ ] Write project paper (IEEE format or university template)
- [ ] Create presentation slides (15-20 slides)
- [ ] Record demo video (5 minutes)
- [ ] Prepare live demo setup checklist

---

## Week 15 — Final Submission + Presentation

- [ ] Dry run live demo
- [ ] Fix any last-minute issues
- [ ] Submit project report + code + demo video
- [ ] Present to panel

---

## ⚠️ Common Stuck Points & Mitigations

| Stuck Point | Likelihood | Mitigation |
|-------------|-----------|------------|
| Hyperledger Fabric network setup | **HIGH** | Use `fabric-samples/test-network` as base. Don't build from scratch. Budget 10+ hours. |
| D3.js + React integration | **MEDIUM** | Use "D3 for math, React for rendering" pattern. Keep D3 out of the DOM. |
| Legal-BERT fine-tuning | **MEDIUM** | Skip fine-tuning, use spaCy `EntityRuler` with regex patterns as fallback. |
| Virtual serial ports (Windows) | **MEDIUM** | Use TCP socket mode as alternative. Set bridge `--tcp` flag. |
| IPFS slow on Windows | **LOW** | Use Docker for IPFS, not native install. Increase timeouts to 60s. |
| Neo4j composite constraints | **LOW** | Use Community Edition 5.x. Check Cypher syntax — CE has some limitations vs Enterprise. |
| XGBoost training data | **LOW** | Generate synthetic data with `generate_conflict_data.py`. 500 rows is enough for demo. |
| Tesseract accuracy on Indian docs | **MEDIUM** | Use `--oem 1 --psm 6` flags. Preprocess images with contrast enhancement. Accept imperfect OCR for demo. |

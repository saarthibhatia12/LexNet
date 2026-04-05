# Pre-NLP Start Checklist

Use this checklist before implementing anything in `nlp/`.

Verified on `2026-04-05` for the current local LexNet setup.

## Goal

Confirm infrastructure, contracts, and local tooling are ready so NLP development starts without blockers.

## 1. Infrastructure Must Be Up (Blocking)

- [x] Docker daemon is running.
- [x] `lexnet-neo4j` container is running.
- [x] `lexnet-ipfs` container is running.
- [x] Neo4j is reachable on ports `7474` and `7687`.
- [x] IPFS is reachable on ports `5001` and `8080`.

Quick check (PowerShell):

```powershell
docker ps --format "table {{.Names}}`t{{.Status}}`t{{.Ports}}"
docker exec lexnet-neo4j cypher-shell -u neo4j -p lexnet-neo4j-pass "RETURN 1 AS ok;"
curl.exe -X POST http://localhost:5001/api/v0/version
```

Verified result:

- `lexnet-neo4j` and `lexnet-ipfs` were both running on `2026-04-05`.
- Neo4j returned `ok = 1`.
- IPFS returned `Version = 0.27.0`.

## 2. Neo4j Schema Must Be Applied (Blocking)

- [x] `neo4j/schema.cypher` is applied successfully.
- [x] Core constraints exist and are active.
- [ ] Optional: `neo4j/seed.cypher` loaded for local testing.

Verification command (inside Neo4j):

```cypher
SHOW CONSTRAINTS;
SHOW INDEXES;
```

Verified result:

- Required constraints present: `person_name_id`, `property_id`, `document_hash`, `court_name`, `legalact_name_section`, `org_name`
- Required indexes present: `doc_type_idx`, `doc_date_idx`, `doc_risk_idx`, `property_survey_idx`, `node_name_search`

## 3. Blockchain Contract Baseline Confirmed (Blocking for Integration)

- [x] Chaincode `lexnet-cc` is committed on `lexnet-channel`.
- [x] BC4 smoke script has passed recently.
- [x] Script available at `blockchain/network/scripts/bc4-smoke.ps1`.

Why this matters: backend integration will trigger NLP after document registration, so document flow assumptions should already be stable.

Verified result:

- `bc4-smoke.ps1` passed on `2026-04-05`.
- Smoke document hash: `doc-smoke-20260405114204601`
- `GetDocument` returned the stored record and `VerifyDocument` returned `EXISTS`.

## 4. NLP Runtime Setup Ready (Blocking)

Note: the Windows host does not currently expose `py -3.11`, so the verified execution path for NLP on this machine is the Dockerized Python `3.11` runtime in `docker/nlp.Dockerfile`.

- [x] Python `3.11` is selected for NLP.
- [x] Selected NLP runtime is ready (`docker/nlp.Dockerfile` / `lexnet-nlp-preflight`).
- [x] `nlp/requirements.txt` installs successfully.
- [x] `nlp/.env` created from `nlp/.env.example`.
- [x] All required env vars are set (Flask port, Neo4j connection, Tesseract path, model paths).

Suggested host setup (PowerShell):

```powershell
cd nlp
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Verified Docker setup:

```powershell
docker build -f docker/nlp.Dockerfile -t lexnet-nlp-preflight .
docker run --rm lexnet-nlp-preflight python --version
docker run --rm lexnet-nlp-preflight python -c "import spacy; spacy.load('en_core_web_sm'); print('SPACY_OK')"
```

## 5. OCR and Model Dependencies Ready (Blocking)

- [x] Tesseract OCR is available in the selected NLP runtime.
- [x] Tesseract binary path is configured in `nlp/.env`.
- [x] NLP model download script has run (`scripts/download_models.py`).
- [x] spaCy model load works (`en_core_web_sm`).

Quick check:

```powershell
docker run --rm lexnet-nlp-preflight tesseract --version
docker run --rm -v lexnet_nlp_models:/app/models --env-file nlp/.env lexnet-nlp-preflight python scripts/download_models.py
docker run --rm -p 5500:5500 -v lexnet_nlp_models:/app/models --env-file nlp/.env lexnet-nlp-preflight
curl.exe http://localhost:5500/nlp/health
```

Verified result:

- Container health endpoint returned `{"status":"ok","runtimeReady":true,...}` on `2026-04-05`.
- `legalBertModelPath.exists = true`
- `conflictModelPath.exists = true`
- `spacyLoad.loaded = true`
- `tesseract.resolved = /usr/bin/tesseract`

## 6. Start NLP Only After These Are True

- [x] Infrastructure checks pass.
- [x] Schema checks pass.
- [x] NLP environment setup is complete.
- [x] OCR/model checks pass.

When all boxes above are checked, start with `NLP1` in `PHASE_WISE_IMPLEMENTATION.md`.

## 7. Recommended First NLP Execution Order

1. `NLP1` Setup + OCR
2. `NLP2` NER
3. `NLP3` Relation extraction + models
4. `NLP4` Neo4j graph insert
5. `NLP5` Conflict scoring
6. `NLP6` Flask endpoint and end-to-end processing

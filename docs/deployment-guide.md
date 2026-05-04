# LexNet Deployment Guide

This guide focuses on local development and demo deployment. LexNet is designed to run on `localhost` with Docker-backed infrastructure and native app services where needed.

## 1. Prerequisites

- Windows PowerShell or another shell with equivalent commands
- Node.js 20
- Python 3.11
- Docker Desktop with enough disk space for Neo4j, IPFS, and Fabric images
- Go 1.21 for chaincode work
- Tesseract OCR available to the NLP runtime

## 2. Recommended startup order

Follow the build order already defined for the repo:

1. Neo4j + IPFS
2. NLP + Blockchain in parallel
3. Firmware + hardware bridge
4. Backend
5. Frontend
6. Docker/docs polish

## 3. Environment setup

Create per-service env files from the examples:

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item nlp\.env.example nlp\.env
Copy-Item hardware-bridge\.env.example hardware-bridge\.env
Copy-Item frontend\.env.example frontend\.env
```

Important cross-service rules:

- `backend/.env` and `hardware-bridge/.env` must share the same `JWT_SECRET`
- `backend/.env` and `nlp/.env` must point to the same Neo4j and IPFS instances
- `frontend/.env` should target the local backend URLs unless you intentionally proxy elsewhere

## 4. Infrastructure startup

### Option A: hybrid local dev

This is the most practical setup on low-disk machines and matches the current repo state well:

- Keep `Fabric`, `Neo4j`, and `IPFS` in Docker
- Run `backend`, `frontend`, `nlp`, and `hardware-bridge` natively

Start Neo4j and IPFS:

```powershell
cd docker
docker compose up -d neo4j ipfs
```

Start Fabric separately using the network scripts:

```powershell
cd D:\LexNet
bash blockchain/network/scripts/setup-network.sh
```

If you only need the already-created Fabric containers, start them from Docker Desktop or with the relevant `docker start` commands.

### Option B: Dockerized infra plus NLP

If you want the NLP runtime inside Docker:

```powershell
cd docker
docker compose up -d neo4j ipfs nlp
```

Note: the current compose file does not boot the full backend/frontend/bridge stack. Fabric is also managed separately from `docker/docker-compose.yml`.

## 5. Apply Neo4j schema and sample data

Apply schema:

```powershell
Get-Content -Raw neo4j\schema.cypher | docker exec -i lexnet-neo4j cypher-shell -u neo4j -p lexnet-neo4j-pass
```

Optional seed data for graph demos:

```powershell
Get-Content -Raw neo4j\seed.cypher | docker exec -i lexnet-neo4j cypher-shell -u neo4j -p lexnet-neo4j-pass
```

## 6. Verify Fabric contract baseline

Run the smoke script before relying on blockchain integration:

```powershell
powershell -ExecutionPolicy Bypass -File blockchain\network\scripts\bc4-smoke.ps1
```

Expected result:

- chaincode `lexnet-cc` is committed on `lexnet-channel`
- `StoreDocument` smoke call succeeds
- `GetDocument` and `VerifyDocument` return valid results

## 7. Run app services natively

### Backend

```powershell
cd backend
npm install
npm run build
npm run dev
```

Backend endpoints:

- REST: `http://localhost:4000/api`
- GraphQL: `http://localhost:4000/graphql`

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend UI:

- `http://localhost:3000`

### NLP

```powershell
cd nlp
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python -m src.app
```

NLP health endpoint:

- `http://localhost:5500/nlp/health`

### Hardware bridge

TCP simulator mode is recommended on Windows:

```powershell
cd hardware-bridge
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m src.bridge --tcp --tcp-host localhost --tcp-port 9600
```

Serial mode:

```powershell
python -m src.bridge --serial COM3
```

## 8. Generate local demo data

Sample PDFs:

```powershell
python data\scripts\generate_synthetic.py
```

Synthetic conflict dataset:

```powershell
python data\scripts\generate_conflict_data.py --rows 500
```

Optional Indian Kanoon fetch helper:

```powershell
$env:INDIANKANOON_API_TOKEN="your-token"
python data\scripts\fetch_indiankanoon.py --query '"property dispute" ANDD registration' --limit 3
```

The fetch helper follows the shared-token request pattern documented by Indian Kanoon:

- [Indian Kanoon API documentation](https://api.indiankanoon.org/documentation/)

## 9. Smoke checks

Recommended quick checks:

```powershell
curl.exe http://localhost:4000/api/health
curl.exe http://localhost:5500/nlp/health
docker exec lexnet-neo4j cypher-shell -u neo4j -p lexnet-neo4j-pass "RETURN 1 AS ok;"
curl.exe -X POST http://localhost:5001/api/v0/version
```

## 10. Common failure points

- Docker disk pressure on `C:`: prefer the hybrid path and keep only infra containers
- `JWT_SECRET` mismatch: hardware auth fails even if the bridge JWT format looks correct
- Neo4j schema missing: graph queries and NLP graph inserts will fail or degrade
- Tesseract missing: NLP OCR path fails on scanned PDFs
- Fabric not started: backend document registration and verification fail
- IPFS unavailable: register and verify flows fail at payload storage/retrieval

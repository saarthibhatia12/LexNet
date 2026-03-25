# Section 9 — Docker Setup

[← Back to Index](file:///C:/Users/sbrbs/.gemini/antigravity/brain/aa37d9b8-3977-4d6d-bd30-54083b104657/implementation_plan.md)

---

## `docker/docker-compose.yml`

```yaml
version: "3.8"

services:
  # ---- Neo4j Graph Database ----
  neo4j:
    image: neo4j:5-community
    container_name: lexnet-neo4j
    ports:
      - "7474:7474"   # Browser UI
      - "7687:7687"   # Bolt protocol
    environment:
      - NEO4J_AUTH=neo4j/lexnet-neo4j-pass
      - NEO4J_PLUGINS=["apoc"]
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
      - ../neo4j/schema.cypher:/docker-entrypoint-initdb.d/schema.cypher
    healthcheck:
      test: ["CMD", "neo4j", "status"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ---- IPFS Kubo Node ----
  ipfs:
    image: ipfs/kubo:v0.27.0
    container_name: lexnet-ipfs
    ports:
      - "5001:5001"   # API
      - "8080:8080"   # Gateway
    volumes:
      - ipfs_data:/data/ipfs
    healthcheck:
      test: ["CMD-SHELL", "ipfs id || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ---- Hyperledger Fabric (Test Network) ----
  # Uses Fabric test-network containers — defined in blockchain/network/docker-compose-fabric.yaml
  # Start separately: cd blockchain/network && ./scripts/setup-network.sh
  # Services: orderer.example.com, peer0.govtorg.example.com, peer0.verifierorg.example.com, ca_govtorg, ca_verifierorg

  # ---- Node.js Backend ----
  backend:
    build:
      context: ..
      dockerfile: docker/backend.Dockerfile
    container_name: lexnet-backend
    ports:
      - "4000:4000"
    environment:
      - PORT=4000
      - NODE_ENV=development
      - JWT_SECRET=lexnet-super-secret-key-changeme-2024
      - JWT_EXPIRY=1h
      - FABRIC_CHANNEL=lexnet-channel
      - FABRIC_CHAINCODE=lexnet-cc
      - FABRIC_WALLET_PATH=/app/wallet
      - FABRIC_CONNECTION_PROFILE=/app/connection-org1.json
      - FABRIC_MSP_ID=GovtOrgMSP
      - IPFS_API_URL=http://ipfs:5001
      - NEO4J_URI=bolt://neo4j:7687
      - NEO4J_USER=neo4j
      - NEO4J_PASSWORD=lexnet-neo4j-pass
      - AES_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
      - NLP_SERVICE_URL=http://nlp:5500
      - VERIFICATION_BASE_URL=http://localhost:3000
    depends_on:
      neo4j:
        condition: service_healthy
      ipfs:
        condition: service_healthy
    volumes:
      - fabric_wallet:/app/wallet
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/api/health"]
      interval: 15s
      timeout: 5s
      retries: 3

  # ---- Python NLP Pipeline ----
  nlp:
    build:
      context: ..
      dockerfile: docker/nlp.Dockerfile
    container_name: lexnet-nlp
    ports:
      - "5500:5500"
    environment:
      - FLASK_PORT=5500
      - NEO4J_URI=bolt://neo4j:7687
      - NEO4J_USER=neo4j
      - NEO4J_PASSWORD=lexnet-neo4j-pass
      - IPFS_API_URL=http://ipfs:5001
      - TESSERACT_CMD=tesseract
      - NER_MODEL_PATH=/app/models/legal-bert
      - SPACY_MODEL=en_core_web_sm
      - CONFLICT_MODEL_PATH=/app/data/conflict_model.pkl
    depends_on:
      neo4j:
        condition: service_healthy
      ipfs:
        condition: service_healthy
    volumes:
      - nlp_models:/app/models

  # ---- Hardware Bridge Simulator ----
  bridge-sim:
    build:
      context: ..
      dockerfile: docker/bridge.Dockerfile
    container_name: lexnet-bridge-sim
    environment:
      - SERIAL_PORT=tcp://bridge-sim:9600
      - BAUD_RATE=57600
      - JWT_SECRET=lexnet-super-secret-key-changeme-2024
      - API_URL=http://backend:4000
    depends_on:
      backend:
        condition: service_healthy
    command: ["python", "-m", "src.simulator.stm32_simulator", "--tcp", "--port", "9600"]

  # ---- Frontend (Dev Server) ----
  frontend:
    build:
      context: ..
      dockerfile: docker/frontend.Dockerfile
    container_name: lexnet-frontend
    ports:
      - "3000:3000"
    environment:
      - VITE_API_URL=http://localhost:4000/graphql
      - VITE_REST_API_URL=http://localhost:4000/api
    depends_on:
      - backend

volumes:
  neo4j_data:
  neo4j_logs:
  ipfs_data:
  fabric_wallet:
  nlp_models:
```

---

## Dockerfiles

### `backend.Dockerfile`
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --production=false
COPY backend/ ./
RUN npm run build
EXPOSE 4000
CMD ["node", "dist/index.js"]
```

### `nlp.Dockerfile`
```dockerfile
FROM python:3.11-slim
RUN apt-get update && apt-get install -y tesseract-ocr && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY nlp/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
RUN python -m spacy download en_core_web_sm
COPY nlp/ ./
# Model download happens on first run or via: RUN python scripts/download_models.py
EXPOSE 5500
CMD ["python", "-m", "src.app"]
```

### `bridge.Dockerfile`
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY hardware-bridge/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY hardware-bridge/ ./
CMD ["python", "-m", "src.bridge"]
```

> [!WARNING]
> **Fabric containers are NOT in this compose file**. Hyperledger Fabric has its own docker-compose in `blockchain/network/docker-compose-fabric.yaml` because it requires crypto material generation first. Start Fabric network separately with `./scripts/setup-network.sh`, then start the main docker-compose.

### Startup Order
```bash
# 1. Start Fabric test network
cd blockchain/network && ./scripts/setup-network.sh

# 2. Start all other services
cd docker && docker-compose up -d

# 3. Seed Neo4j (first time only)
docker exec -i lexnet-neo4j cypher-shell -u neo4j -p lexnet-neo4j-pass < neo4j/seed.cypher

# 4. Download NLP models (first time only)
docker exec lexnet-nlp python scripts/download_models.py
```

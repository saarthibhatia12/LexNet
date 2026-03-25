# Section 5 — All Environment Variables

[← Back to Index](file:///C:/Users/sbrbs/.gemini/antigravity/brain/aa37d9b8-3977-4d6d-bd30-54083b104657/implementation_plan.md)

---

## Backend (`backend/.env`)

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Express server port | `4000` |
| `NODE_ENV` | Environment | `development` |
| `JWT_SECRET` | HS256 signing key (min 32 chars) | `lexnet-super-secret-key-changeme-2024` |
| `JWT_EXPIRY` | Session token TTL | `1h` |
| `FABRIC_CHANNEL` | Hyperledger channel name | `lexnet-channel` |
| `FABRIC_CHAINCODE` | Chaincode name | `lexnet-cc` |
| `FABRIC_WALLET_PATH` | Filesystem path to wallet | `./wallet` |
| `FABRIC_CONNECTION_PROFILE` | Path to Fabric connection JSON | `./connection-org1.json` |
| `FABRIC_MSP_ID` | Organisation MSP | `GovtOrgMSP` |
| `IPFS_API_URL` | IPFS Kubo API endpoint | `http://localhost:5001` |
| `IPFS_GATEWAY_URL` | IPFS HTTP gateway | `http://localhost:8080` |
| `NEO4J_URI` | Neo4j Bolt endpoint | `bolt://localhost:7687` |
| `NEO4J_USER` | Neo4j username | `neo4j` |
| `NEO4J_PASSWORD` | Neo4j password | `lexnet-neo4j-pass` |
| `AES_KEY` | 256-bit key as hex (64 chars) | `a1b2c3d4...` (64 hex chars) |
| `NLP_SERVICE_URL` | Python NLP service base URL | `http://localhost:5001` |
| `VERIFICATION_BASE_URL` | Public URL for QR codes | `http://localhost:3000` |
| `LOG_LEVEL` | Winston log level | `info` |
| `MAX_FILE_SIZE_MB` | Upload limit | `50` |

## Hardware Bridge (`hardware-bridge/.env`)

| Variable | Description | Example |
|----------|-------------|---------|
| `SERIAL_PORT` | COM port / device path | `COM3` or `/dev/ttyACM0` |
| `BAUD_RATE` | UART baud rate | `57600` |
| `JWT_SECRET` | Same as backend JWT_SECRET | `lexnet-super-secret-key-changeme-2024` |
| `API_URL` | Backend base URL | `http://localhost:4000` |
| `BRIDGE_LOG_LEVEL` | Logging level | `DEBUG` |
| `TIMESTAMP_TOLERANCE_SEC` | Max age of timestamp | `30` |
| `MIN_FINGER_SCORE` | Minimum accepted score | `60` |

## NLP Pipeline (`nlp/.env`)

| Variable | Description | Example |
|----------|-------------|---------|
| `FLASK_PORT` | Flask server port | `5500` |
| `NEO4J_URI` | Neo4j Bolt endpoint | `bolt://localhost:7687` |
| `NEO4J_USER` | Neo4j username | `neo4j` |
| `NEO4J_PASSWORD` | Neo4j password | `lexnet-neo4j-pass` |
| `NER_MODEL_PATH` | Path to Legal-BERT model | `./models/legal-bert` |
| `SPACY_MODEL` | spaCy model name | `en_core_web_sm` |
| `TESSERACT_CMD` | Tesseract binary path | `tesseract` or `C:\Program Files\Tesseract-OCR\tesseract.exe` |
| `IPFS_API_URL` | IPFS API for fetching docs | `http://localhost:5001` |
| `CONFLICT_MODEL_PATH` | Path to XGBoost pkl | `./data/conflict_model.pkl` |

## Frontend (`frontend/.env`)

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Backend GraphQL URL | `http://localhost:4000/graphql` |
| `VITE_REST_API_URL` | Backend REST URL | `http://localhost:4000/api` |
| `VITE_APP_NAME` | App title | `LexNet` |

---

# Section 6 — Database Schemas

---

## Neo4j Graph Schema

### Node Labels & Properties

| Label | Properties | Constraints/Indexes |
|-------|-----------|-------------------|
| `Person` | `name: String!`, `id: String` (Aadhaar/PAN), `type: "individual"\|"organisation"` | UNIQUE constraint on `(name, id)` pair |
| `Property` | `id: String!`, `surveyNumber: String`, `location: String`, `area: String`, `type: "land"\|"building"` | UNIQUE constraint on `id` |
| `Document` | `hash: String!`, `docType: String!`, `title: String`, `date: String`, `ipfsCID: String`, `riskScore: Float` | UNIQUE constraint on `hash`; INDEX on `docType`, `date` |
| `Court` | `name: String!`, `jurisdiction: String`, `level: "district"\|"high"\|"supreme"` | UNIQUE constraint on `name` |
| `LegalAct` | `name: String!`, `section: String`, `year: Int` | UNIQUE on `(name, section)` |
| `Organisation` | `name: String!`, `type: "bank"\|"authority"\|"registrar"`, `jurisdiction: String` | UNIQUE on `name` |

### Relationship Types & Properties

| Relationship | From → To | Properties |
|-------------|-----------|-----------|
| `OWNS` | `Person → Property` | `since: Date`, `transferType: "sale"\|"inheritance"\|"gift"\|"court_order"`, `sourceDoc: String` |
| `REFERENCES` | `Document → LegalAct` | `section: String`, `context: String` |
| `INVOLVES` | `Document → Person` | `role: "buyer"\|"seller"\|"plaintiff"\|"defendant"\|"witness"` |
| `CONCERNS` | `Document → Property` | `nature: "transfer"\|"dispute"\|"mortgage"\|"lease"` |
| `ISSUED` | `Court → Document` | `caseNumber: String`, `date: Date` |
| `DISPUTES` | `Document → Property` | `caseId: String`, `status: "active"\|"resolved"` |
| `SUPERSEDES` | `Document → Document` | `reason: String`, `date: Date` |

### Schema Cypher (`neo4j/schema.cypher`)
```cypher
CREATE CONSTRAINT person_name_id IF NOT EXISTS FOR (p:Person) REQUIRE (p.name, p.id) IS UNIQUE;
CREATE CONSTRAINT property_id IF NOT EXISTS FOR (pr:Property) REQUIRE pr.id IS UNIQUE;
CREATE CONSTRAINT document_hash IF NOT EXISTS FOR (d:Document) REQUIRE d.hash IS UNIQUE;
CREATE CONSTRAINT court_name IF NOT EXISTS FOR (c:Court) REQUIRE c.name IS UNIQUE;
CREATE CONSTRAINT legalact_name_section IF NOT EXISTS FOR (l:LegalAct) REQUIRE (l.name, l.section) IS UNIQUE;
CREATE CONSTRAINT org_name IF NOT EXISTS FOR (o:Organisation) REQUIRE o.name IS UNIQUE;

CREATE INDEX doc_type_idx IF NOT EXISTS FOR (d:Document) ON (d.docType);
CREATE INDEX doc_date_idx IF NOT EXISTS FOR (d:Document) ON (d.date);
CREATE INDEX doc_risk_idx IF NOT EXISTS FOR (d:Document) ON (d.riskScore);
CREATE INDEX property_survey_idx IF NOT EXISTS FOR (p:Property) ON (p.surveyNumber);
CREATE FULLTEXT INDEX node_name_search IF NOT EXISTS FOR (n:Person|Property|Court|Organisation) ON EACH [n.name];
```

---

## Hyperledger Fabric Ledger Schemas

### State Objects (stored as JSON bytes via PutState)

**Key format**: `DOC_{docHash}` for documents, `DISPUTE_{caseId}_{docHash}` for disputes

#### DocumentRecord
```json
{
  "docHash": "sha256hex...",
  "ipfsCID": "bafybeig...",
  "ownerId": "PERSON_001",
  "deviceId": "DEV_A1B2C3D4",
  "timestamp": "2024-03-15T10:30:00Z",
  "docType": "sale_deed",
  "metadata": {
    "propertyId": "PROP_KA_BLR_001",
    "buyer": "Person A",
    "seller": "Person B",
    "value": "5000000"
  },
  "activeDispute": false,
  "disputeCaseId": "",
  "riskScore": 15.5,
  "createdAt": "2024-03-15T10:30:05Z"
}
```

#### DisputeRecord
```json
{
  "caseId": "CASE_2024_001",
  "docHash": "sha256hex...",
  "filedBy": "PERSON_003",
  "filedAt": "2024-04-01T09:00:00Z",
  "resolved": false,
  "resolvedAt": ""
}
```

### Composite Key Indexes
- `owner~docHash` — for `GetDocumentsByOwner` range queries
- `docType~docHash` — for filtering by document type

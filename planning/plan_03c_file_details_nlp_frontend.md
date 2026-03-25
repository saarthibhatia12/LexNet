# Section 3C — File-by-File Details: NLP Pipeline & Frontend

[← Back to Index](file:///C:/Users/sbrbs/.gemini/antigravity/brain/aa37d9b8-3977-4d6d-bd30-54083b104657/implementation_plan.md)

---

## NLP Pipeline (`nlp/`)

### `src/app.py`
- **Purpose**: Flask HTTP server exposing NLP processing endpoint
- **Routes**:
  - `POST /nlp/process` — JSON body `{docHash, ipfsCID, metadata}`. Runs full pipeline (OCR → NER → Relations → Graph → Conflict). Returns `{status, riskScore, entitiesFound, triplesInserted}`. Timeout: 120s.
  - `GET /nlp/health` — Returns `{status: "ok", models_loaded: true/false}`
- **Startup**: Preloads Legal-BERT model + spaCy pipeline on app init (30-60s cold start). Uses `@app.before_first_request` equivalent.
- **Edge cases**: Model not downloaded → return 503 with instructions. IPFS unreachable (needs to fetch doc) → return 502. Processing timeout → return 504.

### `src/pipeline/ocr.py`
- **Function**: `def extract_text_from_pdf(pdf_path: str) -> str`
  1. Try `pypdf.PdfReader` for text extraction first (native text PDFs)
  2. If extracted text < 50 chars → assume scanned, run Tesseract OCR
  3. Tesseract: convert PDF pages to images (Pillow), `pytesseract.image_to_string()` per page
  4. Concatenate all page texts
- **Config**: `TESSERACT_CMD` env var (path to tesseract binary)
- **Edge cases**: Encrypted PDF → raise `EncryptedPDFError`. Zero pages → raise `EmptyPDFError`. Tesseract not installed → raise `TesseractNotFoundError` with install instructions. Non-English text → still process (Tesseract lang packs configurable).

### `src/pipeline/ner.py`
- **Function**: `def extract_entities(text: str) -> List[Entity]`
  1. Tokenize with `AutoTokenizer.from_pretrained("nlpaueb/legal-bert-base-uncased")`
  2. Run through fine-tuned NER model (or zero-shot with custom labels)
  3. Post-process: merge BIO tags, deduplicate overlapping spans
  4. Entity types: `PERSON`, `PROPERTY_ID`, `SURVEY_NUMBER`, `DATE`, `MONETARY_VALUE`, `JURISDICTION`, `LEGAL_SECTION`, `ORGANISATION`
- **Custom labels file**: `data/ner_labels.json` maps model output tags to domain labels
- **Edge cases**: Text > 512 tokens → sliding window with 128 overlap, merge results. Empty text → return `[]`. Low-confidence entities (< 0.5) → filtered out.

> [!TIP]
> **Stuck mitigation — Legal-BERT fine-tuning**: If fine-tuning is too complex, use spaCy's `EntityRuler` with regex patterns for Indian legal entities (survey numbers like "Sy.No.123/4", section references like "Section 34 of IPC"). This gives 70-80% accuracy without ML training.

### `src/pipeline/rel_extract.py`
- **Function**: `def extract_relations(text: str, entities: List[Entity]) -> List[Triple]`
  1. Load spaCy `en_core_web_sm` for dependency parsing
  2. Rule-based patterns:
     - `(PERSON) + "owns/purchased/sold" + (PROPERTY_ID)` → `(Person)-[:OWNS]->(Property)`
     - `(DOCUMENT) + "references/cites" + (LEGAL_SECTION)` → `(Document)-[:REFERENCES]->(LegalAct)`
     - `(COURT) + "issued/ordered" + (DOCUMENT)` → `(Court)-[:ISSUED]->(Document)`
     - `(DOCUMENT) + "supersedes/amends/replaces" + (DOCUMENT)` → `(Document)-[:SUPERSEDES]->(Document)`
     - `(DOCUMENT) + "disputes/challenges" + (PROPERTY_ID)` → `(Document)-[:DISPUTES]->(Property)`
  3. Window-based co-occurrence: entities within 50-token window → `INVOLVES` relation
- **Edge cases**: No entities found → return `[]`. Duplicate triples → deduplicate. Self-referencing triples → filter out.

### `src/pipeline/graph_insert.py`
- **Function**: `def insert_triples(triples: List[Triple], doc_hash: str) -> int`
  1. Convert each triple to a Cypher `MERGE` statement
  2. MERGE nodes first (by unique property: person name, property ID, doc hash)
  3. MERGE relationships
  4. Return count of nodes + relationships created
- **Cypher examples**:
  ```cypher
  MERGE (p:Person {name: $name})
  MERGE (prop:Property {id: $propertyId})
  MERGE (p)-[:OWNS {since: $date, transferType: $type, sourceDoc: $docHash}]->(prop)
  ```
- **Batch**: All statements run in a single Neo4j transaction for atomicity.
- **Edge cases**: Neo4j constraint violation (duplicate) → MERGE handles gracefully. Empty triples → return 0. Transaction failure → rollback, raise.

### `src/pipeline/conflict.py`
- **Function**: `def compute_risk_score(doc_hash: str, doc_metadata: dict, graph_features: dict) -> RiskResult`
  1. **Feature extraction** from metadata: `doc_age_days`, `num_previous_transfers`, `num_linked_disputes`, `owner_change_frequency`, `has_court_involvement`, `monetary_value_normalized`
  2. **Graph queries** for features: duplicate property-person OWNS edges, conflicting dates, circular ownership chains
  3. **XGBoost predict**: Load `conflict_model.pkl`, predict probability (0-1), scale to 0-100
  4. **Rule-based flags**: Property with >3 owners in past year → flag "RAPID_TRANSFER". Document referencing non-existent legal section → flag "INVALID_REFERENCE". Owner mismatch with previous record → flag "OWNERSHIP_CONFLICT"
  5. **Combined score**: `max(xgboost_score, rule_score)` — conservative approach
- **Returns**: `RiskResult(score=72.5, flags=["RAPID_TRANSFER","OWNERSHIP_CONFLICT"], explanation="Multiple ownership transfers in 30 days")`
- **Edge cases**: New document (no graph history) → score defaults to 10 (low risk). Model file not found → use rule-based only, log warning.

### `scripts/train_conflict_model.py`
- **Function**: `def train_model(data_path: str, output_path: str) -> dict`
  1. Load synthetic CSV (from `data/scripts/generate_conflict_data.py`)
  2. Features: 8 columns, binary label (fraud=1/legit=0)
  3. Train-test split 80/20, XGBoost with `max_depth=6`, `n_estimators=100`
  4. Save model to `data/conflict_model.pkl`
  5. Return metrics dict `{accuracy, precision, recall, f1}`

---

## Frontend (`frontend/`)

### `src/main.tsx`
- Renders `<ApolloProvider>` wrapping `<BrowserRouter>` wrapping `<AuthProvider>` wrapping `<App />`
- Imports `index.css` for Tailwind

### `src/App.tsx`
- Route definitions:
  - `/login` → `LoginPage`
  - `/dashboard` → `DashboardPage` (protected)
  - `/register` → `RegisterPage` (protected)
  - `/graph` → `GraphExplorerPage` (protected)
  - `/verify` → `VerifyPage` (public)
  - `/verify/:hash` → `VerifyPage` (public, pre-filled)
  - `/conflicts` → `ConflictPage` (protected)
  - `/timeline/:propertyId` → `TimelinePage` (protected)
  - `/document/:hash` → `DocumentDetailPage` (protected)
- Layout: `<Navbar />` + `<Sidebar />` (officials), public pages have no sidebar

### `src/pages/RegisterPage.tsx`
- **State**: `{ file, docType, ownerId, metadata, fingerprintStatus, uploading, result }`
- **Flow**:
  1. User fills form, uploads PDF via `<FileUpload />`
  2. Clicks "Authenticate" → triggers fingerprint flow, shows `<FingerprintStatus />`
  3. Frontend polls `/api/auth/hardware/status` every 2s until bridge confirms auth
  4. On auth success → sends `registerDocument` mutation with file + metadata
  5. On success → shows `<QRDisplay />` with download link for QR-embedded PDF
- **Edge cases**: File too large (>50MB) → client-side reject. No fingerprint response in 30s → timeout message. Upload failure → retry button.

### `src/pages/GraphExplorerPage.tsx`
- **D3.js integration** via `<GraphCanvas />`:
  - Force simulation: `d3.forceSimulation()` with `forceLink`, `forceManyBody(-300)`, `forceCenter`
  - Node colours by type: Person=blue, Property=green, Document=orange, Court=red, LegalAct=purple, Organisation=yellow
  - Click node → shows `<NodeDetail />` side panel with properties + neighbors
  - Search bar → `searchNodes` query → highlights matching nodes
  - Zoom/pan via `d3.zoom()`
- **Data flow**: `useGraph` hook fetches `getKnowledgeGraph` query, transforms to D3 node/link format

### `src/pages/VerifyPage.tsx`
- **Purpose**: Public verification — no login required
- **Input methods**: (1) Paste document hash, (2) Upload QR code image (decoded client-side using `jsQR`)
- **Display**: `<VerificationResult />` shows status badge (green AUTHENTIC / red TAMPERED / grey NOT REGISTERED) + document metadata + ownership graph snippet

### `src/pages/ConflictPage.tsx`
- **Sections**: (1) Real-time risk feed (polling every 30s), (2) Flagged documents table with risk score, flags, date
- **Components**: `<RiskBadge />` colour-coded (0-30 green, 31-60 yellow, 61-100 red), sortable table, click to open `DocumentDetailPage`

### `src/context/AuthContext.tsx`
- **State**: `{ token, user, isAuthenticated }`
- **Functions**: `login(username, password)` → calls mutation → stores JWT in localStorage. `logout()` → clears token. `getToken()` → returns current token.
- **On mount**: Checks localStorage for existing token, validates expiry.

### `src/apollo/client.ts`
- Creates `ApolloClient` with `HttpLink` to `http://localhost:4000/graphql`
- Auth link: adds `Authorization: Bearer {token}` header from `AuthContext`
- Error link: handles 401 → auto-logout, network errors → toast notification
- In-memory cache with type policies for `Document` (keyField: `docHash`)

> [!IMPORTANT]
> **Stuck mitigation — D3.js + React**: D3's imperative DOM manipulation conflicts with React's virtual DOM. Use the "D3 for math, React for DOM" pattern: D3 computes positions via `forceSimulation`, React renders SVG elements. Use `useRef` for the SVG container and `useEffect` for simulation updates.

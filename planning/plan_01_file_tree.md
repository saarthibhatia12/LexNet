# Section 1 — Full Folder & File Tree

[← Back to Index](file:///C:/Users/sbrbs/.gemini/antigravity/brain/aa37d9b8-3977-4d6d-bd30-54083b104657/implementation_plan.md)

> Every file that must be created. One-line description per file.

```
lexnet/
├── .gitignore                          # Ignore node_modules, __pycache__, .env, build artifacts
├── .env.example                        # Template for all env vars across services
├── README.md                           # Project overview, setup instructions, architecture summary
├── LICENSE                             # MIT license
│
├── blockchain/
│   ├── chaincode/
│   │   ├── lexnet-cc/
│   │   │   ├── go.mod                  # Go module definition for chaincode (module lexnet-cc)
│   │   │   ├── go.sum                  # Go dependency checksums
│   │   │   ├── main.go                 # Chaincode entry point — registers LexNetContract
│   │   │   ├── contract.go             # All 8 chaincode functions (StoreDocument, GetDocument, etc.)
│   │   │   ├── models.go              # DocumentRecord, DisputeRecord struct definitions
│   │   │   └── contract_test.go       # Unit tests using mock stub for all 8 functions
│   ├── network/
│   │   ├── configtx.yaml              # Channel and org policies (Org1=Govt, Org2=Verifier)
│   │   ├── crypto-config.yaml         # Crypto material generation config (cryptogen)
│   │   ├── docker-compose-fabric.yaml # Peer, orderer, CA containers for local test network
│   │   └── scripts/
│   │       ├── setup-network.sh       # Creates channel, joins peers, installs chaincode
│   │       ├── teardown-network.sh    # Stops containers, removes volumes and crypto
│   │       └── generate-crypto.sh     # Runs cryptogen and configtxgen
│   └── README.md                      # Blockchain module setup instructions
│
├── backend/
│   ├── package.json                   # Dependencies: express, apollo-server-express, fabric-network, ipfs-http-client, neo4j-driver, jsonwebtoken, multer, crypto, qrcode, uuid
│   ├── package-lock.json              # Lock file (auto-generated)
│   ├── tsconfig.json                  # TypeScript config (strict mode, ES2022 target)
│   ├── .env                           # All backend env vars (FABRIC_*, IPFS_*, NEO4J_*, JWT_*)
│   ├── .env.example                   # Template with descriptions
│   ├── src/
│   │   ├── index.ts                   # Express + Apollo server bootstrap, middleware registration
│   │   ├── config/
│   │   │   ├── env.ts                 # Zod-validated env var loader with defaults
│   │   │   ├── fabric.ts              # Fabric gateway connection profile loader
│   │   │   └── logger.ts              # Winston logger setup (console + file transports)
│   │   ├── middleware/
│   │   │   ├── auth.ts                # JWT verification middleware (HS256, checks exp + iss)
│   │   │   ├── rateLimiter.ts         # express-rate-limit config (100 req/15min per IP)
│   │   │   ├── errorHandler.ts        # Global error handler — maps to GraphQL/REST errors
│   │   │   └── inputSanitizer.ts      # DOMPurify + express-validator sanitisation
│   │   ├── graphql/
│   │   │   ├── schema.ts             # GraphQL type definitions (SDL)
│   │   │   ├── resolvers/
│   │   │   │   ├── index.ts          # Resolver map aggregator
│   │   │   │   ├── documentResolvers.ts   # registerDocument, getDocument, verifyDocument, getDocumentHistory
│   │   │   │   ├── graphResolvers.ts      # getKnowledgeGraph, searchNodes, getNodeNeighbors
│   │   │   │   ├── conflictResolvers.ts   # getConflicts, getRiskScore, getFlaggedDocuments
│   │   │   │   ├── authResolvers.ts       # login, validateHardwareToken
│   │   │   │   └── timelineResolvers.ts   # getPropertyTimeline, getDocumentEvents
│   │   │   └── directives/
│   │   │       └── authDirective.ts  # @auth directive — blocks unauthenticated queries
│   │   ├── services/
│   │   │   ├── fabricService.ts       # Fabric SDK wrapper — submitTransaction, evaluateTransaction
│   │   │   ├── ipfsService.ts         # IPFS upload (AES-256-GCM encrypt first), retrieve + decrypt
│   │   │   ├── encryptionService.ts   # AES-256-GCM encrypt/decrypt with random IV + auth tag
│   │   │   ├── neo4jService.ts        # Neo4j driver wrapper — runCypher, close
│   │   │   ├── qrService.ts          # QR code generation (doc hash + verification URL)
│   │   │   ├── pdfService.ts         # Embed QR image into PDF using pdf-lib
│   │   │   ├── hashService.ts        # SHA-256 hashing of file buffers
│   │   │   └── nlpTriggerService.ts  # Enqueue NLP job via HTTP POST to Python NLP service
│   │   ├── rest/
│   │   │   ├── routes.ts             # REST router — /api/auth/hardware, /api/verify/:hash, /api/health
│   │   │   ├── hardwareAuthController.ts  # Receives bridge JWT, validates, issues session JWT
│   │   │   └── verifyController.ts   # Public verification endpoint — no auth required
│   │   ├── utils/
│   │   │   ├── validators.ts         # Zod schemas for all request payloads
│   │   │   └── constants.ts          # Magic numbers, key lengths, default timeouts
│   │   └── types/
│   │       └── index.ts              # TypeScript interfaces: DocumentRecord, VerificationResult, etc.
│   ├── tests/
│   │   ├── unit/
│   │   │   ├── encryptionService.test.ts   # Encrypt-decrypt round trip, wrong key, corrupted ciphertext
│   │   │   ├── hashService.test.ts         # Known SHA-256 vectors
│   │   │   ├── qrService.test.ts           # QR generation + decode round trip
│   │   │   ├── fabricService.test.ts       # Mocked Fabric gateway calls
│   │   │   └── auth.test.ts                # JWT creation, expiry, tampering
│   │   ├── integration/
│   │   │   ├── documentFlow.test.ts        # Full register → verify cycle with mocked Fabric/IPFS
│   │   │   └── graphqlEndpoints.test.ts    # Apollo test client — all queries/mutations
│   │   └── jest.config.ts                  # Jest + ts-jest config
│   └── README.md                           # Backend setup instructions
│
├── nlp/
│   ├── requirements.txt              # transformers, spacy, pytesseract, scikit-learn, xgboost, neo4j, Pillow, pypdf, reportlab, flask, pydantic
│   ├── setup.py                      # Package definition for lexnet-nlp
│   ├── .env                          # NEO4J_URI, NER_MODEL_PATH, TESSERACT_CMD
│   ├── .env.example                  # Template
│   ├── src/
│   │   ├── __init__.py               # Package init
│   │   ├── app.py                    # Flask server — /nlp/process endpoint, health check
│   │   ├── config.py                 # Env var loader using pydantic BaseSettings
│   │   ├── pipeline/
│   │   │   ├── __init__.py
│   │   │   ├── ocr.py                # Tesseract PDF-to-text: extract_text_from_pdf(pdf_path) → str
│   │   │   ├── ner.py                # Legal-BERT NER: extract_entities(text) → List[Entity]
│   │   │   ├── rel_extract.py        # spaCy + rule patterns: extract_relations(text, entities) → List[Triple]
│   │   │   ├── graph_insert.py       # Cypher builder: insert_triples(triples) → int (nodes created)
│   │   │   └── conflict.py           # XGBoost scorer: compute_risk_score(doc_meta, graph_features) → float
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── entity.py             # Entity dataclass: text, label, start, end, confidence
│   │   │   ├── triple.py             # Triple dataclass: subject, predicate, object_, source_span
│   │   │   └── risk.py               # RiskResult dataclass: score, flags[], explanation
│   │   └── utils/
│   │       ├── __init__.py
│   │       ├── text_clean.py         # Normalise unicode, strip headers/footers, fix OCR artefacts
│   │       └── neo4j_driver.py       # Neo4j driver singleton: get_driver(), run_query()
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── test_ocr.py              # OCR on known scanned PDF fixture
│   │   ├── test_ner.py              # NER on annotated legal text samples
│   │   ├── test_rel_extract.py      # Relation extraction on known triples
│   │   ├── test_conflict.py         # Risk scoring on synthetic features
│   │   └── test_graph_insert.py     # Cypher generation correctness
│   ├── data/
│   │   ├── ner_labels.json          # Custom NER label map for legal domain
│   │   └── conflict_model.pkl       # Pre-trained XGBoost model (binary, gitignored, created by training script)
│   ├── scripts/
│   │   ├── train_conflict_model.py  # Train XGBoost on synthetic data, save .pkl
│   │   └── download_models.py       # Download Legal-BERT + spaCy en_core_web_sm
│   └── README.md                    # NLP module setup
│
├── hardware-bridge/
│   ├── requirements.txt             # pyserial, pyjwt, requests, python-dotenv
│   ├── .env                         # SERIAL_PORT, BAUD_RATE, JWT_SECRET, API_URL
│   ├── .env.example                 # Template
│   ├── src/
│   │   ├── __init__.py
│   │   ├── bridge.py                # Main loop: read UART → validate → JWT → POST → ACK
│   │   ├── uart_reader.py           # Serial port reader: read_packet(port) → bytes (16)
│   │   ├── crc16.py                 # CRC-16/CCITT: compute_crc16(data: bytes) → int
│   │   ├── packet_parser.py         # Unpack 16-byte packet → ParsedPacket dataclass
│   │   ├── jwt_generator.py         # Create HS256 JWT with device_id, finger_score, exp=5min
│   │   ├── api_client.py            # POST to Node.js /api/auth/hardware with JWT bearer
│   │   └── config.py                # Env var loader
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── test_crc16.py            # Known CRC vectors
│   │   ├── test_packet_parser.py    # Valid packet, truncated, bad CRC, stale timestamp
│   │   ├── test_jwt_generator.py    # Token creation + decode verification
│   │   └── test_bridge.py           # Full flow with mocked serial + mocked HTTP
│   ├── simulator/
│   │   └── stm32_simulator.py       # Sends fake 16-byte packets over virtual serial port for dev testing
│   └── README.md                    # Hardware bridge setup
│
├── firmware/
│   ├── Inc/
│   │   ├── main.h                   # Pin definitions, constants, function prototypes
│   │   ├── fingerprint.h            # R307 driver prototypes: fp_init, fp_capture, fp_match, fp_get_score
│   │   ├── oled.h                   # SSD1306 driver prototypes: oled_init, oled_clear, oled_print
│   │   ├── uart_comm.h             # UART TX prototypes: send_auth_packet, receive_ack
│   │   ├── buzzer.h                # Buzzer prototypes: buzzer_success, buzzer_fail
│   │   └── crc16.h                 # CRC-16/CCITT for STM32 side
│   ├── Src/
│   │   ├── main.c                  # System init, super-loop: wait for fingerprint → build packet → send UART → read ACK → buzzer/OLED
│   │   ├── fingerprint.c           # R307 UART driver: initialize, capture image, search, get score
│   │   ├── oled.c                  # SSD1306 I2C driver: init, clear, write string at row/col
│   │   ├── uart_comm.c            # Pack 16-byte struct, UART transmit, receive 1-byte ACK
│   │   ├── buzzer.c               # GPIO toggle for success (2 short beeps) / fail (1 long beep)
│   │   └── crc16.c                # CRC-16 lookup table implementation
│   ├── lexnet-firmware.ioc         # STM32CubeMX project file (pin config reference)
│   └── README.md                   # Firmware module — build with STM32CubeIDE, flash via ST-Link
│
├── frontend/
│   ├── package.json                # Dependencies: react, react-dom, react-router-dom, @apollo/client, d3, tailwindcss, axios, qrcode.react, lucide-react
│   ├── vite.config.ts              # Vite config with proxy to backend:4000
│   ├── tailwind.config.js          # TailwindCSS 3 config with custom LexNet theme colours
│   ├── postcss.config.js           # PostCSS with tailwind + autoprefixer
│   ├── tsconfig.json               # TypeScript config
│   ├── index.html                  # Root HTML with <div id="root">
│   ├── public/
│   │   └── favicon.svg             # LexNet logo/favicon
│   ├── src/
│   │   ├── main.tsx                # React root render, ApolloProvider, BrowserRouter
│   │   ├── App.tsx                 # Route definitions, layout wrapper
│   │   ├── index.css               # Tailwind imports + global styles
│   │   ├── apollo/
│   │   │   └── client.ts           # Apollo Client setup with httpLink + error handling
│   │   ├── graphql/
│   │   │   ├── queries.ts          # All GQL query strings (GET_DOCUMENT, GET_GRAPH, etc.)
│   │   │   └── mutations.ts        # All GQL mutation strings (REGISTER_DOCUMENT, LOGIN, etc.)
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx           # Username + password form for officials
│   │   │   ├── DashboardPage.tsx       # Main official dashboard — recent docs, risk alerts
│   │   │   ├── RegisterPage.tsx        # Upload doc, metadata form, fingerprint auth, QR display
│   │   │   ├── GraphExplorerPage.tsx   # D3.js force graph, search bar, node click details
│   │   │   ├── VerifyPage.tsx          # Public — QR scan/upload or hash paste, result display
│   │   │   ├── ConflictPage.tsx        # Risk feed, flagged document cards, score breakdown
│   │   │   ├── TimelinePage.tsx        # Chronological event timeline for a property
│   │   │   └── DocumentDetailPage.tsx  # Full doc metadata, blockchain record, graph neighbours
│   │   ├── components/
│   │   │   ├── Navbar.tsx              # Top nav with links, auth status, logout
│   │   │   ├── Sidebar.tsx             # Side navigation for official dashboard
│   │   │   ├── ProtectedRoute.tsx      # Redirect to login if no valid JWT in localStorage
│   │   │   ├── FileUpload.tsx          # Drag-and-drop file upload with progress bar
│   │   │   ├── FingerprintStatus.tsx   # STM32 auth status indicator (waiting/success/fail)
│   │   │   ├── QRDisplay.tsx           # QR code render using qrcode.react
│   │   │   ├── RiskBadge.tsx           # Colour-coded risk score badge (green/yellow/red)
│   │   │   ├── GraphCanvas.tsx         # D3.js SVG canvas wrapper with zoom/pan
│   │   │   ├── NodeDetail.tsx          # Side panel showing clicked node properties
│   │   │   ├── TimelineItem.tsx        # Single timeline event card
│   │   │   ├── DocumentCard.tsx        # Document summary card for list views
│   │   │   └── VerificationResult.tsx  # Displays AUTHENTIC / TAMPERED / NOT REGISTERED
│   │   ├── hooks/
│   │   │   ├── useAuth.ts             # Auth context hook — login, logout, isAuthenticated
│   │   │   └── useGraph.ts            # D3 graph data fetcher + transformer
│   │   ├── context/
│   │   │   └── AuthContext.tsx         # React context for JWT + user state
│   │   └── utils/
│   │       ├── formatters.ts          # Date, hash, risk score display formatters
│   │       └── constants.ts           # API base URL, graph colours, risk thresholds
│   ├── tests/
│   │   ├── LoginPage.test.tsx         # Render, validation, submit, error state
│   │   ├── VerifyPage.test.tsx        # Hash input, QR upload, result display
│   │   └── setup.ts                   # Vitest + React Testing Library setup
│   └── README.md                      # Frontend setup instructions
│
├── neo4j/
│   ├── schema.cypher                  # CREATE CONSTRAINT, CREATE INDEX for all node types
│   ├── seed.cypher                    # Sample data: 10 persons, 5 properties, 8 documents, relationships
│   └── README.md                      # Neo4j module setup
│
├── data/
│   ├── sample-documents/
│   │   ├── sale_deed_01.pdf           # Synthetic sale deed PDF
│   │   ├── court_order_01.pdf         # Synthetic court order PDF
│   │   └── land_record_01.pdf         # Synthetic land record PDF
│   ├── scripts/
│   │   ├── generate_synthetic.py      # Python script to generate synthetic PDFs with reportlab
│   │   ├── fetch_indiankanoon.py      # Fetch sample judgments from Indian Kanoon API
│   │   └── generate_conflict_data.py  # Generate synthetic conflict training CSV
│   └── README.md                      # Data module description
│
├── docker/
│   ├── docker-compose.yml             # All services: backend, nlp, bridge-sim, neo4j, ipfs, fabric-peer, fabric-orderer, fabric-ca
│   ├── backend.Dockerfile             # Node.js 20 + build + run
│   ├── nlp.Dockerfile                 # Python 3.11 + Tesseract + model downloads
│   ├── bridge.Dockerfile              # Python 3.11 + pyserial
│   └── README.md                      # Docker setup instructions
│
└── docs/
    ├── architecture.md                # High-level architecture description + diagram
    ├── api-contract.md                # REST + GraphQL API documentation
    ├── uart-protocol.md               # UART packet format specification
    ├── deployment-guide.md            # Local setup step-by-step guide
    └── security.md                    # Security measures at each layer
```

**Total file count: ~120 files** (excluding auto-generated `node_modules`, `__pycache__`, `.next`, `build` dirs).

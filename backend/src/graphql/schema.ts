// ============================================================================
// LexNet Backend — GraphQL Schema (SDL)
// ============================================================================
//
// Full Schema Definition Language for the LexNet GraphQL API.
// Mirrors the TypeScript interfaces in types/index.ts and the
// planning spec in plan_04_api_endpoints.md.
// ============================================================================

export const typeDefs = `#graphql

  # ===========================================================================
  # Custom Directives
  # ===========================================================================

  directive @auth on FIELD_DEFINITION

  # ===========================================================================
  # Scalar Types
  # ===========================================================================

  scalar JSON

  # ===========================================================================
  # Enums
  # ===========================================================================

  enum VerificationStatus {
    AUTHENTIC
    TAMPERED
    NOT_REGISTERED
    ERROR
  }

  enum UserRole {
    admin
    registrar
    clerk
    official
  }

  enum Severity {
    low
    medium
    high
  }

  # ===========================================================================
  # Object Types — Blockchain / Documents
  # ===========================================================================

  type DocumentMetadata {
    propertyId: String
    buyer: String
    seller: String
    value: String
  }

  type Document {
    docHash: String!
    ipfsCID: String!
    ownerId: String!
    deviceId: String!
    timestamp: String!
    docType: String!
    metadata: DocumentMetadata
    activeDispute: Boolean!
    disputeCaseId: String
    riskScore: Float!
    createdAt: String!
  }

  type DisputeRecord {
    caseId: String!
    docHash: String!
    filedBy: String!
    filedAt: String!
    resolved: Boolean!
    resolvedAt: String
  }

  # ===========================================================================
  # Object Types — Verification
  # ===========================================================================

  type VerificationResult {
    status: VerificationStatus!
    docHash: String!
    timestamp: String
    document: Document
    message: String!
  }

  # ===========================================================================
  # Object Types — Graph / Neo4j
  # ===========================================================================

  type GraphNode {
    id: String!
    label: String!
    properties: JSON
  }

  type GraphEdge {
    id: String!
    source: String!
    target: String!
    type: String!
    properties: JSON
  }

  type GraphData {
    nodes: [GraphNode!]!
    edges: [GraphEdge!]!
  }

  type NodeSearchResult {
    id: String!
    label: String!
    name: String!
    score: Float!
  }

  # ===========================================================================
  # Object Types — Timeline
  # ===========================================================================

  type TimelineEvent {
    id: String!
    eventType: String!
    timestamp: String!
    description: String!
    docHash: String
    actor: String
    metadata: JSON
  }

  type PropertyTimeline {
    propertyId: String!
    events: [TimelineEvent!]!
  }

  # ===========================================================================
  # Object Types — Conflict / Risk
  # ===========================================================================

  type ConflictFlag {
    type: String!
    severity: Severity!
    description: String!
    relatedDocHash: String
  }

  type RiskAssessment {
    docHash: String!
    riskScore: Float!
    flags: [ConflictFlag!]!
    assessedAt: String!
  }

  type FlaggedDocument {
    document: Document!
    riskScore: Float!
    flags: [ConflictFlag!]!
  }

  # ===========================================================================
  # Object Types — Authentication
  # ===========================================================================

  type AuthPayload {
    token: String!
    userId: String!
    role: UserRole!
    expiresIn: String!
  }

  # ===========================================================================
  # Object Types — Registration Result
  # ===========================================================================

  type RegisterResult {
    docHash: String!
    ipfsCID: String!
    qrCodeBase64: String!
    verificationUrl: String!
    timestamp: String!
  }

  # ===========================================================================
  # Input Types
  # ===========================================================================

  input RegisterDocumentInput {
    fileBase64: String!
    docType: String!
    ownerId: String!
    deviceId: String!
    metadata: RegisterMetadataInput
  }

  input RegisterMetadataInput {
    propertyId: String
    buyer: String
    seller: String
    value: String
  }

  # ===========================================================================
  # Queries
  # ===========================================================================

  type Query {
    """Get a document record from the blockchain"""
    getDocument(docHash: String!): Document @auth

    """Get the transaction history for a document"""
    getDocumentHistory(docHash: String!): [Document!]! @auth

    """Verify a document's authenticity (public)"""
    verifyDocument(docHash: String!): VerificationResult!

    """Get all documents owned by a specific owner"""
    getDocumentsByOwner(ownerId: String!): [Document!]! @auth

    """Get the knowledge graph around a document (public)"""
    getKnowledgeGraph(docHash: String!, depth: Int): GraphData!

    """Search for nodes in the knowledge graph (public)"""
    searchNodes(query: String!): [NodeSearchResult!]!

    """Get the timeline of events for a property (public)"""
    getPropertyTimeline(propertyId: String!): PropertyTimeline!

    """Get document events from blockchain history"""
    getDocumentEvents(docHash: String!): [TimelineEvent!]! @auth

    """Get conflict alerts (paginated)"""
    getConflicts(limit: Int, offset: Int): [RiskAssessment!]! @auth

    """Get the risk score for a specific document"""
    getRiskScore(docHash: String!): RiskAssessment @auth

    """Get documents flagged above a risk threshold"""
    getFlaggedDocuments(minRisk: Float): [FlaggedDocument!]! @auth
  }

  # ===========================================================================
  # Mutations
  # ===========================================================================

  type Mutation {
    """Authenticate with demo credentials (public)"""
    login(username: String!, password: String!): AuthPayload!

    """Register a new document (full pipeline)"""
    registerDocument(input: RegisterDocumentInput!): RegisterResult! @auth

    """Transfer document ownership"""
    transferDocument(docHash: String!, newOwnerId: String!): Document! @auth

    """File a dispute against a document"""
    addDispute(docHash: String!, caseId: String!, filedBy: String): Document! @auth

    """Resolve an existing dispute"""
    resolveDispute(docHash: String!, caseId: String!): Document! @auth
  }
`;

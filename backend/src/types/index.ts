// ============================================================================
// LexNet Backend — TypeScript Interfaces
// ============================================================================
//
// These types define the contracts used across all backend services,
// controllers, GraphQL resolvers, and middleware. They mirror the schemas
// defined in the Hyperledger Fabric chaincode (Go structs) and the Neo4j
// graph database.
// ============================================================================

import type { Request } from 'express';

// ---------------------------------------------------------------------------
// Blockchain / Fabric
// ---------------------------------------------------------------------------

/** Matches the DocumentRecord struct in chaincode/lexnet-cc/models.go */
export interface DocumentRecord {
  docHash: string;
  ipfsCID: string;
  ownerId: string;
  deviceId: string;
  timestamp: string;       // ISO 8601
  docType: string;
  metadata: DocumentMetadata;
  activeDispute: boolean;
  disputeCaseId: string;
  riskScore: number;
  createdAt: string;        // ISO 8601
}

/** Free-form metadata stored inside a DocumentRecord */
export interface DocumentMetadata {
  propertyId?: string;
  buyer?: string;
  seller?: string;
  value?: string;
  [key: string]: string | undefined;
}

/** Matches the DisputeRecord struct in chaincode/lexnet-cc/models.go */
export interface DisputeRecord {
  caseId: string;
  docHash: string;
  filedBy: string;
  filedAt: string;          // ISO 8601
  resolved: boolean;
  resolvedAt: string;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export type VerificationStatus =
  | 'AUTHENTIC'
  | 'TAMPERED'
  | 'NOT_REGISTERED'
  | 'ERROR';

export interface VerificationResult {
  status: VerificationStatus;
  docHash: string;
  timestamp?: string;
  document?: DocumentRecord;
  message: string;
}

// ---------------------------------------------------------------------------
// Neo4j Knowledge Graph
// ---------------------------------------------------------------------------

/** A node in the knowledge graph (used by D3 on the frontend) */
export interface GraphNode {
  id: string;
  label: string;            // Neo4j label: Person, Property, Document, etc.
  properties: Record<string, string | number | boolean | null>;
}

/** An edge in the knowledge graph */
export interface GraphEdge {
  id: string;
  source: string;           // source node ID
  target: string;           // target node ID
  type: string;             // relationship type: OWNS, REFERENCES, etc.
  properties: Record<string, string | number | boolean | null>;
}

/** Complete graph payload returned by getKnowledgeGraph */
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Search result from full-text node search */
export interface NodeSearchResult {
  id: string;
  label: string;
  name: string;
  score: number;
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export interface TimelineEvent {
  id: string;
  eventType: string;        // e.g. "transfer", "dispute_filed", "registration"
  timestamp: string;
  description: string;
  docHash?: string;
  actor?: string;
  metadata?: Record<string, string>;
}

export interface PropertyTimeline {
  propertyId: string;
  events: TimelineEvent[];
}

// ---------------------------------------------------------------------------
// Conflict / Risk
// ---------------------------------------------------------------------------

export interface ConflictFlag {
  type: string;             // e.g. "RAPID_TRANSFER", "OWNERSHIP_CONFLICT"
  severity: 'low' | 'medium' | 'high';
  description: string;
  relatedDocHash?: string;
}

export interface RiskAssessment {
  docHash: string;
  riskScore: number;
  flags: ConflictFlag[];
  assessedAt: string;
}

export interface FlaggedDocument {
  document: DocumentRecord;
  riskScore: number;
  flags: ConflictFlag[];
}

// ---------------------------------------------------------------------------
// NLP Service
// ---------------------------------------------------------------------------

/** Request body for POST /nlp/process */
export interface NlpProcessRequest {
  docHash: string;
  ipfsCID: string;
  metadata: {
    docType: string;
    ownerId: string;
  };
}

/** Response from POST /nlp/process */
export interface NlpProcessResponse {
  status: 'completed' | 'failed';
  riskScore: number;
  entitiesFound: number;
  triplesInserted: number;
  flags: string[];
  processingTimeMs: number;
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/** JWT payload issued by the hardware bridge (HS256, 5-min expiry) */
export interface HardwareJwtPayload {
  device_id: string;
  finger_score: number;
  iat: number;
  exp: number;
  iss: 'lexnet-bridge';
}

/** Session JWT payload issued by the backend (HS256, 1-hour expiry) */
export interface SessionJwtPayload {
  userId: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export type UserRole = 'admin' | 'registrar' | 'clerk' | 'official';

/** Demo user definition for hardcoded login (acceptable for student project) */
export interface DemoUser {
  username: string;
  password: string;
  role: UserRole;
}

// ---------------------------------------------------------------------------
// Express Request Extensions
// ---------------------------------------------------------------------------

/** Express Request extended with authenticated user data */
export interface AuthenticatedRequest extends Request {
  user?: SessionJwtPayload;
}

// ---------------------------------------------------------------------------
// Encryption
// ---------------------------------------------------------------------------

/** Result of AES-256-GCM encryption */
export interface EncryptionResult {
  ciphertext: Buffer;
  iv: Buffer;              // 12 bytes
  authTag: Buffer;         // 16 bytes
}

/** Packed encrypted payload for IPFS storage */
export interface EncryptedPayload {
  ciphertext: string;      // base64
  iv: string;              // base64
  authTag: string;         // base64
}

// ---------------------------------------------------------------------------
// IPFS
// ---------------------------------------------------------------------------

export interface IpfsUploadResult {
  cid: string;
  size: number;
}

// ---------------------------------------------------------------------------
// QR Code
// ---------------------------------------------------------------------------

export interface QrCodeData {
  verificationUrl: string;
  docHash: string;
}

// ---------------------------------------------------------------------------
// Custom Error Classes
// ---------------------------------------------------------------------------

export class LexNetError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = 'LexNetError';
    this.statusCode = statusCode;
  }
}

export class DecryptionError extends LexNetError {
  constructor(message: string) {
    super(message, 400);
    this.name = 'DecryptionError';
  }
}

export class DocumentNotFoundError extends LexNetError {
  constructor(docHash: string) {
    super(`Document not found: ${docHash}`, 404);
    this.name = 'DocumentNotFoundError';
  }
}

export class AuthenticationError extends LexNetError {
  constructor(message: string = 'Authentication required') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends LexNetError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403);
    this.name = 'AuthorizationError';
  }
}

export class ValidationError extends LexNetError {
  constructor(message: string) {
    super(message, 400);
    this.name = 'ValidationError';
  }
}

export class FabricError extends LexNetError {
  constructor(message: string) {
    super(`Fabric network error: ${message}`, 502);
    this.name = 'FabricError';
  }
}

export class IpfsError extends LexNetError {
  constructor(message: string) {
    super(`IPFS error: ${message}`, 502);
    this.name = 'IpfsError';
  }
}

export class Neo4jError extends LexNetError {
  constructor(message: string) {
    super(`Neo4j error: ${message}`, 502);
    this.name = 'Neo4jError';
  }
}

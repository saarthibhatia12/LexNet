// ============================================================================
// LexNet Backend — Constants
// ============================================================================
//
// All magic numbers, key lengths, timeouts, and default configuration values.
// Import from here instead of hard-coding values in service files.
// ============================================================================

// ---------------------------------------------------------------------------
// Cryptography
// ---------------------------------------------------------------------------

/** AES-256-GCM key length in bytes */
export const AES_KEY_LENGTH_BYTES = 32;

/** AES-256-GCM key length in hex characters */
export const AES_KEY_LENGTH_HEX = 64;

/** AES-256-GCM initialisation vector length in bytes */
export const AES_IV_LENGTH_BYTES = 12;

/** AES-256-GCM authentication tag length in bytes */
export const AES_AUTH_TAG_LENGTH_BYTES = 16;

/** AES algorithm identifier for Node.js crypto */
export const AES_ALGORITHM = 'aes-256-gcm' as const;

/** SHA-256 hash output format */
export const HASH_OUTPUT_FORMAT = 'hex' as const;

/** SHA-256 hash algorithm identifier */
export const HASH_ALGORITHM = 'sha256' as const;

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/** JWT signing algorithm — HS256 only (no PKI infrastructure) */
export const JWT_ALGORITHM = 'HS256' as const;

/** Hardware bridge JWT issuer claim — must match exactly */
export const HARDWARE_JWT_ISSUER = 'lexnet-bridge' as const;

/** Hardware bridge JWT maximum age in seconds (5 minutes) */
export const HARDWARE_JWT_MAX_AGE_SEC = 300;

/** Minimum acceptable fingerprint score */
export const MIN_FINGER_SCORE = 60;

/** Session JWT default expiry (1 hour) */
export const SESSION_JWT_EXPIRY = '1h' as const;

// ---------------------------------------------------------------------------
// Demo Users (Hardcoded — Acceptable for Student Project)
// ---------------------------------------------------------------------------

import type { DemoUser } from '../types/index.js';

export const DEMO_USERS: readonly DemoUser[] = [
  { username: 'admin', password: 'admin123', role: 'admin' },
  { username: 'registrar', password: 'reg456', role: 'registrar' },
  { username: 'clerk', password: 'clerk789', role: 'clerk' },
] as const;

// ---------------------------------------------------------------------------
// IPFS
// ---------------------------------------------------------------------------

/** Maximum file size for IPFS upload in bytes (50 MB) */
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/** IPFS operation timeout in milliseconds (30 seconds) */
export const IPFS_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------

/** Global rate limit: max requests per window */
export const RATE_LIMIT_GLOBAL_MAX = 100;

/** Auth endpoint rate limit: max requests per window */
export const RATE_LIMIT_AUTH_MAX = 20;

/** Rate limit window duration in milliseconds (15 minutes) */
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

// ---------------------------------------------------------------------------
// Fabric
// ---------------------------------------------------------------------------

/** Fabric connection retry count */
export const FABRIC_RETRY_COUNT = 3;

/** Fabric connection retry delay in milliseconds */
export const FABRIC_RETRY_DELAY_MS = 2_000;

/** Fabric transaction timeout in seconds */
export const FABRIC_TX_TIMEOUT_SEC = 30;

// ---------------------------------------------------------------------------
// NLP Service
// ---------------------------------------------------------------------------

/** NLP trigger HTTP timeout in milliseconds (5 seconds) */
export const NLP_TRIGGER_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Neo4j
// ---------------------------------------------------------------------------

/** Default graph traversal depth for knowledge graph queries */
export const DEFAULT_GRAPH_DEPTH = 2;

/** Maximum graph traversal depth */
export const MAX_GRAPH_DEPTH = 5;

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

/** Default server port */
export const DEFAULT_PORT = 4000;

/** REST API path prefix */
export const API_PREFIX = '/api' as const;

/** GraphQL endpoint path */
export const GRAPHQL_PATH = '/graphql' as const;

/** Health check endpoint path */
export const HEALTH_PATH = '/api/health' as const;

// ---------------------------------------------------------------------------
// Ports (for reference / cross-service communication)
// ---------------------------------------------------------------------------

export const PORTS = {
  BACKEND: 4000,
  FRONTEND: 3000,
  NLP: 5500,
  NEO4J_BROWSER: 7474,
  NEO4J_BOLT: 7687,
  IPFS_API: 5001,
  IPFS_GATEWAY: 8080,
  STM32_SIMULATOR: 9600,
} as const;

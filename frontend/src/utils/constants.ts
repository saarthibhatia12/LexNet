// ============================================================================
// LexNet Frontend — Constants
// ============================================================================
//
// Centralised configuration values consumed throughout the frontend.
// All environment-dependent values are read from import.meta.env.
// ============================================================================

// ---------------------------------------------------------------------------
// API URLs
// ---------------------------------------------------------------------------

/** GraphQL endpoint (Apollo Client) */
export const API_BASE_URL: string =
  import.meta.env.VITE_API_URL || 'http://localhost:4000/graphql';

/** REST API base (hardware auth, verification, health) */
export const REST_API_URL: string =
  import.meta.env.VITE_REST_API_URL || 'http://localhost:4000/api';

/** Application display name */
export const APP_NAME: string =
  import.meta.env.VITE_APP_NAME || 'LexNet';

// ---------------------------------------------------------------------------
// Graph Visualisation — Node colours by label
// ---------------------------------------------------------------------------

export const GRAPH_NODE_COLOURS: Record<string, string> = {
  Person: '#3B82F6',       // Blue
  Property: '#10B981',     // Emerald
  Document: '#8B5CF6',     // Violet
  Court: '#F59E0B',        // Amber
  LegalAct: '#EF4444',     // Red
  Organisation: '#6366F1', // Indigo
} as const;

/** Default colour for unknown node labels */
export const GRAPH_NODE_DEFAULT_COLOUR = '#94A3B8'; // Slate-400

/** Force-simulation parameters */
export const GRAPH_FORCE_CONFIG = {
  chargeStrength: -300,
  linkDistance: 120,
  centerStrength: 0.05,
  collisionRadius: 30,
} as const;

// ---------------------------------------------------------------------------
// Risk Score Thresholds
// ---------------------------------------------------------------------------

export const RISK_THRESHOLDS = {
  LOW: 30,
  MEDIUM: 60,
  HIGH: 100,
} as const;

export const RISK_COLOURS = {
  low: '#22c55e',    // Green
  medium: '#f59e0b', // Amber
  high: '#ef4444',   // Red
} as const;

/**
 * Returns the risk level string for a given score.
 */
export function getRiskLevel(score: number): 'low' | 'medium' | 'high' {
  if (score <= RISK_THRESHOLDS.LOW) return 'low';
  if (score <= RISK_THRESHOLDS.MEDIUM) return 'medium';
  return 'high';
}

/**
 * Returns the colour string for a given risk score.
 */
export function getRiskColour(score: number): string {
  return RISK_COLOURS[getRiskLevel(score)];
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const AUTH_STORAGE_KEY = 'lexnet_auth_token';
export const SESSION_EXPIRY_HOURS = 1;

// ---------------------------------------------------------------------------
// File Upload
// ---------------------------------------------------------------------------

/** Maximum file size in bytes (50 MB) */
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_FILE_SIZE_MB = 50;
export const ACCEPTED_FILE_TYPES = ['application/pdf'] as const;

// ---------------------------------------------------------------------------
// Polling Intervals
// ---------------------------------------------------------------------------

/** Conflict feed polling interval in milliseconds (30 seconds) */
export const CONFLICT_POLL_INTERVAL_MS = 30_000;

/** Fingerprint auth status polling interval in milliseconds */
export const FINGERPRINT_POLL_INTERVAL_MS = 2_000;

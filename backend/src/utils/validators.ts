// ============================================================================
// LexNet Backend — Zod Validators
// ============================================================================
//
// Zod schemas for runtime validation of all GraphQL and REST request payloads.
// These are used in resolvers to validate inputs before passing to services.
// ============================================================================

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Common Validators
// ---------------------------------------------------------------------------

/** SHA-256 hash: exactly 64 lowercase hex characters */
export const docHashSchema = z
  .string()
  .min(1, 'Document hash is required')
  .regex(/^[0-9a-f]{64}$/, 'Document hash must be a 64-character lowercase hex string');

/** Non-empty trimmed string */
export const nonEmptyString = z.string().min(1).trim();

// ---------------------------------------------------------------------------
// Document Registration
// ---------------------------------------------------------------------------

export const registerDocumentInputSchema = z.object({
  file: z.instanceof(Buffer, { message: 'File buffer is required' }),
  docType: z
    .string()
    .min(1, 'Document type is required')
    .max(100, 'Document type too long'),
  ownerId: z
    .string()
    .min(1, 'Owner ID is required')
    .max(200, 'Owner ID too long'),
  deviceId: z
    .string()
    .min(1, 'Device ID is required')
    .max(100, 'Device ID too long'),
  metadata: z.record(z.string()).optional().default({}),
});

export type RegisterDocumentInput = z.infer<typeof registerDocumentInputSchema>;

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export const loginInputSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginInputSchema>;

// ---------------------------------------------------------------------------
// Knowledge Graph
// ---------------------------------------------------------------------------

export const knowledgeGraphInputSchema = z.object({
  docHash: docHashSchema,
  depth: z.number().int().min(1).max(5).optional().default(2),
});

export const searchNodesInputSchema = z.object({
  query: z.string().min(1, 'Search query is required').max(500),
  labelFilter: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export const propertyTimelineInputSchema = z.object({
  propertyId: z.string().min(1, 'Property ID is required'),
});

export const documentEventsInputSchema = z.object({
  docHash: docHashSchema,
});

// ---------------------------------------------------------------------------
// Conflict / Risk
// ---------------------------------------------------------------------------

export const conflictsInputSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(20),
  offset: z.number().int().min(0).optional().default(0),
});

export const flaggedDocumentsInputSchema = z.object({
  minRisk: z.number().min(0).max(100).optional().default(50),
});

export const riskScoreInputSchema = z.object({
  docHash: docHashSchema,
});

// ---------------------------------------------------------------------------
// Document Operations
// ---------------------------------------------------------------------------

export const transferDocumentInputSchema = z.object({
  docHash: docHashSchema,
  newOwnerId: z.string().min(1, 'New owner ID is required'),
});

export const disputeInputSchema = z.object({
  docHash: docHashSchema,
  caseId: z.string().min(1, 'Case ID is required'),
  filedBy: z.string().optional(),
});

export const resolveDisputeInputSchema = z.object({
  docHash: docHashSchema,
  caseId: z.string().min(1, 'Case ID is required'),
});

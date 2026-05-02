// ============================================================================
// LexNet Backend — Fabric Service
// ============================================================================
//
// Provides 8 wrapper functions matching the LexNet chaincode contract:
//   StoreDocument, GetDocument, GetDocumentHistory, TransferDocument,
//   AddDispute, ResolveDispute, GetDocumentsByOwner, VerifyDocument
//
// - submitTransaction() is used for write operations (state changes)
// - evaluateTransaction() is used for read-only queries
// - All Fabric SDK errors are mapped to typed FabricError / DocumentNotFoundError
// ============================================================================

import type { Contract } from 'fabric-network';
import { getContract } from '../config/fabric.js';
import { logger } from '../config/logger.js';
import type { DocumentRecord, DocumentMetadata } from '../types/index.js';
import { FabricError, DocumentNotFoundError, ValidationError } from '../types/index.js';

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a raw Fabric response buffer into a typed object.
 * Returns null if the buffer is empty (common for "not found" scenarios).
 */
function parseResponse<T>(buffer: Buffer): T | null {
  const raw = buffer.toString('utf-8').trim();
  if (raw.length === 0) {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new FabricError(`Failed to parse chaincode response: ${raw.substring(0, 200)}`);
  }
}

/**
 * Validate that a string argument is non-empty.
 * Mirrors the chaincode's own rejection of empty strings.
 */
function requireNonEmpty(value: string, fieldName: string): void {
  if (!value || value.trim().length === 0) {
    throw new ValidationError(`${fieldName} must not be empty`);
  }
}

/**
 * Wrap a Fabric SDK call and translate errors into typed errors.
 */
async function fabricCall<T>(
  operation: string,
  fn: (contract: Contract) => Promise<T>
): Promise<T> {
  let contract: Contract;
  try {
    contract = getContract();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new FabricError(`Cannot get Fabric contract for ${operation}: ${message}`);
  }

  try {
    return await fn(contract);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Detect endorsement failures
    if (message.includes('ENDORSEMENT_POLICY_FAILURE') || message.includes('endorsement')) {
      throw new FabricError(`Endorsement failure during ${operation}: ${message}`);
    }

    // Detect chaincode-level "not found" errors
    if (message.includes('does not exist') || message.includes('not found')) {
      // Re-throw as a more specific error downstream callers can handle
      throw new FabricError(`${operation}: ${message}`);
    }

    // Detect timeout errors
    if (message.includes('REQUEST_TIMEOUT') || message.includes('timeout')) {
      throw new FabricError(`Timeout during ${operation}: ${message}`);
    }

    throw new FabricError(`${operation} failed: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Chaincode Function Wrappers (8 functions per AGENTS.md contract)
// ---------------------------------------------------------------------------

/**
 * Store a new document record on the ledger.
 *
 * Chaincode: StoreDocument(docHash, ipfsCID, ownerID, deviceID, timestamp, docType, metadata)
 *
 * @param docHash - SHA-256 hash of the document (lowercase hex)
 * @param ipfsCID - IPFS Content Identifier of the encrypted document
 * @param ownerId - Owner's identifier
 * @param deviceId - Hardware device ID used for authentication
 * @param timestamp - ISO 8601 timestamp
 * @param docType - Document type (e.g. "sale_deed", "court_order")
 * @param metadata - Additional metadata as a JSON-serialisable object
 * @throws FabricError if the transaction fails
 * @throws ValidationError if any argument is empty
 */
export async function storeDocument(
  docHash: string,
  ipfsCID: string,
  ownerId: string,
  deviceId: string,
  timestamp: string,
  docType: string,
  metadata: DocumentMetadata
): Promise<void> {
  requireNonEmpty(docHash, 'docHash');
  requireNonEmpty(ipfsCID, 'ipfsCID');
  requireNonEmpty(ownerId, 'ownerId');
  requireNonEmpty(deviceId, 'deviceId');
  requireNonEmpty(timestamp, 'timestamp');
  requireNonEmpty(docType, 'docType');

  const metadataJson = JSON.stringify(metadata);

  await fabricCall('StoreDocument', async (contract) => {
    await contract.submitTransaction(
      'StoreDocument',
      docHash,
      ipfsCID,
      ownerId,
      deviceId,
      timestamp,
      docType,
      metadataJson
    );
  });

  logger.info('Document stored on blockchain', { docHash, ownerId, docType });
}

/**
 * Retrieve a document record from the ledger.
 *
 * Chaincode: GetDocument(docHash)
 *
 * @param docHash - SHA-256 hash of the document
 * @returns The document record
 * @throws DocumentNotFoundError if the document does not exist
 * @throws FabricError if the query fails
 */
export async function getDocument(docHash: string): Promise<DocumentRecord> {
  requireNonEmpty(docHash, 'docHash');

  const result = await fabricCall('GetDocument', async (contract) => {
    const buffer = await contract.evaluateTransaction('GetDocument', docHash);
    return parseResponse<DocumentRecord>(buffer);
  });

  if (!result) {
    throw new DocumentNotFoundError(docHash);
  }

  logger.debug('Document retrieved from blockchain', { docHash });
  return result;
}

/**
 * Get the transaction history for a document.
 *
 * Chaincode: GetDocumentHistory(docHash)
 *
 * @param docHash - SHA-256 hash of the document
 * @returns Array of historical document records
 * @throws DocumentNotFoundError if the document has no history
 * @throws FabricError if the query fails
 */
export async function getDocumentHistory(docHash: string): Promise<DocumentRecord[]> {
  requireNonEmpty(docHash, 'docHash');

  const result = await fabricCall('GetDocumentHistory', async (contract) => {
    const buffer = await contract.evaluateTransaction('GetDocumentHistory', docHash);
    return parseResponse<DocumentRecord[]>(buffer);
  });

  if (!result) {
    throw new DocumentNotFoundError(docHash);
  }

  logger.debug('Document history retrieved', { docHash, entries: result.length });
  return result;
}

/**
 * Transfer document ownership to a new owner.
 *
 * Chaincode: TransferDocument(docHash, newOwnerID)
 * Note: The chaincode rejects transfers when activeDispute is true.
 *
 * @param docHash - SHA-256 hash of the document
 * @param newOwnerId - The new owner's identifier
 * @throws FabricError if the transfer fails (e.g. active dispute)
 */
export async function transferDocument(
  docHash: string,
  newOwnerId: string
): Promise<void> {
  requireNonEmpty(docHash, 'docHash');
  requireNonEmpty(newOwnerId, 'newOwnerId');

  await fabricCall('TransferDocument', async (contract) => {
    await contract.submitTransaction('TransferDocument', docHash, newOwnerId);
  });

  logger.info('Document transferred', { docHash, newOwnerId });
}

/**
 * Add a dispute to a document.
 *
 * Chaincode: AddDispute(docHash, caseID, filedBy)
 *
 * @param docHash - SHA-256 hash of the document
 * @param caseId - The dispute case identifier
 * @param filedBy - Who filed the dispute
 * @throws FabricError if the operation fails
 */
export async function addDispute(
  docHash: string,
  caseId: string,
  filedBy: string
): Promise<void> {
  requireNonEmpty(docHash, 'docHash');
  requireNonEmpty(caseId, 'caseId');
  requireNonEmpty(filedBy, 'filedBy');

  await fabricCall('AddDispute', async (contract) => {
    await contract.submitTransaction('AddDispute', docHash, caseId, filedBy);
  });

  logger.info('Dispute added', { docHash, caseId, filedBy });
}

/**
 * Resolve a dispute on a document.
 *
 * Chaincode: ResolveDispute(docHash, caseID)
 *
 * @param docHash - SHA-256 hash of the document
 * @param caseId - The dispute case identifier
 * @throws FabricError if the operation fails
 */
export async function resolveDispute(
  docHash: string,
  caseId: string
): Promise<void> {
  requireNonEmpty(docHash, 'docHash');
  requireNonEmpty(caseId, 'caseId');

  await fabricCall('ResolveDispute', async (contract) => {
    await contract.submitTransaction('ResolveDispute', docHash, caseId);
  });

  logger.info('Dispute resolved', { docHash, caseId });
}

/**
 * Get all documents owned by a specific owner.
 *
 * Chaincode: GetDocumentsByOwner(ownerID)
 *
 * @param ownerId - The owner's identifier
 * @returns Array of document records
 * @throws FabricError if the query fails
 */
export async function getDocumentsByOwner(ownerId: string): Promise<DocumentRecord[]> {
  requireNonEmpty(ownerId, 'ownerId');

  const result = await fabricCall('GetDocumentsByOwner', async (contract) => {
    const buffer = await contract.evaluateTransaction('GetDocumentsByOwner', ownerId);
    return parseResponse<DocumentRecord[]>(buffer);
  });

  const documents = result ?? [];

  logger.debug('Documents retrieved by owner', { ownerId, count: documents.length });
  return documents;
}

/**
 * Verify a document's existence and current status on the blockchain.
 *
 * Chaincode: VerifyDocument(docHash)
 *
 * @param docHash - SHA-256 hash of the document
 * @returns The document record if it exists, or null if not registered
 * @throws FabricError if the query fails
 */
export async function verifyDocument(docHash: string): Promise<DocumentRecord | null> {
  requireNonEmpty(docHash, 'docHash');

  const result = await fabricCall('VerifyDocument', async (contract) => {
    const buffer = await contract.evaluateTransaction('VerifyDocument', docHash);
    return parseResponse<DocumentRecord>(buffer);
  });

  logger.debug('Document verification result', {
    docHash,
    found: result !== null,
  });

  return result;
}

// ============================================================================
// LexNet Backend — NLP Trigger Service
// ============================================================================
//
// Fire-and-forget HTTP POST to the NLP pipeline service.
//
// CRITICAL RULE (per AGENTS.md):
//   NLP failure must NEVER block document registration.
//   This service logs errors but NEVER throws.
//
// Endpoint: POST {NLP_SERVICE_URL}/nlp/process
// Body: { docHash, ipfsCID, metadata: { docType, ownerId } }
// Timeout: 5 seconds
// ============================================================================

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { NlpProcessRequest, NlpProcessResponse } from '../types/index.js';
import { NLP_TRIGGER_TIMEOUT_MS } from '../utils/constants.js';

/**
 * Trigger the NLP pipeline for a newly registered document.
 *
 * This is a **fire-and-forget** operation:
 * - The function does NOT await the NLP pipeline completion
 * - Errors are logged but NEVER thrown
 * - The caller should NOT await this function in the critical registration path
 *
 * The NLP service will:
 * 1. Retrieve the document from IPFS
 * 2. Run OCR if needed
 * 3. Extract named entities (NER)
 * 4. Extract relations
 * 5. Insert triples into Neo4j
 * 6. Compute a conflict/risk score
 *
 * @param docHash - SHA-256 hash of the document
 * @param ipfsCID - IPFS Content Identifier
 * @param docType - Document type (e.g. "sale_deed", "court_order")
 * @param ownerId - Owner's identifier
 */
export function triggerNlpProcessing(
  docHash: string,
  ipfsCID: string,
  docType: string,
  ownerId: string
): void {
  // Validate inputs minimally — log and return on invalid input, never throw
  if (!docHash || !ipfsCID) {
    logger.warn('NLP trigger skipped: missing docHash or ipfsCID', {
      docHash: docHash || '<empty>',
      ipfsCID: ipfsCID || '<empty>',
    });
    return;
  }

  const requestBody: NlpProcessRequest = {
    docHash,
    ipfsCID,
    metadata: {
      docType: docType || 'unknown',
      ownerId: ownerId || 'unknown',
    },
  };

  const url = `${env.NLP_SERVICE_URL.replace(/\/+$/, '')}/nlp/process`;

  logger.info('Triggering NLP processing', {
    docHash: docHash.substring(0, 16) + '...',
    ipfsCID,
    url,
  });

  // Fire-and-forget: start the fetch but do NOT await it in the caller
  sendNlpRequest(url, requestBody).catch(() => {
    // Intentionally empty — all error handling is inside sendNlpRequest
    // This catch prevents unhandled promise rejection warnings
  });
}

/**
 * Internal function that performs the actual HTTP POST to the NLP service.
 * All errors are caught and logged — this function NEVER throws to callers
 * that properly handle the promise.
 *
 * @param url - The NLP service endpoint URL
 * @param body - The request body
 * @returns The NLP processing response if successful, or null on failure
 */
export async function sendNlpRequest(
  url: string,
  body: NlpProcessRequest
): Promise<NlpProcessResponse | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NLP_TRIGGER_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      logger.warn('NLP service returned error', {
        docHash: body.docHash,
        status: response.status,
        error: errorText.substring(0, 200),
      });
      return null;
    }

    const result = (await response.json()) as NlpProcessResponse;

    logger.info('NLP processing completed', {
      docHash: body.docHash,
      status: result.status,
      riskScore: result.riskScore,
      entitiesFound: result.entitiesFound,
      triplesInserted: result.triplesInserted,
      processingTimeMs: result.processingTimeMs,
    });

    if (result.flags && result.flags.length > 0) {
      logger.warn('NLP flagged document', {
        docHash: body.docHash,
        flags: result.flags,
      });
    }

    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown NLP error';

    if (error instanceof DOMException && error.name === 'AbortError') {
      logger.warn('NLP trigger timed out', {
        docHash: body.docHash,
        timeoutMs: NLP_TRIGGER_TIMEOUT_MS,
      });
    } else if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      logger.warn('NLP service unreachable', {
        docHash: body.docHash,
        url,
        error: message,
      });
    } else {
      logger.warn('NLP trigger failed', {
        docHash: body.docHash,
        error: message,
      });
    }

    // NEVER throw — NLP failure must not block document registration
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

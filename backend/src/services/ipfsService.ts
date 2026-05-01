// ============================================================================
// LexNet Backend — IPFS Service
// ============================================================================
//
// Upload and retrieve files from IPFS via the Kubo HTTP RPC API.
// Files are pinned on upload and subject to a 50MB size limit and 30s timeout.
// ============================================================================

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { IpfsError, ValidationError } from '../types/index.js';
import type { IpfsUploadResult } from '../types/index.js';
import { MAX_FILE_SIZE_BYTES, IPFS_TIMEOUT_MS } from '../utils/constants.js';

/**
 * Upload a buffer to IPFS and pin it.
 *
 * Uses the Kubo HTTP RPC endpoint: POST /api/v0/add?pin=true
 * The file is sent as multipart/form-data.
 *
 * @param buffer - The file data to upload (must be ≤ 50 MB)
 * @returns The IPFS CID (Content Identifier) and file size
 * @throws ValidationError if the buffer exceeds 50 MB
 * @throws IpfsError if the upload fails or times out
 */
export async function uploadToIPFS(buffer: Buffer): Promise<IpfsUploadResult> {
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new ValidationError(
      `File size ${buffer.length} bytes exceeds maximum allowed ${MAX_FILE_SIZE_BYTES} bytes (${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB)`
    );
  }

  const url = `${env.IPFS_API_URL}/api/v0/add?pin=true&quieter=true`;

  // Build multipart/form-data body manually using FormData
  const formData = new FormData();
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  const blob = new Blob([arrayBuffer]);
  formData.append('file', blob, 'document');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IPFS_TIMEOUT_MS);

  try {
    logger.info('Uploading to IPFS', { size: buffer.length });

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new IpfsError(
        `IPFS upload failed with status ${response.status}: ${errorText}`
      );
    }

    const data = (await response.json()) as { Hash?: string; Size?: string; Name?: string };

    if (!data.Hash) {
      throw new IpfsError('IPFS response missing CID hash');
    }

    const result: IpfsUploadResult = {
      cid: data.Hash,
      size: data.Size ? parseInt(data.Size, 10) : buffer.length,
    };

    logger.info('IPFS upload successful', {
      cid: result.cid,
      size: result.size,
    });

    return result;
  } catch (error: unknown) {
    if (error instanceof ValidationError || error instanceof IpfsError) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : 'Unknown IPFS error';

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new IpfsError(
        `IPFS upload timed out after ${IPFS_TIMEOUT_MS}ms`
      );
    }

    throw new IpfsError(`IPFS upload failed: ${message}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Retrieve a file from IPFS by its CID.
 *
 * Uses the Kubo HTTP RPC endpoint: POST /api/v0/cat?arg={cid}
 *
 * @param cid - The IPFS Content Identifier to retrieve
 * @returns The file contents as a Buffer
 * @throws IpfsError if retrieval fails or times out
 */
export async function retrieveFromIPFS(cid: string): Promise<Buffer> {
  if (!cid || cid.trim().length === 0) {
    throw new ValidationError('IPFS CID must not be empty');
  }

  const url = `${env.IPFS_API_URL}/api/v0/cat?arg=${encodeURIComponent(cid)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IPFS_TIMEOUT_MS);

  try {
    logger.info('Retrieving from IPFS', { cid });

    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new IpfsError(
        `IPFS retrieve failed with status ${response.status}: ${errorText}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new IpfsError(
        `Retrieved file size ${buffer.length} bytes exceeds maximum allowed ${MAX_FILE_SIZE_BYTES} bytes`
      );
    }

    logger.info('IPFS retrieval successful', {
      cid,
      size: buffer.length,
    });

    return buffer;
  } catch (error: unknown) {
    if (error instanceof ValidationError || error instanceof IpfsError) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : 'Unknown IPFS error';

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new IpfsError(
        `IPFS retrieval timed out after ${IPFS_TIMEOUT_MS}ms`
      );
    }

    throw new IpfsError(`IPFS retrieval failed: ${message}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

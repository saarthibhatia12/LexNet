// ============================================================================
// LexNet Backend — QR Code Service
// ============================================================================
//
// Generates QR code PNG images containing verification URLs.
// The QR data format is: {VERIFICATION_BASE_URL}/verify/{docHash}
//
// Uses the `qrcode` library for generation.
// ============================================================================

import QRCode from 'qrcode';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ValidationError } from '../types/index.js';
import type { QrCodeData } from '../types/index.js';

/**
 * QR code generation options.
 * - Error correction level 'M' balances density and readability
 * - Margin of 2 modules provides adequate quiet zone
 * - Width of 300px is suitable for both screen display and print embedding
 */
const QR_OPTIONS: QRCode.QRCodeToBufferOptions = {
  errorCorrectionLevel: 'M',
  type: 'png',
  margin: 2,
  width: 300,
  color: {
    dark: '#000000',
    light: '#FFFFFF',
  },
};

/**
 * Build the verification URL for a given document hash.
 *
 * @param docHash - SHA-256 hash of the document (64-character lowercase hex)
 * @returns The full verification URL
 */
export function buildVerificationUrl(docHash: string): string {
  // Strip trailing slash from base URL if present
  const baseUrl = env.VERIFICATION_BASE_URL.replace(/\/+$/, '');
  return `${baseUrl}/verify/${docHash}`;
}

/**
 * Generate a QR code PNG buffer containing a verification URL.
 *
 * The QR code encodes: {VERIFICATION_BASE_URL}/verify/{docHash}
 *
 * @param docHash - SHA-256 hash of the document (64-character lowercase hex)
 * @returns A PNG buffer containing the QR code image
 * @throws ValidationError if docHash is empty or invalid
 */
export async function generateQR(docHash: string): Promise<Buffer> {
  if (!docHash || docHash.trim().length === 0) {
    throw new ValidationError('Document hash is required for QR generation');
  }

  if (!/^[0-9a-f]{64}$/.test(docHash)) {
    throw new ValidationError(
      'Document hash must be a 64-character lowercase hex string (SHA-256)'
    );
  }

  const verificationUrl = buildVerificationUrl(docHash);

  try {
    const pngBuffer = await QRCode.toBuffer(verificationUrl, QR_OPTIONS);

    logger.info('QR code generated', {
      docHash: docHash.substring(0, 16) + '...',
      url: verificationUrl,
      size: pngBuffer.length,
    });

    return pngBuffer;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'QR generation failed';
    logger.error('QR code generation failed', { docHash, error: message });
    throw new ValidationError(`QR code generation failed: ${message}`);
  }
}

/**
 * Generate a QR code and return both the PNG buffer and the metadata.
 *
 * @param docHash - SHA-256 hash of the document
 * @returns Object containing the PNG buffer and QR code metadata
 */
export async function generateQRWithMetadata(
  docHash: string
): Promise<{ buffer: Buffer; data: QrCodeData }> {
  const buffer = await generateQR(docHash);
  const verificationUrl = buildVerificationUrl(docHash);

  return {
    buffer,
    data: {
      verificationUrl,
      docHash,
    },
  };
}

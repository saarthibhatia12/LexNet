// ============================================================================
// LexNet Backend — PDF Service
// ============================================================================
//
// Embeds a QR code into a PDF document by appending a new page containing
// the QR image and verification metadata. Uses pdf-lib for PDF manipulation.
//
// The appended page includes:
//   - Title: "LexNet Document Verification"
//   - The QR code image (centered)
//   - Instruction text: "Scan QR code to verify document authenticity"
//   - The verification URL as text (for manual entry)
//   - Document hash (truncated for readability)
//   - Timestamp of when the QR page was appended
// ============================================================================

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { logger } from '../config/logger.js';
import { ValidationError } from '../types/index.js';

/**
 * Embed a QR code into a PDF by appending a verification page.
 *
 * Creates a new page at the end of the PDF containing:
 * - A centered QR code image
 * - Verification instructions and URL text
 * - Document hash and generation timestamp
 *
 * @param originalPdf - The original PDF file as a Buffer
 * @param qrPng - The QR code PNG image as a Buffer
 * @param verificationUrl - The full verification URL encoded in the QR code
 * @param docHash - The document hash for display on the verification page
 * @returns A new PDF Buffer with the QR page appended
 * @throws ValidationError if inputs are invalid
 */
export async function embedQRInPDF(
  originalPdf: Buffer,
  qrPng: Buffer,
  verificationUrl?: string,
  docHash?: string
): Promise<Buffer> {
  if (!originalPdf || originalPdf.length === 0) {
    throw new ValidationError('Original PDF buffer must not be empty');
  }

  if (!qrPng || qrPng.length === 0) {
    throw new ValidationError('QR code PNG buffer must not be empty');
  }

  try {
    // Load the original PDF
    const pdfDoc = await PDFDocument.load(originalPdf, {
      ignoreEncryption: true,
    });

    // Embed the QR code PNG image
    const qrImage = await pdfDoc.embedPng(qrPng);

    // Get standard fonts
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Add a new A4-sized page at the end
    const pageWidth = 595.28;  // A4 width in points
    const pageHeight = 841.89; // A4 height in points
    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    // --- Layout calculations ---
    const qrDisplaySize = 200; // Display QR at 200x200 points
    const qrX = (pageWidth - qrDisplaySize) / 2;
    const margin = 60;

    // --- Title ---
    const titleText = 'LexNet Document Verification';
    const titleFontSize = 20;
    const titleWidth = helveticaBold.widthOfTextAtSize(titleText, titleFontSize);
    const titleX = (pageWidth - titleWidth) / 2;
    const titleY = pageHeight - margin - titleFontSize;

    page.drawText(titleText, {
      x: titleX,
      y: titleY,
      size: titleFontSize,
      font: helveticaBold,
      color: rgb(0.1, 0.1, 0.4), // Dark blue
    });

    // --- Horizontal divider ---
    const dividerY = titleY - 15;
    page.drawLine({
      start: { x: margin, y: dividerY },
      end: { x: pageWidth - margin, y: dividerY },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7),
    });

    // --- QR code image ---
    const qrY = dividerY - 30 - qrDisplaySize;
    page.drawImage(qrImage, {
      x: qrX,
      y: qrY,
      width: qrDisplaySize,
      height: qrDisplaySize,
    });

    // --- Instruction text ---
    const instructionText = 'Scan the QR code above to verify document authenticity';
    const instructionFontSize = 12;
    const instructionWidth = helvetica.widthOfTextAtSize(
      instructionText,
      instructionFontSize
    );
    const instructionX = (pageWidth - instructionWidth) / 2;
    const instructionY = qrY - 25;

    page.drawText(instructionText, {
      x: instructionX,
      y: instructionY,
      size: instructionFontSize,
      font: helvetica,
      color: rgb(0.3, 0.3, 0.3),
    });

    // --- Verification URL ---
    let currentY = instructionY - 40;

    if (verificationUrl) {
      const urlLabelText = 'Verification URL:';
      page.drawText(urlLabelText, {
        x: margin,
        y: currentY,
        size: 10,
        font: helveticaBold,
        color: rgb(0.2, 0.2, 0.2),
      });
      currentY -= 16;

      // Break long URL across lines if needed
      const maxCharsPerLine = 80;
      const urlLines: string[] = [];
      for (let i = 0; i < verificationUrl.length; i += maxCharsPerLine) {
        urlLines.push(verificationUrl.substring(i, i + maxCharsPerLine));
      }

      for (const line of urlLines) {
        page.drawText(line, {
          x: margin,
          y: currentY,
          size: 9,
          font: helvetica,
          color: rgb(0.0, 0.3, 0.6), // Blue link colour
        });
        currentY -= 14;
      }
      currentY -= 10;
    }

    // --- Document hash ---
    if (docHash) {
      const hashLabelText = 'Document Hash (SHA-256):';
      page.drawText(hashLabelText, {
        x: margin,
        y: currentY,
        size: 10,
        font: helveticaBold,
        color: rgb(0.2, 0.2, 0.2),
      });
      currentY -= 16;

      page.drawText(docHash, {
        x: margin,
        y: currentY,
        size: 8,
        font: helvetica,
        color: rgb(0.4, 0.4, 0.4),
      });
      currentY -= 30;
    }

    // --- Timestamp ---
    const timestampText = `Generated: ${new Date().toISOString()}`;
    page.drawText(timestampText, {
      x: margin,
      y: currentY,
      size: 8,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5),
    });
    currentY -= 25;

    // --- Disclaimer ---
    const disclaimerText =
      'This page was automatically appended by the LexNet document verification system.';
    const disclaimerWidth = helvetica.widthOfTextAtSize(disclaimerText, 8);
    page.drawText(disclaimerText, {
      x: (pageWidth - disclaimerWidth) / 2,
      y: currentY,
      size: 8,
      font: helvetica,
      color: rgb(0.6, 0.6, 0.6),
    });

    // --- Footer divider ---
    page.drawLine({
      start: { x: margin, y: margin - 10 },
      end: { x: pageWidth - margin, y: margin - 10 },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });

    const footerText = 'LexNet — AI-Powered Blockchain Legal Document Network';
    const footerWidth = helvetica.widthOfTextAtSize(footerText, 7);
    page.drawText(footerText, {
      x: (pageWidth - footerWidth) / 2,
      y: margin - 22,
      size: 7,
      font: helvetica,
      color: rgb(0.6, 0.6, 0.6),
    });

    // Serialise the modified PDF
    const pdfBytes = await pdfDoc.save();
    const resultBuffer = Buffer.from(pdfBytes);

    logger.info('QR code embedded in PDF', {
      originalPages: pdfDoc.getPageCount() - 1,
      totalPages: pdfDoc.getPageCount(),
      originalSize: originalPdf.length,
      newSize: resultBuffer.length,
    });

    return resultBuffer;
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'PDF embedding failed';
    logger.error('PDF QR embedding failed', { error: message });
    throw new ValidationError(`Failed to embed QR in PDF: ${message}`);
  }
}

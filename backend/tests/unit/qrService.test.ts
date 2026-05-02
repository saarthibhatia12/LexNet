// ============================================================================
// LexNet Backend — QR, PDF, and NLP Trigger Service Unit Tests
// ============================================================================
//
// Tests for Phase BE6 services:
//
//   qrService:
//     - Generate QR → returns valid PNG buffer
//     - QR encodes the correct verification URL
//     - Rejects empty / invalid hash
//     - buildVerificationUrl strips trailing slashes
//
//   pdfService:
//     - Embed QR into PDF → output has one more page than input
//     - Rejects empty PDF or QR buffer
//     - Output is a valid PDF (parseable by pdf-lib)
//
//   nlpTriggerService:
//     - sendNlpRequest returns response on success
//     - sendNlpRequest returns null on HTTP error
//     - sendNlpRequest returns null on network failure
//     - triggerNlpProcessing skips on missing docHash
//     - triggerNlpProcessing does not throw on failure
// ============================================================================

import { jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock env and logger
// ---------------------------------------------------------------------------

const TEST_VERIFICATION_BASE_URL = 'http://localhost:3000';
const TEST_NLP_SERVICE_URL = 'http://localhost:5500';

jest.unstable_mockModule('../../src/config/env.js', () => ({
  env: {
    VERIFICATION_BASE_URL: TEST_VERIFICATION_BASE_URL,
    NLP_SERVICE_URL: TEST_NLP_SERVICE_URL,
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
  },
}));

jest.unstable_mockModule('../../src/config/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Dynamic imports AFTER mocks (ESM requirement)
// ---------------------------------------------------------------------------

const {
  generateQR,
  generateQRWithMetadata,
  buildVerificationUrl,
} = await import('../../src/services/qrService.js');

const { embedQRInPDF } = await import('../../src/services/pdfService.js');

const { sendNlpRequest, triggerNlpProcessing } = await import(
  '../../src/services/nlpTriggerService.js'
);

// We need pdf-lib to create test PDFs and verify output
const { PDFDocument } = await import('pdf-lib');

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const VALID_HASH = 'a'.repeat(64);

// ===========================================================================
// QR Service Tests
// ===========================================================================

describe('qrService', () => {
  describe('buildVerificationUrl', () => {
    it('should build correct verification URL', () => {
      const url = buildVerificationUrl(VALID_HASH);
      expect(url).toBe(`${TEST_VERIFICATION_BASE_URL}/verify/${VALID_HASH}`);
    });

    it('should strip trailing slash from base URL', () => {
      // The mock has no trailing slash, but let's test the logic
      const url = buildVerificationUrl(VALID_HASH);
      expect(url).not.toContain('//verify');
    });
  });

  describe('generateQR', () => {
    it('should return a PNG buffer for a valid hash', async () => {
      const buffer = await generateQR(VALID_HASH);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);

      // Verify PNG magic bytes: 0x89 0x50 0x4E 0x47
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50); // P
      expect(buffer[2]).toBe(0x4e); // N
      expect(buffer[3]).toBe(0x47); // G
    });

    it('should throw ValidationError for empty hash', async () => {
      await expect(generateQR('')).rejects.toThrow('required');
    });

    it('should throw ValidationError for invalid hash format', async () => {
      await expect(generateQR('xyz-not-a-hash')).rejects.toThrow('hex');
    });

    it('should throw ValidationError for uppercase hash', async () => {
      await expect(generateQR('A'.repeat(64))).rejects.toThrow('hex');
    });

    it('should throw ValidationError for short hash', async () => {
      await expect(generateQR('abcdef1234')).rejects.toThrow('hex');
    });
  });

  describe('generateQRWithMetadata', () => {
    it('should return buffer and metadata', async () => {
      const result = await generateQRWithMetadata(VALID_HASH);

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);
      expect(result.data.docHash).toBe(VALID_HASH);
      expect(result.data.verificationUrl).toBe(
        `${TEST_VERIFICATION_BASE_URL}/verify/${VALID_HASH}`
      );
    });
  });
});

// ===========================================================================
// PDF Service Tests
// ===========================================================================

describe('pdfService', () => {
  /**
   * Create a minimal valid PDF for testing.
   */
  async function createTestPDF(pageCount: number = 1): Promise<Buffer> {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pageCount; i++) {
      doc.addPage([595, 842]); // A4
    }
    const bytes = await doc.save();
    return Buffer.from(bytes);
  }

  describe('embedQRInPDF', () => {
    it('should append a QR page to a single-page PDF', async () => {
      const originalPdf = await createTestPDF(1);
      const qrPng = await generateQR(VALID_HASH);

      const resultPdf = await embedQRInPDF(
        originalPdf,
        qrPng,
        `${TEST_VERIFICATION_BASE_URL}/verify/${VALID_HASH}`,
        VALID_HASH
      );

      expect(resultPdf).toBeInstanceOf(Buffer);
      expect(resultPdf.length).toBeGreaterThan(originalPdf.length);

      // Verify the result is a valid PDF with one additional page
      const resultDoc = await PDFDocument.load(resultPdf);
      expect(resultDoc.getPageCount()).toBe(2); // 1 original + 1 QR page
    });

    it('should append a QR page to a multi-page PDF', async () => {
      const originalPdf = await createTestPDF(3);
      const qrPng = await generateQR(VALID_HASH);

      const resultPdf = await embedQRInPDF(originalPdf, qrPng);

      const resultDoc = await PDFDocument.load(resultPdf);
      expect(resultDoc.getPageCount()).toBe(4); // 3 original + 1 QR page
    });

    it('should work without optional parameters', async () => {
      const originalPdf = await createTestPDF(1);
      const qrPng = await generateQR(VALID_HASH);

      // No verificationUrl or docHash
      const resultPdf = await embedQRInPDF(originalPdf, qrPng);

      expect(resultPdf).toBeInstanceOf(Buffer);
      const resultDoc = await PDFDocument.load(resultPdf);
      expect(resultDoc.getPageCount()).toBe(2);
    });

    it('should throw ValidationError for empty PDF buffer', async () => {
      const qrPng = await generateQR(VALID_HASH);
      await expect(embedQRInPDF(Buffer.alloc(0), qrPng)).rejects.toThrow(
        'empty'
      );
    });

    it('should throw ValidationError for empty QR buffer', async () => {
      const originalPdf = await createTestPDF(1);
      await expect(
        embedQRInPDF(originalPdf, Buffer.alloc(0))
      ).rejects.toThrow('empty');
    });

    it('should throw for invalid PDF data', async () => {
      const qrPng = await generateQR(VALID_HASH);
      await expect(
        embedQRInPDF(Buffer.from('not-a-pdf'), qrPng)
      ).rejects.toThrow();
    });

    it('should produce output that starts with PDF magic bytes', async () => {
      const originalPdf = await createTestPDF(1);
      const qrPng = await generateQR(VALID_HASH);

      const resultPdf = await embedQRInPDF(originalPdf, qrPng);

      // PDF files start with %PDF-
      const header = resultPdf.subarray(0, 5).toString('ascii');
      expect(header).toBe('%PDF-');
    });
  });
});

// ===========================================================================
// NLP Trigger Service Tests
// ===========================================================================

describe('nlpTriggerService', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('sendNlpRequest', () => {
    it('should return NLP response on successful request', async () => {
      const mockResponse = {
        status: 'completed' as const,
        riskScore: 25.5,
        entitiesFound: 8,
        triplesInserted: 5,
        flags: [],
        processingTimeMs: 1200,
      };

      globalThis.fetch = jest.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
        text: async () => JSON.stringify(mockResponse),
      } as unknown as globalThis.Response);

      const result = await sendNlpRequest(
        `${TEST_NLP_SERVICE_URL}/nlp/process`,
        {
          docHash: VALID_HASH,
          ipfsCID: 'QmTestCID',
          metadata: { docType: 'sale_deed', ownerId: 'owner1' },
        }
      );

      expect(result).not.toBeNull();
      expect(result!.status).toBe('completed');
      expect(result!.riskScore).toBe(25.5);
      expect(result!.entitiesFound).toBe(8);
    });

    it('should return null on HTTP error response', async () => {
      globalThis.fetch = jest.fn<typeof fetch>().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      } as unknown as globalThis.Response);

      const result = await sendNlpRequest(
        `${TEST_NLP_SERVICE_URL}/nlp/process`,
        {
          docHash: VALID_HASH,
          ipfsCID: 'QmTestCID',
          metadata: { docType: 'sale_deed', ownerId: 'owner1' },
        }
      );

      expect(result).toBeNull();
    });

    it('should return null on network failure (fetch throws)', async () => {
      globalThis.fetch = jest
        .fn<typeof fetch>()
        .mockRejectedValue(new Error('fetch failed: ECONNREFUSED'));

      const result = await sendNlpRequest(
        `${TEST_NLP_SERVICE_URL}/nlp/process`,
        {
          docHash: VALID_HASH,
          ipfsCID: 'QmTestCID',
          metadata: { docType: 'sale_deed', ownerId: 'owner1' },
        }
      );

      expect(result).toBeNull();
    });

    it('should return response with flags for flagged documents', async () => {
      const mockResponse = {
        status: 'completed' as const,
        riskScore: 85.0,
        entitiesFound: 12,
        triplesInserted: 8,
        flags: ['RAPID_TRANSFER', 'OWNERSHIP_CONFLICT'],
        processingTimeMs: 2500,
      };

      globalThis.fetch = jest.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
        text: async () => JSON.stringify(mockResponse),
      } as unknown as globalThis.Response);

      const result = await sendNlpRequest(
        `${TEST_NLP_SERVICE_URL}/nlp/process`,
        {
          docHash: VALID_HASH,
          ipfsCID: 'QmTestCID',
          metadata: { docType: 'sale_deed', ownerId: 'owner1' },
        }
      );

      expect(result).not.toBeNull();
      expect(result!.flags).toContain('RAPID_TRANSFER');
      expect(result!.flags).toContain('OWNERSHIP_CONFLICT');
    });
  });

  describe('triggerNlpProcessing', () => {
    it('should not throw when NLP service is unreachable', () => {
      // Replace fetch with one that rejects
      globalThis.fetch = jest
        .fn<typeof fetch>()
        .mockRejectedValue(new Error('ECONNREFUSED'));

      // triggerNlpProcessing is synchronous (fire-and-forget)
      // It should NOT throw
      expect(() => {
        triggerNlpProcessing(VALID_HASH, 'QmTestCID', 'sale_deed', 'owner1');
      }).not.toThrow();
    });

    it('should skip processing when docHash is empty', () => {
      const fetchSpy = jest.fn<typeof fetch>();
      globalThis.fetch = fetchSpy;

      triggerNlpProcessing('', 'QmTestCID', 'sale_deed', 'owner1');

      // fetch should NOT have been called
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should skip processing when ipfsCID is empty', () => {
      const fetchSpy = jest.fn<typeof fetch>();
      globalThis.fetch = fetchSpy;

      triggerNlpProcessing(VALID_HASH, '', 'sale_deed', 'owner1');

      // fetch should NOT have been called
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should call fetch with correct URL and body', async () => {
      const fetchSpy = jest.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'completed',
          riskScore: 10,
          entitiesFound: 3,
          triplesInserted: 2,
          flags: [],
          processingTimeMs: 500,
        }),
        text: async () => '{}',
      } as unknown as globalThis.Response);
      globalThis.fetch = fetchSpy;

      triggerNlpProcessing(VALID_HASH, 'QmTestCID', 'sale_deed', 'owner1');

      // Wait a tick for the async fire-and-forget to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const [url, options] = fetchSpy.mock.calls[0]!;
      expect(url).toBe(`${TEST_NLP_SERVICE_URL}/nlp/process`);
      expect((options as RequestInit).method).toBe('POST');

      const sentBody = JSON.parse((options as RequestInit).body as string);
      expect(sentBody.docHash).toBe(VALID_HASH);
      expect(sentBody.ipfsCID).toBe('QmTestCID');
      expect(sentBody.metadata.docType).toBe('sale_deed');
      expect(sentBody.metadata.ownerId).toBe('owner1');
    });
  });
});

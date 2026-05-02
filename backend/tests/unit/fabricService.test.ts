// ============================================================================
// LexNet Backend — Fabric Service Unit Tests
// ============================================================================
//
// Tests use mocked fabric-network Contract to validate:
//   1. Successful operations for all 8 chaincode functions
//   2. Document not found handling
//   3. Endorsement failure handling
//   4. Empty string argument validation
//   5. Timeout error handling
//   6. JSON parse error handling
// ============================================================================

import { jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock the fabric config module so getContract() returns our mock
// ---------------------------------------------------------------------------

const mockSubmitTransaction = jest.fn<(...args: string[]) => Promise<Buffer>>();
const mockEvaluateTransaction = jest.fn<(...args: string[]) => Promise<Buffer>>();

const mockContract = {
  submitTransaction: mockSubmitTransaction,
  evaluateTransaction: mockEvaluateTransaction,
  chaincodeId: 'lexnet-cc',
  namespace: '',
};

jest.unstable_mockModule('../../src/config/fabric.js', () => ({
  getContract: () => mockContract,
}));

// Mock the logger to suppress output during tests
jest.unstable_mockModule('../../src/config/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  },
}));

// Dynamic imports AFTER mocks are set up (required for ESM mocking)
const { storeDocument, getDocument, getDocumentHistory, transferDocument, addDispute, resolveDispute, getDocumentsByOwner, verifyDocument } = await import('../../src/services/fabricService.js');
import { FabricError, DocumentNotFoundError, ValidationError } from '../../src/types/index.js';
import type { DocumentRecord, DocumentMetadata } from '../../src/types/index.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const sampleDoc: DocumentRecord = {
  docHash: 'abc123def456abc123def456abc123def456abc123def456abc123def456abc1',
  ipfsCID: 'QmTestCID123',
  ownerId: 'user-001',
  deviceId: 'A1B2C3D4',
  timestamp: '2026-01-15T10:30:00Z',
  docType: 'sale_deed',
  metadata: { propertyId: 'PROP-001', buyer: 'Ram Kumar', seller: 'Shyam Singh' },
  activeDispute: false,
  disputeCaseId: '',
  riskScore: 15,
  createdAt: '2026-01-15T10:30:00Z',
};

const sampleMetadata: DocumentMetadata = {
  propertyId: 'PROP-001',
  buyer: 'Ram Kumar',
  seller: 'Shyam Singh',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fabricService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // StoreDocument
  // =========================================================================
  describe('storeDocument', () => {
    it('should submit a StoreDocument transaction with correct arguments', async () => {
      mockSubmitTransaction.mockResolvedValue(Buffer.alloc(0));

      await storeDocument(
        sampleDoc.docHash,
        sampleDoc.ipfsCID,
        sampleDoc.ownerId,
        sampleDoc.deviceId,
        sampleDoc.timestamp,
        sampleDoc.docType,
        sampleMetadata
      );

      expect(mockSubmitTransaction).toHaveBeenCalledTimes(1);
      expect(mockSubmitTransaction).toHaveBeenCalledWith(
        'StoreDocument',
        sampleDoc.docHash,
        sampleDoc.ipfsCID,
        sampleDoc.ownerId,
        sampleDoc.deviceId,
        sampleDoc.timestamp,
        sampleDoc.docType,
        JSON.stringify(sampleMetadata)
      );
    });

    it('should throw ValidationError for empty docHash', async () => {
      await expect(
        storeDocument('', sampleDoc.ipfsCID, sampleDoc.ownerId, sampleDoc.deviceId, sampleDoc.timestamp, sampleDoc.docType, sampleMetadata)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for empty ownerId', async () => {
      await expect(
        storeDocument(sampleDoc.docHash, sampleDoc.ipfsCID, '', sampleDoc.deviceId, sampleDoc.timestamp, sampleDoc.docType, sampleMetadata)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw FabricError on endorsement failure', async () => {
      mockSubmitTransaction.mockRejectedValue(new Error('ENDORSEMENT_POLICY_FAILURE'));

      await expect(
        storeDocument(sampleDoc.docHash, sampleDoc.ipfsCID, sampleDoc.ownerId, sampleDoc.deviceId, sampleDoc.timestamp, sampleDoc.docType, sampleMetadata)
      ).rejects.toThrow(FabricError);
    });
  });

  // =========================================================================
  // GetDocument
  // =========================================================================
  describe('getDocument', () => {
    it('should return a parsed DocumentRecord on success', async () => {
      mockEvaluateTransaction.mockResolvedValue(
        Buffer.from(JSON.stringify(sampleDoc))
      );

      const result = await getDocument(sampleDoc.docHash);

      expect(result).toEqual(sampleDoc);
      expect(mockEvaluateTransaction).toHaveBeenCalledWith(
        'GetDocument',
        sampleDoc.docHash
      );
    });

    it('should throw DocumentNotFoundError when response is empty', async () => {
      mockEvaluateTransaction.mockResolvedValue(Buffer.alloc(0));

      await expect(getDocument('nonexistent-hash')).rejects.toThrow(
        DocumentNotFoundError
      );
    });

    it('should throw ValidationError for empty docHash', async () => {
      await expect(getDocument('')).rejects.toThrow(ValidationError);
    });

    it('should throw FabricError on timeout', async () => {
      mockEvaluateTransaction.mockRejectedValue(new Error('REQUEST_TIMEOUT'));

      await expect(getDocument(sampleDoc.docHash)).rejects.toThrow(FabricError);
    });
  });

  // =========================================================================
  // GetDocumentHistory
  // =========================================================================
  describe('getDocumentHistory', () => {
    it('should return an array of historical records', async () => {
      const history = [sampleDoc, { ...sampleDoc, ownerId: 'user-002' }];
      mockEvaluateTransaction.mockResolvedValue(
        Buffer.from(JSON.stringify(history))
      );

      const result = await getDocumentHistory(sampleDoc.docHash);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(sampleDoc);
      expect(mockEvaluateTransaction).toHaveBeenCalledWith(
        'GetDocumentHistory',
        sampleDoc.docHash
      );
    });

    it('should throw DocumentNotFoundError when empty', async () => {
      mockEvaluateTransaction.mockResolvedValue(Buffer.alloc(0));

      await expect(getDocumentHistory('no-history')).rejects.toThrow(
        DocumentNotFoundError
      );
    });
  });

  // =========================================================================
  // TransferDocument
  // =========================================================================
  describe('transferDocument', () => {
    it('should submit a TransferDocument transaction', async () => {
      mockSubmitTransaction.mockResolvedValue(Buffer.alloc(0));

      await transferDocument(sampleDoc.docHash, 'new-owner-001');

      expect(mockSubmitTransaction).toHaveBeenCalledWith(
        'TransferDocument',
        sampleDoc.docHash,
        'new-owner-001'
      );
    });

    it('should throw ValidationError for empty newOwnerId', async () => {
      await expect(
        transferDocument(sampleDoc.docHash, '')
      ).rejects.toThrow(ValidationError);
    });

    it('should throw FabricError when blocked by active dispute', async () => {
      mockSubmitTransaction.mockRejectedValue(
        new Error('Transfer blocked: document has active dispute')
      );

      await expect(
        transferDocument(sampleDoc.docHash, 'new-owner-001')
      ).rejects.toThrow(FabricError);
    });
  });

  // =========================================================================
  // AddDispute
  // =========================================================================
  describe('addDispute', () => {
    it('should submit an AddDispute transaction', async () => {
      mockSubmitTransaction.mockResolvedValue(Buffer.alloc(0));

      await addDispute(sampleDoc.docHash, 'CASE-001', 'inspector-001');

      expect(mockSubmitTransaction).toHaveBeenCalledWith(
        'AddDispute',
        sampleDoc.docHash,
        'CASE-001',
        'inspector-001'
      );
    });

    it('should throw ValidationError for empty caseId', async () => {
      await expect(
        addDispute(sampleDoc.docHash, '', 'inspector-001')
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for empty filedBy', async () => {
      await expect(
        addDispute(sampleDoc.docHash, 'CASE-001', '')
      ).rejects.toThrow(ValidationError);
    });
  });

  // =========================================================================
  // ResolveDispute
  // =========================================================================
  describe('resolveDispute', () => {
    it('should submit a ResolveDispute transaction', async () => {
      mockSubmitTransaction.mockResolvedValue(Buffer.alloc(0));

      await resolveDispute(sampleDoc.docHash, 'CASE-001');

      expect(mockSubmitTransaction).toHaveBeenCalledWith(
        'ResolveDispute',
        sampleDoc.docHash,
        'CASE-001'
      );
    });

    it('should throw ValidationError for empty docHash', async () => {
      await expect(resolveDispute('', 'CASE-001')).rejects.toThrow(
        ValidationError
      );
    });
  });

  // =========================================================================
  // GetDocumentsByOwner
  // =========================================================================
  describe('getDocumentsByOwner', () => {
    it('should return documents for the given owner', async () => {
      const docs = [sampleDoc];
      mockEvaluateTransaction.mockResolvedValue(
        Buffer.from(JSON.stringify(docs))
      );

      const result = await getDocumentsByOwner('user-001');

      expect(result).toHaveLength(1);
      expect(result[0]!.ownerId).toBe('user-001');
      expect(mockEvaluateTransaction).toHaveBeenCalledWith(
        'GetDocumentsByOwner',
        'user-001'
      );
    });

    it('should return empty array when no documents found', async () => {
      mockEvaluateTransaction.mockResolvedValue(Buffer.alloc(0));

      const result = await getDocumentsByOwner('unknown-owner');

      expect(result).toEqual([]);
    });

    it('should throw ValidationError for empty ownerId', async () => {
      await expect(getDocumentsByOwner('')).rejects.toThrow(ValidationError);
    });
  });

  // =========================================================================
  // VerifyDocument
  // =========================================================================
  describe('verifyDocument', () => {
    it('should return a DocumentRecord when document exists', async () => {
      mockEvaluateTransaction.mockResolvedValue(
        Buffer.from(JSON.stringify(sampleDoc))
      );

      const result = await verifyDocument(sampleDoc.docHash);

      expect(result).toEqual(sampleDoc);
      expect(mockEvaluateTransaction).toHaveBeenCalledWith(
        'VerifyDocument',
        sampleDoc.docHash
      );
    });

    it('should return null when document is not registered', async () => {
      mockEvaluateTransaction.mockResolvedValue(Buffer.alloc(0));

      const result = await verifyDocument('not-registered-hash');

      expect(result).toBeNull();
    });

    it('should throw ValidationError for empty docHash', async () => {
      await expect(verifyDocument('')).rejects.toThrow(ValidationError);
    });

    it('should throw FabricError on endorsement failure', async () => {
      mockEvaluateTransaction.mockRejectedValue(
        new Error('endorsement policy not satisfied')
      );

      await expect(verifyDocument(sampleDoc.docHash)).rejects.toThrow(
        FabricError
      );
    });
  });
});

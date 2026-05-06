// ============================================================================
// LexNet Backend - Document Resolvers
// ============================================================================
//
// Queries:
//   - getDocument(docHash!) -> Document
//   - getDocumentHistory(docHash!) -> [Document]
//   - verifyDocument(docHash!) -> VerificationResult (public)
//   - getDocumentsByOwner(ownerId!) -> [Document]
//
// Mutations:
//   - registerDocument(input!) -> RegisterResult
//     Full pipeline: hash -> encrypt -> IPFS -> Fabric -> QR -> NLP trigger
//   - transferDocument(docHash!, newOwnerId!) -> Document
//   - addDispute(docHash!, caseId!, filedBy?) -> Document
//   - resolveDispute(docHash!, caseId!) -> Document
// ============================================================================

import { GraphQLError } from 'graphql';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { requireAuth, type GraphQLContext } from '../directives/authDirective.js';
import * as encryptionService from '../../services/encryptionService.js';
import * as fabricService from '../../services/fabricService.js';
import * as hashService from '../../services/hashService.js';
import * as ipfsService from '../../services/ipfsService.js';
import * as neo4jService from '../../services/neo4jService.js';
import * as qrService from '../../services/qrService.js';
import { triggerNlpProcessing } from '../../services/nlpTriggerService.js';
import { docHashSchema } from '../../utils/validators.js';
import type {
  DocumentMetadata,
  DocumentRecord,
  EncryptedPayload,
  VerificationResult,
} from '../../types/index.js';
import { DocumentNotFoundError } from '../../types/index.js';

async function enrichDocumentRisk(document: DocumentRecord): Promise<DocumentRecord> {
  try {
    const assessment = await neo4jService.getRiskAssessment(document.docHash);
    if (!assessment) {
      return document;
    }

    return {
      ...document,
      riskScore: assessment.riskScore,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown Neo4j error';
    logger.warn('Failed to enrich document risk score', {
      docHash: document.docHash,
      error: message,
    });
    return document;
  }
}

async function enrichDocumentsRisk(documents: DocumentRecord[]): Promise<DocumentRecord[]> {
  if (documents.length === 0) {
    return documents;
  }

  try {
    const riskScores = await neo4jService.getRiskScoresByDocumentHashes(
      documents.map((document) => document.docHash)
    );

    return documents.map((document) => ({
      ...document,
      riskScore: riskScores.get(document.docHash) ?? document.riskScore,
    }));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown Neo4j error';
    logger.warn('Failed to enrich document list risk scores', {
      count: documents.length,
      error: message,
    });
    return documents;
  }
}

export const documentResolvers = {
  Query: {
    // -----------------------------------------------------------------------
    // getDocument - requires auth
    // -----------------------------------------------------------------------
    getDocument: async (
      _parent: unknown,
      args: { docHash: string },
      context: GraphQLContext
    ) => {
      requireAuth(context);
      const result = docHashSchema.safeParse(args.docHash);
      if (!result.success) {
        throw new GraphQLError('Invalid document hash format', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const document = await fabricService.getDocument(args.docHash);
      return enrichDocumentRisk(document);
    },

    // -----------------------------------------------------------------------
    // getDocumentHistory - requires auth
    // -----------------------------------------------------------------------
    getDocumentHistory: async (
      _parent: unknown,
      args: { docHash: string },
      context: GraphQLContext
    ) => {
      requireAuth(context);
      const result = docHashSchema.safeParse(args.docHash);
      if (!result.success) {
        throw new GraphQLError('Invalid document hash format', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const history = await fabricService.getDocumentHistory(args.docHash);
      return enrichDocumentsRisk(history);
    },

    // -----------------------------------------------------------------------
    // verifyDocument - public (no auth)
    // -----------------------------------------------------------------------
    verifyDocument: async (
      _parent: unknown,
      args: { docHash: string },
      _context: GraphQLContext
    ): Promise<VerificationResult> => {
      const parseResult = docHashSchema.safeParse(args.docHash);
      if (!parseResult.success) {
        throw new GraphQLError('Invalid document hash format', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const { docHash } = args;

      try {
        let document: DocumentRecord | null;
        try {
          document = await fabricService.verifyDocument(docHash);
        } catch (error: unknown) {
          if (error instanceof DocumentNotFoundError) {
            return {
              status: 'NOT_REGISTERED',
              docHash,
              message: 'No blockchain record found for this document hash',
            };
          }
          throw error;
        }

        if (!document) {
          return {
            status: 'NOT_REGISTERED',
            docHash,
            message: 'No blockchain record found for this document hash',
          };
        }

        const ipfsBuffer = await ipfsService.retrieveFromIPFS(document.ipfsCID);

        let encryptedPayload: EncryptedPayload;
        try {
          encryptedPayload = JSON.parse(
            ipfsBuffer.toString('utf-8')
          ) as EncryptedPayload;
        } catch {
          return {
            status: 'ERROR',
            docHash,
            document: await enrichDocumentRisk(document),
            message: 'Failed to parse stored document payload',
          };
        }

        const decryptedBuffer = encryptionService.decrypt(
          Buffer.from(encryptedPayload.ciphertext, 'base64'),
          Buffer.from(encryptedPayload.iv, 'base64'),
          Buffer.from(encryptedPayload.authTag, 'base64'),
          env.AES_KEY
        );

        const recomputedHash = hashService.computeSHA256(decryptedBuffer);
        const enrichedDocument = await enrichDocumentRisk(document);

        if (recomputedHash === docHash) {
          return {
            status: 'AUTHENTIC',
            docHash,
            timestamp: enrichedDocument.createdAt,
            document: enrichedDocument,
            message: 'Document is authentic - hash matches blockchain record',
          };
        }

        return {
          status: 'TAMPERED',
          docHash,
          timestamp: enrichedDocument.createdAt,
          document: enrichedDocument,
          message: 'Document has been tampered with - hash mismatch detected',
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Verification failed';
        logger.error('GraphQL verification error', { docHash, error: message });
        return {
          status: 'ERROR',
          docHash,
          message: `Verification failed: ${message}`,
        };
      }
    },

    // -----------------------------------------------------------------------
    // getDocumentsByOwner - requires auth
    // -----------------------------------------------------------------------
    getDocumentsByOwner: async (
      _parent: unknown,
      args: { ownerId: string },
      context: GraphQLContext
    ) => {
      requireAuth(context);
      if (!args.ownerId || args.ownerId.trim().length === 0) {
        throw new GraphQLError('Owner ID is required', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const documents = await fabricService.getDocumentsByOwner(args.ownerId);
      return enrichDocumentsRisk(documents);
    },
  },

  Mutation: {
    // -----------------------------------------------------------------------
    // registerDocument - full pipeline (requires auth)
    // -----------------------------------------------------------------------
    registerDocument: async (
      _parent: unknown,
      args: {
        input: {
          fileBase64: string;
          docType: string;
          ownerId: string;
          deviceId: string;
          metadata?: {
            propertyId?: string;
            buyer?: string;
            seller?: string;
            value?: string;
          };
        };
      },
      context: GraphQLContext
    ) => {
      const user = requireAuth(context);
      const { input } = args;

      if (!input.fileBase64 || input.fileBase64.length === 0) {
        throw new GraphQLError('File content is required', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
      if (!input.docType || input.docType.trim().length === 0) {
        throw new GraphQLError('Document type is required', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
      if (!input.ownerId || input.ownerId.trim().length === 0) {
        throw new GraphQLError('Owner ID is required', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      logger.info('Document registration started', {
        docType: input.docType,
        ownerId: input.ownerId,
        userId: user.userId,
      });

      const fileBuffer = Buffer.from(input.fileBase64, 'base64');
      const docHash = hashService.computeSHA256(fileBuffer);
      const encResult = encryptionService.encrypt(fileBuffer, env.AES_KEY);

      const encryptedPayload: EncryptedPayload = {
        ciphertext: encResult.ciphertext.toString('base64'),
        iv: encResult.iv.toString('base64'),
        authTag: encResult.authTag.toString('base64'),
      };
      const payloadBuffer = Buffer.from(JSON.stringify(encryptedPayload));

      const ipfsResult = await ipfsService.uploadToIPFS(payloadBuffer);

      const timestamp = new Date().toISOString();
      const metadata: DocumentMetadata = input.metadata ?? {};

      await fabricService.storeDocument(
        docHash,
        ipfsResult.cid,
        input.ownerId,
        input.deviceId || user.userId,
        timestamp,
        input.docType,
        metadata
      );

      const qrResult = await qrService.generateQRWithMetadata(docHash);

      triggerNlpProcessing(
        docHash,
        ipfsResult.cid,
        input.docType,
        input.ownerId
      );

      logger.info('Document registration completed', {
        docHash,
        ipfsCID: ipfsResult.cid,
        ownerId: input.ownerId,
        userId: user.userId,
      });

      return {
        docHash,
        ipfsCID: ipfsResult.cid,
        qrCodeBase64: qrResult.buffer.toString('base64'),
        verificationUrl: qrResult.data.verificationUrl,
        timestamp,
      };
    },

    // -----------------------------------------------------------------------
    // transferDocument - requires auth
    // -----------------------------------------------------------------------
    transferDocument: async (
      _parent: unknown,
      args: { docHash: string; newOwnerId: string },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      const parseResult = docHashSchema.safeParse(args.docHash);
      if (!parseResult.success) {
        throw new GraphQLError('Invalid document hash format', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
      if (!args.newOwnerId || args.newOwnerId.trim().length === 0) {
        throw new GraphQLError('New owner ID is required', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      await fabricService.transferDocument(args.docHash, args.newOwnerId);
      const document = await fabricService.getDocument(args.docHash);
      return enrichDocumentRisk(document);
    },

    // -----------------------------------------------------------------------
    // addDispute - requires auth
    // -----------------------------------------------------------------------
    addDispute: async (
      _parent: unknown,
      args: { docHash: string; caseId: string; filedBy?: string },
      context: GraphQLContext
    ) => {
      const user = requireAuth(context);

      const parseResult = docHashSchema.safeParse(args.docHash);
      if (!parseResult.success) {
        throw new GraphQLError('Invalid document hash format', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
      if (!args.caseId || args.caseId.trim().length === 0) {
        throw new GraphQLError('Case ID is required', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const filedBy = args.filedBy || user.userId;
      await fabricService.addDispute(args.docHash, args.caseId, filedBy);
      const document = await fabricService.getDocument(args.docHash);
      return enrichDocumentRisk(document);
    },

    // -----------------------------------------------------------------------
    // resolveDispute - requires auth
    // -----------------------------------------------------------------------
    resolveDispute: async (
      _parent: unknown,
      args: { docHash: string; caseId: string },
      context: GraphQLContext
    ) => {
      requireAuth(context);

      const parseResult = docHashSchema.safeParse(args.docHash);
      if (!parseResult.success) {
        throw new GraphQLError('Invalid document hash format', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
      if (!args.caseId || args.caseId.trim().length === 0) {
        throw new GraphQLError('Case ID is required', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      await fabricService.resolveDispute(args.docHash, args.caseId);
      const document = await fabricService.getDocument(args.docHash);
      return enrichDocumentRisk(document);
    },
  },
};

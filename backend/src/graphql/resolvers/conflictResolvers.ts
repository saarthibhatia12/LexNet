// ============================================================================
// LexNet Backend — Conflict Resolvers
// ============================================================================
//
// Queries (require auth):
//   - getConflicts(limit?, offset?) → [RiskAssessment]
//   - getRiskScore(docHash!) → RiskAssessment
//   - getFlaggedDocuments(minRisk?) → [FlaggedDocument]
//
// These resolvers query Neo4j for risk/conflict data associated with
// documents and return formatted risk assessments.
// ============================================================================

import { GraphQLError } from 'graphql';
import { requireAuth, type GraphQLContext } from '../directives/authDirective.js';
import * as neo4jService from '../../services/neo4jService.js';
import * as fabricService from '../../services/fabricService.js';
import { docHashSchema } from '../../utils/validators.js';
import { logger } from '../../config/logger.js';
import type { RiskAssessment, FlaggedDocument, ConflictFlag } from '../../types/index.js';

export const conflictResolvers = {
  Query: {
    // -----------------------------------------------------------------------
    // getConflicts — paginated list of risk assessments
    // -----------------------------------------------------------------------
    getConflicts: async (
      _parent: unknown,
      args: { limit?: number; offset?: number },
      context: GraphQLContext
    ): Promise<RiskAssessment[]> => {
      requireAuth(context);

      const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
      const offset = Math.max(args.offset ?? 0, 0);

      try {
        // Query Neo4j for documents with risk data
        const results = await neo4jService.runCypher<RiskAssessment>(
          `
            MATCH (d:Document)
            WHERE d.riskScore IS NOT NULL AND d.riskScore > 0
            RETURN d.hash AS docHash, d.riskScore AS riskScore,
                   coalesce(d.flags, '[]') AS flagsJson,
                   coalesce(d.assessedAt, d.createdAt, datetime().epochMillis) AS assessedAt
            ORDER BY d.riskScore DESC
            SKIP $offset LIMIT $limit
          `,
          { offset, limit },
          (record) => {
            let flags: ConflictFlag[] = [];
            try {
              const flagsRaw = record.get('flagsJson') as string;
              flags = JSON.parse(flagsRaw) as ConflictFlag[];
            } catch {
              flags = [];
            }

            return {
              docHash: record.get('docHash') as string,
              riskScore: record.get('riskScore') as number,
              flags,
              assessedAt: String(record.get('assessedAt')),
            };
          }
        );

        logger.debug('Conflicts retrieved', { count: results.length, limit, offset });
        return results;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to get conflicts', { error: message });
        return [];
      }
    },

    // -----------------------------------------------------------------------
    // getRiskScore — risk assessment for a single document
    // -----------------------------------------------------------------------
    getRiskScore: async (
      _parent: unknown,
      args: { docHash: string },
      context: GraphQLContext
    ): Promise<RiskAssessment | null> => {
      requireAuth(context);

      const parseResult = docHashSchema.safeParse(args.docHash);
      if (!parseResult.success) {
        throw new GraphQLError('Invalid document hash format', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      try {
        const results = await neo4jService.runCypher<RiskAssessment>(
          `
            MATCH (d:Document {hash: $docHash})
            RETURN d.hash AS docHash, coalesce(d.riskScore, 0) AS riskScore,
                   coalesce(d.flags, '[]') AS flagsJson,
                   coalesce(d.assessedAt, d.createdAt, '') AS assessedAt
          `,
          { docHash: args.docHash },
          (record) => {
            let flags: ConflictFlag[] = [];
            try {
              const flagsRaw = record.get('flagsJson') as string;
              flags = JSON.parse(flagsRaw) as ConflictFlag[];
            } catch {
              flags = [];
            }

            return {
              docHash: record.get('docHash') as string,
              riskScore: record.get('riskScore') as number,
              flags,
              assessedAt: String(record.get('assessedAt')),
            };
          }
        );

        return results.length > 0 ? results[0]! : null;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to get risk score', { docHash: args.docHash, error: message });
        return null;
      }
    },

    // -----------------------------------------------------------------------
    // getFlaggedDocuments — documents above a risk threshold
    // -----------------------------------------------------------------------
    getFlaggedDocuments: async (
      _parent: unknown,
      args: { minRisk?: number },
      context: GraphQLContext
    ): Promise<FlaggedDocument[]> => {
      requireAuth(context);

      const minRisk = args.minRisk ?? 50;

      try {
        // Get document hashes from Neo4j that exceed the risk threshold
        const riskyDocs = await neo4jService.runCypher<{
          docHash: string;
          riskScore: number;
          flags: ConflictFlag[];
        }>(
          `
            MATCH (d:Document)
            WHERE d.riskScore IS NOT NULL AND d.riskScore >= $minRisk
            RETURN d.hash AS docHash, d.riskScore AS riskScore,
                   coalesce(d.flags, '[]') AS flagsJson
            ORDER BY d.riskScore DESC
            LIMIT 50
          `,
          { minRisk },
          (record) => {
            let flags: ConflictFlag[] = [];
            try {
              const flagsRaw = record.get('flagsJson') as string;
              flags = JSON.parse(flagsRaw) as ConflictFlag[];
            } catch {
              flags = [];
            }

            return {
              docHash: record.get('docHash') as string,
              riskScore: record.get('riskScore') as number,
              flags,
            };
          }
        );

        // Fetch full document records from Fabric for each flagged doc
        const flaggedDocuments: FlaggedDocument[] = [];

        for (const riskyDoc of riskyDocs) {
          try {
            const document = await fabricService.getDocument(riskyDoc.docHash);
            flaggedDocuments.push({
              document,
              riskScore: riskyDoc.riskScore,
              flags: riskyDoc.flags,
            });
          } catch {
            // Skip documents that can't be fetched from Fabric
            logger.warn('Flagged document not found in Fabric', {
              docHash: riskyDoc.docHash,
            });
          }
        }

        logger.debug('Flagged documents retrieved', {
          minRisk,
          count: flaggedDocuments.length,
        });
        return flaggedDocuments;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to get flagged documents', { error: message });
        return [];
      }
    },
  },
};

// ============================================================================
// LexNet Backend — Timeline Resolvers
// ============================================================================
//
// Queries:
//   - getPropertyTimeline(propertyId!) → PropertyTimeline (public)
//   - getDocumentEvents(docHash!) → [TimelineEvent] (requires auth)
// ============================================================================

import { GraphQLError } from 'graphql';
import { requireAuth, type GraphQLContext } from '../directives/authDirective.js';
import * as neo4jService from '../../services/neo4jService.js';
import * as fabricService from '../../services/fabricService.js';
import { docHashSchema } from '../../utils/validators.js';
import { logger } from '../../config/logger.js';
import type { TimelineEvent } from '../../types/index.js';

export const timelineResolvers = {
  Query: {
    // -----------------------------------------------------------------------
    // getPropertyTimeline — public
    // -----------------------------------------------------------------------
    getPropertyTimeline: async (
      _parent: unknown,
      args: { propertyId: string },
      _context: GraphQLContext
    ) => {
      if (!args.propertyId || args.propertyId.trim().length === 0) {
        throw new GraphQLError('Property ID is required', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      return neo4jService.getPropertyTimeline(args.propertyId);
    },

    // -----------------------------------------------------------------------
    // getDocumentEvents — requires auth
    // Builds a timeline from the blockchain history of a document
    // -----------------------------------------------------------------------
    getDocumentEvents: async (
      _parent: unknown,
      args: { docHash: string },
      context: GraphQLContext
    ): Promise<TimelineEvent[]> => {
      requireAuth(context);

      const parseResult = docHashSchema.safeParse(args.docHash);
      if (!parseResult.success) {
        throw new GraphQLError('Invalid document hash format', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      try {
        const history = await fabricService.getDocumentHistory(args.docHash);

        // Transform blockchain history into timeline events
        const events: TimelineEvent[] = history.map((record, index) => {
          let eventType = 'registration';
          let description = `Document registered by ${record.ownerId}`;

          if (index > 0) {
            const prevRecord = history[index - 1]!;
            if (prevRecord.ownerId !== record.ownerId) {
              eventType = 'transfer';
              description = `Ownership transferred from ${prevRecord.ownerId} to ${record.ownerId}`;
            } else if (record.activeDispute && !prevRecord.activeDispute) {
              eventType = 'dispute_filed';
              description = `Dispute filed: case ${record.disputeCaseId}`;
            } else if (!record.activeDispute && prevRecord.activeDispute) {
              eventType = 'dispute_resolved';
              description = `Dispute resolved: case ${prevRecord.disputeCaseId}`;
            } else {
              eventType = 'update';
              description = `Document record updated`;
            }
          }

          return {
            id: `${args.docHash}-${index}`,
            eventType,
            timestamp: record.timestamp || record.createdAt,
            description,
            docHash: record.docHash,
            actor: record.ownerId,
          };
        });

        logger.debug('Document events generated', {
          docHash: args.docHash,
          eventCount: events.length,
        });

        return events;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to get document events', {
          docHash: args.docHash,
          error: message,
        });
        return [];
      }
    },
  },
};

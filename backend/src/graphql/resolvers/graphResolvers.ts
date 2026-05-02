// ============================================================================
// LexNet Backend — Graph Resolvers
// ============================================================================
//
// Queries (public — no auth required):
//   - getKnowledgeGraph(docHash!, depth?) → GraphData
//   - searchNodes(query!) → [NodeSearchResult]
// ============================================================================

import { GraphQLError } from 'graphql';
import type { GraphQLContext } from '../directives/authDirective.js';
import * as neo4jService from '../../services/neo4jService.js';
import { docHashSchema } from '../../utils/validators.js';

export const graphResolvers = {
  Query: {
    // -----------------------------------------------------------------------
    // getKnowledgeGraph — public (no auth)
    // -----------------------------------------------------------------------
    getKnowledgeGraph: async (
      _parent: unknown,
      args: { docHash: string; depth?: number },
      _context: GraphQLContext
    ) => {
      const parseResult = docHashSchema.safeParse(args.docHash);
      if (!parseResult.success) {
        throw new GraphQLError('Invalid document hash format', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const depth = args.depth ?? 2;
      if (depth < 1 || depth > 5) {
        throw new GraphQLError('Depth must be between 1 and 5', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      return neo4jService.getKnowledgeGraph(args.docHash, depth);
    },

    // -----------------------------------------------------------------------
    // searchNodes — public (no auth)
    // -----------------------------------------------------------------------
    searchNodes: async (
      _parent: unknown,
      args: { query: string },
      _context: GraphQLContext
    ) => {
      if (!args.query || args.query.trim().length === 0) {
        throw new GraphQLError('Search query is required', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      if (args.query.length > 500) {
        throw new GraphQLError('Search query too long (max 500 characters)', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      return neo4jService.searchNodes(args.query);
    },
  },
};

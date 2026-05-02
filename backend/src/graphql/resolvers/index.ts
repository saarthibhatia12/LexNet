// ============================================================================
// LexNet Backend — Resolver Index
// ============================================================================
//
// Aggregates all resolver maps into a single object for Apollo Server.
// Deep-merges Query and Mutation fields from each resolver module.
// ============================================================================

import GraphQLJSON from 'graphql-type-json';
import { authResolvers } from './authResolvers.js';
import { documentResolvers } from './documentResolvers.js';
import { graphResolvers } from './graphResolvers.js';
import { conflictResolvers } from './conflictResolvers.js';
import { timelineResolvers } from './timelineResolvers.js';

/**
 * Merged resolver map combining all domain resolvers.
 *
 * Apollo Server merges these into the executable schema.
 * Each resolver module contributes Query and/or Mutation fields.
 */
export const resolvers = {
  // Custom scalar for JSON properties
  JSON: GraphQLJSON,

  Query: {
    ...documentResolvers.Query,
    ...graphResolvers.Query,
    ...conflictResolvers.Query,
    ...timelineResolvers.Query,
  },

  Mutation: {
    ...authResolvers.Mutation,
    ...documentResolvers.Mutation,
  },
};

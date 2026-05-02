// ============================================================================
// LexNet Backend — @auth GraphQL Directive
// ============================================================================
//
// Implements the @auth directive that checks for an authenticated user
// in the GraphQL context. Fields decorated with @auth require a valid
// session JWT in the request.
//
// Usage in schema: directive @auth on FIELD_DEFINITION
//
// Apollo Server 4 does not support schema directives the same way as v3.
// Instead we implement auth checking inside resolvers using a helper.
// The directive is still declared in the SDL for documentation purposes.
// ============================================================================

import { GraphQLError } from 'graphql';
import type { SessionJwtPayload } from '../../types/index.js';
import { logger } from '../../config/logger.js';

/**
 * GraphQL context type expected by all resolvers.
 */
export interface GraphQLContext {
  user?: SessionJwtPayload;
}

/**
 * Assert that the current request has an authenticated user.
 * Throws a GraphQL UNAUTHENTICATED error if no user is present in context.
 *
 * Usage in resolvers:
 *   const user = requireAuth(context);
 *
 * @param context - The GraphQL context object
 * @returns The authenticated user's JWT payload
 * @throws GraphQLError with UNAUTHENTICATED code if not authenticated
 */
export function requireAuth(context: GraphQLContext): SessionJwtPayload {
  if (!context.user) {
    logger.debug('GraphQL auth check failed: no user in context');
    throw new GraphQLError('Authentication required', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }

  return context.user;
}

/**
 * Assert that the current user has one of the specified roles.
 *
 * @param context - The GraphQL context object
 * @param roles - Array of allowed roles
 * @returns The authenticated user's JWT payload
 * @throws GraphQLError with FORBIDDEN code if the user's role is not allowed
 */
export function requireRole(
  context: GraphQLContext,
  roles: string[]
): SessionJwtPayload {
  const user = requireAuth(context);

  if (!roles.includes(user.role)) {
    logger.warn('GraphQL authorization failed', {
      userId: user.userId,
      role: user.role,
      requiredRoles: roles,
    });
    throw new GraphQLError('Insufficient permissions', {
      extensions: { code: 'FORBIDDEN' },
    });
  }

  return user;
}

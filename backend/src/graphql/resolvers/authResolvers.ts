// ============================================================================
// LexNet Backend — Auth Resolvers
// ============================================================================
//
// Mutation: login
//
// Authenticates demo users (hardcoded — acceptable for student project).
// Returns a session JWT with the user's role.
// ============================================================================

import jwt from 'jsonwebtoken';
import { GraphQLError } from 'graphql';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { GraphQLContext } from '../directives/authDirective.js';
import { JWT_ALGORITHM, SESSION_JWT_EXPIRY, DEMO_USERS } from '../../utils/constants.js';
import { loginInputSchema } from '../../utils/validators.js';
import type { SessionJwtPayload } from '../../types/index.js';

export const authResolvers = {
  Mutation: {
    login: async (
      _parent: unknown,
      args: { username: string; password: string },
      _context: GraphQLContext
    ) => {
      // Validate input
      const parseResult = loginInputSchema.safeParse(args);
      if (!parseResult.success) {
        throw new GraphQLError('Invalid login credentials', {
          extensions: {
            code: 'BAD_USER_INPUT',
            errors: parseResult.error.issues,
          },
        });
      }

      const { username, password } = parseResult.data;

      // Find matching demo user
      const user = DEMO_USERS.find(
        (u) => u.username === username && u.password === password
      );

      if (!user) {
        logger.warn('GraphQL login failed: invalid credentials', { username });
        throw new GraphQLError('Invalid username or password', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }

      // Issue session JWT
      const sessionPayload: Omit<SessionJwtPayload, 'iat' | 'exp'> = {
        userId: user.username,
        role: user.role,
      };

      const token = jwt.sign(sessionPayload, env.JWT_SECRET, {
        algorithm: JWT_ALGORITHM,
        expiresIn: SESSION_JWT_EXPIRY,
      });

      logger.info('GraphQL login successful', {
        username: user.username,
        role: user.role,
      });

      return {
        token,
        userId: user.username,
        role: user.role,
        expiresIn: SESSION_JWT_EXPIRY,
      };
    },
  },
};

// ============================================================================
// LexNet Backend — Server Bootstrap
// ============================================================================
//
// Entry point for the LexNet backend server.
//
// Startup sequence:
//   1. Validate environment variables (Zod — fails fast)
//   2. Create Express app
//   3. Register global middleware: CORS, JSON parser, input sanitizer,
//      global rate limiter
//   4. Mount REST routes on /api
//   5. Create and start Apollo Server (GraphQL) on /graphql
//   6. Register error handler (must be last)
//   7. Start listening on PORT
//
// Shutdown:
//   - SIGINT / SIGTERM → close Neo4j driver, disconnect Fabric, stop server
// ============================================================================

import express from 'express';
import cors from 'cors';
import http from 'node:http';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import jwt from 'jsonwebtoken';

import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { typeDefs } from './graphql/schema.js';
import { resolvers } from './graphql/resolvers/index.js';
import type { GraphQLContext } from './graphql/directives/authDirective.js';
import type { SessionJwtPayload } from './types/index.js';
import { JWT_ALGORITHM, API_PREFIX, GRAPHQL_PATH } from './utils/constants.js';

import { createRestRouter } from './rest/routes.js';
import { globalRateLimiter } from './middleware/rateLimiter.js';
import { inputSanitizer } from './middleware/inputSanitizer.js';
import { errorHandler } from './middleware/errorHandler.js';
import { close as closeNeo4j } from './services/neo4jService.js';
import { disconnectFabric } from './config/fabric.js';

/**
 * Create and configure the Express application with Apollo Server.
 * Exported for use in integration tests (without starting a listener).
 */
export async function createApp(): Promise<{
  app: express.Application;
  httpServer: http.Server;
  apolloServer: ApolloServer<GraphQLContext>;
}> {
  const app = express();
  const httpServer = http.createServer(app);

  // ---------------------------------------------------------------------------
  // Apollo Server
  // ---------------------------------------------------------------------------

  const apolloServer = new ApolloServer<GraphQLContext>({
    typeDefs,
    resolvers,
    plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
    formatError: (formattedError, _error) => {
      // In production, strip internal error details
      if (env.NODE_ENV === 'production') {
        return {
          message: formattedError.message,
          extensions: {
            code: formattedError.extensions?.code ?? 'INTERNAL_SERVER_ERROR',
          },
        };
      }
      return formattedError;
    },
  });

  await apolloServer.start();

  // ---------------------------------------------------------------------------
  // Global Middleware
  // ---------------------------------------------------------------------------

  // CORS — allow all origins in development, restrict in production
  app.use(
    cors({
      origin: env.NODE_ENV === 'production' ? false : '*',
      credentials: true,
    })
  );

  // Trust proxy (for rate limiter IP detection behind reverse proxy)
  app.set('trust proxy', 1);

  // JSON body parser (must be before routes)
  app.use(express.json({ limit: '55mb' }));

  // Input sanitization (DOMPurify on all string inputs)
  app.use(inputSanitizer);

  // Global rate limiter (100 req / 15 min)
  app.use(globalRateLimiter);

  // ---------------------------------------------------------------------------
  // REST Routes
  // ---------------------------------------------------------------------------

  const restRouter = createRestRouter();
  app.use(API_PREFIX, restRouter);

  // ---------------------------------------------------------------------------
  // GraphQL Endpoint
  // ---------------------------------------------------------------------------

  app.use(
    GRAPHQL_PATH,
    expressMiddleware(apolloServer, {
      context: async ({ req }): Promise<GraphQLContext> => {
        // Extract user from JWT if present (optional auth)
        const authHeader = req.headers.authorization;
        let user: SessionJwtPayload | undefined;

        if (authHeader) {
          const parts = authHeader.split(' ');
          if (parts.length === 2 && parts[0] === 'Bearer') {
            try {
              user = jwt.verify(parts[1]!, env.JWT_SECRET, {
                algorithms: [JWT_ALGORITHM],
              }) as SessionJwtPayload;
            } catch {
              // Invalid token — user remains undefined
              // Individual resolvers will enforce auth via requireAuth()
            }
          }
        }

        return { user };
      },
    })
  );

  // ---------------------------------------------------------------------------
  // Error Handler (must be registered LAST)
  // ---------------------------------------------------------------------------

  app.use(errorHandler);

  return { app, httpServer, apolloServer };
}

/**
 * Start the server and listen on the configured PORT.
 */
async function startServer(): Promise<void> {
  try {
    const { httpServer, apolloServer } = await createApp();
    const port = env.PORT;

    await new Promise<void>((resolve) => {
      httpServer.listen(port, () => {
        resolve();
      });
    });

    logger.info(`🚀 LexNet Backend running`, {
      port,
      environment: env.NODE_ENV,
      graphql: `http://localhost:${port}${GRAPHQL_PATH}`,
      rest: `http://localhost:${port}${API_PREFIX}`,
      health: `http://localhost:${port}${API_PREFIX}/health`,
    });

    // -----------------------------------------------------------------------
    // Graceful Shutdown
    // -----------------------------------------------------------------------

    const shutdown = async (signal: string) => {
      logger.info(`${signal} received — shutting down gracefully...`);

      await apolloServer.stop();
      logger.info('Apollo Server stopped');

      await closeNeo4j();
      disconnectFabric();

      httpServer.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Forceful shutdown after timeout');
        process.exit(1);
      }, 10_000);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown startup error';
    logger.error('Server startup failed', { error: message });
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Start the server (skip if imported as a module for testing)
// ---------------------------------------------------------------------------

// Only start when run directly, not when imported in tests
const isDirectRun = process.argv[1]?.includes('index');
if (isDirectRun) {
  startServer();
}

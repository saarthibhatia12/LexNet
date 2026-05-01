import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';

// Load .env from the current working directory (should be backend/)
// This works regardless of whether we're running from src/ or dist/
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Zod schema for all 18 backend environment variables.
 * Throws with a clear, human-readable error if any variable is missing or invalid.
 */
const envSchema = z.object({
  // Server
  PORT: z
    .string()
    .default('4000')
    .transform(Number)
    .pipe(z.number().int().min(1).max(65535)),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  // Authentication
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRY: z
    .string()
    .default('1h')
    .refine(
      (val) => /^\d+[smhd]$/.test(val),
      'JWT_EXPIRY must be a valid duration string (e.g. "1h", "30m", "7d")'
    ),

  // Hyperledger Fabric
  FABRIC_CHANNEL: z
    .string()
    .min(1, 'FABRIC_CHANNEL is required'),
  FABRIC_CHAINCODE: z
    .string()
    .min(1, 'FABRIC_CHAINCODE is required'),
  FABRIC_WALLET_PATH: z
    .string()
    .min(1, 'FABRIC_WALLET_PATH is required'),
  FABRIC_CONNECTION_PROFILE: z
    .string()
    .min(1, 'FABRIC_CONNECTION_PROFILE is required'),
  FABRIC_MSP_ID: z
    .string()
    .min(1, 'FABRIC_MSP_ID is required'),

  // IPFS
  IPFS_API_URL: z
    .string()
    .url('IPFS_API_URL must be a valid URL'),
  IPFS_GATEWAY_URL: z
    .string()
    .url('IPFS_GATEWAY_URL must be a valid URL'),

  // Neo4j
  NEO4J_URI: z
    .string()
    .min(1, 'NEO4J_URI is required'),
  NEO4J_USER: z
    .string()
    .min(1, 'NEO4J_USER is required'),
  NEO4J_PASSWORD: z
    .string()
    .min(1, 'NEO4J_PASSWORD is required'),

  // Encryption
  AES_KEY: z
    .string()
    .length(64, 'AES_KEY must be exactly 64 hex characters (256-bit key)')
    .regex(/^[0-9a-fA-F]+$/, 'AES_KEY must contain only hex characters'),

  // NLP Service
  NLP_SERVICE_URL: z
    .string()
    .url('NLP_SERVICE_URL must be a valid URL'),

  // Verification
  VERIFICATION_BASE_URL: z
    .string()
    .url('VERIFICATION_BASE_URL must be a valid URL'),

  // Logging
  LOG_LEVEL: z
    .enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'])
    .default('info'),

  // File uploads
  MAX_FILE_SIZE_MB: z
    .string()
    .default('50')
    .transform(Number)
    .pipe(z.number().int().min(1).max(500)),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables.
 * This function is called once at startup and cached.
 */
function loadEnv(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `\n❌ Invalid environment variables:\n${formatted}\n\nCheck your backend/.env file against .env.example.\n`
    );
  }

  return result.data;
}

/**
 * Validated, typed environment configuration.
 * Access any env var via `env.PORT`, `env.JWT_SECRET`, etc.
 */
export const env: EnvConfig = loadEnv();

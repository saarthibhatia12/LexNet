import winston from 'winston';
import { env } from './env.js';

/**
 * List of env var names whose values must NEVER appear in logs.
 * The redaction filter replaces occurrences of these values with '[REDACTED]'.
 */
const SECRETS_TO_REDACT: string[] = [
  'JWT_SECRET',
  'AES_KEY',
  'NEO4J_PASSWORD',
];

/**
 * Collect the actual secret values from the environment at startup
 * so the redaction filter can match them in log messages.
 */
function getSecretValues(): string[] {
  const secrets: string[] = [];

  for (const key of SECRETS_TO_REDACT) {
    const value = process.env[key];
    if (value && value.length > 0) {
      secrets.push(value);
    }
  }

  return secrets;
}

const secretValues = getSecretValues();

/**
 * Winston format that redacts known secret values from log messages.
 * Scans the serialised message and replaces any occurrence of a secret
 * value with '[REDACTED]'.
 */
const redactSecrets = winston.format((info: winston.Logform.TransformableInfo) => {
  const msg = info.message as string | undefined;
  if (typeof msg === 'string') {
    let redacted = msg;
    for (const secret of secretValues) {
      if (redacted.includes(secret)) {
        redacted = redacted.replaceAll(secret, '[REDACTED]');
      }
    }
    info.message = redacted;
  }

  // Also redact secrets from any additional metadata fields
  for (const key of Object.keys(info)) {
    if (key === 'level' || key === 'message' || key === 'timestamp') {
      continue;
    }
    const val = info[key];
    if (typeof val === 'string') {
      for (const secret of secretValues) {
        if (val.includes(secret)) {
          info[key] = val.replaceAll(secret, '[REDACTED]');
        }
      }
    }
  }

  return info;
});

/**
 * Winston logger instance for the LexNet backend.
 *
 * Features:
 * - JSON format for structured logging
 * - Console transport (coloured in development)
 * - File transport for persistent error logs
 * - Automatic redaction of secrets (JWT_SECRET, AES_KEY, NEO4J_PASSWORD)
 */
export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  defaultMeta: { service: 'lexnet-backend' },
  format: winston.format.combine(
    redactSecrets(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    // Console transport — pretty-printed in development, JSON in production
    new winston.transports.Console({
      format:
        env.NODE_ENV === 'development'
          ? winston.format.combine(
              winston.format.colorize(),
              winston.format.printf(({ level, message, timestamp, service, ...meta }: winston.Logform.TransformableInfo) => {
                const metaStr =
                  Object.keys(meta).length > 0
                    ? ` ${JSON.stringify(meta)}`
                    : '';
                return `${timestamp as string} [${service as string}] ${level}: ${message as string}${metaStr}`;
              })
            )
          : undefined,
    }),

    // File transport — errors only, persisted for debugging
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5 * 1024 * 1024, // 5 MB
      maxFiles: 5,
    }),

    // File transport — all logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 3,
    }),
  ],
  // Do not exit on unhandled errors — let the process manager decide
  exitOnError: false,
});

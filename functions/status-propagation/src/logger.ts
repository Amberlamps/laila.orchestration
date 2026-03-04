/**
 * Structured logging for the status-propagation Lambda function.
 *
 * Uses pino for JSON output to stdout, which CloudWatch Logs captures
 * automatically. Provides a factory for creating per-invocation child
 * loggers enriched with the Lambda request ID and X-Ray trace ID.
 */

import pino, { type Logger } from 'pino';

/**
 * Base pino logger for the status-propagation function.
 *
 * Configured with:
 * - ISO timestamps for CloudWatch Logs Insights compatibility
 * - Standard error serializers for stack trace capture
 * - Configurable level via LOG_LEVEL environment variable
 */
const baseLogger: Logger = pino({
  name: 'status-propagation',
  level: process.env['LOG_LEVEL'] ?? 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
});

/**
 * Minimal logger interface for dependency injection into processing
 * modules. Avoids coupling downstream code to pino directly.
 */
export interface StatusPropagationLogger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
  debug: (obj: Record<string, unknown>, msg?: string) => void;
}

/**
 * Create a child logger scoped to a single Lambda invocation.
 *
 * Enriches every log entry with:
 * - `requestId` -- the Lambda request ID for correlation
 * - `traceId` -- the X-Ray trace ID for distributed tracing (when available)
 */
export const createInvocationLogger = (requestId: string): Logger => {
  return baseLogger.child({
    requestId,
    traceId: process.env['_X_AMZN_TRACE_ID'],
  });
};

export { baseLogger };
export type { Logger };

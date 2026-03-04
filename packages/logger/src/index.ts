/**
 * Shared pino logger configuration for all server-side code.
 * Outputs JSON to stdout, which CloudWatch Logs captures automatically.
 * Provides factory functions for creating child loggers with context.
 */

import pino, { type Logger, type LoggerOptions } from 'pino';

/**
 * Base pino configuration shared across all server-side code.
 * JSON output format for CloudWatch Logs compatibility.
 */
const baseConfig: LoggerOptions = {
  level: process.env['LOG_LEVEL'] ?? 'info',
  // Use ISO timestamp format for CloudWatch Logs Insights queries
  timestamp: pino.stdTimeFunctions.isoTime,
  // Redact sensitive fields to prevent accidental logging of secrets
  redact: {
    paths: [
      'req.headers.authorization',
      "req.headers['x-api-key']",
      'req.headers.cookie',
      'body.password',
      'body.secret',
    ],
    censor: '[REDACTED]',
  },
  // Format error objects with stack traces
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
};

/**
 * Context fields for creating a request-scoped child logger.
 *
 * Required:
 * - requestId: unique request identifier (Lambda request ID or generated UUID)
 *
 * Optional:
 * - traceId: X-Ray trace ID for distributed tracing correlation
 * - userId: authenticated user ID
 * - agentId: worker agent ID
 * - path: request URL path
 * - method: HTTP method
 */
export interface RequestLoggerContext {
  requestId: string;
  traceId?: string;
  userId?: string;
  agentId?: string;
  path?: string;
  method?: string;
}

/**
 * Parameters for logging a completed request.
 */
export interface RequestCompleteParams {
  statusCode: number;
  durationMs: number;
  responseSize?: number;
}

/**
 * Create a root logger instance.
 * Used at module level in API routes and Lambda handlers.
 */
export const createLogger = (context?: Record<string, unknown>): Logger => {
  if (context) {
    return pino({ ...baseConfig, ...context });
  }
  return pino(baseConfig);
};

/**
 * Create a child logger with request-specific context.
 * Called at the beginning of each request/invocation.
 *
 * Fields added to every log entry:
 * - requestId: unique request identifier (Lambda request ID or generated UUID)
 * - traceId: X-Ray trace ID for distributed tracing correlation
 * - userId: authenticated user ID (if available)
 * - agentId: worker agent ID (if available)
 */
export const createRequestLogger = (parent: Logger, context: RequestLoggerContext): Logger => {
  return parent.child(context);
};

/**
 * Log a completed request with duration.
 * Called at the end of each request/invocation.
 *
 * Log levels by status code:
 * - 5xx: error
 * - 4xx: warn
 * - 2xx/3xx: info
 */
export const logRequestComplete = (logger: Logger, params: RequestCompleteParams): void => {
  const { statusCode, durationMs, responseSize } = params;

  if (statusCode >= 500) {
    logger.error({ statusCode, durationMs, responseSize }, 'Request completed with server error');
  } else if (statusCode >= 400) {
    logger.warn({ statusCode, durationMs, responseSize }, 'Request completed with client error');
  } else {
    logger.info({ statusCode, durationMs, responseSize }, 'Request completed');
  }
};

/** Default logger instance for convenience imports. */
export const logger = createLogger();

export type { Logger, LoggerOptions };

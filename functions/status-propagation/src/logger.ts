/**
 * Structured logging for the status-propagation Lambda function.
 *
 * Delegates to the shared @laila/logger package for consistent JSON output,
 * X-Ray Root trace ID extraction, and sensitive-field redaction.
 */

import { createLambdaLogger } from '@laila/logger/lambda';

import type { Logger } from '@laila/logger';
import type { Context } from 'aws-lambda';

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
 * - `traceId` -- the X-Ray Root trace ID for distributed tracing (when available)
 */
export const createInvocationLogger = (requestId: string, context?: Context): Logger => {
  if (context) {
    return createLambdaLogger(context);
  }

  return createLambdaLogger({ awsRequestId: requestId } as Context);
};

export type { Logger };

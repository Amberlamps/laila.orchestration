/**
 * Structured logging for the audit-archiver Lambda function.
 *
 * Delegates to the shared @laila/logger package for consistent JSON output,
 * X-Ray Root trace ID extraction, and sensitive-field redaction.
 */

import { createLambdaLogger } from '@laila/logger/lambda';

import type { Logger } from '@laila/logger';
import type { Context } from 'aws-lambda';

/**
 * Create a child logger scoped to a single Lambda invocation.
 *
 * Enriches every log entry with:
 * - `requestId` — the Lambda request ID for correlation
 * - `traceId` — the X-Ray Root trace ID for distributed tracing (when available)
 */
export const createInvocationLogger = (requestId: string, context?: Context): Logger => {
  if (context) {
    return createLambdaLogger(context);
  }

  return createLambdaLogger({ awsRequestId: requestId } as Context);
};

export type { Logger };

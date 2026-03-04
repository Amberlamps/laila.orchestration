/**
 * Utility for creating loggers in Lambda function handlers.
 * Extracts the Lambda request ID and X-Ray Root trace ID from the context.
 */

import { extractTraceId } from './xray.js';

import { createRequestLogger, logger } from './index.js';

import type { Context } from 'aws-lambda';
import type { Logger } from 'pino';

/**
 * Create a request logger from a Lambda invocation context.
 * Automatically extracts requestId and the Root trace ID (via extractTraceId).
 *
 * Usage:
 * ```typescript
 * export const handler = async (event: SQSEvent, context: Context) => {
 *   const log = createLambdaLogger(context);
 *   log.info({ event }, "Lambda invoked");
 * };
 * ```
 */
export const createLambdaLogger = (context: Context): Logger => {
  const traceId = extractTraceId();

  return createRequestLogger(logger, {
    requestId: context.awsRequestId,
    ...(traceId !== undefined ? { traceId } : {}),
  });
};

/**
 * Middleware for adding structured logging to Next.js API routes.
 * Wraps route handlers to add request context and log completion.
 */

import { randomUUID } from 'node:crypto';

import { type Logger, createRequestLogger, logRequestComplete, logger } from '@laila/logger';

import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Parse the X-Ray Root trace ID from a raw trace header string.
 * The header format is "Root=1-abc123-def456;Parent=ghi789;Sampled=1".
 * Returns just the Root segment value, or undefined if not present.
 */
const parseRootTraceId = (header: string): string | undefined => {
  const match = header.match(/Root=([^;]+)/);
  return match?.[1] ?? undefined;
};

/** Extended request type that includes the structured logger. */
export interface LoggedRequest extends NextApiRequest {
  log: Logger;
}

/**
 * Wraps an API route handler with structured logging.
 * Adds request ID, timing, and completion logging.
 *
 * Usage:
 * ```typescript
 * export default withLogging(async (req, res) => {
 *   req.log.info("Handling request");
 *   res.status(200).json({ ok: true });
 * });
 * ```
 */
export const withLogging = (
  handler: (req: LoggedRequest, res: NextApiResponse) => Promise<void>,
) => {
  return async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
    const startTime = performance.now();
    const requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();

    // Extract X-Ray Root trace ID — parse the Root segment from either
    // the Lambda env var or the incoming request header.
    const rawTraceHeader =
      process.env['_X_AMZN_TRACE_ID'] ?? (req.headers['x-amzn-trace-id'] as string | undefined);
    const traceId = rawTraceHeader !== undefined ? parseRootTraceId(rawTraceHeader) : undefined;

    const requestLogger = createRequestLogger(logger, {
      requestId,
      ...(traceId !== undefined ? { traceId } : {}),
      ...(req.url !== undefined ? { path: req.url } : {}),
      ...(req.method !== undefined ? { method: req.method } : {}),
    });

    // Attach logger to request for use in handlers
    const loggedReq = req as LoggedRequest;
    loggedReq.log = requestLogger;

    requestLogger.info('Request started');

    try {
      await handler(loggedReq, res);
    } finally {
      const durationMs = Math.round(performance.now() - startTime);
      logRequestComplete(requestLogger, {
        statusCode: res.statusCode,
        durationMs,
      });
    }
  };
};

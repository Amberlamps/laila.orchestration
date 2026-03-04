# Setup Pino Structured Logging

## Task Details

- **Title:** Setup Pino Structured Logging
- **Status:** Complete
- **Assigned Agent:** sre-engineer
- **Parent User Story:** [Configure Observability](./tasks.md)
- **Parent Epic:** [AWS Infrastructure & Deployment](../../user-stories.md)
- **Dependencies:** None

## Description

Configure pino for structured JSON logging across all server-side code: Next.js API routes and standalone Lambda functions. Each log entry includes standard fields (timestamp, level, message), request context (requestId, userId/agentId), distributed tracing context (traceId), and operational metrics (duration, error details). CloudWatch Logs captures the JSON output automatically from Lambda stdout.

### Shared Logger Package

```typescript
// packages/logger/src/index.ts
// Shared pino logger configuration for all server-side code.
// Outputs JSON to stdout, which CloudWatch Logs captures automatically.
// Provides a factory function for creating child loggers with context.

import pino, { type Logger, type LoggerOptions } from 'pino';

/**
 * Base pino configuration shared across all server-side code.
 * JSON output format for CloudWatch Logs compatibility.
 */
const baseConfig: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? 'info',
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
 * Create a root logger instance.
 * Used at module level in API routes and Lambda handlers.
 */
export function createLogger(context?: Record<string, unknown>): Logger {
  return pino({
    ...baseConfig,
    ...context,
  });
}

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
export function createRequestLogger(
  parent: Logger,
  context: {
    requestId: string;
    traceId?: string;
    userId?: string;
    agentId?: string;
    path?: string;
    method?: string;
  },
): Logger {
  return parent.child(context);
}

/**
 * Log a completed request with duration.
 * Called at the end of each request/invocation.
 */
export function logRequestComplete(
  logger: Logger,
  params: {
    statusCode: number;
    durationMs: number;
    responseSize?: number;
  },
): void {
  const { statusCode, durationMs, responseSize } = params;

  if (statusCode >= 500) {
    logger.error({
      statusCode,
      durationMs,
      responseSize,
      msg: 'Request completed with server error',
    });
  } else if (statusCode >= 400) {
    logger.warn({
      statusCode,
      durationMs,
      responseSize,
      msg: 'Request completed with client error',
    });
  } else {
    logger.info({ statusCode, durationMs, responseSize, msg: 'Request completed' });
  }
}

// Default logger instance
export const logger = createLogger();
```

### API Route Integration

```typescript
// lib/api/logging-middleware.ts
// Middleware for adding structured logging to Next.js API routes.
// Wraps route handlers to add request context and log completion.

import type { NextApiRequest, NextApiResponse } from 'next';
import { createRequestLogger, logRequestComplete, logger } from '@laila/logger';
import { randomUUID } from 'node:crypto';

/**
 * Wraps an API route handler with structured logging.
 * Adds request ID, timing, and completion logging.
 */
export function withLogging(handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>) {
  return async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
    const startTime = performance.now();
    const requestId = (req.headers['x-request-id'] as string) ?? randomUUID();

    // Extract X-Ray trace ID from the environment or header
    const traceId =
      process.env._X_AMZN_TRACE_ID ?? (req.headers['x-amzn-trace-id'] as string) ?? undefined;

    const requestLogger = createRequestLogger(logger, {
      requestId,
      traceId,
      path: req.url,
      method: req.method,
    });

    // Attach logger to request for use in handlers
    (req as NextApiRequest & { log: typeof requestLogger }).log = requestLogger;

    requestLogger.info({ msg: 'Request started' });

    try {
      await handler(req, res);
    } finally {
      const durationMs = Math.round(performance.now() - startTime);
      logRequestComplete(requestLogger, {
        statusCode: res.statusCode,
        durationMs,
      });
    }
  };
}
```

### Lambda Handler Integration

```typescript
// packages/logger/src/lambda.ts
// Utility for creating loggers in Lambda function handlers.
// Extracts the Lambda request ID and X-Ray trace ID from the context.

import type { Context } from 'aws-lambda';
import { createRequestLogger, logger } from './index';

/**
 * Create a request logger from a Lambda invocation context.
 * Automatically extracts requestId and traceId.
 */
export function createLambdaLogger(context: Context) {
  return createRequestLogger(logger, {
    requestId: context.awsRequestId,
    traceId: process.env._X_AMZN_TRACE_ID,
  });
}
```

## Acceptance Criteria

- [ ] Shared logger package exists at `packages/logger/`
- [ ] `createLogger()` produces a pino logger with JSON output
- [ ] `createRequestLogger()` creates child loggers with request-specific context
- [ ] Log entries include: timestamp (ISO 8601), level, message, requestId
- [ ] Optional fields: traceId (X-Ray), userId, agentId, path, method
- [ ] Sensitive fields are redacted: authorization header, API key, cookie, password
- [ ] Error objects are serialized with stack traces via `pino.stdSerializers.err`
- [ ] `logRequestComplete()` logs at appropriate levels (error for 5xx, warn for 4xx, info for 2xx/3xx)
- [ ] Duration is included in request completion logs
- [ ] API route middleware (`withLogging`) wraps handlers with logging
- [ ] Lambda utility (`createLambdaLogger`) extracts context from Lambda invocation
- [ ] LOG_LEVEL is configurable via environment variable (default "info")
- [ ] No `any` types are used in the implementation

## Technical Notes

- **pino JSON output:** pino outputs JSON to stdout by default. In Lambda, stdout is automatically captured by CloudWatch Logs, so no additional transport configuration is needed.
- **Redaction:** pino's built-in redaction uses fast path matching. The paths specified are checked on every log call, so keep the list short for performance.
- **X-Ray trace ID:** Lambda sets the `_X_AMZN_TRACE_ID` environment variable on each invocation. This is extracted and included in log entries for correlation between logs and traces.
- **Performance:** pino is the fastest Node.js logger, adding less than 1ms overhead per log call. This is critical for Lambda functions where every millisecond counts.
- **CloudWatch Logs Insights:** The structured JSON format enables powerful queries in CloudWatch Logs Insights. Example: `fields @timestamp, requestId, durationMs | filter statusCode >= 500 | sort @timestamp desc`

## References

- **pino:** https://getpino.io/ — Fast Node.js JSON logger
- **CloudWatch Logs Insights:** https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/AnalyzingLogData.html
- **X-Ray Trace ID:** https://docs.aws.amazon.com/xray/latest/devguide/xray-concepts.html#xray-concepts-traceid

## Estimated Complexity

Medium — Creating the shared package, API middleware, and Lambda utility. The redaction configuration and X-Ray trace ID extraction require attention to the runtime environment.

# Implement Global Error Handler

## Task Details

- **Title:** Implement Global Error Handler
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Error Handling Framework](./tasks.md)
- **Parent Epic:** [Core CRUD API](../../user-stories.md)
- **Dependencies:** Create Custom Error Classes

## Description

Implement a global error handler middleware for Next.js Pages Router API routes. This middleware wraps API route handlers and catches all thrown errors, mapping them to the standardized JSON error envelope format. It ensures that stack traces are never exposed in production, unknown errors are logged and returned as 500 Internal Server Error, and all error responses follow the same structure.

### Error Handler HOF

```typescript
// apps/web/src/lib/api/error-handler.ts
// Global error handler HOF (Higher-Order Function) for Next.js API routes.
// Wraps an API route handler and catches all errors, mapping them
// to the standardized JSON error envelope format.

import type { NextApiRequest, NextApiResponse } from 'next';
import { AppError, DomainErrorCode } from '@laila/shared';
import { randomUUID } from 'crypto';

/**
 * Standardized error response envelope.
 * All API error responses follow this shape regardless of the error type.
 * The `requestId` field enables correlation with server-side logs.
 */
interface ErrorResponse {
  error: {
    /** Machine-readable domain error code from DomainErrorCode enum */
    code: DomainErrorCode;
    /** Human-readable error message */
    message: string;
    /** Optional structured error details (e.g., field-level validation errors) */
    details?: Record<string, unknown>;
    /** Unique request identifier for log correlation */
    requestId: string;
  };
}

/**
 * Type for a Next.js API route handler function.
 */
type ApiHandler = (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

/**
 * Wraps an API route handler with global error handling.
 *
 * Behavior:
 * - If the handler throws an AppError subclass, map it to the appropriate
 *   HTTP status code and return the standardized error envelope.
 * - If the handler throws an unknown error, log it and return a 500
 *   with a generic message (never expose stack traces in production).
 * - Always generates a unique requestId for log correlation.
 * - Sets appropriate response headers (Content-Type, Retry-After for 429).
 *
 * Usage:
 *   export default withErrorHandler(async (req, res) => { ... });
 */
export function withErrorHandler(handler: ApiHandler): ApiHandler {
  return async (req, res) => {
    const requestId = randomUUID();

    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof AppError) {
        // Known application error — map to appropriate HTTP response.
        const response: ErrorResponse = {
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
            requestId,
          },
        };

        // Set Retry-After header for rate limit errors.
        if (error.statusCode === 429 && 'retryAfterSeconds' in error) {
          res.setHeader(
            'Retry-After',
            String((error as { retryAfterSeconds: number }).retryAfterSeconds),
          );
        }

        res.status(error.statusCode).json(response);
      } else {
        // Unknown error — log full details server-side, return generic 500.
        console.error('[API Error]', {
          requestId,
          method: req.method,
          url: req.url,
          error: error instanceof Error ? error.stack : String(error),
        });

        const response: ErrorResponse = {
          error: {
            code: DomainErrorCode.INTERNAL_ERROR,
            message:
              process.env.NODE_ENV === 'production'
                ? 'An internal server error occurred'
                : error instanceof Error
                  ? error.message
                  : 'An internal server error occurred',
            requestId,
          },
        };

        res.status(500).json(response);
      }
    }
  };
}
```

### Composing with Other Middleware

The error handler is typically the outermost wrapper in the middleware composition chain:

```typescript
// Example API route composition:
// withErrorHandler(withAuth(withValidation(schema)(handler)))
// This ensures that errors from auth and validation are also caught.
```

## Acceptance Criteria

- [ ] `withErrorHandler` wraps any Next.js API route handler and catches all thrown errors
- [ ] Known `AppError` subclasses are mapped to their `statusCode` and return the `ErrorResponse` envelope
- [ ] Unknown errors return HTTP 500 with `DomainErrorCode.INTERNAL_ERROR`
- [ ] Stack traces are never included in production error responses (`NODE_ENV === "production"`)
- [ ] In development mode, the original error message is included for debugging
- [ ] A unique `requestId` (UUID v4) is generated for every request and included in the error response
- [ ] `requestId` is logged alongside the error details for server-side correlation
- [ ] `Retry-After` header is set for `RateLimitError` (429) responses
- [ ] `Content-Type: application/json` is set on all error responses
- [ ] The error handler does not swallow errors silently — all unknown errors are logged via `console.error`
- [ ] The error handler does not interfere with successful responses (only activates on thrown errors)
- [ ] No `any` types are used in the implementation

## Technical Notes

- In Next.js Pages Router, there is no built-in middleware chain like Express. The HOF pattern (`withErrorHandler`, `withAuth`, `withValidation`) achieves the same composability. Each HOF wraps the handler and adds behavior.
- The `requestId` should eventually be read from an incoming `X-Request-Id` header if present (for distributed tracing), with a fallback to a generated UUID. For v1, generating a new UUID is sufficient.
- Consider structured logging (JSON format) for production error logs so they can be parsed by CloudWatch or other log aggregation tools.
- The error handler must be the **outermost** wrapper in the composition chain so it catches errors from all inner middleware (auth, validation, handler).

## References

- **Functional Requirements:** FR-API-001 (standardized error responses), FR-API-003 (request ID correlation)
- **Design Specification:** Section 6.1.2 (Global Error Handler), Section 6.3 (Middleware Composition Pattern)
- **OpenAPI Specification:** Error response schema in components/schemas/ErrorResponse

## Estimated Complexity

Medium — The HOF pattern is straightforward, but careful handling of error type discrimination (AppError vs unknown), production vs development behavior, and proper logging adds nuance.

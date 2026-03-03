/**
 * @module error-handler
 *
 * Global error handler HOF (Higher-Order Function) for Next.js API routes.
 *
 * Wraps an API route handler and catches all thrown errors, mapping them
 * to the standardized JSON error envelope format. This is the outermost
 * wrapper in the middleware composition chain, ensuring that errors from
 * auth, validation, and the handler itself are all caught and serialized.
 *
 * Composition order:
 * ```ts
 * export default withErrorHandler(
 *   withAuth("human",
 *     withValidation({ body: schema })(handler)
 *   )
 * );
 * ```
 *
 * Behavior:
 * - Known `AppError` subclasses map to their HTTP `statusCode` and return
 *   the standardized `ErrorResponse` envelope.
 * - Unknown errors return HTTP 500 with `DomainErrorCode.INTERNAL_ERROR`.
 * - Stack traces are never included in production responses.
 * - In development, the original error message is included for debugging.
 * - A unique `requestId` (UUID v4) is generated per request for log correlation.
 * - `Retry-After` header is set for `RateLimitError` (429) responses.
 * - `Content-Type: application/json` is set on all error responses.
 * - All unknown errors are logged via `console.error` with structured context.
 */

import { randomUUID } from 'node:crypto';

import { AppError, DomainErrorCode } from '@laila/shared';

import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Standardized error response envelope.
 * All API error responses follow this shape regardless of the error type.
 * The `requestId` field enables correlation with server-side logs.
 */
export interface ErrorResponse {
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the `ErrorResponse` envelope for a known `AppError`.
 */
const buildAppErrorResponse = (error: AppError, requestId: string): ErrorResponse => ({
  error: {
    code: error.code,
    message: error.message,
    ...(error.details !== undefined && { details: error.details }),
    requestId,
  },
});

/**
 * Determine the error message for an unknown error based on the environment.
 * In production, a generic message is returned to avoid leaking internals.
 * In development, the original error message is included for debugging.
 */
const resolveUnknownErrorMessage = (error: unknown): string => {
  if (process.env.NODE_ENV === 'production') {
    return 'An internal server error occurred';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An internal server error occurred';
};

/**
 * Build the `ErrorResponse` envelope for an unknown (non-AppError) error.
 */
const buildUnknownErrorResponse = (error: unknown, requestId: string): ErrorResponse => ({
  error: {
    code: DomainErrorCode.INTERNAL_ERROR,
    message: resolveUnknownErrorMessage(error),
    requestId,
  },
});

/**
 * Log structured error context for server-side correlation.
 * Uses JSON-friendly shape for log aggregation tools (e.g., CloudWatch).
 */
const logError = (requestId: string, req: NextApiRequest, error: unknown): void => {
  console.error('[API Error]', {
    requestId,
    method: req.method,
    url: req.url,
    error: error instanceof Error ? error.stack : String(error),
  });
};

// ---------------------------------------------------------------------------
// withErrorHandler HOF
// ---------------------------------------------------------------------------

/**
 * Wraps an API route handler with global error handling.
 *
 * - If the handler executes successfully, the response passes through untouched.
 * - If the handler throws an `AppError` subclass, the error is mapped to the
 *   appropriate HTTP status code and the standardized error envelope is returned.
 * - If the handler throws an unknown error, it is logged and a 500 response
 *   with a generic message is returned (original message shown in development).
 * - A unique `requestId` is generated for every request and included in the
 *   error response and server-side log output.
 *
 * @param handler - The Next.js API route handler to wrap
 * @returns A wrapped handler with error handling applied
 *
 * @example
 * ```ts
 * export default withErrorHandler(async (req, res) => {
 *   const project = await getProject(req.query.id);
 *   if (!project) {
 *     throw new NotFoundError(DomainErrorCode.PROJECT_NOT_FOUND, 'Project not found');
 *   }
 *   res.json(project);
 * });
 * ```
 */
export const withErrorHandler =
  (handler: ApiHandler): ApiHandler =>
  async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
    const requestId = randomUUID();

    try {
      await handler(req, res);
    } catch (error: unknown) {
      // --- Known application error ---
      if (error instanceof AppError) {
        const response = buildAppErrorResponse(error, requestId);

        // Set Retry-After header for rate limit errors.
        if (error.statusCode === 429 && 'retryAfterSeconds' in error) {
          const retryAfter = (error as { retryAfterSeconds: number }).retryAfterSeconds;
          res.setHeader('Retry-After', String(retryAfter));
        }

        res.setHeader('Content-Type', 'application/json').status(error.statusCode).json(response);

        return;
      }

      // --- Unknown error ---
      logError(requestId, req, error);

      const response = buildUnknownErrorResponse(error, requestId);

      res.setHeader('Content-Type', 'application/json').status(500).json(response);
    }
  };

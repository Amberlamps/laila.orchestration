/**
 * @module @laila/shared/errors/http-errors
 *
 * Concrete error classes for each HTTP status code category.
 * Each class sets the appropriate status code and accepts a domain error
 * code for machine-readable identification.
 *
 * Constructor parameter order is `(code, message, details?)` to enforce
 * that callers always provide a specific domain error code, preventing
 * generic "something went wrong" errors that are unhelpful for consumers.
 */

import { AppError, DomainErrorCode } from './base-error';

/**
 * 400 Bad Request -- validation failures, malformed input, invalid state transitions.
 */
export class ValidationError extends AppError {
  readonly statusCode = 400 as const;

  constructor(
    public readonly code: DomainErrorCode = DomainErrorCode.VALIDATION_FAILED,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message, details);
  }
}

/**
 * 401 Unauthorized -- missing, invalid, or expired credentials.
 */
export class AuthenticationError extends AppError {
  readonly statusCode = 401 as const;

  constructor(
    public readonly code: DomainErrorCode = DomainErrorCode.AUTH_FAILURE,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message, details);
  }
}

/**
 * 403 Forbidden -- authenticated but lacks required permissions.
 */
export class AuthorizationError extends AppError {
  readonly statusCode = 403 as const;

  constructor(
    public readonly code: DomainErrorCode = DomainErrorCode.INSUFFICIENT_PERMISSIONS,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message, details);
  }
}

/**
 * 404 Not Found -- requested resource does not exist.
 */
export class NotFoundError extends AppError {
  readonly statusCode = 404 as const;

  constructor(
    public readonly code: DomainErrorCode = DomainErrorCode.RESOURCE_NOT_FOUND,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message, details);
  }
}

/**
 * 409 Conflict -- optimistic locking failure, duplicate resource, or invalid state.
 */
export class ConflictError extends AppError {
  readonly statusCode = 409 as const;

  constructor(
    public readonly code: DomainErrorCode = DomainErrorCode.ASSIGNMENT_CONFLICT,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message, details);
  }
}

/**
 * 429 Too Many Requests -- client has exceeded the allowed request rate.
 *
 * Includes `retryAfterSeconds` so the error handler can set the
 * `Retry-After` response header.
 */
export class RateLimitError extends AppError {
  readonly statusCode = 429 as const;
  readonly code = DomainErrorCode.RATE_LIMIT_EXCEEDED;
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message, { retryAfterSeconds });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

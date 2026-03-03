/**
 * @module @laila/shared/errors/base-error
 *
 * Domain error codes and abstract base error class for the application.
 *
 * DomainErrorCode provides high-level, machine-readable error identification
 * used across the API layer. These codes are returned in JSON error responses
 * so clients can programmatically determine the error category and take
 * appropriate action (e.g., retry, re-authenticate, display field errors).
 *
 * AppError is the abstract base that all custom error classes extend. The
 * global error handler middleware recognizes AppError instances and maps
 * them to standardized JSON error envelopes.
 */

/**
 * Domain error codes used across the application.
 * These are returned in API error responses for machine-readable error handling.
 * Workers and clients can switch on these codes to determine error type.
 *
 * Note: For more granular, field-level error codes used in API responses,
 * see {@link ErrorCode} from `@laila/shared/constants/error-codes`.
 */
export enum DomainErrorCode {
  // Validation errors (400)
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  INVALID_STATUS_TRANSITION = 'INVALID_STATUS_TRANSITION',
  DAG_CYCLE_DETECTED = 'DAG_CYCLE_DETECTED',
  INVALID_DEPENDENCY = 'INVALID_DEPENDENCY',
  COST_VALIDATION_FAILED = 'COST_VALIDATION_FAILED',

  // Authentication errors (401)
  AUTH_FAILURE = 'AUTH_FAILURE',
  INVALID_API_KEY = 'INVALID_API_KEY',
  SESSION_EXPIRED = 'SESSION_EXPIRED',

  // Authorization errors (403)
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  PROJECT_ACCESS_DENIED = 'PROJECT_ACCESS_DENIED',
  WORKER_NOT_ASSIGNED = 'WORKER_NOT_ASSIGNED',

  // Not found errors (404)
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND',
  EPIC_NOT_FOUND = 'EPIC_NOT_FOUND',
  STORY_NOT_FOUND = 'STORY_NOT_FOUND',
  TASK_NOT_FOUND = 'TASK_NOT_FOUND',
  WORKER_NOT_FOUND = 'WORKER_NOT_FOUND',
  PERSONA_NOT_FOUND = 'PERSONA_NOT_FOUND',

  // Conflict errors (409)
  ASSIGNMENT_CONFLICT = 'ASSIGNMENT_CONFLICT',
  OPTIMISTIC_LOCK_CONFLICT = 'OPTIMISTIC_LOCK_CONFLICT',
  STORY_IN_PROGRESS = 'STORY_IN_PROGRESS',
  READ_ONLY_VIOLATION = 'READ_ONLY_VIOLATION',
  DELETION_BLOCKED = 'DELETION_BLOCKED',

  // Rate limit errors (429)
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // Internal errors (500)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * Abstract base application error. All custom error classes extend this.
 *
 * The global error handler recognizes instances of AppError and maps them
 * to the standardized JSON error envelope. Subclasses must provide a
 * concrete `statusCode` and `code`.
 *
 * The `details` field carries structured error context -- for example,
 * Zod validation errors with field-level details, or DAG cycle paths.
 *
 * `Object.setPrototypeOf` is called in the constructor because TypeScript
 * compilation to ES5 breaks the prototype chain for classes extending
 * built-in `Error`. Without it, `instanceof AppError` checks would fail.
 */
export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: DomainErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    if (details !== undefined) {
      this.details = details;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

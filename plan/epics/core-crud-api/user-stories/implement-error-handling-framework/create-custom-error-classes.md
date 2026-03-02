# Create Custom Error Classes

## Task Details

- **Title:** Create Custom Error Classes
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Error Handling Framework](./tasks.md)
- **Parent Epic:** [Core CRUD API](../../user-stories.md)
- **Dependencies:** None

## Description

Create a typed error class hierarchy for the API. Each error class maps to a specific HTTP status code and carries a domain-specific error code enum value. These error classes are thrown throughout the API layer and caught by the global error handler middleware, which maps them to standardized JSON responses.

### Error Class Hierarchy

```typescript
// packages/shared/src/errors/base-error.ts
// Base application error class that all custom errors extend.
// Carries an HTTP status code and a domain-specific error code
// for machine-readable error identification.

/**
 * Domain error codes used across the application.
 * These are returned in API error responses for machine-readable error handling.
 * Workers and clients can switch on these codes to determine error type.
 */
export enum DomainErrorCode {
  // Validation errors (400)
  VALIDATION_FAILED = "VALIDATION_FAILED",
  INVALID_STATUS_TRANSITION = "INVALID_STATUS_TRANSITION",
  DAG_CYCLE_DETECTED = "DAG_CYCLE_DETECTED",
  INVALID_DEPENDENCY = "INVALID_DEPENDENCY",
  COST_VALIDATION_FAILED = "COST_VALIDATION_FAILED",

  // Authentication errors (401)
  AUTH_FAILURE = "AUTH_FAILURE",
  INVALID_API_KEY = "INVALID_API_KEY",
  SESSION_EXPIRED = "SESSION_EXPIRED",

  // Authorization errors (403)
  INSUFFICIENT_PERMISSIONS = "INSUFFICIENT_PERMISSIONS",
  PROJECT_ACCESS_DENIED = "PROJECT_ACCESS_DENIED",
  WORKER_NOT_ASSIGNED = "WORKER_NOT_ASSIGNED",

  // Not found errors (404)
  RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND",
  PROJECT_NOT_FOUND = "PROJECT_NOT_FOUND",
  EPIC_NOT_FOUND = "EPIC_NOT_FOUND",
  STORY_NOT_FOUND = "STORY_NOT_FOUND",
  TASK_NOT_FOUND = "TASK_NOT_FOUND",
  WORKER_NOT_FOUND = "WORKER_NOT_FOUND",
  PERSONA_NOT_FOUND = "PERSONA_NOT_FOUND",

  // Conflict errors (409)
  ASSIGNMENT_CONFLICT = "ASSIGNMENT_CONFLICT",
  OPTIMISTIC_LOCK_CONFLICT = "OPTIMISTIC_LOCK_CONFLICT",
  STORY_IN_PROGRESS = "STORY_IN_PROGRESS",
  READ_ONLY_VIOLATION = "READ_ONLY_VIOLATION",
  DELETION_BLOCKED = "DELETION_BLOCKED",

  // Rate limit errors (429)
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",

  // Internal errors (500)
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

/**
 * Base application error. All custom error classes extend this.
 * The global error handler recognizes instances of AppError
 * and maps them to the standardized JSON error envelope.
 */
export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: DomainErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
```

### Concrete Error Classes

```typescript
// packages/shared/src/errors/http-errors.ts
// Concrete error classes for each HTTP status code category.
// Each class sets the appropriate status code and accepts
// a domain error code for machine-readable identification.

import { AppError, DomainErrorCode } from "./base-error";

export class ValidationError extends AppError {
  readonly statusCode = 400;
  constructor(
    public readonly code: DomainErrorCode = DomainErrorCode.VALIDATION_FAILED,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message, details);
  }
}

export class AuthenticationError extends AppError {
  readonly statusCode = 401;
  constructor(
    public readonly code: DomainErrorCode = DomainErrorCode.AUTH_FAILURE,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message, details);
  }
}

export class AuthorizationError extends AppError {
  readonly statusCode = 403;
  constructor(
    public readonly code: DomainErrorCode = DomainErrorCode.INSUFFICIENT_PERMISSIONS,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message, details);
  }
}

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  constructor(
    public readonly code: DomainErrorCode = DomainErrorCode.RESOURCE_NOT_FOUND,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message, details);
  }
}

export class ConflictError extends AppError {
  readonly statusCode = 409;
  constructor(
    public readonly code: DomainErrorCode = DomainErrorCode.ASSIGNMENT_CONFLICT,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message, details);
  }
}

export class RateLimitError extends AppError {
  readonly statusCode = 429;
  readonly code = DomainErrorCode.RATE_LIMIT_EXCEEDED;
  readonly retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds: number) {
    super(message, { retryAfterSeconds });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
```

### Export Barrel

```typescript
// packages/shared/src/errors/index.ts
// Barrel export for all error classes and the domain error code enum.
export { AppError, DomainErrorCode } from "./base-error";
export {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
} from "./http-errors";
```

## Acceptance Criteria

- [ ] `AppError` base class is abstract and extends `Error` with `statusCode`, `code`, and optional `details`
- [ ] `DomainErrorCode` enum contains all specified error codes (at least 20 codes across categories)
- [ ] `ValidationError` (400), `AuthenticationError` (401), `AuthorizationError` (403), `NotFoundError` (404), `ConflictError` (409), `RateLimitError` (429) classes are implemented
- [ ] Each error class correctly sets `this.name` to the constructor name
- [ ] `Object.setPrototypeOf` is called to maintain proper `instanceof` checks in TypeScript
- [ ] `RateLimitError` includes `retryAfterSeconds` for the `Retry-After` header
- [ ] All error classes accept a `message` and optional `details` parameter
- [ ] Error classes are exported from `@laila/shared` package barrel
- [ ] No `any` types are used anywhere in the error class hierarchy
- [ ] Unit tests cover construction, instanceof checks, and serialization of each error class

## Technical Notes

- Error classes live in `@laila/shared` because they are used by both the API layer (to throw) and potentially by clients (to parse error codes). The `DomainErrorCode` enum is the contract between server and client for machine-readable error identification.
- The `Object.setPrototypeOf` call is necessary because TypeScript compilation to ES5 breaks the prototype chain for classes extending built-in `Error`. Without it, `instanceof AppError` checks would fail.
- The `details` field is a generic record that can carry structured error context — for example, Zod validation errors with field-level details, or DAG cycle paths.
- Consider making the constructor parameter order `(code, message, details)` rather than `(message, details)` to enforce that callers always provide a domain error code. This prevents generic "something went wrong" errors that are unhelpful for API consumers.

## References

- **Functional Requirements:** FR-API-001 (standardized error responses), FR-API-002 (domain error codes)
- **Design Specification:** Section 6.1 (Error Handling Architecture), Section 6.1.1 (Error Class Hierarchy)
- **OpenAPI Specification:** Error response schema definitions in `@laila/api-spec`

## Estimated Complexity

Medium — The error class hierarchy itself is straightforward, but careful design of the `DomainErrorCode` enum requires anticipating all error scenarios across the application. The enum will be extended as new features are added.

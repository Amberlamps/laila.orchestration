/**
 * @module @laila/shared/constants/error-codes
 *
 * Comprehensive error code enumeration for structured error responses
 * across all services in the system.
 *
 * Error codes follow the naming convention: {CATEGORY}_{SPECIFIC_ERROR}
 *
 * Categories:
 * - VALIDATION  -- Input validation and data integrity errors
 * - AUTH        -- Authentication errors (identity verification)
 * - AUTHZ       -- Authorization errors (permission checks)
 * - NOT_FOUND   -- Resource lookup failures
 * - CONFLICT    -- Optimistic locking and state conflict errors
 * - DEPENDENCY  -- Dependency graph errors (cycles, unresolved refs)
 * - RATE_LIMIT  -- Rate limiting errors
 * - INTERNAL    -- Unexpected server-side errors
 *
 * Defined as a Zod schema for runtime validation support.
 * TypeScript type is inferred directly from the schema.
 */

import { z } from 'zod';

/**
 * Structured error codes used in API error responses.
 *
 * Each code maps to a specific error condition, enabling clients to
 * programmatically handle errors without relying on message strings.
 */
export const errorCodeSchema = z.enum([
  // ---------------------------------------------------------------------------
  // Validation errors -- invalid input data or state transitions
  // ---------------------------------------------------------------------------

  /** A required field is missing from the request body */
  'VALIDATION_REQUIRED_FIELD',
  /** A field value does not match the expected format or type */
  'VALIDATION_INVALID_FORMAT',
  /** A field value is outside the allowed range */
  'VALIDATION_OUT_OF_RANGE',
  /** The requested status transition is not permitted by the state machine */
  'VALIDATION_INVALID_STATUS_TRANSITION',
  /** The provided enum value is not in the allowed set */
  'VALIDATION_INVALID_ENUM_VALUE',
  /** Request payload exceeds maximum allowed size */
  'VALIDATION_PAYLOAD_TOO_LARGE',

  // ---------------------------------------------------------------------------
  // Authentication errors -- identity verification failures
  // ---------------------------------------------------------------------------

  /** No API key or auth token was provided in the request */
  'AUTH_MISSING_CREDENTIALS',
  /** The provided API key is malformed or does not exist */
  'AUTH_INVALID_API_KEY',
  /** The API key or token has expired */
  'AUTH_EXPIRED_TOKEN',
  /** The authentication token has been revoked */
  'AUTH_REVOKED_TOKEN',

  // ---------------------------------------------------------------------------
  // Authorization errors -- permission and access control failures
  // ---------------------------------------------------------------------------

  /** The authenticated principal lacks the required permission */
  'AUTHZ_INSUFFICIENT_PERMISSIONS',
  /** The authenticated principal does not have access to this resource */
  'AUTHZ_RESOURCE_ACCESS_DENIED',
  /** The operation is not allowed for the current role */
  'AUTHZ_ROLE_NOT_ALLOWED',

  // ---------------------------------------------------------------------------
  // Not-found errors -- requested resources do not exist
  // ---------------------------------------------------------------------------

  /** The requested resource could not be found */
  'NOT_FOUND_RESOURCE',
  /** The referenced project does not exist */
  'NOT_FOUND_PROJECT',
  /** The referenced epic does not exist */
  'NOT_FOUND_EPIC',
  /** The referenced user story does not exist */
  'NOT_FOUND_STORY',
  /** The referenced task does not exist */
  'NOT_FOUND_TASK',
  /** The specified API route does not exist */
  'NOT_FOUND_ROUTE',

  // ---------------------------------------------------------------------------
  // Conflict errors -- optimistic locking and state conflicts
  // ---------------------------------------------------------------------------

  /** The resource version does not match (optimistic locking failure) */
  'CONFLICT_VERSION_MISMATCH',
  /** A resource with the same unique identifier already exists */
  'CONFLICT_DUPLICATE_RESOURCE',
  /** The resource is in a state that conflicts with the requested operation */
  'CONFLICT_INVALID_STATE',

  // ---------------------------------------------------------------------------
  // Dependency errors -- dependency graph integrity failures
  // ---------------------------------------------------------------------------

  /** Adding this dependency would create a circular reference */
  'DEPENDENCY_CYCLE_DETECTED',
  /** One or more referenced dependencies do not exist */
  'DEPENDENCY_UNRESOLVED',
  /** Cannot remove a dependency that other items still depend on */
  'DEPENDENCY_STILL_REFERENCED',
  /** The dependency graph has reached the maximum allowed depth */
  'DEPENDENCY_MAX_DEPTH_EXCEEDED',

  // ---------------------------------------------------------------------------
  // Rate limiting errors
  // ---------------------------------------------------------------------------

  /** The client has exceeded the allowed request rate */
  'RATE_LIMIT_EXCEEDED',

  // ---------------------------------------------------------------------------
  // Internal errors -- unexpected server-side failures
  // ---------------------------------------------------------------------------

  /** An unexpected internal error occurred */
  'INTERNAL_SERVER_ERROR',
  /** A downstream service is unavailable or timed out */
  'INTERNAL_SERVICE_UNAVAILABLE',
]);

/** TypeScript union type for all error code values */
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** Tuple of all valid error code values, useful for iteration */
export const ERROR_CODES = errorCodeSchema.options;

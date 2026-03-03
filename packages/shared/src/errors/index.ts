/**
 * @module @laila/shared/errors
 *
 * Barrel export for all error classes and the domain error code enum.
 *
 * Usage:
 *   import { ValidationError, DomainErrorCode } from '@laila/shared/errors';
 *   throw new ValidationError(DomainErrorCode.VALIDATION_FAILED, 'Name is required', { field: 'name' });
 */

export { AppError, DomainErrorCode } from './base-error';
export {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
} from './http-errors';

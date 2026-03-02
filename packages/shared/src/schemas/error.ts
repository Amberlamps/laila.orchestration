/**
 * @module @laila/shared/schemas/error
 *
 * Standardized error response envelope for all API error responses.
 *
 * Supports two error patterns:
 * 1. **General errors** — a single error code and message (e.g., 404 Not Found)
 * 2. **Field-level validation errors** — an array of per-field error details
 *    for form validation feedback (e.g., 400 Validation Error)
 *
 * Every error response includes a `requestId` for correlation with
 * server-side logs and distributed tracing.
 *
 * @example
 * ```typescript
 * // General error
 * const notFound = errorEnvelopeSchema.parse({
 *   error: {
 *     code: 'NOT_FOUND_RESOURCE',
 *     message: 'Project not found',
 *     requestId: '550e8400-e29b-41d4-a716-446655440000',
 *   },
 * });
 *
 * // Validation error with field-level details
 * const validationError = errorEnvelopeSchema.parse({
 *   error: {
 *     code: 'VALIDATION_REQUIRED_FIELD',
 *     message: 'Validation failed',
 *     details: [
 *       { field: 'name', message: 'Name is required' },
 *       { field: 'email', message: 'Invalid email format', code: 'VALIDATION_INVALID_FORMAT' },
 *     ],
 *     requestId: '550e8400-e29b-41d4-a716-446655440001',
 *   },
 * });
 * ```
 */

import { z } from 'zod';

import { errorCodeSchema } from '../constants/error-codes';

// ---------------------------------------------------------------------------
// Field-level error detail
// ---------------------------------------------------------------------------

/**
 * A single field-level validation error.
 *
 * Used inside `errorEnvelopeSchema.error.details` to provide
 * granular feedback for form validation scenarios.
 */
export const fieldErrorSchema = z.object({
  /** The request body field that failed validation (dot-notation for nested fields) */
  field: z.string().min(1),

  /** Human-readable description of the validation failure */
  message: z.string().min(1),

  /** Optional machine-readable error code for programmatic handling */
  code: z.string().min(1).optional(),
});

/** Inferred TypeScript type for a single field-level error */
export type FieldError = z.infer<typeof fieldErrorSchema>;

// ---------------------------------------------------------------------------
// Error envelope
// ---------------------------------------------------------------------------

/**
 * Standardized error response envelope used by all API endpoints.
 *
 * The outer `error` wrapper ensures error responses are never confused
 * with success responses, even when inspecting raw JSON.
 */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    /** Machine-readable error code from the system error code enum */
    code: errorCodeSchema,

    /** Human-readable error message suitable for logging or display */
    message: z.string().min(1),

    /**
     * Optional array of field-level validation errors.
     *
     * Present when the error is a validation failure with per-field
     * details (e.g., form submission with multiple invalid fields).
     */
    details: z.array(fieldErrorSchema).optional(),

    /** Unique request identifier for log correlation and debugging */
    requestId: z.string().uuid(),
  }),
});

/** Inferred TypeScript type for the full error envelope */
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

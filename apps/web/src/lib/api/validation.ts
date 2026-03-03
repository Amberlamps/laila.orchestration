/**
 * @module validation
 *
 * Request validation middleware using Zod schemas from @laila/shared.
 *
 * Provides a `withValidation` higher-order function that validates
 * `req.body`, `req.query`, and route `params` against optional Zod
 * schemas before forwarding to the inner handler. On failure it throws
 * a `ValidationError` with aggregated, field-level error details so
 * the upstream `withErrorHandler` can serialise a standards-compliant
 * 400 response.
 *
 * Usage:
 * ```ts
 * export default withErrorHandler(
 *   withValidation({ body: createProjectSchema })(
 *     async (req, res, { body }) => {
 *       // body is fully typed and validated
 *     }
 *   )
 * );
 * ```
 */

import { DomainErrorCode, ValidationError } from '@laila/shared';
import { type ZodError, type ZodType } from 'zod';

import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Schema configuration for request validation.
 * Each field is optional -- only provided schemas are validated.
 * Schemas come from @laila/shared where they are defined alongside
 * the entity types for single-source-of-truth validation.
 */
interface ValidationSchemas<
  TBody extends ZodType = ZodType,
  TQuery extends ZodType = ZodType,
  TParams extends ZodType = ZodType,
> {
  /** Zod schema for the request body (POST, PATCH, PUT) */
  body?: TBody;
  /** Zod schema for query string parameters (GET with filters/pagination) */
  query?: TQuery;
  /** Zod schema for route parameters (e.g., { id: z.string().uuid() }) */
  params?: TParams;
}

/**
 * Validated and parsed request data.
 * The generic types correspond to the output types of the Zod schemas provided.
 * Handlers receive this instead of raw req.body/req.query.
 */
interface ValidatedData<TBody = unknown, TQuery = unknown, TParams = unknown> {
  body: TBody;
  query: TQuery;
  params: TParams;
}

/**
 * Type for a Next.js API route handler that receives validated data.
 */
type ValidatedHandler<TBody, TQuery, TParams> = (
  req: NextApiRequest,
  res: NextApiResponse,
  data: ValidatedData<TBody, TQuery, TParams>,
) => Promise<void> | void;

/**
 * HTTP methods that typically do not carry a request body.
 * When one of these methods is used and req.body is absent,
 * body validation is skipped even if a body schema was provided.
 */
const BODYLESS_METHODS = new Set(['GET', 'HEAD', 'DELETE', 'OPTIONS']);

// ---------------------------------------------------------------------------
// Field error extraction
// ---------------------------------------------------------------------------

/**
 * Extract field-level errors from a ZodError and merge into the
 * accumulated errors object with a prefix (body, query, params).
 *
 * Each Zod issue is mapped to a key like `body.name` or `query.page`.
 * When an issue has no path (e.g. a top-level refinement) the key
 * falls back to the bare prefix.
 */
const mergeFieldErrors = (
  target: Record<string, string[]>,
  prefix: string,
  zodError: ZodError,
): void => {
  for (const issue of zodError.issues) {
    const path = issue.path.length > 0 ? `${prefix}.${issue.path.join('.')}` : prefix;

    if (!target[path]) {
      target[path] = [];
    }
    target[path].push(issue.message);
  }
};

// ---------------------------------------------------------------------------
// withValidation HOF
// ---------------------------------------------------------------------------

/**
 * Higher-order function that validates request data against Zod schemas
 * before passing control to the handler. Throws `ValidationError` on
 * failure so the upstream `withErrorHandler` can produce a structured
 * 400 response.
 *
 * @param schemas - Optional Zod schemas for body, query, and params
 * @returns A function that accepts a validated handler and returns a
 *          standard Next.js API handler
 *
 * @example
 * ```ts
 * withValidation({
 *   body: createProjectSchema,
 *   query: paginationQuerySchema,
 * })(async (req, res, { body, query }) => {
 *   // body and query are fully typed and validated
 * });
 * ```
 *
 * On validation failure, throws a ValidationError with field-level details:
 * ```json
 * {
 *   "error": {
 *     "code": "VALIDATION_FAILED",
 *     "message": "Request validation failed",
 *     "details": {
 *       "fieldErrors": {
 *         "body.name": ["Required"],
 *         "query.page": ["Expected number, received string"]
 *       }
 *     }
 *   }
 * }
 * ```
 */
export const withValidation = <
  TBody extends ZodType = ZodType,
  TQuery extends ZodType = ZodType,
  TParams extends ZodType = ZodType,
>(
  schemas: ValidationSchemas<TBody, TQuery, TParams>,
) => {
  type BodyOut = TBody extends ZodType<infer O> ? O : unknown;
  type QueryOut = TQuery extends ZodType<infer O> ? O : unknown;
  type ParamsOut = TParams extends ZodType<infer O> ? O : unknown;

  return (handler: ValidatedHandler<BodyOut, QueryOut, ParamsOut>) =>
    async (req: NextApiRequest, res: NextApiResponse): Promise<void> => {
      const errors: Record<string, string[]> = {};

      // --- Validate body (if schema provided) ---
      // Skip body validation for bodyless HTTP methods (GET, DELETE, etc.)
      // when req.body is absent, per the task's technical requirement.
      let parsedBody: BodyOut = undefined as BodyOut;
      if (schemas.body) {
        const skipBody =
          BODYLESS_METHODS.has(req.method ?? '') && (req.body === undefined || req.body === null);

        if (!skipBody) {
          const result = schemas.body.safeParse(req.body);
          if (!result.success) {
            mergeFieldErrors(errors, 'body', result.error);
          } else {
            parsedBody = result.data as BodyOut;
          }
        }
      }

      // --- Validate query (if schema provided) ---
      let parsedQuery: QueryOut = undefined as QueryOut;
      if (schemas.query) {
        const result = schemas.query.safeParse(req.query);
        if (!result.success) {
          mergeFieldErrors(errors, 'query', result.error);
        } else {
          parsedQuery = result.data as QueryOut;
        }
      }

      // --- Validate params (if schema provided) ---
      // Next.js Pages Router exposes dynamic route params in req.query.
      // When both query and params schemas are provided, params validates
      // the same req.query object -- the schemas should be disjoint by
      // field names, and each picks only its own keys.
      let parsedParams: ParamsOut = undefined as ParamsOut;
      if (schemas.params) {
        const result = schemas.params.safeParse(req.query);
        if (!result.success) {
          mergeFieldErrors(errors, 'params', result.error);
        } else {
          parsedParams = result.data as ParamsOut;
        }
      }

      // --- If any validation errors, throw with aggregated field details ---
      if (Object.keys(errors).length > 0) {
        throw new ValidationError(DomainErrorCode.VALIDATION_FAILED, 'Request validation failed', {
          fieldErrors: errors,
        });
      }

      // --- All schemas passed -- call handler with validated data ---
      await handler(req, res, {
        body: parsedBody,
        query: parsedQuery,
        params: parsedParams,
      });
    };
};

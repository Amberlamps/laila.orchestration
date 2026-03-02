# Implement Request Validation Middleware

## Task Details

- **Title:** Implement Request Validation Middleware
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Error Handling Framework](./tasks.md)
- **Parent Epic:** [Core CRUD API](../../user-stories.md)
- **Dependencies:** None

## Description

Create a `withValidation` middleware HOF that takes Zod schemas for request body, query parameters, and route parameters, and validates incoming requests against them. On validation failure, it returns a 400 error with field-level error details. On success, it passes the parsed (and type-safe) data to the handler.

### Validation Middleware

```typescript
// apps/web/src/lib/api/validation.ts
// Request validation middleware using Zod schemas from @laila/shared.
// Validates body, query, and params before passing to the handler.
// Returns 400 with field-level errors on validation failure.

import type { NextApiRequest, NextApiResponse } from "next";
import { z, ZodError, type ZodSchema } from "zod";
import { ValidationError, DomainErrorCode } from "@laila/shared";

/**
 * Schema configuration for request validation.
 * Each field is optional — only provided schemas are validated.
 * Schemas come from @laila/shared where they are defined alongside
 * the entity types for single-source-of-truth validation.
 */
interface ValidationSchemas {
  /** Zod schema for the request body (POST, PATCH, PUT) */
  body?: ZodSchema;
  /** Zod schema for query string parameters (GET with filters/pagination) */
  query?: ZodSchema;
  /** Zod schema for route parameters (e.g., { id: z.string().uuid() }) */
  params?: ZodSchema;
}

/**
 * Validated and parsed request data.
 * The generic types correspond to the Zod schemas provided.
 * Handlers receive this instead of raw req.body/req.query.
 */
interface ValidatedData<
  TBody = unknown,
  TQuery = unknown,
  TParams = unknown,
> {
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
  data: ValidatedData<TBody, TQuery, TParams>
) => Promise<void>;

/**
 * HOF that validates request data against Zod schemas before
 * passing to the handler. Throws ValidationError on failure.
 *
 * Usage:
 *   withValidation({
 *     body: createProjectSchema,
 *     query: paginationSchema,
 *   })(async (req, res, { body, query }) => {
 *     // body and query are fully typed and validated
 *   })
 *
 * On validation failure, throws a ValidationError with field-level details:
 *   {
 *     error: {
 *       code: "VALIDATION_FAILED",
 *       message: "Request validation failed",
 *       details: {
 *         fieldErrors: {
 *           "body.name": ["Required"],
 *           "query.page": ["Expected number, received string"]
 *         }
 *       }
 *     }
 *   }
 */
export function withValidation<
  TBody = unknown,
  TQuery = unknown,
  TParams = unknown,
>(schemas: ValidationSchemas) {
  return (handler: ValidatedHandler<TBody, TQuery, TParams>) => {
    return async (req: NextApiRequest, res: NextApiResponse) => {
      const errors: Record<string, string[]> = {};

      // Validate body if schema provided
      let parsedBody: TBody = undefined as TBody;
      if (schemas.body) {
        const result = schemas.body.safeParse(req.body);
        if (!result.success) {
          mergeFieldErrors(errors, "body", result.error);
        } else {
          parsedBody = result.data as TBody;
        }
      }

      // Validate query if schema provided
      let parsedQuery: TQuery = undefined as TQuery;
      if (schemas.query) {
        const result = schemas.query.safeParse(req.query);
        if (!result.success) {
          mergeFieldErrors(errors, "query", result.error);
        } else {
          parsedQuery = result.data as TQuery;
        }
      }

      // Validate params if schema provided
      // Next.js Pages Router exposes dynamic route params in req.query
      let parsedParams: TParams = undefined as TParams;
      if (schemas.params) {
        const result = schemas.params.safeParse(req.query);
        if (!result.success) {
          mergeFieldErrors(errors, "params", result.error);
        } else {
          parsedParams = result.data as TParams;
        }
      }

      // If any validation errors, throw ValidationError with field details
      if (Object.keys(errors).length > 0) {
        throw new ValidationError(
          DomainErrorCode.VALIDATION_FAILED,
          "Request validation failed",
          { fieldErrors: errors }
        );
      }

      // All schemas passed — call handler with validated data
      await handler(req, res, {
        body: parsedBody,
        query: parsedQuery,
        params: parsedParams,
      });
    };
  };
}

/**
 * Extract field-level errors from a ZodError and merge into the
 * accumulated errors object with a prefix (body, query, params).
 */
function mergeFieldErrors(
  target: Record<string, string[]>,
  prefix: string,
  zodError: ZodError
): void {
  for (const issue of zodError.issues) {
    const path = issue.path.length > 0
      ? `${prefix}.${issue.path.join(".")}`
      : prefix;
    if (!target[path]) {
      target[path] = [];
    }
    target[path].push(issue.message);
  }
}
```

### Pagination Schema Example

```typescript
// packages/shared/src/schemas/pagination.ts
// Reusable pagination schema for list endpoints.
// All GET list endpoints accept these query parameters.

import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort_by: z.string().optional(),
  sort_order: z.enum(["asc", "desc"]).default("asc"),
});

export type PaginationParams = z.infer<typeof paginationSchema>;
```

## Acceptance Criteria

- [ ] `withValidation` accepts optional Zod schemas for `body`, `query`, and `params`
- [ ] Request body is validated against the `body` schema when provided
- [ ] Query string parameters are validated against the `query` schema when provided
- [ ] Route parameters are validated against the `params` schema when provided
- [ ] On validation failure, a `ValidationError` is thrown with field-level error details
- [ ] Field error paths are prefixed with the source (`body.name`, `query.page`, `params.id`)
- [ ] Multiple validation errors across body/query/params are aggregated into a single error response
- [ ] On success, the handler receives typed and parsed data (Zod transforms and defaults applied)
- [ ] The middleware composes correctly with `withErrorHandler` and `withAuth` HOFs
- [ ] Query parameters use `z.coerce` for automatic string-to-number/boolean coercion
- [ ] No `any` types are used in the implementation
- [ ] Unit tests cover: valid input passthrough, single field error, multiple field errors, nested object errors, array field errors, coercion behavior, default values

## Technical Notes

- In Next.js Pages Router, route parameters (e.g., `[id]`) are merged into `req.query`. The `params` schema validates the same `req.query` object but is conceptually separate. If both `query` and `params` schemas are provided, the implementation must handle the overlap correctly (params are extracted first, remaining keys are query parameters). Consider using Zod `.passthrough()` or validating params from the route pattern.
- Zod's `.safeParse()` is used instead of `.parse()` to avoid throwing and allow aggregation of errors across body/query/params. The `ValidationError` is thrown once with all collected errors.
- The `z.coerce` transform is essential for query parameters because they arrive as strings from the URL. Without coercion, `?page=1` would fail a `z.number()` check.
- The middleware must handle `req.body` being `undefined` for GET/DELETE requests where no body is expected. If a `body` schema is provided for a GET request, it should be skipped or treated as empty.

## References

- **Functional Requirements:** FR-API-004 (request validation), FR-API-005 (field-level error details)
- **Design Specification:** Section 6.2 (Request Validation), Section 6.3 (Middleware Composition Pattern)
- **Shared Package:** Zod schemas in `@laila/shared` for all entity types

## Estimated Complexity

Medium — The Zod integration is well-documented, but handling the Next.js Pages Router's parameter merging behavior, field error path extraction, and generic type inference for the validated data requires careful implementation.

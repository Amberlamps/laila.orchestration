# Define Shared Utility Types

## Task Details

- **Title:** Define Shared Utility Types
- **Status:** Not Started
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement @laila/shared Zod Schemas and Types](./tasks.md)
- **Parent Epic:** [Shared Packages & API Contracts](../../user-stories.md)
- **Dependencies:** Define Entity Schemas, Define API Request/Response Schemas

## Description

Define shared utility types, pagination schemas, error envelope schemas, and audit event schemas in `@laila/shared`. These are cross-cutting types used throughout the API layer, error handling, and audit logging.

Utility types provide the structural building blocks that wrap domain entities for API responses (paginated lists, error envelopes) and capture system events (audit logs).

## Acceptance Criteria

- [ ] `packages/shared/src/schemas/pagination.ts` exports `paginationQuerySchema` with `page` (default 1), `limit` (default 20, max 100), `sortBy`, `sortOrder` fields
- [ ] `packages/shared/src/schemas/pagination.ts` exports `paginatedResponseSchema` factory that wraps any entity schema in a paginated response shape: `{ data: T[], pagination: { page, limit, total, totalPages, hasNext, hasPrev } }`
- [ ] `packages/shared/src/schemas/error.ts` exports `errorEnvelopeSchema` with fields: `error.code` (from error codes enum), `error.message`, `error.details` (optional array of field-level errors), `error.requestId`
- [ ] `packages/shared/src/schemas/audit.ts` exports `auditEventSchema` with fields: `eventId`, `entityType`, `entityId`, `action` (created/updated/deleted/status_changed/assigned/completed), `actorType` (user/worker/system), `actorId`, `timestamp`, `changes` (before/after diff), `metadata`
- [ ] `packages/shared/src/types/utility.ts` exports utility types: `Nullable<T>`, `WithTimestamps`, `WithSoftDelete`, `WithOptimisticLock`, `TenantScoped`
- [ ] All types are properly exported from `packages/shared/src/types/index.ts`
- [ ] Pagination factory function creates properly typed paginated wrappers:
  ```typescript
  const paginatedProjectsSchema = paginatedResponseSchema(projectSchema);
  type PaginatedProjects = z.infer<typeof paginatedProjectsSchema>;
  ```
- [ ] Error envelope schema supports both single-error and field-level validation error formats
- [ ] Audit event schema supports serialization to/from DynamoDB item format

## Technical Notes

- Pagination response factory pattern:
  ```typescript
  // packages/shared/src/schemas/pagination.ts
  // Generic pagination schema factory for wrapping entity arrays in paginated responses
  // Used by all list endpoints to provide consistent pagination metadata
  import { z, ZodType } from 'zod';

  export const paginationQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
  });

  export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

  export const paginationMetaSchema = z.object({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  });

  // Factory function — pass any Zod schema to create a paginated response schema
  export function paginatedResponseSchema<T extends ZodType>(itemSchema: T) {
    return z.object({
      data: z.array(itemSchema),
      pagination: paginationMetaSchema,
    });
  }
  ```
- Error envelope supports structured field-level errors for form validation:
  ```typescript
  // packages/shared/src/schemas/error.ts
  // Standardized error response envelope for all API error responses
  // Supports both general errors and field-level validation errors
  export const fieldErrorSchema = z.object({
    field: z.string(),
    message: z.string(),
    code: z.string().optional(),
  });

  export const errorEnvelopeSchema = z.object({
    error: z.object({
      code: errorCodeSchema,           // From error-codes.ts constants
      message: z.string(),
      details: z.array(fieldErrorSchema).optional(),
      requestId: z.string().uuid(),
    }),
  });
  ```
- Utility types provide TypeScript-level abstractions without runtime validation:
  ```typescript
  // packages/shared/src/types/utility.ts
  // Reusable TypeScript utility types for common entity patterns
  export type Nullable<T> = T | null;
  export type WithTimestamps = { createdAt: string; updatedAt: string };
  export type WithSoftDelete = { deletedAt: string | null };
  export type WithOptimisticLock = { version: number };
  export type TenantScoped = { tenantId: string };
  ```
- The audit event schema should be compatible with DynamoDB's attribute types and the GSI structure defined in Epic 3

## References

- **Functional Requirements:** Pagination, error handling, audit logging
- **Design Specification:** Paginated list responses, error envelope format, audit trail
- **Project Setup:** @laila/shared utility types and schemas

## Estimated Complexity

Medium — Multiple interconnected schemas with a generic factory pattern (pagination). Requires careful type design to ensure the utility types compose well with entity schemas.

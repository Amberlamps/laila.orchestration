/**
 * @module @laila/shared/schemas/pagination
 *
 * Pagination schemas for query parameters and paginated response envelopes.
 *
 * This module provides:
 * - `paginationQuerySchema` — query parameter validation (re-exported from api/list-queries)
 * - `paginationMetaSchema` — response metadata with navigation helpers
 * - `paginatedResponseSchema` — generic factory to wrap any entity schema
 *   in a paginated response shape
 *
 * The `paginatedResponseSchema` factory is the primary public API.
 * It accepts any Zod schema and returns a schema for:
 *   `{ data: T[], pagination: { page, limit, total, totalPages, hasNext, hasPrev } }`
 *
 * @example
 * ```typescript
 * import { paginatedResponseSchema } from '@laila/shared/schemas/pagination';
 * import { projectSchema } from '@laila/shared/schemas';
 *
 * const paginatedProjectsSchema = paginatedResponseSchema(projectSchema);
 * type PaginatedProjects = z.infer<typeof paginatedProjectsSchema>;
 * ```
 */

import { z, type ZodTypeAny } from 'zod';

import { paginationMetaSchema } from './api/list-queries';

// Re-export query-side and response-side pagination schemas from the canonical location
export {
  paginationQuerySchema,
  type PaginationQuery,
  sortOrderSchema,
  type SortOrder,
  paginationMetaSchema,
  type PaginationMeta,
} from './api/list-queries';

// ---------------------------------------------------------------------------
// Backwards-compatible alias
// ---------------------------------------------------------------------------

/**
 * Alias for `paginationMetaSchema` — re-exported for consumers that
 * imported the response-specific name before unification.
 */
export { paginationMetaSchema as paginationResponseMetaSchema } from './api/list-queries';

/** Alias for `PaginationMeta` */
export { type PaginationMeta as PaginationResponseMeta } from './api/list-queries';

// ---------------------------------------------------------------------------
// Generic paginated response factory
// ---------------------------------------------------------------------------

/**
 * Creates a paginated response schema that wraps any entity schema.
 *
 * The returned schema validates objects of the shape:
 * ```
 * {
 *   data: T[],
 *   pagination: { page, limit, total, totalPages, hasNext, hasPrev }
 * }
 * ```
 *
 * @param itemSchema - Zod schema for individual items in the `data` array
 * @returns A new Zod object schema for the paginated response
 *
 * @example
 * ```typescript
 * const paginatedProjectsSchema = paginatedResponseSchema(projectSchema);
 * type PaginatedProjects = z.infer<typeof paginatedProjectsSchema>;
 * // { data: Project[], pagination: PaginationResponseMeta }
 * ```
 */
export const paginatedResponseSchema = <T extends ZodTypeAny>(itemSchema: T) =>
  z.object({
    /** Array of entity items for the current page */
    data: z.array(itemSchema),

    /** Pagination metadata for page navigation */
    pagination: paginationMetaSchema,
  });

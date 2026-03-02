/**
 * @module @laila/shared/schemas/epic
 *
 * Zod schema for the Epic entity -- a large body of work within a project.
 *
 * An epic groups related user stories and provides a high-level view of
 * progress within a project. Epics are ordered by `sortOrder` for
 * display and scheduling purposes.
 *
 * This schema defines the API representation of an epic.
 * Database-level details (column types, indexes) belong in the Drizzle schema.
 */

import { z } from 'zod';

import { workStatusSchema } from '../constants';

export const epicSchema = z.object({
  /** Unique identifier (UUID v4) */
  id: z.string().uuid(),

  /** Tenant ID -- equals the owning user's ID for single-tenant isolation */
  tenantId: z.string().uuid(),

  /** ID of the parent project this epic belongs to */
  projectId: z.string().uuid(),

  /** Human-readable epic name */
  name: z.string().min(1).max(255),

  /** Detailed epic description (Markdown supported) */
  description: z.string().max(10000).nullable(),

  /** Execution status of this epic, derived from child user stories */
  workStatus: workStatusSchema,

  /** Display and scheduling order within the parent project (zero-based) */
  sortOrder: z.number().int().nonnegative(),

  /** Optimistic locking version -- incremented on each update */
  version: z.number().int().nonnegative(),

  /** Timestamp when the epic was created (ISO 8601) */
  createdAt: z.string().datetime(),

  /** Timestamp when the epic was last updated (ISO 8601) */
  updatedAt: z.string().datetime(),

  /** Null means not deleted; ISO timestamp means soft-deleted */
  deletedAt: z.string().datetime().nullable(),
});

/** TypeScript type for the Epic entity, inferred from the Zod schema */
export type Epic = z.infer<typeof epicSchema>;

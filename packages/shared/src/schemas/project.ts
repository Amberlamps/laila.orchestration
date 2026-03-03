/**
 * @module @laila/shared/schemas/project
 *
 * Zod schema for the Project entity -- the top-level organizational unit.
 *
 * A project contains epics and tracks two orthogonal status dimensions:
 * - **lifecycleStatus** -- the planning phase (draft -> planning -> ready -> active -> completed -> archived)
 * - **workStatus** -- the derived execution state computed from child epics
 *
 * This schema defines the API representation of a project.
 * Database-level details (column types, indexes) belong in the Drizzle schema.
 */

import { z } from 'zod';

import { projectLifecycleStatusSchema, workStatusSchema } from '../constants';

export const projectSchema = z.object({
  /** Unique identifier (UUID v4) */
  id: z.string().uuid(),

  /** Tenant ID -- equals the owning user's ID for single-tenant isolation */
  tenantId: z.string().uuid(),

  /** Human-readable project name */
  name: z.string().min(1).max(255),

  /** Detailed project description (Markdown supported) */
  description: z.string().max(10000).nullable(),

  /** Current planning phase of the project */
  lifecycleStatus: projectLifecycleStatusSchema,

  /** Derived execution status computed from child epics */
  workStatus: workStatusSchema,

  /** Worker inactivity timeout in minutes (5-1440, default 30) */
  workerInactivityTimeoutMinutes: z.number().int().min(5).max(1440),

  /** Optimistic locking version -- incremented on each update */
  version: z.number().int().nonnegative(),

  /** Timestamp when the project was created (ISO 8601) */
  createdAt: z.string().datetime(),

  /** Timestamp when the project was last updated (ISO 8601) */
  updatedAt: z.string().datetime(),

  /** Null means not deleted; ISO timestamp means soft-deleted */
  deletedAt: z.string().datetime().nullable(),
});

/** TypeScript type for the Project entity, inferred from the Zod schema */
export type Project = z.infer<typeof projectSchema>;

/**
 * @module @laila/shared/schemas/user-story
 *
 * Zod schema for the User Story entity -- a unit of work within an epic.
 *
 * User stories represent discrete deliverables that can be assigned to
 * worker agents. They track priority, cost estimates, assignment state,
 * and retry attempts for resilient execution.
 *
 * This schema defines the API representation of a user story.
 * Database-level details (column types, indexes) belong in the Drizzle schema.
 */

import { z } from 'zod';

import { prioritySchema, workStatusSchema } from '../constants';

export const userStorySchema = z.object({
  /** Unique identifier (UUID v4) */
  id: z.string().uuid(),

  /** Tenant ID -- equals the owning user's ID for single-tenant isolation */
  tenantId: z.string().uuid(),

  /** ID of the parent epic this user story belongs to */
  epicId: z.string().uuid(),

  /** Short summary of the user story */
  title: z.string().min(1).max(255),

  /** Detailed description of the user story (Markdown supported) */
  description: z.string().max(10000).nullable(),

  /** Scheduling priority -- higher priority stories are assigned first */
  priority: prioritySchema,

  /** Execution status of this user story */
  workStatus: workStatusSchema,

  /** Estimated cost in tokens or credits; null if not yet estimated */
  costEstimate: z.number().nonnegative().nullable(),

  /** Actual cost incurred during execution; null if not yet completed */
  actualCost: z.number().nonnegative().nullable(),

  /** ID of the worker agent currently assigned; null if unassigned */
  assignedWorkerId: z.string().uuid().nullable(),

  /** Timestamp when the story was assigned to a worker; null if unassigned */
  assignedAt: z.string().datetime().nullable(),

  /** Number of execution attempts made so far */
  attempts: z.number().int().nonnegative(),

  /** Maximum allowed execution attempts before marking as failed */
  maxAttempts: z.number().int().positive(),

  /** Optimistic locking version -- incremented on each update */
  version: z.number().int().nonnegative(),

  /** Timestamp when the user story was created (ISO 8601) */
  createdAt: z.string().datetime(),

  /** Timestamp when the user story was last updated (ISO 8601) */
  updatedAt: z.string().datetime(),

  /** Null means not deleted; ISO timestamp means soft-deleted */
  deletedAt: z.string().datetime().nullable(),
});

/** TypeScript type for the UserStory entity, inferred from the Zod schema */
export type UserStory = z.infer<typeof userStorySchema>;

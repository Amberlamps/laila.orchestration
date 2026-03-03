/**
 * @module @laila/shared/schemas/task
 *
 * Zod schema for the Task entity -- the smallest unit of work.
 *
 * Tasks belong to a user story and represent concrete, actionable work items
 * that a worker agent can execute. They include acceptance criteria for
 * verification, optional persona assignments for skill matching, and
 * references to external resources (documentation, specs, examples).
 *
 * This schema defines the API representation of a task.
 * Database-level details (column types, indexes) belong in the Drizzle schema.
 */

import { z } from 'zod';

import { workStatusSchema } from '../constants';

/**
 * Schema for a task reference -- a link to an external resource
 * such as documentation, a specification, or an example.
 */
export const taskReferenceSchema = z.object({
  /** Category of the reference (e.g., "doc", "spec", "example") */
  type: z.string().min(1).max(50),

  /** URL pointing to the external resource */
  url: z.string().url().max(2000),

  /** Human-readable title for display purposes */
  title: z.string().min(1).max(255),
});

/** TypeScript type for a task reference, inferred from the Zod schema */
export type TaskReference = z.infer<typeof taskReferenceSchema>;

export const taskSchema = z.object({
  /** Unique identifier (UUID v4) */
  id: z.string().uuid(),

  /** Tenant ID -- equals the owning user's ID for single-tenant isolation */
  tenantId: z.string().uuid(),

  /** ID of the parent user story this task belongs to */
  userStoryId: z.string().uuid(),

  /** Short summary of the task */
  title: z.string().min(1).max(255),

  /** Detailed description of the task (Markdown supported) */
  description: z.string().max(10000).nullable(),

  /** List of verifiable criteria that must be met for task completion */
  acceptanceCriteria: z.array(z.string().min(1).max(2000)),

  /** Implementation notes for the worker agent (Markdown supported) */
  technicalNotes: z.string().max(10000).nullable(),

  /** ID of the persona (role) best suited to execute this task; null if unassigned */
  personaId: z.string().uuid().nullable(),

  /** Execution status of this task */
  workStatus: workStatusSchema,

  /** Timestamp when the task was started by a worker (ISO 8601); null if not yet started */
  startedAt: z.string().datetime().nullable(),

  /** Timestamp when the task was completed (ISO 8601); null if not yet completed */
  completedAt: z.string().datetime().nullable(),

  /** Links to external resources relevant to this task (docs, specs, examples) */
  references: z.array(taskReferenceSchema),

  /** Optimistic locking version -- incremented on each update */
  version: z.number().int().nonnegative(),

  /** Timestamp when the task was created (ISO 8601) */
  createdAt: z.string().datetime(),

  /** Timestamp when the task was last updated (ISO 8601) */
  updatedAt: z.string().datetime(),

  /** Null means not deleted; ISO timestamp means soft-deleted */
  deletedAt: z.string().datetime().nullable(),
});

/** TypeScript type for the Task entity, inferred from the Zod schema */
export type Task = z.infer<typeof taskSchema>;

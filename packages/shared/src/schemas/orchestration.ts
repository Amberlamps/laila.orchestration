/**
 * @module @laila/shared/schemas/orchestration
 *
 * Zod schemas for the orchestration assignment endpoint
 * (POST /api/v1/orchestration/assign).
 *
 * This module defines:
 * - **Request schema** -- validates the incoming assignment request body
 * - **Response schemas** -- typed discriminated union for the three assignment outcomes
 *
 * The response uses a discriminated union on the `type` field so consumers can
 * narrow the response type using a switch statement:
 *
 * ```typescript
 * switch (response.type) {
 *   case 'assigned':  // story assigned, includes tasks and recommended order
 *   case 'blocked':   // all eligible stories are blocked by dependencies
 *   case 'all_complete': // every story in the project is complete
 * }
 * ```
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

/**
 * Request body schema for the assignment endpoint.
 *
 * Workers send a project ID to request work. The endpoint finds the highest
 * priority eligible story in that project and assigns it to the worker.
 */
export const assignRequestSchema = z.object({
  /** UUID of the project to request work from */
  project_id: z.string().uuid(),
});

/** TypeScript type for the assignment request body */
export type AssignRequest = z.infer<typeof assignRequestSchema>;

// ---------------------------------------------------------------------------
// Response sub-schemas -- building blocks for the discriminated union
// ---------------------------------------------------------------------------

/**
 * Dependency information for a task within an assigned story.
 * Provides enough context for the worker to understand blocking relationships.
 */
const taskDependencyInfoSchema = z.object({
  /** Task UUID of the dependency */
  id: z.string().uuid(),
  /** Human-readable task name */
  name: z.string(),
  /** Current execution status of the dependency */
  status: z.string(),
});

/**
 * Persona information attached to a task.
 * Tells the worker which role/skill set to adopt for this task.
 */
const taskPersonaInfoSchema = z.object({
  /** Persona UUID */
  id: z.string().uuid(),
  /** Human-readable persona name */
  name: z.string(),
  /** System prompt to inject into the AI context */
  system_prompt: z.string(),
});

/**
 * Full task detail within an assigned story response.
 * Contains everything a worker needs to execute the task.
 */
const assignedTaskDetailSchema = z.object({
  /** Task UUID */
  id: z.string().uuid(),
  /** Human-readable task name */
  name: z.string(),
  /** Detailed description of the task */
  description: z.string().nullable(),
  /** Persona (role) assigned to this task; null if unassigned */
  persona: taskPersonaInfoSchema.nullable(),
  /** Verifiable acceptance criteria */
  acceptance_criteria: z.array(z.string()),
  /** Implementation notes for the worker */
  technical_notes: z.string().nullable(),
  /** External resource references */
  references: z.array(z.string()),
  /** Tasks this task depends on (must complete first) */
  dependencies: z.array(taskDependencyInfoSchema),
  /** Current execution status */
  status: z.string(),
});

/**
 * Epic information within an assigned story response.
 */
const assignedEpicInfoSchema = z.object({
  /** Epic UUID */
  id: z.string().uuid(),
  /** Human-readable epic name */
  name: z.string(),
});

/**
 * Full story detail returned in the "assigned" response variant.
 * Contains the story, its parent epic, all tasks, and recommended execution order.
 */
const assignedStoryDetailSchema = z.object({
  /** Story UUID */
  id: z.string().uuid(),
  /** Human-readable story name */
  name: z.string(),
  /** Story description */
  description: z.string().nullable(),
  /** Scheduling priority */
  priority: z.string(),
  /** Parent epic summary */
  epic: assignedEpicInfoSchema,
  /** All tasks in the story with full detail */
  tasks: z.array(assignedTaskDetailSchema),
  /** Task IDs in recommended execution order (respects dependency topology) */
  recommended_task_order: z.array(z.string().uuid()),
});

// ---------------------------------------------------------------------------
// Response variants
// ---------------------------------------------------------------------------

/**
 * Response variant: a story has been assigned to the worker.
 *
 * Includes the full story detail with tasks, dependencies, persona
 * assignments, and the recommended task execution order.
 */
const assignedResponseSchema = z.object({
  /** Discriminator indicating a story was successfully assigned */
  type: z.literal('assigned'),
  /** Full story detail with tasks and recommended order */
  story: assignedStoryDetailSchema,
});

/**
 * Information about a story that is blocking progress.
 * Helps workers understand what they are waiting on.
 */
const blockingStoryInfoSchema = z.object({
  /** Story UUID */
  id: z.string().uuid(),
  /** Human-readable story name */
  name: z.string(),
  /** Name of the worker currently assigned; null if unassigned */
  assigned_worker: z.string().nullable(),
  /** Human-readable reason why this story is blocking */
  blocking_reason: z.string(),
});

/**
 * Response variant: all eligible stories are blocked.
 *
 * The worker should wait for the suggested retry interval and then
 * request work again.
 */
const blockedResponseSchema = z.object({
  /** Discriminator indicating all eligible stories are blocked */
  type: z.literal('blocked'),
  /** Details about the stories causing the block */
  blocking_stories: z.array(blockingStoryInfoSchema),
  /** Suggested wait time before the worker retries (seconds) */
  retry_after_seconds: z.number().int().nonnegative(),
});

/**
 * Response variant: all stories in the project are complete.
 *
 * The worker can safely shut down or move to a different project.
 */
const allCompleteResponseSchema = z.object({
  /** Discriminator indicating the project is fully complete */
  type: z.literal('all_complete'),
  /** Project summary information */
  project: z.object({
    /** Project UUID */
    id: z.string().uuid(),
    /** Project name */
    name: z.string(),
  }),
  /** Number of stories that have been completed */
  completed_stories: z.number().int().nonnegative(),
  /** Total number of stories in the project */
  total_stories: z.number().int().nonnegative(),
});

// ---------------------------------------------------------------------------
// Discriminated union combining all response variants
// ---------------------------------------------------------------------------

/**
 * Discriminated union response schema for the assignment endpoint.
 *
 * Workers should switch on the `type` field to determine the outcome:
 *
 * ```typescript
 * const response = assignResponseSchema.parse(data);
 * switch (response.type) {
 *   case 'assigned':
 *     // response.story is available with full task detail
 *     break;
 *   case 'blocked':
 *     // response.blocking_stories and response.retry_after_seconds are available
 *     break;
 *   case 'all_complete':
 *     // response.project, response.completed_stories, response.total_stories are available
 *     break;
 * }
 * ```
 */
export const assignResponseSchema = z.discriminatedUnion('type', [
  assignedResponseSchema,
  blockedResponseSchema,
  allCompleteResponseSchema,
]);

/** TypeScript type for the assignment response */
export type AssignResponse = z.infer<typeof assignResponseSchema>;

// ---------------------------------------------------------------------------
// Export individual variant schemas and types for use in response builders
// ---------------------------------------------------------------------------

export {
  assignedResponseSchema,
  blockedResponseSchema,
  allCompleteResponseSchema,
  assignedStoryDetailSchema,
  assignedTaskDetailSchema,
  blockingStoryInfoSchema,
  taskDependencyInfoSchema,
  taskPersonaInfoSchema,
  assignedEpicInfoSchema,
};

export type AssignedResponse = z.infer<typeof assignedResponseSchema>;
export type BlockedResponse = z.infer<typeof blockedResponseSchema>;
export type AllCompleteResponse = z.infer<typeof allCompleteResponseSchema>;
export type AssignedStoryDetail = z.infer<typeof assignedStoryDetailSchema>;
export type AssignedTaskDetail = z.infer<typeof assignedTaskDetailSchema>;
export type BlockingStoryInfo = z.infer<typeof blockingStoryInfoSchema>;
export type TaskDependencyInfo = z.infer<typeof taskDependencyInfoSchema>;
export type TaskPersonaInfo = z.infer<typeof taskPersonaInfoSchema>;
export type AssignedEpicInfo = z.infer<typeof assignedEpicInfoSchema>;

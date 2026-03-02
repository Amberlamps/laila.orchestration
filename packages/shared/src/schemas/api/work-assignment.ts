/**
 * @module @laila/shared/schemas/api/work-assignment
 *
 * Zod schema for the work assignment endpoint response
 * (POST /api/v1/work/next).
 *
 * Uses a discriminated union so consumers can narrow the response type
 * by checking the `type` field. The three variants are:
 *
 * 1. **assigned** -- A work item is available and has been assigned to
 *    the requesting worker. Contains the user story and its tasks.
 *
 * 2. **blocked** -- All remaining work items are blocked by unresolved
 *    dependencies. The worker should back off and retry later.
 *
 * 3. **all_complete** -- Every work item in the project has reached a
 *    terminal state. No more work is available.
 */

import { z } from 'zod';

import { taskSchema } from '../task';
import { userStorySchema } from '../user-story';

// ---------------------------------------------------------------------------
// Variant: assigned -- work is available
// ---------------------------------------------------------------------------

/**
 * Response variant returned when a work item is available and has been
 * assigned to the requesting worker. Contains the full user story and
 * all tasks the worker needs to execute.
 */
const workAssignedSchema = z.object({
  /** Discriminator indicating work has been assigned */
  type: z.literal('assigned'),

  /** The user story assigned to the worker for execution */
  userStory: userStorySchema,

  /** Ordered list of tasks the worker must complete for this story */
  tasks: z.array(taskSchema),

  /** ISO 8601 timestamp of when the assignment was made */
  assignedAt: z.string().datetime(),
});

// ---------------------------------------------------------------------------
// Variant: blocked -- all remaining work is blocked
// ---------------------------------------------------------------------------

/**
 * Response variant returned when all remaining work items are blocked
 * by unresolved dependencies. The worker should implement an
 * exponential backoff strategy before retrying.
 */
const workBlockedSchema = z.object({
  /** Discriminator indicating all remaining work is blocked */
  type: z.literal('blocked'),

  /** Human-readable explanation of why work is blocked */
  reason: z.string(),

  /** Number of work items currently in blocked state */
  blockedCount: z.number().int().nonnegative(),
});

// ---------------------------------------------------------------------------
// Variant: all_complete -- project is finished
// ---------------------------------------------------------------------------

/**
 * Response variant returned when every work item in the project has
 * reached a terminal state (done, failed, or skipped). The worker
 * can safely shut down.
 */
const workAllCompleteSchema = z.object({
  /** Discriminator indicating all project work is complete */
  type: z.literal('all_complete'),

  /** ISO 8601 timestamp of when the last work item completed */
  completedAt: z.string().datetime(),
});

// ---------------------------------------------------------------------------
// Discriminated union combining all variants
// ---------------------------------------------------------------------------

/**
 * Discriminated union response for the work assignment endpoint.
 *
 * Consumers should narrow the type using `switch (response.type)`:
 *
 * ```typescript
 * const response = workAssignmentResponseSchema.parse(data);
 * switch (response.type) {
 *   case 'assigned':
 *     // response.userStory and response.tasks are available
 *     break;
 *   case 'blocked':
 *     // response.reason and response.blockedCount are available
 *     break;
 *   case 'all_complete':
 *     // response.completedAt is available
 *     break;
 * }
 * ```
 */
export const workAssignmentResponseSchema = z.discriminatedUnion('type', [
  workAssignedSchema,
  workBlockedSchema,
  workAllCompleteSchema,
]);

/** Inferred TypeScript type for the work assignment response */
export type WorkAssignmentResponse = z.infer<typeof workAssignmentResponseSchema>;

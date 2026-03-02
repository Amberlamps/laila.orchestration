/**
 * @module @laila/shared/schemas/api/work-completion
 *
 * Zod schema for the work completion endpoint request body
 * (POST /api/v1/work/complete).
 *
 * Workers submit this payload after finishing (or failing) an assigned
 * user story. The `status` field indicates the outcome:
 *
 * - `done`   -- The user story was completed successfully
 * - `failed` -- The user story could not be completed; a `reason`
 *               must be provided to explain why
 *
 * The `cost` field tracks resource consumption (e.g., API tokens,
 * compute time) for billing and analytics purposes.
 */

import { z } from 'zod';

/**
 * Valid terminal statuses a worker can report for a completed assignment.
 *
 * - `done`   -- All tasks in the user story were executed successfully
 * - `failed` -- One or more tasks could not be completed
 */
export const workCompletionStatusSchema = z.enum(['done', 'failed']);

/** Inferred TypeScript type for work completion status */
export type WorkCompletionStatus = z.infer<typeof workCompletionStatusSchema>;

/**
 * Request body for reporting work completion (POST /api/v1/work/complete).
 *
 * The `reason` field is required when `status` is 'failed' to provide
 * context for debugging and retry decisions. It is optional (but allowed)
 * when `status` is 'done' for adding completion notes.
 */
export const workCompletionRequestSchema = z
  .object({
    /** UUID of the user story that was assigned to the worker */
    userStoryId: z.string().uuid(),

    /** Terminal status indicating the outcome of the work assignment */
    status: workCompletionStatusSchema,

    /**
     * Resource cost incurred during execution (e.g., API tokens consumed).
     * Must be a non-negative number.
     */
    cost: z.number().nonnegative(),

    /**
     * Explanation of the outcome. Required for failures to provide context
     * for debugging and retry decisions. Optional for successful completions.
     */
    reason: z.string().min(1).max(2000).optional(),
  })
  .refine((data) => data.status !== 'failed' || data.reason !== undefined, {
    message: 'Reason is required when status is "failed"',
    path: ['reason'],
  });

/** Inferred TypeScript type for the work completion request body */
export type WorkCompletionRequest = z.infer<typeof workCompletionRequestSchema>;

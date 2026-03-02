/**
 * @module @laila/shared/constants/status
 *
 * Status enumerations for the orchestration service's two-dimensional status model:
 *
 * 1. **Project Lifecycle Status** -- Tracks the overall planning phase of a project
 *    through its lifecycle from initial creation to archival.
 *
 * 2. **Work Status** -- Tracks the execution state of individual work items
 *    (epics, user stories, and tasks) as they progress through assignment,
 *    execution, and completion.
 *
 * All enums are defined as Zod schemas for runtime validation support.
 * TypeScript types are inferred directly from the schemas.
 */

import { z } from 'zod';

/**
 * Project lifecycle statuses track the overall planning and execution phase
 * of a project. The expected forward progression is:
 *
 *   draft -> planning -> ready -> active -> completed -> archived
 *
 * Backward transitions (e.g., active -> planning) are permitted for
 * re-planning scenarios.
 */
export const projectLifecycleStatusSchema = z.enum([
  /** Initial state -- project is being defined, requirements gathered */
  'draft',
  /** Work breakdown structure is being created (epics, stories, tasks) */
  'planning',
  /** Planning is complete, project is ready for worker execution */
  'ready',
  /** Workers are actively executing tasks within the project */
  'active',
  /** All work items have reached a terminal state (done/skipped/failed) */
  'completed',
  /** Project is archived and hidden from active views (soft-delete) */
  'archived',
]);

/** TypeScript union type for project lifecycle status values */
export type ProjectLifecycleStatus = z.infer<typeof projectLifecycleStatusSchema>;

/** Tuple of all valid project lifecycle status values, useful for iteration */
export const PROJECT_LIFECYCLE_STATUSES = projectLifecycleStatusSchema.options;

/**
 * Work item statuses track the execution state of individual epics,
 * user stories, and tasks. The typical forward progression is:
 *
 *   pending -> ready -> in_progress -> review -> done
 *
 * Items may also transition to terminal states:
 *   - `failed` after exhausting retry attempts
 *   - `skipped` when intentionally bypassed
 *   - `blocked` when waiting on unresolved dependencies
 */
export const workStatusSchema = z.enum([
  /** Created but not yet actionable; dependencies may be unresolved */
  'pending',
  /** Waiting on one or more dependency resolutions before becoming actionable */
  'blocked',
  /** All dependencies are met; available for assignment to a worker */
  'ready',
  /** Assigned to a worker agent and currently being executed */
  'in_progress',
  /** Work has been submitted and is pending review or verification */
  'review',
  /** Successfully completed and verified */
  'done',
  /** Failed after maximum retry attempts have been exhausted */
  'failed',
  /** Intentionally skipped (e.g., no longer relevant or superseded) */
  'skipped',
]);

/** TypeScript union type for work item status values */
export type WorkStatus = z.infer<typeof workStatusSchema>;

/** Tuple of all valid work status values, useful for iteration */
export const WORK_STATUSES = workStatusSchema.options;

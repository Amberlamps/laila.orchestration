/**
 * Shared type definitions for the status-propagation Lambda function.
 *
 * Defines the shapes used across handler, evaluator, propagator, and audit
 * modules. All types use strict typing (no `any`).
 */

import type { WorkStatus } from '@laila/shared';

// ---------------------------------------------------------------------------
// SQS message types
// ---------------------------------------------------------------------------

/**
 * SQS message body for a status change event.
 * Published by the task completion endpoint when a task status changes.
 */
export interface StatusChangeEvent {
  /** Idempotency key -- prevents duplicate processing */
  eventId: string;
  /** Type of event that triggered the status change */
  eventType: 'task.completed' | 'task.failed' | 'story.completed';
  /** The project this event belongs to */
  projectId: string;
  /** The task/story that changed status */
  entityId: string;
  /** Whether the changed entity is a task or story */
  entityType: 'task' | 'story';
  /** The new status of the entity */
  newStatus: WorkStatus;
  /** The status before the change */
  previousStatus: WorkStatus;
  /** ISO 8601 timestamp of the event */
  timestamp: string;
  /** Tenant ID for multi-tenant isolation */
  tenantId: string;
}

// ---------------------------------------------------------------------------
// Evaluation types
// ---------------------------------------------------------------------------

/** Result of evaluating a single dependent task for potential unblocking. */
export interface DependentEvaluation {
  /** The task that was evaluated */
  taskId: string;
  /** The title of the task (for audit logging) */
  taskName: string;
  /** The story this task belongs to */
  storyId: string;
  /** The status before the transition */
  previousStatus: WorkStatus;
  /** The new status after the transition */
  newStatus: WorkStatus;
  /** Human-readable reason for the transition */
  reason: string;
}

// ---------------------------------------------------------------------------
// Propagation types
// ---------------------------------------------------------------------------

/** Result of propagating a status change to a parent entity. */
export interface PropagationResult {
  /** The entity whose status was updated */
  entityId: string;
  /** Whether the entity is a story or epic */
  entityType: 'story' | 'epic';
  /** The entity's name/title (for audit logging) */
  entityName: string;
  /** The status before the update */
  previousStatus: WorkStatus;
  /** The new derived status */
  newStatus: WorkStatus;
  /** The tenant this entity belongs to */
  tenantId: string;
  /** The project this entity belongs to */
  projectId: string;
}

// ---------------------------------------------------------------------------
// Database row types
// ---------------------------------------------------------------------------

/** Minimal task record for dependency evaluation queries. */
export interface TaskRow {
  id: string;
  tenantId: string;
  userStoryId: string;
  title: string;
  workStatus: string;
}

/** Minimal story record for status propagation queries. */
export interface StoryRow {
  id: string;
  tenantId: string;
  epicId: string;
  title: string;
  workStatus: string;
  assignedWorkerId: string | null;
}

/** Minimal epic record for status propagation queries. */
export interface EpicRow {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  workStatus: string;
}

/** A dependency edge linking a dependent task to its prerequisite. */
export interface DependencyEdgeRow {
  dependentTaskId: string;
  prerequisiteTaskId: string;
}

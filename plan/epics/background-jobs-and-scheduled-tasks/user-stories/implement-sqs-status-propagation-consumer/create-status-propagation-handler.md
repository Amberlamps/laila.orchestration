# Create Status Propagation Handler

## Task Details

- **Title:** Create Status Propagation Handler
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement SQS Status Propagation Consumer](./tasks.md)
- **Parent Epic:** [Background Jobs & Scheduled Tasks](../../user-stories.md)
- **Dependencies:** None

## Description

Create the Lambda handler at `functions/status-propagation/src/handler.ts` that consumes SQS messages for cascading status re-evaluation. When a task completes, dependent tasks may need to be unblocked. This function evaluates each dependent task's DAG state and transitions eligible tasks from "blocked" to "not_started". It also propagates status changes upward to story and epic levels.

### Handler Implementation

```typescript
// functions/status-propagation/src/handler.ts
// Lambda handler for the SQS status propagation consumer.
// Triggered by SQS queue events containing task completion messages.
// Evaluates dependent tasks and propagates status changes through the DAG.

import type { SQSEvent, SQSBatchResponse, SQSBatchItemFailure, Context } from 'aws-lambda';
import { evaluateDependents } from './evaluator';
import { propagateToStory, propagateToEpic } from './propagator';
import { logger } from './logger';
import { writeAuditEvent } from './audit';

/**
 * SQS message body for a status change event.
 * Published by the task completion endpoint when a task status changes.
 */
interface StatusChangeEvent {
  eventId: string; // Idempotency key — prevents duplicate processing
  eventType: 'task.completed' | 'task.failed' | 'story.completed';
  projectId: string;
  entityId: string; // The task/story that changed status
  entityType: 'task' | 'story';
  newStatus: string;
  previousStatus: string;
  timestamp: string; // ISO 8601
}

/**
 * Main handler for the SQS status propagation consumer.
 *
 * Uses partial batch response (SQSBatchResponse) so that only failed
 * messages are retried, not the entire batch. This prevents successful
 * messages from being re-processed when one message in the batch fails.
 *
 * Flow for each message:
 * 1. Parse the StatusChangeEvent from the SQS message body
 * 2. Check idempotency: has this eventId been processed before?
 * 3. If task.completed:
 *    a. Find all tasks that depend on the completed task
 *    b. For each dependent task: check if ALL its dependencies are now complete
 *    c. If all deps complete: transition dependent task from "blocked" -> "not_started"
 *    d. Write audit event for each transition
 * 4. Propagate upward:
 *    a. Re-evaluate the parent story's status based on child task statuses
 *    b. Re-evaluate the parent epic's status based on child story statuses
 * 5. Record the eventId as processed (for idempotency)
 */
export const handler = async (event: SQSEvent, context: Context): Promise<SQSBatchResponse> => {
  const batchItemFailures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    try {
      const statusChange: StatusChangeEvent = JSON.parse(record.body);

      logger.info({
        eventId: statusChange.eventId,
        eventType: statusChange.eventType,
        entityId: statusChange.entityId,
        msg: 'Processing status change event',
      });

      // Check idempotency — skip if already processed
      const alreadyProcessed = await checkIdempotency(statusChange.eventId);
      if (alreadyProcessed) {
        logger.info({ eventId: statusChange.eventId, msg: 'Event already processed, skipping' });
        continue;
      }

      // Evaluate dependent tasks and propagate status changes
      await processStatusChange(statusChange);

      // Record as processed for idempotency
      await recordProcessed(statusChange.eventId);
    } catch (error) {
      logger.error({
        messageId: record.messageId,
        error,
        msg: 'Failed to process status change event',
      });

      // Report this message as failed for individual retry
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
```

### Dependency Evaluation

```typescript
// functions/status-propagation/src/evaluator.ts
// Evaluates dependent tasks to determine if they should be unblocked.
// Core logic: a blocked task becomes not_started when ALL its dependencies are complete.

import { db } from './db';

interface DependentEvaluation {
  taskId: string;
  taskName: string;
  previousStatus: string;
  newStatus: string;
  reason: string;
}

/**
 * Find all tasks that depend on the completed task and evaluate
 * whether they should be unblocked.
 *
 * A dependent task transitions from "blocked" to "not_started" when:
 * 1. The dependent task's current status is "blocked"
 * 2. ALL of the dependent task's dependencies (not just this one) have status "complete"
 *
 * This function queries the dependency graph to find reverse dependencies
 * and checks each one individually.
 */
export async function evaluateDependents(
  completedTaskId: string,
  projectId: string,
): Promise<DependentEvaluation[]> {
  // 1. Query task_dependencies WHERE dependency_id = completedTaskId
  //    -> Returns: [{ task_id: "dependent-1" }, { task_id: "dependent-2" }]
  //
  // 2. For each dependent task:
  //    a. Query ALL dependencies of the dependent task
  //    b. Check if ALL dependencies have status "complete"
  //    c. If yes AND current status is "blocked": transition to "not_started"
  //
  // 3. Apply transitions in a transaction
  //
  // 4. Return list of transitions made
}
```

### Status Propagation

```typescript
// functions/status-propagation/src/propagator.ts
// Propagates status changes from tasks up to stories and epics.
// Story status is derived from aggregated task statuses.
// Epic status is derived from aggregated story statuses.

/**
 * Re-evaluate a story's status based on its child task statuses.
 *
 * Aggregation rules:
 * - All tasks "complete" -> story is "complete"
 * - Any task "in_progress" -> story remains "in_progress"
 * - All tasks "not_started" or "blocked" -> story is "not_started" or "blocked"
 *
 * Note: story status is only auto-updated if no worker is currently assigned.
 * A story with an assigned worker retains "in_progress" regardless of task states.
 */
export async function propagateToStory(storyId: string, projectId: string): Promise<void> {
  // Query all tasks for the story
  // Compute aggregated status
  // Update story if status should change
  // Write audit event if changed
}

/**
 * Re-evaluate an epic's status based on its child story statuses.
 *
 * Aggregation rules:
 * - All stories "complete" -> epic is "complete"
 * - Any story "in_progress" or "not_started" -> epic remains "in_progress"
 * - All stories "blocked" -> epic is "blocked"
 */
export async function propagateToEpic(epicId: string, projectId: string): Promise<void> {
  // Query all stories for the epic
  // Compute aggregated status
  // Update epic if status should change
  // Write audit event if changed
}
```

### Idempotency

```typescript
// functions/status-propagation/src/idempotency.ts
// Idempotency tracking for SQS message processing.
// Uses a DynamoDB table to record processed event IDs.
// Events are recorded with a TTL so old records are automatically cleaned up.

import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

/**
 * Check if an event has already been processed.
 * Returns true if the eventId exists in the idempotency table.
 */
export async function checkIdempotency(eventId: string): Promise<boolean> {
  // GetItem from idempotency table with pk = eventId
}

/**
 * Record an event as processed.
 * Inserts the eventId with a TTL of 24 hours.
 */
export async function recordProcessed(eventId: string): Promise<void> {
  // PutItem with TTL = now + 24 hours
}
```

## Acceptance Criteria

- [ ] Lambda handler is defined at `functions/status-propagation/src/handler.ts`
- [ ] Handler accepts `SQSEvent` and returns `SQSBatchResponse` for partial batch failure
- [ ] Each SQS message is parsed as a `StatusChangeEvent` with typed fields
- [ ] Dependent tasks are evaluated: blocked tasks with all-complete dependencies transition to "not_started"
- [ ] Status changes propagate upward: task -> story -> epic
- [ ] Story status aggregation correctly reflects child task statuses
- [ ] Epic status aggregation correctly reflects child story statuses
- [ ] Idempotency is enforced: processing the same eventId twice has no effect
- [ ] Failed messages are reported individually via `batchItemFailures` (partial batch response)
- [ ] Audit events are written for each status transition
- [ ] The handler logs each event being processed with structured context
- [ ] Database operations use transactions for atomicity
- [ ] pino structured logging is used for all log output
- [ ] No `any` types are used in the implementation

## Technical Notes

- **Partial Batch Response:** The SQS Lambda integration supports reporting individual message failures via `SQSBatchResponse.batchItemFailures`. This is critical for avoiding re-processing of already-successful messages when one message in a batch fails. The Lambda must be configured with `FunctionResponseTypes: ["ReportBatchItemFailures"]` in Terraform.
- **Idempotency:** SQS guarantees at-least-once delivery, meaning a message may be delivered multiple times. The idempotency check using DynamoDB ensures that re-delivery does not cause duplicate status transitions.
- **Cascading:** A single task completion can trigger a chain of unblocks. For example, if task A completes and unblocks task B, and task B was the last dependency of task C, then C should also be unblocked. However, C's unblock will happen in a separate SQS message (published when B is evaluated), not in this invocation. This prevents unbounded recursion.
- **DLQ:** After 3 failed processing attempts, messages are moved to the Dead Letter Queue. The DLQ should be monitored via CloudWatch alarms.

## References

- **Functional Requirements:** FR-BG-006 (status propagation), FR-BG-007 (cascading unblock)
- **Design Specification:** Section 12.4 (SQS Status Propagation), Section 5.3 (DAG Status Model)
- **Domain Logic:** Status aggregation rules from `@laila/domain`
- **Infrastructure:** SQS queue + DLQ, Lambda event source mapping (defined in Epic 14, Terraform)

## Estimated Complexity

Very High — Combines SQS batch processing, partial failure reporting, DAG dependency evaluation, multi-level status propagation, idempotency tracking, transactional database operations, and audit logging. The cascading nature of status changes requires careful reasoning about ordering and consistency.

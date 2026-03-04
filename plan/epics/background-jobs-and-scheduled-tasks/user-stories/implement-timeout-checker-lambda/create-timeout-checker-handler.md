# Create Timeout Checker Handler

## Task Details

- **Title:** Create Timeout Checker Handler
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Timeout Checker Lambda](./tasks.md)
- **Parent Epic:** [Background Jobs & Scheduled Tasks](../../user-stories.md)
- **Dependencies:** None

## Description

Create the Lambda handler at `functions/timeout-checker/src/handler.ts` that serves as the entry point for the timeout checker function. This function is invoked periodically by EventBridge Scheduler (every 1 minute) to scan for and reclaim timed-out story assignments.

### Handler Implementation

```typescript
// functions/timeout-checker/src/handler.ts
// Lambda handler for the timeout checker background job.
// Invoked by EventBridge Scheduler every 1 minute.
// Scans all in-progress stories, identifies timeouts based on
// per-project timeout_duration, and reclaims timed-out assignments.

import type { ScheduledEvent, Context } from 'aws-lambda';
import { db } from './db';
import { logger } from './logger';
import { writeAuditEvent } from './audit';

/**
 * Main handler for the timeout checker Lambda function.
 *
 * Flow:
 * 1. Query all user stories with status "in_progress" and a non-null assigned_worker
 * 2. For each story, load the parent project to get timeout_duration
 * 3. Calculate elapsed time: now - story.last_activity_at
 * 4. If elapsed > project.timeout_duration:
 *    a. Clear the assigned_worker field
 *    b. Reset story status to "not_started" or "blocked" (determined by DAG state)
 *    c. Log the previous attempt: { worker_id, started_at, ended_at: now, reason: "timeout" }
 *    d. Write audit event to DynamoDB
 * 5. Return summary: { checked: number, reclaimed: number }
 */
export const handler = async (
  event: ScheduledEvent,
  context: Context,
): Promise<{ checked: number; reclaimed: number }> => {
  // Implementation here
};
```

### Database Queries

```typescript
// functions/timeout-checker/src/db.ts
// Database connection and query functions for the timeout checker.
// Uses Drizzle ORM with the Neon serverless driver for PostgreSQL.

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { and, eq, isNotNull, lt } from 'drizzle-orm';
import { userStories, projects, previousAttempts } from '@laila/database/schema';

/**
 * Query all in-progress stories with assigned workers.
 * Joins with projects table to get the per-project timeout_duration.
 * Returns: story ID, story name, assigned_worker, last_activity_at,
 *          project.timeout_duration, project.id
 */
export async function getInProgressStories() {
  // SELECT stories with status = 'in_progress' AND assigned_worker IS NOT NULL
  // JOIN projects ON stories.project_id = projects.id
  // Returns array of { story, project } tuples
}

/**
 * Determine the correct status for a story when reclaimed.
 * If all DAG dependencies are complete: return "not_started" (eligible for reassignment).
 * If some dependencies are still incomplete: return "blocked".
 */
export async function determineReclaimedStatus(
  storyId: string,
): Promise<'not_started' | 'blocked'> {
  // Check DAG dependencies for the story
  // If all deps complete -> "not_started"
  // If any dep incomplete -> "blocked"
}

/**
 * Atomically reclaim a timed-out story.
 * Uses a transaction to ensure consistency:
 * 1. Clear assigned_worker and assigned_at
 * 2. Set status to the DAG-determined value
 * 3. Insert a previous_attempt record
 */
export async function reclaimTimedOutStory(
  storyId: string,
  newStatus: 'not_started' | 'blocked',
  previousWorkerId: string,
  assignedAt: Date,
): Promise<void> {
  // Transaction: update story + insert previous_attempt
}
```

### Audit Event Writing

```typescript
// functions/timeout-checker/src/audit.ts
// Writes audit events to DynamoDB for timeout reclamation actions.
// Each reclamation generates an audit event with the story, worker,
// and timeout details for traceability.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

/**
 * Write a timeout reclamation audit event to DynamoDB.
 * Event includes: story_id, project_id, previous_worker_id,
 * timeout_duration, elapsed_time, new_status, timestamp.
 */
export async function writeAuditEvent(params: {
  storyId: string;
  projectId: string;
  previousWorkerId: string;
  timeoutDuration: number;
  elapsedTime: number;
  newStatus: string;
}): Promise<void> {
  // PutItem to DynamoDB audit table
}
```

### Logger Setup

```typescript
// functions/timeout-checker/src/logger.ts
// Structured logging with pino for the timeout checker Lambda.
// Outputs JSON to stdout, which CloudWatch Logs captures automatically.

import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  // Lambda request ID is added per-invocation
  // Additional context: function name, version
});
```

## Acceptance Criteria

- [ ] Lambda handler is defined at `functions/timeout-checker/src/handler.ts`
- [ ] Handler accepts `ScheduledEvent` from EventBridge and returns a summary object
- [ ] All in-progress stories with assigned workers are queried across all projects
- [ ] Per-project `timeout_duration` is respected (not a global timeout)
- [ ] Elapsed time is calculated as `Date.now() - story.last_activity_at`
- [ ] Timed-out stories have their `assigned_worker` and `assigned_at` fields cleared
- [ ] Story status is reset to `not_started` if all DAG dependencies are complete
- [ ] Story status is reset to `blocked` if any DAG dependency is incomplete
- [ ] A `previous_attempt` record is created with reason `"timeout"` for each reclaimed story
- [ ] An audit event is written to DynamoDB for each reclamation
- [ ] The handler logs a summary: number of stories checked, number reclaimed
- [ ] Database operations use transactions for atomicity
- [ ] The handler handles the case where zero stories are in-progress (no-op)
- [ ] pino structured logging is used for all log output
- [ ] No `any` types are used in the implementation

## Technical Notes

- The Neon serverless driver (`@neondatabase/serverless`) is used for PostgreSQL connections in Lambda, as it supports HTTP-based queries without persistent connections (important for Lambda cold starts).
- The `last_activity_at` timestamp on stories is updated whenever a worker reports progress. If a worker never reports progress, the `assigned_at` timestamp serves as the fallback.
- The timeout duration is stored per-project (e.g., `projects.timeout_duration_ms`) to allow different projects to have different timeout policies.
- Race condition: A worker may complete a story in the narrow window between the timeout checker querying and reclaiming. The reclamation query should include a WHERE clause that verifies the story is still in-progress and still assigned to the same worker (optimistic check).
- The function is designed to complete within 30 seconds even with hundreds of in-progress stories. Batch queries and bulk operations should be used where possible.

## References

- **Functional Requirements:** FR-BG-001 (timeout checking), FR-BG-002 (reclamation)
- **Design Specification:** Section 12.1 (Timeout Checker), Section 9.3 (Timeout & Reclamation Logic)
- **Domain Logic:** `determineReclaimedStatus()` uses the same DAG evaluation logic from `@laila/domain`
- **Infrastructure:** EventBridge Scheduler rule (defined in Epic 14, Terraform)

## Estimated Complexity

High — Requires careful handling of per-project timeout durations, DAG-aware status determination, transactional database operations, race condition prevention, and audit event writing. The function must be efficient enough to scan all projects within the Lambda timeout.

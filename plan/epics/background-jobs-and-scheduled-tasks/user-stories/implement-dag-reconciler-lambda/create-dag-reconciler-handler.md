# Create DAG Reconciler Handler

## Task Details

- **Title:** Create DAG Reconciler Handler
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement DAG Reconciler Lambda](./tasks.md)
- **Parent Epic:** [Background Jobs & Scheduled Tasks](../../user-stories.md)
- **Dependencies:** None

## Description

Create the Lambda handler at `functions/dag-reconciler/src/handler.ts` that performs a full-graph consistency check across all active projects. This function is invoked periodically by EventBridge Scheduler (every 5 minutes) to detect and fix status inconsistencies that may arise from race conditions, partial failures, or bugs in the orchestration logic.

### Handler Implementation

```typescript
// functions/dag-reconciler/src/handler.ts
// Lambda handler for the DAG reconciler background job.
// Invoked by EventBridge Scheduler every 5 minutes.
// Performs a full-graph consistency check across all active projects.
// Detects and corrects status inconsistencies in tasks, stories, and epics.

import type { ScheduledEvent, Context } from 'aws-lambda';
import { db } from './db';
import { logger } from './logger';
import { writeAuditEvent } from './audit';

interface ReconciliationResult {
  projectsChecked: number;
  inconsistenciesFound: number;
  correctionsMade: number;
  corrections: CorrectionDetail[];
}

interface CorrectionDetail {
  projectId: string;
  entityType: 'task' | 'story' | 'epic';
  entityId: string;
  entityName: string;
  previousStatus: string;
  correctedStatus: string;
  reason: string;
}

/**
 * Main handler for the DAG reconciler Lambda function.
 *
 * Flow:
 * 1. Query all projects with status "ready" or "in_progress"
 * 2. For each project, load the complete DAG: epics -> stories -> tasks with dependencies
 * 3. Perform consistency checks on every node in the graph:
 *    a. Task-level: verify status is correct given dependency completion
 *    b. Story-level: verify status is correct given task statuses
 *    c. Epic-level: verify status is correct given story statuses
 * 4. Fix inconsistencies in a single transaction per project
 * 5. Log each correction as an audit event
 * 6. Return summary of reconciliation
 */
export const handler = async (
  event: ScheduledEvent,
  context: Context,
): Promise<ReconciliationResult> => {
  // Implementation here
};
```

### Consistency Check Rules

```typescript
// functions/dag-reconciler/src/rules.ts
// Consistency rules for the DAG reconciler.
// Each rule checks a specific invariant and returns corrections if violated.

/**
 * Rule 1: Blocked tasks with all dependencies complete should be "not_started".
 * A task is incorrectly "blocked" if every task it depends on has status "complete".
 * Correction: set status to "not_started" so it becomes eligible for assignment.
 */
export function checkBlockedTasksWithCompleteDeps(tasks: TaskWithDeps[]): CorrectionDetail[] {
  // For each task with status "blocked":
  //   Load all dependency tasks
  //   If ALL dependencies have status "complete":
  //     -> Correction: "blocked" -> "not_started"
}

/**
 * Rule 2: Not-started tasks with incomplete dependencies should be "blocked".
 * A task is incorrectly "not_started" if it has dependencies that are not yet complete.
 * Correction: set status to "blocked" to prevent premature assignment.
 */
export function checkNotStartedTasksWithIncompleteDeps(tasks: TaskWithDeps[]): CorrectionDetail[] {
  // For each task with status "not_started":
  //   If it has dependencies AND any dependency is NOT "complete":
  //     -> Correction: "not_started" -> "blocked"
}

/**
 * Rule 3: In-progress stories with no assigned worker should be reset.
 * A story is incorrectly "in_progress" if assigned_worker is null.
 * Correction: set status to "not_started" (or "blocked" if deps incomplete).
 */
export function checkOrphanedInProgressStories(stories: StoryWithWorker[]): CorrectionDetail[] {
  // For each story with status "in_progress" AND assigned_worker IS NULL:
  //   -> Correction: "in_progress" -> DAG-determined status
}

/**
 * Rule 4: Story status should reflect aggregated task statuses.
 * - All tasks complete -> story should be "complete" (unless manually overridden)
 * - Some tasks in progress -> story should be "in_progress"
 * - No tasks started -> story should be "not_started" or "blocked"
 */
export function checkStoryTaskAggregation(stories: StoryWithTasks[]): CorrectionDetail[] {
  // Verify story status is consistent with its child task statuses
}

/**
 * Rule 5: Epic status should reflect aggregated story statuses.
 * Same aggregation logic as story-task, but at the epic-story level.
 */
export function checkEpicStoryAggregation(epics: EpicWithStories[]): CorrectionDetail[] {
  // Verify epic status is consistent with its child story statuses
}
```

### Database Queries

```typescript
// functions/dag-reconciler/src/db.ts
// Database queries for loading the full project DAG.
// Optimized for bulk loading to minimize query count.

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

/**
 * Load the complete DAG for a project in minimal queries.
 * Uses JOINs and batch loading to avoid N+1 query patterns.
 * Returns: { epics, stories, tasks, dependencies }
 */
export async function loadProjectDAG(projectId: string): Promise<ProjectDAG> {
  // Query 1: all epics for the project
  // Query 2: all stories for the project (with epic_id FK)
  // Query 3: all tasks for the project (with story_id FK)
  // Query 4: all task dependencies for the project
  // Assemble into a traversable graph structure
}

/**
 * Apply corrections in a single transaction.
 * Updates all corrected entities' statuses atomically.
 */
export async function applyCorrections(corrections: CorrectionDetail[]): Promise<void> {
  // BEGIN TRANSACTION
  // For each correction: UPDATE entity SET status = correctedStatus
  // COMMIT
}
```

## Acceptance Criteria

- [ ] Lambda handler is defined at `functions/dag-reconciler/src/handler.ts`
- [ ] Handler accepts `ScheduledEvent` from EventBridge and returns a `ReconciliationResult`
- [ ] All active projects (status "ready" or "in_progress") are checked
- [ ] Rule 1: Blocked tasks with all-complete dependencies are corrected to "not_started"
- [ ] Rule 2: Not-started tasks with incomplete dependencies are corrected to "blocked"
- [ ] Rule 3: In-progress stories with no assigned worker are corrected to DAG-determined status
- [ ] Rule 4: Story statuses are verified against aggregated task statuses
- [ ] Rule 5: Epic statuses are verified against aggregated story statuses
- [ ] Corrections are applied in a single transaction per project for atomicity
- [ ] Each correction generates an audit event in DynamoDB
- [ ] The handler logs a summary of projects checked, inconsistencies found, and corrections made
- [ ] The DAG is loaded efficiently using batch queries (no N+1 patterns)
- [ ] The handler completes within the Lambda timeout even with large DAGs (hundreds of nodes)
- [ ] pino structured logging is used for all log output
- [ ] No `any` types are used in the implementation

## Technical Notes

- The reconciler is a "safety net" — it should rarely find inconsistencies in a correctly functioning system. High inconsistency counts may indicate bugs in the orchestration logic that should be investigated.
- Performance: Loading the full DAG per project is acceptable because the reconciler runs infrequently (every 5 minutes) and projects typically have at most hundreds of tasks. If performance becomes an issue, consider incremental reconciliation based on `updated_at` timestamps.
- The reconciler should NOT correct statuses that are in a valid transitional state. For example, a story that was just assigned (status "in_progress" with a valid `assigned_worker`) should not be touched even if its tasks are all "not_started" (the worker has not started yet).
- Corrections are logged at `warn` level since they represent unexpected state that was auto-corrected.

## References

- **Functional Requirements:** FR-BG-003 (DAG reconciliation), FR-BG-004 (consistency checking)
- **Design Specification:** Section 12.2 (DAG Reconciler), Section 5 (DAG Model)
- **Domain Logic:** DAG traversal and status evaluation from `@laila/domain`
- **Infrastructure:** EventBridge Scheduler rule (defined in Epic 14, Terraform)

## Estimated Complexity

High — Full-graph traversal with multiple consistency rules, efficient bulk loading, transactional corrections, and audit logging. The rules must be carefully defined to avoid correcting valid transitional states.

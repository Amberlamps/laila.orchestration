# Implement System-Initiated Event Logging

## Task Details

- **Title:** Implement System-Initiated Event Logging
- **Status:** Complete
- **Assigned Agent:** backend-developer
- **Parent User Story:** [Implement Audit Event Writing](./tasks.md)
- **Parent Epic:** [Audit Log & Activity Feed](../../user-stories.md)
- **Dependencies:** Create Audit Event Service

## Description

Implement audit logging for system-initiated events that occur without direct user or worker action. These include automatic status propagation (cascading blocked-to-not_started when a dependency completes), timeout reclamation (when a worker exceeds the timeout duration and their story is reclaimed), and project auto-complete (when all stories in a project are completed). These events use "System" as the actor.

### System Event Types

```typescript
// apps/web/src/lib/audit/system-events.ts
// Functions for logging system-initiated audit events.
// All use the "System" actor and include detailed context.

import { auditEventService } from '@laila/database';
import type { CreateAuditEventInput } from '@laila/shared';

const SYSTEM_ACTOR = {
  type: 'system' as const,
  id: 'system',
  name: 'System',
};

/**
 * System-initiated events to log:
 *
 * 1. Auto-Status Propagation:
 *    When a task completes and its dependent tasks become unblocked:
 *    - action: "status_changed"
 *    - details: 'Task "Build API" completed, unblocking task "Write Tests"'
 *    - metadata: { trigger: "dependency_resolved", triggerTaskId, unblockedTaskId }
 *
 *    When a task fails and its dependent tasks become blocked:
 *    - action: "status_changed"
 *    - details: 'Task "Build API" failed, blocking task "Write Tests"'
 *    - metadata: { trigger: "dependency_failed", failedTaskId, blockedTaskId }
 *
 * 2. Timeout Reclamation:
 *    When a worker's story assignment exceeds the project timeout:
 *    - action: "timeout_reclaimed"
 *    - details: 'Story "Implement Auth" reclaimed from worker "agent-1"
 *      after 60 minute timeout'
 *    - metadata: { workerId, timeoutMinutes, assignedAt }
 *
 *    When the reclaimed story is returned to "not_started" status:
 *    - action: "status_changed"
 *    - details: 'Story "Implement Auth" status reset to not_started
 *      after timeout reclamation'
 *    - metadata: { trigger: "timeout_reclamation", previousStatus }
 *
 * 3. Project Auto-Complete:
 *    When all stories in a project reach "completed" status:
 *    - action: "status_changed"
 *    - details: 'Project "My Project" automatically completed —
 *      all 15 stories finished'
 *    - metadata: { trigger: "auto_complete", totalStories, completedStories }
 *
 * 4. Epic Auto-Complete:
 *    When all stories in an epic reach "completed" status:
 *    - action: "status_changed"
 *    - details: 'Epic "Authentication" automatically completed —
 *      all 5 stories finished'
 *    - metadata: { trigger: "auto_complete", totalStories, completedStories }
 */
```

### Integration Points

```typescript
// System events are logged from the domain logic layer,
// not from API route handlers.

/**
 * Integration locations:
 *
 * 1. Auto-status propagation:
 *    - packages/domain/src/services/dependency-resolver.ts
 *    - Called when a task status changes and dependent tasks
 *      need to be unblocked or blocked
 *    - Log one event per affected task
 *
 * 2. Timeout reclamation:
 *    - apps/web/src/lib/jobs/timeout-checker.ts (or similar)
 *    - Called by the background job that checks for timed-out assignments
 *    - Log one event for the reclamation and one for the status reset
 *
 * 3. Project/Epic auto-complete:
 *    - packages/domain/src/services/completion-checker.ts
 *    - Called after a story completes, checks if all sibling stories
 *      in the parent epic/project are also complete
 *    - Log one event per auto-completed entity
 */
```

### Batch Writing for Cascading Events

```typescript
// When a single action triggers multiple system events
// (e.g., completing a task unblocks 3 dependent tasks),
// write all events efficiently.

/**
 * logCascadingStatusChanges(events: CreateAuditEventInput[]): Promise<void>
 *
 * For a small number of events (< 25):
 * - Write each event individually using writeEvent()
 * - Use Promise.allSettled() for parallel non-blocking writes
 *
 * For larger batches (>= 25):
 * - Use DynamoDB BatchWriteItem for efficiency
 * - Each batch can contain up to 25 items
 * - Handle unprocessed items with retry
 *
 * All writes are fire-and-forget — errors are logged but do not
 * affect the triggering operation.
 */
```

## Acceptance Criteria

- [ ] Auto-status propagation events are logged when a task completion unblocks dependent tasks
- [ ] Auto-status propagation events are logged when a task failure blocks dependent tasks
- [ ] Each unblocked/blocked task gets its own audit event with details explaining the trigger
- [ ] Timeout reclamation events are logged when a story assignment exceeds the project timeout
- [ ] Timeout reclamation events include the worker name, story title, and timeout duration
- [ ] A separate status change event is logged when a reclaimed story's status is reset
- [ ] Project auto-complete events are logged when all stories in a project complete
- [ ] Epic auto-complete events are logged when all stories in an epic complete
- [ ] All system events use the "System" actor with type "system", id "system", name "System"
- [ ] System events include rich details describing the cause and effect of the action
- [ ] System events include metadata with structured data (trigger type, related entity IDs)
- [ ] Cascading events (multiple tasks unblocked at once) are written in parallel
- [ ] All audit writes are fire-and-forget — errors do not block the triggering operation
- [ ] System events are visually distinguishable from user/worker events in the UI (via actor type)
- [ ] No `any` types are used in the implementation

## Technical Notes

- System events are logged from the domain logic layer (packages/domain), not from API route handlers. This is because system events are triggered by domain rules (dependency resolution, timeout checking, completion checking), not by direct API calls.
- The domain layer needs access to the audit event service. This can be provided via dependency injection or by importing the service directly.
- For cascading events (e.g., completing one task unblocks five others), use `Promise.allSettled()` to write all events in parallel without waiting for completion. This minimizes the impact on the triggering operation's latency.
- DynamoDB's `BatchWriteItem` can write up to 25 items in a single request. For cascading events with many affected tasks, this reduces the number of API calls to DynamoDB.
- The metadata field on system events provides structured context that can be used for filtering and analysis in future iterations (e.g., "show all timeout reclamation events").

## References

- **Audit Event Service:** Created in the `create-audit-event-service` task
- **Domain Logic:** Dependency resolver, completion checker from Epic 5 (Domain Logic Engine)
- **Background Jobs:** Timeout checker from Epic 13 (Background Jobs)
- **DynamoDB:** `BatchWriteItem` for efficient multi-item writes
- **Type Definitions:** `AuditEvent`, `AuditEventActor` from `@laila/shared`

## Estimated Complexity

Medium — The individual event logging calls are straightforward, but identifying all integration points across the domain logic layer and ensuring comprehensive coverage requires careful analysis. Batch writing adds minor complexity.

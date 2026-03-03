# Write Completion & Failure Tests

## Task Details

- **Title:** Write Completion & Failure Tests
- **Status:** Complete
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Completion & Failure Endpoints](./tasks.md)
- **Parent Epic:** [Orchestration & Work Assignment API](../../user-stories.md)
- **Dependencies:** Implement Task Completion Endpoint, Implement Story Completion Endpoint, Implement Story Failure Endpoint, Implement Story Reset Endpoint

## Description

Write comprehensive integration tests for all completion, failure, and reset flows. These tests validate the cascading status re-evaluation, cost recording, failure logging, DAG-based reset behavior, and the interactions between these endpoints.

**SAFETY-CRITICAL:** These tests validate the correctness of cascading status changes, which directly affect work assignment. Incorrect cascading can lead to deadlocks or premature task starts.

### Test Structure

```typescript
// apps/web/src/__tests__/api/v1/orchestration/completion.integration.test.ts
// Integration tests for task completion, story completion, failure, and reset.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createWorkerClient, createTestClient } from '@/__tests__/helpers/test-client';
import { seedAssignedStory, seedTaskChain } from '@/__tests__/helpers/seed';

describe('Task Completion', () => {
  it('marks task as complete and sets completed_at', async () => {
    // ...
  });

  it('unblocks downstream tasks when all dependencies are complete', async () => {
    // Create chain: A -> B -> C (B, C blocked)
    // Complete A, verify B becomes not_started (C still blocked)
    // Complete B, verify C becomes not_started
  });

  it('does not unblock downstream task if other dependencies remain', async () => {
    // Create: A -> C, B -> C (A, B not complete)
    // Complete A, verify C is still blocked (B not complete)
  });

  it('handles cross-story downstream tasks', async () => {
    // Task in Story 1 depends on task in Story 2
    // Complete the Story 2 task, verify Story 1 task is re-evaluated
  });

  it('reports all_tasks_complete flag when all tasks done', async () => {
    // Complete all tasks in a story, verify flag is true
  });

  it('does not auto-complete the story', async () => {
    // Complete all tasks, verify story is still in-progress
    // (worker must explicitly call story complete)
  });

  it('rejects completion from non-assigned worker', async () => {
    // ...
  });
});

describe('Story Completion', () => {
  it('records cost data and sets completed_at', async () => {
    // Complete all tasks, then complete story with cost
    // Verify cost_usd and cost_tokens recorded
  });

  it('clears worker assignment on completion', async () => {
    // Complete story, verify assigned_worker_id is null
  });

  it('propagates completion to epic and project', async () => {
    // Complete the last story in an epic, verify epic becomes completed
    // Complete the last epic in a project, verify project becomes completed
  });

  it('rejects negative cost values', async () => {
    // Verify COST_VALIDATION_FAILED for negative cost_usd or cost_tokens
  });

  it('rejects completion when tasks are not all complete', async () => {
    // ...
  });

  it('computes correct duration_seconds', async () => {
    // ...
  });
});

describe('Story Failure', () => {
  it('marks story as failed with error message', async () => {
    // ...
  });

  it('preserves worker assignment for debugging', async () => {
    // Fail a story, verify assigned_worker_id is NOT cleared
  });

  it('creates attempt history record with task snapshot', async () => {
    // Fail a story after completing some tasks
    // Verify attempt history includes task_statuses snapshot
  });

  it('records partial cost data when provided', async () => {
    // ...
  });

  it('accepts both worker and human auth', async () => {
    // Test with worker client, test with human client
  });

  it('keeps downstream tasks blocked', async () => {
    // Fail a story, verify tasks in other stories remain blocked
  });
});

describe('Story Reset', () => {
  it('resets failed story to not_started when no upstream deps', async () => {
    // Fail then reset a story with no cross-story dependencies
  });

  it('resets failed story to blocked when upstream deps incomplete', async () => {
    // Fail then reset a story with incomplete cross-story dependencies
  });

  it('clears worker assignment', async () => {
    // ...
  });

  it('preserves completed tasks (does not reset them)', async () => {
    // Complete 2 of 3 tasks, fail the story, reset
    // Verify 2 tasks are still complete, 1 is reset to not_started
  });

  it('re-evaluates blocked tasks after reset', async () => {
    // ...
  });

  it('rejects worker auth (human only)', async () => {
    // ...
  });

  it('increments previous_attempts count', async () => {
    // Fail and reset twice, verify count is 2
  });
});

describe('End-to-End Lifecycle', () => {
  it('full lifecycle: assign -> complete tasks -> complete story', async () => {
    // Walk through the entire happy path
  });

  it('lifecycle with failure: assign -> partial work -> fail -> reset -> re-assign -> complete', async () => {
    // Walk through a failure recovery scenario
  });
});
```

## Acceptance Criteria

- [ ] Tests verify task completion with cascading re-evaluation for linear chains
- [ ] Tests verify task completion with fan-in dependencies (multiple deps, partial completion)
- [ ] Tests verify cross-story task dependency cascading
- [ ] Tests verify the `all_tasks_complete` flag
- [ ] Tests verify the story is NOT auto-completed after all tasks done
- [ ] Tests verify story completion with cost recording
- [ ] Tests verify worker assignment is cleared on story completion
- [ ] Tests verify status propagation to epic and project on story completion
- [ ] Tests verify cost validation (non-negative, proper decimal handling)
- [ ] Tests verify story failure preserves worker assignment
- [ ] Tests verify attempt history creation with task status snapshot
- [ ] Tests verify story reset determines correct status from DAG
- [ ] Tests verify reset preserves completed tasks
- [ ] Tests verify reset is human-auth only
- [ ] Tests verify end-to-end happy path lifecycle
- [ ] Tests verify failure recovery lifecycle (fail, reset, re-assign, complete)
- [ ] No `any` types in test code
- [ ] All tests pass in CI

## Technical Notes

- The end-to-end lifecycle tests are the most valuable in this suite. They verify that the entire flow works correctly from assignment through completion (or failure and recovery). These tests exercise the full middleware stack, authentication, database operations, and cascading logic.
- For cascading tests, use helper functions that create specific DAG topologies: `seedLinearChain(3)` for A -> B -> C, `seedFanIn(2)` for A -> C, B -> C, `seedFanOut(2)` for A -> B, A -> C.
- The "failure recovery" lifecycle test is critical: it verifies that a story can be failed, reset, re-assigned to a different worker, and completed successfully. This is the most common failure recovery path in production.
- Test the attempt history accumulation: after two fail-reset cycles, verify that the story has two attempt history records with correct data.

## References

- **Functional Requirements:** FR-TEST-002, FR-ORCH-007 through FR-ORCH-015
- **Design Specification:** Section 10.3 (Orchestration Testing Strategy)
- **Testing Framework:** Vitest configuration

## Estimated Complexity

Very High — The most comprehensive test suite in the orchestration epic. Covers cascading logic, multi-step lifecycles, failure recovery, and cost validation. Requires complex seed data with specific DAG topologies and state management.

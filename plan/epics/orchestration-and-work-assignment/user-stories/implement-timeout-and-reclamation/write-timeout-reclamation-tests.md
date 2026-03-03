# Write Timeout & Reclamation Tests

## Task Details

- **Title:** Write Timeout & Reclamation Tests
- **Status:** Complete
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Timeout & Reclamation](./tasks.md)
- **Parent Epic:** [Orchestration & Work Assignment API](../../user-stories.md)
- **Dependencies:** Implement Timeout Checking Logic, Implement Manual Unassignment Endpoint, Implement Timeout Race Condition Handling

## Description

Write comprehensive tests for timeout checking, manual unassignment, race condition handling, and the attempt history system. These tests validate the most safety-critical behavior in the orchestration system.

**SAFETY-CRITICAL:** These tests must cover the race condition between worker completion and timeout reclamation. This is the most dangerous failure mode in the system — incorrect handling can lead to lost work.

### Test Structure

```typescript
// apps/web/src/__tests__/api/v1/orchestration/timeout.integration.test.ts
// Integration tests for timeout, reclamation, and race condition handling.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createWorkerClient, createTestClient } from '@/__tests__/helpers/test-client';
import { seedAssignedStory, advanceTime } from '@/__tests__/helpers/seed';
import { checkAndReclaimTimedOutStories } from '@/lib/orchestration/timeout-checker';

describe('Timeout Checking', () => {
  it('reclaims story after timeout duration expires', async () => {
    // Seed an assigned story with started_at in the past
    // Set project timeout to 60 minutes
    // Set story.last_activity_at to 61 minutes ago
    // Run timeout checker
    // Verify story is reclaimed: status not_started, worker cleared
  });

  it('does not reclaim story before timeout duration', async () => {
    // Set story.last_activity_at to 30 minutes ago (timeout is 60)
    // Run timeout checker
    // Verify story is NOT reclaimed
  });

  it('uses last_activity_at (not started_at) for timeout calculation', async () => {
    // Assign story 120 minutes ago
    // Complete a task 30 minutes ago (updates last_activity_at)
    // Timeout is 60 minutes
    // Run timeout checker
    // Verify story is NOT reclaimed (last activity was 30 min ago)
  });

  it('resets story to blocked when upstream deps incomplete', async () => {
    // Seed story with incomplete cross-story dependencies
    // Timeout the story
    // Verify status becomes "blocked" (not "not_started")
  });

  it('preserves completed tasks on timeout', async () => {
    // Complete 2 of 3 tasks, timeout the story
    // Verify 2 tasks remain complete, 1 is reset to not_started
  });

  it("creates attempt history record with reason 'timeout'", async () => {
    // Timeout a story, verify attempt history record exists
    // Verify record includes worker_id, timing, task_statuses snapshot
  });

  it('handles multiple timed-out stories in a single check', async () => {
    // Seed 3 timed-out stories across 2 projects
    // Run timeout checker
    // Verify all 3 are reclaimed
  });

  it('continues processing after individual story reclamation failure', async () => {
    // Seed 2 timed-out stories
    // Make one story's reclamation fail (e.g., constraint violation)
    // Verify the other story is still reclaimed
  });
});

describe('Race Condition Handling', () => {
  it('worker completes before timeout — completion preserved', async () => {
    // Seed an assigned story near timeout
    // Worker completes the story
    // Run timeout checker
    // Verify story is completed (not reclaimed)
  });

  it('timeout reclaims before worker completes — worker gets error', async () => {
    // Seed an assigned story that has timed out
    // Run timeout checker (reclaims story)
    // Worker attempts to complete a task
    // Verify worker gets WORKER_NOT_ASSIGNED error
  });

  it('simultaneous completion and timeout — exactly one succeeds', async () => {
    // This is the hardest test to write deterministically.
    // Approach: use database-level serialization to simulate the race.
    //
    // Option 1: Run completion and timeout in parallel with Promise.all
    // Option 2: Mock the database to control timing
    //
    // Verify:
    // - Story ends up in exactly one state (completed OR reclaimed)
    // - The losing operation returns a graceful error
    // - No data corruption (worker not assigned to reclaimed story,
    //   or story not "completed" but worker still assigned)
  });

  it('worker retries completed task (idempotent)', async () => {
    // Complete a task, retry the same completion
    // Verify 200 with the already-completed task (not an error)
  });
});

describe('Manual Unassignment', () => {
  it('unassigns worker with confirmation', async () => {
    // ...
  });

  it('rejects without confirmation field', async () => {
    // Verify 400 with clear error message
  });

  it('rejects with confirmation: false', async () => {
    // Verify 400 — must be explicitly true
  });

  it('clears assignment and resets story', async () => {
    // Verify assigned_worker_id is null, status is DAG-determined
  });

  it('preserves completed tasks', async () => {
    // ...
  });

  it("creates attempt history with reason 'manual_unassignment'", async () => {
    // Verify attempt record with optional reason field
  });

  it('captures operator-provided reason', async () => {
    // Send unassign with { confirmation: true, reason: "Worker stuck" }
    // Verify reason is captured in attempt history and audit log
  });

  it('rejects worker auth', async () => {
    // Worker cannot unassign themselves
  });

  it('story returns to assignment pool after unassignment', async () => {
    // Unassign worker, have another worker request assignment
    // Verify the unassigned story is offered to the new worker
  });
});

describe('Attempt History Accumulation', () => {
  it('accumulates multiple attempt records for repeated failures', async () => {
    // Assign -> fail -> reset -> assign -> timeout -> reset -> assign -> complete
    // Verify 2 attempt records (failure + timeout)
    // Verify final completion has correct attempt count
  });

  it('each attempt record has correct timing', async () => {
    // Verify started_at and ended_at match the actual assignment period
  });

  it('each attempt record has task status snapshot', async () => {
    // Complete tasks incrementally across attempts
    // Verify each snapshot reflects the state at that attempt's end
  });
});
```

## Acceptance Criteria

- [ ] Tests verify timeout fires correctly based on `last_activity_at` and `project.timeout_duration_minutes`
- [ ] Tests verify timeout uses `last_activity_at` (not `started_at`) for calculation
- [ ] Tests verify completed tasks are preserved on timeout reclamation
- [ ] Tests verify DAG-based status determination on timeout (not_started vs blocked)
- [ ] Tests verify attempt history creation on timeout
- [ ] Tests verify race condition: completion before timeout (completion preserved)
- [ ] Tests verify race condition: timeout before completion (worker gets error)
- [ ] Tests verify race condition: simultaneous (exactly one succeeds)
- [ ] Tests verify idempotent task completion retry
- [ ] Tests verify manual unassignment requires `confirmation: true`
- [ ] Tests verify manual unassignment captures operator reason
- [ ] Tests verify manual unassignment is human-auth only
- [ ] Tests verify story returns to assignment pool after unassignment/timeout
- [ ] Tests verify attempt history accumulation across multiple attempts
- [ ] Tests verify each attempt record includes task status snapshot
- [ ] No `any` types in test code
- [ ] All tests pass in CI

## Technical Notes

- **Race condition testing is inherently non-deterministic.** The "simultaneous completion and timeout" test is the hardest to write reliably. Strategies:
  1. **Use `Promise.all`** to fire both operations concurrently and verify the outcome is consistent (one succeeds, one fails).
  2. **Use database savepoints** to simulate interleaving: start a transaction for timeout, pause, start a transaction for completion, complete both, verify only one succeeded.
  3. **Repeat the test multiple times** (e.g., 20 iterations) to increase confidence that the implementation handles all interleavings correctly.
- For timeout calculation tests, manipulate the `last_activity_at` and `started_at` timestamps directly in the database to simulate time passage. Do NOT use `setTimeout` or real time delays in tests.
- The "story returns to assignment pool" test exercises the full cycle: assign -> timeout/unassign -> re-assign. This end-to-end test is valuable for validating that the reclaimed story is correctly available for re-assignment.
- The attempt history accumulation test exercises multiple failure/recovery cycles. This is a realistic production scenario and should be tested thoroughly.

## References

- **Functional Requirements:** FR-TEST-002 (concurrency testing), FR-ORCH-016 through FR-ORCH-021
- **Design Specification:** Section 10.3 (Concurrency Testing Strategy), Section 10.4 (Race Condition Testing)
- **Testing Framework:** Vitest configuration

## Estimated Complexity

Very High — Testing race conditions requires careful setup, non-deterministic execution strategies, and multi-assertion verification. The attempt history accumulation tests require multi-step lifecycle simulation. This is the most challenging test suite to write correctly.

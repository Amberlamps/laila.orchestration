# Write Timeout Checker Tests

## Task Details

- **Title:** Write Timeout Checker Tests
- **Status:** Complete
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Timeout Checker Lambda](./tasks.md)
- **Parent Epic:** [Background Jobs & Scheduled Tasks](../../user-stories.md)
- **Dependencies:** Create Timeout Checker Handler

## Description

Write comprehensive unit tests for the timeout checker Lambda handler. Tests should cover correct identification of timed-out stories, respect for per-project timeout durations, race condition handling, previous attempt logging, and audit event writing.

### Test Structure

```typescript
// functions/timeout-checker/src/__tests__/handler.test.ts
// Unit tests for the timeout checker Lambda handler.
// Uses vitest with mocked database and DynamoDB clients.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScheduledEvent, Context } from 'aws-lambda';

// Mock the database module to control query results
vi.mock('../db');
// Mock the audit module to verify audit event writes
vi.mock('../audit');

describe('timeout-checker handler', () => {
  describe('timeout detection', () => {
    it('should identify stories where elapsed time exceeds project timeout_duration', async () => {
      // Setup: story with last_activity 2 hours ago, project timeout 1 hour
      // Assert: story is identified as timed out
    });

    it('should not reclaim stories within the timeout window', async () => {
      // Setup: story with last_activity 30 minutes ago, project timeout 1 hour
      // Assert: story is NOT reclaimed
    });

    it('should respect per-project timeout durations', async () => {
      // Setup: two stories in different projects with different timeouts
      // Project A: timeout 30min, story last active 45min ago (timed out)
      // Project B: timeout 2hr, story last active 45min ago (NOT timed out)
      // Assert: only Project A's story is reclaimed
    });

    it('should use assigned_at as fallback when last_activity_at is null', async () => {
      // Setup: story with null last_activity_at, assigned 2 hours ago
      // Assert: uses assigned_at for elapsed time calculation
    });
  });

  describe('reclamation', () => {
    it('should clear assigned_worker and assigned_at on timed-out stories', async () => {
      // Assert: story.assigned_worker = null, story.assigned_at = null
    });

    it("should reset status to 'not_started' when all DAG dependencies are complete", async () => {
      // Setup: timed-out story with all dependencies complete
      // Assert: story.status = "not_started"
    });

    it("should reset status to 'blocked' when some DAG dependencies are incomplete", async () => {
      // Setup: timed-out story with incomplete dependencies
      // Assert: story.status = "blocked"
    });
  });

  describe('previous attempt logging', () => {
    it("should create a previous_attempt record with reason 'timeout'", async () => {
      // Assert: previous_attempt record includes worker_id, started_at, ended_at, reason: "timeout"
    });

    it('should record the correct worker ID and timestamps', async () => {
      // Assert: worker_id matches the cleared assigned_worker
      // Assert: started_at matches the original assigned_at
      // Assert: ended_at is approximately now
    });
  });

  describe('audit events', () => {
    it('should write an audit event to DynamoDB for each reclamation', async () => {
      // Assert: writeAuditEvent called once per reclaimed story
    });

    it('should include story_id, project_id, and worker_id in audit event', async () => {
      // Assert: audit event contains all required fields
    });
  });

  describe('race conditions', () => {
    it('should not reclaim a story that was completed between query and reclamation', async () => {
      // Setup: story appears timed out in initial query
      // But: story status changed to "complete" before reclamation executes
      // Assert: reclamation is skipped (optimistic check prevents overwrite)
    });

    it('should not reclaim a story that was reassigned between query and reclamation', async () => {
      // Setup: story appears timed out with worker A
      // But: story was reclaimed and reassigned to worker B before reclamation executes
      // Assert: reclamation is skipped (worker ID mismatch)
    });
  });

  describe('edge cases', () => {
    it('should handle zero in-progress stories gracefully', async () => {
      // Setup: no in-progress stories
      // Assert: returns { checked: 0, reclaimed: 0 }, no errors
    });

    it('should handle multiple timed-out stories in a single invocation', async () => {
      // Setup: 5 timed-out stories across 3 projects
      // Assert: all 5 are reclaimed, summary is correct
    });

    it('should return correct summary counts', async () => {
      // Setup: 10 in-progress stories, 3 timed out
      // Assert: returns { checked: 10, reclaimed: 3 }
    });
  });
});
```

## Acceptance Criteria

- [ ] Tests exist at `functions/timeout-checker/src/__tests__/handler.test.ts`
- [ ] Timeout detection tests verify correct elapsed time calculation
- [ ] Per-project timeout duration is tested with multiple projects
- [ ] Fallback to `assigned_at` when `last_activity_at` is null is tested
- [ ] Reclamation tests verify worker clearing and DAG-aware status reset
- [ ] Previous attempt logging tests verify record creation with correct fields
- [ ] Audit event tests verify DynamoDB writes with correct payload
- [ ] Race condition tests verify optimistic locking prevents stale reclamations
- [ ] Edge cases cover zero stories, multiple reclamations, and summary accuracy
- [ ] All tests pass with `pnpm test` in the function directory
- [ ] No `any` types are used in test code
- [ ] Mocks are properly typed (no `any` casts for mock return values)

## Technical Notes

- Use vitest for testing, consistent with the monorepo test runner.
- Mock the database layer (`../db`) and audit layer (`../audit`) to isolate the handler logic. Tests should not require a running database.
- Use `vi.fn()` with proper TypeScript types for mock functions. Avoid `as any` casts.
- The race condition tests are particularly important. They verify that the handler's optimistic checks prevent data corruption when a story's state changes between the initial query and the reclamation write.
- Consider using `vi.useFakeTimers()` to control `Date.now()` for deterministic elapsed time calculations.

## References

- **Test Framework:** vitest (https://vitest.dev/)
- **Handler Implementation:** [Create Timeout Checker Handler](./create-timeout-checker-handler.md)
- **Race Condition Handling:** Section 9.3 of the Design Specification

## Estimated Complexity

Medium — Standard unit testing patterns with mocks. The race condition tests require careful setup to simulate concurrent state changes, but the handler's optimistic locking simplifies verification.

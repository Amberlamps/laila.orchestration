# Write DAG Reconciler Tests

## Task Details

- **Title:** Write DAG Reconciler Tests
- **Status:** Not Started
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement DAG Reconciler Lambda](./tasks.md)
- **Parent Epic:** [Background Jobs & Scheduled Tasks](../../user-stories.md)
- **Dependencies:** Create DAG Reconciler Handler

## Description

Write comprehensive unit tests for the DAG reconciler Lambda handler. Tests should cover all consistency rules, correction behavior, edge cases (empty projects, large DAGs), and audit logging.

### Test Structure

```typescript
// functions/dag-reconciler/src/__tests__/handler.test.ts
// Unit tests for the DAG reconciler Lambda handler.
// Uses vitest with mocked database and DynamoDB clients.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScheduledEvent, Context } from "aws-lambda";

vi.mock("../db");
vi.mock("../audit");

describe("dag-reconciler handler", () => {
  describe("Rule 1: blocked tasks with complete dependencies", () => {
    it("should correct a blocked task to not_started when all deps are complete", async () => {
      // Setup: task A (complete), task B (blocked, depends on A)
      // Assert: task B corrected to "not_started"
    });

    it("should not correct a blocked task when some deps are incomplete", async () => {
      // Setup: task A (complete), task B (in_progress), task C (blocked, depends on A and B)
      // Assert: task C remains "blocked" (B is still incomplete)
    });

    it("should handle deeply nested dependency chains", async () => {
      // Setup: A -> B -> C -> D, all complete except D is blocked
      // Assert: D corrected to "not_started"
    });
  });

  describe("Rule 2: not_started tasks with incomplete dependencies", () => {
    it("should correct a not_started task to blocked when deps are incomplete", async () => {
      // Setup: task A (not_started), task B (not_started, depends on A)
      // Assert: task B corrected to "blocked"
    });

    it("should not correct a not_started task with no dependencies", async () => {
      // Setup: task A (not_started, no dependencies)
      // Assert: task A remains "not_started" — this is correct
    });
  });

  describe("Rule 3: orphaned in-progress stories", () => {
    it("should correct in_progress story with null assigned_worker", async () => {
      // Setup: story with status "in_progress", assigned_worker = null
      // Assert: story corrected to DAG-determined status
    });

    it("should not correct in_progress story with valid assigned_worker", async () => {
      // Setup: story with status "in_progress", assigned_worker = "worker-123"
      // Assert: story remains "in_progress" — worker is actively assigned
    });
  });

  describe("Rule 4: story-task status aggregation", () => {
    it("should correct story to complete when all tasks are complete", async () => {
      // Setup: story with 3 tasks, all complete, but story status is "in_progress"
      // Assert: story corrected to "complete"
    });

    it("should not correct story status during active work", async () => {
      // Setup: story in_progress with assigned worker, some tasks complete
      // Assert: story remains "in_progress" — valid transitional state
    });
  });

  describe("Rule 5: epic-story status aggregation", () => {
    it("should correct epic to complete when all stories are complete", async () => {
      // Setup: epic with 3 stories, all complete, but epic status is "in_progress"
      // Assert: epic corrected to "complete"
    });
  });

  describe("transaction handling", () => {
    it("should apply all corrections for a project in a single transaction", async () => {
      // Setup: project with 3 inconsistencies
      // Assert: applyCorrections called once with all 3 corrections
    });

    it("should not apply corrections if none are found", async () => {
      // Setup: fully consistent project
      // Assert: applyCorrections NOT called
    });
  });

  describe("audit logging", () => {
    it("should write an audit event for each correction", async () => {
      // Assert: writeAuditEvent called once per correction
    });

    it("should include before/after status in audit event", async () => {
      // Assert: audit event contains previousStatus and correctedStatus
    });
  });

  describe("edge cases", () => {
    it("should handle projects with no epics/stories/tasks", async () => {
      // Setup: empty project
      // Assert: no errors, returns { inconsistenciesFound: 0, correctionsMade: 0 }
    });

    it("should handle large DAGs efficiently", async () => {
      // Setup: project with 50 epics, 200 stories, 1000 tasks
      // Assert: completes without timeout, uses batch queries
    });

    it("should skip projects that are not active (draft, archived)", async () => {
      // Setup: project with status "draft"
      // Assert: project is skipped entirely
    });

    it("should return accurate summary counts", async () => {
      // Setup: 3 projects, 2 with inconsistencies (5 total corrections)
      // Assert: { projectsChecked: 3, inconsistenciesFound: 5, correctionsMade: 5 }
    });
  });
});
```

## Acceptance Criteria

- [ ] Tests exist at `functions/dag-reconciler/src/__tests__/handler.test.ts`
- [ ] All five consistency rules are tested with positive and negative cases
- [ ] Deeply nested dependency chains are tested
- [ ] Transaction behavior is verified (single transaction per project)
- [ ] Audit event writing is verified for each correction
- [ ] Empty projects are handled without errors
- [ ] Large DAGs are tested for efficiency (no N+1 queries)
- [ ] Inactive projects are skipped
- [ ] Summary counts are accurate
- [ ] All tests pass with `pnpm test`
- [ ] No `any` types are used in test code
- [ ] Mocks are properly typed

## Technical Notes

- The consistency rules should be tested individually via the exported rule functions, as well as integration-tested through the main handler.
- For the "large DAG" test, verify that the number of database queries does not grow linearly with the number of entities (batch loading is used).
- The "valid transitional state" tests are important to prevent false positives: the reconciler must not "correct" a story that a worker is actively working on.

## References

- **Test Framework:** vitest (https://vitest.dev/)
- **Handler Implementation:** [Create DAG Reconciler Handler](./create-dag-reconciler-handler.md)
- **DAG Model:** Section 5 of the Design Specification

## Estimated Complexity

Medium — Multiple consistency rules to test, but each follows a similar pattern. The main complexity is in constructing realistic DAG fixtures for testing.

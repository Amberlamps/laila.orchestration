# Write Assignment Concurrency Tests

## Task Details

- **Title:** Write Assignment Concurrency Tests
- **Status:** Not Started
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Work Assignment Endpoint](./tasks.md)
- **Parent Epic:** [Orchestration & Work Assignment API](../../user-stories.md)
- **Dependencies:** Implement Assignment API Route, Implement Atomic Assignment with Locking, Implement Assignment Response Builder

## Description

Write concurrency and integration tests for the work assignment endpoint. These tests are critical for validating the safety properties of the assignment system: exactly-one assignment under concurrent access, correct typed responses, and proper handling of various DAG states.

**SAFETY-CRITICAL:** These tests validate the core safety invariants of the orchestration system. They must cover concurrent races, edge cases, and all response types.

### Test Structure

```typescript
// apps/web/src/__tests__/api/v1/orchestration/assign.concurrency.test.ts
// Concurrency tests for the work assignment endpoint.
// Uses real database connections and parallel test execution.

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  createWorkerClient,
  createTestClient,
} from "@/__tests__/helpers/test-client";
import {
  seedFullProject,
  seedReadyProject,
  seedWorkerWithAccess,
} from "@/__tests__/helpers/seed";

describe("Assignment Endpoint — Concurrency", () => {
  describe("Two workers racing for the same story", () => {
    it("exactly one worker gets assigned, the other gets conflict", async () => {
      // Seed a project with one eligible story
      const { project, story } = await seedReadyProject({ storyCount: 1 });
      const worker1 = await seedWorkerWithAccess(project.id);
      const worker2 = await seedWorkerWithAccess(project.id);

      // Fire both requests in parallel
      const [result1, result2] = await Promise.all([
        worker1.client.post("/api/v1/orchestration/assign", {
          project_id: project.id,
        }),
        worker2.client.post("/api/v1/orchestration/assign", {
          project_id: project.id,
        }),
      ]);

      // Exactly one should succeed (200 with type: "assigned")
      // The other should get either a conflict (409) or a different assignment
      const assigned = [result1, result2].filter(
        (r) => r.status === 200 && r.body.type === "assigned"
      );
      const conflictOrBlocked = [result1, result2].filter(
        (r) => r.status !== 200 || r.body.type !== "assigned"
      );

      expect(assigned).toHaveLength(1);
      expect(conflictOrBlocked).toHaveLength(1);
    });
  });

  describe("Assignment under various DAG states", () => {
    it("returns 'assigned' when eligible stories exist", async () => {
      // Seed a project with ready stories (no blocking deps)
      // Verify response type is "assigned" with full story details
    });

    it("returns 'blocked' when all stories have incomplete dependencies", async () => {
      // Seed a project where all stories depend on incomplete work
      // Verify response type is "blocked" with blocking story info
    });

    it("returns 'all_complete' when all stories are done", async () => {
      // Seed a project with all stories completed
      // Verify response type is "all_complete" with completion counts
    });

    it("selects highest priority story when multiple are eligible", async () => {
      // Seed stories with priorities 3, 7, 5
      // Verify the priority-7 story is assigned
    });

    it("selects oldest story when priorities are equal", async () => {
      // Seed stories with equal priority, different created_at
      // Verify the oldest is assigned
    });
  });

  describe("Re-assignment behavior", () => {
    it("returns the already-assigned story if worker requests again", async () => {
      // Assign a story to a worker
      // Call assign again with the same worker
      // Verify the same story is returned (not a new one)
    });
  });

  describe("Authorization checks", () => {
    it("returns 403 when worker lacks project access", async () => {
      // Create a worker without project access, attempt assignment
    });

    it("returns 404 when project does not exist", async () => {
      // ...
    });

    it("returns 409 when project is in Draft status", async () => {
      // Project not yet published
    });
  });

  describe("Response structure", () => {
    it("assigned response includes recommended task order", async () => {
      // Verify recommended_task_order respects dependencies
    });

    it("assigned response includes full persona system_prompt", async () => {
      // ...
    });

    it("assigned response includes resolved dependency statuses", async () => {
      // ...
    });

    it("blocked response includes retry_after_seconds", async () => {
      // ...
    });
  });
});
```

## Acceptance Criteria

- [ ] Concurrency test verifies exactly-one assignment when two workers race for the same story
- [ ] Test verifies the losing worker receives a conflict or gets a different story
- [ ] Tests cover all three response types: "assigned", "blocked", "all_complete"
- [ ] Tests verify priority-based selection (highest priority first)
- [ ] Tests verify tiebreaker selection (oldest story when priorities equal)
- [ ] Tests verify re-assignment behavior (same story returned on retry)
- [ ] Tests verify authorization: project access denied, project not found, project not ready
- [ ] Tests verify the "assigned" response includes all expected fields (tasks, personas, dependencies, order)
- [ ] Tests verify the "blocked" response includes blocking story details and retry hint
- [ ] Tests verify the "all_complete" response includes completion counts
- [ ] Concurrency tests use real database connections (not mocks)
- [ ] No `any` types in test code
- [ ] All tests pass in CI, including concurrency tests

## Technical Notes

- Concurrency tests are inherently non-deterministic. The "two workers racing" test uses `Promise.all` to fire requests in parallel, but the actual timing depends on the database and network. The test assertion must be that exactly one of the two outcomes is "assigned" — it does not matter which worker wins.
- For reliable concurrency testing, consider running the race test multiple times (e.g., 10 iterations) to increase confidence. A single passing run might be due to sequential execution rather than true concurrent handling.
- The test helpers (`createWorkerClient`) should create workers with real API keys stored in the database, not mock auth. This ensures the full authentication flow is tested.
- Consider using Vitest's `concurrent` test modifier for tests that can run in parallel within the suite, but ensure test isolation (each test uses its own project/workers).

## References

- **Functional Requirements:** FR-TEST-002 (concurrency testing), FR-ORCH-001 through FR-ORCH-006
- **Design Specification:** Section 10.3 (Concurrency Testing Strategy)
- **Testing Framework:** Vitest configuration, concurrent test execution

## Estimated Complexity

Very High — Concurrency testing is inherently difficult. The non-deterministic nature of parallel execution, the need for real database connections, and the verification of the exactly-one assignment invariant all contribute to the highest complexity rating.

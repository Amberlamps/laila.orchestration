# Write Task API Tests

## Task Details

- **Title:** Write Task API Tests
- **Status:** Not Started
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Task API Endpoints](./tasks.md)
- **Parent Epic:** [Core CRUD API](../../user-stories.md)
- **Dependencies:** Implement Task CRUD Routes, Implement Task DAG Validation, Implement Task Status Updates

## Description

Write comprehensive integration tests for all task API endpoints. This is the most extensive test suite in the CRUD layer, covering CRUD operations, DAG cycle detection, dependency validation, status updates, cascading re-evaluation, cross-story dependencies, and read-only enforcement.

### Test Structure

```typescript
// apps/web/src/__tests__/api/v1/tasks/tasks.integration.test.ts
// Integration tests for task CRUD, DAG validation, and status updates.

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createTestClient, createWorkerClient } from "@/__tests__/helpers/test-client";
import {
  seedFullHierarchy,
  seedTestTask,
  seedDependencyEdge,
} from "@/__tests__/helpers/seed";

describe("Task API", () => {
  describe("CRUD Operations", () => {
    it("creates a task with dependency list", async () => {
      // ...
    });

    it("returns task with resolved dependency summaries in GET detail", async () => {
      // Verify dependencies include id, name, status (not just IDs)
    });

    it("replaces entire dependency list on PATCH", async () => {
      // Verify old edges removed, new edges created
    });

    it("enforces read-only when parent story is in-progress", async () => {
      // ...
    });
  });

  describe("DAG Validation", () => {
    it("detects direct cycle (A -> B -> A)", async () => {
      // Create task A depending on B, then try to add B depending on A
      // Verify 400 with DAG_CYCLE_DETECTED and cycle path
    });

    it("detects indirect cycle (A -> B -> C -> A)", async () => {
      // Create chain A -> B -> C, then try to add C -> A
    });

    it("rejects self-dependency", async () => {
      // Try to add task depending on itself
      // Verify INVALID_DEPENDENCY error
    });

    it("rejects cross-project dependencies", async () => {
      // Create tasks in different projects, try to add dependency
    });

    it("rejects dependencies on deleted tasks", async () => {
      // Soft-delete a task, try to add dependency on it
    });

    it("allows valid cross-story dependencies within same project", async () => {
      // Create tasks in different stories, add valid dependency
    });

    it("validates multi-edge cycles (adding [A, B] where B->A exists)", async () => {
      // ...
    });
  });

  describe("Status Updates", () => {
    it("starts a task when all dependencies are complete", async () => {
      // ...
    });

    it("rejects start when upstream dependencies are incomplete", async () => {
      // Verify error includes list of blocking task IDs
    });

    it("rejects start from non-assigned worker", async () => {
      // ...
    });

    it("completes a task and unblocks downstream tasks", async () => {
      // Create A -> B (B blocked), complete A, verify B becomes not-started
    });

    it("cascades through multi-level dependencies", async () => {
      // Create A -> B -> C (B,C blocked), complete A, verify B unblocked
      // Then complete B, verify C unblocked
    });

    it("does not unblock task if other dependencies are still incomplete", async () => {
      // Create A -> C and B -> C, complete A, verify C still blocked (B incomplete)
    });
  });

  describe("Dependency Edge Cleanup", () => {
    it("removes all edges when task is soft-deleted", async () => {
      // Delete a task that has both dependencies and dependents
      // Verify all edges are removed
    });

    it("triggers re-evaluation of dependent tasks after edge cleanup", async () => {
      // Delete a task that was blocking another task
      // Verify the blocked task is re-evaluated
    });
  });
});
```

## Acceptance Criteria

- [ ] Tests cover all CRUD operations: create, list, detail, update, delete
- [ ] Tests cover DAG cycle detection for direct cycles, indirect cycles, and multi-edge cycles
- [ ] Tests cover self-dependency rejection
- [ ] Tests cover cross-project dependency rejection
- [ ] Tests cover dependency on deleted task rejection
- [ ] Tests cover valid cross-story dependency creation
- [ ] Tests cover task start with dependency validation (upstream must be complete)
- [ ] Tests cover task complete with cascading re-evaluation
- [ ] Tests cover multi-level cascading (A -> B -> C chain)
- [ ] Tests cover partial dependency completion (C blocked by A and B, only A completed)
- [ ] Tests cover dependency edge cleanup on soft-delete
- [ ] Tests cover read-only enforcement inherited from parent story
- [ ] Tests verify worker authentication for start/complete endpoints
- [ ] Tests verify error response format with cycle paths
- [ ] No `any` types in test code
- [ ] All tests pass in CI

## Technical Notes

- These tests require the most complex seed data of any test suite. Create a `seedFullHierarchy()` helper that sets up a complete project -> epic -> story -> task structure with a worker assigned and the project in Ready/In-Progress state.
- For DAG tests, create a `seedDependencyChain()` helper that builds a linear chain of tasks with dependency edges.
- For cascading tests, use assertions that check the database state after the cascade, not just the API response. Query the dependent tasks directly to verify their status changed.
- The worker client helper (`createWorkerClient`) should authenticate via API key header rather than session cookie.

## References

- **Functional Requirements:** FR-TEST-001, FR-TASK-001 through FR-TASK-006, FR-DAG-001
- **Design Specification:** Section 10.1 (Testing Strategy)
- **Testing Framework:** Vitest configuration

## Estimated Complexity

Very High — The most complex test suite in the project due to the combinatorial explosion of DAG scenarios, multi-level cascading, and the need to set up and validate complex dependency graph states.

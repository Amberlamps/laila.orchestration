# Write Story API Tests

## Task Details

- **Title:** Write Story API Tests
- **Status:** Not Started
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement User Story API Endpoints](./tasks.md)
- **Parent Epic:** [Core CRUD API](../../user-stories.md)
- **Dependencies:** Implement Story CRUD Routes, Implement Story Lifecycle Transitions

## Description

Write comprehensive integration tests for all user story API endpoints. Tests should focus on read-only enforcement (the most critical constraint), lifecycle transitions (publish, reset, unassign), cost validation, and priority-based ordering.

### Test Structure

```typescript
// apps/web/src/__tests__/api/v1/stories/stories.integration.test.ts
// Integration tests for user story CRUD and lifecycle endpoints.

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createTestClient } from "@/__tests__/helpers/test-client";
import {
  seedTestProject,
  seedTestEpic,
  seedTestStory,
  seedTestTask,
  seedTestWorker,
} from "@/__tests__/helpers/seed";

describe("Story API", () => {
  describe("Read-Only Enforcement", () => {
    it("allows PATCH when story is in draft status", async () => {
      // ...
    });

    it("allows PATCH when story is in not_started status", async () => {
      // ...
    });

    it("rejects PATCH when story is in_progress", async () => {
      // Verify 409 with READ_ONLY_VIOLATION code
    });

    it("rejects PATCH when story is completed", async () => {
      // ...
    });

    it("rejects DELETE when story is in_progress", async () => {
      // ...
    });
  });

  describe("POST .../publish", () => {
    it("publishes story when all tasks have persona and acceptance criteria", async () => {
      // ...
    });

    it("fails when tasks lack persona reference", async () => {
      // Verify error details include task IDs with missing fields
    });

    it("fails when tasks lack acceptance criteria", async () => {
      // ...
    });
  });

  describe("POST .../reset", () => {
    it("resets failed story to not_started when no upstream deps", async () => {
      // ...
    });

    it("resets failed story to blocked when upstream deps incomplete", async () => {
      // ...
    });

    it("creates attempt history record on reset", async () => {
      // Verify attempt record with correct fields
    });

    it("rejects worker auth (human only)", async () => {
      // ...
    });
  });

  describe("POST .../unassign", () => {
    it("unassigns worker and resets story", async () => {
      // Verify worker cleared, tasks reset, attempt logged
    });

    it("requires confirmation in request body", async () => {
      // ...
    });

    it("resets in-progress tasks to not_started", async () => {
      // ...
    });
  });

  describe("Cost Fields", () => {
    it("includes cost_usd and cost_tokens in GET response", async () => {
      // ...
    });

    it("does not allow setting cost fields via PATCH", async () => {
      // Verify cost fields are stripped or rejected
    });
  });
});
```

## Acceptance Criteria

- [ ] Tests verify read-only enforcement for all editable statuses (draft, not_started, blocked) and read-only statuses (in_progress, completed)
- [ ] Tests verify publish validation: tasks with persona, tasks with acceptance criteria
- [ ] Tests verify reset creates attempt history records with correct data
- [ ] Tests verify reset determines correct status from DAG (not-started vs blocked)
- [ ] Tests verify unassign requires confirmation field
- [ ] Tests verify unassign resets in-progress child tasks
- [ ] Tests verify cost fields are read-only from CRUD endpoints
- [ ] Tests verify cost validation: non-negative values accepted, negative rejected
- [ ] Tests verify priority-based sorting in list endpoint
- [ ] Tests verify filtering by assigned_worker_id
- [ ] Tests verify human-only auth requirement for reset and unassign
- [ ] No `any` types in test code
- [ ] All tests pass in CI

## Technical Notes

- The read-only enforcement tests are the most important in this test suite. They verify the core safety constraint that prevents modification of stories that workers are actively working on.
- For reset/unassign tests, you need to seed a story in the appropriate state (in-progress with a worker assigned). Use seed helpers that set up the full assignment state: project (Ready), epic (Ready), story (in-progress), worker (assigned), tasks (various statuses).
- The DAG-based status determination test for reset requires seeding cross-story dependencies to verify that a story with incomplete upstream dependencies resets to "blocked" rather than "not-started".

## References

- **Functional Requirements:** FR-TEST-001, FR-STORY-001 through FR-STORY-006
- **Design Specification:** Section 10.1 (Testing Strategy)
- **Testing Framework:** Vitest configuration

## Estimated Complexity

High — Requires complex seed data setup (full hierarchy with assignments and dependencies) and testing of state-dependent behavior (read-only enforcement, DAG-determined status).

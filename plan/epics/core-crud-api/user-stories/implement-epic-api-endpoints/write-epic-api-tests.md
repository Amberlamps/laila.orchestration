# Write Epic API Tests

## Task Details

- **Title:** Write Epic API Tests
- **Status:** Not Started
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Epic API Endpoints](./tasks.md)
- **Parent Epic:** [Core CRUD API](../../user-stories.md)
- **Dependencies:** Implement Epic CRUD Routes, Implement Epic Lifecycle Transitions

## Description

Write comprehensive integration tests for all epic API endpoints using Vitest. Tests should cover CRUD operations scoped under a project, the publish lifecycle transition, soft-delete cascade behavior, derived work status computation, and validation errors.

### Test Structure

```typescript
// apps/web/src/__tests__/api/v1/epics/epics.integration.test.ts
// Integration tests for epic CRUD and lifecycle endpoints.

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createTestClient } from "@/__tests__/helpers/test-client";
import {
  seedTestProject,
  seedTestEpic,
  seedTestStory,
} from "@/__tests__/helpers/seed";

describe("Epic API", () => {
  describe("POST /api/v1/projects/:projectId/epics", () => {
    it("creates an epic in Draft status under the project", async () => {
      // ...
    });

    it("returns 404 when project does not exist", async () => {
      // ...
    });

    it("validates required fields", async () => {
      // ...
    });
  });

  describe("GET /api/v1/projects/:projectId/epics", () => {
    it("returns only non-deleted epics", async () => {
      // Seed an epic, soft-delete it, verify it is excluded
    });

    it("includes derived work status for each epic", async () => {
      // Seed stories with various statuses, verify epic work status
    });
  });

  describe("DELETE /api/v1/projects/:projectId/epics/:id", () => {
    it("soft-deletes epic and cascades to stories and tasks", async () => {
      // Verify deleted_at is set on epic, stories, and tasks
    });

    it("cleans up dependency edges for deleted tasks", async () => {
      // Create cross-epic dependency, delete one epic, verify edge removed
    });
  });

  describe("POST /api/v1/projects/:projectId/epics/:id/publish", () => {
    it("publishes when all stories are Ready", async () => {
      // ...
    });

    it("fails when stories are not Ready", async () => {
      // ...
    });
  });
});
```

## Acceptance Criteria

- [ ] Tests cover all CRUD operations: create, list, detail, update, soft-delete
- [ ] Tests cover the publish lifecycle transition with success and failure cases
- [ ] Tests verify soft-delete cascade to child stories and tasks
- [ ] Tests verify dependency edge cleanup on soft-delete
- [ ] Tests verify derived work status is correctly included in list and detail responses
- [ ] Tests verify parent project existence validation on create
- [ ] Tests verify read-only enforcement when parent project is not in Draft
- [ ] Tests verify 401 for unauthenticated requests
- [ ] Tests verify the standardized error envelope format
- [ ] Tests are isolated with proper setup and teardown
- [ ] No `any` types in test code
- [ ] All tests pass in CI

## Technical Notes

- Epic tests require more seed data than project tests since they need a parent project. Create reusable seed helpers that build the full hierarchy: `seedTestProject()` -> `seedTestEpic({ projectId })` -> `seedTestStory({ epicId })`.
- The derived work status test requires seeding stories with specific statuses and verifying the computation matches domain logic expectations.
- Cross-epic dependency edge cleanup tests are important for data integrity — a deleted task should not leave orphaned dependency edges that could confuse the DAG.

## References

- **Functional Requirements:** FR-TEST-001 (integration test coverage), FR-EPIC-001 through FR-EPIC-003
- **Design Specification:** Section 10.1 (Testing Strategy)
- **Testing Framework:** Vitest configuration

## Estimated Complexity

Medium — Requires more seed data setup than project tests due to the parent-child relationship. The soft-delete cascade and dependency edge cleanup tests add additional complexity.

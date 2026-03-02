# Write Persona API Tests

## Task Details

- **Title:** Write Persona API Tests
- **Status:** Not Started
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Persona API Endpoints](./tasks.md)
- **Parent Epic:** [Core CRUD API](../../user-stories.md)
- **Dependencies:** Implement Persona CRUD Routes

## Description

Write integration tests for all persona API endpoints. Primary focus is on the deletion guard that prevents deleting personas with active task references.

### Test Structure

```typescript
// apps/web/src/__tests__/api/v1/personas/personas.integration.test.ts
// Integration tests for persona CRUD endpoints.

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createTestClient } from "@/__tests__/helpers/test-client";
import {
  seedTestProject,
  seedTestPersona,
  seedTestTask,
} from "@/__tests__/helpers/seed";

describe("Persona API", () => {
  describe("POST /api/v1/personas", () => {
    it("creates a persona with system prompt", async () => {
      // Verify all fields saved correctly
    });

    it("validates project_id exists", async () => {
      // ...
    });

    it("accepts long system prompts (up to 50K chars)", async () => {
      // ...
    });
  });

  describe("GET /api/v1/personas", () => {
    it("includes usage count for each persona", async () => {
      // Seed tasks referencing the persona, verify count
    });

    it("filters by project_id", async () => {
      // ...
    });
  });

  describe("DELETE /api/v1/personas/:id", () => {
    it("deletes persona with no active task references", async () => {
      // ...
    });

    it("blocks deletion when active tasks reference the persona", async () => {
      // Seed a task with persona_id, verify 409 with DELETION_BLOCKED
      // Verify active task count in error details
    });

    it("allows deletion when only completed tasks reference the persona", async () => {
      // Seed a completed task with persona_id, verify deletion succeeds
    });

    it("allows deletion when only deleted tasks reference the persona", async () => {
      // Seed a soft-deleted task with persona_id, verify deletion succeeds
    });
  });
});
```

## Acceptance Criteria

- [ ] Tests cover all CRUD operations: create, list, detail, update, delete
- [ ] Tests verify the deletion guard blocks deletion with active task references
- [ ] Tests verify deletion is allowed when tasks are completed or deleted
- [ ] Tests verify the active task count in the deletion error response
- [ ] Tests verify usage count in list and detail responses
- [ ] Tests verify project_id filtering
- [ ] Tests verify long system prompt support
- [ ] Tests verify authentication requirements
- [ ] No `any` types in test code
- [ ] All tests pass in CI

## Technical Notes

- The deletion guard tests require seeding tasks with specific statuses (in-progress, not-started, complete, soft-deleted) to verify the guard logic.
- The "only completed tasks" test is important — it verifies that the guard does not over-block deletion.

## References

- **Functional Requirements:** FR-TEST-001, FR-PERSONA-001, FR-PERSONA-002
- **Design Specification:** Section 10.1 (Testing Strategy)
- **Testing Framework:** Vitest configuration

## Estimated Complexity

Low — Straightforward tests with a focus on the deletion guard edge cases.

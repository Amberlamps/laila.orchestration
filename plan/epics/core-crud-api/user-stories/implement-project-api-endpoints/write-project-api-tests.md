# Write Project API Tests

## Task Details

- **Title:** Write Project API Tests
- **Status:** Not Started
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Project API Endpoints](./tasks.md)
- **Parent Epic:** [Core CRUD API](../../user-stories.md)
- **Dependencies:** Implement Project CRUD Routes, Implement Project Status Transitions

## Description

Write comprehensive integration tests for all project API endpoints using Vitest. Tests should cover CRUD operations, status transitions, validation errors, authentication requirements, and edge cases. Use a real database (Neon test branch or local PostgreSQL) for integration testing, with proper test isolation via transaction rollback or per-test cleanup.

### Test Structure

```typescript
// apps/web/src/__tests__/api/v1/projects/projects.integration.test.ts
// Integration tests for project CRUD and lifecycle endpoints.
// Uses Vitest with a real database connection for true integration testing.
// Each test runs in an isolated transaction that is rolled back after the test.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestClient } from "@/__tests__/helpers/test-client";
import { seedTestUser, seedTestProject } from "@/__tests__/helpers/seed";
import type { Project } from "@laila/shared";

describe("Project API", () => {
  // Test authenticated client that simulates a logged-in user session.
  let client: ReturnType<typeof createTestClient>;

  beforeAll(async () => {
    client = await createTestClient();
  });

  describe("POST /api/v1/projects", () => {
    it("creates a project in Draft status", async () => {
      // ...
    });

    it("returns 400 for missing required fields", async () => {
      // Verify field-level error details in response
    });

    it("returns 400 for invalid timeout_duration_minutes", async () => {
      // ...
    });

    it("returns 401 for unauthenticated requests", async () => {
      // ...
    });
  });

  describe("GET /api/v1/projects", () => {
    it("returns paginated projects", async () => {
      // Verify pagination metadata
    });

    it("filters by status", async () => {
      // ...
    });

    it("sorts by created_at desc by default", async () => {
      // ...
    });
  });

  describe("POST /api/v1/projects/:id/publish", () => {
    it("transitions Draft to Ready when all epics are Ready", async () => {
      // ...
    });

    it("returns 400 when epics are not Ready", async () => {
      // Verify non-ready epic list in error details
    });

    it("returns 409 when project is not in Draft", async () => {
      // ...
    });
  });

  describe("POST /api/v1/projects/:id/revert", () => {
    it("transitions Ready to Draft when no work started", async () => {
      // ...
    });

    it("returns 409 when stories are in progress", async () => {
      // ...
    });
  });

  describe("DELETE /api/v1/projects/:id", () => {
    it("hard-deletes project and all children", async () => {
      // Verify cascade: epics, stories, tasks, edges all deleted
    });

    it("returns 404 for non-existent project", async () => {
      // ...
    });
  });
});
```

### Test Helpers

```typescript
// apps/web/src/__tests__/helpers/test-client.ts
// Creates a test HTTP client with authenticated session.
// Uses the Next.js test server (or direct handler invocation)
// to make requests to API routes without a running server.

/**
 * createTestClient() sets up:
 * - A test database connection
 * - A seeded test user with a valid session
 * - Helper methods: get(), post(), patch(), delete() with auto-auth
 */
```

## Acceptance Criteria

- [ ] Tests cover all CRUD operations: POST (create), GET (list), GET (detail), PATCH (update), DELETE (hard-delete)
- [ ] Tests cover both lifecycle transitions: publish (Draft to Ready) and revert (Ready to Draft)
- [ ] Tests verify correct HTTP status codes for all success and error scenarios
- [ ] Tests verify the standardized error envelope format `{ error: { code, message, details, requestId } }`
- [ ] Tests verify field-level validation errors (e.g., missing name, invalid timeout)
- [ ] Tests verify authentication is required (401 for unauthenticated requests)
- [ ] Tests verify pagination metadata (page, limit, total, totalPages)
- [ ] Tests verify cascade delete removes all child entities
- [ ] Tests verify publish pre-conditions (all epics must be Ready)
- [ ] Tests verify revert pre-conditions (no work started)
- [ ] Tests are isolated — each test does not depend on state from other tests
- [ ] Tests use typed assertions — no `any` types in test code
- [ ] All tests pass in CI with a real database connection

## Technical Notes

- Use Vitest's `beforeEach` with transaction rollback for test isolation. Each test starts a transaction, seeds necessary data, runs assertions, then rolls back. This is faster than truncating tables.
- For API route testing in Next.js Pages Router, consider using `next-test-api-route-handler` or directly invoking the handler function with mock `NextApiRequest`/`NextApiResponse` objects.
- The test client helper should handle session creation by directly inserting session records into the database (bypassing OAuth flow) for speed.
- Seed helpers should create minimal data for each test scenario. For example, `seedTestProject({ status: "draft" })` creates a project with the specified status and returns the full entity.

## References

- **Functional Requirements:** FR-TEST-001 (integration test coverage), FR-PROJ-001 through FR-PROJ-004
- **Design Specification:** Section 10.1 (Testing Strategy), Section 10.2 (Integration Test Patterns)
- **Testing Framework:** Vitest configuration in vitest workspace

## Estimated Complexity

Medium — The tests themselves are not algorithmically complex, but setting up proper test isolation, authentication simulation, and seed data requires careful infrastructure work.

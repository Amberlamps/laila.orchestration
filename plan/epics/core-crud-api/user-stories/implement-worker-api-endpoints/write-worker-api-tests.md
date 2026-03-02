# Write Worker API Tests

## Task Details

- **Title:** Write Worker API Tests
- **Status:** Not Started
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Worker API Endpoints](./tasks.md)
- **Parent Epic:** [Core CRUD API](../../user-stories.md)
- **Dependencies:** Implement Worker CRUD Routes, Implement Worker Project Access Routes

## Description

Write integration tests for all worker API endpoints, focusing on the security-sensitive aspects: API key generation and one-time reveal, API key hashing, deletion guards, and project access management.

### Test Structure

```typescript
// apps/web/src/__tests__/api/v1/workers/workers.integration.test.ts
// Integration tests for worker CRUD and project access endpoints.

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { createTestClient } from "@/__tests__/helpers/test-client";
import { seedTestProject, seedTestWorker } from "@/__tests__/helpers/seed";

describe("Worker API", () => {
  describe("POST /api/v1/workers", () => {
    it("creates a worker with a generated API key", async () => {
      // Verify API key is in response
      // Verify API key starts with "lw_" prefix
      // Verify API key is at least 51 characters (3 prefix + 48 hex)
    });

    it("returns API key only in creation response", async () => {
      // Create worker, note API key
      // GET the same worker, verify API key is NOT in response
      // Verify only api_key_prefix is returned
    });

    it("stores API key as SHA-256 hash", async () => {
      // Create worker, query database directly
      // Verify stored value is a SHA-256 hash, not plain text
    });
  });

  describe("DELETE /api/v1/workers/:id", () => {
    it("blocks deletion when worker has in-progress stories", async () => {
      // Assign a story to the worker
      // Attempt delete, verify 409 with DELETION_BLOCKED
      // Verify response includes list of in-progress story IDs
    });

    it("allows forced deletion with ?force=true", async () => {
      // Assign a story, force delete, verify worker deleted
      // Verify stories are unassigned
    });

    it("invalidates API key after deletion", async () => {
      // Create worker, note API key
      // Delete worker
      // Attempt to authenticate with the API key, verify 401
    });
  });

  describe("Project Access Management", () => {
    it("grants project access to a worker", async () => {
      // ...
    });

    it("grant is idempotent (re-granting returns 200)", async () => {
      // ...
    });

    it("revokes project access", async () => {
      // ...
    });

    it("blocks revocation when worker has in-progress work", async () => {
      // ...
    });

    it("lists all projects a worker has access to", async () => {
      // ...
    });
  });
});
```

## Acceptance Criteria

- [ ] Tests verify API key is included only in the creation response
- [ ] Tests verify API key format (lw_ prefix, correct length)
- [ ] Tests verify API key is stored as a hash (query database directly)
- [ ] Tests verify API key authentication works after creation
- [ ] Tests verify API key authentication fails after worker deletion
- [ ] Tests verify deletion guard for in-progress stories
- [ ] Tests verify forced deletion unassigns stories
- [ ] Tests verify idempotent project access grant
- [ ] Tests verify project access revocation guard for in-progress work
- [ ] Tests verify project access list endpoint
- [ ] Tests verify human-only authentication for all worker management endpoints
- [ ] No `any` types in test code
- [ ] All tests pass in CI

## Technical Notes

- The API key hash verification test requires direct database access to query the stored hash value. This is acceptable in integration tests — use the database client to query the workers/api_keys table directly.
- The "API key works after creation" test requires creating a worker, extracting the API key from the response, then making a request to an endpoint that requires worker auth (e.g., the health check).
- The "API key fails after deletion" test is a critical security test. It verifies that deleted worker keys are immediately invalidated, not just marked as deleted.

## References

- **Functional Requirements:** FR-TEST-001, FR-WORKER-001 through FR-WORKER-003, FR-AUTH-003
- **Design Specification:** Section 10.1 (Testing Strategy)
- **Testing Framework:** Vitest configuration

## Estimated Complexity

Medium — The security-focused tests (key hashing, key invalidation) require direct database queries and careful setup/teardown. The project access tests are straightforward.

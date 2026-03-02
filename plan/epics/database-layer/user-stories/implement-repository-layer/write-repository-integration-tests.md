# Write Repository Integration Tests

## Task Details

- **Title:** Write Repository Integration Tests
- **Status:** Not Started
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement Repository Layer](./tasks.md)
- **Parent Epic:** [Database Layer](../../user-stories.md)
- **Dependencies:** Implement Project Repository, Implement Epic Repository, Implement Story Repository, Implement Task Repository, Implement Worker Repository, Implement Persona Repository

## Description

Write comprehensive integration tests for all repository implementations against a real PostgreSQL database (Neon test branch). These tests validate that repository methods correctly interact with the database, enforce tenant isolation, handle optimistic locking conflicts, and implement business rules.

Integration tests differ from unit tests in that they execute actual SQL against a real database, verifying the complete data flow from repository method -> Drizzle query -> PostgreSQL and back.

## Acceptance Criteria

- [ ] Test infrastructure is configured:
  - Vitest setup file creates/resets a test database connection before all tests
  - Each test file uses transactions that are rolled back after each test for isolation
  - Test database uses a Neon branch (or separate test database)
- [ ] `packages/database/src/repositories/__tests__/project-repository.test.ts` exists with tests for:
  - CRUD operations (create, read, update, soft-delete)
  - Lifecycle status transition validation (valid and invalid transitions)
  - Optimistic locking conflict detection
  - Pagination with filters
  - Tenant isolation (cross-tenant queries return empty results)
- [ ] `packages/database/src/repositories/__tests__/epic-repository.test.ts` exists with tests for:
  - CRUD operations with project association
  - Derived status computation from child stories
  - Reorder operations
- [ ] `packages/database/src/repositories/__tests__/story-repository.test.ts` exists with tests for:
  - CRUD operations with epic association
  - Assignment lifecycle (assign, complete, release)
  - Read-only enforcement during in_progress
  - Attempt history creation during assignment
  - Priority-ordered ready query
- [ ] `packages/database/src/repositories/__tests__/task-repository.test.ts` exists with tests for:
  - CRUD operations with story association
  - Dependency edge add/remove
  - Self-loop prevention
  - Task graph retrieval
  - Bulk status update
  - Blocked task detection
- [ ] `packages/database/src/repositories/__tests__/worker-repository.test.ts` exists with tests for:
  - Create with API key generation
  - Authenticate by API key (valid and invalid keys)
  - API key regeneration
  - Project access grant/revoke
  - Activate/deactivate
- [ ] `packages/database/src/repositories/__tests__/persona-repository.test.ts` exists with tests for:
  - CRUD operations
  - Deletion guard (prevent delete when active tasks reference)
  - Title uniqueness per tenant
- [ ] All tests enforce tenant isolation: verify that data created by tenant A is not visible to tenant B
- [ ] All tests use properly typed test fixtures — no usage of `any` type
- [ ] Tests clean up after themselves (transaction rollback or explicit cleanup)
- [ ] All tests pass with `pnpm --filter @laila/database test`

## Technical Notes

- Test database setup with Vitest:
  ```typescript
  // packages/database/src/repositories/__tests__/setup.ts
  // Test setup for repository integration tests
  // Creates a database connection and provides transaction-based test isolation
  import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
  import { createPoolClient } from '../../client';

  // Use a dedicated test database URL
  const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

  let db: ReturnType<typeof createPoolClient>;

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL or DATABASE_URL must be set for integration tests');
    }
    db = createPoolClient(TEST_DATABASE_URL);
  });

  // Transaction-based isolation: wrap each test in a transaction and roll back
  // This ensures tests don't interfere with each other
  ```
- Transaction rollback pattern for test isolation:
  ```typescript
  import { sql } from 'drizzle-orm';

  beforeEach(async () => {
    await db.execute(sql`BEGIN`);
  });

  afterEach(async () => {
    await db.execute(sql`ROLLBACK`);
  });
  ```
- Create test fixture factories that generate properly typed test data:
  ```typescript
  // packages/database/src/repositories/__tests__/fixtures.ts
  // Test data factories for repository integration tests
  // All fixtures are properly typed — no usage of 'any'
  import { randomUUID } from 'node:crypto';

  export function createTestUser() {
    return {
      id: randomUUID(),
      name: 'Test User',
      email: `test-${randomUUID()}@example.com`,
      emailVerified: true,
    };
  }

  export function createTestProject(tenantId: string) {
    return {
      tenantId,
      name: `Test Project ${randomUUID().slice(0, 8)}`,
      description: 'Integration test project',
    };
  }
  ```
- Neon database branches are ideal for test databases — they are instant copies that can be discarded
- Consider using a Vitest globalSetup that runs migrations before tests and drops the test branch after
- For optimistic locking tests, simulate concurrent updates by using two separate update calls with the same version
- For tenant isolation tests, create data with tenant A and verify tenant B cannot see it

## References

- **Functional Requirements:** Repository correctness verification
- **Design Specification:** Integration testing against real database
- **Project Setup:** Vitest, Neon database branching

## Estimated Complexity

Large — Comprehensive integration tests across 6 repositories with complex scenarios (optimistic locking, assignment lifecycle, DAG operations). Requires test database infrastructure setup and proper isolation mechanisms.

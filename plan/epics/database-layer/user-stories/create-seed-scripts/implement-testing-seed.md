# Implement Testing Seed

## Task Details

- **Title:** Implement Testing Seed
- **Status:** Complete
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Create Seed Scripts](./tasks.md)
- **Parent Epic:** [Database Layer](../../user-stories.md)
- **Dependencies:** None (within this user story; depends on Implement Repository Layer and Define PostgreSQL Schema)

## Description

Create a testing seed script that populates the database with minimal, deterministic fixtures for integration tests. Unlike the development seed which creates a rich and realistic dataset, the testing seed creates the minimum data needed for tests to exercise the application's functionality.

The testing seed must be:

- **Deterministic** — Same input always produces the same output (fixed UUIDs, timestamps)
- **Minimal** — Only creates what is needed, no excess data
- **Idempotent** — Running it multiple times does not create duplicates (check-before-insert pattern)
- **Fast** — Completes quickly for CI pipelines

## Acceptance Criteria

- [ ] `packages/database/src/seed/testing.ts` exists with the seed script
- [ ] Script uses fixed UUIDs for all entities (deterministic, not random) so tests can reference entities by known IDs
- [ ] Script creates exactly 1 test tenant (user)
- [ ] Script creates exactly 1 project in `active` state
- [ ] Script creates exactly 2 epics (one `in_progress`, one `pending`)
- [ ] Script creates exactly 3 user stories (one `ready`, one `in_progress` with assignment, one `done`)
- [ ] Script creates exactly 4 tasks with 2 dependency edges forming a simple DAG
- [ ] Script creates exactly 1 worker with a known API key prefix and hash (so tests can authenticate)
- [ ] Script creates exactly 2 personas
- [ ] The worker has project access to the test project
- [ ] Script is idempotent: uses check-before-insert (ON CONFLICT DO NOTHING or explicit existence check)
- [ ] All fixture IDs are exported as constants for use in test files:
  ```typescript
  export const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
  export const TEST_PROJECT_ID = '00000000-0000-0000-0000-000000000010';
  // ... etc.
  ```
- [ ] Script is runnable via `pnpm --filter @laila/database db:seed:test`
- [ ] Script completes in under 5 seconds
- [ ] No usage of the `any` type in the seed script

## Technical Notes

- Testing seed structure:

  ```typescript
  // packages/database/src/seed/testing.ts
  // Testing seed — minimal deterministic fixtures for integration tests
  // Uses fixed UUIDs so test files can reference entities by known IDs
  // Idempotent: safe to run multiple times (check-before-insert)

  // Fixed IDs for test fixtures — exported for use in test files
  export const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
  export const TEST_PROJECT_ID = '00000000-0000-0000-0000-000000000010';
  export const TEST_EPIC_ACTIVE_ID = '00000000-0000-0000-0000-000000000020';
  export const TEST_EPIC_PENDING_ID = '00000000-0000-0000-0000-000000000021';
  export const TEST_STORY_READY_ID = '00000000-0000-0000-0000-000000000030';
  export const TEST_STORY_IN_PROGRESS_ID = '00000000-0000-0000-0000-000000000031';
  export const TEST_STORY_DONE_ID = '00000000-0000-0000-0000-000000000032';
  export const TEST_TASK_A_ID = '00000000-0000-0000-0000-000000000040';
  export const TEST_TASK_B_ID = '00000000-0000-0000-0000-000000000041';
  export const TEST_TASK_C_ID = '00000000-0000-0000-0000-000000000042';
  export const TEST_TASK_D_ID = '00000000-0000-0000-0000-000000000043';
  export const TEST_WORKER_ID = '00000000-0000-0000-0000-000000000050';
  export const TEST_PERSONA_BACKEND_ID = '00000000-0000-0000-0000-000000000060';
  export const TEST_PERSONA_QA_ID = '00000000-0000-0000-0000-000000000061';

  // Known API key for test worker (only used in test environment)
  export const TEST_WORKER_API_KEY = 'lw_test_integration_key_do_not_use_in_production';
  export const TEST_WORKER_API_KEY_PREFIX = 'lw_test_inte';
  ```

- Idempotent insert pattern with Drizzle:
  ```typescript
  // Check-before-insert pattern for idempotent seeding
  const existingUser = await db.query.users.findFirst({
    where: eq(usersTable.id, TEST_TENANT_ID),
  });
  if (!existingUser) {
    await db.insert(usersTable).values({
      id: TEST_TENANT_ID,
      name: 'Test Tenant',
      email: 'test@laila.works',
      emailVerified: true,
    });
  }
  ```
- Alternatively, use PostgreSQL's `ON CONFLICT DO NOTHING`:
  ```typescript
  await db.insert(usersTable).values({ ... }).onConflictDoNothing();
  ```
- The fixed API key for the test worker allows integration tests to authenticate without generating random keys
- Fixed timestamps should use a known date (e.g., `2026-01-01T00:00:00.000Z`) for deterministic assertions
- The simple DAG for testing: Task A -> Task B -> Task D, Task A -> Task C -> Task D (diamond pattern)
- Export all constants so test files can import them:
  ```typescript
  import { TEST_PROJECT_ID, TEST_WORKER_API_KEY } from '@laila/database/seed/testing';
  ```

## References

- **Functional Requirements:** Test data fixtures, integration test support
- **Design Specification:** Deterministic test data, idempotent seeding
- **Project Setup:** packages/database seed module

## Estimated Complexity

Small — Minimal dataset with fixed values. The idempotent check-before-insert pattern adds slight complexity but the overall volume is small and straightforward.

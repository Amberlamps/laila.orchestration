/**
 * Testing seed -- minimal deterministic fixtures for integration tests.
 *
 * Design goals:
 *   - **Deterministic**: fixed UUIDs, fixed timestamps, fixed API key
 *   - **Minimal**: only the entities required for test coverage
 *   - **Idempotent**: every insert uses `.onConflictDoNothing()` so the
 *     script can be re-run safely without duplicates
 *   - **Fast**: completes in well under 5 seconds
 *
 * Run via:
 *   pnpm --filter @laila/database db:seed:test
 *
 * Import constants in test files:
 *   import { TEST_PROJECT_ID, TEST_WORKER_API_KEY } from '@laila/database/seed/testing';
 */

import { getDb } from '../client';
import {
  usersTable,
  projectsTable,
  epicsTable,
  userStoriesTable,
  tasksTable,
  taskDependencyEdgesTable,
  workersTable,
  workerProjectAccessTable,
  personasTable,
} from '../schema';

// ---------------------------------------------------------------------------
// Fixed IDs -- exported for use in test files
// ---------------------------------------------------------------------------

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
export const TEST_WORKER_PROJECT_ACCESS_ID = '00000000-0000-0000-0000-000000000055';

export const TEST_PERSONA_BACKEND_ID = '00000000-0000-0000-0000-000000000060';
export const TEST_PERSONA_QA_ID = '00000000-0000-0000-0000-000000000061';

export const TEST_DEPENDENCY_EDGE_A_B_ID = '00000000-0000-0000-0000-000000000070';
export const TEST_DEPENDENCY_EDGE_B_D_ID = '00000000-0000-0000-0000-000000000072';

// ---------------------------------------------------------------------------
// Known API key -- only for test environments
// ---------------------------------------------------------------------------

/** The raw API key that integration tests send in the X-API-Key header. */
export const TEST_WORKER_API_KEY = 'lw_test_integration_key_do_not_use_in_production';

/** The first 12 characters used for prefix-based lookup. */
export const TEST_WORKER_API_KEY_PREFIX = 'lw_test_inte';

/** Pre-computed SHA-256 hex digest of `TEST_WORKER_API_KEY`. */
export const TEST_WORKER_API_KEY_HASH =
  '5d4482fd5f2f69209ce41dea0717afd912b5a30cc0e1c084e5eed27c9edc8f45';

// ---------------------------------------------------------------------------
// Fixed timestamp for deterministic assertions
// ---------------------------------------------------------------------------

const FIXED_TIMESTAMP = new Date('2026-01-01T00:00:00.000Z');

// ---------------------------------------------------------------------------
// Seed runner
// ---------------------------------------------------------------------------

const seedTenant = async (db: ReturnType<typeof getDb>) => {
  await db
    .insert(usersTable)
    .values({
      id: TEST_TENANT_ID,
      name: 'Test Tenant',
      email: 'test@laila.works',
      emailVerified: true,
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
    })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        name: 'Test Tenant',
        email: 'test@laila.works',
        emailVerified: true,
        updatedAt: FIXED_TIMESTAMP,
      },
    });
};

const seedPersonas = async (db: ReturnType<typeof getDb>) => {
  await db
    .insert(personasTable)
    .values([
      {
        id: TEST_PERSONA_BACKEND_ID,
        tenantId: TEST_TENANT_ID,
        projectId: TEST_PROJECT_ID,
        name: 'Backend Developer',
        description: 'Develops server-side logic, APIs, and database integrations.',
        systemPrompt: 'You are a backend developer focused on server-side logic and APIs.',
        createdAt: FIXED_TIMESTAMP,
        updatedAt: FIXED_TIMESTAMP,
      },
      {
        id: TEST_PERSONA_QA_ID,
        tenantId: TEST_TENANT_ID,
        projectId: TEST_PROJECT_ID,
        name: 'QA Engineer',
        description: 'Designs and executes test plans, automates regression suites.',
        systemPrompt: 'You are a QA engineer focused on test strategies and automation.',
        createdAt: FIXED_TIMESTAMP,
        updatedAt: FIXED_TIMESTAMP,
      },
    ])
    .onConflictDoNothing();
};

const seedProject = async (db: ReturnType<typeof getDb>) => {
  await db
    .insert(projectsTable)
    .values({
      id: TEST_PROJECT_ID,
      tenantId: TEST_TENANT_ID,
      name: 'Test Project',
      description: 'Integration test project with active lifecycle.',
      lifecycleStatus: 'active',
      workStatus: 'in_progress',
      version: 1,
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
    })
    .onConflictDoNothing();
};

const seedEpics = async (db: ReturnType<typeof getDb>) => {
  await db
    .insert(epicsTable)
    .values([
      {
        id: TEST_EPIC_ACTIVE_ID,
        tenantId: TEST_TENANT_ID,
        projectId: TEST_PROJECT_ID,
        name: 'Active Epic',
        description: 'Epic currently in progress with assigned stories.',
        workStatus: 'in_progress',
        sortOrder: 0,
        version: 1,
        createdAt: FIXED_TIMESTAMP,
        updatedAt: FIXED_TIMESTAMP,
      },
      {
        id: TEST_EPIC_PENDING_ID,
        tenantId: TEST_TENANT_ID,
        projectId: TEST_PROJECT_ID,
        name: 'Pending Epic',
        description: 'Epic not yet started, awaiting prioritisation.',
        workStatus: 'pending',
        sortOrder: 1,
        version: 0,
        createdAt: FIXED_TIMESTAMP,
        updatedAt: FIXED_TIMESTAMP,
      },
    ])
    .onConflictDoNothing();
};

const seedWorker = async (db: ReturnType<typeof getDb>) => {
  await db
    .insert(workersTable)
    .values({
      id: TEST_WORKER_ID,
      tenantId: TEST_TENANT_ID,
      name: 'Test Worker',
      description: 'Integration test worker with known API key.',
      apiKeyHash: TEST_WORKER_API_KEY_HASH,
      apiKeyPrefix: TEST_WORKER_API_KEY_PREFIX,
      isActive: true,
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
    })
    .onConflictDoNothing();
};

const seedWorkerProjectAccess = async (db: ReturnType<typeof getDb>) => {
  await db
    .insert(workerProjectAccessTable)
    .values({
      id: TEST_WORKER_PROJECT_ACCESS_ID,
      tenantId: TEST_TENANT_ID,
      workerId: TEST_WORKER_ID,
      projectId: TEST_PROJECT_ID,
      createdAt: FIXED_TIMESTAMP,
    })
    .onConflictDoNothing();
};

const seedUserStories = async (db: ReturnType<typeof getDb>) => {
  await db
    .insert(userStoriesTable)
    .values([
      {
        id: TEST_STORY_READY_ID,
        tenantId: TEST_TENANT_ID,
        epicId: TEST_EPIC_ACTIVE_ID,
        title: 'Ready Story',
        description: 'Story in ready state, waiting for worker assignment.',
        priority: 'high',
        workStatus: 'ready',
        attempts: 0,
        maxAttempts: 3,
        version: 0,
        createdAt: FIXED_TIMESTAMP,
        updatedAt: FIXED_TIMESTAMP,
      },
      {
        id: TEST_STORY_IN_PROGRESS_ID,
        tenantId: TEST_TENANT_ID,
        epicId: TEST_EPIC_ACTIVE_ID,
        title: 'In-Progress Story',
        description: 'Story currently being executed by the test worker.',
        priority: 'medium',
        workStatus: 'in_progress',
        assignedWorkerId: TEST_WORKER_ID,
        assignedAt: FIXED_TIMESTAMP,
        attempts: 1,
        maxAttempts: 3,
        version: 1,
        createdAt: FIXED_TIMESTAMP,
        updatedAt: FIXED_TIMESTAMP,
      },
      {
        id: TEST_STORY_DONE_ID,
        tenantId: TEST_TENANT_ID,
        epicId: TEST_EPIC_ACTIVE_ID,
        title: 'Done Story',
        description: 'Story that has been completed successfully.',
        priority: 'low',
        workStatus: 'done',
        attempts: 1,
        maxAttempts: 3,
        version: 2,
        createdAt: FIXED_TIMESTAMP,
        updatedAt: FIXED_TIMESTAMP,
      },
    ])
    .onConflictDoNothing();
};

const seedTasks = async (db: ReturnType<typeof getDb>) => {
  await db
    .insert(tasksTable)
    .values([
      {
        id: TEST_TASK_A_ID,
        tenantId: TEST_TENANT_ID,
        userStoryId: TEST_STORY_IN_PROGRESS_ID,
        title: 'Task A — Root',
        description: 'Root task with no prerequisites. Unblocks B.',
        acceptanceCriteria: ['Unit tests pass', 'No type errors'],
        technicalNotes: 'Entry point of the linear DAG (A → B → D).',
        personaId: TEST_PERSONA_BACKEND_ID,
        workStatus: 'done',
        references: [],
        version: 1,
        createdAt: FIXED_TIMESTAMP,
        updatedAt: FIXED_TIMESTAMP,
      },
      {
        id: TEST_TASK_B_ID,
        tenantId: TEST_TENANT_ID,
        userStoryId: TEST_STORY_IN_PROGRESS_ID,
        title: 'Task B — Middle',
        description: 'Depends on A, unblocks D.',
        acceptanceCriteria: ['Integration tests pass'],
        personaId: TEST_PERSONA_BACKEND_ID,
        workStatus: 'in_progress',
        references: [],
        version: 0,
        createdAt: FIXED_TIMESTAMP,
        updatedAt: FIXED_TIMESTAMP,
      },
      {
        id: TEST_TASK_C_ID,
        tenantId: TEST_TENANT_ID,
        userStoryId: TEST_STORY_IN_PROGRESS_ID,
        title: 'Task C — Independent',
        description: 'Independent task with no dependency edges.',
        acceptanceCriteria: ['Code review approved'],
        personaId: TEST_PERSONA_QA_ID,
        workStatus: 'pending',
        references: [],
        version: 0,
        createdAt: FIXED_TIMESTAMP,
        updatedAt: FIXED_TIMESTAMP,
      },
      {
        id: TEST_TASK_D_ID,
        tenantId: TEST_TENANT_ID,
        userStoryId: TEST_STORY_IN_PROGRESS_ID,
        title: 'Task D — Sink',
        description: 'Depends on B. Final task in the linear chain (A → B → D).',
        acceptanceCriteria: ['All acceptance criteria met', 'Deployed to staging'],
        personaId: TEST_PERSONA_BACKEND_ID,
        workStatus: 'pending',
        references: [
          { type: 'doc', url: 'https://example.com/spec', title: 'Task D Specification' },
        ],
        version: 0,
        createdAt: FIXED_TIMESTAMP,
        updatedAt: FIXED_TIMESTAMP,
      },
    ])
    .onConflictDoNothing();
};

const seedDependencyEdges = async (db: ReturnType<typeof getDb>) => {
  // Linear DAG: A -> B -> D  (C is independent, no edges)
  await db
    .insert(taskDependencyEdgesTable)
    .values([
      {
        id: TEST_DEPENDENCY_EDGE_A_B_ID,
        tenantId: TEST_TENANT_ID,
        dependentTaskId: TEST_TASK_B_ID,
        prerequisiteTaskId: TEST_TASK_A_ID,
        createdAt: FIXED_TIMESTAMP,
      },
      {
        id: TEST_DEPENDENCY_EDGE_B_D_ID,
        tenantId: TEST_TENANT_ID,
        dependentTaskId: TEST_TASK_D_ID,
        prerequisiteTaskId: TEST_TASK_B_ID,
        createdAt: FIXED_TIMESTAMP,
      },
    ])
    .onConflictDoNothing();
};

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

const seed = async () => {
  const startMs = Date.now();
  console.log('[testing-seed] Starting...');

  const db = getDb();

  // Insert order respects foreign key constraints:
  // tenant -> personas -> project -> worker -> worker access -> epics -> stories -> tasks -> edges
  await seedTenant(db);
  await seedPersonas(db);
  await seedProject(db);
  await seedWorker(db);
  await seedWorkerProjectAccess(db);
  await seedEpics(db);
  await seedUserStories(db);
  await seedTasks(db);
  await seedDependencyEdges(db);

  const elapsedMs = Date.now() - startMs;
  console.log(`[testing-seed] Completed in ${String(elapsedMs)}ms`);
};

seed().catch((error: unknown) => {
  console.error('[testing-seed] Failed:', error);
  process.exit(1);
});

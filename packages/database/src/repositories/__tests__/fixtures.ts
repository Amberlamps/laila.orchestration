/**
 * @module fixtures
 *
 * Test data factories for repository integration tests.
 *
 * All factories return properly typed objects -- no usage of `any`.
 * Each factory generates unique identifiers via `randomUUID()` to
 * prevent collisions when tests run concurrently or in sequence.
 *
 * The `seedTenant` helper inserts a user row (tenant) into the database,
 * which is required by all foreign key constraints. Since every test
 * runs inside a rolled-back transaction, seeded data is automatically
 * cleaned up.
 */

import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';

import type { PoolDatabase } from '../../client';

// ---------------------------------------------------------------------------
// Tenant (user) seeding
// ---------------------------------------------------------------------------

/**
 * Inserts a user row into the `users` table to serve as a tenant.
 *
 * All entity tables reference `users.id` as their `tenant_id` FK,
 * so a tenant must exist before any entity can be created.
 *
 * @param db - The database client (must be within a transaction)
 * @param overrides - Optional field overrides
 * @returns The inserted user's UUID (also used as tenantId)
 */
export const seedTenant = async (
  db: PoolDatabase,
  overrides: { id?: string; name?: string; email?: string } = {},
): Promise<string> => {
  const id = overrides.id ?? randomUUID();
  const name = overrides.name ?? `Test User ${id.slice(0, 8)}`;
  const email = overrides.email ?? `test-${randomUUID()}@example.com`;

  await db.execute(
    sql`INSERT INTO users (id, name, email, email_verified) VALUES (${id}, ${name}, ${email}, true)`,
  );

  return id;
};

// ---------------------------------------------------------------------------
// Project fixtures
// ---------------------------------------------------------------------------

export interface TestProjectData {
  name: string;
  description: string | null;
}

/**
 * Generates test data for creating a project.
 * Does NOT insert into the database -- pass to `projectRepo.create()`.
 */
export const makeProjectData = (overrides: Partial<TestProjectData> = {}): TestProjectData => ({
  name: overrides.name ?? `Test Project ${randomUUID().slice(0, 8)}`,
  description: overrides.description ?? 'Integration test project',
});

// ---------------------------------------------------------------------------
// Epic fixtures
// ---------------------------------------------------------------------------

export interface TestEpicData {
  name: string;
  description: string | null;
}

/**
 * Generates test data for creating an epic.
 * Does NOT insert into the database -- pass to `epicRepo.create()`.
 */
export const makeEpicData = (overrides: Partial<TestEpicData> = {}): TestEpicData => ({
  name: overrides.name ?? `Test Epic ${randomUUID().slice(0, 8)}`,
  description: overrides.description ?? 'Integration test epic',
});

// ---------------------------------------------------------------------------
// Story fixtures
// ---------------------------------------------------------------------------

export interface TestStoryData {
  title: string;
  description: string | null;
  priority: string;
  maxAttempts: number;
}

/**
 * Generates test data for creating a user story.
 * Does NOT insert into the database -- pass to `storyRepo.create()`.
 */
export const makeStoryData = (overrides: Partial<TestStoryData> = {}): TestStoryData => ({
  title: overrides.title ?? `Test Story ${randomUUID().slice(0, 8)}`,
  description: overrides.description ?? 'Integration test story',
  priority: overrides.priority ?? 'medium',
  maxAttempts: overrides.maxAttempts ?? 3,
});

// ---------------------------------------------------------------------------
// Task fixtures
// ---------------------------------------------------------------------------

export interface TestTaskData {
  title: string;
  description: string | null;
  acceptanceCriteria: string[];
  technicalNotes: string | null;
  personaId: string | null;
}

/**
 * Generates test data for creating a task.
 * Does NOT insert into the database -- pass to `taskRepo.create()`.
 */
export const makeTaskData = (overrides: Partial<TestTaskData> = {}): TestTaskData => ({
  title: overrides.title ?? `Test Task ${randomUUID().slice(0, 8)}`,
  description: overrides.description ?? 'Integration test task',
  acceptanceCriteria: overrides.acceptanceCriteria ?? ['Criterion 1', 'Criterion 2'],
  technicalNotes: overrides.technicalNotes ?? null,
  personaId: overrides.personaId ?? null,
});

// ---------------------------------------------------------------------------
// Worker fixtures
// ---------------------------------------------------------------------------

export interface TestWorkerData {
  name: string;
  description: string | undefined;
}

/**
 * Generates test data for creating a worker.
 * Does NOT insert into the database -- pass to `workerRepo.create()`.
 */
export const makeWorkerData = (overrides: Partial<TestWorkerData> = {}): TestWorkerData => ({
  name: overrides.name ?? `Test Worker ${randomUUID().slice(0, 8)}`,
  description: overrides.description ?? 'Integration test worker',
});

// ---------------------------------------------------------------------------
// Persona fixtures
// ---------------------------------------------------------------------------

/** Default project ID used by persona fixtures when no real project is seeded. */
const DEFAULT_PERSONA_PROJECT_ID = '00000000-0000-0000-0000-000000000001';

export interface TestPersonaData {
  name: string;
  projectId: string;
  systemPrompt: string;
  description: string | null;
}

/**
 * Generates test data for creating a persona.
 * Does NOT insert into the database -- pass to `personaRepo.create()`.
 *
 * Note: `projectId` defaults to a placeholder UUID. Integration tests that
 * enforce FK constraints should override it with a real project ID.
 */
export const makePersonaData = (overrides: Partial<TestPersonaData> = {}): TestPersonaData => ({
  name: overrides.name ?? `Test Persona ${randomUUID().slice(0, 8)}`,
  projectId: overrides.projectId ?? DEFAULT_PERSONA_PROJECT_ID,
  systemPrompt: overrides.systemPrompt ?? 'You are a helpful test persona.',
  description: overrides.description ?? 'Integration test persona description',
});

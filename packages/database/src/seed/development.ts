/**
 * Development seed script -- populates the database with realistic sample data.
 *
 * Run with: pnpm --filter @laila/database db:seed:dev
 *
 * This seed is idempotent: it clears existing seeded data before inserting.
 * Auth tables (users, sessions, accounts) are NOT cleared; the test user is
 * upserted by email to avoid duplicates.
 *
 * @module seed/development
 */

import { eq, sql } from 'drizzle-orm';

import { getDb } from '../client';
import { createWorkerRepository } from '../repositories';
import * as schema from '../schema';

import {
  PERSONA_DEFINITIONS,
  WORKER_DEFINITIONS,
  PROJECT_CONFIGS,
  TEST_USER,
  type EpicConfig,
  type StoryConfig,
  type TaskConfig,
} from './seed-data';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SeedContext {
  tenantId: string;
  personaIds: string[];
  workerIds: string[];
  /** All task IDs keyed by `{projectIdx}-{epicIdx}-{storyIdx}-{taskIdx}` */
  taskIdMap: Map<string, string>;
  /** Track stories that need attempt history */
  storiesWithAttempts: Array<{ storyId: string; workerId: string }>;
}

interface SeedSummary {
  projects: number;
  epics: number;
  stories: number;
  tasks: number;
  personas: number;
  workers: number;
  dependencyEdges: number;
  attemptRecords: number;
  workerKeys: Array<{ name: string; rawApiKey: string }>;
}

// Trivially-true predicate used to satisfy the drizzle/enforce-delete-with-where rule
// when intentionally deleting all rows during seed cleanup.
const ALWAYS_TRUE = sql`1 = 1`;

// ---------------------------------------------------------------------------
// Clear existing data
// ---------------------------------------------------------------------------

const clearSeededData = async (db: ReturnType<typeof getDb>) => {
  console.log('Clearing existing seed data...');

  // Delete in reverse dependency order to avoid FK violations
  await db.delete(schema.attemptHistoryTable).where(ALWAYS_TRUE);
  await db.delete(schema.taskDependencyEdgesTable).where(ALWAYS_TRUE);
  await db.delete(schema.tasksTable).where(ALWAYS_TRUE);
  await db.delete(schema.userStoriesTable).where(ALWAYS_TRUE);
  await db.delete(schema.epicsTable).where(ALWAYS_TRUE);
  await db.delete(schema.workerProjectAccessTable).where(ALWAYS_TRUE);
  await db.delete(schema.apiKeysTable).where(ALWAYS_TRUE);
  await db.delete(schema.workersTable).where(ALWAYS_TRUE);
  await db.delete(schema.projectsTable).where(ALWAYS_TRUE);
  await db.delete(schema.personasTable).where(ALWAYS_TRUE);
};

// ---------------------------------------------------------------------------
// Upsert test user
// ---------------------------------------------------------------------------

const upsertTestUser = async (db: ReturnType<typeof getDb>): Promise<string> => {
  const existing = await db
    .select({ id: schema.usersTable.id })
    .from(schema.usersTable)
    .where(eq(schema.usersTable.email, TEST_USER.email))
    .limit(1);

  if (existing[0]) return existing[0].id;

  const inserted = await db
    .insert(schema.usersTable)
    .values(TEST_USER)
    .returning({ id: schema.usersTable.id });

  const row = inserted[0];
  if (!row) throw new Error('Failed to insert test user');
  return row.id;
};

// ---------------------------------------------------------------------------
// Seed personas
// ---------------------------------------------------------------------------

const seedPersonas = async (db: ReturnType<typeof getDb>, tenantId: string): Promise<string[]> => {
  const results = await db
    .insert(schema.personasTable)
    .values(PERSONA_DEFINITIONS.map((p) => ({ ...p, tenantId })))
    .returning({ id: schema.personasTable.id });

  return results.map((r) => r.id);
};

// ---------------------------------------------------------------------------
// Seed workers via repository (handles API key generation)
// ---------------------------------------------------------------------------

const seedWorkers = async (
  db: ReturnType<typeof getDb>,
  tenantId: string,
): Promise<{ workerIds: string[]; workerKeys: SeedSummary['workerKeys'] }> => {
  const workerRepo = createWorkerRepository(db);
  const workerIds: string[] = [];
  const workerKeys: SeedSummary['workerKeys'] = [];

  for (const def of WORKER_DEFINITIONS) {
    const { worker, rawApiKey } = await workerRepo.create(tenantId, {
      name: def.name,
      description: def.description,
    });
    workerIds.push(worker.id);
    workerKeys.push({ name: def.name, rawApiKey });
  }

  return { workerIds, workerKeys };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getFirstId = (rows: Array<{ id: string }>, label: string): string => {
  const row = rows[0];
  if (!row) throw new Error(`Failed to insert ${label}`);
  return row.id;
};

// ---------------------------------------------------------------------------
// Seed tasks for a single story
// ---------------------------------------------------------------------------

const seedTasks = async (
  db: ReturnType<typeof getDb>,
  tenantId: string,
  storyId: string,
  taskConfigs: TaskConfig[],
  personaIds: string[],
  taskIdMap: Map<string, string>,
  pathPrefix: string,
): Promise<number> => {
  let count = 0;

  for (let ti = 0; ti < taskConfigs.length; ti++) {
    const tc = taskConfigs[ti];
    if (!tc) continue;
    const inserted = await db
      .insert(schema.tasksTable)
      .values({
        tenantId,
        userStoryId: storyId,
        title: tc.title,
        description: tc.description,
        acceptanceCriteria: tc.acceptanceCriteria,
        technicalNotes: tc.technicalNotes,
        personaId: personaIds[tc.personaIndex],
        workStatus: tc.workStatus,
      })
      .returning({ id: schema.tasksTable.id });

    taskIdMap.set(`${pathPrefix}-${String(ti)}`, getFirstId(inserted, 'task'));
    count++;
  }

  return count;
};

// ---------------------------------------------------------------------------
// Seed stories for a single epic
// ---------------------------------------------------------------------------

const seedStories = async (
  db: ReturnType<typeof getDb>,
  tenantId: string,
  epicId: string,
  storyConfigs: StoryConfig[],
  ctx: SeedContext,
  pathPrefix: string,
): Promise<{ storyCount: number; taskCount: number }> => {
  let storyCount = 0;
  let taskCount = 0;

  for (let si = 0; si < storyConfigs.length; si++) {
    const sc = storyConfigs[si];
    if (!sc) continue;
    const assignedWorkerId = sc.assigned ? ctx.workerIds[0] : undefined;

    const inserted = await db
      .insert(schema.userStoriesTable)
      .values({
        tenantId,
        epicId,
        title: sc.title,
        description: sc.description,
        priority: sc.priority,
        workStatus: sc.workStatus,
        assignedWorkerId,
        assignedAt: assignedWorkerId ? new Date() : undefined,
        attempts: sc.hasAttemptHistory ? 2 : sc.assigned ? 1 : 0,
      })
      .returning({ id: schema.userStoriesTable.id });

    const storyId = getFirstId(inserted, 'story');
    storyCount++;

    if (sc.hasAttemptHistory && ctx.workerIds[0]) {
      ctx.storiesWithAttempts.push({ storyId, workerId: ctx.workerIds[0] });
    }

    const storyPath = `${pathPrefix}-${String(si)}`;
    taskCount += await seedTasks(
      db,
      tenantId,
      storyId,
      sc.tasks,
      ctx.personaIds,
      ctx.taskIdMap,
      storyPath,
    );
  }

  return { storyCount, taskCount };
};

// ---------------------------------------------------------------------------
// Seed epics for a single project
// ---------------------------------------------------------------------------

const seedEpics = async (
  db: ReturnType<typeof getDb>,
  tenantId: string,
  projectId: string,
  epicConfigs: EpicConfig[],
  ctx: SeedContext,
  projectIdx: number,
): Promise<{ epicCount: number; storyCount: number; taskCount: number }> => {
  let epicCount = 0;
  let storyCount = 0;
  let taskCount = 0;

  for (let ei = 0; ei < epicConfigs.length; ei++) {
    const ec = epicConfigs[ei];
    if (!ec) continue;
    const inserted = await db
      .insert(schema.epicsTable)
      .values({
        tenantId,
        projectId,
        name: ec.name,
        description: ec.description,
        workStatus: ec.workStatus,
        sortOrder: ei,
      })
      .returning({ id: schema.epicsTable.id });

    epicCount++;

    const epicPath = `${String(projectIdx)}-${String(ei)}`;
    const result = await seedStories(
      db,
      tenantId,
      getFirstId(inserted, 'epic'),
      ec.stories,
      ctx,
      epicPath,
    );
    storyCount += result.storyCount;
    taskCount += result.taskCount;
  }

  return { epicCount, storyCount, taskCount };
};

// ---------------------------------------------------------------------------
// Seed dependency edges (DAG patterns)
// ---------------------------------------------------------------------------

const seedDependencyEdges = async (
  db: ReturnType<typeof getDb>,
  tenantId: string,
  taskIdMap: Map<string, string>,
): Promise<number> => {
  const edges: Array<{ dependentTaskId: string; prerequisiteTaskId: string }> = [];

  const addEdge = (dependentPath: string, prerequisitePath: string) => {
    const depId = taskIdMap.get(dependentPath);
    const preId = taskIdMap.get(prerequisitePath);
    if (depId && preId) {
      edges.push({ dependentTaskId: depId, prerequisiteTaskId: preId });
    }
  };

  // Project 0, Epic 0: "Product Catalog Overhaul"
  // Story 0 (faceted search): Linear chain A -> B -> C
  addEdge('0-0-0-1', '0-0-0-0'); // query builder depends on index schema
  addEdge('0-0-0-2', '0-0-0-1'); // pagination depends on query builder

  // Story 1 (product grid): Linear chain
  addEdge('0-0-1-1', '0-0-1-0'); // virtual scrolling depends on ProductCard

  // Story 2 (search tests): Fan-in -- test fixtures must exist before filter and pagination tests
  addEdge('0-0-2-1', '0-0-2-0'); // facet tests depend on fixtures
  addEdge('0-0-2-2', '0-0-2-0'); // pagination tests depend on fixtures (fan-out from fixtures)

  // Project 0, Epic 1: "Checkout Flow Optimization"
  // Story 1 (payment processing): Fan-out then fan-in
  // Stripe intents and webhook both needed before security audit
  addEdge('0-1-1-1', '0-1-1-0'); // webhook depends on Stripe intents
  addEdge('0-1-1-2', '0-1-1-0'); // security audit depends on Stripe intents (fan-out)
  addEdge('0-1-1-2', '0-1-1-1'); // security audit depends on webhook handler (fan-in)

  // Project 0, Epic 2: "Performance Monitoring"
  // Story 0: metrics endpoint depends on vitals integration
  addEdge('0-2-0-1', '0-2-0-0'); // ingestion endpoint depends on web-vitals integration

  // Story 1 (synthetic monitoring - failed): PagerDuty depends on check scenarios
  addEdge('0-2-1-1', '0-2-1-0'); // PagerDuty alerting depends on synthetic check scenarios

  // Project 1, Epic 0: "Service Decomposition"
  // Story 0 (user service): Linear chain
  addEdge('1-0-0-1', '1-0-0-0'); // db migration depends on API contract
  addEdge('1-0-0-2', '1-0-0-1'); // integration tests depend on migration

  // Story 1 (notification): Linear chain
  addEdge('1-0-1-1', '1-0-1-0'); // delivery pipeline depends on event schema

  // Project 1, Epic 1: "Gateway Configuration"
  // Story 0: rate limiting depends on route mappings
  addEdge('1-1-0-1', '1-1-0-0');

  // Story 1: fallback handlers depend on circuit breaker thresholds
  addEdge('1-1-1-1', '1-1-1-0');

  // Project 2, Epic 0: "Authentication Flow"
  // Story 0 (biometric): tests depend on both module and token storage (fan-in)
  addEdge('2-0-0-2', '2-0-0-0'); // tests depend on biometric module
  addEdge('2-0-0-2', '2-0-0-1'); // tests depend on token storage

  // Story 2 (session mgmt): notification depends on refresh interceptor
  addEdge('2-0-2-1', '2-0-2-0');

  // Project 2, Epic 1: "Product Browsing"
  // Story 0: offline caching depends on product list
  addEdge('2-1-0-1', '2-1-0-0');

  // Story 1: specs table depends on image carousel (both part of detail screen)
  addEdge('2-1-1-1', '2-1-1-0');

  if (edges.length === 0) return 0;

  await db.insert(schema.taskDependencyEdgesTable).values(edges.map((e) => ({ tenantId, ...e })));

  return edges.length;
};

// ---------------------------------------------------------------------------
// Seed attempt history
// ---------------------------------------------------------------------------

const seedAttemptHistory = async (
  db: ReturnType<typeof getDb>,
  tenantId: string,
  storiesWithAttempts: SeedContext['storiesWithAttempts'],
): Promise<number> => {
  if (storiesWithAttempts.length === 0) return 0;

  let count = 0;
  const now = new Date();

  for (const { storyId, workerId } of storiesWithAttempts) {
    // Attempt 1: failed 2 hours ago
    const failedStart = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const failedEnd = new Date(failedStart.getTime() + 15 * 60 * 1000);

    await db.insert(schema.attemptHistoryTable).values({
      tenantId,
      userStoryId: storyId,
      workerId,
      attemptNumber: 1,
      startedAt: failedStart,
      completedAt: failedEnd,
      status: 'failed',
      reason:
        'Worker encountered a timeout connecting to the Elasticsearch cluster during index creation. ' +
        'The cluster was in a yellow state due to unassigned replica shards.',
      cost: '0.4200',
      durationMs: 15 * 60 * 1000,
    });

    // Attempt 2: currently in progress
    const currentStart = new Date(now.getTime() - 30 * 60 * 1000);

    await db.insert(schema.attemptHistoryTable).values({
      tenantId,
      userStoryId: storyId,
      workerId,
      attemptNumber: 2,
      startedAt: currentStart,
      status: 'in_progress',
    });

    count += 2;
  }

  return count;
};

// ---------------------------------------------------------------------------
// Seed worker project access
// ---------------------------------------------------------------------------

const seedWorkerProjectAccess = async (
  db: ReturnType<typeof getDb>,
  tenantId: string,
  workerIds: string[],
  projectIds: string[],
) => {
  const workerRepo = createWorkerRepository(db);

  for (let pi = 0; pi < PROJECT_CONFIGS.length; pi++) {
    const config = PROJECT_CONFIGS[pi];
    const projectId = projectIds[pi];
    if (!config || !projectId) continue;

    for (const workerIdx of config.workerAccessIndices) {
      const workerId = workerIds[workerIdx];
      if (workerId) {
        await workerRepo.grantProjectAccess(tenantId, workerId, projectId);
      }
    }
  }
};

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

const seed = async () => {
  const db = getDb();

  console.log('=== Development Seed ===\n');

  // 1. Clear existing data
  await clearSeededData(db);

  // 2. Upsert test user (tenant)
  const tenantId = await upsertTestUser(db);
  console.log(`Tenant (test user): ${tenantId}`);

  // 3. Create personas
  const personaIds = await seedPersonas(db, tenantId);
  console.log(`Created ${String(personaIds.length)} personas`);

  // 4. Create workers
  const { workerIds, workerKeys } = await seedWorkers(db, tenantId);
  console.log(`Created ${String(workerIds.length)} workers`);

  // 5. Seed project hierarchy
  const ctx: SeedContext = {
    tenantId,
    personaIds,
    workerIds,
    taskIdMap: new Map(),
    storiesWithAttempts: [],
  };

  const summary: SeedSummary = {
    projects: 0,
    epics: 0,
    stories: 0,
    tasks: 0,
    personas: personaIds.length,
    workers: workerIds.length,
    dependencyEdges: 0,
    attemptRecords: 0,
    workerKeys,
  };

  const projectIds: string[] = [];

  for (let pi = 0; pi < PROJECT_CONFIGS.length; pi++) {
    const pc = PROJECT_CONFIGS[pi];
    if (!pc) continue;
    const inserted = await db
      .insert(schema.projectsTable)
      .values({
        tenantId,
        name: pc.name,
        description: pc.description,
        lifecycleStatus: pc.lifecycleStatus,
        workStatus: pc.workStatus,
      })
      .returning({ id: schema.projectsTable.id });

    const projectId = getFirstId(inserted, 'project');
    projectIds.push(projectId);
    summary.projects++;

    const result = await seedEpics(db, tenantId, projectId, pc.epics, ctx, pi);
    summary.epics += result.epicCount;
    summary.stories += result.storyCount;
    summary.tasks += result.taskCount;
  }

  // 6. Create dependency edges
  summary.dependencyEdges = await seedDependencyEdges(db, tenantId, ctx.taskIdMap);
  console.log(`Created ${String(summary.dependencyEdges)} dependency edges`);

  // 7. Create attempt history
  summary.attemptRecords = await seedAttemptHistory(db, tenantId, ctx.storiesWithAttempts);
  console.log(`Created ${String(summary.attemptRecords)} attempt history records`);

  // 8. Grant worker project access
  await seedWorkerProjectAccess(db, tenantId, workerIds, projectIds);
  console.log('Granted worker project access\n');

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------

  console.log('=== Seed Summary ===');
  console.log(`  Projects:          ${String(summary.projects)}`);
  console.log(`  Epics:             ${String(summary.epics)}`);
  console.log(`  User Stories:      ${String(summary.stories)}`);
  console.log(`  Tasks:             ${String(summary.tasks)}`);
  console.log(`  Personas:          ${String(summary.personas)}`);
  console.log(`  Workers:           ${String(summary.workers)}`);
  console.log(`  Dependency Edges:  ${String(summary.dependencyEdges)}`);
  console.log(`  Attempt Records:   ${String(summary.attemptRecords)}`);
  console.log('');
  console.log('Worker API keys (development only — do NOT use in production):');
  for (const wk of summary.workerKeys) {
    console.log(`  ${wk.name.padEnd(16)} ${wk.rawApiKey}`);
  }
  console.log('\nDevelopment seed complete!');
};

seed().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});

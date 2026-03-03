/**
 * @module assign.concurrency.test
 *
 * DB-backed integration and concurrency tests for the work assignment endpoint:
 *
 *   POST /api/v1/orchestration/assign
 *
 * These tests use real database connections, real repositories, and real domain
 * logic. Only the authentication layer (Better Auth sessions and API key
 * validation) is mocked to provide controlled worker identities.
 *
 * The `getDb` singleton is overridden to return a test pool database so the
 * handler's transactions operate against the real schema.
 *
 * Test data is seeded per-test and cleaned up in afterEach to guarantee
 * isolation. Tests are skipped when no DATABASE_URL is available.
 *
 * Test coverage:
 * - Concurrency: exactly-one assignment when two workers race
 * - All three response types: "assigned", "blocked", "all_complete"
 * - Priority-based story selection (highest priority first)
 * - Tiebreaker selection (oldest story when priorities equal)
 * - Re-assignment behavior (same story on retry)
 * - Authorization checks: project access denied, project not found, project not ready
 * - Response structure validation for all response types
 * - Empty project handling (zero stories → all_complete)
 */

import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockRequest, createMockResponse } from '@/__tests__/helpers/mock-api';

import type { MockApiResponse } from '@/__tests__/helpers/mock-api';
import type { PoolDatabase } from '@laila/database';
import type { NextApiRequest, NextApiResponse } from 'next';

// ---------------------------------------------------------------------------
// Environment detection
// ---------------------------------------------------------------------------

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const HAS_DATABASE = Boolean(TEST_DATABASE_URL);

// ---------------------------------------------------------------------------
// Pool connection (created lazily, shared across all tests)
// ---------------------------------------------------------------------------

let _poolDb: PoolDatabase | null = null;

const getTestDb = (): PoolDatabase => {
  if (!_poolDb) {
    if (!TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL or DATABASE_URL must be set for DB-backed tests');
    }
    // Use the real pool client factory from @laila/database.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createPoolClient } = require('@laila/database') as typeof import('@laila/database');
    _poolDb = createPoolClient(TEST_DATABASE_URL);
  }
  return _poolDb;
};

// ---------------------------------------------------------------------------
// Mock setup — only auth and getDb; everything else is real
// ---------------------------------------------------------------------------

// Track which worker auth context to return per request.
// The mock inspects the Authorization header to route to the correct context.
let workerAuthContextMap: Map<string, WorkerAuthContextForTest> = new Map();

interface WorkerAuthContextForTest {
  type: 'agent';
  workerId: string;
  workerName: string;
  tenantId: string;
  projectAccess: string[];
}

// Mock Better Auth sessions (never used — we only test agent auth)
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => null),
    },
  },
}));

// Mock API key validator to return controlled worker auth contexts
vi.mock('@/lib/middleware/api-key-validator', () => ({
  validateApiKey: vi.fn(async (req: NextApiRequest) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    const token = authHeader.replace('Bearer ', '');
    return workerAuthContextMap.get(token) ?? null;
  }),
}));

// Override getDb to return the test pool DB; keep all other exports real
vi.mock('@laila/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@laila/database')>();
  return {
    ...actual,
    getDb: vi.fn(() => getTestDb()),
  };
});

// Import handler AFTER mocks are registered
const { default: handler } = await import('@/pages/api/v1/orchestration/assign');

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

const seedTenant = async (db: PoolDatabase, id?: string): Promise<string> => {
  const tenantId = id ?? randomUUID();
  await db.execute(
    sql`INSERT INTO users (id, name, email, email_verified)
        VALUES (${tenantId}, ${`Test User ${tenantId.slice(0, 8)}`}, ${`test-${randomUUID()}@example.com`}, true)`,
  );
  return tenantId;
};

const seedProject = async (
  db: PoolDatabase,
  tenantId: string,
  overrides: { lifecycleStatus?: string } = {},
): Promise<{ id: string; name: string }> => {
  const id = randomUUID();
  const name = `Test Project ${id.slice(0, 8)}`;
  const status = overrides.lifecycleStatus ?? 'ready';
  await db.execute(
    sql`INSERT INTO projects (id, tenant_id, name, lifecycle_status, work_status, version)
        VALUES (${id}, ${tenantId}, ${name}, ${status}, ${'pending'}, ${1})`,
  );
  return { id, name };
};

const seedEpic = async (
  db: PoolDatabase,
  tenantId: string,
  projectId: string,
): Promise<string> => {
  const id = randomUUID();
  await db.execute(
    sql`INSERT INTO epics (id, tenant_id, project_id, name, work_status, sort_order, version)
        VALUES (${id}, ${tenantId}, ${projectId}, ${`Test Epic ${id.slice(0, 8)}`}, ${'pending'}, ${0}, ${1})`,
  );
  return id;
};

const seedStory = async (
  db: PoolDatabase,
  tenantId: string,
  epicId: string,
  overrides: {
    workStatus?: string;
    priority?: string;
    assignedWorkerId?: string | null;
    createdAt?: Date;
  } = {},
): Promise<{ id: string; version: number }> => {
  const id = randomUUID();
  const workStatus = overrides.workStatus ?? 'ready';
  const priority = overrides.priority ?? 'medium';
  const assignedWorkerId = overrides.assignedWorkerId ?? null;
  const createdAt = overrides.createdAt ?? new Date();
  await db.execute(
    sql`INSERT INTO user_stories (id, tenant_id, epic_id, title, work_status, priority, assigned_worker_id, attempts, max_attempts, version, created_at, updated_at)
        VALUES (${id}, ${tenantId}, ${epicId}, ${`Test Story ${id.slice(0, 8)}`}, ${workStatus}, ${priority}, ${assignedWorkerId}, ${0}, ${3}, ${1}, ${createdAt}, ${createdAt})`,
  );
  return { id, version: 1 };
};

const seedWorker = async (
  db: PoolDatabase,
  tenantId: string,
): Promise<string> => {
  const id = randomUUID();
  // Workers need an API key hash/prefix for the table constraints.
  // These are dummy values since auth is mocked.
  const prefix = `lw_${randomUUID().slice(0, 8)}`;
  const hash = randomUUID(); // dummy hash
  await db.execute(
    sql`INSERT INTO workers (id, tenant_id, name, api_key_prefix, api_key_hash, is_active)
        VALUES (${id}, ${tenantId}, ${`Worker ${id.slice(0, 8)}`}, ${prefix}, ${hash}, ${true})`,
  );
  return id;
};

const seedTask = async (
  db: PoolDatabase,
  tenantId: string,
  storyId: string,
  overrides: { personaId?: string | null; workStatus?: string } = {},
): Promise<string> => {
  const id = randomUUID();
  const personaId = overrides.personaId ?? null;
  const workStatus = overrides.workStatus ?? 'pending';
  await db.execute(
    sql`INSERT INTO tasks (id, tenant_id, user_story_id, title, description, work_status, persona_id, version)
        VALUES (${id}, ${tenantId}, ${storyId}, ${`Task ${id.slice(0, 8)}`}, ${'Test task description'}, ${workStatus}, ${personaId}, ${1})`,
  );
  return id;
};

const seedPersona = async (
  db: PoolDatabase,
  tenantId: string,
): Promise<{ id: string; name: string }> => {
  const id = randomUUID();
  const name = `Persona ${id.slice(0, 8)}`;
  await db.execute(
    sql`INSERT INTO personas (id, tenant_id, name, description, system_prompt, version)
        VALUES (${id}, ${tenantId}, ${name}, ${'Test persona'}, ${'You are a test persona.'}, ${1})`,
  );
  return { id, name };
};

// ---------------------------------------------------------------------------
// Cleanup helper — deletes all data for a tenant
// ---------------------------------------------------------------------------

const cleanupTenant = async (db: PoolDatabase, tenantId: string): Promise<void> => {
  await db.execute(sql`DELETE FROM attempt_history WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM dependency_edges WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM tasks WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM user_stories WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM epics WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM worker_project_access WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM personas WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM projects WHERE tenant_id = ${tenantId}`);
  await db.execute(sql`DELETE FROM workers WHERE tenant_id = ${tenantId}`);
};

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

const makeAssignRequest = (
  projectId: string,
  apiKeyToken: string,
): NextApiRequest => {
  return createMockRequest({
    method: 'POST',
    url: '/api/v1/orchestration/assign',
    body: { project_id: projectId },
    headers: { authorization: `Bearer ${apiKeyToken}` },
  });
};

const registerWorkerAuth = (
  token: string,
  workerId: string,
  tenantId: string,
  projectAccess: string[],
): void => {
  workerAuthContextMap.set(token, {
    type: 'agent',
    workerId,
    workerName: `Worker ${workerId.slice(0, 8)}`,
    tenantId,
    projectAccess,
  });
};

const callHandler = async (
  req: NextApiRequest,
): Promise<MockApiResponse> => {
  const res = createMockResponse();
  await handler(req, res as unknown as NextApiResponse);
  return res;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!HAS_DATABASE)('POST /api/v1/orchestration/assign (DB-backed)', () => {
  let tenantId: string;

  beforeAll(async () => {
    const db = getTestDb();
    // Verify connection works
    await db.execute(sql`SELECT 1`);
    // Seed a shared tenant for all tests
    tenantId = await seedTenant(db);
  });

  beforeEach(() => {
    workerAuthContextMap = new Map();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    const db = getTestDb();
    // Clean up all test data except the tenant user itself
    await cleanupTenant(db, tenantId);
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    if (_poolDb) {
      await _poolDb.execute(sql`DELETE FROM users WHERE id = ${tenantId}`);
    }
    if (_pool) {
      await _pool.end();
      _pool = null;
      _poolDb = null;
    }
  });

  // -----------------------------------------------------------------------
  // Concurrency: exactly-one assignment when two workers race
  // -----------------------------------------------------------------------

  describe('concurrency', () => {
    it('exactly one worker gets assigned, the other gets a conflict', async () => {
      const db = getTestDb();

      // Seed: project (ready), epic, one eligible story, two workers
      const project = await seedProject(db, tenantId);
      const epicId = await seedEpic(db, tenantId, project.id);
      await seedStory(db, tenantId, epicId, { priority: 'high' });

      const worker1Id = await seedWorker(db, tenantId);
      const worker2Id = await seedWorker(db, tenantId);

      const token1 = `lw_test_${randomUUID().slice(0, 12)}`;
      const token2 = `lw_test_${randomUUID().slice(0, 12)}`;
      registerWorkerAuth(token1, worker1Id, tenantId, [project.id]);
      registerWorkerAuth(token2, worker2Id, tenantId, [project.id]);

      // Fire both requests in parallel
      const [res1, res2] = await Promise.all([
        callHandler(makeAssignRequest(project.id, token1)),
        callHandler(makeAssignRequest(project.id, token2)),
      ]);

      const status1 = res1.getStatusCode();
      const status2 = res2.getStatusCode();

      // Exactly one should succeed (200) and one should conflict (409)
      const statuses = [status1, status2].sort();
      expect(statuses).toEqual([200, 409]);

      // The winner gets an "assigned" response
      const winner = status1 === 200 ? res1 : res2;
      const winnerBody = winner.getJsonBody() as { data: { type: string } };
      expect(winnerBody.data.type).toBe('assigned');

      // The loser gets an OPTIMISTIC_LOCK_CONFLICT error
      const loser = status1 === 409 ? res1 : res2;
      const loserBody = loser.getJsonBody() as { error: { code: string } };
      expect(loserBody.error.code).toBe('OPTIMISTIC_LOCK_CONFLICT');
    });
  });

  // -----------------------------------------------------------------------
  // Response types
  // -----------------------------------------------------------------------

  describe('response types', () => {
    it('returns "assigned" when an eligible story exists', async () => {
      const db = getTestDb();
      const project = await seedProject(db, tenantId);
      const epicId = await seedEpic(db, tenantId, project.id);
      await seedStory(db, tenantId, epicId, { priority: 'high' });

      const workerId = await seedWorker(db, tenantId);
      const token = `lw_test_${randomUUID().slice(0, 12)}`;
      registerWorkerAuth(token, workerId, tenantId, [project.id]);

      const res = await callHandler(makeAssignRequest(project.id, token));

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: { type: string } };
      expect(body.data.type).toBe('assigned');
    });

    it('returns "blocked" when all stories are in-progress or blocked', async () => {
      const db = getTestDb();
      const project = await seedProject(db, tenantId);
      const epicId = await seedEpic(db, tenantId, project.id);

      // Create two stories: one in_progress (assigned to another worker), one blocked
      const otherWorkerId = await seedWorker(db, tenantId);
      await seedStory(db, tenantId, epicId, {
        workStatus: 'in_progress',
        assignedWorkerId: otherWorkerId,
      });
      await seedStory(db, tenantId, epicId, { workStatus: 'blocked' });

      const workerId = await seedWorker(db, tenantId);
      const token = `lw_test_${randomUUID().slice(0, 12)}`;
      registerWorkerAuth(token, workerId, tenantId, [project.id]);

      const res = await callHandler(makeAssignRequest(project.id, token));

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: { type: string } };
      expect(body.data.type).toBe('blocked');
    });

    it('returns "all_complete" when all stories are done', async () => {
      const db = getTestDb();
      const project = await seedProject(db, tenantId);
      const epicId = await seedEpic(db, tenantId, project.id);
      await seedStory(db, tenantId, epicId, { workStatus: 'done' });
      await seedStory(db, tenantId, epicId, { workStatus: 'skipped' });

      const workerId = await seedWorker(db, tenantId);
      const token = `lw_test_${randomUUID().slice(0, 12)}`;
      registerWorkerAuth(token, workerId, tenantId, [project.id]);

      const res = await callHandler(makeAssignRequest(project.id, token));

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: { type: string } };
      expect(body.data.type).toBe('all_complete');
    });

    it('returns "all_complete" for a project with zero stories', async () => {
      const db = getTestDb();
      const project = await seedProject(db, tenantId);
      await seedEpic(db, tenantId, project.id);

      const workerId = await seedWorker(db, tenantId);
      const token = `lw_test_${randomUUID().slice(0, 12)}`;
      registerWorkerAuth(token, workerId, tenantId, [project.id]);

      const res = await callHandler(makeAssignRequest(project.id, token));

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as {
        data: { type: string; completed_stories: number; total_stories: number };
      };
      expect(body.data.type).toBe('all_complete');
      expect(body.data.completed_stories).toBe(0);
      expect(body.data.total_stories).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Priority and selection
  // -----------------------------------------------------------------------

  describe('priority and selection', () => {
    it('selects the highest-priority story when multiple are eligible', async () => {
      const db = getTestDb();
      const project = await seedProject(db, tenantId);
      const epicId = await seedEpic(db, tenantId, project.id);

      // Create stories with different priorities — high should win over medium/low
      await seedStory(db, tenantId, epicId, { priority: 'low' });
      await seedStory(db, tenantId, epicId, { priority: 'medium' });
      const highStory = await seedStory(db, tenantId, epicId, { priority: 'high' });

      const workerId = await seedWorker(db, tenantId);
      const token = `lw_test_${randomUUID().slice(0, 12)}`;
      registerWorkerAuth(token, workerId, tenantId, [project.id]);

      const res = await callHandler(makeAssignRequest(project.id, token));

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as {
        data: { type: string; story: { id: string; priority: string } };
      };
      expect(body.data.type).toBe('assigned');
      expect(body.data.story.id).toBe(highStory.id);
    });

    it('selects the oldest story when priorities are equal', async () => {
      const db = getTestDb();
      const project = await seedProject(db, tenantId);
      const epicId = await seedEpic(db, tenantId, project.id);

      // Create two stories with the same priority, different creation times
      const oldDate = new Date('2020-01-01T00:00:00Z');
      const newDate = new Date('2025-06-01T00:00:00Z');

      const olderStory = await seedStory(db, tenantId, epicId, {
        priority: 'medium',
        createdAt: oldDate,
      });
      await seedStory(db, tenantId, epicId, {
        priority: 'medium',
        createdAt: newDate,
      });

      const workerId = await seedWorker(db, tenantId);
      const token = `lw_test_${randomUUID().slice(0, 12)}`;
      registerWorkerAuth(token, workerId, tenantId, [project.id]);

      const res = await callHandler(makeAssignRequest(project.id, token));

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as {
        data: { type: string; story: { id: string } };
      };
      expect(body.data.type).toBe('assigned');
      expect(body.data.story.id).toBe(olderStory.id);
    });
  });

  // -----------------------------------------------------------------------
  // Re-assignment behavior
  // -----------------------------------------------------------------------

  describe('re-assignment', () => {
    it('returns the already-assigned story if worker requests again', async () => {
      const db = getTestDb();
      const project = await seedProject(db, tenantId);
      const epicId = await seedEpic(db, tenantId, project.id);

      const workerId = await seedWorker(db, tenantId);

      // Seed a story already in_progress and assigned to this worker
      const existingStory = await seedStory(db, tenantId, epicId, {
        workStatus: 'in_progress',
        assignedWorkerId: workerId,
      });

      const token = `lw_test_${randomUUID().slice(0, 12)}`;
      registerWorkerAuth(token, workerId, tenantId, [project.id]);

      const res = await callHandler(makeAssignRequest(project.id, token));

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as {
        data: { type: string; story: { id: string } };
      };
      expect(body.data.type).toBe('assigned');
      expect(body.data.story.id).toBe(existingStory.id);
    });
  });

  // -----------------------------------------------------------------------
  // Authorization
  // -----------------------------------------------------------------------

  describe('authorization', () => {
    it('returns 403 when worker lacks project access', async () => {
      const db = getTestDb();
      const project = await seedProject(db, tenantId);
      await seedEpic(db, tenantId, project.id);

      const workerId = await seedWorker(db, tenantId);
      const token = `lw_test_${randomUUID().slice(0, 12)}`;
      // Register with empty projectAccess — worker has no access
      registerWorkerAuth(token, workerId, tenantId, []);

      const res = await callHandler(makeAssignRequest(project.id, token));

      expect(res.getStatusCode()).toBe(403);
      const body = res.getJsonBody() as { error: { code: string } };
      expect(body.error.code).toBe('PROJECT_ACCESS_DENIED');
    });

    it('returns 404 when project does not exist', async () => {
      const db = getTestDb();
      const workerId = await seedWorker(db, tenantId);
      const fakeProjectId = randomUUID();
      const token = `lw_test_${randomUUID().slice(0, 12)}`;
      registerWorkerAuth(token, workerId, tenantId, [fakeProjectId]);

      const res = await callHandler(makeAssignRequest(fakeProjectId, token));

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as { error: { code: string } };
      expect(body.error.code).toBe('PROJECT_NOT_FOUND');
    });

    it('returns 409 when project is in draft status', async () => {
      const db = getTestDb();
      const project = await seedProject(db, tenantId, { lifecycleStatus: 'draft' });

      const workerId = await seedWorker(db, tenantId);
      const token = `lw_test_${randomUUID().slice(0, 12)}`;
      registerWorkerAuth(token, workerId, tenantId, [project.id]);

      const res = await callHandler(makeAssignRequest(project.id, token));

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as { error: { code: string } };
      expect(body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('returns 401 when no auth provided', async () => {
      const db = getTestDb();
      const project = await seedProject(db, tenantId);

      const req = createMockRequest({
        method: 'POST',
        url: '/api/v1/orchestration/assign',
        body: { project_id: project.id },
        // No authorization header
      });

      const res = await callHandler(req);

      expect(res.getStatusCode()).toBe(401);
    });

    it('returns 405 for non-POST methods', async () => {
      const req = createMockRequest({
        method: 'GET',
        url: '/api/v1/orchestration/assign',
      });

      const res = await callHandler(req);

      expect(res.getStatusCode()).toBe(405);
    });
  });

  // -----------------------------------------------------------------------
  // Assigned response structure
  // -----------------------------------------------------------------------

  describe('assigned response structure', () => {
    it('includes story, epic, tasks with persona, and recommended order', async () => {
      const db = getTestDb();
      const project = await seedProject(db, tenantId);
      const epicId = await seedEpic(db, tenantId, project.id);
      const story = await seedStory(db, tenantId, epicId, { priority: 'high' });

      // Seed a persona and a task that references it
      const persona = await seedPersona(db, tenantId);
      const taskId = await seedTask(db, tenantId, story.id, { personaId: persona.id });

      const workerId = await seedWorker(db, tenantId);
      const token = `lw_test_${randomUUID().slice(0, 12)}`;
      registerWorkerAuth(token, workerId, tenantId, [project.id]);

      const res = await callHandler(makeAssignRequest(project.id, token));

      expect(res.getStatusCode()).toBe(200);

      const body = res.getJsonBody() as {
        data: {
          type: string;
          story: {
            id: string;
            name: string;
            description: string | null;
            priority: string;
            epic: { id: string; name: string };
            tasks: Array<{
              id: string;
              name: string;
              description: string | null;
              persona: { id: string; name: string; system_prompt: string } | null;
              dependencies: Array<{ id: string; name: string; status: string }>;
              acceptance_criteria: unknown[];
              technical_notes: string | null;
              status: string;
            }>;
            recommended_task_order: string[];
          };
        };
      };

      const storyData = body.data.story;

      // Story fields
      expect(body.data.type).toBe('assigned');
      expect(storyData.id).toBe(story.id);
      expect(storyData.priority).toBe('high');
      expect(storyData.name).toBeDefined();
      expect(storyData.epic.id).toBe(epicId);
      expect(storyData.epic.name).toBeDefined();

      // Tasks
      expect(storyData.tasks).toHaveLength(1);
      expect(storyData.tasks[0]!.id).toBe(taskId);
      expect(storyData.tasks[0]!.description).toBe('Test task description');

      // Persona
      expect(storyData.tasks[0]!.persona).not.toBeNull();
      expect(storyData.tasks[0]!.persona!.id).toBe(persona.id);
      expect(storyData.tasks[0]!.persona!.name).toBe(persona.name);
      expect(storyData.tasks[0]!.persona!.system_prompt).toBe('You are a test persona.');

      // Recommended order
      expect(storyData.recommended_task_order).toContain(taskId);

      // Retry-After header set
      const headers = res.getSetHeaders();
      const retryAfter = headers.find(([name]) => name === 'Retry-After');
      expect(retryAfter).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Blocked response structure
  // -----------------------------------------------------------------------

  describe('blocked response structure', () => {
    it('includes blocking stories and retry hint', async () => {
      const db = getTestDb();
      const project = await seedProject(db, tenantId);
      const epicId = await seedEpic(db, tenantId, project.id);

      // All stories are in non-terminal, non-eligible states
      const blockingWorkerId = await seedWorker(db, tenantId);
      await seedStory(db, tenantId, epicId, {
        workStatus: 'in_progress',
        assignedWorkerId: blockingWorkerId,
      });

      const workerId = await seedWorker(db, tenantId);
      const token = `lw_test_${randomUUID().slice(0, 12)}`;
      registerWorkerAuth(token, workerId, tenantId, [project.id]);

      const res = await callHandler(makeAssignRequest(project.id, token));

      expect(res.getStatusCode()).toBe(200);

      const body = res.getJsonBody() as {
        data: {
          type: string;
          blocking_stories: Array<{
            id: string;
            name: string;
            assigned_worker: string | null;
            blocking_reason: string;
          }>;
          retry_after_seconds: number;
        };
      };

      expect(body.data.type).toBe('blocked');
      expect(body.data.blocking_stories).toBeDefined();
      expect(body.data.blocking_stories.length).toBeGreaterThan(0);
      expect(body.data.retry_after_seconds).toBeGreaterThan(0);

      // Blocking story should reference the in-progress story
      const blockingStory = body.data.blocking_stories[0]!;
      expect(blockingStory.id).toBeDefined();
      expect(blockingStory.name).toBeDefined();
      expect(blockingStory.blocking_reason).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // All-complete response structure
  // -----------------------------------------------------------------------

  describe('all_complete response structure', () => {
    it('includes project summary and completion counts', async () => {
      const db = getTestDb();
      const project = await seedProject(db, tenantId);
      const epicId = await seedEpic(db, tenantId, project.id);
      await seedStory(db, tenantId, epicId, { workStatus: 'done' });
      await seedStory(db, tenantId, epicId, { workStatus: 'done' });
      await seedStory(db, tenantId, epicId, { workStatus: 'skipped' });

      const workerId = await seedWorker(db, tenantId);
      const token = `lw_test_${randomUUID().slice(0, 12)}`;
      registerWorkerAuth(token, workerId, tenantId, [project.id]);

      const res = await callHandler(makeAssignRequest(project.id, token));

      expect(res.getStatusCode()).toBe(200);

      const body = res.getJsonBody() as {
        data: {
          type: string;
          project: { id: string; name: string };
          completed_stories: number;
          total_stories: number;
        };
      };

      expect(body.data.type).toBe('all_complete');
      expect(body.data.project.id).toBe(project.id);
      expect(body.data.project.name).toBeDefined();
      expect(body.data.completed_stories).toBe(3);
      expect(body.data.total_stories).toBe(3);
    });
  });
});

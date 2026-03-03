/**
 * @module tasks.integration.test
 *
 * Integration tests for all Task API endpoints:
 *
 * - POST   /api/v1/tasks              -- Create a new task with optional dependencies
 * - GET    /api/v1/tasks              -- List tasks (paginated, filtered)
 * - GET    /api/v1/tasks/:id          -- Get task detail with resolved dependencies
 * - PATCH  /api/v1/tasks/:id          -- Update task fields with optimistic locking
 * - DELETE /api/v1/tasks/:id          -- Soft-delete with dependency edge cleanup
 * - POST   /api/v1/tasks/:id/start    -- Start a task (agent auth)
 * - POST   /api/v1/tasks/:id/complete -- Complete a task with cascading re-evaluation
 *
 * Tests invoke handler functions directly with mock request/response objects.
 * The database layer and auth layer are mocked to enable isolated,
 * deterministic testing without requiring a running database or auth server.
 *
 * Test coverage:
 * - CRUD operations (create, list, detail, update, delete)
 * - DAG cycle detection (direct, indirect, multi-edge)
 * - Dependency validation (self-dep, cross-project, deleted task)
 * - Cross-story dependencies within same project
 * - Status updates (start, complete) with worker auth
 * - Cascading re-evaluation after task completion
 * - Multi-level cascading (A -> B -> C chain)
 * - Partial dependency completion
 * - Dependency edge cleanup on soft-delete
 * - Read-only enforcement from parent story
 * - Authentication enforcement
 * - Error response format
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockRequest, createMockResponse } from '@/__tests__/helpers/mock-api';
import {
  setMockSession,
  clearMockSession,
  getMockSession,
  TEST_TENANT_ID,
} from '@/__tests__/helpers/mock-auth';

// ---------------------------------------------------------------------------
// UUIDs for tests
// ---------------------------------------------------------------------------

const VALID_STORY_UUID = '550e8400-e29b-41d4-a716-446655440001';
const VALID_STORY_UUID_2 = '550e8400-e29b-41d4-a716-446655440002';
const VALID_EPIC_UUID = '660e8400-e29b-41d4-a716-446655440001';
// VALID_EPIC_UUID_2 reserved for future cross-epic tests
const VALID_PROJECT_UUID = '770e8400-e29b-41d4-a716-446655440001';
const VALID_PROJECT_UUID_2 = '770e8400-e29b-41d4-a716-446655440002';
const VALID_WORKER_UUID = '880e8400-e29b-41d4-a716-446655440001';
const OTHER_WORKER_UUID = '880e8400-e29b-41d4-a716-446655440099';
const TASK_UUID_A = 'aa0e8400-e29b-41d4-a716-446655440001';
const TASK_UUID_B = 'bb0e8400-e29b-41d4-a716-446655440002';
const TASK_UUID_C = 'cc0e8400-e29b-41d4-a716-446655440003';
const NONEXISTENT_UUID = '00000000-0000-4000-a000-000000000000';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Mock data interfaces
// ---------------------------------------------------------------------------

interface MockTask {
  id: string;
  tenantId: string;
  userStoryId: string;
  title: string;
  description: string | null;
  acceptanceCriteria: string[];
  technicalNotes: string | null;
  personaId: string | null;
  workStatus: string;
  startedAt: Date | null;
  completedAt: Date | null;
  references: Array<{ type: string; url: string; title: string }>;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface MockTaskWithDependencyIds extends MockTask {
  dependencyIds: string[];
}

interface MockStory {
  id: string;
  tenantId: string;
  epicId: string;
  title: string;
  description: string | null;
  priority: string;
  workStatus: string;
  costEstimate: string | null;
  actualCost: string | null;
  assignedWorkerId: string | null;
  assignedAt: Date | null;
  attempts: number;
  maxAttempts: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

interface MockTaskSummary {
  id: string;
  title: string;
  workStatus: string;
}

// ---------------------------------------------------------------------------
// Mock data factories
// ---------------------------------------------------------------------------

const now = new Date('2025-06-01T12:00:00Z');

/**
 * Creates a valid POST body for task creation.
 * Includes all required fields that the createTaskSchema demands.
 */
const createValidTaskBody = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  title: 'Test Task',
  userStoryId: VALID_STORY_UUID,
  description: null,
  acceptanceCriteria: ['Given X, When Y, Then Z'],
  technicalNotes: null,
  personaId: null,
  references: [],
  ...overrides,
});

const createMockTask = (overrides: Partial<MockTask> = {}): MockTask => ({
  id: TASK_UUID_A,
  tenantId: TEST_TENANT_ID,
  userStoryId: VALID_STORY_UUID,
  title: 'Test Task',
  description: null,
  acceptanceCriteria: ['Given X, When Y, Then Z'],
  technicalNotes: null,
  personaId: null,
  workStatus: 'pending',
  startedAt: null,
  completedAt: null,
  references: [],
  version: 0,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  ...overrides,
});

const createMockTaskWithDeps = (
  overrides: Partial<MockTaskWithDependencyIds> = {},
): MockTaskWithDependencyIds => ({
  ...createMockTask(overrides),
  dependencyIds: [],
  ...overrides,
});

const createMockStory = (overrides: Partial<MockStory> = {}): MockStory => ({
  id: VALID_STORY_UUID,
  tenantId: TEST_TENANT_ID,
  epicId: VALID_EPIC_UUID,
  title: 'Test Story',
  description: null,
  priority: 'medium',
  workStatus: 'pending',
  costEstimate: null,
  actualCost: null,
  assignedWorkerId: null,
  assignedAt: null,
  attempts: 0,
  maxAttempts: 3,
  version: 0,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mock repository functions
// ---------------------------------------------------------------------------

const mockTaskRepoCreate =
  vi.fn<(tenantId: string, storyId: string, data: Record<string, unknown>) => Promise<MockTask>>();

const mockTaskRepoCreateInTx =
  vi.fn<
    (
      tenantId: string,
      storyId: string,
      data: Record<string, unknown>,
      tx: unknown,
    ) => Promise<MockTask>
  >();

const mockTaskRepoFindById = vi.fn<(tenantId: string, id: string) => Promise<MockTask | null>>();

const mockTaskRepoFindDetailById = vi.fn<
  (
    tenantId: string,
    id: string,
  ) => Promise<{
    task: MockTask;
    dependencies: MockTaskSummary[];
    dependents: MockTaskSummary[];
  } | null>
>();

const mockTaskRepoFindWithFilters = vi.fn();

const mockTaskRepoUpdate =
  vi.fn<
    (
      tenantId: string,
      id: string,
      data: Record<string, unknown>,
      version: number,
    ) => Promise<MockTask>
  >();

const mockTaskRepoUpdateInTx =
  vi.fn<
    (
      tenantId: string,
      id: string,
      data: Record<string, unknown>,
      version: number,
      tx: unknown,
    ) => Promise<MockTask>
  >();

const mockTaskRepoGetParentStory =
  vi.fn<(tenantId: string, taskId: string) => Promise<MockStory | null>>();

const mockTaskRepoGetProjectIdForStory =
  vi.fn<(tenantId: string, storyId: string) => Promise<string | null>>();

const mockTaskRepoGetProjectIdForTask =
  vi.fn<(tenantId: string, taskId: string) => Promise<string | null>>();

const mockTaskRepoReplaceDependencies =
  vi.fn<(tenantId: string, taskId: string, depIds: string[]) => Promise<void>>();

const mockTaskRepoReplaceDependenciesInTx =
  vi.fn<(tenantId: string, taskId: string, depIds: string[], tx: unknown) => Promise<void>>();

const mockTaskRepoGetProjectEdgesInTx = vi.fn();

const mockTaskRepoWithTransaction =
  vi.fn<(fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>>();

const mockTaskRepoGetDependencies =
  vi.fn<(tenantId: string, taskId: string) => Promise<MockTask[]>>();

const mockTaskRepoGetDependents =
  vi.fn<(tenantId: string, taskId: string) => Promise<MockTask[]>>();

const mockTaskRepoBulkUpdateStatus =
  vi.fn<(tenantId: string, taskIds: string[], status: string) => Promise<number>>();

const mockTaskRepoGetDependentIdsInTx =
  vi.fn<(tenantId: string, taskId: string, tx: unknown) => Promise<string[]>>();

const mockTaskRepoRemoveAllEdgesInTx =
  vi.fn<(tenantId: string, taskId: string, tx: unknown) => Promise<void>>();

const mockTaskRepoSoftDeleteInTx =
  vi.fn<(tenantId: string, taskId: string, tx: unknown) => Promise<MockTask | null>>();

const mockTaskRepoFindByStory = vi.fn();

const mockStoryRepoFindById = vi.fn<(tenantId: string, id: string) => Promise<MockStory | null>>();

const mockStoryRepoUpdate = vi.fn();

const mockEpicRepoComputeDerivedStatus =
  vi.fn<(tenantId: string, epicId: string) => Promise<string>>();

const mockEpicRepoFindAllByProject = vi.fn();

const mockProjectRepoUpdateWorkStatus = vi.fn();

// ---------------------------------------------------------------------------
// Mock modules (hoisted by vitest)
// ---------------------------------------------------------------------------

/**
 * Mock @/lib/auth -- the Better Auth instance.
 * Returns a controlled session based on `getMockSession()` state.
 */
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => getMockSession()),
    },
  },
}));

/**
 * Mock @/lib/middleware/api-key-validator -- defaults to null (no API key auth).
 * Override per-test to simulate worker auth.
 */
const mockValidateApiKey = vi.fn(async () => null);
vi.mock('@/lib/middleware/api-key-validator', () => ({
  validateApiKey: (...args: unknown[]) => mockValidateApiKey(...args),
}));

/**
 * Mock @laila/database -- provides mock repository factories and getDb.
 */
vi.mock('@laila/database', () => ({
  getDb: vi.fn(() => ({})),
  createTaskRepository: vi.fn(() => ({
    create: mockTaskRepoCreate,
    createInTx: mockTaskRepoCreateInTx,
    findById: mockTaskRepoFindById,
    findDetailById: mockTaskRepoFindDetailById,
    findWithFilters: mockTaskRepoFindWithFilters,
    findByStory: mockTaskRepoFindByStory,
    update: mockTaskRepoUpdate,
    updateInTx: mockTaskRepoUpdateInTx,
    getParentStory: mockTaskRepoGetParentStory,
    getProjectIdForStory: mockTaskRepoGetProjectIdForStory,
    getProjectIdForTask: mockTaskRepoGetProjectIdForTask,
    replaceDependencies: mockTaskRepoReplaceDependencies,
    replaceDependenciesInTx: mockTaskRepoReplaceDependenciesInTx,
    getProjectEdgesInTx: mockTaskRepoGetProjectEdgesInTx,
    withTransaction: mockTaskRepoWithTransaction,
    getDependencies: mockTaskRepoGetDependencies,
    getDependents: mockTaskRepoGetDependents,
    bulkUpdateStatus: mockTaskRepoBulkUpdateStatus,
    getDependentIdsInTx: mockTaskRepoGetDependentIdsInTx,
    removeAllEdgesInTx: mockTaskRepoRemoveAllEdgesInTx,
    softDeleteInTx: mockTaskRepoSoftDeleteInTx,
  })),
  createStoryRepository: vi.fn(() => ({
    findById: mockStoryRepoFindById,
    update: mockStoryRepoUpdate,
  })),
  createEpicRepository: vi.fn(() => ({
    computeDerivedStatus: mockEpicRepoComputeDerivedStatus,
    findAllByProject: mockEpicRepoFindAllByProject,
  })),
  createProjectRepository: vi.fn(() => ({
    updateWorkStatus: mockProjectRepoUpdateWorkStatus,
  })),
}));

/**
 * Mock @laila/domain -- DAG functions used by dag-validation.
 */
const mockDetectCycle = vi.fn();
const mockBuildAdjacencyList = vi.fn(() => new Map<string, Set<string>>());
vi.mock('@laila/domain', () => ({
  buildAdjacencyList: (...args: unknown[]) =>
    (mockBuildAdjacencyList as (...a: unknown[]) => Map<string, Set<string>>)(...args),
  detectCycle: (...args: unknown[]) =>
    (mockDetectCycle as (...a: unknown[]) => { hasCycle: boolean; cyclePath: string[] })(...args),
}));

// ---------------------------------------------------------------------------
// Import handlers AFTER mocks are registered
// ---------------------------------------------------------------------------

const { default: taskCollectionHandler } = await import('@/pages/api/v1/tasks/index');
const { default: taskDetailHandler } = await import('@/pages/api/v1/tasks/[id]');
const { default: taskStartHandler } = await import('@/pages/api/v1/tasks/[id]/start');
const { default: taskCompleteHandler } = await import('@/pages/api/v1/tasks/[id]/complete');

// ---------------------------------------------------------------------------
// Error envelope type for assertions
// ---------------------------------------------------------------------------

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId: string;
  };
}

// ---------------------------------------------------------------------------
// Helper: simulate worker auth for start/complete endpoints
// ---------------------------------------------------------------------------

const setWorkerAuth = (workerId: string = VALID_WORKER_UUID): void => {
  clearMockSession();
  mockValidateApiKey.mockResolvedValue({
    type: 'agent' as const,
    workerId,
    workerName: 'Test Worker',
    tenantId: TEST_TENANT_ID,
    projectAccess: [VALID_PROJECT_UUID],
  });
};

// ---------------------------------------------------------------------------
// Helper: mock withTransaction to execute the callback immediately
// ---------------------------------------------------------------------------

const setupTransactionMock = (): void => {
  mockTaskRepoWithTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({}),
  );
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Task API Integration Tests', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setMockSession();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setupTransactionMock();

    // Default: DAG validation passes (no cycle)
    mockDetectCycle.mockReturnValue({ hasCycle: false, cyclePath: [] });
    mockBuildAdjacencyList.mockReturnValue(new Map<string, Set<string>>());
    mockTaskRepoGetProjectEdgesInTx.mockResolvedValue([]);
  });

  afterEach(() => {
    clearMockSession();
    vi.clearAllMocks();
    consoleErrorSpy.mockRestore();
    mockValidateApiKey.mockReset();
    mockValidateApiKey.mockResolvedValue(null);
  });

  // =========================================================================
  // POST /api/v1/tasks -- Create task
  // =========================================================================

  describe('POST /api/v1/tasks', () => {
    it('creates a task with 201 and validates parent story exists', async () => {
      const story = createMockStory();
      const newTask = createMockTask({ title: 'New Task' });

      mockStoryRepoFindById.mockResolvedValue(story);
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(VALID_PROJECT_UUID);
      mockTaskRepoCreateInTx.mockResolvedValue(newTask);

      const req = createMockRequest({
        method: 'POST',
        body: createValidTaskBody({ title: 'New Task' }),
      });
      const res = createMockResponse();

      await taskCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(201);
      const body = res.getJsonBody() as { data: MockTask } | undefined;
      expect(body).toBeDefined();
      expect(body!.data.title).toBe('New Task');
      expect(mockTaskRepoCreateInTx).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        VALID_STORY_UUID,
        expect.objectContaining({ title: 'New Task' }),
        expect.anything(),
      );
    });

    it('creates a task with dependency list', async () => {
      const story = createMockStory();
      const depTask = createMockTask({ id: TASK_UUID_B, title: 'Dep Task' });
      const newTask = createMockTask({ id: TASK_UUID_A, title: 'New Task' });

      mockStoryRepoFindById.mockResolvedValue(story);
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(VALID_PROJECT_UUID);
      mockTaskRepoCreateInTx.mockResolvedValue(newTask);
      // dependency validation mocks
      mockTaskRepoFindById.mockResolvedValue(depTask);
      mockTaskRepoGetProjectIdForTask.mockResolvedValue(VALID_PROJECT_UUID);

      const req = createMockRequest({
        method: 'POST',
        body: createValidTaskBody({
          title: 'New Task',
          dependencyIds: [TASK_UUID_B],
        }),
      });
      const res = createMockResponse();

      await taskCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(201);
      expect(mockTaskRepoReplaceDependenciesInTx).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        TASK_UUID_A,
        [TASK_UUID_B],
        expect.anything(),
      );
    });

    it('returns 404 when parent story does not exist', async () => {
      mockStoryRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'POST',
        body: createValidTaskBody({
          title: 'Orphan Task',
          userStoryId: NONEXISTENT_UUID,
        }),
      });
      const res = createMockResponse();

      await taskCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('STORY_NOT_FOUND');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 400 with VALIDATION_FAILED for missing title', async () => {
      const req = createMockRequest({
        method: 'POST',
        body: createValidTaskBody({ title: undefined }),
      });
      const res = createMockResponse();

      await taskCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('VALIDATION_FAILED');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 401 for unauthenticated requests', async () => {
      clearMockSession();

      const req = createMockRequest({
        method: 'POST',
        body: createValidTaskBody({ title: 'Unauth Task' }),
      });
      const res = createMockResponse();

      await taskCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(401);
      const body = res.getJsonBody() as { error: { code: string } } | undefined;
      expect(body!.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 405 for unsupported HTTP methods', async () => {
      const req = createMockRequest({ method: 'PUT' });
      const res = createMockResponse();

      await taskCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(405);
      const body = res.getJsonBody() as { error: { code: string } } | undefined;
      expect(body!.error.code).toBe('METHOD_NOT_ALLOWED');
    });
  });

  // =========================================================================
  // GET /api/v1/tasks -- List tasks
  // =========================================================================

  describe('GET /api/v1/tasks', () => {
    it('returns paginated list of tasks with dependency IDs', async () => {
      const tasks: MockTaskWithDependencyIds[] = [
        createMockTaskWithDeps({
          id: TASK_UUID_A,
          title: 'Task A',
          dependencyIds: [TASK_UUID_B],
        }),
        createMockTaskWithDeps({
          id: TASK_UUID_B,
          title: 'Task B',
          dependencyIds: [],
        }),
      ];

      mockTaskRepoFindWithFilters.mockResolvedValue({
        data: tasks,
        pagination: {
          page: 1,
          limit: 20,
          total: 2,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });

      const req = createMockRequest({ method: 'GET' });
      const res = createMockResponse();

      await taskCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as
        | {
            data: MockTaskWithDependencyIds[];
            pagination: { page: number; total: number };
          }
        | undefined;
      expect(body).toBeDefined();
      expect(body!.data).toHaveLength(2);
      expect(body!.data[0]!.dependencyIds).toEqual([TASK_UUID_B]);
      expect(body!.pagination.total).toBe(2);
    });

    it('supports projectId filter', async () => {
      mockTaskRepoFindWithFilters.mockResolvedValue({
        data: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      });

      const req = createMockRequest({
        method: 'GET',
        query: { projectId: VALID_PROJECT_UUID },
      });
      const res = createMockResponse();

      await taskCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      expect(mockTaskRepoFindWithFilters).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        expect.objectContaining({
          projectId: VALID_PROJECT_UUID,
        }),
      );
    });

    it('supports storyId filter', async () => {
      mockTaskRepoFindWithFilters.mockResolvedValue({
        data: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      });

      const req = createMockRequest({
        method: 'GET',
        query: { userStoryId: VALID_STORY_UUID },
      });
      const res = createMockResponse();

      await taskCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      expect(mockTaskRepoFindWithFilters).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        expect.objectContaining({
          storyId: VALID_STORY_UUID,
        }),
      );
    });

    it('supports status filter', async () => {
      mockTaskRepoFindWithFilters.mockResolvedValue({
        data: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      });

      const req = createMockRequest({
        method: 'GET',
        query: { status: 'in_progress' },
      });
      const res = createMockResponse();

      await taskCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      expect(mockTaskRepoFindWithFilters).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        expect.objectContaining({
          status: 'in_progress',
        }),
      );
    });

    it('supports personaId filter', async () => {
      const personaId = '990e8400-e29b-41d4-a716-446655440099';
      mockTaskRepoFindWithFilters.mockResolvedValue({
        data: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      });

      const req = createMockRequest({
        method: 'GET',
        query: { personaId },
      });
      const res = createMockResponse();

      await taskCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      expect(mockTaskRepoFindWithFilters).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        expect.objectContaining({
          personaId,
        }),
      );
    });
  });

  // =========================================================================
  // GET /api/v1/tasks/:id -- Get task detail
  // =========================================================================

  describe('GET /api/v1/tasks/:id', () => {
    it('returns task with resolved dependency summaries', async () => {
      const task = createMockTask({ id: TASK_UUID_A });
      const dependencies: MockTaskSummary[] = [
        { id: TASK_UUID_B, title: 'Dep B', workStatus: 'done' },
      ];
      const dependents: MockTaskSummary[] = [
        { id: TASK_UUID_C, title: 'Dep C', workStatus: 'blocked' },
      ];

      mockTaskRepoFindDetailById.mockResolvedValue({
        task,
        dependencies,
        dependents,
      });

      const req = createMockRequest({
        method: 'GET',
        query: { id: TASK_UUID_A },
      });
      const res = createMockResponse();

      await taskDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as
        | {
            data: MockTask & {
              dependencies: MockTaskSummary[];
              dependents: MockTaskSummary[];
            };
          }
        | undefined;
      expect(body).toBeDefined();
      expect(body!.data.id).toBe(TASK_UUID_A);
      expect(body!.data.dependencies).toHaveLength(1);
      expect(body!.data.dependencies[0]!.id).toBe(TASK_UUID_B);
      expect(body!.data.dependencies[0]!.workStatus).toBe('done');
      expect(body!.data.dependents).toHaveLength(1);
      expect(body!.data.dependents[0]!.id).toBe(TASK_UUID_C);
    });

    it('returns 404 when task does not exist', async () => {
      mockTaskRepoFindDetailById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'GET',
        query: { id: NONEXISTENT_UUID },
      });
      const res = createMockResponse();

      await taskDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('TASK_NOT_FOUND');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 400 for invalid UUID param', async () => {
      const req = createMockRequest({
        method: 'GET',
        query: { id: 'not-a-uuid' },
      });
      const res = createMockResponse();

      await taskDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('VALIDATION_FAILED');
    });
  });

  // =========================================================================
  // PATCH /api/v1/tasks/:id -- Update task
  // =========================================================================

  describe('PATCH /api/v1/tasks/:id', () => {
    it('updates task fields with optimistic locking', async () => {
      const existing = createMockTask({ id: TASK_UUID_A, version: 1 });
      const updated = createMockTask({
        id: TASK_UUID_A,
        title: 'Updated Title',
        version: 2,
      });
      const parentStory = createMockStory({ workStatus: 'pending' });

      mockTaskRepoFindById.mockResolvedValue(existing);
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory);
      mockTaskRepoUpdateInTx.mockResolvedValue(updated);

      const req = createMockRequest({
        method: 'PATCH',
        query: { id: TASK_UUID_A },
        body: { title: 'Updated Title', version: 1 },
      });
      const res = createMockResponse();

      await taskDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockTask } | undefined;
      expect(body!.data.title).toBe('Updated Title');
      expect(body!.data.version).toBe(2);
    });

    it('replaces entire dependency list when dependencyIds provided on PATCH', async () => {
      const existing = createMockTask({ id: TASK_UUID_A, version: 1 });
      const parentStory = createMockStory({ workStatus: 'pending' });
      const updated = createMockTask({ id: TASK_UUID_A, version: 2 });
      const depTask = createMockTask({ id: TASK_UUID_B });

      mockTaskRepoFindById.mockResolvedValue(existing);
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory);
      mockTaskRepoGetProjectIdForTask.mockResolvedValue(VALID_PROJECT_UUID);
      mockTaskRepoUpdateInTx.mockResolvedValue(updated);
      // For dependency validation when called from validateDependencyIds
      // findById is already mocked above; for the second call (depTask lookup)
      // we need to handle multiple calls
      mockTaskRepoFindById
        .mockResolvedValueOnce(existing) // first call: task exists check
        .mockResolvedValueOnce(depTask); // second call: dependency exists check
      mockTaskRepoGetProjectIdForTask
        .mockResolvedValueOnce(VALID_PROJECT_UUID) // first call: task project
        .mockResolvedValueOnce(VALID_PROJECT_UUID); // second call: dep project

      const req = createMockRequest({
        method: 'PATCH',
        query: { id: TASK_UUID_A },
        body: {
          dependencyIds: [TASK_UUID_B],
          version: 1,
        },
      });
      const res = createMockResponse();

      await taskDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      expect(mockTaskRepoReplaceDependenciesInTx).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        TASK_UUID_A,
        [TASK_UUID_B],
        expect.anything(),
      );
    });

    it('clears all dependencies when empty array provided', async () => {
      const existing = createMockTask({ id: TASK_UUID_A, version: 1 });
      const parentStory = createMockStory({ workStatus: 'pending' });
      const updated = createMockTask({ id: TASK_UUID_A, version: 2 });

      mockTaskRepoFindById.mockResolvedValue(existing);
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory);
      mockTaskRepoUpdateInTx.mockResolvedValue(updated);

      const req = createMockRequest({
        method: 'PATCH',
        query: { id: TASK_UUID_A },
        body: {
          dependencyIds: [],
          version: 1,
        },
      });
      const res = createMockResponse();

      await taskDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      expect(mockTaskRepoReplaceDependenciesInTx).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        TASK_UUID_A,
        [],
        expect.anything(),
      );
    });

    it('returns 404 when task does not exist', async () => {
      mockTaskRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'PATCH',
        query: { id: NONEXISTENT_UUID },
        body: { title: 'Update', version: 0 },
      });
      const res = createMockResponse();

      await taskDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('TASK_NOT_FOUND');
    });
  });

  // =========================================================================
  // DELETE /api/v1/tasks/:id -- Soft-delete task
  // =========================================================================

  describe('DELETE /api/v1/tasks/:id', () => {
    it('soft-deletes task and returns 204 No Content', async () => {
      const existing = createMockTask({ id: TASK_UUID_A });
      const parentStory = createMockStory({ workStatus: 'pending' });

      mockTaskRepoFindById.mockResolvedValue(existing);
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory);
      mockTaskRepoGetDependentIdsInTx.mockResolvedValue([TASK_UUID_B]);
      mockTaskRepoRemoveAllEdgesInTx.mockResolvedValue(undefined);
      mockTaskRepoSoftDeleteInTx.mockResolvedValue({
        ...existing,
        deletedAt: now,
      });

      const req = createMockRequest({
        method: 'DELETE',
        query: { id: TASK_UUID_A },
      });
      const res = createMockResponse();

      await taskDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(204);
    });

    it('returns 404 when task does not exist', async () => {
      mockTaskRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'DELETE',
        query: { id: NONEXISTENT_UUID },
      });
      const res = createMockResponse();

      await taskDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('TASK_NOT_FOUND');
    });

    it('returns 405 for unsupported HTTP methods on detail route', async () => {
      const req = createMockRequest({
        method: 'PUT',
        query: { id: TASK_UUID_A },
      });
      const res = createMockResponse();

      await taskDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(405);
    });
  });

  // =========================================================================
  // Read-Only Enforcement
  // =========================================================================

  describe('Read-Only Enforcement', () => {
    it('returns 409 READ_ONLY_VIOLATION when creating task in in_progress story', async () => {
      const story = createMockStory({ workStatus: 'in_progress' });
      mockStoryRepoFindById.mockResolvedValue(story);

      const req = createMockRequest({
        method: 'POST',
        body: createValidTaskBody({ title: 'Blocked Task' }),
      });
      const res = createMockResponse();

      await taskCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('READ_ONLY_VIOLATION');
      expect(body!.error.message).toContain('in_progress');
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('returns 409 READ_ONLY_VIOLATION when updating task in in_progress story', async () => {
      const existing = createMockTask({ id: TASK_UUID_A, version: 1 });
      const parentStory = createMockStory({ workStatus: 'in_progress' });

      mockTaskRepoFindById.mockResolvedValue(existing);
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory);

      const req = createMockRequest({
        method: 'PATCH',
        query: { id: TASK_UUID_A },
        body: { title: 'Cannot Update', version: 1 },
      });
      const res = createMockResponse();

      await taskDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('READ_ONLY_VIOLATION');
      expect(body!.error.message).toContain('in_progress');
    });

    it('returns 409 READ_ONLY_VIOLATION when deleting task in in_progress story', async () => {
      const existing = createMockTask({ id: TASK_UUID_A });
      const parentStory = createMockStory({ workStatus: 'in_progress' });

      mockTaskRepoFindById.mockResolvedValue(existing);
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory);

      const req = createMockRequest({
        method: 'DELETE',
        query: { id: TASK_UUID_A },
      });
      const res = createMockResponse();

      await taskDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('READ_ONLY_VIOLATION');
    });

    it('allows task creation when story is in pending status', async () => {
      const story = createMockStory({ workStatus: 'pending' });
      const newTask = createMockTask();

      mockStoryRepoFindById.mockResolvedValue(story);
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(VALID_PROJECT_UUID);
      mockTaskRepoCreateInTx.mockResolvedValue(newTask);

      const req = createMockRequest({
        method: 'POST',
        body: createValidTaskBody({ title: 'Allowed Task' }),
      });
      const res = createMockResponse();

      await taskCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(201);
    });
  });

  // =========================================================================
  // DAG Validation
  // =========================================================================

  describe('DAG Validation', () => {
    it('detects direct cycle (A -> B -> A)', async () => {
      const story = createMockStory();
      const taskA = createMockTask({ id: TASK_UUID_A });

      mockStoryRepoFindById.mockResolvedValue(story);
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(VALID_PROJECT_UUID);
      mockTaskRepoCreateInTx.mockResolvedValue(taskA);
      // dependency validation for TASK_UUID_B
      mockTaskRepoFindById.mockResolvedValue(createMockTask({ id: TASK_UUID_B }));
      mockTaskRepoGetProjectIdForTask.mockResolvedValue(VALID_PROJECT_UUID);
      // DAG cycle detection returns a cycle
      mockDetectCycle.mockReturnValue({
        hasCycle: true,
        cyclePath: [TASK_UUID_A, TASK_UUID_B, TASK_UUID_A],
      });

      const req = createMockRequest({
        method: 'POST',
        body: createValidTaskBody({
          title: 'Task A',
          dependencyIds: [TASK_UUID_B],
        }),
      });
      const res = createMockResponse();

      await taskCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('DAG_CYCLE_DETECTED');
      expect(body!.error.message).toContain('cycle');
      expect(body!.error.details).toBeDefined();
      const details = body!.error.details as { cyclePath: string[] };
      expect(details.cyclePath).toContain(TASK_UUID_A);
      expect(body!.error.requestId).toMatch(UUID_V4_REGEX);
    });

    it('detects indirect cycle (A -> B -> C -> A)', async () => {
      // Simulating: update task C to depend on A, but A->B->C exists
      const existing = createMockTask({ id: TASK_UUID_C, version: 1 });
      const parentStory = createMockStory({ workStatus: 'pending' });
      const depTask = createMockTask({ id: TASK_UUID_A });
      const updated = createMockTask({ id: TASK_UUID_C, version: 2 });

      mockTaskRepoFindById
        .mockResolvedValueOnce(existing) // task exists check
        .mockResolvedValueOnce(depTask); // dependency exists check
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory);
      mockTaskRepoGetProjectIdForTask
        .mockResolvedValueOnce(VALID_PROJECT_UUID) // task project
        .mockResolvedValueOnce(VALID_PROJECT_UUID); // dep project
      mockTaskRepoUpdateInTx.mockResolvedValue(updated);

      // DAG cycle detection returns a cycle
      mockDetectCycle.mockReturnValue({
        hasCycle: true,
        cyclePath: [TASK_UUID_C, TASK_UUID_A, TASK_UUID_B, TASK_UUID_C],
      });

      const req = createMockRequest({
        method: 'PATCH',
        query: { id: TASK_UUID_C },
        body: {
          dependencyIds: [TASK_UUID_A],
          version: 1,
        },
      });
      const res = createMockResponse();

      await taskDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('DAG_CYCLE_DETECTED');
      const details = body!.error.details as { cyclePath: string[] };
      expect(details.cyclePath).toHaveLength(4);
    });

    it('rejects self-dependency', async () => {
      const story = createMockStory();
      const task = createMockTask({ id: TASK_UUID_A });

      mockStoryRepoFindById.mockResolvedValue(story);
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(VALID_PROJECT_UUID);
      mockTaskRepoCreateInTx.mockResolvedValue(task);

      const req = createMockRequest({
        method: 'POST',
        body: createValidTaskBody({
          title: 'Self Dep Task',
          dependencyIds: [TASK_UUID_A],
        }),
      });
      const res = createMockResponse();

      await taskCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('INVALID_DEPENDENCY');
      expect(body!.error.message).toContain('itself');
    });

    it('rejects cross-project dependencies', async () => {
      const story = createMockStory();
      const task = createMockTask({ id: TASK_UUID_A });
      const crossProjectTask = createMockTask({ id: TASK_UUID_B });

      mockStoryRepoFindById.mockResolvedValue(story);
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(VALID_PROJECT_UUID);
      mockTaskRepoCreateInTx.mockResolvedValue(task);
      // dependency validation: task exists but in different project
      mockTaskRepoFindById.mockResolvedValue(crossProjectTask);
      mockTaskRepoGetProjectIdForTask.mockResolvedValue(VALID_PROJECT_UUID_2);

      const req = createMockRequest({
        method: 'POST',
        body: createValidTaskBody({
          title: 'Cross Project Dep',
          dependencyIds: [TASK_UUID_B],
        }),
      });
      const res = createMockResponse();

      await taskCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('INVALID_DEPENDENCY');
      expect(body!.error.message).toContain('Cross-project');
    });

    it('rejects dependencies on deleted tasks', async () => {
      const story = createMockStory();
      const task = createMockTask({ id: TASK_UUID_A });

      mockStoryRepoFindById.mockResolvedValue(story);
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(VALID_PROJECT_UUID);
      mockTaskRepoCreateInTx.mockResolvedValue(task);
      // dependency validation: task not found (soft-deleted)
      mockTaskRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'POST',
        body: createValidTaskBody({
          title: 'Dep on Deleted',
          dependencyIds: [TASK_UUID_B],
        }),
      });
      const res = createMockResponse();

      await taskCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('INVALID_DEPENDENCY');
      expect(body!.error.message).toContain('not found');
    });

    it('allows valid cross-story dependencies within same project', async () => {
      const story = createMockStory({ id: VALID_STORY_UUID });
      const task = createMockTask({
        id: TASK_UUID_A,
        userStoryId: VALID_STORY_UUID,
      });
      const crossStoryTask = createMockTask({
        id: TASK_UUID_B,
        userStoryId: VALID_STORY_UUID_2,
      });

      mockStoryRepoFindById.mockResolvedValue(story);
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(VALID_PROJECT_UUID);
      mockTaskRepoCreateInTx.mockResolvedValue(task);
      // dependency validation: both in same project, different stories
      mockTaskRepoFindById.mockResolvedValue(crossStoryTask);
      mockTaskRepoGetProjectIdForTask.mockResolvedValue(VALID_PROJECT_UUID);

      const req = createMockRequest({
        method: 'POST',
        body: createValidTaskBody({
          title: 'Cross Story Dep',
          dependencyIds: [TASK_UUID_B],
        }),
      });
      const res = createMockResponse();

      await taskCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(201);
      expect(mockTaskRepoReplaceDependenciesInTx).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        TASK_UUID_A,
        [TASK_UUID_B],
        expect.anything(),
      );
    });

    it('validates multi-edge cycles (adding [A, B] where B->A exists)', async () => {
      // Adding multiple dependencies at once where the combination creates a cycle
      const story = createMockStory();
      const task = createMockTask({ id: TASK_UUID_C });

      mockStoryRepoFindById.mockResolvedValue(story);
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(VALID_PROJECT_UUID);
      mockTaskRepoCreateInTx.mockResolvedValue(task);
      // Both deps exist and are in same project
      mockTaskRepoFindById
        .mockResolvedValueOnce(createMockTask({ id: TASK_UUID_A }))
        .mockResolvedValueOnce(createMockTask({ id: TASK_UUID_B }));
      mockTaskRepoGetProjectIdForTask
        .mockResolvedValueOnce(VALID_PROJECT_UUID)
        .mockResolvedValueOnce(VALID_PROJECT_UUID);
      // First edge (C->A) is fine, second edge (C->B) creates cycle
      mockDetectCycle.mockReturnValueOnce({ hasCycle: false, cyclePath: [] }).mockReturnValueOnce({
        hasCycle: true,
        cyclePath: [TASK_UUID_C, TASK_UUID_B, TASK_UUID_A, TASK_UUID_C],
      });

      const req = createMockRequest({
        method: 'POST',
        body: createValidTaskBody({
          title: 'Multi-edge Task',
          dependencyIds: [TASK_UUID_A, TASK_UUID_B],
        }),
      });
      const res = createMockResponse();

      await taskCollectionHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('DAG_CYCLE_DETECTED');
      expect(body!.error.details).toBeDefined();
      const details = body!.error.details as { cyclePath: string[] };
      expect(details.cyclePath).toContain(TASK_UUID_B);
    });
  });

  // =========================================================================
  // POST /api/v1/tasks/:id/start -- Start task
  // =========================================================================

  describe('POST /api/v1/tasks/:id/start', () => {
    it('starts a task when all dependencies are complete', async () => {
      setWorkerAuth();

      const task = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'pending',
        version: 0,
      });
      const parentStory = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: VALID_WORKER_UUID,
      });
      const startedTask = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'in_progress',
        version: 1,
      });

      mockTaskRepoFindById.mockResolvedValue(task);
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory);
      mockTaskRepoGetDependencies.mockResolvedValue([
        createMockTask({ id: TASK_UUID_B, workStatus: 'done' }),
      ]);
      mockTaskRepoUpdate.mockResolvedValue(startedTask);

      const req = createMockRequest({
        method: 'POST',
        query: { id: TASK_UUID_A },
      });
      const res = createMockResponse();

      await taskStartHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as { data: MockTask } | undefined;
      expect(body!.data.workStatus).toBe('in_progress');
      expect(mockTaskRepoUpdate).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        TASK_UUID_A,
        expect.objectContaining({ workStatus: 'in_progress', startedAt: expect.any(Date) }),
        0,
      );
    });

    it('starts a task with no dependencies', async () => {
      setWorkerAuth();

      const task = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'pending',
      });
      const parentStory = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: VALID_WORKER_UUID,
      });
      const startedTask = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'in_progress',
        version: 1,
      });

      mockTaskRepoFindById.mockResolvedValue(task);
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory);
      mockTaskRepoGetDependencies.mockResolvedValue([]);
      mockTaskRepoUpdate.mockResolvedValue(startedTask);

      const req = createMockRequest({
        method: 'POST',
        query: { id: TASK_UUID_A },
      });
      const res = createMockResponse();

      await taskStartHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
    });

    it('rejects start when upstream dependencies are incomplete', async () => {
      setWorkerAuth();

      const task = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'pending',
      });
      const parentStory = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: VALID_WORKER_UUID,
      });
      const blockingTask = createMockTask({
        id: TASK_UUID_B,
        title: 'Blocking Task',
        workStatus: 'pending',
      });

      mockTaskRepoFindById.mockResolvedValue(task);
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory);
      mockTaskRepoGetDependencies.mockResolvedValue([blockingTask]);

      const req = createMockRequest({
        method: 'POST',
        query: { id: TASK_UUID_A },
      });
      const res = createMockResponse();

      await taskStartHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('INVALID_DEPENDENCY');
      expect(body!.error.message).toContain('not complete');
      expect(body!.error.details).toBeDefined();
      const details = body!.error.details as { blockingTaskIds: string[] };
      expect(details.blockingTaskIds).toContain(TASK_UUID_B);
    });

    it('rejects start from non-assigned worker', async () => {
      setWorkerAuth(OTHER_WORKER_UUID);

      const task = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'pending',
      });
      const parentStory = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: VALID_WORKER_UUID,
      });

      mockTaskRepoFindById.mockResolvedValue(task);
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory);

      const req = createMockRequest({
        method: 'POST',
        query: { id: TASK_UUID_A },
      });
      const res = createMockResponse();

      await taskStartHandler(req, res);

      expect(res.getStatusCode()).toBe(403);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('WORKER_NOT_ASSIGNED');
      expect(body!.error.message).toContain('not assigned');
    });

    it('rejects start when task is not in pending status', async () => {
      setWorkerAuth();

      const task = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'in_progress',
      });

      mockTaskRepoFindById.mockResolvedValue(task);

      const req = createMockRequest({
        method: 'POST',
        query: { id: TASK_UUID_A },
      });
      const res = createMockResponse();

      await taskStartHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('rejects start when parent story is not in_progress', async () => {
      setWorkerAuth();

      const task = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'pending',
      });
      const parentStory = createMockStory({
        workStatus: 'pending',
        assignedWorkerId: VALID_WORKER_UUID,
      });

      mockTaskRepoFindById.mockResolvedValue(task);
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory);

      const req = createMockRequest({
        method: 'POST',
        query: { id: TASK_UUID_A },
      });
      const res = createMockResponse();

      await taskStartHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('requires worker authentication', async () => {
      // Session-based auth (human) should be rejected for agent-only route
      setMockSession();
      mockValidateApiKey.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'POST',
        query: { id: TASK_UUID_A },
      });
      const res = createMockResponse();

      await taskStartHandler(req, res);

      expect(res.getStatusCode()).toBe(403);
      const body = res.getJsonBody() as { error: { code: string } } | undefined;
      expect(body!.error.code).toBe('FORBIDDEN');
    });

    it('returns 404 when task does not exist', async () => {
      setWorkerAuth();

      mockTaskRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'POST',
        query: { id: NONEXISTENT_UUID },
      });
      const res = createMockResponse();

      await taskStartHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('TASK_NOT_FOUND');
    });

    it('returns 405 for unsupported HTTP methods on start route', async () => {
      const req = createMockRequest({
        method: 'GET',
        query: { id: TASK_UUID_A },
      });
      const res = createMockResponse();

      await taskStartHandler(req, res);

      expect(res.getStatusCode()).toBe(405);
    });
  });

  // =========================================================================
  // POST /api/v1/tasks/:id/complete -- Complete task
  // =========================================================================

  describe('POST /api/v1/tasks/:id/complete', () => {
    it('completes a task and returns cascade result', async () => {
      setWorkerAuth();

      const task = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'in_progress',
        version: 1,
      });
      const parentStory = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: VALID_WORKER_UUID,
      });
      const completedTask = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'done',
        version: 2,
      });

      mockTaskRepoFindById.mockResolvedValue(task);
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory);
      mockTaskRepoUpdateInTx.mockResolvedValue(completedTask);
      // Cascading re-evaluation mocks
      mockTaskRepoGetDependents.mockResolvedValue([]);
      mockTaskRepoGetProjectIdForTask.mockResolvedValue(VALID_PROJECT_UUID);
      mockTaskRepoFindByStory.mockResolvedValue({
        data: [completedTask],
        pagination: {
          page: 1,
          limit: 1000,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });
      mockEpicRepoComputeDerivedStatus.mockResolvedValue('in_progress');
      mockEpicRepoFindAllByProject.mockResolvedValue([{ workStatus: 'in_progress' }]);

      const req = createMockRequest({
        method: 'POST',
        query: { id: TASK_UUID_A },
      });
      const res = createMockResponse();

      await taskCompleteHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as
        | {
            data: MockTask;
            cascade: {
              unblockedTaskIds: string[];
              storyStatus: string;
              epicStatus: string;
              projectStatus: string;
            };
          }
        | undefined;
      expect(body).toBeDefined();
      expect(body!.data.workStatus).toBe('done');
      expect(body!.cascade).toBeDefined();
      expect(body!.cascade.unblockedTaskIds).toEqual([]);
    });

    it('completes a task and unblocks downstream tasks', async () => {
      setWorkerAuth();

      const task = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'in_progress',
        version: 1,
      });
      const parentStory = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: VALID_WORKER_UUID,
      });
      const completedTask = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'done',
        version: 2,
      });
      const blockedTask = createMockTask({
        id: TASK_UUID_B,
        workStatus: 'blocked',
      });

      mockTaskRepoFindById.mockResolvedValue(task);
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory);
      mockTaskRepoUpdateInTx.mockResolvedValue(completedTask);
      // Cascading: B depends on A (which is now done), B becomes unblocked
      mockTaskRepoGetDependents.mockResolvedValue([blockedTask]);
      // Check all dependencies of B are done
      mockTaskRepoGetDependencies.mockResolvedValue([completedTask]);
      mockTaskRepoBulkUpdateStatus.mockResolvedValue(1);
      mockTaskRepoGetProjectIdForTask.mockResolvedValue(VALID_PROJECT_UUID);
      mockTaskRepoFindByStory.mockResolvedValue({
        data: [completedTask, { ...blockedTask, workStatus: 'pending' }],
        pagination: {
          page: 1,
          limit: 1000,
          total: 2,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });
      mockEpicRepoComputeDerivedStatus.mockResolvedValue('in_progress');
      mockEpicRepoFindAllByProject.mockResolvedValue([{ workStatus: 'in_progress' }]);

      const req = createMockRequest({
        method: 'POST',
        query: { id: TASK_UUID_A },
      });
      const res = createMockResponse();

      await taskCompleteHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as
        | {
            data: MockTask;
            cascade: {
              unblockedTaskIds: string[];
              storyStatus: string;
            };
          }
        | undefined;
      expect(body!.cascade.unblockedTaskIds).toContain(TASK_UUID_B);
      expect(mockTaskRepoBulkUpdateStatus).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        [TASK_UUID_B],
        'pending',
      );
    });

    it('cascades through multi-level dependencies (A -> B -> C chain)', async () => {
      setWorkerAuth();

      // Completing task A should unblock B. B is blocked and depends only on A.
      // C depends on B and remains blocked (B not done yet).
      const taskA = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'in_progress',
        version: 1,
      });
      const parentStory = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: VALID_WORKER_UUID,
      });
      const completedA = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'done',
        version: 2,
      });
      const blockedB = createMockTask({
        id: TASK_UUID_B,
        workStatus: 'blocked',
      });
      const blockedC = createMockTask({
        id: TASK_UUID_C,
        workStatus: 'blocked',
      });

      mockTaskRepoFindById.mockResolvedValue(taskA);
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory);
      mockTaskRepoUpdateInTx.mockResolvedValue(completedA);
      // Cascading: A's dependents = [B]; B depends on A (done) -> unblocked
      // C is not a direct dependent of A, so it's not checked in this cascade
      mockTaskRepoGetDependents.mockResolvedValue([blockedB]);
      // B's dependencies are all done (only A)
      mockTaskRepoGetDependencies.mockResolvedValue([completedA]);
      mockTaskRepoBulkUpdateStatus.mockResolvedValue(1);
      mockTaskRepoGetProjectIdForTask.mockResolvedValue(VALID_PROJECT_UUID);
      mockTaskRepoFindByStory.mockResolvedValue({
        data: [completedA, { ...blockedB, workStatus: 'pending' }, blockedC],
        pagination: {
          page: 1,
          limit: 1000,
          total: 3,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });
      mockEpicRepoComputeDerivedStatus.mockResolvedValue('in_progress');
      mockEpicRepoFindAllByProject.mockResolvedValue([{ workStatus: 'in_progress' }]);

      const req = createMockRequest({
        method: 'POST',
        query: { id: TASK_UUID_A },
      });
      const res = createMockResponse();

      await taskCompleteHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as
        | {
            cascade: { unblockedTaskIds: string[] };
          }
        | undefined;
      // B should be unblocked, C remains blocked (depends on B, not A)
      expect(body!.cascade.unblockedTaskIds).toContain(TASK_UUID_B);
      expect(body!.cascade.unblockedTaskIds).not.toContain(TASK_UUID_C);
    });

    it('does not unblock task if other dependencies are still incomplete', async () => {
      setWorkerAuth();

      // C depends on both A and B. Only A is completed. C should remain blocked.
      const taskA = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'in_progress',
        version: 1,
      });
      const parentStory = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: VALID_WORKER_UUID,
      });
      const completedA = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'done',
        version: 2,
      });
      const pendingB = createMockTask({
        id: TASK_UUID_B,
        workStatus: 'pending',
      });
      const blockedC = createMockTask({
        id: TASK_UUID_C,
        workStatus: 'blocked',
      });

      mockTaskRepoFindById.mockResolvedValue(taskA);
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory);
      mockTaskRepoUpdateInTx.mockResolvedValue(completedA);
      // A's dependents = [C] (C depends on both A and B)
      mockTaskRepoGetDependents.mockResolvedValue([blockedC]);
      // C's dependencies: A (done) + B (pending) -> NOT all done -> stays blocked
      mockTaskRepoGetDependencies.mockResolvedValue([completedA, pendingB]);
      mockTaskRepoGetProjectIdForTask.mockResolvedValue(VALID_PROJECT_UUID);
      mockTaskRepoFindByStory.mockResolvedValue({
        data: [completedA, pendingB, blockedC],
        pagination: {
          page: 1,
          limit: 1000,
          total: 3,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      });
      mockEpicRepoComputeDerivedStatus.mockResolvedValue('in_progress');
      mockEpicRepoFindAllByProject.mockResolvedValue([{ workStatus: 'in_progress' }]);

      const req = createMockRequest({
        method: 'POST',
        query: { id: TASK_UUID_A },
      });
      const res = createMockResponse();

      await taskCompleteHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as
        | {
            cascade: { unblockedTaskIds: string[] };
          }
        | undefined;
      // C should NOT be unblocked since B is still pending
      expect(body!.cascade.unblockedTaskIds).not.toContain(TASK_UUID_C);
      expect(mockTaskRepoBulkUpdateStatus).not.toHaveBeenCalled();
    });

    it('rejects complete when task is not in_progress', async () => {
      setWorkerAuth();

      const task = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'pending',
      });

      mockTaskRepoFindById.mockResolvedValue(task);

      const req = createMockRequest({
        method: 'POST',
        query: { id: TASK_UUID_A },
      });
      const res = createMockResponse();

      await taskCompleteHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('INVALID_STATUS_TRANSITION');
      expect(body!.error.message).toContain('in_progress');
    });

    it('rejects complete from non-assigned worker', async () => {
      setWorkerAuth(OTHER_WORKER_UUID);

      const task = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'in_progress',
      });
      const parentStory = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: VALID_WORKER_UUID,
      });

      mockTaskRepoFindById.mockResolvedValue(task);
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory);

      const req = createMockRequest({
        method: 'POST',
        query: { id: TASK_UUID_A },
      });
      const res = createMockResponse();

      await taskCompleteHandler(req, res);

      expect(res.getStatusCode()).toBe(403);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('WORKER_NOT_ASSIGNED');
    });

    it('requires worker authentication', async () => {
      // Session-based auth (human) should be rejected for agent-only route
      setMockSession();
      mockValidateApiKey.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'POST',
        query: { id: TASK_UUID_A },
      });
      const res = createMockResponse();

      await taskCompleteHandler(req, res);

      expect(res.getStatusCode()).toBe(403);
      const body = res.getJsonBody() as { error: { code: string } } | undefined;
      expect(body!.error.code).toBe('FORBIDDEN');
    });

    it('returns 404 when task does not exist', async () => {
      setWorkerAuth();

      mockTaskRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'POST',
        query: { id: NONEXISTENT_UUID },
      });
      const res = createMockResponse();

      await taskCompleteHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope | undefined;
      expect(body!.error.code).toBe('TASK_NOT_FOUND');
    });

    it('returns 405 for unsupported HTTP methods on complete route', async () => {
      const req = createMockRequest({
        method: 'GET',
        query: { id: TASK_UUID_A },
      });
      const res = createMockResponse();

      await taskCompleteHandler(req, res);

      expect(res.getStatusCode()).toBe(405);
    });
  });

  // =========================================================================
  // Dependency Edge Cleanup
  // =========================================================================

  describe('Dependency Edge Cleanup', () => {
    it('removes all edges when task is soft-deleted', async () => {
      const task = createMockTask({ id: TASK_UUID_B });
      const parentStory = createMockStory({ workStatus: 'pending' });

      mockTaskRepoFindById.mockResolvedValue(task);
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory);
      mockTaskRepoGetDependentIdsInTx.mockResolvedValue([TASK_UUID_A, TASK_UUID_C]);
      mockTaskRepoRemoveAllEdgesInTx.mockResolvedValue(undefined);
      mockTaskRepoSoftDeleteInTx.mockResolvedValue({
        ...task,
        deletedAt: now,
      });

      const req = createMockRequest({
        method: 'DELETE',
        query: { id: TASK_UUID_B },
      });
      const res = createMockResponse();

      await taskDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(204);
      // Verify all edges were removed (removeAllEdgesInTx was called)
      expect(mockTaskRepoRemoveAllEdgesInTx).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        TASK_UUID_B,
        expect.anything(),
      );
    });

    it('verifies soft-delete transaction calls on edge cleanup', async () => {
      // Deleting B which was blocking C; C's dependency is removed
      const task = createMockTask({ id: TASK_UUID_B });
      const parentStory = createMockStory({ workStatus: 'pending' });

      mockTaskRepoFindById.mockResolvedValue(task);
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory);
      mockTaskRepoGetDependentIdsInTx.mockResolvedValue([TASK_UUID_C]);
      mockTaskRepoRemoveAllEdgesInTx.mockResolvedValue(undefined);
      mockTaskRepoSoftDeleteInTx.mockResolvedValue({
        ...task,
        deletedAt: now,
      });

      const req = createMockRequest({
        method: 'DELETE',
        query: { id: TASK_UUID_B },
      });
      const res = createMockResponse();

      await taskDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(204);
      // Verify soft-delete was called
      expect(mockTaskRepoSoftDeleteInTx).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        TASK_UUID_B,
        expect.anything(),
      );
    });

    it('returns 204 when deleted task has no dependents', async () => {
      const task = createMockTask({ id: TASK_UUID_A });
      const parentStory = createMockStory({ workStatus: 'pending' });

      mockTaskRepoFindById.mockResolvedValue(task);
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory);
      mockTaskRepoGetDependentIdsInTx.mockResolvedValue([]);
      mockTaskRepoRemoveAllEdgesInTx.mockResolvedValue(undefined);
      mockTaskRepoSoftDeleteInTx.mockResolvedValue({
        ...task,
        deletedAt: now,
      });

      const req = createMockRequest({
        method: 'DELETE',
        query: { id: TASK_UUID_A },
      });
      const res = createMockResponse();

      await taskDetailHandler(req, res);

      expect(res.getStatusCode()).toBe(204);
    });
  });
});

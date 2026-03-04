/**
 * @module completion.integration.test
 *
 * Integration tests for all completion, failure, and reset flows:
 *
 * - POST /api/v1/tasks/:id/complete     -- Complete a task with cascading re-evaluation
 * - POST /api/v1/stories/:id/complete   -- Complete a story with cost recording
 * - POST /api/v1/stories/:id/fail       -- Fail a story with error details
 * - POST /api/v1/stories/:id/reset      -- Reset a failed story (human-only)
 *
 * Tests invoke handler functions directly with mock request/response objects.
 * The database layer and auth layer are mocked to enable isolated,
 * deterministic testing without requiring a running database or auth server.
 *
 * Test coverage:
 * - Task completion with cascading re-evaluation (linear chain, fan-in)
 * - Cross-story task dependency cascading
 * - all_tasks_complete flag behavior
 * - Story NOT auto-completed after all tasks done
 * - Story completion with cost recording and worker assignment clearing
 * - Status propagation to epic and project on story completion
 * - Cost validation (non-negative, decimal precision)
 * - Story failure with worker assignment preservation
 * - Attempt history creation with task status snapshot
 * - Story reset with DAG-based status determination
 * - Reset preserves completed tasks
 * - Reset is human-auth only
 * - End-to-end happy path lifecycle
 * - Failure recovery lifecycle (fail, reset, re-assign, complete)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockRequest, createMockResponse } from '@/__tests__/helpers/mock-api';
import {
  setMockSession,
  clearMockSession,
  getMockSession,
  TEST_TENANT_ID,
} from '@/__tests__/helpers/mock-auth';

import type { WorkerAuthContext } from '@/lib/middleware/api-key-validator';

// ---------------------------------------------------------------------------
// UUIDs for tests
// ---------------------------------------------------------------------------

const STORY_UUID = '550e8400-e29b-41d4-a716-446655440001';
const STORY_UUID_2 = '550e8400-e29b-41d4-a716-446655440002';
const EPIC_UUID = '660e8400-e29b-41d4-a716-446655440001';
const PROJECT_UUID = '770e8400-e29b-41d4-a716-446655440001';
const WORKER_UUID = '880e8400-e29b-41d4-a716-446655440001';
const OTHER_WORKER_UUID = '880e8400-e29b-41d4-a716-446655440099';
const TASK_UUID_A = 'aa0e8400-e29b-41d4-a716-446655440001';
const TASK_UUID_B = 'bb0e8400-e29b-41d4-a716-446655440002';
const TASK_UUID_C = 'cc0e8400-e29b-41d4-a716-446655440003';
const NONEXISTENT_UUID = '00000000-0000-4000-a000-000000000000';

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

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId: string;
  };
}

// ---------------------------------------------------------------------------
// Mock data factories
// ---------------------------------------------------------------------------

const now = new Date('2025-06-01T12:00:00Z');
const assignedAt = new Date('2025-06-01T10:00:00Z');

const createMockTask = (overrides: Partial<MockTask> = {}): MockTask => ({
  id: TASK_UUID_A,
  tenantId: TEST_TENANT_ID,
  userStoryId: STORY_UUID,
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

const createMockStory = (overrides: Partial<MockStory> = {}): MockStory => ({
  id: STORY_UUID,
  tenantId: TEST_TENANT_ID,
  epicId: EPIC_UUID,
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

// Task repo mocks
const mockTaskRepoFindById = vi.fn<(tenantId: string, id: string) => Promise<MockTask | null>>();
const mockTaskRepoGetParentStory =
  vi.fn<(tenantId: string, taskId: string) => Promise<MockStory | null>>();
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
const mockTaskRepoWithTransaction =
  vi.fn<(fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>>();
const mockTaskRepoFindByStory = vi.fn();
const mockTaskRepoGetDependents =
  vi.fn<(tenantId: string, taskId: string) => Promise<MockTask[]>>();
const mockTaskRepoGetDependencies =
  vi.fn<(tenantId: string, taskId: string) => Promise<MockTask[]>>();
const mockTaskRepoBulkUpdateStatus =
  vi.fn<(tenantId: string, taskIds: string[], status: string) => Promise<number>>();
const mockTaskRepoGetProjectIdForTask =
  vi.fn<(tenantId: string, taskId: string) => Promise<string | null>>();
const mockTaskRepoGetProjectIdForStory =
  vi.fn<(tenantId: string, storyId: string) => Promise<string | null>>();

// Story repo mocks
const mockStoryRepoFindById = vi.fn<(tenantId: string, id: string) => Promise<MockStory | null>>();
const mockStoryRepoUpdate = vi.fn();
const mockStoryRepoCompleteAssignment = vi.fn();
const mockStoryRepoHasIncompleteUpstreamDependencies = vi.fn();
const mockStoryRepoResetStory = vi.fn();

// Epic repo mocks
const mockEpicRepoFindById = vi.fn();
const mockEpicRepoComputeDerivedStatus =
  vi.fn<(tenantId: string, epicId: string) => Promise<string>>();
const mockEpicRepoFindAllByProject = vi.fn();

// Project repo mocks
const mockProjectRepoFindById = vi.fn();
const mockProjectRepoUpdateWorkStatus = vi.fn();

// Audit writer mock
const mockWriteAuditEvent = vi.fn();

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
const mockValidateApiKey = vi.fn<() => Promise<WorkerAuthContext | null>>(async () => null);
vi.mock('@/lib/middleware/api-key-validator', () => ({
  validateApiKey: () => mockValidateApiKey(),
}));

/**
 * Mock @laila/database -- provides mock repository factories and getDb.
 */
vi.mock('@laila/database', () => ({
  getDb: vi.fn(() => ({})),
  createTaskRepository: vi.fn(() => ({
    findById: mockTaskRepoFindById,
    getParentStory: mockTaskRepoGetParentStory,
    updateInTx: mockTaskRepoUpdateInTx,
    withTransaction: mockTaskRepoWithTransaction,
    findByStory: mockTaskRepoFindByStory,
    getDependents: mockTaskRepoGetDependents,
    getDependencies: mockTaskRepoGetDependencies,
    bulkUpdateStatus: mockTaskRepoBulkUpdateStatus,
    getProjectIdForTask: mockTaskRepoGetProjectIdForTask,
    getProjectIdForStory: mockTaskRepoGetProjectIdForStory,
  })),
  createStoryRepository: vi.fn(() => ({
    findById: mockStoryRepoFindById,
    update: mockStoryRepoUpdate,
    completeAssignment: mockStoryRepoCompleteAssignment,
    hasIncompleteUpstreamDependencies: mockStoryRepoHasIncompleteUpstreamDependencies,
    resetStory: mockStoryRepoResetStory,
    withTransaction: mockTaskRepoWithTransaction,
  })),
  createEpicRepository: vi.fn(() => ({
    findById: mockEpicRepoFindById,
    computeDerivedStatus: mockEpicRepoComputeDerivedStatus,
    findAllByProject: mockEpicRepoFindAllByProject,
  })),
  createProjectRepository: vi.fn(() => ({
    findById: mockProjectRepoFindById,
    updateWorkStatus: mockProjectRepoUpdateWorkStatus,
  })),
  writeAuditEvent: (...args: unknown[]) => mockWriteAuditEvent(...args),
  writeAuditEventFireAndForget: vi.fn(),
  attemptHistoryTable: {
    userStoryId: 'user_story_id',
    tenantId: 'tenant_id',
    attemptNumber: 'attempt_number',
    status: 'status',
    startedAt: 'started_at',
  },
  userStoriesTable: {
    id: 'id',
    tenantId: 'tenant_id',
    version: 'version',
    workStatus: 'work_status',
  },
}));

/**
 * Mock @/lib/api/cascading-reevaluation -- used by task completion.
 */
const mockTriggerCascadingReevaluation = vi.fn();
vi.mock('@/lib/api/cascading-reevaluation', () => ({
  triggerCascadingReevaluation: (...args: unknown[]) => mockTriggerCascadingReevaluation(...args),
}));

/**
 * Mock drizzle-orm -- used by the story fail endpoint for direct DB queries.
 */
vi.mock('drizzle-orm', () => {
  // sql needs to work both as a function and as a template tag
  const sqlFn = vi.fn((...args: unknown[]) => ({ type: 'sql', args }));
  return {
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    sql: sqlFn,
  };
});

// ---------------------------------------------------------------------------
// Import handlers AFTER mocks are registered
// ---------------------------------------------------------------------------

const { default: taskCompleteHandler } = await import('@/pages/api/v1/tasks/[id]/complete');
const { default: storyCompleteHandler } = await import('@/pages/api/v1/stories/[id]/complete');
const { default: storyFailHandler } = await import('@/pages/api/v1/stories/[id]/fail');
const { default: storyResetHandler } = await import('@/pages/api/v1/stories/[id]/reset');

// ---------------------------------------------------------------------------
// Helper: simulate worker auth
// ---------------------------------------------------------------------------

const setWorkerAuth = (workerId: string = WORKER_UUID): void => {
  clearMockSession();
  mockValidateApiKey.mockResolvedValue({
    type: 'agent' as const,
    workerId,
    workerName: 'Test Worker',
    tenantId: TEST_TENANT_ID,
    projectAccess: [PROJECT_UUID],
  });
};

// ---------------------------------------------------------------------------
// Helper: mock withTransaction to execute the callback immediately
// ---------------------------------------------------------------------------

const setupTransactionMock = (): void => {
  mockTaskRepoWithTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })) }),
  );
};

/**
 * Sets up a mock transaction for story completion that simulates
 * the drizzle tx.update().set().where().returning() chain.
 *
 * @param storyReturnValue The updated story to return from the first tx.update call
 */
const setupStoryCompleteTxMock = (storyReturnValue: MockStory): void => {
  mockTaskRepoWithTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    let updateCallCount = 0;
    const mockTx = {
      update: vi.fn(() => {
        updateCallCount += 1;
        const isStoryUpdate = updateCallCount === 1;
        return {
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              // Only the story update uses .returning()
              returning: vi.fn(async () => (isStoryUpdate ? [storyReturnValue] : [])),
            })),
          })),
        };
      }),
    };
    return fn(mockTx);
  });
};

// ---------------------------------------------------------------------------
// Helper: create a standard pagination wrapper for findByStory results
// ---------------------------------------------------------------------------

const createFindByStoryResult = (tasks: MockTask[]) => ({
  data: tasks,
  pagination: {
    page: 1,
    limit: 1000,
    total: tasks.length,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  },
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Completion & Failure Integration Tests', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setMockSession();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    setupTransactionMock();
    mockWriteAuditEvent.mockResolvedValue({});
    mockEpicRepoFindById.mockResolvedValue({ workStatus: 'in_progress' });
    mockProjectRepoFindById.mockResolvedValue({ workStatus: 'in_progress' });
  });

  afterEach(() => {
    clearMockSession();
    vi.clearAllMocks();
    consoleErrorSpy.mockRestore();
    mockValidateApiKey.mockReset();
    mockValidateApiKey.mockResolvedValue(null);
  });

  // =========================================================================
  // Task Completion
  // =========================================================================

  describe('Task Completion', () => {
    it('marks task as complete and sets completed_at', async () => {
      setWorkerAuth();

      const task = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'in_progress',
        version: 1,
      });
      const parentStory = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
      });
      const completedTask = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'done',
        completedAt: now,
        version: 2,
      });

      mockTaskRepoFindById.mockResolvedValue(task);
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory);
      mockStoryRepoFindById.mockResolvedValue(parentStory);
      mockTaskRepoUpdateInTx.mockResolvedValue(completedTask);
      mockTriggerCascadingReevaluation.mockResolvedValue({
        unblockedTasks: [],
        allTasksComplete: true,
        storyStatus: 'in_progress',
        epicStatus: 'in_progress',
        projectStatus: 'in_progress',
      });

      const req = createMockRequest({
        method: 'POST',
        query: { id: TASK_UUID_A },
      });
      const res = createMockResponse();

      await taskCompleteHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as {
        data: {
          task: { id: string; name: string; status: string; completed_at: string | null };
          cascading_updates: {
            unblocked_tasks: Array<{ id: string; name: string; new_status: string }>;
            all_tasks_complete: boolean;
          };
        };
      };
      expect(body.data.task.id).toBe(TASK_UUID_A);
      expect(body.data.task.status).toBe('complete');
      expect(body.data.task.completed_at).toBeDefined();
    });

    it('unblocks downstream tasks when all dependencies are complete (linear chain)', async () => {
      setWorkerAuth();

      // Chain: A -> B -> C (completing A should report B as unblocked)
      const taskA = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'in_progress',
        version: 1,
      });
      const parentStory = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
      });
      const completedA = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'done',
        completedAt: now,
        version: 2,
      });

      mockTaskRepoFindById.mockResolvedValue(taskA);
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory);
      mockStoryRepoFindById.mockResolvedValue(parentStory);
      mockTaskRepoUpdateInTx.mockResolvedValue(completedA);

      // Cascading re-evaluation returns B as unblocked
      mockTriggerCascadingReevaluation.mockResolvedValue({
        unblockedTasks: [{ id: TASK_UUID_B, name: 'Task B', newStatus: 'pending' }],
        allTasksComplete: false,
        storyStatus: 'in_progress',
        epicStatus: 'in_progress',
        projectStatus: 'in_progress',
      });

      const req = createMockRequest({
        method: 'POST',
        query: { id: TASK_UUID_A },
      });
      const res = createMockResponse();

      await taskCompleteHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as {
        data: {
          task: { id: string };
          cascading_updates: {
            unblocked_tasks: Array<{ id: string; name: string; new_status: string }>;
            all_tasks_complete: boolean;
          };
        };
      };
      expect(body.data.cascading_updates.unblocked_tasks).toHaveLength(1);
      expect(body.data.cascading_updates.unblocked_tasks[0]!.id).toBe(TASK_UUID_B);
      expect(body.data.cascading_updates.unblocked_tasks[0]!.new_status).toBe('not_started');
      expect(body.data.cascading_updates.all_tasks_complete).toBe(false);

      // Verify cascading was called with the right args
      expect(mockTriggerCascadingReevaluation).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        TASK_UUID_A,
        expect.anything(), // tx object
      );
    });

    it('does not unblock downstream task if other dependencies remain (fan-in)', async () => {
      setWorkerAuth();

      // Fan-in: A -> C, B -> C. Complete A only. C should remain blocked.
      const taskA = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'in_progress',
        version: 1,
      });
      const parentStory = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
      });
      const completedA = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'done',
        completedAt: now,
        version: 2,
      });

      mockTaskRepoFindById.mockResolvedValue(taskA);
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory);
      mockStoryRepoFindById.mockResolvedValue(parentStory);
      mockTaskRepoUpdateInTx.mockResolvedValue(completedA);

      // C has two deps; only A is done, so C is NOT unblocked
      mockTriggerCascadingReevaluation.mockResolvedValue({
        unblockedTasks: [],
        allTasksComplete: false,
        storyStatus: 'in_progress',
        epicStatus: 'in_progress',
        projectStatus: 'in_progress',
      });

      const req = createMockRequest({
        method: 'POST',
        query: { id: TASK_UUID_A },
      });
      const res = createMockResponse();

      await taskCompleteHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as {
        data: {
          cascading_updates: {
            unblocked_tasks: Array<{ id: string }>;
            all_tasks_complete: boolean;
          };
        };
      };
      expect(body.data.cascading_updates.unblocked_tasks).toHaveLength(0);
      expect(body.data.cascading_updates.all_tasks_complete).toBe(false);
    });

    it('handles cross-story downstream tasks', async () => {
      setWorkerAuth();

      // Task in Story 1 depends on task in Story 2.
      // Completing the Story 2 task triggers cascading re-evaluation
      // which finds the cross-story dependent and unblocks it.
      const taskInStory2 = createMockTask({
        id: TASK_UUID_A,
        userStoryId: STORY_UUID_2,
        workStatus: 'in_progress',
        version: 1,
      });
      const parentStory2 = createMockStory({
        id: STORY_UUID_2,
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
      });
      const completedTask = createMockTask({
        id: TASK_UUID_A,
        userStoryId: STORY_UUID_2,
        workStatus: 'done',
        completedAt: now,
        version: 2,
      });

      mockTaskRepoFindById.mockResolvedValue(taskInStory2);
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory2);
      mockStoryRepoFindById.mockResolvedValue(parentStory2);
      mockTaskRepoUpdateInTx.mockResolvedValue(completedTask);

      // Cascading re-evaluation unblocks a cross-story task
      mockTriggerCascadingReevaluation.mockResolvedValue({
        unblockedTasks: [{ id: TASK_UUID_B, name: 'Cross-Story Task', newStatus: 'pending' }],
        allTasksComplete: true,
        storyStatus: 'in_progress',
        epicStatus: 'in_progress',
        projectStatus: 'in_progress',
      });

      const req = createMockRequest({
        method: 'POST',
        query: { id: TASK_UUID_A },
      });
      const res = createMockResponse();

      await taskCompleteHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as {
        data: {
          cascading_updates: {
            unblocked_tasks: Array<{ id: string; name: string }>;
          };
        };
      };
      expect(body.data.cascading_updates.unblocked_tasks).toHaveLength(1);
      expect(body.data.cascading_updates.unblocked_tasks[0]!.id).toBe(TASK_UUID_B);
    });

    it('reports all_tasks_complete flag when all tasks done', async () => {
      setWorkerAuth();

      const task = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'in_progress',
        version: 1,
      });
      const parentStory = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
      });
      const completedTask = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'done',
        completedAt: now,
        version: 2,
      });

      mockTaskRepoFindById.mockResolvedValue(task);
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory);
      mockStoryRepoFindById.mockResolvedValue(parentStory);
      mockTaskRepoUpdateInTx.mockResolvedValue(completedTask);
      mockTriggerCascadingReevaluation.mockResolvedValue({
        unblockedTasks: [],
        allTasksComplete: true,
        storyStatus: 'in_progress',
        epicStatus: 'in_progress',
        projectStatus: 'in_progress',
      });

      const req = createMockRequest({
        method: 'POST',
        query: { id: TASK_UUID_A },
      });
      const res = createMockResponse();

      await taskCompleteHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as {
        data: {
          cascading_updates: { all_tasks_complete: boolean };
        };
      };
      expect(body.data.cascading_updates.all_tasks_complete).toBe(true);
    });

    it('does not auto-complete the story when all tasks are done', async () => {
      setWorkerAuth();

      const task = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'in_progress',
        version: 1,
      });
      const parentStory = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
      });
      const completedTask = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'done',
        completedAt: now,
        version: 2,
      });

      mockTaskRepoFindById.mockResolvedValue(task);
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory);
      mockStoryRepoFindById.mockResolvedValue(parentStory);
      mockTaskRepoUpdateInTx.mockResolvedValue(completedTask);
      // Cascading says all tasks complete, but story stays in_progress
      mockTriggerCascadingReevaluation.mockResolvedValue({
        unblockedTasks: [],
        allTasksComplete: true,
        storyStatus: 'in_progress',
        epicStatus: 'in_progress',
        projectStatus: 'in_progress',
      });

      const req = createMockRequest({
        method: 'POST',
        query: { id: TASK_UUID_A },
      });
      const res = createMockResponse();

      await taskCompleteHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      // Verify the story repo was NOT called to complete the story
      expect(mockStoryRepoCompleteAssignment).not.toHaveBeenCalled();
      // Verify the response indicates story is still in_progress
      const body = res.getJsonBody() as {
        data: {
          cascading_updates: { all_tasks_complete: boolean };
        };
      };
      expect(body.data.cascading_updates.all_tasks_complete).toBe(true);
      // The story is still in_progress -- worker must call story complete explicitly
    });

    it('rejects completion from non-assigned worker', async () => {
      setWorkerAuth(OTHER_WORKER_UUID);

      const task = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'in_progress',
      });
      const parentStory = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
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
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('WORKER_NOT_ASSIGNED');
    });

    it('rejects completion when task is not in_progress', async () => {
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
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('INVALID_STATUS_TRANSITION');
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
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('TASK_NOT_FOUND');
    });

    it('requires worker authentication (rejects human auth)', async () => {
      // Human session auth should be rejected for agent-only route
      setMockSession();
      mockValidateApiKey.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'POST',
        query: { id: TASK_UUID_A },
      });
      const res = createMockResponse();

      await taskCompleteHandler(req, res);

      expect(res.getStatusCode()).toBe(403);
      const body = res.getJsonBody() as { error: { code: string } };
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // Story Completion
  // =========================================================================

  describe('Story Completion', () => {
    it('records cost data and sets completed_at', async () => {
      setWorkerAuth();

      const story = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
        assignedAt,
        attempts: 1,
      });
      const doneTask = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'done',
        completedAt: now,
      });
      const updatedStory = createMockStory({
        workStatus: 'done',
        assignedWorkerId: null,
        assignedAt: null,
        actualCost: '1.5000',
        updatedAt: now,
      });

      mockStoryRepoFindById.mockResolvedValue(story);
      mockTaskRepoFindByStory.mockResolvedValue(createFindByStoryResult([doneTask]));
      setupStoryCompleteTxMock(updatedStory);
      mockEpicRepoComputeDerivedStatus.mockResolvedValue('in_progress');
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(PROJECT_UUID);
      mockEpicRepoFindAllByProject.mockResolvedValue([{ workStatus: 'in_progress' }]);

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { cost_usd: 1.5, cost_tokens: 5000 },
      });
      const res = createMockResponse();

      await storyCompleteHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as {
        data: {
          story: {
            id: string;
            name: string;
            status: string;
            completed_at: string;
            cost_usd: number;
            cost_tokens: number;
            duration_seconds: number;
          };
          epic_status: string;
          project_status: string;
        };
      };
      expect(body.data.story.cost_usd).toBe(1.5);
      expect(body.data.story.cost_tokens).toBe(5000);
      expect(body.data.story.status).toBe('done');
      expect(body.data.story.completed_at).toBeDefined();

      // Verify transaction was used for atomic story completion
      expect(mockTaskRepoWithTransaction).toHaveBeenCalled();
    });

    it('clears worker assignment on completion', async () => {
      setWorkerAuth();

      const story = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
        assignedAt,
        attempts: 1,
      });
      const doneTask = createMockTask({ workStatus: 'done' });
      const updatedStory = createMockStory({
        workStatus: 'done',
        assignedWorkerId: null,
        assignedAt: null,
        updatedAt: now,
      });

      mockStoryRepoFindById.mockResolvedValue(story);
      mockTaskRepoFindByStory.mockResolvedValue(createFindByStoryResult([doneTask]));
      setupStoryCompleteTxMock(updatedStory);
      mockEpicRepoComputeDerivedStatus.mockResolvedValue('in_progress');
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(PROJECT_UUID);
      mockEpicRepoFindAllByProject.mockResolvedValue([{ workStatus: 'in_progress' }]);

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { cost_usd: 0.5, cost_tokens: 2000 },
      });
      const res = createMockResponse();

      await storyCompleteHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      // Transaction handles clearing the worker assignment atomically
      expect(mockTaskRepoWithTransaction).toHaveBeenCalled();
    });

    it('propagates completion to epic and project', async () => {
      setWorkerAuth();

      const story = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
        assignedAt,
        attempts: 1,
      });
      const doneTask = createMockTask({ workStatus: 'done' });
      const updatedStory = createMockStory({
        workStatus: 'done',
        assignedWorkerId: null,
        updatedAt: now,
      });

      mockStoryRepoFindById.mockResolvedValue(story);
      mockTaskRepoFindByStory.mockResolvedValue(createFindByStoryResult([doneTask]));
      setupStoryCompleteTxMock(updatedStory);
      // All epics done -> project done
      mockEpicRepoComputeDerivedStatus.mockResolvedValue('done');
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(PROJECT_UUID);
      mockEpicRepoFindAllByProject.mockResolvedValue([{ workStatus: 'done' }]);

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { cost_usd: 2.0, cost_tokens: 10000 },
      });
      const res = createMockResponse();

      await storyCompleteHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as {
        data: {
          epic_status: string;
          project_status: string;
        };
      };
      expect(body.data.epic_status).toBe('done');
      expect(body.data.project_status).toBe('done');

      // Verify epic status was computed
      expect(mockEpicRepoComputeDerivedStatus).toHaveBeenCalledWith(TEST_TENANT_ID, EPIC_UUID);
      // Verify project status was updated to done
      expect(mockProjectRepoUpdateWorkStatus).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        PROJECT_UUID,
        'done',
      );
    });

    it('rejects negative cost values', async () => {
      setWorkerAuth();

      const story = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
      });
      mockStoryRepoFindById.mockResolvedValue(story);

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { cost_usd: -1.5, cost_tokens: 5000 },
      });
      const res = createMockResponse();

      await storyCompleteHandler(req, res);

      // Zod validation should reject negative cost_usd
      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects negative cost_tokens values', async () => {
      setWorkerAuth();

      const story = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
      });
      mockStoryRepoFindById.mockResolvedValue(story);

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { cost_usd: 1.5, cost_tokens: -100 },
      });
      const res = createMockResponse();

      await storyCompleteHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });

    it('handles proper decimal cost values', async () => {
      setWorkerAuth();

      const story = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
        assignedAt,
        attempts: 1,
      });
      const doneTask = createMockTask({ workStatus: 'done' });
      const updatedStory = createMockStory({
        workStatus: 'done',
        assignedWorkerId: null,
        updatedAt: now,
      });

      mockStoryRepoFindById.mockResolvedValue(story);
      mockTaskRepoFindByStory.mockResolvedValue(createFindByStoryResult([doneTask]));
      setupStoryCompleteTxMock(updatedStory);
      mockEpicRepoComputeDerivedStatus.mockResolvedValue('in_progress');
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(PROJECT_UUID);
      mockEpicRepoFindAllByProject.mockResolvedValue([{ workStatus: 'in_progress' }]);

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { cost_usd: 0.01, cost_tokens: 0 },
      });
      const res = createMockResponse();

      await storyCompleteHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      // Verify transaction was used for atomic story completion
      expect(mockTaskRepoWithTransaction).toHaveBeenCalled();
    });

    it('rejects completion when tasks are not all complete', async () => {
      setWorkerAuth();

      const story = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
      });
      const doneTask = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'done',
      });
      const pendingTask = createMockTask({
        id: TASK_UUID_B,
        title: 'Incomplete Task',
        workStatus: 'pending',
      });

      mockStoryRepoFindById.mockResolvedValue(story);
      mockTaskRepoFindByStory.mockResolvedValue(createFindByStoryResult([doneTask, pendingTask]));

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { cost_usd: 1.0, cost_tokens: 5000 },
      });
      const res = createMockResponse();

      await storyCompleteHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('VALIDATION_FAILED');
      expect(body.error.message).toContain('task(s) are not in "done" status');
    });

    it('computes correct duration_seconds', async () => {
      setWorkerAuth();

      // Story was assigned 2 hours ago
      const twoHoursAgo = new Date('2025-06-01T10:00:00Z');
      const completionTime = new Date('2025-06-01T12:00:00Z');

      const story = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
        assignedAt: twoHoursAgo,
        attempts: 1,
      });
      const doneTask = createMockTask({ workStatus: 'done' });
      const updatedStory = createMockStory({
        workStatus: 'done',
        assignedWorkerId: null,
        updatedAt: completionTime,
      });

      mockStoryRepoFindById.mockResolvedValue(story);
      mockTaskRepoFindByStory.mockResolvedValue(createFindByStoryResult([doneTask]));
      setupStoryCompleteTxMock(updatedStory);
      mockEpicRepoComputeDerivedStatus.mockResolvedValue('in_progress');
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(PROJECT_UUID);
      mockEpicRepoFindAllByProject.mockResolvedValue([{ workStatus: 'in_progress' }]);

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { cost_usd: 1.0, cost_tokens: 3000 },
      });
      const res = createMockResponse();

      await storyCompleteHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as {
        data: {
          story: { duration_seconds: number };
        };
      };
      // 2 hours = 7200 seconds
      expect(body.data.story.duration_seconds).toBe(7200);
    });

    it('rejects completion from non-assigned worker', async () => {
      setWorkerAuth(OTHER_WORKER_UUID);

      const story = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
      });

      mockStoryRepoFindById.mockResolvedValue(story);

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { cost_usd: 1.0, cost_tokens: 3000 },
      });
      const res = createMockResponse();

      await storyCompleteHandler(req, res);

      expect(res.getStatusCode()).toBe(403);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('WORKER_NOT_ASSIGNED');
    });

    it('returns 404 when story does not exist', async () => {
      setWorkerAuth();
      mockStoryRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'POST',
        query: { id: NONEXISTENT_UUID },
        body: { cost_usd: 1.0, cost_tokens: 3000 },
      });
      const res = createMockResponse();

      await storyCompleteHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('STORY_NOT_FOUND');
    });

    it('rejects completion when story is not in_progress', async () => {
      setWorkerAuth();

      const story = createMockStory({
        workStatus: 'pending',
        assignedWorkerId: WORKER_UUID,
      });
      mockStoryRepoFindById.mockResolvedValue(story);

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { cost_usd: 1.0, cost_tokens: 3000 },
      });
      const res = createMockResponse();

      await storyCompleteHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('accepts zero cost values', async () => {
      setWorkerAuth();

      const story = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
        assignedAt,
        attempts: 1,
      });
      const doneTask = createMockTask({ workStatus: 'done' });
      const updatedStory = createMockStory({
        workStatus: 'done',
        assignedWorkerId: null,
        updatedAt: now,
      });

      mockStoryRepoFindById.mockResolvedValue(story);
      mockTaskRepoFindByStory.mockResolvedValue(createFindByStoryResult([doneTask]));
      setupStoryCompleteTxMock(updatedStory);
      mockEpicRepoComputeDerivedStatus.mockResolvedValue('in_progress');
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(PROJECT_UUID);
      mockEpicRepoFindAllByProject.mockResolvedValue([{ workStatus: 'in_progress' }]);

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { cost_usd: 0, cost_tokens: 0 },
      });
      const res = createMockResponse();

      await storyCompleteHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
    });
  });

  // =========================================================================
  // Story Failure
  // =========================================================================

  describe('Story Failure', () => {
    it('marks story as failed with error message', async () => {
      setWorkerAuth();

      const story = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
        attempts: 1,
      });
      const updatedStory = createMockStory({
        workStatus: 'failed',
        assignedWorkerId: WORKER_UUID,
        updatedAt: now,
      });

      mockStoryRepoFindById.mockResolvedValue(story);
      mockStoryRepoUpdate.mockResolvedValue(updatedStory);
      mockTaskRepoFindByStory.mockResolvedValue(createFindByStoryResult([]));
      mockEpicRepoComputeDerivedStatus.mockResolvedValue('in_progress');
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(PROJECT_UUID);
      mockEpicRepoFindAllByProject.mockResolvedValue([{ workStatus: 'in_progress' }]);

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { error_message: 'Build failed due to dependency conflict' },
      });
      const res = createMockResponse();

      await storyFailHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as {
        data: {
          story: {
            id: string;
            name: string;
            status: string;
            error_message: string;
            assigned_worker_id: string | null;
          };
        };
      };
      expect(body.data.story.status).toBe('failed');
      expect(body.data.story.error_message).toBe('Build failed due to dependency conflict');
    });

    it('preserves worker assignment for debugging', async () => {
      setWorkerAuth();

      const story = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
        attempts: 1,
      });
      const updatedStory = createMockStory({
        workStatus: 'failed',
        assignedWorkerId: WORKER_UUID,
        updatedAt: now,
      });

      mockStoryRepoFindById.mockResolvedValue(story);
      mockStoryRepoUpdate.mockResolvedValue(updatedStory);
      mockTaskRepoFindByStory.mockResolvedValue(createFindByStoryResult([]));
      mockEpicRepoComputeDerivedStatus.mockResolvedValue('in_progress');
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(PROJECT_UUID);
      mockEpicRepoFindAllByProject.mockResolvedValue([{ workStatus: 'in_progress' }]);

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { error_message: 'Timeout exceeded' },
      });
      const res = createMockResponse();

      await storyFailHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as {
        data: {
          story: { assigned_worker_id: string | null };
        };
      };
      // Worker assignment is preserved (NOT cleared)
      expect(body.data.story.assigned_worker_id).toBe(WORKER_UUID);

      // Verify storyRepo.update was called (NOT completeAssignment which clears worker)
      expect(mockStoryRepoUpdate).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        STORY_UUID,
        expect.objectContaining({ workStatus: 'failed' }),
        story.version,
      );
      expect(mockStoryRepoCompleteAssignment).not.toHaveBeenCalled();
    });

    it('creates attempt history record with task status snapshot', async () => {
      setWorkerAuth();

      const doneTask = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'done',
        completedAt: now,
      });
      const inProgressTask = createMockTask({
        id: TASK_UUID_B,
        workStatus: 'in_progress',
      });
      const blockedTask = createMockTask({
        id: TASK_UUID_C,
        workStatus: 'blocked',
      });

      const story = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
        attempts: 1,
      });
      const updatedStory = createMockStory({
        workStatus: 'failed',
        assignedWorkerId: WORKER_UUID,
        updatedAt: now,
      });

      mockStoryRepoFindById.mockResolvedValue(story);
      mockStoryRepoUpdate.mockResolvedValue(updatedStory);
      mockTaskRepoFindByStory.mockResolvedValue(
        createFindByStoryResult([doneTask, inProgressTask, blockedTask]),
      );
      mockEpicRepoComputeDerivedStatus.mockResolvedValue('in_progress');
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(PROJECT_UUID);
      mockEpicRepoFindAllByProject.mockResolvedValue([{ workStatus: 'in_progress' }]);

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { error_message: 'Compilation error' },
      });
      const res = createMockResponse();

      await storyFailHandler(req, res);

      expect(res.getStatusCode()).toBe(200);

      // Verify attempt history was updated via withTransaction
      // The fail endpoint uses taskRepo.withTransaction to update attempt_history
      expect(mockTaskRepoWithTransaction).toHaveBeenCalled();

      // Verify audit event includes task_statuses_snapshot
      expect(mockWriteAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'user_story',
          action: 'failed',
          metadata: expect.objectContaining({
            error_message: 'Compilation error',
            task_statuses_snapshot: {
              [TASK_UUID_A]: 'done',
              [TASK_UUID_B]: 'in_progress',
              [TASK_UUID_C]: 'blocked',
            },
          }),
        }),
      );
    });

    it('records partial cost data when provided', async () => {
      setWorkerAuth();

      const story = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
        attempts: 1,
      });
      const updatedStory = createMockStory({
        workStatus: 'failed',
        assignedWorkerId: WORKER_UUID,
        actualCost: '0.7500',
        updatedAt: now,
      });

      mockStoryRepoFindById.mockResolvedValue(story);
      mockStoryRepoUpdate.mockResolvedValue(updatedStory);
      mockTaskRepoFindByStory.mockResolvedValue(createFindByStoryResult([]));
      mockEpicRepoComputeDerivedStatus.mockResolvedValue('in_progress');
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(PROJECT_UUID);
      mockEpicRepoFindAllByProject.mockResolvedValue([{ workStatus: 'in_progress' }]);

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: {
          error_message: 'Partial failure',
          partial_cost_usd: 0.75,
          partial_cost_tokens: 2500,
        },
      });
      const res = createMockResponse();

      await storyFailHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      // Verify update was called with partial cost
      expect(mockStoryRepoUpdate).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        STORY_UUID,
        expect.objectContaining({
          workStatus: 'failed',
          actualCost: '0.7500',
        }),
        story.version,
      );
    });

    it('accepts worker auth for story failure', async () => {
      setWorkerAuth();

      const story = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
        attempts: 1,
      });
      const updatedStory = createMockStory({
        workStatus: 'failed',
        assignedWorkerId: WORKER_UUID,
        updatedAt: now,
      });

      mockStoryRepoFindById.mockResolvedValue(story);
      mockStoryRepoUpdate.mockResolvedValue(updatedStory);
      mockTaskRepoFindByStory.mockResolvedValue(createFindByStoryResult([]));
      mockEpicRepoComputeDerivedStatus.mockResolvedValue('in_progress');
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(PROJECT_UUID);
      mockEpicRepoFindAllByProject.mockResolvedValue([{ workStatus: 'in_progress' }]);

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { error_message: 'Worker-reported failure' },
      });
      const res = createMockResponse();

      await storyFailHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
    });

    it('accepts human auth for story failure', async () => {
      setMockSession();
      mockValidateApiKey.mockResolvedValue(null);

      const story = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
        attempts: 1,
      });
      const updatedStory = createMockStory({
        workStatus: 'failed',
        assignedWorkerId: WORKER_UUID,
        updatedAt: now,
      });

      mockStoryRepoFindById.mockResolvedValue(story);
      mockStoryRepoUpdate.mockResolvedValue(updatedStory);
      mockTaskRepoFindByStory.mockResolvedValue(createFindByStoryResult([]));
      mockEpicRepoComputeDerivedStatus.mockResolvedValue('in_progress');
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(PROJECT_UUID);
      mockEpicRepoFindAllByProject.mockResolvedValue([{ workStatus: 'in_progress' }]);

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { error_message: 'Human-triggered failure' },
      });
      const res = createMockResponse();

      await storyFailHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
    });

    it('rejects failure when story is not in_progress', async () => {
      setWorkerAuth();

      const story = createMockStory({
        workStatus: 'done',
        assignedWorkerId: WORKER_UUID,
      });
      mockStoryRepoFindById.mockResolvedValue(story);

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { error_message: 'Cannot fail done story' },
      });
      const res = createMockResponse();

      await storyFailHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('rejects failure from non-assigned worker', async () => {
      setWorkerAuth(OTHER_WORKER_UUID);

      const story = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
      });
      mockStoryRepoFindById.mockResolvedValue(story);

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { error_message: 'Wrong worker' },
      });
      const res = createMockResponse();

      await storyFailHandler(req, res);

      expect(res.getStatusCode()).toBe(403);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('WORKER_NOT_ASSIGNED');
    });

    it('returns 404 when story does not exist', async () => {
      setWorkerAuth();
      mockStoryRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'POST',
        query: { id: NONEXISTENT_UUID },
        body: { error_message: 'Story not found' },
      });
      const res = createMockResponse();

      await storyFailHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('STORY_NOT_FOUND');
    });

    it('requires error_message in request body', async () => {
      setWorkerAuth();

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: {},
      });
      const res = createMockResponse();

      await storyFailHandler(req, res);

      expect(res.getStatusCode()).toBe(400);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  // =========================================================================
  // Story Reset
  // =========================================================================

  describe('Story Reset', () => {
    it('resets failed story to ready when no upstream deps', async () => {
      setMockSession();
      mockValidateApiKey.mockResolvedValue(null);

      const story = createMockStory({
        workStatus: 'failed',
        assignedWorkerId: WORKER_UUID,
        attempts: 1,
      });
      const resetStory = createMockStory({
        workStatus: 'ready',
        assignedWorkerId: null,
        assignedAt: null,
        attempts: 1,
      });

      mockStoryRepoFindById.mockResolvedValue(story);
      mockStoryRepoHasIncompleteUpstreamDependencies.mockResolvedValue(false);
      mockStoryRepoResetStory.mockResolvedValue(resetStory);
      mockTaskRepoFindByStory.mockResolvedValue(createFindByStoryResult([]));
      mockEpicRepoComputeDerivedStatus.mockResolvedValue('in_progress');
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(PROJECT_UUID);
      mockEpicRepoFindAllByProject.mockResolvedValue([{ workStatus: 'in_progress' }]);

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { reset_tasks: true },
      });
      const res = createMockResponse();

      await storyResetHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as {
        data: {
          story: { id: string; status: string };
        };
      };
      expect(body.data.story.status).toBe('not_started');
      // Verify hasIncompleteUpstreamDependencies was checked
      expect(mockStoryRepoHasIncompleteUpstreamDependencies).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        STORY_UUID,
      );
      // Verify resetStory was called with 'ready' DB target (mapped to 'not_started' in API)
      expect(mockStoryRepoResetStory).toHaveBeenCalledWith(TEST_TENANT_ID, STORY_UUID, 'ready');
    });

    it('resets failed story to blocked when upstream deps are incomplete', async () => {
      setMockSession();
      mockValidateApiKey.mockResolvedValue(null);

      const story = createMockStory({
        workStatus: 'failed',
        assignedWorkerId: WORKER_UUID,
        attempts: 1,
      });
      const resetStory = createMockStory({
        workStatus: 'blocked',
        assignedWorkerId: null,
        attempts: 1,
      });

      mockStoryRepoFindById.mockResolvedValue(story);
      mockStoryRepoHasIncompleteUpstreamDependencies.mockResolvedValue(true);
      mockStoryRepoResetStory.mockResolvedValue(resetStory);
      mockTaskRepoFindByStory.mockResolvedValue(createFindByStoryResult([]));
      mockEpicRepoComputeDerivedStatus.mockResolvedValue('in_progress');
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(PROJECT_UUID);
      mockEpicRepoFindAllByProject.mockResolvedValue([{ workStatus: 'in_progress' }]);

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { reset_tasks: true },
      });
      const res = createMockResponse();

      await storyResetHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as {
        data: {
          story: { status: string };
        };
      };
      expect(body.data.story.status).toBe('blocked');
      expect(mockStoryRepoResetStory).toHaveBeenCalledWith(TEST_TENANT_ID, STORY_UUID, 'blocked');
    });

    it('clears worker assignment on reset', async () => {
      setMockSession();
      mockValidateApiKey.mockResolvedValue(null);

      const story = createMockStory({
        workStatus: 'failed',
        assignedWorkerId: WORKER_UUID,
        attempts: 1,
      });
      const resetStory = createMockStory({
        workStatus: 'ready',
        assignedWorkerId: null,
        assignedAt: null,
        attempts: 1,
      });

      mockStoryRepoFindById.mockResolvedValue(story);
      mockStoryRepoHasIncompleteUpstreamDependencies.mockResolvedValue(false);
      mockStoryRepoResetStory.mockResolvedValue(resetStory);
      mockTaskRepoFindByStory.mockResolvedValue(createFindByStoryResult([]));
      mockEpicRepoComputeDerivedStatus.mockResolvedValue('in_progress');
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(PROJECT_UUID);
      mockEpicRepoFindAllByProject.mockResolvedValue([{ workStatus: 'in_progress' }]);

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { reset_tasks: true },
      });
      const res = createMockResponse();

      await storyResetHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      // resetStory internally clears assignedWorkerId
      expect(mockStoryRepoResetStory).toHaveBeenCalled();
    });

    it('preserves completed tasks (does not reset them)', async () => {
      setMockSession();
      mockValidateApiKey.mockResolvedValue(null);

      const doneTaskA = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'done',
        completedAt: now,
      });
      const doneTaskB = createMockTask({
        id: TASK_UUID_B,
        workStatus: 'done',
        completedAt: now,
      });
      const failedTaskC = createMockTask({
        id: TASK_UUID_C,
        workStatus: 'failed',
      });

      const story = createMockStory({
        workStatus: 'failed',
        assignedWorkerId: WORKER_UUID,
        attempts: 1,
      });
      const resetStory = createMockStory({
        workStatus: 'ready',
        assignedWorkerId: null,
        attempts: 1,
      });

      mockStoryRepoFindById.mockResolvedValue(story);
      mockStoryRepoHasIncompleteUpstreamDependencies.mockResolvedValue(false);
      mockStoryRepoResetStory.mockResolvedValue(resetStory);
      mockTaskRepoFindByStory.mockResolvedValue(
        createFindByStoryResult([doneTaskA, doneTaskB, failedTaskC]),
      );
      mockTaskRepoBulkUpdateStatus.mockResolvedValue(1);
      mockEpicRepoComputeDerivedStatus.mockResolvedValue('in_progress');
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(PROJECT_UUID);
      mockEpicRepoFindAllByProject.mockResolvedValue([{ workStatus: 'in_progress' }]);

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { reset_tasks: true },
      });
      const res = createMockResponse();

      await storyResetHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as {
        data: {
          task_resets: {
            reset_count: number;
            preserved_count: number;
          };
        };
      };
      // 2 tasks preserved (done), 1 task reset (failed -> pending)
      expect(body.data.task_resets.preserved_count).toBe(2);
      expect(body.data.task_resets.reset_count).toBe(1);

      // Verify bulkUpdateStatus was called only for the failed task (not done tasks)
      expect(mockTaskRepoBulkUpdateStatus).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        [TASK_UUID_C],
        'pending',
      );
    });

    it('re-evaluates blocked tasks after reset', async () => {
      setMockSession();
      mockValidateApiKey.mockResolvedValue(null);

      const doneTaskA = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'done',
      });
      const blockedTaskB = createMockTask({
        id: TASK_UUID_B,
        workStatus: 'blocked',
      });

      const story = createMockStory({
        workStatus: 'failed',
        assignedWorkerId: WORKER_UUID,
        attempts: 1,
      });
      const resetStory = createMockStory({
        workStatus: 'ready',
        assignedWorkerId: null,
        attempts: 1,
      });

      mockStoryRepoFindById.mockResolvedValue(story);
      mockStoryRepoHasIncompleteUpstreamDependencies.mockResolvedValue(false);
      mockStoryRepoResetStory.mockResolvedValue(resetStory);
      mockTaskRepoFindByStory.mockResolvedValue(createFindByStoryResult([doneTaskA, blockedTaskB]));
      // B's dependencies (A) are all done -> B should be unblocked
      mockTaskRepoGetDependencies.mockResolvedValue([doneTaskA]);
      mockTaskRepoBulkUpdateStatus.mockResolvedValue(1);
      mockEpicRepoComputeDerivedStatus.mockResolvedValue('in_progress');
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(PROJECT_UUID);
      mockEpicRepoFindAllByProject.mockResolvedValue([{ workStatus: 'in_progress' }]);

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { reset_tasks: true },
      });
      const res = createMockResponse();

      await storyResetHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as {
        data: {
          task_resets: { reset_count: number; preserved_count: number };
        };
      };
      // 1 done task preserved, 1 blocked task re-evaluated and reset to pending
      expect(body.data.task_resets.preserved_count).toBe(1);
      expect(body.data.task_resets.reset_count).toBe(1);

      // Verify blocked task's dependencies were checked
      expect(mockTaskRepoGetDependencies).toHaveBeenCalledWith(TEST_TENANT_ID, TASK_UUID_B);
      // Verify blocked task was unblocked (all deps done)
      expect(mockTaskRepoBulkUpdateStatus).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        [TASK_UUID_B],
        'pending',
      );
    });

    it('rejects worker auth (human only)', async () => {
      setWorkerAuth();

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { reset_tasks: true },
      });
      const res = createMockResponse();

      await storyResetHandler(req, res);

      // withAuth('human', ...) should reject agent auth with 403
      expect(res.getStatusCode()).toBe(403);
      const body = res.getJsonBody() as { error: { code: string } };
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('rejects reset when story is not in failed status', async () => {
      setMockSession();
      mockValidateApiKey.mockResolvedValue(null);

      const story = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
      });
      mockStoryRepoFindById.mockResolvedValue(story);

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { reset_tasks: true },
      });
      const res = createMockResponse();

      await storyResetHandler(req, res);

      expect(res.getStatusCode()).toBe(409);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('returns 404 when story does not exist', async () => {
      setMockSession();
      mockValidateApiKey.mockResolvedValue(null);

      mockStoryRepoFindById.mockResolvedValue(null);

      const req = createMockRequest({
        method: 'POST',
        query: { id: NONEXISTENT_UUID },
        body: { reset_tasks: true },
      });
      const res = createMockResponse();

      await storyResetHandler(req, res);

      expect(res.getStatusCode()).toBe(404);
      const body = res.getJsonBody() as ErrorEnvelope;
      expect(body.error.code).toBe('STORY_NOT_FOUND');
    });

    it('increments previous_attempts count across fail-reset cycles', async () => {
      setMockSession();
      mockValidateApiKey.mockResolvedValue(null);

      // After two fail-reset cycles, attempts should be 2
      const story = createMockStory({
        workStatus: 'failed',
        assignedWorkerId: WORKER_UUID,
        attempts: 2,
      });
      const resetStory = createMockStory({
        workStatus: 'ready',
        assignedWorkerId: null,
        attempts: 2,
      });

      mockStoryRepoFindById.mockResolvedValue(story);
      mockStoryRepoHasIncompleteUpstreamDependencies.mockResolvedValue(false);
      mockStoryRepoResetStory.mockResolvedValue(resetStory);
      mockTaskRepoFindByStory.mockResolvedValue(createFindByStoryResult([]));
      mockEpicRepoComputeDerivedStatus.mockResolvedValue('in_progress');
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(PROJECT_UUID);
      mockEpicRepoFindAllByProject.mockResolvedValue([{ workStatus: 'in_progress' }]);

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { reset_tasks: true },
      });
      const res = createMockResponse();

      await storyResetHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      const body = res.getJsonBody() as {
        data: {
          story: { previous_attempts: number };
        };
      };
      expect(body.data.story.previous_attempts).toBe(2);
    });

    it('defaults reset_tasks to true when not specified', async () => {
      setMockSession();
      mockValidateApiKey.mockResolvedValue(null);

      const failedTask = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'failed',
      });

      const story = createMockStory({
        workStatus: 'failed',
        assignedWorkerId: WORKER_UUID,
        attempts: 1,
      });
      const resetStory = createMockStory({
        workStatus: 'ready',
        assignedWorkerId: null,
        attempts: 1,
      });

      mockStoryRepoFindById.mockResolvedValue(story);
      mockStoryRepoHasIncompleteUpstreamDependencies.mockResolvedValue(false);
      mockStoryRepoResetStory.mockResolvedValue(resetStory);
      mockTaskRepoFindByStory.mockResolvedValue(createFindByStoryResult([failedTask]));
      mockTaskRepoBulkUpdateStatus.mockResolvedValue(1);
      mockEpicRepoComputeDerivedStatus.mockResolvedValue('in_progress');
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(PROJECT_UUID);
      mockEpicRepoFindAllByProject.mockResolvedValue([{ workStatus: 'in_progress' }]);

      const req = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: {},
      });
      const res = createMockResponse();

      await storyResetHandler(req, res);

      expect(res.getStatusCode()).toBe(200);
      // Should still reset tasks since default is true
      expect(mockTaskRepoBulkUpdateStatus).toHaveBeenCalledWith(
        TEST_TENANT_ID,
        [TASK_UUID_A],
        'pending',
      );
    });
  });

  // =========================================================================
  // End-to-End Lifecycle
  // =========================================================================

  describe('End-to-End Lifecycle', () => {
    it('full lifecycle: complete tasks -> complete story', async () => {
      // Step 1: Complete task A
      setWorkerAuth();

      const taskA = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'in_progress',
        version: 1,
      });
      const parentStory = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
        assignedAt,
        attempts: 1,
      });
      const completedTaskA = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'done',
        completedAt: now,
        version: 2,
      });

      mockTaskRepoFindById.mockResolvedValue(taskA);
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory);
      mockStoryRepoFindById.mockResolvedValue(parentStory);
      mockTaskRepoUpdateInTx.mockResolvedValue(completedTaskA);
      mockTriggerCascadingReevaluation.mockResolvedValue({
        unblockedTasks: [{ id: TASK_UUID_B, name: 'Task B', newStatus: 'pending' }],
        allTasksComplete: false,
        storyStatus: 'in_progress',
        epicStatus: 'in_progress',
        projectStatus: 'in_progress',
      });

      const reqA = createMockRequest({
        method: 'POST',
        query: { id: TASK_UUID_A },
      });
      const resA = createMockResponse();

      await taskCompleteHandler(reqA, resA);
      expect(resA.getStatusCode()).toBe(200);

      const bodyA = resA.getJsonBody() as {
        data: {
          cascading_updates: {
            unblocked_tasks: Array<{ id: string }>;
            all_tasks_complete: boolean;
          };
        };
      };
      expect(bodyA.data.cascading_updates.unblocked_tasks).toHaveLength(1);
      expect(bodyA.data.cascading_updates.all_tasks_complete).toBe(false);

      // Step 2: Complete task B (the last task)
      vi.clearAllMocks();
      setupTransactionMock();
      setWorkerAuth();
      mockWriteAuditEvent.mockResolvedValue({});

      const taskB = createMockTask({
        id: TASK_UUID_B,
        workStatus: 'in_progress',
        version: 1,
      });
      const completedTaskB = createMockTask({
        id: TASK_UUID_B,
        workStatus: 'done',
        completedAt: now,
        version: 2,
      });

      mockTaskRepoFindById.mockResolvedValue(taskB);
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory);
      mockStoryRepoFindById.mockResolvedValue(parentStory);
      mockTaskRepoUpdateInTx.mockResolvedValue(completedTaskB);
      mockTriggerCascadingReevaluation.mockResolvedValue({
        unblockedTasks: [],
        allTasksComplete: true,
        storyStatus: 'in_progress',
        epicStatus: 'in_progress',
        projectStatus: 'in_progress',
      });

      const reqB = createMockRequest({
        method: 'POST',
        query: { id: TASK_UUID_B },
      });
      const resB = createMockResponse();

      await taskCompleteHandler(reqB, resB);
      expect(resB.getStatusCode()).toBe(200);

      const bodyB = resB.getJsonBody() as {
        data: {
          cascading_updates: { all_tasks_complete: boolean };
        };
      };
      expect(bodyB.data.cascading_updates.all_tasks_complete).toBe(true);

      // Step 3: Complete the story with cost data
      vi.clearAllMocks();
      setupTransactionMock();
      setWorkerAuth();
      mockWriteAuditEvent.mockResolvedValue({});

      const doneTaskA = createMockTask({ id: TASK_UUID_A, workStatus: 'done' });
      const doneTaskB = createMockTask({ id: TASK_UUID_B, workStatus: 'done' });
      const updatedStory = createMockStory({
        workStatus: 'done',
        assignedWorkerId: null,
        updatedAt: now,
      });

      mockStoryRepoFindById.mockResolvedValue(parentStory);
      mockTaskRepoFindByStory.mockResolvedValue(createFindByStoryResult([doneTaskA, doneTaskB]));
      setupStoryCompleteTxMock(updatedStory);
      mockEpicRepoComputeDerivedStatus.mockResolvedValue('done');
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(PROJECT_UUID);
      mockEpicRepoFindAllByProject.mockResolvedValue([{ workStatus: 'done' }]);

      const reqComplete = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { cost_usd: 2.5, cost_tokens: 15000 },
      });
      const resComplete = createMockResponse();

      await storyCompleteHandler(reqComplete, resComplete);
      expect(resComplete.getStatusCode()).toBe(200);

      const bodyComplete = resComplete.getJsonBody() as {
        data: {
          story: {
            status: string;
            cost_usd: number;
            cost_tokens: number;
          };
          epic_status: string;
          project_status: string;
        };
      };
      expect(bodyComplete.data.story.status).toBe('done');
      expect(bodyComplete.data.story.cost_usd).toBe(2.5);
      expect(bodyComplete.data.story.cost_tokens).toBe(15000);
      expect(bodyComplete.data.epic_status).toBe('done');
      expect(bodyComplete.data.project_status).toBe('done');
    });

    it('failure recovery lifecycle: partial work -> fail -> reset -> complete', async () => {
      // Step 1: Complete task A (partial work)
      setWorkerAuth();

      const taskA = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'in_progress',
        version: 1,
      });
      const parentStory = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
        assignedAt,
        attempts: 1,
      });
      const completedTaskA = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'done',
        completedAt: now,
        version: 2,
      });

      mockTaskRepoFindById.mockResolvedValue(taskA);
      mockTaskRepoGetParentStory.mockResolvedValue(parentStory);
      mockStoryRepoFindById.mockResolvedValue(parentStory);
      mockTaskRepoUpdateInTx.mockResolvedValue(completedTaskA);
      mockTriggerCascadingReevaluation.mockResolvedValue({
        unblockedTasks: [],
        allTasksComplete: false,
        storyStatus: 'in_progress',
        epicStatus: 'in_progress',
        projectStatus: 'in_progress',
      });

      const reqCompleteA = createMockRequest({
        method: 'POST',
        query: { id: TASK_UUID_A },
      });
      const resCompleteA = createMockResponse();

      await taskCompleteHandler(reqCompleteA, resCompleteA);
      expect(resCompleteA.getStatusCode()).toBe(200);

      // Step 2: Fail the story
      vi.clearAllMocks();
      setupTransactionMock();
      setWorkerAuth();
      mockWriteAuditEvent.mockResolvedValue({});

      const storyForFail = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
        attempts: 1,
      });
      const failedStory = createMockStory({
        workStatus: 'failed',
        assignedWorkerId: WORKER_UUID,
        updatedAt: now,
        attempts: 1,
      });
      const doneA = createMockTask({ id: TASK_UUID_A, workStatus: 'done' });
      const inProgressB = createMockTask({ id: TASK_UUID_B, workStatus: 'in_progress' });

      mockStoryRepoFindById.mockResolvedValue(storyForFail);
      mockStoryRepoUpdate.mockResolvedValue(failedStory);
      mockTaskRepoFindByStory.mockResolvedValue(createFindByStoryResult([doneA, inProgressB]));
      mockEpicRepoComputeDerivedStatus.mockResolvedValue('in_progress');
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(PROJECT_UUID);
      mockEpicRepoFindAllByProject.mockResolvedValue([{ workStatus: 'in_progress' }]);

      const reqFail = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: {
          error_message: 'Build failed',
          partial_cost_usd: 0.5,
          partial_cost_tokens: 1000,
        },
      });
      const resFail = createMockResponse();

      await storyFailHandler(reqFail, resFail);
      expect(resFail.getStatusCode()).toBe(200);

      const bodyFail = resFail.getJsonBody() as {
        data: {
          story: {
            status: string;
            assigned_worker_id: string | null;
          };
        };
      };
      expect(bodyFail.data.story.status).toBe('failed');
      expect(bodyFail.data.story.assigned_worker_id).toBe(WORKER_UUID);

      // Step 3: Reset the story (human-only)
      vi.clearAllMocks();
      setupTransactionMock();
      setMockSession();
      mockValidateApiKey.mockResolvedValue(null);
      mockWriteAuditEvent.mockResolvedValue({});

      const storyForReset = createMockStory({
        workStatus: 'failed',
        assignedWorkerId: WORKER_UUID,
        attempts: 1,
      });
      const resetStory = createMockStory({
        workStatus: 'ready',
        assignedWorkerId: null,
        attempts: 1,
      });
      // Task A is still done (preserved), Task B was in_progress (should reset)
      const preservedTaskA = createMockTask({
        id: TASK_UUID_A,
        workStatus: 'done',
      });
      const resetTaskB = createMockTask({
        id: TASK_UUID_B,
        workStatus: 'in_progress',
      });

      mockStoryRepoFindById.mockResolvedValue(storyForReset);
      mockStoryRepoHasIncompleteUpstreamDependencies.mockResolvedValue(false);
      mockStoryRepoResetStory.mockResolvedValue(resetStory);
      mockTaskRepoFindByStory.mockResolvedValue(
        createFindByStoryResult([preservedTaskA, resetTaskB]),
      );
      mockTaskRepoBulkUpdateStatus.mockResolvedValue(1);
      mockEpicRepoComputeDerivedStatus.mockResolvedValue('in_progress');
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(PROJECT_UUID);
      mockEpicRepoFindAllByProject.mockResolvedValue([{ workStatus: 'in_progress' }]);

      const reqReset = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { reset_tasks: true },
      });
      const resReset = createMockResponse();

      await storyResetHandler(reqReset, resReset);
      expect(resReset.getStatusCode()).toBe(200);

      const bodyReset = resReset.getJsonBody() as {
        data: {
          story: { status: string };
          task_resets: {
            reset_count: number;
            preserved_count: number;
          };
        };
      };
      expect(bodyReset.data.story.status).toBe('not_started');
      expect(bodyReset.data.task_resets.preserved_count).toBe(1); // Task A done
      expect(bodyReset.data.task_resets.reset_count).toBe(1); // Task B reset

      // Step 4: Re-complete task B and then complete story
      vi.clearAllMocks();
      setupTransactionMock();
      setWorkerAuth();
      mockWriteAuditEvent.mockResolvedValue({});

      const taskBRestarted = createMockTask({
        id: TASK_UUID_B,
        workStatus: 'in_progress',
        version: 3,
      });
      const taskBDone = createMockTask({
        id: TASK_UUID_B,
        workStatus: 'done',
        completedAt: now,
        version: 4,
      });
      const storyReassigned = createMockStory({
        workStatus: 'in_progress',
        assignedWorkerId: WORKER_UUID,
        assignedAt,
        attempts: 2,
      });

      mockTaskRepoFindById.mockResolvedValue(taskBRestarted);
      mockTaskRepoGetParentStory.mockResolvedValue(storyReassigned);
      mockStoryRepoFindById.mockResolvedValue(storyReassigned);
      mockTaskRepoUpdateInTx.mockResolvedValue(taskBDone);
      mockTriggerCascadingReevaluation.mockResolvedValue({
        unblockedTasks: [],
        allTasksComplete: true,
        storyStatus: 'in_progress',
        epicStatus: 'in_progress',
        projectStatus: 'in_progress',
      });

      const reqB2 = createMockRequest({
        method: 'POST',
        query: { id: TASK_UUID_B },
      });
      const resB2 = createMockResponse();

      await taskCompleteHandler(reqB2, resB2);
      expect(resB2.getStatusCode()).toBe(200);

      // Step 5: Complete the story successfully
      vi.clearAllMocks();
      setupTransactionMock();
      setWorkerAuth();
      mockWriteAuditEvent.mockResolvedValue({});

      const finalDoneA = createMockTask({ id: TASK_UUID_A, workStatus: 'done' });
      const finalDoneB = createMockTask({ id: TASK_UUID_B, workStatus: 'done' });
      const finalUpdatedStory = createMockStory({
        workStatus: 'done',
        assignedWorkerId: null,
        updatedAt: now,
      });

      mockStoryRepoFindById.mockResolvedValue(storyReassigned);
      mockTaskRepoFindByStory.mockResolvedValue(createFindByStoryResult([finalDoneA, finalDoneB]));
      setupStoryCompleteTxMock(finalUpdatedStory);
      mockEpicRepoComputeDerivedStatus.mockResolvedValue('in_progress');
      mockTaskRepoGetProjectIdForStory.mockResolvedValue(PROJECT_UUID);
      mockEpicRepoFindAllByProject.mockResolvedValue([{ workStatus: 'in_progress' }]);

      const reqFinalComplete = createMockRequest({
        method: 'POST',
        query: { id: STORY_UUID },
        body: { cost_usd: 3.0, cost_tokens: 20000 },
      });
      const resFinalComplete = createMockResponse();

      await storyCompleteHandler(reqFinalComplete, resFinalComplete);
      expect(resFinalComplete.getStatusCode()).toBe(200);

      const bodyFinalComplete = resFinalComplete.getJsonBody() as {
        data: {
          story: { status: string; cost_usd: number };
        };
      };
      expect(bodyFinalComplete.data.story.status).toBe('done');
      expect(bodyFinalComplete.data.story.cost_usd).toBe(3.0);
    });
  });
});

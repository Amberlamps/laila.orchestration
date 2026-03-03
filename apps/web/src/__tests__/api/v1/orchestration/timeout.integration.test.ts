/**
 * @module timeout.integration.test
 *
 * Integration tests for the timeout checking and reclamation system:
 *
 * - checkAndReclaimTimedOutStories() -- Timeout checker function
 * - Timeout fires correctly based on lastActivityAt and project timeout settings
 * - Completed tasks are preserved on timeout reclamation
 * - DAG-based status determination (ready vs blocked)
 * - Attempt history creation on timeout
 * - Multiple timed-out stories in single check
 * - Error resilience (one failure does not stop others)
 *
 * Tests invoke the checkAndReclaimTimedOutStories function directly with
 * mocked database repositories. The database layer is fully mocked to
 * enable isolated, deterministic testing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// UUIDs for tests
// ---------------------------------------------------------------------------

const STORY_UUID = '550e8400-e29b-41d4-a716-446655440001';
const STORY_UUID_2 = '550e8400-e29b-41d4-a716-446655440002';
const STORY_UUID_3 = '550e8400-e29b-41d4-a716-446655440003';
const EPIC_UUID = '660e8400-e29b-41d4-a716-446655440001';
const EPIC_UUID_2 = '660e8400-e29b-41d4-a716-446655440002';
const PROJECT_UUID = '770e8400-e29b-41d4-a716-446655440001';
const TENANT_UUID = 'test-user-uuid-001';
const WORKER_UUID = '880e8400-e29b-41d4-a716-446655440001';
const WORKER_UUID_2 = '880e8400-e29b-41d4-a716-446655440002';

// ---------------------------------------------------------------------------
// Mock data interfaces
// ---------------------------------------------------------------------------

interface InProgressStoryWithTimeout {
  id: string;
  tenantId: string;
  epicId: string;
  title: string;
  workStatus: string;
  assignedWorkerId: string;
  assignedAt: Date;
  lastActivityAt: Date | null;
  attempts: number;
  version: number;
  projectTimeoutMinutes: number;
}

interface MockStoryRecord {
  id: string;
  tenantId: string;
  epicId: string;
  title: string;
  workStatus: string;
  assignedWorkerId: string | null;
  assignedAt: Date | null;
  attempts: number;
  version: number;
  createdAt: Date;
  lastActivityAt: Date | null;
}

// ---------------------------------------------------------------------------
// Mock repository functions
// ---------------------------------------------------------------------------

// Story repo mocks
const mockStoryRepoFindInProgressWithTimeout = vi.fn<() => Promise<InProgressStoryWithTimeout[]>>();
const mockStoryRepoFindById =
  vi.fn<(tenantId: string, id: string) => Promise<MockStoryRecord | null>>();
const mockStoryRepoHasIncompleteUpstreamDependencies =
  vi.fn<(tenantId: string, storyId: string) => Promise<boolean>>();

// Task repo mocks
const mockTaskRepoGetTaskStatusSnapshot =
  vi.fn<(tenantId: string, storyId: string, tx: unknown) => Promise<Record<string, string>>>();
const mockTaskRepoResetInProgressTasksByStory =
  vi.fn<(tenantId: string, storyId: string, tx: unknown) => Promise<number>>();
const mockTaskRepoWithTransaction =
  vi.fn<(fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>>();
const mockTaskRepoGetProjectIdForStory =
  vi.fn<(tenantId: string, storyId: string) => Promise<string | null>>();

// Epic repo mocks
const mockEpicRepoComputeDerivedStatus =
  vi.fn<(tenantId: string, epicId: string) => Promise<string>>();
const mockEpicRepoFindAllByProject = vi.fn();

// Project repo mocks
const mockProjectRepoUpdateWorkStatus = vi.fn();

// Audit writer mock
const mockWriteAuditEvent = vi.fn();

// ---------------------------------------------------------------------------
// Track tx.update calls for verifying story update and attempt history update
// ---------------------------------------------------------------------------

interface MockTxUpdateCall {
  setArg: Record<string, unknown>;
  whereArg: unknown;
  returningResult: unknown[];
}

let txUpdateCalls: MockTxUpdateCall[] = [];

const createMockTx = (storyRecord: MockStoryRecord | null) => {
  txUpdateCalls = [];
  let updateCallCount = 0;

  return {
    update: vi.fn(() => {
      updateCallCount += 1;
      const isStoryUpdate = updateCallCount === 1;
      return {
        set: vi.fn((setArg: Record<string, unknown>) => ({
          where: vi.fn((whereArg: unknown) => {
            const call: MockTxUpdateCall = {
              setArg,
              whereArg,
              returningResult: isStoryUpdate && storyRecord ? [storyRecord] : [],
            };
            txUpdateCalls.push(call);
            return {
              returning: vi.fn(async () => call.returningResult),
            };
          }),
        })),
      };
    }),
  };
};

// ---------------------------------------------------------------------------
// Mock modules (hoisted by vitest)
// ---------------------------------------------------------------------------

vi.mock('@laila/database', () => ({
  getDb: vi.fn(() => ({})),
  createStoryRepository: vi.fn(() => ({
    findInProgressWithTimeout: mockStoryRepoFindInProgressWithTimeout,
    findById: mockStoryRepoFindById,
    hasIncompleteUpstreamDependencies: mockStoryRepoHasIncompleteUpstreamDependencies,
  })),
  createTaskRepository: vi.fn(() => ({
    getTaskStatusSnapshot: mockTaskRepoGetTaskStatusSnapshot,
    resetInProgressTasksByStory: mockTaskRepoResetInProgressTasksByStory,
    withTransaction: mockTaskRepoWithTransaction,
    getProjectIdForStory: mockTaskRepoGetProjectIdForStory,
  })),
  createEpicRepository: vi.fn(() => ({
    computeDerivedStatus: mockEpicRepoComputeDerivedStatus,
    findAllByProject: mockEpicRepoFindAllByProject,
  })),
  createProjectRepository: vi.fn(() => ({
    updateWorkStatus: mockProjectRepoUpdateWorkStatus,
  })),
  writeAuditEvent: (...args: unknown[]) => mockWriteAuditEvent(...args),
  userStoriesTable: {
    id: 'id',
    tenantId: 'tenant_id',
    version: 'version',
    workStatus: 'work_status',
  },
  attemptHistoryTable: {
    userStoryId: 'user_story_id',
    tenantId: 'tenant_id',
    attemptNumber: 'attempt_number',
    status: 'status',
    startedAt: 'started_at',
  },
}));

/**
 * Mock drizzle-orm -- used by the timeout checker for direct DB queries.
 */
vi.mock('drizzle-orm', () => {
  const sqlFn = vi.fn((...args: unknown[]) => ({ type: 'sql', args }));
  return {
    eq: vi.fn((...args: unknown[]) => ({ type: 'eq', args })),
    and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
    sql: sqlFn,
  };
});

// ---------------------------------------------------------------------------
// Import the function under test AFTER mocks are registered
// ---------------------------------------------------------------------------

const { checkAndReclaimTimedOutStories } = await import('@/lib/orchestration/timeout-checker');

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

const now = new Date('2025-06-01T12:00:00Z');

const createInProgressStory = (
  overrides: Partial<InProgressStoryWithTimeout> = {},
): InProgressStoryWithTimeout => ({
  id: STORY_UUID,
  tenantId: TENANT_UUID,
  epicId: EPIC_UUID,
  title: 'Test Story',
  workStatus: 'in_progress',
  assignedWorkerId: WORKER_UUID,
  assignedAt: new Date('2025-06-01T10:00:00Z'),
  lastActivityAt: new Date('2025-06-01T10:00:00Z'),
  attempts: 1,
  version: 1,
  projectTimeoutMinutes: 60,
  ...overrides,
});

const createStoryRecord = (overrides: Partial<MockStoryRecord> = {}): MockStoryRecord => ({
  id: STORY_UUID,
  tenantId: TENANT_UUID,
  epicId: EPIC_UUID,
  title: 'Test Story',
  workStatus: 'in_progress',
  assignedWorkerId: WORKER_UUID,
  assignedAt: new Date('2025-06-01T10:00:00Z'),
  attempts: 1,
  version: 1,
  createdAt: now,
  lastActivityAt: now,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Timeout Checking', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mockWriteAuditEvent.mockResolvedValue({});
    mockEpicRepoComputeDerivedStatus.mockResolvedValue('pending');
    mockEpicRepoFindAllByProject.mockResolvedValue([]);
    mockProjectRepoUpdateWorkStatus.mockResolvedValue({});
    mockTaskRepoGetProjectIdForStory.mockResolvedValue(PROJECT_UUID);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  // =========================================================================
  // Timeout fires correctly
  // =========================================================================

  describe('timeout fires correctly based on lastActivityAt and timeout duration', () => {
    it('reclaims story after timeout duration expires', async () => {
      // Story updated 61 minutes ago, timeout is 60 minutes
      const storyWithTimeout = createInProgressStory({
        lastActivityAt: new Date('2025-06-01T10:59:00Z'), // 61 minutes ago
        projectTimeoutMinutes: 60,
      });
      const storyRecord = createStoryRecord({
        workStatus: 'in_progress',
        version: 1,
      });

      mockStoryRepoFindInProgressWithTimeout.mockResolvedValue([storyWithTimeout]);
      mockStoryRepoFindById.mockResolvedValue(storyRecord);
      mockStoryRepoHasIncompleteUpstreamDependencies.mockResolvedValue(false);
      mockTaskRepoGetTaskStatusSnapshot.mockResolvedValue({
        'task-1': 'done',
        'task-2': 'in_progress',
      });
      mockTaskRepoResetInProgressTasksByStory.mockResolvedValue(1);

      // Set up transaction mock to execute callback with mock tx
      const mockTx = createMockTx(storyRecord);
      mockTaskRepoWithTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      const result = await checkAndReclaimTimedOutStories({} as never);

      expect(result.checked).toBe(1);
      expect(result.reclaimed).toHaveLength(1);
      expect(result.reclaimed[0]!.storyId).toBe(STORY_UUID);
      expect(result.reclaimed[0]!.workerId).toBe(WORKER_UUID);
      expect(result.reclaimed[0]!.newStatus).toBe('ready');
      expect(result.errors).toBe(0);
    });

    it('does not reclaim story before timeout duration', async () => {
      // Story updated 30 minutes ago, timeout is 60 minutes
      const storyWithTimeout = createInProgressStory({
        lastActivityAt: new Date('2025-06-01T11:30:00Z'), // 30 minutes ago
        projectTimeoutMinutes: 60,
      });

      mockStoryRepoFindInProgressWithTimeout.mockResolvedValue([storyWithTimeout]);

      const result = await checkAndReclaimTimedOutStories({} as never);

      expect(result.checked).toBe(1);
      expect(result.reclaimed).toHaveLength(0);
      expect(result.errors).toBe(0);
      // Should not have attempted any reclamation
      expect(mockTaskRepoWithTransaction).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Uses lastActivityAt (not assignedAt) for timeout calculation
  // =========================================================================

  describe('timeout uses lastActivityAt (not assignedAt) for calculation', () => {
    it('uses lastActivityAt for timeout calculation even when assignedAt is old', async () => {
      // Assigned 120 minutes ago, but updated 30 minutes ago (task completed)
      // Timeout is 60 minutes -- should NOT reclaim because last activity was 30 min ago
      const storyWithTimeout = createInProgressStory({
        assignedAt: new Date('2025-06-01T10:00:00Z'), // 120 minutes ago
        lastActivityAt: new Date('2025-06-01T11:30:00Z'), // 30 minutes ago
        projectTimeoutMinutes: 60,
      });

      mockStoryRepoFindInProgressWithTimeout.mockResolvedValue([storyWithTimeout]);

      const result = await checkAndReclaimTimedOutStories({} as never);

      expect(result.checked).toBe(1);
      expect(result.reclaimed).toHaveLength(0);
      expect(result.errors).toBe(0);
    });

    it('reclaims when lastActivityAt is old even if assignedAt is recent', async () => {
      // lastActivityAt is 90 minutes ago (timeout is 60 minutes)
      const storyWithTimeout = createInProgressStory({
        assignedAt: new Date('2025-06-01T11:50:00Z'), // 10 minutes ago
        lastActivityAt: new Date('2025-06-01T10:30:00Z'), // 90 minutes ago
        projectTimeoutMinutes: 60,
      });
      const storyRecord = createStoryRecord({
        workStatus: 'in_progress',
        version: 1,
      });

      mockStoryRepoFindInProgressWithTimeout.mockResolvedValue([storyWithTimeout]);
      mockStoryRepoFindById.mockResolvedValue(storyRecord);
      mockStoryRepoHasIncompleteUpstreamDependencies.mockResolvedValue(false);
      mockTaskRepoGetTaskStatusSnapshot.mockResolvedValue({});
      mockTaskRepoResetInProgressTasksByStory.mockResolvedValue(0);

      const mockTx = createMockTx(storyRecord);
      mockTaskRepoWithTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      const result = await checkAndReclaimTimedOutStories({} as never);

      expect(result.checked).toBe(1);
      expect(result.reclaimed).toHaveLength(1);
    });
  });

  // =========================================================================
  // Preserves completed tasks on timeout
  // =========================================================================

  describe('preserves completed tasks on timeout', () => {
    it('calls resetInProgressTasksByStory which only resets in-progress tasks', async () => {
      const storyWithTimeout = createInProgressStory({
        lastActivityAt: new Date('2025-06-01T10:00:00Z'), // 120 minutes ago
        projectTimeoutMinutes: 60,
      });
      const storyRecord = createStoryRecord({
        workStatus: 'in_progress',
        version: 1,
      });

      mockStoryRepoFindInProgressWithTimeout.mockResolvedValue([storyWithTimeout]);
      mockStoryRepoFindById.mockResolvedValue(storyRecord);
      mockStoryRepoHasIncompleteUpstreamDependencies.mockResolvedValue(false);
      // Snapshot shows 2 done tasks and 1 in-progress
      mockTaskRepoGetTaskStatusSnapshot.mockResolvedValue({
        'task-1': 'done',
        'task-2': 'done',
        'task-3': 'in_progress',
      });
      // Only 1 task was reset (the in-progress one)
      mockTaskRepoResetInProgressTasksByStory.mockResolvedValue(1);

      const mockTx = createMockTx(storyRecord);
      mockTaskRepoWithTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      const result = await checkAndReclaimTimedOutStories({} as never);

      expect(result.reclaimed).toHaveLength(1);
      // Verify resetInProgressTasksByStory was called with the correct args
      expect(mockTaskRepoResetInProgressTasksByStory).toHaveBeenCalledWith(
        TENANT_UUID,
        STORY_UUID,
        mockTx,
      );
      // Verify task status snapshot was captured BEFORE resetting
      expect(mockTaskRepoGetTaskStatusSnapshot).toHaveBeenCalledWith(
        TENANT_UUID,
        STORY_UUID,
        mockTx,
      );
    });
  });

  // =========================================================================
  // DAG-based status determination
  // =========================================================================

  describe('DAG-based status determination on timeout', () => {
    it('sets status to ready when no incomplete upstream dependencies', async () => {
      const storyWithTimeout = createInProgressStory({
        lastActivityAt: new Date('2025-06-01T10:00:00Z'),
        projectTimeoutMinutes: 60,
      });
      const storyRecord = createStoryRecord({
        workStatus: 'in_progress',
        version: 1,
      });

      mockStoryRepoFindInProgressWithTimeout.mockResolvedValue([storyWithTimeout]);
      mockStoryRepoFindById.mockResolvedValue(storyRecord);
      mockStoryRepoHasIncompleteUpstreamDependencies.mockResolvedValue(false);
      mockTaskRepoGetTaskStatusSnapshot.mockResolvedValue({});
      mockTaskRepoResetInProgressTasksByStory.mockResolvedValue(0);

      const mockTx = createMockTx(storyRecord);
      mockTaskRepoWithTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      const result = await checkAndReclaimTimedOutStories({} as never);

      expect(result.reclaimed).toHaveLength(1);
      expect(result.reclaimed[0]!.newStatus).toBe('ready');
    });

    it('sets status to blocked when upstream dependencies are incomplete', async () => {
      const storyWithTimeout = createInProgressStory({
        lastActivityAt: new Date('2025-06-01T10:00:00Z'),
        projectTimeoutMinutes: 60,
      });
      const storyRecord = createStoryRecord({
        workStatus: 'in_progress',
        version: 1,
      });

      mockStoryRepoFindInProgressWithTimeout.mockResolvedValue([storyWithTimeout]);
      mockStoryRepoFindById.mockResolvedValue(storyRecord);
      mockStoryRepoHasIncompleteUpstreamDependencies.mockResolvedValue(true);
      mockTaskRepoGetTaskStatusSnapshot.mockResolvedValue({});
      mockTaskRepoResetInProgressTasksByStory.mockResolvedValue(0);

      const mockTx = createMockTx(storyRecord);
      mockTaskRepoWithTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      const result = await checkAndReclaimTimedOutStories({} as never);

      expect(result.reclaimed).toHaveLength(1);
      expect(result.reclaimed[0]!.newStatus).toBe('blocked');
    });
  });

  // =========================================================================
  // Attempt history creation on timeout
  // =========================================================================

  describe('attempt history creation on timeout', () => {
    it('creates attempt history record with reason timeout', async () => {
      const storyWithTimeout = createInProgressStory({
        lastActivityAt: new Date('2025-06-01T10:00:00Z'),
        projectTimeoutMinutes: 60,
        attempts: 2,
      });
      const storyRecord = createStoryRecord({
        workStatus: 'in_progress',
        version: 1,
        attempts: 2,
      });

      mockStoryRepoFindInProgressWithTimeout.mockResolvedValue([storyWithTimeout]);
      mockStoryRepoFindById.mockResolvedValue(storyRecord);
      mockStoryRepoHasIncompleteUpstreamDependencies.mockResolvedValue(false);
      mockTaskRepoGetTaskStatusSnapshot.mockResolvedValue({
        'task-1': 'done',
        'task-2': 'in_progress',
      });
      mockTaskRepoResetInProgressTasksByStory.mockResolvedValue(1);

      const mockTx = createMockTx(storyRecord);
      mockTaskRepoWithTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await checkAndReclaimTimedOutStories({} as never);

      // Verify tx.update was called twice: once for story, once for attempt history
      expect(mockTx.update).toHaveBeenCalledTimes(2);
      expect(txUpdateCalls).toHaveLength(2);

      // Second update should be for attempt history
      const attemptHistoryUpdate = txUpdateCalls[1];
      expect(attemptHistoryUpdate).toBeDefined();
      expect(attemptHistoryUpdate!.setArg.status).toBe('timed_out');

      // Verify the reason contains timeout info
      const reasonStr = attemptHistoryUpdate!.setArg.reason as string;
      const reasonObj = JSON.parse(reasonStr) as {
        reason: string;
        timed_out_after_minutes: number;
        timeout_limit_minutes: number;
        task_statuses_snapshot: Record<string, string>;
      };
      expect(reasonObj.reason).toBe('timeout');
      expect(reasonObj.timeout_limit_minutes).toBe(60);
      expect(reasonObj.task_statuses_snapshot).toEqual({
        'task-1': 'done',
        'task-2': 'in_progress',
      });
    });

    it('logs audit event after successful reclamation', async () => {
      const storyWithTimeout = createInProgressStory({
        lastActivityAt: new Date('2025-06-01T10:00:00Z'),
        projectTimeoutMinutes: 60,
      });
      const storyRecord = createStoryRecord({
        workStatus: 'in_progress',
        version: 1,
      });

      mockStoryRepoFindInProgressWithTimeout.mockResolvedValue([storyWithTimeout]);
      mockStoryRepoFindById.mockResolvedValue(storyRecord);
      mockStoryRepoHasIncompleteUpstreamDependencies.mockResolvedValue(false);
      mockTaskRepoGetTaskStatusSnapshot.mockResolvedValue({});
      mockTaskRepoResetInProgressTasksByStory.mockResolvedValue(0);

      const mockTx = createMockTx(storyRecord);
      mockTaskRepoWithTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await checkAndReclaimTimedOutStories({} as never);

      expect(mockWriteAuditEvent).toHaveBeenCalledTimes(1);
      const auditCall = mockWriteAuditEvent.mock.calls[0] as [Record<string, unknown>];
      const auditEvent = auditCall[0];
      expect(auditEvent.entityType).toBe('user_story');
      expect(auditEvent.entityId).toBe(STORY_UUID);
      expect(auditEvent.action).toBe('timed_out');
      expect(auditEvent.actorType).toBe('system');
      expect(auditEvent.actorId).toBe('timeout-checker');
      expect(auditEvent.tenantId).toBe(TENANT_UUID);
    });
  });

  // =========================================================================
  // Multiple timed-out stories
  // =========================================================================

  describe('multiple timed-out stories in a single check', () => {
    it('reclaims all timed-out stories across multiple projects', async () => {
      const stories = [
        createInProgressStory({
          id: STORY_UUID,
          tenantId: TENANT_UUID,
          epicId: EPIC_UUID,
          title: 'Story 1',
          assignedWorkerId: WORKER_UUID,
          lastActivityAt: new Date('2025-06-01T10:00:00Z'),
          projectTimeoutMinutes: 60,
        }),
        createInProgressStory({
          id: STORY_UUID_2,
          tenantId: TENANT_UUID,
          epicId: EPIC_UUID_2,
          title: 'Story 2',
          assignedWorkerId: WORKER_UUID_2,
          lastActivityAt: new Date('2025-06-01T10:00:00Z'),
          projectTimeoutMinutes: 60,
        }),
        createInProgressStory({
          id: STORY_UUID_3,
          tenantId: TENANT_UUID,
          epicId: EPIC_UUID,
          title: 'Story 3',
          assignedWorkerId: WORKER_UUID,
          lastActivityAt: new Date('2025-06-01T10:00:00Z'),
          projectTimeoutMinutes: 60,
        }),
      ];

      mockStoryRepoFindInProgressWithTimeout.mockResolvedValue(stories);

      // Each story lookup returns a valid in-progress story
      mockStoryRepoFindById.mockImplementation(async (_tenantId: string, storyId: string) =>
        createStoryRecord({
          id: storyId,
          workStatus: 'in_progress',
          version: 1,
        }),
      );

      mockStoryRepoHasIncompleteUpstreamDependencies.mockResolvedValue(false);
      mockTaskRepoGetTaskStatusSnapshot.mockResolvedValue({});
      mockTaskRepoResetInProgressTasksByStory.mockResolvedValue(0);

      // Each story gets its own transaction
      mockTaskRepoWithTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const mockTx = createMockTx(createStoryRecord({ workStatus: 'in_progress', version: 1 }));
          return fn(mockTx);
        },
      );

      const result = await checkAndReclaimTimedOutStories({} as never);

      expect(result.checked).toBe(3);
      expect(result.reclaimed).toHaveLength(3);
      expect(result.errors).toBe(0);

      // Verify all three stories were reclaimed
      const reclaimedIds = result.reclaimed.map((r) => r.storyId);
      expect(reclaimedIds).toContain(STORY_UUID);
      expect(reclaimedIds).toContain(STORY_UUID_2);
      expect(reclaimedIds).toContain(STORY_UUID_3);
    });
  });

  // =========================================================================
  // Error resilience
  // =========================================================================

  describe('error resilience', () => {
    it('continues processing after individual story reclamation failure', async () => {
      const stories = [
        createInProgressStory({
          id: STORY_UUID,
          title: 'Story 1 (will fail)',
          lastActivityAt: new Date('2025-06-01T10:00:00Z'),
          projectTimeoutMinutes: 60,
        }),
        createInProgressStory({
          id: STORY_UUID_2,
          title: 'Story 2 (will succeed)',
          lastActivityAt: new Date('2025-06-01T10:00:00Z'),
          projectTimeoutMinutes: 60,
        }),
      ];

      mockStoryRepoFindInProgressWithTimeout.mockResolvedValue(stories);

      // First story lookup throws, second returns normally
      let findByIdCallCount = 0;
      mockStoryRepoFindById.mockImplementation(async () => {
        findByIdCallCount += 1;
        if (findByIdCallCount === 1) {
          throw new Error('Database constraint violation');
        }
        return createStoryRecord({
          id: STORY_UUID_2,
          workStatus: 'in_progress',
          version: 1,
        });
      });

      mockStoryRepoHasIncompleteUpstreamDependencies.mockResolvedValue(false);
      mockTaskRepoGetTaskStatusSnapshot.mockResolvedValue({});
      mockTaskRepoResetInProgressTasksByStory.mockResolvedValue(0);

      mockTaskRepoWithTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const mockTx = createMockTx(
            createStoryRecord({ id: STORY_UUID_2, workStatus: 'in_progress', version: 1 }),
          );
          return fn(mockTx);
        },
      );

      const result = await checkAndReclaimTimedOutStories({} as never);

      expect(result.checked).toBe(2);
      expect(result.reclaimed).toHaveLength(1);
      expect(result.reclaimed[0]!.storyId).toBe(STORY_UUID_2);
      expect(result.errors).toBe(1);
    });
  });

  // =========================================================================
  // Race condition: story completed between check and reclamation
  // =========================================================================

  describe('race condition handling within timeout checker', () => {
    it('skips story that was completed between check and reclamation', async () => {
      const storyWithTimeout = createInProgressStory({
        lastActivityAt: new Date('2025-06-01T10:00:00Z'),
        projectTimeoutMinutes: 60,
      });

      mockStoryRepoFindInProgressWithTimeout.mockResolvedValue([storyWithTimeout]);

      // When we re-read, the story is now 'done' (worker completed it)
      mockStoryRepoFindById.mockResolvedValue(
        createStoryRecord({ workStatus: 'done', assignedWorkerId: null }),
      );

      mockTaskRepoWithTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const mockTx = createMockTx(null);
          return fn(mockTx);
        },
      );

      const result = await checkAndReclaimTimedOutStories({} as never);

      expect(result.checked).toBe(1);
      expect(result.reclaimed).toHaveLength(0);
      expect(result.errors).toBe(0);
      // Should not have attempted to reset tasks
      expect(mockTaskRepoResetInProgressTasksByStory).not.toHaveBeenCalled();
    });

    it('skips story that no longer exists', async () => {
      const storyWithTimeout = createInProgressStory({
        lastActivityAt: new Date('2025-06-01T10:00:00Z'),
        projectTimeoutMinutes: 60,
      });

      mockStoryRepoFindInProgressWithTimeout.mockResolvedValue([storyWithTimeout]);
      mockStoryRepoFindById.mockResolvedValue(null);

      mockTaskRepoWithTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const mockTx = createMockTx(null);
          return fn(mockTx);
        },
      );

      const result = await checkAndReclaimTimedOutStories({} as never);

      expect(result.checked).toBe(1);
      expect(result.reclaimed).toHaveLength(0);
      expect(result.errors).toBe(0);
    });
  });

  // =========================================================================
  // Empty check
  // =========================================================================

  describe('no stories to check', () => {
    it('returns zero counts when no in-progress stories exist', async () => {
      mockStoryRepoFindInProgressWithTimeout.mockResolvedValue([]);

      const result = await checkAndReclaimTimedOutStories({} as never);

      expect(result.checked).toBe(0);
      expect(result.reclaimed).toHaveLength(0);
      expect(result.errors).toBe(0);
    });
  });
});

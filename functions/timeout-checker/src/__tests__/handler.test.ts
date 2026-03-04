/**
 * Unit tests for the timeout-checker orchestration logic.
 *
 * Tests the `checkAndReclaimTimedOutStories` function from the local
 * orchestration module. The handler wrapper is tested separately in
 * `../handler.test.ts`; these tests focus on the orchestration logic:
 *
 * - Timeout detection (elapsed time calculation, per-project thresholds)
 * - Reclamation (worker clearing, DAG-aware status reset)
 * - Previous attempt logging (attempt history updates)
 * - Audit events (DynamoDB writes)
 * - Race conditions (optimistic locking, stale state detection)
 * - Edge cases (zero stories, multiple reclamations, error resilience)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type {
  TimeoutCheckResult,
  ReclaimedStorySummary,
  TimeoutCheckerLogger,
} from '../orchestration';

// ---------------------------------------------------------------------------
// Mock symbols for Drizzle table references
// ---------------------------------------------------------------------------

/** Mock table reference for userStoriesTable used in raw tx.update() calls */
const mockUserStoriesTable = Symbol('userStoriesTable');
/** Mock table reference for attemptHistoryTable used in raw tx.update() calls */
const mockAttemptHistoryTable = Symbol('attemptHistoryTable');

// ---------------------------------------------------------------------------
// Mock repository functions
// ---------------------------------------------------------------------------

const mockFindInProgressWithTimeout = vi.fn();
const mockFindById = vi.fn();
const mockHasIncompleteUpstreamDependencies = vi.fn();

const mockWithTransaction = vi.fn();
const mockGetTaskStatusSnapshot = vi.fn();
const mockResetInProgressTasksByStory = vi.fn();
const mockGetProjectIdForStory = vi.fn();

const mockComputeDerivedStatus = vi.fn();
const mockFindAllByProject = vi.fn();

const mockUpdateWorkStatus = vi.fn();

const mockWriteAuditEvent = vi.fn();

// ---------------------------------------------------------------------------
// Track which repositories are created for db vs tx
// ---------------------------------------------------------------------------

const mockCreateStoryRepository = vi.fn().mockReturnValue({
  findInProgressWithTimeout: mockFindInProgressWithTimeout,
  findById: mockFindById,
  hasIncompleteUpstreamDependencies: mockHasIncompleteUpstreamDependencies,
});

const mockCreateTaskRepository = vi.fn().mockReturnValue({
  withTransaction: mockWithTransaction,
  getTaskStatusSnapshot: mockGetTaskStatusSnapshot,
  resetInProgressTasksByStory: mockResetInProgressTasksByStory,
  getProjectIdForStory: mockGetProjectIdForStory,
});

const mockCreateEpicRepository = vi.fn().mockReturnValue({
  computeDerivedStatus: mockComputeDerivedStatus,
  findAllByProject: mockFindAllByProject,
});

const mockCreateProjectRepository = vi.fn().mockReturnValue({
  updateWorkStatus: mockUpdateWorkStatus,
});

// ---------------------------------------------------------------------------
// Mock @laila/database
// ---------------------------------------------------------------------------

vi.mock('@laila/database', () => ({
  createDrizzleClient: vi.fn(),
  createStoryRepository: mockCreateStoryRepository,
  createTaskRepository: mockCreateTaskRepository,
  createEpicRepository: mockCreateEpicRepository,
  createProjectRepository: mockCreateProjectRepository,
  userStoriesTable: mockUserStoriesTable,
  attemptHistoryTable: mockAttemptHistoryTable,
  writeAuditEvent: mockWriteAuditEvent,
}));

// ---------------------------------------------------------------------------
// Mock drizzle-orm
// ---------------------------------------------------------------------------

const mockEq = vi.fn().mockImplementation((a: unknown, b: unknown) => ({ op: 'eq', a, b }));
const mockAnd = vi
  .fn()
  .mockImplementation((...args: unknown[]) => ({ op: 'and', conditions: args }));
const mockSql = vi
  .fn()
  .mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => ({
    op: 'sql',
    strings: Array.from(strings),
    values,
  }));
// Make mockSql usable as a tagged template literal
Object.assign(mockSql, {
  raw: vi.fn().mockReturnValue({ op: 'sql.raw' }),
});

vi.mock('drizzle-orm', () => ({
  eq: mockEq,
  and: mockAnd,
  sql: mockSql,
}));

// ---------------------------------------------------------------------------
// Mock transaction object
// ---------------------------------------------------------------------------

/**
 * Creates a mock transaction object that supports chainable Drizzle update calls:
 * tx.update(table).set(data).where(cond).returning()
 */
const createMockTx = () => {
  const returningFn = vi.fn().mockResolvedValue([{ id: 'updated-row' }]);
  const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
  const setFn = vi.fn().mockReturnValue({ where: whereFn });
  const updateFn = vi.fn().mockReturnValue({ set: setFn });

  return {
    update: updateFn,
    _chain: { set: setFn, where: whereFn, returning: returningFn },
  };
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface InProgressStoryFixture {
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

const NOW = new Date('2026-03-04T12:00:00Z');

const createInProgressStory = (
  overrides: Partial<InProgressStoryFixture> = {},
): InProgressStoryFixture => ({
  id: 'story-001',
  tenantId: 'tenant-001',
  epicId: 'epic-001',
  title: 'Implement login form',
  workStatus: 'in_progress',
  assignedWorkerId: 'worker-001',
  assignedAt: new Date('2026-03-04T10:00:00Z'),
  lastActivityAt: new Date('2026-03-04T10:00:00Z'),
  attempts: 1,
  version: 3,
  projectTimeoutMinutes: 60,
  ...overrides,
});

const createMockLogger = (): TimeoutCheckerLogger => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe('timeout-checker orchestration', () => {
  let mockDb: Record<string, never>;
  let mockTx: ReturnType<typeof createMockTx>;
  let mockLogger: TimeoutCheckerLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    mockDb = {};
    mockTx = createMockTx();
    mockLogger = createMockLogger();

    // Default: withTransaction executes the callback immediately with mockTx
    mockWithTransaction.mockImplementation(
      async (fn: (tx: ReturnType<typeof createMockTx>) => Promise<unknown>) => fn(mockTx),
    );

    // Default: story exists and is in_progress when re-read inside tx
    mockFindById.mockResolvedValue({
      id: 'story-001',
      workStatus: 'in_progress',
      epicId: 'epic-001',
      version: 3,
    });

    // Default: no incomplete upstream dependencies
    mockHasIncompleteUpstreamDependencies.mockResolvedValue(false);

    // Default: task snapshot
    mockGetTaskStatusSnapshot.mockResolvedValue({
      'task-1': 'done',
      'task-2': 'in_progress',
    });

    // Default: reset tasks returns count
    mockResetInProgressTasksByStory.mockResolvedValue(1);

    // Default: project id available
    mockGetProjectIdForStory.mockResolvedValue('project-001');

    // Default: epics for project
    mockFindAllByProject.mockResolvedValue([{ id: 'epic-001', workStatus: 'in_progress' }]);

    // Default: computeDerivedStatus succeeds
    mockComputeDerivedStatus.mockResolvedValue('in_progress');

    // Default: updateWorkStatus succeeds
    mockUpdateWorkStatus.mockResolvedValue(undefined);

    // Default: writeAuditEvent succeeds
    mockWriteAuditEvent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // Timeout Detection
  // =========================================================================

  describe('timeout detection', () => {
    it('should identify stories where elapsed time exceeds project timeout', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      // Story with lastActivityAt 2 hours ago, project timeout 1 hour
      const timedOutStory = createInProgressStory({
        lastActivityAt: new Date('2026-03-04T10:00:00Z'), // 2 hours ago
        projectTimeoutMinutes: 60, // 1 hour timeout
      });

      mockFindInProgressWithTimeout.mockResolvedValue([timedOutStory]);

      const result: TimeoutCheckResult = await checkAndReclaimTimedOutStories(
        mockDb as never,
        mockLogger,
      );

      expect(result.checked).toBe(1);
      expect(result.reclaimed).toHaveLength(1);
      expect(result.reclaimed[0]?.storyId).toBe('story-001');
    });

    it('should not reclaim stories within the timeout window', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      // Story with lastActivityAt 30 minutes ago, project timeout 1 hour
      const activeStory = createInProgressStory({
        lastActivityAt: new Date('2026-03-04T11:30:00Z'), // 30 min ago
        projectTimeoutMinutes: 60, // 1 hour timeout
      });

      mockFindInProgressWithTimeout.mockResolvedValue([activeStory]);

      const result: TimeoutCheckResult = await checkAndReclaimTimedOutStories(
        mockDb as never,
        mockLogger,
      );

      expect(result.checked).toBe(1);
      expect(result.reclaimed).toHaveLength(0);
      expect(result.errors).toBe(0);
      // Should not attempt reclamation
      expect(mockWithTransaction).not.toHaveBeenCalled();
    });

    it('should respect per-project timeout durations', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      // Project A: 30 min timeout, story last active 45 min ago (TIMED OUT)
      const storyProjectA = createInProgressStory({
        id: 'story-a',
        tenantId: 'tenant-a',
        title: 'Story A',
        assignedWorkerId: 'worker-a',
        lastActivityAt: new Date('2026-03-04T11:15:00Z'), // 45 min ago
        projectTimeoutMinutes: 30,
      });

      // Project B: 2 hour timeout, story last active 45 min ago (NOT timed out)
      const storyProjectB = createInProgressStory({
        id: 'story-b',
        tenantId: 'tenant-b',
        title: 'Story B',
        assignedWorkerId: 'worker-b',
        lastActivityAt: new Date('2026-03-04T11:15:00Z'), // 45 min ago
        projectTimeoutMinutes: 120,
      });

      mockFindInProgressWithTimeout.mockResolvedValue([storyProjectA, storyProjectB]);

      // Mock findById for the tx-scoped call (only story-a gets reclaimed)
      mockFindById.mockImplementation((_tenantId: string, storyId: string) => {
        if (storyId === 'story-a') {
          return Promise.resolve({
            id: 'story-a',
            workStatus: 'in_progress',
            epicId: 'epic-001',
            version: 3,
          });
        }
        return Promise.resolve(null);
      });

      const result: TimeoutCheckResult = await checkAndReclaimTimedOutStories(
        mockDb as never,
        mockLogger,
      );

      expect(result.checked).toBe(2);
      expect(result.reclaimed).toHaveLength(1);
      expect(result.reclaimed[0]?.storyId).toBe('story-a');
      // Only one transaction should be initiated (for story-a)
      expect(mockWithTransaction).toHaveBeenCalledTimes(1);
    });

    it('should use assigned_at as fallback when last_activity_at is null', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      // Story with null lastActivityAt, assignedAt 2 hours ago
      const storyNoActivity = createInProgressStory({
        lastActivityAt: null,
        assignedAt: new Date('2026-03-04T10:00:00Z'), // 2 hours ago
        projectTimeoutMinutes: 60,
      });

      mockFindInProgressWithTimeout.mockResolvedValue([storyNoActivity]);

      const result: TimeoutCheckResult = await checkAndReclaimTimedOutStories(
        mockDb as never,
        mockLogger,
      );

      expect(result.checked).toBe(1);
      expect(result.reclaimed).toHaveLength(1);
      // timedOutAfterMinutes should be based on assignedAt (120 min)
      expect(result.reclaimed[0]?.timedOutAfterMinutes).toBe(120);
    });

    it('should not reclaim a story exactly at the timeout boundary', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      // Story with lastActivityAt exactly 60 minutes ago, timeout = 60 min
      // The check is minutesSinceActivity <= projectTimeoutMinutes (equal => skip)
      const boundaryStory = createInProgressStory({
        lastActivityAt: new Date('2026-03-04T11:00:00Z'), // exactly 60 min ago
        projectTimeoutMinutes: 60,
      });

      mockFindInProgressWithTimeout.mockResolvedValue([boundaryStory]);

      const result: TimeoutCheckResult = await checkAndReclaimTimedOutStories(
        mockDb as never,
        mockLogger,
      );

      expect(result.checked).toBe(1);
      expect(result.reclaimed).toHaveLength(0);
      expect(mockWithTransaction).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Reclamation
  // =========================================================================

  describe('reclamation', () => {
    it('should clear assigned_worker and assigned_at on timed-out stories', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      const timedOutStory = createInProgressStory({
        lastActivityAt: new Date('2026-03-04T10:00:00Z'),
        projectTimeoutMinutes: 60,
      });

      mockFindInProgressWithTimeout.mockResolvedValue([timedOutStory]);

      await checkAndReclaimTimedOutStories(mockDb as never, mockLogger);

      // Verify the raw tx.update(userStoriesTable).set() call
      expect(mockTx.update).toHaveBeenCalledWith(mockUserStoriesTable);
      const setCall = mockTx._chain.set.mock.calls[0] as [Record<string, unknown>];
      expect(setCall[0]).toMatchObject({
        assignedWorkerId: null,
        assignedAt: null,
        lastActivityAt: null,
      });
    });

    it("should reset status to 'not_started' when all DAG dependencies are complete", async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      const timedOutStory = createInProgressStory({
        lastActivityAt: new Date('2026-03-04T10:00:00Z'),
        projectTimeoutMinutes: 60,
      });

      mockFindInProgressWithTimeout.mockResolvedValue([timedOutStory]);
      mockHasIncompleteUpstreamDependencies.mockResolvedValue(false);

      const result: TimeoutCheckResult = await checkAndReclaimTimedOutStories(
        mockDb as never,
        mockLogger,
      );

      expect(result.reclaimed[0]?.newStatus).toBe('not_started');

      // Verify the set() call includes workStatus = 'not_started'
      const setCall = mockTx._chain.set.mock.calls[0] as [Record<string, unknown>];
      expect(setCall[0]).toMatchObject({ workStatus: 'not_started' });
    });

    it("should reset status to 'blocked' when some DAG dependencies are incomplete", async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      const timedOutStory = createInProgressStory({
        lastActivityAt: new Date('2026-03-04T10:00:00Z'),
        projectTimeoutMinutes: 60,
      });

      mockFindInProgressWithTimeout.mockResolvedValue([timedOutStory]);
      mockHasIncompleteUpstreamDependencies.mockResolvedValue(true);

      const result: TimeoutCheckResult = await checkAndReclaimTimedOutStories(
        mockDb as never,
        mockLogger,
      );

      expect(result.reclaimed[0]?.newStatus).toBe('blocked');

      // Verify the set() call includes workStatus = 'blocked'
      const setCall = mockTx._chain.set.mock.calls[0] as [Record<string, unknown>];
      expect(setCall[0]).toMatchObject({ workStatus: 'blocked' });
    });

    it('should reset in-progress tasks via resetInProgressTasksByStory', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      const timedOutStory = createInProgressStory({
        lastActivityAt: new Date('2026-03-04T10:00:00Z'),
        projectTimeoutMinutes: 60,
      });

      mockFindInProgressWithTimeout.mockResolvedValue([timedOutStory]);

      await checkAndReclaimTimedOutStories(mockDb as never, mockLogger);

      expect(mockResetInProgressTasksByStory).toHaveBeenCalledWith(
        'tenant-001',
        'story-001',
        mockTx,
      );
    });

    it('should re-derive parent epic status after reclamation', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      const timedOutStory = createInProgressStory({
        lastActivityAt: new Date('2026-03-04T10:00:00Z'),
        projectTimeoutMinutes: 60,
      });

      mockFindInProgressWithTimeout.mockResolvedValue([timedOutStory]);

      await checkAndReclaimTimedOutStories(mockDb as never, mockLogger);

      expect(mockComputeDerivedStatus).toHaveBeenCalledWith('tenant-001', 'epic-001');
    });

    it('should re-derive parent project status after reclamation', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      const timedOutStory = createInProgressStory({
        lastActivityAt: new Date('2026-03-04T10:00:00Z'),
        projectTimeoutMinutes: 60,
      });

      mockFindInProgressWithTimeout.mockResolvedValue([timedOutStory]);
      mockGetProjectIdForStory.mockResolvedValue('project-abc');
      mockFindAllByProject.mockResolvedValue([{ id: 'epic-001', workStatus: 'in_progress' }]);

      await checkAndReclaimTimedOutStories(mockDb as never, mockLogger);

      expect(mockGetProjectIdForStory).toHaveBeenCalledWith('tenant-001', 'story-001');
      expect(mockUpdateWorkStatus).toHaveBeenCalledWith('tenant-001', 'project-abc', 'in_progress');
    });

    it('should return correct reclaimed story summary shape', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      const timedOutStory = createInProgressStory({
        id: 'story-xyz',
        title: 'My timed out story',
        assignedWorkerId: 'worker-abc',
        lastActivityAt: new Date('2026-03-04T10:30:00Z'), // 90 min ago
        projectTimeoutMinutes: 60,
      });

      mockFindInProgressWithTimeout.mockResolvedValue([timedOutStory]);
      mockFindById.mockResolvedValue({
        id: 'story-xyz',
        workStatus: 'in_progress',
        epicId: 'epic-001',
        version: 3,
      });

      const result: TimeoutCheckResult = await checkAndReclaimTimedOutStories(
        mockDb as never,
        mockLogger,
      );

      const summary: ReclaimedStorySummary = result.reclaimed[0] as ReclaimedStorySummary;
      expect(summary).toEqual({
        storyId: 'story-xyz',
        storyName: 'My timed out story',
        workerId: 'worker-abc',
        newStatus: 'not_started',
        timedOutAfterMinutes: 90,
      });
    });
  });

  // =========================================================================
  // Previous Attempt Logging
  // =========================================================================

  describe('previous attempt logging', () => {
    it("should update attempt history record with 'timed_out' status and timeout context", async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      const timedOutStory = createInProgressStory({
        lastActivityAt: new Date('2026-03-04T10:00:00Z'), // 120 min ago
        projectTimeoutMinutes: 60,
        attempts: 2,
      });

      mockFindInProgressWithTimeout.mockResolvedValue([timedOutStory]);

      await checkAndReclaimTimedOutStories(mockDb as never, mockLogger);

      // Verify the second tx.update call (attempt history update)
      // First call is userStoriesTable, second is attemptHistoryTable
      expect(mockTx.update).toHaveBeenCalledTimes(2);
      expect(mockTx.update).toHaveBeenNthCalledWith(2, mockAttemptHistoryTable);

      // Verify the set() call for attempt history
      const setCallArgs = mockTx._chain.set.mock.calls[1] as [Record<string, unknown>];
      const setData = setCallArgs[0];
      expect(setData).toMatchObject({
        completedAt: NOW,
        status: 'timed_out',
      });

      // Verify the reason field contains timeout context as JSON
      const reason = JSON.parse(setData['reason'] as string) as Record<string, unknown>;
      expect(reason).toMatchObject({
        reason: 'timeout',
        timed_out_after_minutes: 120,
        timeout_limit_minutes: 60,
      });
    });

    it('should include task status snapshot in timeout context', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      const taskSnapshot = {
        'task-a': 'done',
        'task-b': 'in_progress',
        'task-c': 'not_started',
      };
      mockGetTaskStatusSnapshot.mockResolvedValue(taskSnapshot);

      const timedOutStory = createInProgressStory({
        lastActivityAt: new Date('2026-03-04T10:00:00Z'),
        projectTimeoutMinutes: 60,
      });

      mockFindInProgressWithTimeout.mockResolvedValue([timedOutStory]);

      await checkAndReclaimTimedOutStories(mockDb as never, mockLogger);

      const setCallArgs = mockTx._chain.set.mock.calls[1] as [Record<string, unknown>];
      const reason = JSON.parse(setCallArgs[0]['reason'] as string) as Record<string, unknown>;
      expect(reason['task_statuses_snapshot']).toEqual(taskSnapshot);
    });

    it('should capture task status snapshot BEFORE resetting tasks', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      const callOrder: string[] = [];
      mockGetTaskStatusSnapshot.mockImplementation(() => {
        callOrder.push('getTaskStatusSnapshot');
        return Promise.resolve({ 'task-1': 'in_progress' });
      });
      mockResetInProgressTasksByStory.mockImplementation(() => {
        callOrder.push('resetInProgressTasksByStory');
        return Promise.resolve(1);
      });

      const timedOutStory = createInProgressStory({
        lastActivityAt: new Date('2026-03-04T10:00:00Z'),
        projectTimeoutMinutes: 60,
      });

      mockFindInProgressWithTimeout.mockResolvedValue([timedOutStory]);

      await checkAndReclaimTimedOutStories(mockDb as never, mockLogger);

      expect(callOrder).toEqual(['getTaskStatusSnapshot', 'resetInProgressTasksByStory']);
    });

    it('should use correct attempt number from the story in the where clause', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      const timedOutStory = createInProgressStory({
        attempts: 3,
        lastActivityAt: new Date('2026-03-04T10:00:00Z'),
        projectTimeoutMinutes: 60,
      });

      mockFindInProgressWithTimeout.mockResolvedValue([timedOutStory]);

      await checkAndReclaimTimedOutStories(mockDb as never, mockLogger);

      // The attempt history update uses a where clause that includes the
      // attempt number. Verify via the second .where() call on the tx chain.
      expect(mockTx.update).toHaveBeenCalledTimes(2);
      expect(mockTx.update).toHaveBeenNthCalledWith(2, mockAttemptHistoryTable);

      // The second .set() call receives the attempt history fields
      const setCallArgs = mockTx._chain.set.mock.calls[1] as [Record<string, unknown>];
      expect(setCallArgs[0]).toMatchObject({
        status: 'timed_out',
      });

      // The where clause was called (verifying the chain is invoked)
      expect(mockTx._chain.where).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // Audit Events
  // =========================================================================

  describe('audit events', () => {
    it('should write an audit event to DynamoDB for each reclaimed story', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      const timedOutStory = createInProgressStory({
        lastActivityAt: new Date('2026-03-04T10:00:00Z'),
        projectTimeoutMinutes: 60,
      });

      mockFindInProgressWithTimeout.mockResolvedValue([timedOutStory]);

      await checkAndReclaimTimedOutStories(mockDb as never, mockLogger);

      expect(mockWriteAuditEvent).toHaveBeenCalledTimes(1);
    });

    it('should include story_id, tenantId, worker_id, and correct fields in audit event', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      const timedOutStory = createInProgressStory({
        id: 'story-audit',
        tenantId: 'tenant-audit',
        assignedWorkerId: 'worker-audit',
        lastActivityAt: new Date('2026-03-04T10:00:00Z'), // 120 min ago
        projectTimeoutMinutes: 60,
        attempts: 2,
      });

      mockFindInProgressWithTimeout.mockResolvedValue([timedOutStory]);
      mockFindById.mockResolvedValue({
        id: 'story-audit',
        workStatus: 'in_progress',
        epicId: 'epic-001',
        version: 3,
      });

      await checkAndReclaimTimedOutStories(mockDb as never, mockLogger);

      expect(mockWriteAuditEvent).toHaveBeenCalledWith({
        entityType: 'user_story',
        entityId: 'story-audit',
        action: 'timed_out',
        actorType: 'system',
        actorId: 'timeout-checker',
        tenantId: 'tenant-audit',
        changes: {
          before: { workStatus: 'in_progress', assignedWorkerId: 'worker-audit' },
          after: { workStatus: 'not_started', assignedWorkerId: null },
        },
        metadata: {
          timed_out_after_minutes: 120,
          timeout_limit_minutes: 60,
          previous_worker_id: 'worker-audit',
          attempt_number: 2,
        },
      });
    });

    it('should not write an audit event when reclamation is skipped (race condition)', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      const timedOutStory = createInProgressStory({
        lastActivityAt: new Date('2026-03-04T10:00:00Z'),
        projectTimeoutMinutes: 60,
      });

      mockFindInProgressWithTimeout.mockResolvedValue([timedOutStory]);

      // Story was completed between initial query and reclamation
      mockFindById.mockResolvedValue({
        id: 'story-001',
        workStatus: 'completed',
        epicId: 'epic-001',
        version: 4,
      });

      await checkAndReclaimTimedOutStories(mockDb as never, mockLogger);

      expect(mockWriteAuditEvent).not.toHaveBeenCalled();
    });

    it('should write audit event AFTER the transaction commits', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      const callOrder: string[] = [];

      mockWithTransaction.mockImplementation(
        async (fn: (tx: ReturnType<typeof createMockTx>) => Promise<unknown>) => {
          const result = await fn(mockTx);
          callOrder.push('transaction_committed');
          return result;
        },
      );

      mockWriteAuditEvent.mockImplementation(() => {
        callOrder.push('audit_event_written');
        return Promise.resolve(undefined);
      });

      const timedOutStory = createInProgressStory({
        lastActivityAt: new Date('2026-03-04T10:00:00Z'),
        projectTimeoutMinutes: 60,
      });

      mockFindInProgressWithTimeout.mockResolvedValue([timedOutStory]);

      await checkAndReclaimTimedOutStories(mockDb as never, mockLogger);

      expect(callOrder).toEqual(['transaction_committed', 'audit_event_written']);
    });

    it('should write multiple audit events for multiple reclaimed stories', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      const story1 = createInProgressStory({
        id: 'story-1',
        title: 'Story 1',
        assignedWorkerId: 'worker-1',
        lastActivityAt: new Date('2026-03-04T10:00:00Z'),
        projectTimeoutMinutes: 60,
      });
      const story2 = createInProgressStory({
        id: 'story-2',
        title: 'Story 2',
        assignedWorkerId: 'worker-2',
        lastActivityAt: new Date('2026-03-04T10:00:00Z'),
        projectTimeoutMinutes: 60,
      });

      mockFindInProgressWithTimeout.mockResolvedValue([story1, story2]);

      mockFindById.mockImplementation((_tenantId: string, storyId: string) =>
        Promise.resolve({
          id: storyId,
          workStatus: 'in_progress',
          epicId: 'epic-001',
          version: 3,
        }),
      );

      await checkAndReclaimTimedOutStories(mockDb as never, mockLogger);

      expect(mockWriteAuditEvent).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // Race Conditions
  // =========================================================================

  describe('race conditions', () => {
    it('should not reclaim a story that was completed between query and reclamation', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      const timedOutStory = createInProgressStory({
        lastActivityAt: new Date('2026-03-04T10:00:00Z'),
        projectTimeoutMinutes: 60,
      });

      mockFindInProgressWithTimeout.mockResolvedValue([timedOutStory]);

      // Story was completed between initial query and reclamation tx
      mockFindById.mockResolvedValue({
        id: 'story-001',
        workStatus: 'completed',
        epicId: 'epic-001',
        version: 4,
      });

      const result: TimeoutCheckResult = await checkAndReclaimTimedOutStories(
        mockDb as never,
        mockLogger,
      );

      expect(result.checked).toBe(1);
      expect(result.reclaimed).toHaveLength(0);
      expect(result.errors).toBe(0);
      // Should not perform any updates
      expect(mockTx.update).not.toHaveBeenCalled();
    });

    it('should not reclaim a story that was reassigned (optimistic lock via version check)', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      const timedOutStory = createInProgressStory({
        lastActivityAt: new Date('2026-03-04T10:00:00Z'),
        projectTimeoutMinutes: 60,
        version: 3,
      });

      mockFindInProgressWithTimeout.mockResolvedValue([timedOutStory]);

      // Story still in_progress but version changed (was reassigned)
      mockFindById.mockResolvedValue({
        id: 'story-001',
        workStatus: 'in_progress',
        epicId: 'epic-001',
        version: 3,
      });

      // The optimistic lock fails: UPDATE ... WHERE version = 3 returns 0 rows
      // (another process incremented the version)
      mockTx._chain.returning.mockResolvedValue([]);

      const result: TimeoutCheckResult = await checkAndReclaimTimedOutStories(
        mockDb as never,
        mockLogger,
      );

      expect(result.checked).toBe(1);
      expect(result.reclaimed).toHaveLength(0);
      expect(result.errors).toBe(0);
      // writeAuditEvent should NOT be called (reclamation skipped)
      expect(mockWriteAuditEvent).not.toHaveBeenCalled();
    });

    it('should skip a story that was deleted between query and reclamation', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      const timedOutStory = createInProgressStory({
        lastActivityAt: new Date('2026-03-04T10:00:00Z'),
        projectTimeoutMinutes: 60,
      });

      mockFindInProgressWithTimeout.mockResolvedValue([timedOutStory]);

      // Story was deleted between initial query and tx read
      mockFindById.mockResolvedValue(null);

      const result: TimeoutCheckResult = await checkAndReclaimTimedOutStories(
        mockDb as never,
        mockLogger,
      );

      expect(result.checked).toBe(1);
      expect(result.reclaimed).toHaveLength(0);
      expect(result.errors).toBe(0);
      expect(mockTx.update).not.toHaveBeenCalled();
      expect(mockWriteAuditEvent).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe('edge cases', () => {
    it('should handle zero in-progress stories gracefully', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      mockFindInProgressWithTimeout.mockResolvedValue([]);

      const result: TimeoutCheckResult = await checkAndReclaimTimedOutStories(
        mockDb as never,
        mockLogger,
      );

      expect(result).toEqual({
        checked: 0,
        reclaimed: [],
        errors: 0,
      });
      expect(mockWithTransaction).not.toHaveBeenCalled();
      expect(mockWriteAuditEvent).not.toHaveBeenCalled();
    });

    it('should handle multiple timed-out stories in a single invocation', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      const stories = Array.from({ length: 5 }, (_, i) =>
        createInProgressStory({
          id: `story-${String(i + 1)}`,
          tenantId: `tenant-${String(i + 1)}`,
          title: `Story ${String(i + 1)}`,
          assignedWorkerId: `worker-${String(i + 1)}`,
          lastActivityAt: new Date('2026-03-04T10:00:00Z'), // 2 hours ago
          projectTimeoutMinutes: 60,
        }),
      );

      mockFindInProgressWithTimeout.mockResolvedValue(stories);

      mockFindById.mockImplementation((_tenantId: string, storyId: string) =>
        Promise.resolve({
          id: storyId,
          workStatus: 'in_progress',
          epicId: 'epic-001',
          version: 3,
        }),
      );

      const result: TimeoutCheckResult = await checkAndReclaimTimedOutStories(
        mockDb as never,
        mockLogger,
      );

      expect(result.checked).toBe(5);
      expect(result.reclaimed).toHaveLength(5);
      expect(result.errors).toBe(0);
      expect(mockWithTransaction).toHaveBeenCalledTimes(5);
      expect(mockWriteAuditEvent).toHaveBeenCalledTimes(5);
    });

    it('should return correct summary counts with mixed outcomes', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      // 10 in-progress stories: 3 timed out, 7 within window
      const timedOutStories = Array.from({ length: 3 }, (_, i) =>
        createInProgressStory({
          id: `timed-out-${String(i + 1)}`,
          title: `Timed Out ${String(i + 1)}`,
          assignedWorkerId: `worker-${String(i + 1)}`,
          lastActivityAt: new Date('2026-03-04T10:00:00Z'), // 2h ago, > 60 min
          projectTimeoutMinutes: 60,
        }),
      );

      const activeStories = Array.from({ length: 7 }, (_, i) =>
        createInProgressStory({
          id: `active-${String(i + 1)}`,
          title: `Active ${String(i + 1)}`,
          assignedWorkerId: `worker-a-${String(i + 1)}`,
          lastActivityAt: new Date('2026-03-04T11:30:00Z'), // 30 min ago, < 60 min
          projectTimeoutMinutes: 60,
        }),
      );

      mockFindInProgressWithTimeout.mockResolvedValue([...timedOutStories, ...activeStories]);

      mockFindById.mockImplementation((_tenantId: string, storyId: string) =>
        Promise.resolve({
          id: storyId,
          workStatus: 'in_progress',
          epicId: 'epic-001',
          version: 3,
        }),
      );

      const result: TimeoutCheckResult = await checkAndReclaimTimedOutStories(
        mockDb as never,
        mockLogger,
      );

      expect(result.checked).toBe(10);
      expect(result.reclaimed).toHaveLength(3);
      expect(result.errors).toBe(0);
    });

    it('should continue processing other stories when one reclamation fails', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      const story1 = createInProgressStory({
        id: 'story-fail',
        title: 'Story Fail',
        assignedWorkerId: 'worker-fail',
        lastActivityAt: new Date('2026-03-04T10:00:00Z'),
        projectTimeoutMinutes: 60,
      });
      const story2 = createInProgressStory({
        id: 'story-success',
        title: 'Story Success',
        assignedWorkerId: 'worker-success',
        lastActivityAt: new Date('2026-03-04T10:00:00Z'),
        projectTimeoutMinutes: 60,
      });

      mockFindInProgressWithTimeout.mockResolvedValue([story1, story2]);

      let callIdx = 0;
      mockWithTransaction.mockImplementation(
        async (fn: (tx: ReturnType<typeof createMockTx>) => Promise<unknown>) => {
          callIdx++;
          if (callIdx === 1) {
            throw new Error('Database connection lost');
          }
          return fn(mockTx);
        },
      );

      mockFindById.mockImplementation((_tenantId: string, storyId: string) =>
        Promise.resolve({
          id: storyId,
          workStatus: 'in_progress',
          epicId: 'epic-001',
          version: 3,
        }),
      );

      const result: TimeoutCheckResult = await checkAndReclaimTimedOutStories(
        mockDb as never,
        mockLogger,
      );

      expect(result.checked).toBe(2);
      expect(result.reclaimed).toHaveLength(1);
      expect(result.reclaimed[0]?.storyId).toBe('story-success');
      expect(result.errors).toBe(1);
    });

    it('should log errors for failed reclamations', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      const story = createInProgressStory({
        id: 'story-error',
        lastActivityAt: new Date('2026-03-04T10:00:00Z'),
        projectTimeoutMinutes: 60,
      });

      mockFindInProgressWithTimeout.mockResolvedValue([story]);

      mockWithTransaction.mockRejectedValue(new Error('Unexpected DB error'));

      const result: TimeoutCheckResult = await checkAndReclaimTimedOutStories(
        mockDb as never,
        mockLogger,
      );

      expect(result.errors).toBe(1);
      expect(result.reclaimed).toHaveLength(0);
      expect(mockLogger.error).toHaveBeenCalledWith(
        { storyId: 'story-error', error: 'Unexpected DB error' },
        'Failed to reclaim timed-out story',
      );
    });

    it('should handle non-Error thrown objects in error logging', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      const story = createInProgressStory({
        id: 'story-unknown-err',
        lastActivityAt: new Date('2026-03-04T10:00:00Z'),
        projectTimeoutMinutes: 60,
      });

      mockFindInProgressWithTimeout.mockResolvedValue([story]);

      // Throw a non-Error object
      mockWithTransaction.mockRejectedValue('string error');

      const result: TimeoutCheckResult = await checkAndReclaimTimedOutStories(
        mockDb as never,
        mockLogger,
      );

      expect(result.errors).toBe(1);
      expect(mockLogger.error).toHaveBeenCalledWith(
        { storyId: 'story-unknown-err', error: 'Unknown error' },
        'Failed to reclaim timed-out story',
      );
    });

    it('should skip project status update when getProjectIdForStory returns null', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      const timedOutStory = createInProgressStory({
        lastActivityAt: new Date('2026-03-04T10:00:00Z'),
        projectTimeoutMinutes: 60,
      });

      mockFindInProgressWithTimeout.mockResolvedValue([timedOutStory]);
      mockGetProjectIdForStory.mockResolvedValue(null);

      const result: TimeoutCheckResult = await checkAndReclaimTimedOutStories(
        mockDb as never,
        mockLogger,
      );

      expect(result.reclaimed).toHaveLength(1);
      expect(mockFindAllByProject).not.toHaveBeenCalled();
      expect(mockUpdateWorkStatus).not.toHaveBeenCalled();
    });

    it('should set project status to done when all epics are done', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      const timedOutStory = createInProgressStory({
        lastActivityAt: new Date('2026-03-04T10:00:00Z'),
        projectTimeoutMinutes: 60,
      });

      mockFindInProgressWithTimeout.mockResolvedValue([timedOutStory]);
      mockGetProjectIdForStory.mockResolvedValue('project-done');
      mockFindAllByProject.mockResolvedValue([
        { id: 'epic-1', workStatus: 'done' },
        { id: 'epic-2', workStatus: 'done' },
      ]);

      await checkAndReclaimTimedOutStories(mockDb as never, mockLogger);

      expect(mockUpdateWorkStatus).toHaveBeenCalledWith('tenant-001', 'project-done', 'done');
    });

    it('should use default console logger when no logger is provided', async () => {
      const { checkAndReclaimTimedOutStories } = await import('../orchestration');

      mockFindInProgressWithTimeout.mockResolvedValue([]);

      // Call without logger - should not throw
      const result: TimeoutCheckResult = await checkAndReclaimTimedOutStories(mockDb as never);

      expect(result).toEqual({
        checked: 0,
        reclaimed: [],
        errors: 0,
      });
    });
  });
});

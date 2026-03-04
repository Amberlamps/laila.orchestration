/**
 * Unit tests for the dependency evaluation logic (evaluator.ts).
 *
 * Tests the `evaluateDependents` function that determines which blocked tasks
 * should be unblocked when a task completes. The database module is mocked
 * so tests focus on the evaluation logic: reverse dependency lookup, prerequisite
 * checking, transaction-based transitions, and edge cases like diamond dependencies.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { StatusPropagationLogger } from '../logger';
import type { DependentEvaluation, DependencyEdgeRow, TaskRow } from '../types';
import type { PoolDatabase } from '@laila/database';

// ---------------------------------------------------------------------------
// Mock: db module
// ---------------------------------------------------------------------------

const mockFindDependentTaskIds = vi.fn();
const mockFindTaskById = vi.fn();
const mockAreAllPrerequisitesComplete = vi.fn();
const mockTransitionTaskToPending = vi.fn();
const mockWithTransaction = vi.fn();

vi.mock('../db', () => ({
  findDependentTaskIds: (...args: unknown[]) => mockFindDependentTaskIds(...args) as unknown,
  findTaskById: (...args: unknown[]) => mockFindTaskById(...args) as unknown,
  areAllPrerequisitesComplete: (...args: unknown[]) =>
    mockAreAllPrerequisitesComplete(...args) as unknown,
  transitionTaskToPending: (...args: unknown[]) => mockTransitionTaskToPending(...args) as unknown,
  withTransaction: (...args: unknown[]) => mockWithTransaction(...args) as unknown,
  createPoolClient: vi.fn().mockReturnValue({}),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const createMockLogger = (): StatusPropagationLogger => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

const makeTask = (overrides: Partial<TaskRow> = {}): TaskRow => ({
  id: 'task-001',
  tenantId: 'tenant-001',
  userStoryId: 'story-001',
  title: 'Test Task',
  workStatus: 'blocked',
  ...overrides,
});

const makeEdge = (dependentTaskId: string, prerequisiteTaskId: string): DependencyEdgeRow => ({
  dependentTaskId,
  prerequisiteTaskId,
});

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe('evaluateDependents', () => {
  let mockDb: Record<string, never>;
  let mockLogger: StatusPropagationLogger;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {};
    mockLogger = createMockLogger();

    // Default: withTransaction executes the callback immediately
    mockWithTransaction.mockImplementation(
      async (_db: unknown, fn: (tx: PoolDatabase) => Promise<unknown>) => fn({} as PoolDatabase),
    );

    // Default: transitions succeed
    mockTransitionTaskToPending.mockResolvedValue(true);
  });

  // =========================================================================
  // Cascading Unblock
  // =========================================================================

  describe('cascading unblock', () => {
    it('should unblock a dependent task when all its dependencies are complete', async () => {
      const { evaluateDependents } = await import('../evaluator');

      // Task B depends on Task A. Task A just completed.
      mockFindDependentTaskIds.mockResolvedValue([makeEdge('task-b', 'task-a')]);
      mockFindTaskById.mockResolvedValue(
        makeTask({ id: 'task-b', title: 'Task B', workStatus: 'blocked', userStoryId: 'story-1' }),
      );
      mockAreAllPrerequisitesComplete.mockResolvedValue(true);

      const evaluations: DependentEvaluation[] = await evaluateDependents(
        mockDb as never,
        'task-a',
        'project-1',
        'tenant-1',
        mockLogger,
      );

      expect(evaluations).toHaveLength(1);
      expect(evaluations[0]).toMatchObject({
        taskId: 'task-b',
        taskName: 'Task B',
        storyId: 'story-1',
        previousStatus: 'blocked',
        newStatus: 'pending',
      });
      expect(mockTransitionTaskToPending).toHaveBeenCalledTimes(1);
    });

    it('should NOT unblock a dependent task when some dependencies are still incomplete', async () => {
      const { evaluateDependents } = await import('../evaluator');

      // Task C depends on A and B. A just completed, B is still in progress.
      mockFindDependentTaskIds.mockResolvedValue([makeEdge('task-c', 'task-a')]);
      mockFindTaskById.mockResolvedValue(
        makeTask({ id: 'task-c', title: 'Task C', workStatus: 'blocked' }),
      );
      // Not all prerequisites are complete -- B is still in_progress
      mockAreAllPrerequisitesComplete.mockResolvedValue(false);

      const evaluations = await evaluateDependents(
        mockDb as never,
        'task-a',
        'project-1',
        'tenant-1',
        mockLogger,
      );

      expect(evaluations).toHaveLength(0);
      expect(mockTransitionTaskToPending).not.toHaveBeenCalled();
    });

    it('should unblock multiple dependent tasks from a single completion', async () => {
      const { evaluateDependents } = await import('../evaluator');

      // Tasks B, C, D all depend only on A. A just completed.
      mockFindDependentTaskIds.mockResolvedValue([
        makeEdge('task-b', 'task-a'),
        makeEdge('task-c', 'task-a'),
        makeEdge('task-d', 'task-a'),
      ]);

      let callIndex = 0;
      mockFindTaskById.mockImplementation(() => {
        callIndex++;
        const taskId = `task-${String.fromCharCode(97 + callIndex)}`; // task-b, task-c, task-d
        return Promise.resolve(
          makeTask({
            id: taskId,
            title: `Task ${taskId.slice(-1).toUpperCase()}`,
            workStatus: 'blocked',
            userStoryId: 'story-1',
          }),
        );
      });

      mockAreAllPrerequisitesComplete.mockResolvedValue(true);

      const evaluations = await evaluateDependents(
        mockDb as never,
        'task-a',
        'project-1',
        'tenant-1',
        mockLogger,
      );

      expect(evaluations).toHaveLength(3);
      expect(mockTransitionTaskToPending).toHaveBeenCalledTimes(3);
    });

    it('should not unblock tasks that are already not_started', async () => {
      const { evaluateDependents } = await import('../evaluator');

      // Task B depends on A, but B is already "not_started" (not blocked)
      mockFindDependentTaskIds.mockResolvedValue([makeEdge('task-b', 'task-a')]);
      mockFindTaskById.mockResolvedValue(
        makeTask({ id: 'task-b', title: 'Task B', workStatus: 'not_started' }),
      );

      const evaluations = await evaluateDependents(
        mockDb as never,
        'task-a',
        'project-1',
        'tenant-1',
        mockLogger,
      );

      expect(evaluations).toHaveLength(0);
      // Should not even check prerequisites
      expect(mockAreAllPrerequisitesComplete).not.toHaveBeenCalled();
      expect(mockTransitionTaskToPending).not.toHaveBeenCalled();
    });

    it('should handle diamond dependencies correctly', async () => {
      const { evaluateDependents } = await import('../evaluator');

      // Diamond pattern: A -> B, A -> C, B -> D, C -> D
      // When A completes, B and C should be evaluated for unblocking.
      // D depends on both B and C, which are not yet complete.

      mockFindDependentTaskIds.mockResolvedValue([
        makeEdge('task-b', 'task-a'),
        makeEdge('task-c', 'task-a'),
      ]);

      let findCallIndex = 0;
      mockFindTaskById.mockImplementation(() => {
        findCallIndex++;
        if (findCallIndex === 1) {
          return Promise.resolve(
            makeTask({
              id: 'task-b',
              title: 'Task B',
              workStatus: 'blocked',
              userStoryId: 'story-1',
            }),
          );
        }
        return Promise.resolve(
          makeTask({
            id: 'task-c',
            title: 'Task C',
            workStatus: 'blocked',
            userStoryId: 'story-1',
          }),
        );
      });

      // Both B and C have all prerequisites complete (only A, which just completed)
      mockAreAllPrerequisitesComplete.mockResolvedValue(true);

      const evaluations = await evaluateDependents(
        mockDb as never,
        'task-a',
        'project-1',
        'tenant-1',
        mockLogger,
      );

      // B and C are unblocked
      expect(evaluations).toHaveLength(2);
      expect(evaluations[0]).toMatchObject({ taskId: 'task-b', newStatus: 'pending' });
      expect(evaluations[1]).toMatchObject({ taskId: 'task-c', newStatus: 'pending' });

      // D is NOT in the dependents of A, so it should NOT be evaluated at all.
      // D only depends on B and C, not directly on A.
    });

    it('should not re-evaluate D when only B completes in a diamond (C still incomplete)', async () => {
      const { evaluateDependents } = await import('../evaluator');

      // B completes. D depends on both B and C. C is not done yet.
      mockFindDependentTaskIds.mockResolvedValue([makeEdge('task-d', 'task-b')]);
      mockFindTaskById.mockResolvedValue(
        makeTask({ id: 'task-d', title: 'Task D', workStatus: 'blocked', userStoryId: 'story-1' }),
      );
      // Not all prerequisites are complete -- C is not done
      mockAreAllPrerequisitesComplete.mockResolvedValue(false);

      const evaluations = await evaluateDependents(
        mockDb as never,
        'task-b',
        'project-1',
        'tenant-1',
        mockLogger,
      );

      expect(evaluations).toHaveLength(0);
      expect(mockTransitionTaskToPending).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Dependency Lookup
  // =========================================================================

  describe('dependency lookup', () => {
    it('should find all tasks depending on the completed task', async () => {
      const { evaluateDependents } = await import('../evaluator');

      mockFindDependentTaskIds.mockResolvedValue([
        makeEdge('task-x', 'task-a'),
        makeEdge('task-y', 'task-a'),
      ]);

      mockFindTaskById.mockResolvedValue(makeTask({ workStatus: 'blocked' }));
      mockAreAllPrerequisitesComplete.mockResolvedValue(true);

      await evaluateDependents(mockDb as never, 'task-a', 'project-1', 'tenant-1', mockLogger);

      expect(mockFindDependentTaskIds).toHaveBeenCalledWith(
        mockDb,
        'task-a',
        'tenant-1',
        'project-1',
      );
      expect(mockFindTaskById).toHaveBeenCalledTimes(2);
    });

    it('should check ALL dependencies of each dependent task, not just the triggering one', async () => {
      const { evaluateDependents } = await import('../evaluator');

      // Task D depends on A, B, and C. A just completed.
      mockFindDependentTaskIds.mockResolvedValue([makeEdge('task-d', 'task-a')]);
      mockFindTaskById.mockResolvedValue(
        makeTask({ id: 'task-d', title: 'Task D', workStatus: 'blocked' }),
      );
      // areAllPrerequisitesComplete is called with task-d's ID, checking ALL its deps (A, B, C)
      mockAreAllPrerequisitesComplete.mockResolvedValue(false);

      await evaluateDependents(mockDb as never, 'task-a', 'project-1', 'tenant-1', mockLogger);

      // Verify that areAllPrerequisitesComplete was called with the dependent task ID
      expect(mockAreAllPrerequisitesComplete).toHaveBeenCalledWith(
        mockDb,
        'task-d',
        'tenant-1',
        'project-1',
      );
    });

    it('should return empty array when no tasks depend on the completed task', async () => {
      const { evaluateDependents } = await import('../evaluator');

      mockFindDependentTaskIds.mockResolvedValue([]);

      const evaluations = await evaluateDependents(
        mockDb as never,
        'task-leaf',
        'project-1',
        'tenant-1',
        mockLogger,
      );

      expect(evaluations).toHaveLength(0);
      expect(mockFindTaskById).not.toHaveBeenCalled();
      expect(mockAreAllPrerequisitesComplete).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe('edge cases', () => {
    it('should skip dependent tasks that have been deleted', async () => {
      const { evaluateDependents } = await import('../evaluator');

      mockFindDependentTaskIds.mockResolvedValue([makeEdge('task-deleted', 'task-a')]);
      mockFindTaskById.mockResolvedValue(null);

      const evaluations = await evaluateDependents(
        mockDb as never,
        'task-a',
        'project-1',
        'tenant-1',
        mockLogger,
      );

      expect(evaluations).toHaveLength(0);
      expect(mockAreAllPrerequisitesComplete).not.toHaveBeenCalled();
    });

    it('should handle transition race condition gracefully (task no longer blocked)', async () => {
      const { evaluateDependents } = await import('../evaluator');

      mockFindDependentTaskIds.mockResolvedValue([makeEdge('task-b', 'task-a')]);
      mockFindTaskById.mockResolvedValue(
        makeTask({ id: 'task-b', title: 'Task B', workStatus: 'blocked', userStoryId: 'story-1' }),
      );
      mockAreAllPrerequisitesComplete.mockResolvedValue(true);
      // The transition fails because the task was concurrently changed
      mockTransitionTaskToPending.mockResolvedValue(false);

      const evaluations = await evaluateDependents(
        mockDb as never,
        'task-a',
        'project-1',
        'tenant-1',
        mockLogger,
      );

      // No evaluations because the transition was skipped
      expect(evaluations).toHaveLength(0);
    });

    it('should include the correct reason in the evaluation result', async () => {
      const { evaluateDependents } = await import('../evaluator');

      mockFindDependentTaskIds.mockResolvedValue([makeEdge('task-b', 'task-a')]);
      mockFindTaskById.mockResolvedValue(
        makeTask({ id: 'task-b', title: 'Task B', workStatus: 'blocked', userStoryId: 'story-1' }),
      );
      mockAreAllPrerequisitesComplete.mockResolvedValue(true);

      const evaluations = await evaluateDependents(
        mockDb as never,
        'task-a',
        'project-1',
        'tenant-1',
        mockLogger,
      );

      expect(evaluations[0]?.reason).toContain('task-a');
      expect(evaluations[0]?.reason).toContain('prerequisites complete');
    });

    it('should handle a mix of blocked and non-blocked dependents', async () => {
      const { evaluateDependents } = await import('../evaluator');

      mockFindDependentTaskIds.mockResolvedValue([
        makeEdge('task-b', 'task-a'),
        makeEdge('task-c', 'task-a'),
        makeEdge('task-d', 'task-a'),
      ]);

      let findCallIndex = 0;
      mockFindTaskById.mockImplementation(() => {
        findCallIndex++;
        if (findCallIndex === 1) {
          // Task B is blocked -- eligible
          return Promise.resolve(
            makeTask({
              id: 'task-b',
              title: 'Task B',
              workStatus: 'blocked',
              userStoryId: 'story-1',
            }),
          );
        }
        if (findCallIndex === 2) {
          // Task C is already in_progress -- not eligible
          return Promise.resolve(
            makeTask({
              id: 'task-c',
              title: 'Task C',
              workStatus: 'in_progress',
              userStoryId: 'story-1',
            }),
          );
        }
        // Task D is blocked -- eligible
        return Promise.resolve(
          makeTask({
            id: 'task-d',
            title: 'Task D',
            workStatus: 'blocked',
            userStoryId: 'story-1',
          }),
        );
      });

      mockAreAllPrerequisitesComplete.mockResolvedValue(true);

      const evaluations = await evaluateDependents(
        mockDb as never,
        'task-a',
        'project-1',
        'tenant-1',
        mockLogger,
      );

      // Only B and D are blocked, so only 2 evaluations
      expect(evaluations).toHaveLength(2);
      expect(evaluations[0]).toMatchObject({ taskId: 'task-b' });
      expect(evaluations[1]).toMatchObject({ taskId: 'task-d' });
      // areAllPrerequisitesComplete was only called for blocked tasks
      expect(mockAreAllPrerequisitesComplete).toHaveBeenCalledTimes(2);
    });

    it('should execute transitions within a transaction', async () => {
      const { evaluateDependents } = await import('../evaluator');

      mockFindDependentTaskIds.mockResolvedValue([makeEdge('task-b', 'task-a')]);
      mockFindTaskById.mockResolvedValue(
        makeTask({ id: 'task-b', title: 'Task B', workStatus: 'blocked', userStoryId: 'story-1' }),
      );
      mockAreAllPrerequisitesComplete.mockResolvedValue(true);

      await evaluateDependents(mockDb as never, 'task-a', 'project-1', 'tenant-1', mockLogger);

      expect(mockWithTransaction).toHaveBeenCalledTimes(1);
      expect(mockWithTransaction).toHaveBeenCalledWith(mockDb, expect.any(Function));
    });
  });
});

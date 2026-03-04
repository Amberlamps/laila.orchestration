/**
 * Unit tests for the status propagation pure functions (propagator.ts).
 *
 * Tests `deriveStoryStatus` and `deriveEpicStatus` -- pure functions that
 * aggregate child entity statuses into a parent status. No mocks are needed
 * because these functions operate on plain arrays of row objects.
 *
 * Aggregation rules follow the DAG status model defined in the design spec.
 */

import { describe, it, expect } from 'vitest';

import { deriveStoryStatus, deriveEpicStatus } from '../propagator';

import type { TaskRow, StoryRow } from '../types';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const makeTaskRow = (overrides: Partial<TaskRow> = {}): TaskRow => ({
  id: 'task-001',
  tenantId: 'tenant-001',
  userStoryId: 'story-001',
  title: 'Test Task',
  workStatus: 'pending',
  ...overrides,
});

const makeStoryRow = (overrides: Partial<StoryRow> = {}): StoryRow => ({
  id: 'story-001',
  tenantId: 'tenant-001',
  epicId: 'epic-001',
  title: 'Test Story',
  workStatus: 'pending',
  assignedWorkerId: null,
  ...overrides,
});

// ===========================================================================
// deriveStoryStatus
// ===========================================================================

describe('deriveStoryStatus', () => {
  // -------------------------------------------------------------------------
  // Done status
  // -------------------------------------------------------------------------

  describe('done status', () => {
    it('should return "done" when all tasks are done', () => {
      const tasks = [
        makeTaskRow({ id: 'task-1', workStatus: 'done' }),
        makeTaskRow({ id: 'task-2', workStatus: 'done' }),
        makeTaskRow({ id: 'task-3', workStatus: 'done' }),
      ];

      expect(deriveStoryStatus(tasks)).toBe('done');
    });

    it('should return "done" for a single done task', () => {
      const tasks = [makeTaskRow({ id: 'task-1', workStatus: 'done' })];

      expect(deriveStoryStatus(tasks)).toBe('done');
    });
  });

  // -------------------------------------------------------------------------
  // Failed status
  // -------------------------------------------------------------------------

  describe('failed status', () => {
    it('should return "failed" when any task has failed', () => {
      const tasks = [
        makeTaskRow({ id: 'task-1', workStatus: 'done' }),
        makeTaskRow({ id: 'task-2', workStatus: 'failed' }),
        makeTaskRow({ id: 'task-3', workStatus: 'in_progress' }),
      ];

      expect(deriveStoryStatus(tasks)).toBe('failed');
    });

    it('should return "failed" when all tasks have failed', () => {
      const tasks = [
        makeTaskRow({ id: 'task-1', workStatus: 'failed' }),
        makeTaskRow({ id: 'task-2', workStatus: 'failed' }),
      ];

      expect(deriveStoryStatus(tasks)).toBe('failed');
    });

    it('should prioritize "failed" over "in_progress"', () => {
      const tasks = [
        makeTaskRow({ id: 'task-1', workStatus: 'in_progress' }),
        makeTaskRow({ id: 'task-2', workStatus: 'failed' }),
      ];

      expect(deriveStoryStatus(tasks)).toBe('failed');
    });
  });

  // -------------------------------------------------------------------------
  // In-progress status
  // -------------------------------------------------------------------------

  describe('in_progress status', () => {
    it('should return "in_progress" when any task is in_progress', () => {
      const tasks = [
        makeTaskRow({ id: 'task-1', workStatus: 'pending' }),
        makeTaskRow({ id: 'task-2', workStatus: 'in_progress' }),
        makeTaskRow({ id: 'task-3', workStatus: 'blocked' }),
      ];

      expect(deriveStoryStatus(tasks)).toBe('in_progress');
    });

    it('should return "in_progress" when any task is in review', () => {
      const tasks = [
        makeTaskRow({ id: 'task-1', workStatus: 'pending' }),
        makeTaskRow({ id: 'task-2', workStatus: 'review' }),
      ];

      expect(deriveStoryStatus(tasks)).toBe('in_progress');
    });

    it('should return "in_progress" when there is a mix of done and pending tasks', () => {
      const tasks = [
        makeTaskRow({ id: 'task-1', workStatus: 'done' }),
        makeTaskRow({ id: 'task-2', workStatus: 'pending' }),
      ];

      expect(deriveStoryStatus(tasks)).toBe('in_progress');
    });
  });

  // -------------------------------------------------------------------------
  // Blocked status
  // -------------------------------------------------------------------------

  describe('blocked status', () => {
    it('should return "blocked" when all tasks are blocked', () => {
      const tasks = [
        makeTaskRow({ id: 'task-1', workStatus: 'blocked' }),
        makeTaskRow({ id: 'task-2', workStatus: 'blocked' }),
        makeTaskRow({ id: 'task-3', workStatus: 'blocked' }),
      ];

      expect(deriveStoryStatus(tasks)).toBe('blocked');
    });
  });

  // -------------------------------------------------------------------------
  // Pending status
  // -------------------------------------------------------------------------

  describe('pending status', () => {
    it('should return "pending" when all tasks are pending', () => {
      const tasks = [
        makeTaskRow({ id: 'task-1', workStatus: 'pending' }),
        makeTaskRow({ id: 'task-2', workStatus: 'pending' }),
      ];

      expect(deriveStoryStatus(tasks)).toBe('pending');
    });

    it('should return "pending" for an empty task list', () => {
      expect(deriveStoryStatus([])).toBe('pending');
    });

    it('should return "pending" for a mix of pending and blocked tasks (not all blocked)', () => {
      const tasks = [
        makeTaskRow({ id: 'task-1', workStatus: 'pending' }),
        makeTaskRow({ id: 'task-2', workStatus: 'blocked' }),
      ];

      expect(deriveStoryStatus(tasks)).toBe('pending');
    });
  });

  // -------------------------------------------------------------------------
  // Comprehensive status aggregation
  // -------------------------------------------------------------------------

  describe('comprehensive aggregation', () => {
    it('should return "pending" for a single pending task', () => {
      const tasks = [makeTaskRow({ id: 'task-1', workStatus: 'pending' })];

      expect(deriveStoryStatus(tasks)).toBe('pending');
    });

    it('should return "blocked" for a single blocked task', () => {
      const tasks = [makeTaskRow({ id: 'task-1', workStatus: 'blocked' })];

      expect(deriveStoryStatus(tasks)).toBe('blocked');
    });

    it('should return "in_progress" for a single in_progress task', () => {
      const tasks = [makeTaskRow({ id: 'task-1', workStatus: 'in_progress' })];

      expect(deriveStoryStatus(tasks)).toBe('in_progress');
    });

    it('should return "failed" for a single failed task', () => {
      const tasks = [makeTaskRow({ id: 'task-1', workStatus: 'failed' })];

      expect(deriveStoryStatus(tasks)).toBe('failed');
    });

    it('should handle all-not_started tasks as pending', () => {
      const tasks = [
        makeTaskRow({ id: 'task-1', workStatus: 'not_started' }),
        makeTaskRow({ id: 'task-2', workStatus: 'not_started' }),
      ];

      // not_started is not done, not failed, not in_progress/review, not all blocked
      // Falls through to the default 'pending'
      expect(deriveStoryStatus(tasks)).toBe('pending');
    });
  });
});

// ===========================================================================
// deriveEpicStatus
// ===========================================================================

describe('deriveEpicStatus', () => {
  // -------------------------------------------------------------------------
  // Done status
  // -------------------------------------------------------------------------

  describe('done status', () => {
    it('should return "done" when all stories are done', () => {
      const stories = [
        makeStoryRow({ id: 'story-1', workStatus: 'done' }),
        makeStoryRow({ id: 'story-2', workStatus: 'done' }),
      ];

      expect(deriveEpicStatus(stories)).toBe('done');
    });

    it('should return "done" for a single done story', () => {
      const stories = [makeStoryRow({ id: 'story-1', workStatus: 'done' })];

      expect(deriveEpicStatus(stories)).toBe('done');
    });
  });

  // -------------------------------------------------------------------------
  // Failed status
  // -------------------------------------------------------------------------

  describe('failed status', () => {
    it('should return "failed" when failed with no active work (done + failed)', () => {
      const stories = [
        makeStoryRow({ id: 'story-1', workStatus: 'done' }),
        makeStoryRow({ id: 'story-2', workStatus: 'failed' }),
      ];

      // No active stories (in_progress/pending/review), so failed takes effect
      expect(deriveEpicStatus(stories)).toBe('failed');
    });

    it('should return "failed" when all stories have failed', () => {
      const stories = [
        makeStoryRow({ id: 'story-1', workStatus: 'failed' }),
        makeStoryRow({ id: 'story-2', workStatus: 'failed' }),
      ];

      expect(deriveEpicStatus(stories)).toBe('failed');
    });

    it('should return "in_progress" when failed stories coexist with active stories', () => {
      const stories = [
        makeStoryRow({ id: 'story-1', workStatus: 'failed' }),
        makeStoryRow({ id: 'story-2', workStatus: 'in_progress' }),
      ];

      // Active work takes precedence over failed
      expect(deriveEpicStatus(stories)).toBe('in_progress');
    });

    it('should return "in_progress" when failed stories coexist with pending stories', () => {
      const stories = [
        makeStoryRow({ id: 'story-1', workStatus: 'failed' }),
        makeStoryRow({ id: 'story-2', workStatus: 'pending' }),
      ];

      // Pending counts as active -- work is still ongoing
      expect(deriveEpicStatus(stories)).toBe('in_progress');
    });
  });

  // -------------------------------------------------------------------------
  // Blocked status
  // -------------------------------------------------------------------------

  describe('blocked status', () => {
    it('should return "blocked" when all stories are blocked', () => {
      const stories = [
        makeStoryRow({ id: 'story-1', workStatus: 'blocked' }),
        makeStoryRow({ id: 'story-2', workStatus: 'blocked' }),
      ];

      expect(deriveEpicStatus(stories)).toBe('blocked');
    });
  });

  // -------------------------------------------------------------------------
  // In-progress status
  // -------------------------------------------------------------------------

  describe('in_progress status', () => {
    it('should return "in_progress" when any story is in_progress', () => {
      const stories = [
        makeStoryRow({ id: 'story-1', workStatus: 'done' }),
        makeStoryRow({ id: 'story-2', workStatus: 'in_progress' }),
      ];

      expect(deriveEpicStatus(stories)).toBe('in_progress');
    });

    it('should return "in_progress" when any story is pending', () => {
      const stories = [
        makeStoryRow({ id: 'story-1', workStatus: 'done' }),
        makeStoryRow({ id: 'story-2', workStatus: 'pending' }),
      ];

      expect(deriveEpicStatus(stories)).toBe('in_progress');
    });

    it('should return "in_progress" when any story is in review', () => {
      const stories = [
        makeStoryRow({ id: 'story-1', workStatus: 'blocked' }),
        makeStoryRow({ id: 'story-2', workStatus: 'review' }),
      ];

      expect(deriveEpicStatus(stories)).toBe('in_progress');
    });

    it('should return "in_progress" for a mix of done and blocked stories', () => {
      const stories = [
        makeStoryRow({ id: 'story-1', workStatus: 'done' }),
        makeStoryRow({ id: 'story-2', workStatus: 'blocked' }),
      ];

      // Mixed states (not all done, not all blocked, no active, no failed)
      // indicate partial progress -> in_progress
      expect(deriveEpicStatus(stories)).toBe('in_progress');
    });
  });

  // -------------------------------------------------------------------------
  // Pending status
  // -------------------------------------------------------------------------

  describe('pending status', () => {
    it('should return "pending" for an empty story list', () => {
      expect(deriveEpicStatus([])).toBe('pending');
    });

    it('should return "pending" when all stories are pending', () => {
      const stories = [
        makeStoryRow({ id: 'story-1', workStatus: 'pending' }),
        makeStoryRow({ id: 'story-2', workStatus: 'pending' }),
      ];

      expect(deriveEpicStatus(stories)).toBe('pending');
    });
  });

  // -------------------------------------------------------------------------
  // Multiple stories
  // -------------------------------------------------------------------------

  describe('multiple stories', () => {
    it('should handle many stories with mixed statuses', () => {
      const stories = [
        makeStoryRow({ id: 'story-1', workStatus: 'done' }),
        makeStoryRow({ id: 'story-2', workStatus: 'done' }),
        makeStoryRow({ id: 'story-3', workStatus: 'in_progress' }),
        makeStoryRow({ id: 'story-4', workStatus: 'pending' }),
        makeStoryRow({ id: 'story-5', workStatus: 'blocked' }),
      ];

      expect(deriveEpicStatus(stories)).toBe('in_progress');
    });

    it('should not change epic status when stories are still in progress', () => {
      const stories = [
        makeStoryRow({ id: 'story-1', workStatus: 'done' }),
        makeStoryRow({ id: 'story-2', workStatus: 'in_progress' }),
        makeStoryRow({ id: 'story-3', workStatus: 'pending' }),
      ];

      const result = deriveEpicStatus(stories);
      expect(result).toBe('in_progress');
      expect(result).not.toBe('done');
    });
  });
});

// Unit tests for task status determination functions.
// Verifies that determineTaskStatus, determineInitialTaskStatus, and
// batchDetermineTaskStatuses correctly compute statuses from the DAG.

import { describe, it, expect } from 'vitest';

import {
  determineTaskStatus,
  determineInitialTaskStatus,
  batchDetermineTaskStatuses,
} from '../../status/task-status-determination';

import type { AdjacencyList } from '../../dag/types';
import type { TaskStatusDetermination } from '../../status/task-status-determination';
import type { TaskStatus } from '../../status/transition-definitions';

// ---------------------------------------------------------------------------
// Helper: build an AdjacencyList from a plain object.
// ---------------------------------------------------------------------------
const buildAdjacencyList = (obj: Record<string, string[]>): AdjacencyList => {
  const map = new Map<string, Set<string>>();
  for (const [key, deps] of Object.entries(obj)) {
    map.set(key, new Set(deps));
  }
  return map;
};

// ===========================================================================
// determineTaskStatus
// ===========================================================================
describe('determineTaskStatus', () => {
  describe('tasks with no dependencies', () => {
    it('returns not-started when task has no dependencies and is currently blocked', () => {
      const dag = buildAdjacencyList({ 'task-1': [] });
      const completed = new Set<string>();

      const result = determineTaskStatus('task-1', 'blocked', dag, completed);

      expect(result.shouldChange).toBe(true);
      if (result.shouldChange) {
        expect(result.newStatus).toBe('not-started');
        expect(result.reason).toBeTruthy();
      }
    });

    it('returns shouldChange: false when task has no dependencies and is already not-started', () => {
      const dag = buildAdjacencyList({ 'task-1': [] });
      const completed = new Set<string>();

      const result = determineTaskStatus('task-1', 'not-started', dag, completed);

      expect(result.shouldChange).toBe(false);
      expect(result.currentStatus).toBe('not-started');
    });

    it('returns not-started when task is not in the DAG at all', () => {
      const dag = buildAdjacencyList({});
      const completed = new Set<string>();

      const result = determineTaskStatus('task-1', 'blocked', dag, completed);

      expect(result.shouldChange).toBe(true);
      if (result.shouldChange) {
        expect(result.newStatus).toBe('not-started');
        expect(result.reason).toBe('Task has no dependencies');
      }
    });
  });

  describe('tasks with all dependencies complete', () => {
    it('returns not-started when all dependencies are in the completed set', () => {
      const dag = buildAdjacencyList({ 'task-3': ['task-1', 'task-2'] });
      const completed = new Set(['task-1', 'task-2']);

      const result = determineTaskStatus('task-3', 'blocked', dag, completed);

      expect(result.shouldChange).toBe(true);
      if (result.shouldChange) {
        expect(result.newStatus).toBe('not-started');
        expect(result.reason).toBe('All dependencies are now complete');
      }
    });

    it('returns shouldChange: false when already not-started and all deps complete', () => {
      const dag = buildAdjacencyList({ 'task-3': ['task-1', 'task-2'] });
      const completed = new Set(['task-1', 'task-2']);

      const result = determineTaskStatus('task-3', 'not-started', dag, completed);

      expect(result.shouldChange).toBe(false);
      expect(result.currentStatus).toBe('not-started');
    });
  });

  describe('tasks with incomplete dependencies', () => {
    it('returns blocked when any dependency is not in the completed set', () => {
      const dag = buildAdjacencyList({ 'task-3': ['task-1', 'task-2'] });
      const completed = new Set(['task-1']); // task-2 not complete

      const result = determineTaskStatus('task-3', 'not-started', dag, completed);

      expect(result.shouldChange).toBe(true);
      if (result.shouldChange) {
        expect(result.newStatus).toBe('blocked');
        expect(result.reason).toBe('Some dependencies are still incomplete');
      }
    });

    it('returns blocked when no dependencies are complete', () => {
      const dag = buildAdjacencyList({ 'task-2': ['task-1'] });
      const completed = new Set<string>();

      const result = determineTaskStatus('task-2', 'not-started', dag, completed);

      expect(result.shouldChange).toBe(true);
      if (result.shouldChange) {
        expect(result.newStatus).toBe('blocked');
      }
    });

    it('returns shouldChange: false when already blocked and some deps incomplete', () => {
      const dag = buildAdjacencyList({ 'task-3': ['task-1', 'task-2'] });
      const completed = new Set(['task-1']); // task-2 not complete

      const result = determineTaskStatus('task-3', 'blocked', dag, completed);

      expect(result.shouldChange).toBe(false);
      expect(result.currentStatus).toBe('blocked');
    });
  });

  describe('immune statuses (in-progress and complete)', () => {
    it('does not change in-progress tasks', () => {
      const dag = buildAdjacencyList({ 'task-2': ['task-1'] });
      const completed = new Set<string>(); // dep not complete

      const result = determineTaskStatus('task-2', 'in-progress', dag, completed);

      expect(result.shouldChange).toBe(false);
      expect(result.currentStatus).toBe('in-progress');
    });

    it('does not change complete tasks', () => {
      const dag = buildAdjacencyList({ 'task-2': ['task-1'] });
      const completed = new Set<string>(); // dep not complete

      const result = determineTaskStatus('task-2', 'complete', dag, completed);

      expect(result.shouldChange).toBe(false);
      expect(result.currentStatus).toBe('complete');
    });

    it('does not change in-progress tasks even when all deps are complete', () => {
      const dag = buildAdjacencyList({ 'task-2': ['task-1'] });
      const completed = new Set(['task-1']);

      const result = determineTaskStatus('task-2', 'in-progress', dag, completed);

      expect(result.shouldChange).toBe(false);
      expect(result.currentStatus).toBe('in-progress');
    });

    it('does not change complete tasks even with no dependencies', () => {
      const dag = buildAdjacencyList({ 'task-1': [] });
      const completed = new Set<string>();

      const result = determineTaskStatus('task-1', 'complete', dag, completed);

      expect(result.shouldChange).toBe(false);
      expect(result.currentStatus).toBe('complete');
    });
  });

  describe('status already matches computed status', () => {
    it('returns shouldChange: false when blocked and should be blocked', () => {
      const dag = buildAdjacencyList({ 'task-2': ['task-1'] });
      const completed = new Set<string>();

      const result = determineTaskStatus('task-2', 'blocked', dag, completed);

      expect(result.shouldChange).toBe(false);
    });

    it('returns shouldChange: false when not-started and should be not-started (no deps)', () => {
      const dag = buildAdjacencyList({});
      const completed = new Set<string>();

      const result = determineTaskStatus('task-1', 'not-started', dag, completed);

      expect(result.shouldChange).toBe(false);
    });

    it('returns shouldChange: false when not-started and should be not-started (all deps complete)', () => {
      const dag = buildAdjacencyList({ 'task-2': ['task-1'] });
      const completed = new Set(['task-1']);

      const result = determineTaskStatus('task-2', 'not-started', dag, completed);

      expect(result.shouldChange).toBe(false);
    });
  });

  describe('reason messages', () => {
    it('includes a reason when status changes to not-started (no deps)', () => {
      const dag = buildAdjacencyList({ 'task-1': [] });
      const result = determineTaskStatus('task-1', 'blocked', dag, new Set());

      expect(result.shouldChange).toBe(true);
      if (result.shouldChange) {
        expect(result.reason).toBe('Task has no dependencies');
      }
    });

    it('includes a reason when status changes to not-started (all deps complete)', () => {
      const dag = buildAdjacencyList({ 'task-2': ['task-1'] });
      const result = determineTaskStatus('task-2', 'blocked', dag, new Set(['task-1']));

      expect(result.shouldChange).toBe(true);
      if (result.shouldChange) {
        expect(result.reason).toBe('All dependencies are now complete');
      }
    });

    it('includes a reason when status changes to blocked', () => {
      const dag = buildAdjacencyList({ 'task-2': ['task-1'] });
      const result = determineTaskStatus('task-2', 'not-started', dag, new Set());

      expect(result.shouldChange).toBe(true);
      if (result.shouldChange) {
        expect(result.reason).toBe('Some dependencies are still incomplete');
      }
    });
  });
});

// ===========================================================================
// determineInitialTaskStatus
// ===========================================================================
describe('determineInitialTaskStatus', () => {
  it('returns not-started when task has no dependencies', () => {
    const dag = buildAdjacencyList({});
    const completed = new Set<string>();

    const result = determineInitialTaskStatus('task-1', dag, completed);

    expect(result).toBe('not-started');
  });

  it('returns not-started when task has empty dependency set', () => {
    const dag = buildAdjacencyList({ 'task-1': [] });
    const completed = new Set<string>();

    const result = determineInitialTaskStatus('task-1', dag, completed);

    expect(result).toBe('not-started');
  });

  it('returns not-started when all dependencies are complete', () => {
    const dag = buildAdjacencyList({ 'task-3': ['task-1', 'task-2'] });
    const completed = new Set(['task-1', 'task-2']);

    const result = determineInitialTaskStatus('task-3', dag, completed);

    expect(result).toBe('not-started');
  });

  it('returns blocked when some dependencies are incomplete', () => {
    const dag = buildAdjacencyList({ 'task-3': ['task-1', 'task-2'] });
    const completed = new Set(['task-1']); // task-2 not complete

    const result = determineInitialTaskStatus('task-3', dag, completed);

    expect(result).toBe('blocked');
  });

  it('returns blocked when no dependencies are complete', () => {
    const dag = buildAdjacencyList({ 'task-2': ['task-1'] });
    const completed = new Set<string>();

    const result = determineInitialTaskStatus('task-2', dag, completed);

    expect(result).toBe('blocked');
  });

  it('returns blocked with single incomplete dependency', () => {
    const dag = buildAdjacencyList({ 'task-2': ['task-1'] });
    const completed = new Set<string>();

    const result = determineInitialTaskStatus('task-2', dag, completed);

    expect(result).toBe('blocked');
  });
});

// ===========================================================================
// batchDetermineTaskStatuses
// ===========================================================================
describe('batchDetermineTaskStatuses', () => {
  it('returns only tasks that need status changes', () => {
    const dag = buildAdjacencyList({
      'task-1': [],
      'task-2': ['task-1'],
      'task-3': ['task-1'],
    });
    const completed = new Set(['task-1']);
    const statuses = new Map<string, TaskStatus>([
      ['task-1', 'complete'],
      ['task-2', 'blocked'], // should change to not-started
      ['task-3', 'not-started'], // already correct, no change
    ]);

    const results = batchDetermineTaskStatuses(
      ['task-1', 'task-2', 'task-3'],
      statuses,
      dag,
      completed,
    );

    // task-1: complete, immune -> shouldChange: false (filtered out)
    // task-2: blocked -> not-started (shouldChange: true, included)
    // task-3: not-started -> not-started (shouldChange: false, filtered out)
    expect(results).toHaveLength(1);
    const first = results[0]!;
    expect(first.shouldChange).toBe(true);
    if (first.shouldChange) {
      expect(first.currentStatus).toBe('blocked');
      expect(first.newStatus).toBe('not-started');
    }
  });

  it('returns empty array when no tasks need changes', () => {
    const dag = buildAdjacencyList({
      'task-1': [],
      'task-2': ['task-1'],
    });
    const completed = new Set<string>();
    const statuses = new Map<string, TaskStatus>([
      ['task-1', 'not-started'],
      ['task-2', 'blocked'],
    ]);

    const results = batchDetermineTaskStatuses(['task-1', 'task-2'], statuses, dag, completed);

    expect(results).toHaveLength(0);
  });

  it('skips tasks that are not in the currentStatuses map', () => {
    const dag = buildAdjacencyList({ 'task-1': [] });
    const completed = new Set<string>();
    const statuses = new Map<string, TaskStatus>();

    const results = batchDetermineTaskStatuses(['task-1'], statuses, dag, completed);

    expect(results).toHaveLength(0);
  });

  it('evaluates multiple tasks and returns all that need changes', () => {
    const dag = buildAdjacencyList({
      'task-1': [],
      'task-2': ['task-1'],
      'task-3': ['task-2'],
      'task-4': ['task-1'],
    });
    const completed = new Set(['task-1']);
    const statuses = new Map<string, TaskStatus>([
      ['task-1', 'complete'],
      ['task-2', 'blocked'], // deps complete -> should change to not-started
      ['task-3', 'not-started'], // dep task-2 not complete -> should change to blocked
      ['task-4', 'blocked'], // deps complete -> should change to not-started
    ]);

    const results = batchDetermineTaskStatuses(
      ['task-1', 'task-2', 'task-3', 'task-4'],
      statuses,
      dag,
      completed,
    );

    // task-1: complete, immune
    // task-2: blocked -> not-started (change)
    // task-3: not-started -> blocked (change)
    // task-4: blocked -> not-started (change)
    expect(results).toHaveLength(3);

    const changedStatuses = results.filter(
      (r): r is Extract<TaskStatusDetermination, { shouldChange: true }> => r.shouldChange,
    );
    expect(changedStatuses).toHaveLength(3);

    // All should have reasons
    for (const r of changedStatuses) {
      expect(r.reason).toBeTruthy();
    }
  });

  it('handles empty taskIds array', () => {
    const dag = buildAdjacencyList({});
    const completed = new Set<string>();
    const statuses = new Map<string, TaskStatus>();

    const results = batchDetermineTaskStatuses([], statuses, dag, completed);

    expect(results).toHaveLength(0);
  });

  it('does not include in-progress tasks in results', () => {
    const dag = buildAdjacencyList({
      'task-1': [],
      'task-2': ['task-1'],
    });
    const completed = new Set<string>();
    const statuses = new Map<string, TaskStatus>([
      ['task-1', 'in-progress'],
      ['task-2', 'blocked'],
    ]);

    const results = batchDetermineTaskStatuses(['task-1', 'task-2'], statuses, dag, completed);

    // task-1: in-progress, immune -> shouldChange: false (filtered)
    // task-2: blocked, deps incomplete -> shouldChange: false (already correct, filtered)
    expect(results).toHaveLength(0);
  });
});

// ===========================================================================
// Pure function guarantee
// ===========================================================================
describe('Pure function guarantees', () => {
  it('determineTaskStatus does not mutate the adjacency list', () => {
    const dag = buildAdjacencyList({ 'task-2': ['task-1'] });
    const dagSnapshot = new Map(Array.from(dag.entries()).map(([k, v]) => [k, new Set(v)]));

    determineTaskStatus('task-2', 'blocked', dag, new Set(['task-1']));

    for (const [key, value] of dagSnapshot) {
      const current = dag.get(key);
      expect(current).toBeDefined();
      expect(new Set(current)).toEqual(value);
    }
  });

  it('determineTaskStatus does not mutate the completedTaskIds set', () => {
    const completed = new Set(['task-1']);
    const snapshot = new Set(completed);
    const dag = buildAdjacencyList({ 'task-2': ['task-1'] });

    determineTaskStatus('task-2', 'blocked', dag, completed);

    expect(completed).toEqual(snapshot);
  });

  it('batchDetermineTaskStatuses does not mutate the currentStatuses map', () => {
    const statuses = new Map<string, TaskStatus>([
      ['task-1', 'not-started'],
      ['task-2', 'blocked'],
    ]);
    const snapshot = new Map(statuses);
    const dag = buildAdjacencyList({ 'task-2': ['task-1'] });

    batchDetermineTaskStatuses(['task-1', 'task-2'], statuses, dag, new Set(['task-1']));

    expect(statuses).toEqual(snapshot);
  });
});

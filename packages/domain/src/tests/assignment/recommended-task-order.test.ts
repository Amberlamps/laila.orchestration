// Unit tests for recommended task order computation.
// Verifies dependency-respecting ordering, readiness classification,
// cross-story dep exclusion, and graceful fallback on sort failure.

import { describe, it, expect } from 'vitest';

import {
  computeRecommendedTaskOrder,
  getNextReadyTasks,
} from '../../assignment/recommended-task-order';

import type { TaskOrderInfo } from '../../assignment/recommended-task-order';
import type { AdjacencyList } from '../../dag/types';
import type { TaskStatus } from '../../status/transition-definitions';

// ---------------------------------------------------------------------------
// Helper: build a TaskOrderInfo map from a record of id -> status.
// ---------------------------------------------------------------------------
const buildTaskStatuses = (entries: Record<string, TaskStatus>): Map<string, TaskOrderInfo> => {
  const map = new Map<string, TaskOrderInfo>();
  for (const [id, status] of Object.entries(entries)) {
    map.set(id, { id, status });
  }
  return map;
};

// ---------------------------------------------------------------------------
// Helper: build an AdjacencyList from a record of node -> dependencies.
// ---------------------------------------------------------------------------
const buildAdjacencyList = (entries: Record<string, string[]>): AdjacencyList => {
  const map: AdjacencyList = new Map();
  for (const [node, deps] of Object.entries(entries)) {
    map.set(node, new Set(deps));
  }
  return map;
};

// ===========================================================================
// computeRecommendedTaskOrder
// ===========================================================================
describe('computeRecommendedTaskOrder', () => {
  describe('empty story', () => {
    it('returns all empty arrays for an empty story', () => {
      const result = computeRecommendedTaskOrder([], new Map(), new Map());
      expect(result.orderedTasks).toEqual([]);
      expect(result.readyNow).toEqual([]);
      expect(result.blocked).toEqual([]);
      expect(result.completed).toEqual([]);
      expect(result.inProgress).toEqual([]);
    });
  });

  describe('single task', () => {
    it('classifies a single not-started task as readyNow', () => {
      const taskStatuses = buildTaskStatuses({ 'task-1': 'not-started' });
      const adjacencyList: AdjacencyList = new Map();

      const result = computeRecommendedTaskOrder(['task-1'], taskStatuses, adjacencyList);

      expect(result.orderedTasks).toEqual(['task-1']);
      expect(result.readyNow).toEqual(['task-1']);
      expect(result.blocked).toEqual([]);
      expect(result.completed).toEqual([]);
      expect(result.inProgress).toEqual([]);
    });

    it('classifies a single complete task as completed', () => {
      const taskStatuses = buildTaskStatuses({ 'task-1': 'complete' });
      const adjacencyList: AdjacencyList = new Map();

      const result = computeRecommendedTaskOrder(['task-1'], taskStatuses, adjacencyList);

      expect(result.orderedTasks).toEqual(['task-1']);
      expect(result.readyNow).toEqual([]);
      expect(result.completed).toEqual(['task-1']);
    });

    it('classifies a single in-progress task as inProgress', () => {
      const taskStatuses = buildTaskStatuses({ 'task-1': 'in-progress' });
      const adjacencyList: AdjacencyList = new Map();

      const result = computeRecommendedTaskOrder(['task-1'], taskStatuses, adjacencyList);

      expect(result.orderedTasks).toEqual(['task-1']);
      expect(result.inProgress).toEqual(['task-1']);
      expect(result.readyNow).toEqual([]);
    });

    it('classifies a single blocked task as blocked', () => {
      const taskStatuses = buildTaskStatuses({ 'task-1': 'blocked' });
      const adjacencyList: AdjacencyList = new Map();

      const result = computeRecommendedTaskOrder(['task-1'], taskStatuses, adjacencyList);

      expect(result.orderedTasks).toEqual(['task-1']);
      expect(result.blocked).toEqual(['task-1']);
      expect(result.readyNow).toEqual([]);
    });
  });

  describe('dependency ordering', () => {
    it('returns tasks in dependency-respecting order (deps before dependents)', () => {
      // task-2 depends on task-1
      const taskStatuses = buildTaskStatuses({
        'task-1': 'not-started',
        'task-2': 'not-started',
      });
      const adjacencyList = buildAdjacencyList({
        'task-2': ['task-1'],
      });

      const result = computeRecommendedTaskOrder(['task-1', 'task-2'], taskStatuses, adjacencyList);

      const idx1 = result.orderedTasks.indexOf('task-1');
      const idx2 = result.orderedTasks.indexOf('task-2');
      expect(idx1).toBeLessThan(idx2);
    });

    it('handles a chain of three tasks in correct order', () => {
      // task-3 -> task-2 -> task-1
      const taskStatuses = buildTaskStatuses({
        'task-1': 'not-started',
        'task-2': 'not-started',
        'task-3': 'not-started',
      });
      const adjacencyList = buildAdjacencyList({
        'task-2': ['task-1'],
        'task-3': ['task-2'],
      });

      const result = computeRecommendedTaskOrder(
        ['task-1', 'task-2', 'task-3'],
        taskStatuses,
        adjacencyList,
      );

      const idx1 = result.orderedTasks.indexOf('task-1');
      const idx2 = result.orderedTasks.indexOf('task-2');
      const idx3 = result.orderedTasks.indexOf('task-3');
      expect(idx1).toBeLessThan(idx2);
      expect(idx2).toBeLessThan(idx3);
    });

    it('tasks with no dependencies appear before their dependents', () => {
      // task-b depends on task-a; task-c is independent
      const taskStatuses = buildTaskStatuses({
        'task-a': 'not-started',
        'task-b': 'not-started',
        'task-c': 'not-started',
      });
      const adjacencyList = buildAdjacencyList({
        'task-b': ['task-a'],
      });

      const result = computeRecommendedTaskOrder(
        ['task-a', 'task-b', 'task-c'],
        taskStatuses,
        adjacencyList,
      );

      const idxA = result.orderedTasks.indexOf('task-a');
      const idxB = result.orderedTasks.indexOf('task-b');
      expect(idxA).toBeLessThan(idxB);
      // task-c has no deps, so it should appear in orderedTasks
      expect(result.orderedTasks).toContain('task-c');
    });
  });

  describe('readiness classification', () => {
    it('readyNow contains only tasks whose intra-story deps are all complete', () => {
      // task-2 depends on task-1; task-1 is complete
      const taskStatuses = buildTaskStatuses({
        'task-1': 'complete',
        'task-2': 'not-started',
      });
      const adjacencyList = buildAdjacencyList({
        'task-2': ['task-1'],
      });

      const result = computeRecommendedTaskOrder(['task-1', 'task-2'], taskStatuses, adjacencyList);

      expect(result.readyNow).toEqual(['task-2']);
      expect(result.completed).toEqual(['task-1']);
      expect(result.blocked).toEqual([]);
    });

    it('blocked contains tasks with incomplete intra-story deps', () => {
      // task-2 depends on task-1; task-1 is not-started
      const taskStatuses = buildTaskStatuses({
        'task-1': 'not-started',
        'task-2': 'not-started',
      });
      const adjacencyList = buildAdjacencyList({
        'task-2': ['task-1'],
      });

      const result = computeRecommendedTaskOrder(['task-1', 'task-2'], taskStatuses, adjacencyList);

      expect(result.readyNow).toEqual(['task-1']);
      expect(result.blocked).toEqual(['task-2']);
    });

    it('task with blocked status is classified as blocked', () => {
      const taskStatuses = buildTaskStatuses({
        'task-1': 'complete',
        'task-2': 'blocked',
      });
      const adjacencyList = buildAdjacencyList({
        'task-2': ['task-1'],
      });

      const result = computeRecommendedTaskOrder(['task-1', 'task-2'], taskStatuses, adjacencyList);

      expect(result.blocked).toEqual(['task-2']);
      expect(result.readyNow).toEqual([]);
    });

    it('task with in-progress dep is blocked', () => {
      // task-2 depends on task-1; task-1 is in-progress
      const taskStatuses = buildTaskStatuses({
        'task-1': 'in-progress',
        'task-2': 'not-started',
      });
      const adjacencyList = buildAdjacencyList({
        'task-2': ['task-1'],
      });

      const result = computeRecommendedTaskOrder(['task-1', 'task-2'], taskStatuses, adjacencyList);

      expect(result.inProgress).toEqual(['task-1']);
      expect(result.blocked).toEqual(['task-2']);
      expect(result.readyNow).toEqual([]);
    });

    it('task with no deps and not-started status is readyNow', () => {
      const taskStatuses = buildTaskStatuses({
        'task-1': 'not-started',
        'task-2': 'not-started',
      });
      const adjacencyList: AdjacencyList = new Map();

      const result = computeRecommendedTaskOrder(['task-1', 'task-2'], taskStatuses, adjacencyList);

      expect(result.readyNow).toContain('task-1');
      expect(result.readyNow).toContain('task-2');
      expect(result.blocked).toEqual([]);
    });
  });

  describe('status classification', () => {
    it('completed contains tasks in complete status', () => {
      const taskStatuses = buildTaskStatuses({
        'task-1': 'complete',
        'task-2': 'complete',
        'task-3': 'not-started',
      });
      const adjacencyList: AdjacencyList = new Map();

      const result = computeRecommendedTaskOrder(
        ['task-1', 'task-2', 'task-3'],
        taskStatuses,
        adjacencyList,
      );

      expect(result.completed).toContain('task-1');
      expect(result.completed).toContain('task-2');
      expect(result.completed).not.toContain('task-3');
    });

    it('inProgress contains tasks in in-progress status', () => {
      const taskStatuses = buildTaskStatuses({
        'task-1': 'in-progress',
        'task-2': 'not-started',
      });
      const adjacencyList: AdjacencyList = new Map();

      const result = computeRecommendedTaskOrder(['task-1', 'task-2'], taskStatuses, adjacencyList);

      expect(result.inProgress).toEqual(['task-1']);
      expect(result.inProgress).not.toContain('task-2');
    });

    it('story with all tasks complete returns empty readyNow and all in completed', () => {
      const taskStatuses = buildTaskStatuses({
        'task-1': 'complete',
        'task-2': 'complete',
        'task-3': 'complete',
      });
      const adjacencyList = buildAdjacencyList({
        'task-2': ['task-1'],
        'task-3': ['task-2'],
      });

      const result = computeRecommendedTaskOrder(
        ['task-1', 'task-2', 'task-3'],
        taskStatuses,
        adjacencyList,
      );

      expect(result.readyNow).toEqual([]);
      expect(result.blocked).toEqual([]);
      expect(result.inProgress).toEqual([]);
      expect(result.completed).toEqual(['task-1', 'task-2', 'task-3']);
    });
  });

  describe('cross-story dependencies', () => {
    it('cross-story dependencies are not considered for intra-story readiness', () => {
      // task-2 depends on task-1 (intra-story) and external-task (cross-story)
      // Only task-1 is in the story. external-task is outside the story.
      const taskStatuses = buildTaskStatuses({
        'task-1': 'complete',
        'task-2': 'not-started',
      });
      // task-2 depends on both task-1 and external-task
      const adjacencyList = buildAdjacencyList({
        'task-2': ['task-1', 'external-task'],
      });

      const result = computeRecommendedTaskOrder(['task-1', 'task-2'], taskStatuses, adjacencyList);

      // task-2 should be readyNow because its intra-story dep (task-1) is complete.
      // The cross-story dep (external-task) is not considered.
      expect(result.readyNow).toEqual(['task-2']);
    });

    it('task with only cross-story deps is considered ready', () => {
      const taskStatuses = buildTaskStatuses({
        'task-1': 'not-started',
      });
      // task-1 depends only on external-task (not in story)
      const adjacencyList = buildAdjacencyList({
        'task-1': ['external-task'],
      });

      const result = computeRecommendedTaskOrder(['task-1'], taskStatuses, adjacencyList);

      // No intra-story deps, so task-1 is ready
      expect(result.readyNow).toEqual(['task-1']);
    });
  });

  describe('graceful fallback on sort failure', () => {
    it('falls back to original order if topological sort detects a cycle', () => {
      // Create a cycle: task-1 depends on task-2 and task-2 depends on task-1
      // This should not happen in practice but the function handles it gracefully.
      const taskStatuses = buildTaskStatuses({
        'task-1': 'not-started',
        'task-2': 'not-started',
      });
      const adjacencyList = buildAdjacencyList({
        'task-1': ['task-2'],
        'task-2': ['task-1'],
      });

      const result = computeRecommendedTaskOrder(['task-1', 'task-2'], taskStatuses, adjacencyList);

      // Fallback: original order is preserved
      expect(result.orderedTasks).toEqual(['task-1', 'task-2']);
      // Both tasks are blocked because each depends on the other
      // (and neither is complete)
      expect(result.blocked).toEqual(['task-1', 'task-2']);
      expect(result.readyNow).toEqual([]);
    });
  });

  describe('tasks not in status map', () => {
    it('skips tasks that have no entry in taskStatuses', () => {
      // task-1 has a status, task-2 does not
      const taskStatuses = buildTaskStatuses({
        'task-1': 'not-started',
      });
      const adjacencyList: AdjacencyList = new Map();

      const result = computeRecommendedTaskOrder(['task-1', 'task-2'], taskStatuses, adjacencyList);

      expect(result.orderedTasks).toContain('task-1');
      expect(result.orderedTasks).toContain('task-2');
      // task-2 is in orderedTasks but not classified
      expect(result.readyNow).toEqual(['task-1']);
      expect(result.blocked).toEqual([]);
      expect(result.completed).toEqual([]);
      expect(result.inProgress).toEqual([]);
    });
  });

  describe('complex scenarios', () => {
    it('handles a diamond dependency pattern correctly', () => {
      // task-d depends on task-b and task-c
      // task-b depends on task-a
      // task-c depends on task-a
      const taskStatuses = buildTaskStatuses({
        'task-a': 'complete',
        'task-b': 'not-started',
        'task-c': 'not-started',
        'task-d': 'not-started',
      });
      const adjacencyList = buildAdjacencyList({
        'task-b': ['task-a'],
        'task-c': ['task-a'],
        'task-d': ['task-b', 'task-c'],
      });

      const result = computeRecommendedTaskOrder(
        ['task-a', 'task-b', 'task-c', 'task-d'],
        taskStatuses,
        adjacencyList,
      );

      // task-a is complete
      expect(result.completed).toEqual(['task-a']);
      // task-b and task-c are ready (task-a is complete)
      expect(result.readyNow).toContain('task-b');
      expect(result.readyNow).toContain('task-c');
      // task-d is blocked (task-b and task-c are not complete)
      expect(result.blocked).toEqual(['task-d']);
    });

    it('handles mixed statuses across story tasks', () => {
      // task-3 depends on task-2 depends on task-1
      const taskStatuses = buildTaskStatuses({
        'task-1': 'complete',
        'task-2': 'in-progress',
        'task-3': 'not-started',
      });
      const adjacencyList = buildAdjacencyList({
        'task-2': ['task-1'],
        'task-3': ['task-2'],
      });

      const result = computeRecommendedTaskOrder(
        ['task-1', 'task-2', 'task-3'],
        taskStatuses,
        adjacencyList,
      );

      expect(result.completed).toEqual(['task-1']);
      expect(result.inProgress).toEqual(['task-2']);
      expect(result.blocked).toEqual(['task-3']);
      expect(result.readyNow).toEqual([]);
    });

    it('partially complete deps allow some tasks to be ready', () => {
      // task-b depends on task-a (complete)
      // task-c depends on task-a (complete) and task-b (not-started)
      const taskStatuses = buildTaskStatuses({
        'task-a': 'complete',
        'task-b': 'not-started',
        'task-c': 'not-started',
      });
      const adjacencyList = buildAdjacencyList({
        'task-b': ['task-a'],
        'task-c': ['task-a', 'task-b'],
      });

      const result = computeRecommendedTaskOrder(
        ['task-a', 'task-b', 'task-c'],
        taskStatuses,
        adjacencyList,
      );

      expect(result.completed).toEqual(['task-a']);
      expect(result.readyNow).toEqual(['task-b']);
      expect(result.blocked).toEqual(['task-c']);
    });
  });
});

// ===========================================================================
// getNextReadyTasks
// ===========================================================================
describe('getNextReadyTasks', () => {
  it('returns only ready tasks in recommended order', () => {
    const taskStatuses = buildTaskStatuses({
      'task-1': 'complete',
      'task-2': 'not-started',
      'task-3': 'not-started',
    });
    const adjacencyList = buildAdjacencyList({
      'task-2': ['task-1'],
      'task-3': ['task-1'],
    });

    const result = getNextReadyTasks(['task-1', 'task-2', 'task-3'], taskStatuses, adjacencyList);

    expect(result).toContain('task-2');
    expect(result).toContain('task-3');
    expect(result).not.toContain('task-1');
  });

  it('returns empty array for empty story', () => {
    const result = getNextReadyTasks([], new Map(), new Map());
    expect(result).toEqual([]);
  });

  it('returns empty array when all tasks are complete', () => {
    const taskStatuses = buildTaskStatuses({
      'task-1': 'complete',
      'task-2': 'complete',
    });
    const adjacencyList: AdjacencyList = new Map();

    const result = getNextReadyTasks(['task-1', 'task-2'], taskStatuses, adjacencyList);

    expect(result).toEqual([]);
  });

  it('returns empty array when all tasks are blocked', () => {
    // Cycle creates a situation where all tasks are blocked
    const taskStatuses = buildTaskStatuses({
      'task-1': 'not-started',
      'task-2': 'not-started',
    });
    const adjacencyList = buildAdjacencyList({
      'task-1': ['task-2'],
      'task-2': ['task-1'],
    });

    const result = getNextReadyTasks(['task-1', 'task-2'], taskStatuses, adjacencyList);

    expect(result).toEqual([]);
  });

  it('returns tasks in the same order as readyNow from computeRecommendedTaskOrder', () => {
    const taskStatuses = buildTaskStatuses({
      'task-a': 'not-started',
      'task-b': 'not-started',
      'task-c': 'not-started',
    });
    const adjacencyList: AdjacencyList = new Map();

    const fullResult = computeRecommendedTaskOrder(
      ['task-a', 'task-b', 'task-c'],
      taskStatuses,
      adjacencyList,
    );
    const nextReady = getNextReadyTasks(
      ['task-a', 'task-b', 'task-c'],
      taskStatuses,
      adjacencyList,
    );

    expect(nextReady).toEqual(fullResult.readyNow);
  });
});

// ===========================================================================
// Pure function guarantees
// ===========================================================================
describe('Pure function guarantees', () => {
  it('computeRecommendedTaskOrder does not mutate input arguments', () => {
    const storyTaskIds = ['task-1', 'task-2'];
    const taskStatuses = buildTaskStatuses({
      'task-1': 'not-started',
      'task-2': 'not-started',
    });
    const adjacencyList = buildAdjacencyList({
      'task-2': ['task-1'],
    });

    // Snapshot inputs before call
    const storyTaskIdsCopy = [...storyTaskIds];
    const taskStatusesSizeBefore = taskStatuses.size;
    const adjacencyListSizeBefore = adjacencyList.size;

    computeRecommendedTaskOrder(storyTaskIds, taskStatuses, adjacencyList);

    // Verify inputs are unchanged
    expect(storyTaskIds).toEqual(storyTaskIdsCopy);
    expect(taskStatuses.size).toBe(taskStatusesSizeBefore);
    expect(adjacencyList.size).toBe(adjacencyListSizeBefore);
  });

  it('calling computeRecommendedTaskOrder twice with same inputs produces identical results', () => {
    const taskStatuses = buildTaskStatuses({
      'task-1': 'complete',
      'task-2': 'not-started',
      'task-3': 'not-started',
    });
    const adjacencyList = buildAdjacencyList({
      'task-2': ['task-1'],
      'task-3': ['task-2'],
    });

    const result1 = computeRecommendedTaskOrder(
      ['task-1', 'task-2', 'task-3'],
      taskStatuses,
      adjacencyList,
    );
    const result2 = computeRecommendedTaskOrder(
      ['task-1', 'task-2', 'task-3'],
      taskStatuses,
      adjacencyList,
    );

    expect(result1).toEqual(result2);
  });
});

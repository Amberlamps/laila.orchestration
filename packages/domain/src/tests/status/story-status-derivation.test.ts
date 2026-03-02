// Unit tests for story status derivation functions.
// Verifies that deriveStoryStatus correctly computes story status
// from child tasks and cross-story dependencies, and that
// findCrossStoryDependencies correctly identifies cross-story deps.

import { describe, it, expect } from 'vitest';

import {
  deriveStoryStatus,
  findCrossStoryDependencies,
} from '../../status/story-status-derivation';

import type { AdjacencyList } from '../../dag/types';
import type { StoryTaskInfo } from '../../status/story-status-derivation';
import type { UserStoryStatus } from '../../status/transition-definitions';

// ---------------------------------------------------------------------------
// Helpers: build test data structures.
// ---------------------------------------------------------------------------
const buildAdjacencyList = (obj: Record<string, string[]>): AdjacencyList => {
  const map = new Map<string, Set<string>>();
  for (const [key, deps] of Object.entries(obj)) {
    map.set(key, new Set(deps));
  }
  return map;
};

const buildAllTasksMap = (tasks: StoryTaskInfo[]): Map<string, StoryTaskInfo> =>
  new Map(tasks.map((t) => [t.id, t]));

// ===========================================================================
// deriveStoryStatus
// ===========================================================================
describe('deriveStoryStatus', () => {
  // -------------------------------------------------------------------------
  // Explicit states (draft, failed) — preserved, not overridden
  // -------------------------------------------------------------------------
  describe('explicit states', () => {
    it('preserves draft status regardless of task states', () => {
      const tasks: StoryTaskInfo[] = [
        { id: 'task-1', status: 'complete', userStoryId: 'story-1' },
        { id: 'task-2', status: 'complete', userStoryId: 'story-1' },
      ];
      const dag = buildAdjacencyList({});
      const allTasks = buildAllTasksMap(tasks);

      const result = deriveStoryStatus('story-1', 'draft', tasks, dag, allTasks);

      expect(result.derivedStatus).toBe('draft');
      expect(result.reason).toBeTruthy();
      expect(result.blockingDependencies).toHaveLength(0);
    });

    it('preserves failed status regardless of task states', () => {
      const tasks: StoryTaskInfo[] = [
        { id: 'task-1', status: 'complete', userStoryId: 'story-1' },
        { id: 'task-2', status: 'complete', userStoryId: 'story-1' },
      ];
      const dag = buildAdjacencyList({});
      const allTasks = buildAllTasksMap(tasks);

      const result = deriveStoryStatus('story-1', 'failed', tasks, dag, allTasks);

      expect(result.derivedStatus).toBe('failed');
      expect(result.reason).toBeTruthy();
      expect(result.blockingDependencies).toHaveLength(0);
    });

    it('preserves draft even when there are blocking cross-story deps', () => {
      const storyTasks: StoryTaskInfo[] = [
        { id: 'task-2', status: 'not-started', userStoryId: 'story-1' },
      ];
      const externalTask: StoryTaskInfo = {
        id: 'task-1',
        status: 'not-started',
        userStoryId: 'story-2',
      };
      const dag = buildAdjacencyList({ 'task-2': ['task-1'] });
      const allTasks = buildAllTasksMap([...storyTasks, externalTask]);

      const result = deriveStoryStatus('story-1', 'draft', storyTasks, dag, allTasks);

      expect(result.derivedStatus).toBe('draft');
    });

    it('preserves failed even when tasks are in progress', () => {
      const tasks: StoryTaskInfo[] = [
        { id: 'task-1', status: 'in-progress', userStoryId: 'story-1' },
      ];
      const dag = buildAdjacencyList({});
      const allTasks = buildAllTasksMap(tasks);

      const result = deriveStoryStatus('story-1', 'failed', tasks, dag, allTasks);

      expect(result.derivedStatus).toBe('failed');
    });
  });

  // -------------------------------------------------------------------------
  // Complete — all tasks complete
  // -------------------------------------------------------------------------
  describe('complete status', () => {
    it('returns complete when all tasks are complete', () => {
      const tasks: StoryTaskInfo[] = [
        { id: 'task-1', status: 'complete', userStoryId: 'story-1' },
        { id: 'task-2', status: 'complete', userStoryId: 'story-1' },
        { id: 'task-3', status: 'complete', userStoryId: 'story-1' },
      ];
      const dag = buildAdjacencyList({
        'task-2': ['task-1'],
        'task-3': ['task-2'],
      });
      const allTasks = buildAllTasksMap(tasks);

      const result = deriveStoryStatus('story-1', 'in-progress', tasks, dag, allTasks);

      expect(result.derivedStatus).toBe('complete');
      expect(result.reason).toContain('complete');
      expect(result.blockingDependencies).toHaveLength(0);
    });

    it('returns complete when the only task is complete', () => {
      const tasks: StoryTaskInfo[] = [{ id: 'task-1', status: 'complete', userStoryId: 'story-1' }];
      const dag = buildAdjacencyList({});
      const allTasks = buildAllTasksMap(tasks);

      const result = deriveStoryStatus('story-1', 'in-progress', tasks, dag, allTasks);

      expect(result.derivedStatus).toBe('complete');
    });

    it('returns complete even if there are cross-story deps (they must be satisfied)', () => {
      // If all tasks are complete, cross-story deps must have been resolved.
      const storyTasks: StoryTaskInfo[] = [
        { id: 'task-2', status: 'complete', userStoryId: 'story-1' },
      ];
      const externalTask: StoryTaskInfo = {
        id: 'task-1',
        status: 'complete',
        userStoryId: 'story-2',
      };
      const dag = buildAdjacencyList({ 'task-2': ['task-1'] });
      const allTasks = buildAllTasksMap([...storyTasks, externalTask]);

      const result = deriveStoryStatus('story-1', 'in-progress', storyTasks, dag, allTasks);

      expect(result.derivedStatus).toBe('complete');
    });
  });

  // -------------------------------------------------------------------------
  // Blocked — incomplete cross-story dependencies
  // -------------------------------------------------------------------------
  describe('blocked status', () => {
    it('returns blocked when a cross-story dependency is incomplete', () => {
      const storyTasks: StoryTaskInfo[] = [
        { id: 'task-2', status: 'not-started', userStoryId: 'story-1' },
      ];
      const externalTask: StoryTaskInfo = {
        id: 'task-1',
        status: 'in-progress',
        userStoryId: 'story-2',
      };
      const dag = buildAdjacencyList({ 'task-2': ['task-1'] });
      const allTasks = buildAllTasksMap([...storyTasks, externalTask]);

      const result = deriveStoryStatus('story-1', 'not-started', storyTasks, dag, allTasks);

      expect(result.derivedStatus).toBe('blocked');
      expect(result.blockingDependencies).toHaveLength(1);
      expect(result.blockingDependencies[0]).toEqual({
        localTaskId: 'task-2',
        externalTaskId: 'task-1',
        externalStoryId: 'story-2',
        isExternalTaskComplete: false,
      });
    });

    it('returns blocked with multiple blocking dependencies', () => {
      const storyTasks: StoryTaskInfo[] = [
        { id: 'task-3', status: 'not-started', userStoryId: 'story-1' },
        { id: 'task-4', status: 'not-started', userStoryId: 'story-1' },
      ];
      const externalTasks: StoryTaskInfo[] = [
        { id: 'task-1', status: 'not-started', userStoryId: 'story-2' },
        { id: 'task-2', status: 'blocked', userStoryId: 'story-3' },
      ];
      const dag = buildAdjacencyList({
        'task-3': ['task-1'],
        'task-4': ['task-2'],
      });
      const allTasks = buildAllTasksMap([...storyTasks, ...externalTasks]);

      const result = deriveStoryStatus('story-1', 'not-started', storyTasks, dag, allTasks);

      expect(result.derivedStatus).toBe('blocked');
      expect(result.blockingDependencies).toHaveLength(2);
      expect(result.reason).toContain('2');
    });

    it('includes blocking dependency details with external task and story IDs', () => {
      const storyTasks: StoryTaskInfo[] = [
        { id: 'task-B', status: 'not-started', userStoryId: 'story-A' },
      ];
      const externalTask: StoryTaskInfo = {
        id: 'task-X',
        status: 'not-started',
        userStoryId: 'story-Z',
      };
      const dag = buildAdjacencyList({ 'task-B': ['task-X'] });
      const allTasks = buildAllTasksMap([...storyTasks, externalTask]);

      const result = deriveStoryStatus('story-A', 'not-started', storyTasks, dag, allTasks);

      expect(result.derivedStatus).toBe('blocked');
      expect(result.blockingDependencies).toHaveLength(1);
      const dep = result.blockingDependencies[0]!;
      expect(dep.localTaskId).toBe('task-B');
      expect(dep.externalTaskId).toBe('task-X');
      expect(dep.externalStoryId).toBe('story-Z');
      expect(dep.isExternalTaskComplete).toBe(false);
    });

    it('is not blocked when cross-story deps are all complete', () => {
      const storyTasks: StoryTaskInfo[] = [
        { id: 'task-2', status: 'not-started', userStoryId: 'story-1' },
      ];
      const externalTask: StoryTaskInfo = {
        id: 'task-1',
        status: 'complete',
        userStoryId: 'story-2',
      };
      const dag = buildAdjacencyList({ 'task-2': ['task-1'] });
      const allTasks = buildAllTasksMap([...storyTasks, externalTask]);

      const result = deriveStoryStatus('story-1', 'not-started', storyTasks, dag, allTasks);

      expect(result.derivedStatus).not.toBe('blocked');
      expect(result.blockingDependencies).toHaveLength(0);
    });

    it("uses singular 'dependency' in reason for single blocking dep", () => {
      const storyTasks: StoryTaskInfo[] = [
        { id: 'task-2', status: 'not-started', userStoryId: 'story-1' },
      ];
      const externalTask: StoryTaskInfo = {
        id: 'task-1',
        status: 'not-started',
        userStoryId: 'story-2',
      };
      const dag = buildAdjacencyList({ 'task-2': ['task-1'] });
      const allTasks = buildAllTasksMap([...storyTasks, externalTask]);

      const result = deriveStoryStatus('story-1', 'not-started', storyTasks, dag, allTasks);

      expect(result.reason).toContain('dependency');
      expect(result.reason).not.toContain('dependencies');
    });
  });

  // -------------------------------------------------------------------------
  // In-progress — at least one task is in-progress, no blocking cross-story deps
  // -------------------------------------------------------------------------
  describe('in-progress status', () => {
    it('returns in-progress when any task is in-progress and no blocking cross-story deps', () => {
      const tasks: StoryTaskInfo[] = [
        { id: 'task-1', status: 'in-progress', userStoryId: 'story-1' },
        { id: 'task-2', status: 'not-started', userStoryId: 'story-1' },
      ];
      const dag = buildAdjacencyList({});
      const allTasks = buildAllTasksMap(tasks);

      const result = deriveStoryStatus('story-1', 'in-progress', tasks, dag, allTasks);

      expect(result.derivedStatus).toBe('in-progress');
      expect(result.reason).toContain('in progress');
      expect(result.blockingDependencies).toHaveLength(0);
    });

    it('returns in-progress with mixed task statuses (some complete, some in-progress)', () => {
      const tasks: StoryTaskInfo[] = [
        { id: 'task-1', status: 'complete', userStoryId: 'story-1' },
        { id: 'task-2', status: 'in-progress', userStoryId: 'story-1' },
        { id: 'task-3', status: 'not-started', userStoryId: 'story-1' },
      ];
      const dag = buildAdjacencyList({});
      const allTasks = buildAllTasksMap(tasks);

      const result = deriveStoryStatus('story-1', 'in-progress', tasks, dag, allTasks);

      expect(result.derivedStatus).toBe('in-progress');
    });

    it('returns blocked over in-progress when cross-story dep is incomplete', () => {
      const storyTasks: StoryTaskInfo[] = [
        { id: 'task-2', status: 'in-progress', userStoryId: 'story-1' },
        { id: 'task-3', status: 'not-started', userStoryId: 'story-1' },
      ];
      const externalTask: StoryTaskInfo = {
        id: 'task-1',
        status: 'not-started',
        userStoryId: 'story-2',
      };
      const dag = buildAdjacencyList({ 'task-3': ['task-1'] });
      const allTasks = buildAllTasksMap([...storyTasks, externalTask]);

      const result = deriveStoryStatus('story-1', 'in-progress', storyTasks, dag, allTasks);

      // Blocked takes priority over in-progress.
      expect(result.derivedStatus).toBe('blocked');
    });
  });

  // -------------------------------------------------------------------------
  // Not-started — all cross-story deps satisfied, no task in-progress
  // -------------------------------------------------------------------------
  describe('not-started status', () => {
    it('returns not-started when all cross-story deps are satisfied and no task is in-progress', () => {
      const tasks: StoryTaskInfo[] = [
        { id: 'task-1', status: 'not-started', userStoryId: 'story-1' },
        { id: 'task-2', status: 'not-started', userStoryId: 'story-1' },
      ];
      const dag = buildAdjacencyList({});
      const allTasks = buildAllTasksMap(tasks);

      const result = deriveStoryStatus('story-1', 'not-started', tasks, dag, allTasks);

      expect(result.derivedStatus).toBe('not-started');
      expect(result.reason).toContain('satisfied');
      expect(result.blockingDependencies).toHaveLength(0);
    });

    it('returns not-started when tasks are blocked but only by intra-story deps', () => {
      const tasks: StoryTaskInfo[] = [
        { id: 'task-1', status: 'not-started', userStoryId: 'story-1' },
        { id: 'task-2', status: 'blocked', userStoryId: 'story-1' },
      ];
      // task-2 depends on task-1 (same story -- not a cross-story dep)
      const dag = buildAdjacencyList({ 'task-2': ['task-1'] });
      const allTasks = buildAllTasksMap(tasks);

      const result = deriveStoryStatus('story-1', 'not-started', tasks, dag, allTasks);

      // No cross-story deps blocking, no task in-progress -> not-started.
      expect(result.derivedStatus).toBe('not-started');
    });

    it('returns not-started with completed cross-story deps and no in-progress tasks', () => {
      const storyTasks: StoryTaskInfo[] = [
        { id: 'task-2', status: 'not-started', userStoryId: 'story-1' },
      ];
      const externalTask: StoryTaskInfo = {
        id: 'task-1',
        status: 'complete',
        userStoryId: 'story-2',
      };
      const dag = buildAdjacencyList({ 'task-2': ['task-1'] });
      const allTasks = buildAllTasksMap([...storyTasks, externalTask]);

      const result = deriveStoryStatus('story-1', 'not-started', storyTasks, dag, allTasks);

      expect(result.derivedStatus).toBe('not-started');
    });
  });

  // -------------------------------------------------------------------------
  // Empty tasks
  // -------------------------------------------------------------------------
  describe('stories with no tasks', () => {
    it('returns current status when story has no tasks', () => {
      const tasks: StoryTaskInfo[] = [];
      const dag = buildAdjacencyList({});
      const allTasks = buildAllTasksMap(tasks);

      const result = deriveStoryStatus('story-1', 'not-started', tasks, dag, allTasks);

      expect(result.derivedStatus).toBe('not-started');
      expect(result.reason).toContain('no tasks');
      expect(result.blockingDependencies).toHaveLength(0);
    });

    it('returns in-progress when story has no tasks and current status is in-progress', () => {
      const tasks: StoryTaskInfo[] = [];
      const dag = buildAdjacencyList({});
      const allTasks = buildAllTasksMap(tasks);

      const result = deriveStoryStatus('story-1', 'in-progress', tasks, dag, allTasks);

      expect(result.derivedStatus).toBe('in-progress');
      expect(result.reason).toContain('no tasks');
    });

    it('still preserves draft for empty stories', () => {
      const tasks: StoryTaskInfo[] = [];
      const dag = buildAdjacencyList({});
      const allTasks = buildAllTasksMap(tasks);

      const result = deriveStoryStatus('story-1', 'draft', tasks, dag, allTasks);

      // Draft is checked before empty-tasks check.
      expect(result.derivedStatus).toBe('draft');
    });

    it('still preserves failed for empty stories', () => {
      const tasks: StoryTaskInfo[] = [];
      const dag = buildAdjacencyList({});
      const allTasks = buildAllTasksMap(tasks);

      const result = deriveStoryStatus('story-1', 'failed', tasks, dag, allTasks);

      expect(result.derivedStatus).toBe('failed');
    });
  });

  // -------------------------------------------------------------------------
  // Derivation priority order
  // -------------------------------------------------------------------------
  describe('derivation priority', () => {
    it('complete takes priority over blocked (all tasks complete even with cross-story deps)', () => {
      // All tasks complete -- even though cross-story dep exists, the task is done.
      const storyTasks: StoryTaskInfo[] = [
        { id: 'task-2', status: 'complete', userStoryId: 'story-1' },
      ];
      const externalTask: StoryTaskInfo = {
        id: 'task-1',
        status: 'not-started', // External dep not complete, but our task is done.
        userStoryId: 'story-2',
      };
      const dag = buildAdjacencyList({ 'task-2': ['task-1'] });
      const allTasks = buildAllTasksMap([...storyTasks, externalTask]);

      const result = deriveStoryStatus('story-1', 'in-progress', storyTasks, dag, allTasks);

      // Complete is checked before blocked.
      expect(result.derivedStatus).toBe('complete');
    });

    it('blocked takes priority over in-progress', () => {
      const storyTasks: StoryTaskInfo[] = [
        { id: 'task-2', status: 'in-progress', userStoryId: 'story-1' },
        { id: 'task-3', status: 'not-started', userStoryId: 'story-1' },
      ];
      const externalTask: StoryTaskInfo = {
        id: 'task-1',
        status: 'in-progress',
        userStoryId: 'story-2',
      };
      const dag = buildAdjacencyList({ 'task-3': ['task-1'] });
      const allTasks = buildAllTasksMap([...storyTasks, externalTask]);

      const result = deriveStoryStatus('story-1', 'in-progress', storyTasks, dag, allTasks);

      expect(result.derivedStatus).toBe('blocked');
    });
  });

  // -------------------------------------------------------------------------
  // Human-readable reasons
  // -------------------------------------------------------------------------
  describe('human-readable reasons', () => {
    it('all derivation results include a non-empty reason string', () => {
      const scenarios: Array<{
        currentStatus: UserStoryStatus;
        tasks: StoryTaskInfo[];
      }> = [
        { currentStatus: 'draft', tasks: [] },
        { currentStatus: 'failed', tasks: [] },
        {
          currentStatus: 'not-started',
          tasks: [],
        },
        {
          currentStatus: 'in-progress',
          tasks: [
            { id: 't1', status: 'complete', userStoryId: 's1' },
            { id: 't2', status: 'complete', userStoryId: 's1' },
          ],
        },
        {
          currentStatus: 'not-started',
          tasks: [{ id: 't1', status: 'not-started', userStoryId: 's1' }],
        },
        {
          currentStatus: 'in-progress',
          tasks: [{ id: 't1', status: 'in-progress', userStoryId: 's1' }],
        },
      ];

      for (const { currentStatus, tasks } of scenarios) {
        const dag = buildAdjacencyList({});
        const allTasks = buildAllTasksMap(tasks);

        const result = deriveStoryStatus('s1', currentStatus, tasks, dag, allTasks);

        expect(result.reason).toBeTruthy();
        expect(typeof result.reason).toBe('string');
        expect(result.reason.length).toBeGreaterThan(0);
      }
    });
  });
});

// -------------------------------------------------------------------------
// Edge cases: single-task stories
// -------------------------------------------------------------------------
describe('single-task stories', () => {
  it('returns not-started for single not-started task', () => {
    const tasks: StoryTaskInfo[] = [
      { id: 'task-1', status: 'not-started', userStoryId: 'story-1' },
    ];
    const dag = buildAdjacencyList({});
    const allTasks = buildAllTasksMap(tasks);

    const result = deriveStoryStatus('story-1', 'not-started', tasks, dag, allTasks);

    expect(result.derivedStatus).toBe('not-started');
  });

  it('returns in-progress for single in-progress task', () => {
    const tasks: StoryTaskInfo[] = [
      { id: 'task-1', status: 'in-progress', userStoryId: 'story-1' },
    ];
    const dag = buildAdjacencyList({});
    const allTasks = buildAllTasksMap(tasks);

    const result = deriveStoryStatus('story-1', 'in-progress', tasks, dag, allTasks);

    expect(result.derivedStatus).toBe('in-progress');
  });

  it('returns blocked for single task with incomplete cross-story dep', () => {
    const storyTasks: StoryTaskInfo[] = [
      { id: 'task-2', status: 'blocked', userStoryId: 'story-1' },
    ];
    const externalTask: StoryTaskInfo = {
      id: 'task-1',
      status: 'in-progress',
      userStoryId: 'story-2',
    };
    const dag = buildAdjacencyList({ 'task-2': ['task-1'] });
    const allTasks = buildAllTasksMap([...storyTasks, externalTask]);

    const result = deriveStoryStatus('story-1', 'not-started', storyTasks, dag, allTasks);

    expect(result.derivedStatus).toBe('blocked');
    expect(result.blockingDependencies).toHaveLength(1);
  });
});

// -------------------------------------------------------------------------
// Edge cases: diamond and long chain patterns
// -------------------------------------------------------------------------
describe('diamond and chain patterns', () => {
  it('handles long intra-story chain where all tasks complete', () => {
    // A -> B -> C -> D (all same story, all complete)
    const tasks: StoryTaskInfo[] = [
      { id: 'A', status: 'complete', userStoryId: 'story-1' },
      { id: 'B', status: 'complete', userStoryId: 'story-1' },
      { id: 'C', status: 'complete', userStoryId: 'story-1' },
      { id: 'D', status: 'complete', userStoryId: 'story-1' },
    ];
    const dag = buildAdjacencyList({
      B: ['A'],
      C: ['B'],
      D: ['C'],
    });
    const allTasks = buildAllTasksMap(tasks);

    const result = deriveStoryStatus('story-1', 'in-progress', tasks, dag, allTasks);

    expect(result.derivedStatus).toBe('complete');
  });

  it('handles long intra-story chain with one task in-progress', () => {
    const tasks: StoryTaskInfo[] = [
      { id: 'A', status: 'complete', userStoryId: 'story-1' },
      { id: 'B', status: 'in-progress', userStoryId: 'story-1' },
      { id: 'C', status: 'blocked', userStoryId: 'story-1' },
      { id: 'D', status: 'blocked', userStoryId: 'story-1' },
    ];
    const dag = buildAdjacencyList({
      B: ['A'],
      C: ['B'],
      D: ['C'],
    });
    const allTasks = buildAllTasksMap(tasks);

    const result = deriveStoryStatus('story-1', 'in-progress', tasks, dag, allTasks);

    expect(result.derivedStatus).toBe('in-progress');
  });

  it('handles diamond pattern with cross-story dependency at base', () => {
    // External task-ext -> task-A (cross-story)
    // task-A -> task-B, task-A -> task-C (intra-story diamond)
    const storyTasks: StoryTaskInfo[] = [
      { id: 'task-A', status: 'blocked', userStoryId: 'story-1' },
      { id: 'task-B', status: 'blocked', userStoryId: 'story-1' },
      { id: 'task-C', status: 'blocked', userStoryId: 'story-1' },
    ];
    const externalTask: StoryTaskInfo = {
      id: 'task-ext',
      status: 'in-progress',
      userStoryId: 'story-2',
    };
    const dag = buildAdjacencyList({
      'task-A': ['task-ext'],
      'task-B': ['task-A'],
      'task-C': ['task-A'],
    });
    const allTasks = buildAllTasksMap([...storyTasks, externalTask]);

    const result = deriveStoryStatus('story-1', 'not-started', storyTasks, dag, allTasks);

    expect(result.derivedStatus).toBe('blocked');
    expect(result.blockingDependencies).toHaveLength(1);
    expect(result.blockingDependencies[0]!.externalTaskId).toBe('task-ext');
  });

  it('handles mixed states with intra-story deps only (not blocked)', () => {
    const tasks: StoryTaskInfo[] = [
      { id: 'A', status: 'complete', userStoryId: 'story-1' },
      { id: 'B', status: 'not-started', userStoryId: 'story-1' },
      { id: 'C', status: 'blocked', userStoryId: 'story-1' },
    ];
    const dag = buildAdjacencyList({
      C: ['B'],
    });
    const allTasks = buildAllTasksMap(tasks);

    const result = deriveStoryStatus('story-1', 'not-started', tasks, dag, allTasks);

    // No cross-story deps, no in-progress tasks -> not-started
    expect(result.derivedStatus).toBe('not-started');
  });
});

// ===========================================================================
// findCrossStoryDependencies
// ===========================================================================
describe('findCrossStoryDependencies', () => {
  it('correctly identifies cross-story task dependencies', () => {
    const storyTasks: StoryTaskInfo[] = [
      { id: 'task-2', status: 'not-started', userStoryId: 'story-1' },
    ];
    const externalTask: StoryTaskInfo = {
      id: 'task-1',
      status: 'in-progress',
      userStoryId: 'story-2',
    };
    const dag = buildAdjacencyList({ 'task-2': ['task-1'] });
    const allTasks = buildAllTasksMap([...storyTasks, externalTask]);

    const result = findCrossStoryDependencies('story-1', storyTasks, dag, allTasks);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      localTaskId: 'task-2',
      externalTaskId: 'task-1',
      externalStoryId: 'story-2',
      isExternalTaskComplete: false,
    });
  });

  it('excludes intra-story dependencies', () => {
    const storyTasks: StoryTaskInfo[] = [
      { id: 'task-1', status: 'complete', userStoryId: 'story-1' },
      { id: 'task-2', status: 'not-started', userStoryId: 'story-1' },
    ];
    // task-2 depends on task-1, but both are in story-1.
    const dag = buildAdjacencyList({ 'task-2': ['task-1'] });
    const allTasks = buildAllTasksMap(storyTasks);

    const result = findCrossStoryDependencies('story-1', storyTasks, dag, allTasks);

    expect(result).toHaveLength(0);
  });

  it('correctly marks external task as complete', () => {
    const storyTasks: StoryTaskInfo[] = [
      { id: 'task-2', status: 'not-started', userStoryId: 'story-1' },
    ];
    const externalTask: StoryTaskInfo = {
      id: 'task-1',
      status: 'complete',
      userStoryId: 'story-2',
    };
    const dag = buildAdjacencyList({ 'task-2': ['task-1'] });
    const allTasks = buildAllTasksMap([...storyTasks, externalTask]);

    const result = findCrossStoryDependencies('story-1', storyTasks, dag, allTasks);

    expect(result).toHaveLength(1);
    expect(result[0]!.isExternalTaskComplete).toBe(true);
  });

  it('returns multiple cross-story deps from different external stories', () => {
    const storyTasks: StoryTaskInfo[] = [
      { id: 'task-3', status: 'not-started', userStoryId: 'story-1' },
    ];
    const externalTasks: StoryTaskInfo[] = [
      { id: 'task-1', status: 'complete', userStoryId: 'story-2' },
      { id: 'task-2', status: 'not-started', userStoryId: 'story-3' },
    ];
    const dag = buildAdjacencyList({ 'task-3': ['task-1', 'task-2'] });
    const allTasks = buildAllTasksMap([...storyTasks, ...externalTasks]);

    const result = findCrossStoryDependencies('story-1', storyTasks, dag, allTasks);

    expect(result).toHaveLength(2);

    const externalStoryIds = result.map((d) => d.externalStoryId).sort();
    expect(externalStoryIds).toEqual(['story-2', 'story-3']);
  });

  it('handles multiple tasks with mixed intra/cross-story deps', () => {
    const storyTasks: StoryTaskInfo[] = [
      { id: 'task-1', status: 'complete', userStoryId: 'story-1' },
      { id: 'task-2', status: 'not-started', userStoryId: 'story-1' },
      { id: 'task-3', status: 'not-started', userStoryId: 'story-1' },
    ];
    const externalTask: StoryTaskInfo = {
      id: 'task-ext',
      status: 'in-progress',
      userStoryId: 'story-2',
    };
    // task-2 depends on task-1 (intra-story) and task-ext (cross-story).
    // task-3 depends on task-1 (intra-story only).
    const dag = buildAdjacencyList({
      'task-2': ['task-1', 'task-ext'],
      'task-3': ['task-1'],
    });
    const allTasks = buildAllTasksMap([...storyTasks, externalTask]);

    const result = findCrossStoryDependencies('story-1', storyTasks, dag, allTasks);

    // Only task-2 -> task-ext is a cross-story dep.
    expect(result).toHaveLength(1);
    expect(result[0]!.localTaskId).toBe('task-2');
    expect(result[0]!.externalTaskId).toBe('task-ext');
  });

  it('returns empty array when story has no tasks', () => {
    const dag = buildAdjacencyList({});
    const allTasks = buildAllTasksMap([]);

    const result = findCrossStoryDependencies('story-1', [], dag, allTasks);

    expect(result).toHaveLength(0);
  });

  it('returns empty array when tasks have no dependencies', () => {
    const storyTasks: StoryTaskInfo[] = [
      { id: 'task-1', status: 'not-started', userStoryId: 'story-1' },
      { id: 'task-2', status: 'not-started', userStoryId: 'story-1' },
    ];
    const dag = buildAdjacencyList({});
    const allTasks = buildAllTasksMap(storyTasks);

    const result = findCrossStoryDependencies('story-1', storyTasks, dag, allTasks);

    expect(result).toHaveLength(0);
  });

  it('skips dependency tasks that do not exist in the allTasks map', () => {
    const storyTasks: StoryTaskInfo[] = [
      { id: 'task-2', status: 'not-started', userStoryId: 'story-1' },
    ];
    // task-2 depends on task-phantom which doesn't exist in allTasks.
    const dag = buildAdjacencyList({ 'task-2': ['task-phantom'] });
    const allTasks = buildAllTasksMap(storyTasks);

    const result = findCrossStoryDependencies('story-1', storyTasks, dag, allTasks);

    expect(result).toHaveLength(0);
  });
});

// ===========================================================================
// Pure function guarantees
// ===========================================================================
describe('pure function guarantees', () => {
  it('deriveStoryStatus does not mutate the adjacency list', () => {
    const dag = buildAdjacencyList({ 'task-2': ['task-1'] });
    const dagSnapshot = new Map(Array.from(dag.entries()).map(([k, v]) => [k, new Set(v)]));
    const tasks: StoryTaskInfo[] = [
      { id: 'task-2', status: 'not-started', userStoryId: 'story-1' },
    ];
    const externalTask: StoryTaskInfo = {
      id: 'task-1',
      status: 'not-started',
      userStoryId: 'story-2',
    };
    const allTasks = buildAllTasksMap([...tasks, externalTask]);

    deriveStoryStatus('story-1', 'not-started', tasks, dag, allTasks);

    for (const [key, value] of dagSnapshot) {
      const current = dag.get(key);
      expect(current).toBeDefined();
      expect(new Set(current)).toEqual(value);
    }
  });

  it('deriveStoryStatus does not mutate the allTasks map', () => {
    const tasks: StoryTaskInfo[] = [
      { id: 'task-1', status: 'in-progress', userStoryId: 'story-1' },
    ];
    const allTasks = buildAllTasksMap(tasks);
    const allTasksSnapshot = new Map(Array.from(allTasks.entries()).map(([k, v]) => [k, { ...v }]));
    const dag = buildAdjacencyList({});

    deriveStoryStatus('story-1', 'in-progress', tasks, dag, allTasks);

    for (const [id, task] of allTasks) {
      expect(task).toEqual(allTasksSnapshot.get(id));
    }
  });

  it('deriveStoryStatus does not mutate the storyTasks array', () => {
    const tasks: StoryTaskInfo[] = [
      { id: 'task-1', status: 'not-started', userStoryId: 'story-1' },
      { id: 'task-2', status: 'in-progress', userStoryId: 'story-1' },
    ];
    const tasksSnapshot = tasks.map((t) => ({ ...t }));
    const dag = buildAdjacencyList({});
    const allTasks = buildAllTasksMap(tasks);

    deriveStoryStatus('story-1', 'in-progress', tasks, dag, allTasks);

    expect(tasks).toEqual(tasksSnapshot);
  });

  it('findCrossStoryDependencies returns a new array on every call', () => {
    const storyTasks: StoryTaskInfo[] = [
      { id: 'task-2', status: 'not-started', userStoryId: 'story-1' },
    ];
    const externalTask: StoryTaskInfo = {
      id: 'task-1',
      status: 'complete',
      userStoryId: 'story-2',
    };
    const dag = buildAdjacencyList({ 'task-2': ['task-1'] });
    const allTasks = buildAllTasksMap([...storyTasks, externalTask]);

    const result1 = findCrossStoryDependencies('story-1', storyTasks, dag, allTasks);
    const result2 = findCrossStoryDependencies('story-1', storyTasks, dag, allTasks);

    expect(result1).not.toBe(result2);
  });
});

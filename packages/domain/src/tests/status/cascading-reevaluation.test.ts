// Unit tests for cascading status re-evaluation.
// Verifies that computeCascadingChanges produces correct status change commands
// when a task completes, and that buildReverseDeps correctly inverts adjacency lists.

import { describe, it, expect } from 'vitest';

import { computeCascadingChanges, buildReverseDeps } from '../../status/cascading-reevaluation';

import type { AdjacencyList } from '../../dag/types';
import type { TaskState, UserStoryState, EpicState } from '../../status/cascading-reevaluation';

// ---------------------------------------------------------------------------
// Helpers: build state maps from arrays for cleaner test setup.
// ---------------------------------------------------------------------------
const taskMap = (tasks: TaskState[]): Map<string, TaskState> =>
  new Map(tasks.map((t) => [t.id, t]));

const storyMap = (stories: UserStoryState[]): Map<string, UserStoryState> =>
  new Map(stories.map((s) => [s.id, s]));

const epicMap = (epics: EpicState[]): Map<string, EpicState> =>
  new Map(epics.map((e) => [e.id, e]));

// ===========================================================================
// buildReverseDeps
// ===========================================================================
describe('buildReverseDeps', () => {
  it('correctly inverts a simple adjacency list', () => {
    // A depends on B: forward A -> {B}
    // Reverse: B -> {A}
    const forward: AdjacencyList = new Map([['A', new Set(['B'])]]);

    const reverse = buildReverseDeps(forward);

    expect(reverse.get('B')).toEqual(new Set(['A']));
    expect(reverse.has('A')).toBe(false);
  });

  it('handles multiple dependents for a single dependency', () => {
    // A depends on C, B depends on C
    // Reverse: C -> {A, B}
    const forward: AdjacencyList = new Map([
      ['A', new Set(['C'])],
      ['B', new Set(['C'])],
    ]);

    const reverse = buildReverseDeps(forward);

    expect(reverse.get('C')).toEqual(new Set(['A', 'B']));
  });

  it('handles a node with multiple dependencies', () => {
    // A depends on B and C
    // Reverse: B -> {A}, C -> {A}
    const forward: AdjacencyList = new Map([['A', new Set(['B', 'C'])]]);

    const reverse = buildReverseDeps(forward);

    expect(reverse.get('B')).toEqual(new Set(['A']));
    expect(reverse.get('C')).toEqual(new Set(['A']));
  });

  it('returns empty map for empty adjacency list', () => {
    const forward: AdjacencyList = new Map();
    const reverse = buildReverseDeps(forward);

    expect(reverse.size).toBe(0);
  });

  it('returns empty map when no edges exist', () => {
    const forward: AdjacencyList = new Map([
      ['A', new Set<string>()],
      ['B', new Set<string>()],
    ]);

    const reverse = buildReverseDeps(forward);

    expect(reverse.size).toBe(0);
  });

  it('handles a diamond dependency graph', () => {
    // D depends on B and C; B depends on A; C depends on A
    const forward: AdjacencyList = new Map([
      ['D', new Set(['B', 'C'])],
      ['B', new Set(['A'])],
      ['C', new Set(['A'])],
    ]);

    const reverse = buildReverseDeps(forward);

    expect(reverse.get('A')).toEqual(new Set(['B', 'C']));
    expect(reverse.get('B')).toEqual(new Set(['D']));
    expect(reverse.get('C')).toEqual(new Set(['D']));
    expect(reverse.has('D')).toBe(false);
  });
});

// ===========================================================================
// computeCascadingChanges
// ===========================================================================
describe('computeCascadingChanges', () => {
  // Shared empty maps for stories/epics when not needed.
  const emptyStories = storyMap([]);
  const emptyEpics = epicMap([]);

  // -------------------------------------------------------------------------
  // Basic unblocking
  // -------------------------------------------------------------------------
  describe('basic unblocking', () => {
    it('produces blocked -> not-started for a dependent whose single dep is complete', () => {
      // task-2 depends on task-1; task-1 just completed.
      const adjacency: AdjacencyList = new Map([['task-2', new Set(['task-1'])]]);
      const reverse = buildReverseDeps(adjacency);

      const tasks = taskMap([
        { id: 'task-1', status: 'complete', userStoryId: 'story-1' },
        { id: 'task-2', status: 'blocked', userStoryId: 'story-1' },
      ]);

      const result = computeCascadingChanges(
        'task-1',
        adjacency,
        reverse,
        tasks,
        emptyStories,
        emptyEpics,
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        entity: 'task',
        id: 'task-2',
        from: 'blocked',
        to: 'not-started',
        reason: `All dependencies of task "task-2" are now complete`,
      });
    });

    it('produces blocked -> not-started for multiple dependents', () => {
      // task-2 and task-3 both depend on task-1
      const adjacency: AdjacencyList = new Map([
        ['task-2', new Set(['task-1'])],
        ['task-3', new Set(['task-1'])],
      ]);
      const reverse = buildReverseDeps(adjacency);

      const tasks = taskMap([
        { id: 'task-1', status: 'complete', userStoryId: 'story-1' },
        { id: 'task-2', status: 'blocked', userStoryId: 'story-1' },
        { id: 'task-3', status: 'blocked', userStoryId: 'story-2' },
      ]);

      const result = computeCascadingChanges(
        'task-1',
        adjacency,
        reverse,
        tasks,
        emptyStories,
        emptyEpics,
      );

      expect(result).toHaveLength(2);

      const taskIds = result.map((cmd) => cmd.id).sort();
      expect(taskIds).toEqual(['task-2', 'task-3']);

      for (const cmd of result) {
        expect(cmd.entity).toBe('task');
        expect(cmd.from).toBe('blocked');
        expect(cmd.to).toBe('not-started');
        expect(cmd.reason).toContain('are now complete');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Multi-dependency scenarios
  // -------------------------------------------------------------------------
  describe('multi-dependency scenarios', () => {
    it('does not unblock a dependent with incomplete dependencies', () => {
      // task-3 depends on task-1 AND task-2; task-1 is complete, task-2 is in-progress.
      const adjacency: AdjacencyList = new Map([['task-3', new Set(['task-1', 'task-2'])]]);
      const reverse = buildReverseDeps(adjacency);

      const tasks = taskMap([
        { id: 'task-1', status: 'complete', userStoryId: 'story-1' },
        { id: 'task-2', status: 'in-progress', userStoryId: 'story-1' },
        { id: 'task-3', status: 'blocked', userStoryId: 'story-1' },
      ]);

      const result = computeCascadingChanges(
        'task-1',
        adjacency,
        reverse,
        tasks,
        emptyStories,
        emptyEpics,
      );

      expect(result).toHaveLength(0);
    });

    it('unblocks when all multiple dependencies are complete', () => {
      // task-3 depends on task-1 AND task-2; both are complete.
      const adjacency: AdjacencyList = new Map([['task-3', new Set(['task-1', 'task-2'])]]);
      const reverse = buildReverseDeps(adjacency);

      const tasks = taskMap([
        { id: 'task-1', status: 'complete', userStoryId: 'story-1' },
        { id: 'task-2', status: 'complete', userStoryId: 'story-1' },
        { id: 'task-3', status: 'blocked', userStoryId: 'story-1' },
      ]);

      const result = computeCascadingChanges(
        'task-1',
        adjacency,
        reverse,
        tasks,
        emptyStories,
        emptyEpics,
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        entity: 'task',
        id: 'task-3',
        from: 'blocked',
        to: 'not-started',
      });
    });
  });

  // -------------------------------------------------------------------------
  // Last remaining dependency completes
  // -------------------------------------------------------------------------
  describe('last remaining dependency completes', () => {
    it('unblocks when the last remaining dep completes (other dep was already complete)', () => {
      // task-3 depends on task-1 AND task-2.
      // task-2 was already complete, now task-1 completes.
      const adjacency: AdjacencyList = new Map([['task-3', new Set(['task-1', 'task-2'])]]);
      const reverse = buildReverseDeps(adjacency);

      const tasks = taskMap([
        { id: 'task-1', status: 'complete', userStoryId: 'story-1' },
        { id: 'task-2', status: 'complete', userStoryId: 'story-1' },
        { id: 'task-3', status: 'blocked', userStoryId: 'story-1' },
      ]);

      const result = computeCascadingChanges(
        'task-1', // task-1 is the one that just completed (last remaining)
        adjacency,
        reverse,
        tasks,
        emptyStories,
        emptyEpics,
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        entity: 'task',
        id: 'task-3',
        from: 'blocked',
        to: 'not-started',
      });
    });
  });

  // -------------------------------------------------------------------------
  // Diamond dependency pattern
  // -------------------------------------------------------------------------
  describe('diamond dependency pattern', () => {
    it('does not unblock D when only A completes (D depends on B and C, which depend on A)', () => {
      // Diamond: A -> B, A -> C, B -> D, C -> D
      // Forward: B depends on A, C depends on A, D depends on B and C
      const adjacency: AdjacencyList = new Map([
        ['B', new Set(['A'])],
        ['C', new Set(['A'])],
        ['D', new Set(['B', 'C'])],
      ]);
      const reverse = buildReverseDeps(adjacency);

      const tasks = taskMap([
        { id: 'A', status: 'complete', userStoryId: 'story-1' },
        { id: 'B', status: 'blocked', userStoryId: 'story-1' },
        { id: 'C', status: 'blocked', userStoryId: 'story-1' },
        { id: 'D', status: 'blocked', userStoryId: 'story-1' },
      ]);

      const result = computeCascadingChanges(
        'A',
        adjacency,
        reverse,
        tasks,
        emptyStories,
        emptyEpics,
      );

      // B and C should be unblocked (their only dep A is complete).
      // D should NOT be unblocked (B and C are not yet complete).
      const unblockedIds = result.map((cmd) => cmd.id).sort();
      expect(unblockedIds).toEqual(['B', 'C']);
      expect(unblockedIds).not.toContain('D');
    });

    it('unblocks D when both B and C are complete (second diamond join completes)', () => {
      // Diamond: B and C depend on A; D depends on B and C
      // B just completed. C was already complete. A was already complete.
      const adjacency: AdjacencyList = new Map([
        ['B', new Set(['A'])],
        ['C', new Set(['A'])],
        ['D', new Set(['B', 'C'])],
      ]);
      const reverse = buildReverseDeps(adjacency);

      const tasks = taskMap([
        { id: 'A', status: 'complete', userStoryId: 'story-1' },
        { id: 'B', status: 'complete', userStoryId: 'story-1' },
        { id: 'C', status: 'complete', userStoryId: 'story-1' },
        { id: 'D', status: 'blocked', userStoryId: 'story-1' },
      ]);

      const result = computeCascadingChanges(
        'B', // B just completed
        adjacency,
        reverse,
        tasks,
        emptyStories,
        emptyEpics,
      );

      // D should now be unblocked since both B and C are complete.
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        entity: 'task',
        id: 'D',
        from: 'blocked',
        to: 'not-started',
      });
    });
  });

  // -------------------------------------------------------------------------
  // Status filtering
  // -------------------------------------------------------------------------
  describe('status filtering', () => {
    it('only considers dependents currently in blocked status', () => {
      // task-2 depends on task-1, but task-2 is already "not-started" (not blocked).
      const adjacency: AdjacencyList = new Map([['task-2', new Set(['task-1'])]]);
      const reverse = buildReverseDeps(adjacency);

      const tasks = taskMap([
        { id: 'task-1', status: 'complete', userStoryId: 'story-1' },
        { id: 'task-2', status: 'not-started', userStoryId: 'story-1' },
      ]);

      const result = computeCascadingChanges(
        'task-1',
        adjacency,
        reverse,
        tasks,
        emptyStories,
        emptyEpics,
      );

      expect(result).toHaveLength(0);
    });

    it('skips dependents in in-progress status', () => {
      const adjacency: AdjacencyList = new Map([['task-2', new Set(['task-1'])]]);
      const reverse = buildReverseDeps(adjacency);

      const tasks = taskMap([
        { id: 'task-1', status: 'complete', userStoryId: 'story-1' },
        { id: 'task-2', status: 'in-progress', userStoryId: 'story-1' },
      ]);

      const result = computeCascadingChanges(
        'task-1',
        adjacency,
        reverse,
        tasks,
        emptyStories,
        emptyEpics,
      );

      expect(result).toHaveLength(0);
    });

    it('skips dependents in complete status', () => {
      const adjacency: AdjacencyList = new Map([['task-2', new Set(['task-1'])]]);
      const reverse = buildReverseDeps(adjacency);

      const tasks = taskMap([
        { id: 'task-1', status: 'complete', userStoryId: 'story-1' },
        { id: 'task-2', status: 'complete', userStoryId: 'story-1' },
      ]);

      const result = computeCascadingChanges(
        'task-1',
        adjacency,
        reverse,
        tasks,
        emptyStories,
        emptyEpics,
      );

      expect(result).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Affected stories
  // -------------------------------------------------------------------------
  describe('affected stories', () => {
    it("includes the completed task's own story in affected stories", () => {
      // task-1 has no dependents, but its story should still be affected.
      const adjacency: AdjacencyList = new Map();
      const reverse: AdjacencyList = new Map();

      const tasks = taskMap([{ id: 'task-1', status: 'complete', userStoryId: 'story-1' }]);

      // The function currently returns only task commands, but the affected
      // story tracking is internal. We verify the function runs without error
      // and produces no spurious commands.
      const result = computeCascadingChanges(
        'task-1',
        adjacency,
        reverse,
        tasks,
        emptyStories,
        emptyEpics,
      );

      // No dependents means no task-level commands.
      expect(result).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Command structure
  // -------------------------------------------------------------------------
  describe('command structure', () => {
    it('all commands include entity, id, from, to, and reason fields', () => {
      const adjacency: AdjacencyList = new Map([['task-2', new Set(['task-1'])]]);
      const reverse = buildReverseDeps(adjacency);

      const tasks = taskMap([
        { id: 'task-1', status: 'complete', userStoryId: 'story-1' },
        { id: 'task-2', status: 'blocked', userStoryId: 'story-1' },
      ]);

      const result = computeCascadingChanges(
        'task-1',
        adjacency,
        reverse,
        tasks,
        emptyStories,
        emptyEpics,
      );

      for (const cmd of result) {
        expect(cmd).toHaveProperty('entity');
        expect(cmd).toHaveProperty('id');
        expect(cmd).toHaveProperty('from');
        expect(cmd).toHaveProperty('to');
        expect(cmd).toHaveProperty('reason');
        expect(typeof cmd.reason).toBe('string');
        expect(cmd.reason.length).toBeGreaterThan(0);
      }
    });

    it('reason is human-readable and mentions the task ID', () => {
      const adjacency: AdjacencyList = new Map([['task-2', new Set(['task-1'])]]);
      const reverse = buildReverseDeps(adjacency);

      const tasks = taskMap([
        { id: 'task-1', status: 'complete', userStoryId: 'story-1' },
        { id: 'task-2', status: 'blocked', userStoryId: 'story-1' },
      ]);

      const result = computeCascadingChanges(
        'task-1',
        adjacency,
        reverse,
        tasks,
        emptyStories,
        emptyEpics,
      );

      expect(result[0].reason).toContain('task-2');
    });
  });

  // -------------------------------------------------------------------------
  // Pure function / no side effects
  // -------------------------------------------------------------------------
  describe('purity', () => {
    it('does not mutate the input tasks map', () => {
      const adjacency: AdjacencyList = new Map([['task-2', new Set(['task-1'])]]);
      const reverse = buildReverseDeps(adjacency);

      const tasks = taskMap([
        { id: 'task-1', status: 'complete', userStoryId: 'story-1' },
        { id: 'task-2', status: 'blocked', userStoryId: 'story-1' },
      ]);

      const tasksBefore = new Map(Array.from(tasks.entries()).map(([k, v]) => [k, { ...v }]));

      computeCascadingChanges('task-1', adjacency, reverse, tasks, emptyStories, emptyEpics);

      // Verify tasks map was not mutated.
      for (const [id, task] of tasks) {
        expect(task).toEqual(tasksBefore.get(id));
      }
    });

    it('does not mutate the adjacency list', () => {
      const adjacency: AdjacencyList = new Map([['task-2', new Set(['task-1'])]]);
      const adjacencyBefore = new Map(
        Array.from(adjacency.entries()).map(([k, v]) => [k, new Set(v)]),
      );
      const reverse = buildReverseDeps(adjacency);

      const tasks = taskMap([
        { id: 'task-1', status: 'complete', userStoryId: 'story-1' },
        { id: 'task-2', status: 'blocked', userStoryId: 'story-1' },
      ]);

      computeCascadingChanges('task-1', adjacency, reverse, tasks, emptyStories, emptyEpics);

      for (const [id, deps] of adjacency) {
        expect(deps).toEqual(adjacencyBefore.get(id));
      }
    });

    it('returns a new array on every call', () => {
      const adjacency: AdjacencyList = new Map();
      const reverse: AdjacencyList = new Map();
      const tasks = taskMap([{ id: 'task-1', status: 'complete', userStoryId: 'story-1' }]);

      const result1 = computeCascadingChanges(
        'task-1',
        adjacency,
        reverse,
        tasks,
        emptyStories,
        emptyEpics,
      );
      const result2 = computeCascadingChanges(
        'task-1',
        adjacency,
        reverse,
        tasks,
        emptyStories,
        emptyEpics,
      );

      expect(result1).not.toBe(result2);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------
  describe('edge cases', () => {
    it('handles a completed task with no dependents', () => {
      const adjacency: AdjacencyList = new Map();
      const reverse: AdjacencyList = new Map();

      const tasks = taskMap([{ id: 'task-1', status: 'complete', userStoryId: 'story-1' }]);

      const result = computeCascadingChanges(
        'task-1',
        adjacency,
        reverse,
        tasks,
        emptyStories,
        emptyEpics,
      );

      expect(result).toHaveLength(0);
    });

    it('handles an empty dependent set gracefully', () => {
      const adjacency: AdjacencyList = new Map();
      const reverse: AdjacencyList = new Map([['task-1', new Set<string>()]]);

      const tasks = taskMap([{ id: 'task-1', status: 'complete', userStoryId: 'story-1' }]);

      const result = computeCascadingChanges(
        'task-1',
        adjacency,
        reverse,
        tasks,
        emptyStories,
        emptyEpics,
      );

      expect(result).toHaveLength(0);
    });

    it('handles a dependent task that does not exist in the tasks map', () => {
      const adjacency: AdjacencyList = new Map([['task-2', new Set(['task-1'])]]);
      const reverse = buildReverseDeps(adjacency);

      // task-2 is referenced in reverse deps but not in the tasks map.
      const tasks = taskMap([{ id: 'task-1', status: 'complete', userStoryId: 'story-1' }]);

      const result = computeCascadingChanges(
        'task-1',
        adjacency,
        reverse,
        tasks,
        emptyStories,
        emptyEpics,
      );

      expect(result).toHaveLength(0);
    });

    it('handles a completed task that does not exist in the tasks map', () => {
      const adjacency: AdjacencyList = new Map();
      const reverse: AdjacencyList = new Map();
      const tasks = taskMap([]);

      const result = computeCascadingChanges(
        'nonexistent',
        adjacency,
        reverse,
        tasks,
        emptyStories,
        emptyEpics,
      );

      expect(result).toHaveLength(0);
    });

    it('handles a dependency that does not exist in the tasks map', () => {
      // task-2 depends on task-1 and task-phantom; task-phantom doesn't exist.
      const adjacency: AdjacencyList = new Map([['task-2', new Set(['task-1', 'task-phantom'])]]);
      const reverse = buildReverseDeps(adjacency);

      const tasks = taskMap([
        { id: 'task-1', status: 'complete', userStoryId: 'story-1' },
        { id: 'task-2', status: 'blocked', userStoryId: 'story-1' },
      ]);

      const result = computeCascadingChanges(
        'task-1',
        adjacency,
        reverse,
        tasks,
        emptyStories,
        emptyEpics,
      );

      // task-phantom doesn't exist, so its status is not "complete", so task-2 stays blocked.
      expect(result).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Single-pass computation
  // -------------------------------------------------------------------------
  describe('single-pass computation', () => {
    it('does not cascade transitively at the task level', () => {
      // task-2 depends on task-1; task-3 depends on task-2.
      // Completing task-1 unblocks task-2 (blocked -> not-started),
      // but task-3 should NOT be unblocked because task-2 is not complete yet.
      const adjacency: AdjacencyList = new Map([
        ['task-2', new Set(['task-1'])],
        ['task-3', new Set(['task-2'])],
      ]);
      const reverse = buildReverseDeps(adjacency);

      const tasks = taskMap([
        { id: 'task-1', status: 'complete', userStoryId: 'story-1' },
        { id: 'task-2', status: 'blocked', userStoryId: 'story-1' },
        { id: 'task-3', status: 'blocked', userStoryId: 'story-1' },
      ]);

      const result = computeCascadingChanges(
        'task-1',
        adjacency,
        reverse,
        tasks,
        emptyStories,
        emptyEpics,
      );

      // Only task-2 should be unblocked, not task-3.
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('task-2');
    });
  });

  // -------------------------------------------------------------------------
  // Cross-story scenarios
  // -------------------------------------------------------------------------
  describe('cross-story scenarios', () => {
    it('produces commands for dependents across different stories', () => {
      // task-2 (story-2) depends on task-1 (story-1)
      const adjacency: AdjacencyList = new Map([['task-2', new Set(['task-1'])]]);
      const reverse = buildReverseDeps(adjacency);

      const tasks = taskMap([
        { id: 'task-1', status: 'complete', userStoryId: 'story-1' },
        { id: 'task-2', status: 'blocked', userStoryId: 'story-2' },
      ]);

      const result = computeCascadingChanges(
        'task-1',
        adjacency,
        reverse,
        tasks,
        emptyStories,
        emptyEpics,
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        entity: 'task',
        id: 'task-2',
        from: 'blocked',
        to: 'not-started',
      });
    });
  });
});

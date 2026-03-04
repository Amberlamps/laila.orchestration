// End-to-end integration scenarios that test the full assignment pipeline.
// Each scenario builds complete project state and runs the pipeline:
// eligibility -> selection -> task order -> conflict handling.
// These serve as documentation of expected system behavior.

import { describe, it, expect } from 'vitest';

import { evaluateEligibility, getEligibleStoryIds } from '../../assignment/eligibility-rules';
import {
  checkVersionConflict,
  nextVersion,
  buildConflictResponse,
} from '../../assignment/optimistic-locking';
import { selectStoryForAssignment, rankEligibleStories } from '../../assignment/priority-selection';
import {
  computeRecommendedTaskOrder,
  getNextReadyTasks,
} from '../../assignment/recommended-task-order';
import { buildAdjacencyList } from '../../dag/cycle-detection';

import type {
  ProjectInfo,
  EpicInfo,
  StoryEligibilityInfo,
} from '../../assignment/eligibility-rules';
import type { StorySelectionInfo } from '../../assignment/priority-selection';
import type { TaskOrderInfo } from '../../assignment/recommended-task-order';
import type { DagEdge } from '../../dag/types';
import type { TaskStatus } from '../../status/transition-definitions';

// ---------------------------------------------------------------------------
// Typed helper factories for building complete project state.
// ---------------------------------------------------------------------------

const createProject = (overrides: Partial<ProjectInfo> = {}): ProjectInfo => ({
  id: 'project-1',
  status: 'ready',
  ...overrides,
});

const createEpic = (overrides: Partial<EpicInfo> & { id: string }): EpicInfo => ({
  status: 'not-started',
  ...overrides,
});

const createStoryEligibility = (
  overrides: Partial<StoryEligibilityInfo> & { id: string; epicId: string },
): StoryEligibilityInfo => ({
  status: 'not-started',
  crossStoryDepsSatisfied: true,
  ...overrides,
});

const createStorySelection = (
  overrides: Partial<StorySelectionInfo> & { id: string },
): StorySelectionInfo => ({
  priority: 'medium',
  createdAt: new Date('2025-01-01T00:00:00Z'),
  ...overrides,
});

const buildTaskStatuses = (entries: Record<string, TaskStatus>): Map<string, TaskOrderInfo> => {
  const map = new Map<string, TaskOrderInfo>();
  for (const [id, status] of Object.entries(entries)) {
    map.set(id, { id, status });
  }
  return map;
};

// ===========================================================================
// Assignment Pipeline Integration
// ===========================================================================
describe('Assignment Pipeline Integration', () => {
  it('scenario: single eligible story is selected and task order computed', () => {
    // --- Setup ---
    const project = createProject({ status: 'ready' });
    const epics = new Map<string, EpicInfo>([
      ['epic-1', createEpic({ id: 'epic-1', status: 'in-progress' })],
    ]);

    const eligibilityStories: StoryEligibilityInfo[] = [
      createStoryEligibility({
        id: 'story-1',
        epicId: 'epic-1',
        status: 'not-started',
      }),
      createStoryEligibility({
        id: 'story-2',
        epicId: 'epic-1',
        status: 'in-progress', // not eligible
      }),
    ];

    const selectionStories = new Map<string, StorySelectionInfo>([
      ['story-1', createStorySelection({ id: 'story-1', priority: 'high' })],
      ['story-2', createStorySelection({ id: 'story-2', priority: 'medium' })],
    ]);

    const storyTopoOrder = ['story-1', 'story-2'];

    // Tasks for story-1: task-a -> task-b -> task-c (linear chain)
    const taskEdges: DagEdge[] = [
      { from: 'task-b', to: 'task-a' },
      { from: 'task-c', to: 'task-b' },
    ];
    const adjacencyList = buildAdjacencyList(taskEdges);
    const taskStatuses = buildTaskStatuses({
      'task-a': 'not-started',
      'task-b': 'not-started',
      'task-c': 'not-started',
    });

    // --- Step 1: Evaluate eligibility ---
    const eligibilityResults = evaluateEligibility(eligibilityStories, epics, project);
    expect(eligibilityResults[0]!.eligible).toBe(true);
    expect(eligibilityResults[1]!.eligible).toBe(false);

    const eligibleIds = getEligibleStoryIds(eligibilityStories, epics, project);
    expect(eligibleIds).toEqual(['story-1']);

    // --- Step 2: Select story ---
    const selection = selectStoryForAssignment(eligibleIds, selectionStories, storyTopoOrder);
    expect(selection.selected).toBe(true);
    if (selection.selected) {
      expect(selection.storyId).toBe('story-1');
    }

    // --- Step 3: Compute task order ---
    const taskOrder = computeRecommendedTaskOrder(
      ['task-a', 'task-b', 'task-c'],
      taskStatuses,
      adjacencyList,
    );

    // task-a should come first (no deps), then task-b, then task-c
    expect(taskOrder.orderedTasks.indexOf('task-a')).toBeLessThan(
      taskOrder.orderedTasks.indexOf('task-b'),
    );
    expect(taskOrder.orderedTasks.indexOf('task-b')).toBeLessThan(
      taskOrder.orderedTasks.indexOf('task-c'),
    );

    // --- Step 4: Verify readyNow ---
    expect(taskOrder.readyNow).toEqual(['task-a']);
    expect(taskOrder.blocked).toContain('task-b');
    expect(taskOrder.blocked).toContain('task-c');
  });

  it('scenario: multiple eligible stories, highest priority selected', () => {
    // --- Setup ---
    const project = createProject({ status: 'in-progress' });
    const epics = new Map<string, EpicInfo>([
      ['epic-1', createEpic({ id: 'epic-1', status: 'in-progress' })],
    ]);

    const eligibilityStories: StoryEligibilityInfo[] = [
      createStoryEligibility({ id: 'story-low', epicId: 'epic-1' }),
      createStoryEligibility({ id: 'story-high', epicId: 'epic-1' }),
      createStoryEligibility({ id: 'story-med', epicId: 'epic-1' }),
    ];

    const selectionStories = new Map<string, StorySelectionInfo>([
      ['story-low', createStorySelection({ id: 'story-low', priority: 'low' })],
      ['story-high', createStorySelection({ id: 'story-high', priority: 'high' })],
      ['story-med', createStorySelection({ id: 'story-med', priority: 'medium' })],
    ]);

    const storyTopoOrder = ['story-low', 'story-high', 'story-med'];

    // --- Step 1: Evaluate eligibility ---
    const eligibleIds = getEligibleStoryIds(eligibilityStories, epics, project);
    expect(eligibleIds).toHaveLength(3);

    // --- Step 2: Select story ---
    const selection = selectStoryForAssignment(eligibleIds, selectionStories, storyTopoOrder);
    expect(selection.selected).toBe(true);
    if (selection.selected) {
      expect(selection.storyId).toBe('story-high');
    }

    // --- Verify ranking ---
    const ranked = rankEligibleStories(eligibleIds, selectionStories, storyTopoOrder);
    expect(ranked[0]).toBe('story-high');
    expect(ranked[1]).toBe('story-med');
    expect(ranked[2]).toBe('story-low');
  });

  it('scenario: no eligible stories -- all blocked', () => {
    const project = createProject({ status: 'ready' });
    const epics = new Map<string, EpicInfo>([
      ['epic-1', createEpic({ id: 'epic-1', status: 'in-progress' })],
    ]);

    const stories: StoryEligibilityInfo[] = [
      createStoryEligibility({
        id: 'story-1',
        epicId: 'epic-1',
        crossStoryDepsSatisfied: false,
      }),
      createStoryEligibility({
        id: 'story-2',
        epicId: 'epic-1',
        crossStoryDepsSatisfied: false,
      }),
      createStoryEligibility({
        id: 'story-3',
        epicId: 'epic-1',
        crossStoryDepsSatisfied: false,
      }),
    ];

    // --- Step 1: Evaluate eligibility ---
    const eligibleIds = getEligibleStoryIds(stories, epics, project);
    expect(eligibleIds).toHaveLength(0);

    // --- Step 2: Select story ---
    const selection = selectStoryForAssignment(eligibleIds, new Map(), []);
    expect(selection.selected).toBe(false);
    expect(selection.reason).toContain('No eligible');
  });

  it('scenario: all stories complete', () => {
    const project = createProject({ status: 'in-progress' });
    const epics = new Map<string, EpicInfo>([
      ['epic-1', createEpic({ id: 'epic-1', status: 'in-progress' })],
    ]);

    const stories: StoryEligibilityInfo[] = [
      createStoryEligibility({ id: 'story-1', epicId: 'epic-1', status: 'complete' }),
      createStoryEligibility({ id: 'story-2', epicId: 'epic-1', status: 'complete' }),
      createStoryEligibility({ id: 'story-3', epicId: 'epic-1', status: 'complete' }),
    ];

    // --- Step 1: Evaluate eligibility ---
    const eligibilityResults = evaluateEligibility(stories, epics, project);
    expect(eligibilityResults.every((r) => !r.eligible)).toBe(true);

    const eligibleIds = getEligibleStoryIds(stories, epics, project);
    expect(eligibleIds).toHaveLength(0);
  });

  it('scenario: concurrency conflict during assignment', () => {
    // Simulate two agents reading the same story at version 1.

    // --- Agent A reads story at version 1 ---
    const agentAExpectedVersion = 1;

    // --- Agent B reads story at version 1 ---
    const agentBExpectedVersion = 1;

    // --- Agent A assigns story (version 1 -> 2) ---
    const conflictCheckA = checkVersionConflict(agentAExpectedVersion, 1); // actual DB version is 1
    expect(conflictCheckA.conflict).toBe(false);

    // Agent A's update succeeds, version is now 2
    const newVersion = nextVersion(1);
    expect(newVersion).toBe(2);

    // --- Agent B tries to assign (version 1 vs actual 2) ---
    const conflictCheckB = checkVersionConflict(agentBExpectedVersion, newVersion);
    expect(conflictCheckB.conflict).toBe(true);

    if (conflictCheckB.conflict) {
      expect(conflictCheckB.expectedVersion).toBe(1);
      expect(conflictCheckB.actualVersion).toBe(2);

      // --- Retry guidance ---
      expect(conflictCheckB.retryGuidance.shouldRetry).toBe(true);
      expect(conflictCheckB.retryGuidance.strategy).toBe('refetch-and-retry');

      // --- Build conflict response ---
      const response = buildConflictResponse('user-story', 'story-1', conflictCheckB);
      expect(response.error.code).toBe('VERSION_CONFLICT');
      expect(response.error.details.expectedVersion).toBe(1);
      expect(response.error.details.actualVersion).toBe(2);
      expect(response.error.details.retryGuidance.shouldRetry).toBe(true);
    }
  });

  it('scenario: full pipeline with task completion progression', () => {
    // Start: story eligible, tasks in chain, complete tasks one by one.
    const project = createProject({ status: 'in-progress' });
    const epics = new Map<string, EpicInfo>([
      ['epic-1', createEpic({ id: 'epic-1', status: 'in-progress' })],
    ]);
    const eligibilityStories = [createStoryEligibility({ id: 'story-1', epicId: 'epic-1' })];
    const selectionStories = new Map<string, StorySelectionInfo>([
      ['story-1', createStorySelection({ id: 'story-1', priority: 'high' })],
    ]);

    // Task chain: task-1 -> task-2 -> task-3
    const taskEdges: DagEdge[] = [
      { from: 'task-2', to: 'task-1' },
      { from: 'task-3', to: 'task-2' },
    ];
    const adjacencyList = buildAdjacencyList(taskEdges);
    const storyTaskIds = ['task-1', 'task-2', 'task-3'];

    // --- Eligibility + Selection ---
    const eligibleIds = getEligibleStoryIds(eligibilityStories, epics, project);
    expect(eligibleIds).toEqual(['story-1']);

    const selection = selectStoryForAssignment(eligibleIds, selectionStories, ['story-1']);
    expect(selection.selected).toBe(true);

    // --- Phase 1: All tasks not-started ---
    const statuses1 = buildTaskStatuses({
      'task-1': 'not-started',
      'task-2': 'not-started',
      'task-3': 'not-started',
    });
    const order1 = computeRecommendedTaskOrder(storyTaskIds, statuses1, adjacencyList);
    expect(order1.readyNow).toEqual(['task-1']);
    expect(order1.blocked).toContain('task-2');
    expect(order1.blocked).toContain('task-3');

    // --- Phase 2: task-1 complete ---
    const statuses2 = buildTaskStatuses({
      'task-1': 'complete',
      'task-2': 'not-started',
      'task-3': 'not-started',
    });
    const order2 = computeRecommendedTaskOrder(storyTaskIds, statuses2, adjacencyList);
    expect(order2.readyNow).toEqual(['task-2']);
    expect(order2.completed).toEqual(['task-1']);
    expect(order2.blocked).toEqual(['task-3']);

    // --- Phase 3: task-1 and task-2 complete ---
    const statuses3 = buildTaskStatuses({
      'task-1': 'complete',
      'task-2': 'complete',
      'task-3': 'not-started',
    });
    const order3 = computeRecommendedTaskOrder(storyTaskIds, statuses3, adjacencyList);
    expect(order3.readyNow).toEqual(['task-3']);
    expect(order3.completed).toContain('task-1');
    expect(order3.completed).toContain('task-2');

    // --- Phase 4: All complete ---
    const statuses4 = buildTaskStatuses({
      'task-1': 'complete',
      'task-2': 'complete',
      'task-3': 'complete',
    });
    const order4 = computeRecommendedTaskOrder(storyTaskIds, statuses4, adjacencyList);
    expect(order4.readyNow).toEqual([]);
    expect(order4.completed).toHaveLength(3);
  });

  it('scenario: parallel tasks become ready simultaneously', () => {
    const project = createProject({ status: 'ready' });
    const epics = new Map<string, EpicInfo>([
      ['epic-1', createEpic({ id: 'epic-1', status: 'not-started' })],
    ]);

    const eligibilityStories = [createStoryEligibility({ id: 'story-1', epicId: 'epic-1' })];

    const eligibleIds = getEligibleStoryIds(eligibilityStories, epics, project);
    expect(eligibleIds).toEqual(['story-1']);

    // Three independent tasks (no deps between them)
    const taskStatuses = buildTaskStatuses({
      'task-a': 'not-started',
      'task-b': 'not-started',
      'task-c': 'not-started',
    });

    const order = computeRecommendedTaskOrder(
      ['task-a', 'task-b', 'task-c'],
      taskStatuses,
      new Map(),
    );

    // All tasks should be ready simultaneously
    expect(order.readyNow).toContain('task-a');
    expect(order.readyNow).toContain('task-b');
    expect(order.readyNow).toContain('task-c');
    expect(order.blocked).toEqual([]);
  });

  it('scenario: diamond dependency pattern', () => {
    // task-a is the root
    // task-b and task-c depend on task-a
    // task-d depends on both task-b and task-c
    const taskEdges: DagEdge[] = [
      { from: 'task-b', to: 'task-a' },
      { from: 'task-c', to: 'task-a' },
      { from: 'task-d', to: 'task-b' },
      { from: 'task-d', to: 'task-c' },
    ];
    const adjacencyList = buildAdjacencyList(taskEdges);
    const storyTaskIds = ['task-a', 'task-b', 'task-c', 'task-d'];

    // Phase 1: only task-a is ready
    const statuses1 = buildTaskStatuses({
      'task-a': 'not-started',
      'task-b': 'not-started',
      'task-c': 'not-started',
      'task-d': 'not-started',
    });
    const order1 = computeRecommendedTaskOrder(storyTaskIds, statuses1, adjacencyList);
    expect(order1.readyNow).toEqual(['task-a']);

    // Phase 2: task-a complete, task-b and task-c become ready
    const statuses2 = buildTaskStatuses({
      'task-a': 'complete',
      'task-b': 'not-started',
      'task-c': 'not-started',
      'task-d': 'not-started',
    });
    const order2 = computeRecommendedTaskOrder(storyTaskIds, statuses2, adjacencyList);
    expect(order2.readyNow).toContain('task-b');
    expect(order2.readyNow).toContain('task-c');
    expect(order2.blocked).toEqual(['task-d']);

    // Phase 3: task-a and task-b complete, task-d still blocked (needs task-c)
    const statuses3 = buildTaskStatuses({
      'task-a': 'complete',
      'task-b': 'complete',
      'task-c': 'not-started',
      'task-d': 'not-started',
    });
    const order3 = computeRecommendedTaskOrder(storyTaskIds, statuses3, adjacencyList);
    expect(order3.readyNow).toEqual(['task-c']);
    expect(order3.blocked).toEqual(['task-d']);

    // Phase 4: all predecessors complete, task-d becomes ready
    const statuses4 = buildTaskStatuses({
      'task-a': 'complete',
      'task-b': 'complete',
      'task-c': 'complete',
      'task-d': 'not-started',
    });
    const order4 = computeRecommendedTaskOrder(storyTaskIds, statuses4, adjacencyList);
    expect(order4.readyNow).toEqual(['task-d']);
  });

  it('scenario: multiple conflicts with escalating retry guidance', () => {
    // Agent reads at version 1.
    // Multiple updates happen in between (version goes 1 -> 2 -> 3 -> 4 -> 5).

    // Small gap (1 -> 2)
    const conflict1 = checkVersionConflict(1, 2);
    expect(conflict1.conflict).toBe(true);
    if (conflict1.conflict) {
      expect(conflict1.retryGuidance.shouldRetry).toBe(true);
      expect(conflict1.retryGuidance.strategy).toBe('refetch-and-retry');
    }

    // Larger gap (1 -> 5)
    const conflict2 = checkVersionConflict(1, 5);
    expect(conflict2.conflict).toBe(true);
    if (conflict2.conflict) {
      expect(conflict2.retryGuidance.shouldRetry).toBe(true);
      expect(conflict2.retryGuidance.explanation).toContain('out of date');
    }
  });

  it('scenario: eligibility changes as project progresses', () => {
    const epics = new Map<string, EpicInfo>([
      ['epic-1', createEpic({ id: 'epic-1', status: 'in-progress' })],
    ]);

    const stories: StoryEligibilityInfo[] = [
      createStoryEligibility({ id: 'story-1', epicId: 'epic-1' }),
      createStoryEligibility({ id: 'story-2', epicId: 'epic-1' }),
    ];

    // Phase 1: Project is ready -- stories are eligible
    const readyProject = createProject({ status: 'ready' });
    const eligibleInReady = getEligibleStoryIds(stories, epics, readyProject);
    expect(eligibleInReady).toHaveLength(2);

    // Phase 2: Project moves to in-progress -- stories still eligible
    const inProgressProject = createProject({ status: 'in-progress' });
    const eligibleInProgress = getEligibleStoryIds(stories, epics, inProgressProject);
    expect(eligibleInProgress).toHaveLength(2);

    // Phase 3: Project moves to complete -- no stories eligible
    const completeProject = createProject({ status: 'complete' });
    const eligibleInComplete = getEligibleStoryIds(stories, epics, completeProject);
    expect(eligibleInComplete).toHaveLength(0);
  });

  it('scenario: getNextReadyTasks convenience matches full pipeline', () => {
    const taskEdges: DagEdge[] = [{ from: 'task-b', to: 'task-a' }];
    const adjacencyList = buildAdjacencyList(taskEdges);
    const storyTaskIds = ['task-a', 'task-b'];
    const taskStatuses = buildTaskStatuses({
      'task-a': 'complete',
      'task-b': 'not-started',
    });

    const fullOrder = computeRecommendedTaskOrder(storyTaskIds, taskStatuses, adjacencyList);
    const nextReady = getNextReadyTasks(storyTaskIds, taskStatuses, adjacencyList);

    expect(nextReady).toEqual(fullOrder.readyNow);
    expect(nextReady).toEqual(['task-b']);
  });
});

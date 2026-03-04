/**
 * Unit tests for the DAG reconciler consistency rules.
 *
 * These tests exercise the five pure consistency-rule functions exported
 * from `rules.ts`. Because the rules are pure functions that accept a
 * `ProjectDAG` and return `CorrectionDetail[]`, they require no mocks --
 * only carefully constructed DAG fixtures.
 */

import { describe, it, expect } from 'vitest';

import {
  checkBlockedTasksWithCompleteDeps,
  checkPendingTasksWithIncompleteDeps,
  checkOrphanedInProgressStories,
  checkStoryTaskAggregation,
  checkEpicStoryAggregation,
  runAllRules,
} from '../rules';

import type {
  ProjectDAG,
  ProjectRecord,
  EpicNode,
  StoryNode,
  TaskNode,
  DependencyEdge,
} from '../types';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const defaultProject: ProjectRecord = {
  id: 'project-001',
  tenantId: 'tenant-001',
  name: 'Test Project',
  lifecycleStatus: 'active',
  workStatus: 'in_progress',
};

const makeEpic = (overrides: Partial<EpicNode> = {}): EpicNode => ({
  id: 'epic-001',
  tenantId: 'tenant-001',
  projectId: 'project-001',
  name: 'Test Epic',
  workStatus: 'in_progress',
  ...overrides,
});

const makeStory = (overrides: Partial<StoryNode> = {}): StoryNode => ({
  id: 'story-001',
  tenantId: 'tenant-001',
  epicId: 'epic-001',
  title: 'Test Story',
  workStatus: 'pending',
  assignedWorkerId: null,
  ...overrides,
});

const makeTask = (overrides: Partial<TaskNode> = {}): TaskNode => ({
  id: 'task-001',
  tenantId: 'tenant-001',
  userStoryId: 'story-001',
  title: 'Test Task',
  workStatus: 'pending',
  ...overrides,
});

const makeEdge = (dependentTaskId: string, prerequisiteTaskId: string): DependencyEdge => ({
  dependentTaskId,
  prerequisiteTaskId,
});

const makeDAG = (overrides: Partial<ProjectDAG> = {}): ProjectDAG => ({
  project: defaultProject,
  epics: [],
  stories: [],
  tasks: [],
  edges: [],
  ...overrides,
});

// ===========================================================================
// Rule 1: Blocked tasks with all dependencies done -> 'pending'
// ===========================================================================

describe('Rule 1: checkBlockedTasksWithCompleteDeps', () => {
  it('should correct a blocked task to pending when all deps are done', () => {
    const taskA = makeTask({ id: 'task-a', workStatus: 'done', title: 'Task A' });
    const taskB = makeTask({
      id: 'task-b',
      workStatus: 'blocked',
      title: 'Task B',
    });
    const edge = makeEdge('task-b', 'task-a');

    const dag = makeDAG({
      tasks: [taskA, taskB],
      edges: [edge],
    });

    const corrections = checkBlockedTasksWithCompleteDeps(dag);

    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      entityType: 'task',
      entityId: 'task-b',
      previousStatus: 'blocked',
      correctedStatus: 'pending',
      rule: 'rule-1',
    });
  });

  it('should NOT correct a blocked task when some deps are incomplete', () => {
    const taskA = makeTask({ id: 'task-a', workStatus: 'done', title: 'Task A' });
    const taskB = makeTask({
      id: 'task-b',
      workStatus: 'in_progress',
      title: 'Task B',
    });
    const taskC = makeTask({
      id: 'task-c',
      workStatus: 'blocked',
      title: 'Task C',
    });
    const edges = [makeEdge('task-c', 'task-a'), makeEdge('task-c', 'task-b')];

    const dag = makeDAG({
      tasks: [taskA, taskB, taskC],
      edges,
    });

    const corrections = checkBlockedTasksWithCompleteDeps(dag);

    expect(corrections).toHaveLength(0);
  });

  it('should correct a blocked task with NO deps to pending', () => {
    const task = makeTask({
      id: 'task-orphan',
      workStatus: 'blocked',
      title: 'Orphan Blocked Task',
    });

    const dag = makeDAG({ tasks: [task], edges: [] });

    const corrections = checkBlockedTasksWithCompleteDeps(dag);

    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      entityId: 'task-orphan',
      previousStatus: 'blocked',
      correctedStatus: 'pending',
      reason: 'Task is blocked but has no dependencies',
    });
  });

  it('should handle deeply nested chain: A->B->C->D where D is blocked and C is done', () => {
    const taskA = makeTask({ id: 'task-a', workStatus: 'done', title: 'A' });
    const taskB = makeTask({ id: 'task-b', workStatus: 'done', title: 'B' });
    const taskC = makeTask({ id: 'task-c', workStatus: 'done', title: 'C' });
    const taskD = makeTask({ id: 'task-d', workStatus: 'blocked', title: 'D' });

    // D depends on C, C depends on B, B depends on A
    const edges = [
      makeEdge('task-d', 'task-c'),
      makeEdge('task-c', 'task-b'),
      makeEdge('task-b', 'task-a'),
    ];

    const dag = makeDAG({
      tasks: [taskA, taskB, taskC, taskD],
      edges,
    });

    const corrections = checkBlockedTasksWithCompleteDeps(dag);

    // Only D is blocked, and its direct prerequisite (C) is done -> corrected
    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      entityId: 'task-d',
      correctedStatus: 'pending',
    });
  });

  it('should not touch tasks that are not blocked', () => {
    const taskA = makeTask({ id: 'task-a', workStatus: 'done', title: 'A' });
    const taskB = makeTask({ id: 'task-b', workStatus: 'pending', title: 'B' });
    const edge = makeEdge('task-b', 'task-a');

    const dag = makeDAG({
      tasks: [taskA, taskB],
      edges: [edge],
    });

    const corrections = checkBlockedTasksWithCompleteDeps(dag);
    expect(corrections).toHaveLength(0);
  });

  it('should handle multiple blocked tasks independently', () => {
    const taskPrereq = makeTask({ id: 'task-prereq', workStatus: 'done', title: 'Prereq' });
    const taskB1 = makeTask({ id: 'task-b1', workStatus: 'blocked', title: 'B1' });
    const taskB2 = makeTask({ id: 'task-b2', workStatus: 'blocked', title: 'B2' });

    const edges = [makeEdge('task-b1', 'task-prereq'), makeEdge('task-b2', 'task-prereq')];

    const dag = makeDAG({
      tasks: [taskPrereq, taskB1, taskB2],
      edges,
    });

    const corrections = checkBlockedTasksWithCompleteDeps(dag);
    expect(corrections).toHaveLength(2);
    const correctedIds = corrections.map((c) => c.entityId);
    expect(correctedIds).toContain('task-b1');
    expect(correctedIds).toContain('task-b2');
  });
});

// ===========================================================================
// Rule 2: Pending tasks with incomplete dependencies -> 'blocked'
// ===========================================================================

describe('Rule 2: checkPendingTasksWithIncompleteDeps', () => {
  it('should correct a pending task to blocked when deps are incomplete', () => {
    const taskA = makeTask({ id: 'task-a', workStatus: 'pending', title: 'A' });
    const taskB = makeTask({ id: 'task-b', workStatus: 'pending', title: 'B' });
    const edge = makeEdge('task-b', 'task-a');

    const dag = makeDAG({
      tasks: [taskA, taskB],
      edges: [edge],
    });

    const corrections = checkPendingTasksWithIncompleteDeps(dag);

    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      entityType: 'task',
      entityId: 'task-b',
      previousStatus: 'pending',
      correctedStatus: 'blocked',
      rule: 'rule-2',
    });
  });

  it('should NOT correct a pending task with all deps done', () => {
    const taskA = makeTask({ id: 'task-a', workStatus: 'done', title: 'A' });
    const taskB = makeTask({ id: 'task-b', workStatus: 'pending', title: 'B' });
    const edge = makeEdge('task-b', 'task-a');

    const dag = makeDAG({
      tasks: [taskA, taskB],
      edges: [edge],
    });

    const corrections = checkPendingTasksWithIncompleteDeps(dag);
    expect(corrections).toHaveLength(0);
  });

  it('should NOT correct a pending task with no deps', () => {
    const task = makeTask({ id: 'task-no-deps', workStatus: 'pending', title: 'No Deps' });

    const dag = makeDAG({ tasks: [task], edges: [] });

    const corrections = checkPendingTasksWithIncompleteDeps(dag);
    expect(corrections).toHaveLength(0);
  });

  it('should correct a pending task when at least one dep is incomplete', () => {
    const taskA = makeTask({ id: 'task-a', workStatus: 'done', title: 'A' });
    const taskB = makeTask({ id: 'task-b', workStatus: 'in_progress', title: 'B' });
    const taskC = makeTask({ id: 'task-c', workStatus: 'pending', title: 'C' });
    const edges = [makeEdge('task-c', 'task-a'), makeEdge('task-c', 'task-b')];

    const dag = makeDAG({
      tasks: [taskA, taskB, taskC],
      edges,
    });

    const corrections = checkPendingTasksWithIncompleteDeps(dag);

    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      entityId: 'task-c',
      correctedStatus: 'blocked',
      reason: 'Task has incomplete prerequisite dependencies',
    });
  });

  it('should not touch tasks that are not pending', () => {
    const taskA = makeTask({ id: 'task-a', workStatus: 'pending', title: 'A' });
    const taskB = makeTask({ id: 'task-b', workStatus: 'in_progress', title: 'B' });
    const edge = makeEdge('task-b', 'task-a');

    const dag = makeDAG({
      tasks: [taskA, taskB],
      edges: [edge],
    });

    const corrections = checkPendingTasksWithIncompleteDeps(dag);
    // task-b is in_progress, not pending, so it should not be corrected
    expect(corrections).toHaveLength(0);
  });
});

// ===========================================================================
// Rule 3: Orphaned in-progress stories (no assigned worker)
// ===========================================================================

describe('Rule 3: checkOrphanedInProgressStories', () => {
  it('should correct in_progress story with null assignedWorkerId to pending', () => {
    const story = makeStory({
      id: 'story-orphan',
      workStatus: 'in_progress',
      assignedWorkerId: null,
      title: 'Orphaned Story',
    });

    const dag = makeDAG({ stories: [story] });

    const corrections = checkOrphanedInProgressStories(dag);

    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      entityType: 'story',
      entityId: 'story-orphan',
      previousStatus: 'in_progress',
      correctedStatus: 'pending',
      rule: 'rule-3',
      reason: 'Story is in-progress with no assigned worker',
    });
  });

  it('should NOT correct in_progress story with valid assignedWorkerId', () => {
    const story = makeStory({
      id: 'story-active',
      workStatus: 'in_progress',
      assignedWorkerId: 'worker-123',
      title: 'Active Story',
    });

    const dag = makeDAG({ stories: [story] });

    const corrections = checkOrphanedInProgressStories(dag);
    expect(corrections).toHaveLength(0);
  });

  it('should correct to blocked when story has incomplete external deps', () => {
    const story = makeStory({
      id: 'story-blocked',
      workStatus: 'in_progress',
      assignedWorkerId: null,
      epicId: 'epic-001',
    });

    // Task in the story depends on an external task from another story
    const taskInStory = makeTask({
      id: 'task-in-story',
      userStoryId: 'story-blocked',
      workStatus: 'pending',
    });
    const externalTask = makeTask({
      id: 'task-external',
      userStoryId: 'story-other',
      workStatus: 'in_progress', // Not done -> incomplete external dep
    });
    const edge = makeEdge('task-in-story', 'task-external');

    const dag = makeDAG({
      stories: [story],
      tasks: [taskInStory, externalTask],
      edges: [edge],
    });

    const corrections = checkOrphanedInProgressStories(dag);

    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      entityId: 'story-blocked',
      correctedStatus: 'blocked',
    });
  });

  it('should correct to pending when all external deps are done', () => {
    const story = makeStory({
      id: 'story-free',
      workStatus: 'in_progress',
      assignedWorkerId: null,
    });

    const taskInStory = makeTask({
      id: 'task-in-story',
      userStoryId: 'story-free',
      workStatus: 'pending',
    });
    const externalTask = makeTask({
      id: 'task-external',
      userStoryId: 'story-other',
      workStatus: 'done',
    });
    const edge = makeEdge('task-in-story', 'task-external');

    const dag = makeDAG({
      stories: [story],
      tasks: [taskInStory, externalTask],
      edges: [edge],
    });

    const corrections = checkOrphanedInProgressStories(dag);

    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      entityId: 'story-free',
      correctedStatus: 'pending',
    });
  });

  it('should not flag stories with statuses other than in_progress', () => {
    const story = makeStory({
      id: 'story-pending',
      workStatus: 'pending',
      assignedWorkerId: null,
    });

    const dag = makeDAG({ stories: [story] });

    const corrections = checkOrphanedInProgressStories(dag);
    expect(corrections).toHaveLength(0);
  });

  it('should ignore internal dependencies (same story) when checking upstream', () => {
    const story = makeStory({
      id: 'story-internal',
      workStatus: 'in_progress',
      assignedWorkerId: null,
    });

    // Both tasks belong to the same story; internal dep should not make it blocked
    const taskA = makeTask({
      id: 'task-a',
      userStoryId: 'story-internal',
      workStatus: 'pending',
    });
    const taskB = makeTask({
      id: 'task-b',
      userStoryId: 'story-internal',
      workStatus: 'pending',
    });
    const edge = makeEdge('task-b', 'task-a');

    const dag = makeDAG({
      stories: [story],
      tasks: [taskA, taskB],
      edges: [edge],
    });

    const corrections = checkOrphanedInProgressStories(dag);

    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      entityId: 'story-internal',
      correctedStatus: 'pending', // Not blocked, because dep is internal
    });
  });

  it('should derive done when all tasks are in terminal state', () => {
    const story = makeStory({
      id: 'story-all-done',
      workStatus: 'in_progress',
      assignedWorkerId: null,
    });

    const tasks = [
      makeTask({ id: 'task-1', userStoryId: 'story-all-done', workStatus: 'done' }),
      makeTask({ id: 'task-2', userStoryId: 'story-all-done', workStatus: 'skipped' }),
    ];

    const dag = makeDAG({ stories: [story], tasks });

    const corrections = checkOrphanedInProgressStories(dag);

    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      entityId: 'story-all-done',
      correctedStatus: 'done',
      rule: 'rule-3',
    });
  });

  it('should not emit correction when derived status equals current status', () => {
    // A story that is in_progress with no worker but where the DAG derivation
    // would also yield in_progress should NOT produce a correction.
    // However in_progress is never derived by deriveStoryStatusFromDAG (only done/blocked/pending),
    // so this scenario can't actually happen for in_progress stories.
    // Instead test a scenario where Rule 3 does not find any orphan.
    const story = makeStory({
      id: 'story-with-worker',
      workStatus: 'in_progress',
      assignedWorkerId: 'worker-1',
    });

    const dag = makeDAG({ stories: [story] });

    const corrections = checkOrphanedInProgressStories(dag);
    expect(corrections).toHaveLength(0);
  });
});

// ===========================================================================
// Rule 4: Story-task status aggregation
// ===========================================================================

describe('Rule 4: checkStoryTaskAggregation', () => {
  it('should correct story to done when all tasks are in terminal state and no worker', () => {
    const story = makeStory({
      id: 'story-done',
      workStatus: 'in_progress',
      assignedWorkerId: null,
    });

    const tasks = [
      makeTask({ id: 'task-1', userStoryId: 'story-done', workStatus: 'done' }),
      makeTask({ id: 'task-2', userStoryId: 'story-done', workStatus: 'done' }),
      makeTask({ id: 'task-3', userStoryId: 'story-done', workStatus: 'skipped' }),
    ];

    const dag = makeDAG({ stories: [story], tasks });

    const corrections = checkStoryTaskAggregation(dag);

    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      entityType: 'story',
      entityId: 'story-done',
      previousStatus: 'in_progress',
      correctedStatus: 'done',
      rule: 'rule-4',
    });
  });

  it('should NOT correct story with assigned worker even if all tasks done', () => {
    const story = makeStory({
      id: 'story-active',
      workStatus: 'in_progress',
      assignedWorkerId: 'worker-123',
    });

    const tasks = [
      makeTask({ id: 'task-1', userStoryId: 'story-active', workStatus: 'done' }),
      makeTask({ id: 'task-2', userStoryId: 'story-active', workStatus: 'done' }),
    ];

    const dag = makeDAG({ stories: [story], tasks });

    const corrections = checkStoryTaskAggregation(dag);
    expect(corrections).toHaveLength(0);
  });

  it('should correct in_progress story to pending/blocked when no tasks started and no worker', () => {
    const story = makeStory({
      id: 'story-reset',
      workStatus: 'in_progress',
      assignedWorkerId: null,
    });

    const tasks = [
      makeTask({ id: 'task-1', userStoryId: 'story-reset', workStatus: 'pending' }),
      makeTask({ id: 'task-2', userStoryId: 'story-reset', workStatus: 'blocked' }),
    ];

    const dag = makeDAG({ stories: [story], tasks });

    const corrections = checkStoryTaskAggregation(dag);

    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      entityId: 'story-reset',
      previousStatus: 'in_progress',
      rule: 'rule-4',
      reason: 'Story is in-progress but no tasks have started',
    });
    // correctedStatus should be 'pending' or 'blocked' depending on external deps
    expect(['pending', 'blocked']).toContain(corrections[0]?.correctedStatus);
  });

  it('should skip story with no tasks', () => {
    const story = makeStory({
      id: 'story-empty',
      workStatus: 'in_progress',
      assignedWorkerId: null,
    });

    const dag = makeDAG({ stories: [story], tasks: [] });

    const corrections = checkStoryTaskAggregation(dag);
    expect(corrections).toHaveLength(0);
  });

  it('should correct done story with non-terminal tasks', () => {
    const story = makeStory({
      id: 'story-bad-done',
      workStatus: 'done',
      assignedWorkerId: null,
    });

    const tasks = [
      makeTask({ id: 'task-1', userStoryId: 'story-bad-done', workStatus: 'done' }),
      makeTask({ id: 'task-2', userStoryId: 'story-bad-done', workStatus: 'pending' }),
    ];

    const dag = makeDAG({ stories: [story], tasks });

    const corrections = checkStoryTaskAggregation(dag);

    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      entityId: 'story-bad-done',
      previousStatus: 'done',
      rule: 'rule-4',
      reason: 'Story is done but has non-terminal tasks',
    });
  });

  it('should not correct in_progress story when some tasks are in non-pending/blocked states', () => {
    const story = makeStory({
      id: 'story-working',
      workStatus: 'in_progress',
      assignedWorkerId: null,
    });

    const tasks = [
      makeTask({ id: 'task-1', userStoryId: 'story-working', workStatus: 'done' }),
      makeTask({ id: 'task-2', userStoryId: 'story-working', workStatus: 'in_progress' }),
    ];

    const dag = makeDAG({ stories: [story], tasks });

    const corrections = checkStoryTaskAggregation(dag);
    // Not all tasks are terminal, and not all tasks are pending/blocked
    // so neither condition triggers correction
    expect(corrections).toHaveLength(0);
  });

  it('should handle story with all failed tasks as terminal', () => {
    const story = makeStory({
      id: 'story-failed',
      workStatus: 'in_progress',
      assignedWorkerId: null,
    });

    const tasks = [
      makeTask({ id: 'task-1', userStoryId: 'story-failed', workStatus: 'failed' }),
      makeTask({ id: 'task-2', userStoryId: 'story-failed', workStatus: 'failed' }),
    ];

    const dag = makeDAG({ stories: [story], tasks });

    const corrections = checkStoryTaskAggregation(dag);

    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      entityId: 'story-failed',
      correctedStatus: 'done',
      reason: 'All tasks are in terminal state',
    });
  });

  it('should correctly determine blocked status from external deps for no-tasks-started scenario', () => {
    const story = makeStory({
      id: 'story-ext-blocked',
      workStatus: 'in_progress',
      assignedWorkerId: null,
    });

    const taskInStory = makeTask({
      id: 'task-in',
      userStoryId: 'story-ext-blocked',
      workStatus: 'blocked',
    });
    const externalTask = makeTask({
      id: 'task-ext',
      userStoryId: 'story-other',
      workStatus: 'in_progress', // Not done
    });
    const edge = makeEdge('task-in', 'task-ext');

    const dag = makeDAG({
      stories: [story],
      tasks: [taskInStory, externalTask],
      edges: [edge],
    });

    const corrections = checkStoryTaskAggregation(dag);

    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      entityId: 'story-ext-blocked',
      correctedStatus: 'blocked',
    });
  });

  it('should not correct done story when all tasks are in terminal states', () => {
    const story = makeStory({
      id: 'story-correctly-done',
      workStatus: 'done',
      assignedWorkerId: null,
    });

    const tasks = [
      makeTask({ id: 'task-1', userStoryId: 'story-correctly-done', workStatus: 'done' }),
      makeTask({ id: 'task-2', userStoryId: 'story-correctly-done', workStatus: 'skipped' }),
    ];

    const dag = makeDAG({ stories: [story], tasks });

    const corrections = checkStoryTaskAggregation(dag);
    expect(corrections).toHaveLength(0);
  });
});

// ===========================================================================
// Rule 5: Epic-story status aggregation
// ===========================================================================

describe('Rule 5: checkEpicStoryAggregation', () => {
  it('should correct epic to done when all stories are done', () => {
    const epic = makeEpic({ id: 'epic-done', workStatus: 'in_progress' });
    const stories = [
      makeStory({ id: 'story-1', epicId: 'epic-done', workStatus: 'done' }),
      makeStory({ id: 'story-2', epicId: 'epic-done', workStatus: 'done' }),
    ];

    const dag = makeDAG({ epics: [epic], stories });

    const corrections = checkEpicStoryAggregation(dag);

    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      entityType: 'epic',
      entityId: 'epic-done',
      previousStatus: 'in_progress',
      correctedStatus: 'done',
      rule: 'rule-5',
    });
  });

  it('should correct epic to pending when all stories are pending', () => {
    const epic = makeEpic({ id: 'epic-pending', workStatus: 'in_progress' });
    const stories = [
      makeStory({ id: 'story-1', epicId: 'epic-pending', workStatus: 'pending' }),
      makeStory({ id: 'story-2', epicId: 'epic-pending', workStatus: 'pending' }),
    ];

    const dag = makeDAG({ epics: [epic], stories });

    const corrections = checkEpicStoryAggregation(dag);

    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      entityId: 'epic-pending',
      correctedStatus: 'pending',
    });
  });

  it('should derive in_progress for mixed statuses', () => {
    const epic = makeEpic({ id: 'epic-mixed', workStatus: 'pending' });
    const stories = [
      makeStory({ id: 'story-1', epicId: 'epic-mixed', workStatus: 'done' }),
      makeStory({ id: 'story-2', epicId: 'epic-mixed', workStatus: 'pending' }),
    ];

    const dag = makeDAG({ epics: [epic], stories });

    const corrections = checkEpicStoryAggregation(dag);

    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      entityId: 'epic-mixed',
      correctedStatus: 'in_progress',
    });
  });

  it('should derive pending for epic with no stories', () => {
    const epic = makeEpic({ id: 'epic-empty', workStatus: 'in_progress' });

    const dag = makeDAG({ epics: [epic], stories: [] });

    const corrections = checkEpicStoryAggregation(dag);

    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      entityId: 'epic-empty',
      correctedStatus: 'pending',
    });
  });

  it('should NOT correct epic when status already matches derived status', () => {
    const epic = makeEpic({ id: 'epic-correct', workStatus: 'done' });
    const stories = [
      makeStory({ id: 'story-1', epicId: 'epic-correct', workStatus: 'done' }),
      makeStory({ id: 'story-2', epicId: 'epic-correct', workStatus: 'done' }),
    ];

    const dag = makeDAG({ epics: [epic], stories });

    const corrections = checkEpicStoryAggregation(dag);
    expect(corrections).toHaveLength(0);
  });

  it('should derive blocked when all stories are blocked', () => {
    const epic = makeEpic({ id: 'epic-blocked', workStatus: 'pending' });
    const stories = [
      makeStory({ id: 'story-1', epicId: 'epic-blocked', workStatus: 'blocked' }),
      makeStory({ id: 'story-2', epicId: 'epic-blocked', workStatus: 'blocked' }),
    ];

    const dag = makeDAG({ epics: [epic], stories });

    const corrections = checkEpicStoryAggregation(dag);

    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      entityId: 'epic-blocked',
      correctedStatus: 'blocked',
    });
  });

  it('should derive in_progress when any story is in_progress', () => {
    const epic = makeEpic({ id: 'epic-ip', workStatus: 'pending' });
    const stories = [
      makeStory({ id: 'story-1', epicId: 'epic-ip', workStatus: 'pending' }),
      makeStory({ id: 'story-2', epicId: 'epic-ip', workStatus: 'in_progress' }),
    ];

    const dag = makeDAG({ epics: [epic], stories });

    const corrections = checkEpicStoryAggregation(dag);

    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      entityId: 'epic-ip',
      correctedStatus: 'in_progress',
    });
  });

  it('should derive ready when all stories are ready', () => {
    const epic = makeEpic({ id: 'epic-ready', workStatus: 'pending' });
    const stories = [
      makeStory({ id: 'story-1', epicId: 'epic-ready', workStatus: 'ready' }),
      makeStory({ id: 'story-2', epicId: 'epic-ready', workStatus: 'ready' }),
    ];

    const dag = makeDAG({ epics: [epic], stories });

    const corrections = checkEpicStoryAggregation(dag);

    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      entityId: 'epic-ready',
      correctedStatus: 'ready',
    });
  });

  it('should handle multiple epics independently', () => {
    const epic1 = makeEpic({ id: 'epic-1', workStatus: 'pending' });
    const epic2 = makeEpic({ id: 'epic-2', workStatus: 'in_progress' });

    const stories = [
      makeStory({ id: 'story-1', epicId: 'epic-1', workStatus: 'done' }),
      makeStory({ id: 'story-2', epicId: 'epic-2', workStatus: 'done' }),
    ];

    const dag = makeDAG({ epics: [epic1, epic2], stories });

    const corrections = checkEpicStoryAggregation(dag);

    // Both epics should be corrected to done
    expect(corrections).toHaveLength(2);
    const correctedIds = corrections.map((c) => c.entityId);
    expect(correctedIds).toContain('epic-1');
    expect(correctedIds).toContain('epic-2');
  });

  it('should include descriptive reason with current and derived status', () => {
    const epic = makeEpic({ id: 'epic-reason', workStatus: 'blocked', name: 'My Epic' });
    const stories = [makeStory({ id: 'story-1', epicId: 'epic-reason', workStatus: 'done' })];

    const dag = makeDAG({ epics: [epic], stories });

    const corrections = checkEpicStoryAggregation(dag);

    expect(corrections).toHaveLength(1);
    expect(corrections[0]?.reason).toContain('blocked');
    expect(corrections[0]?.reason).toContain('done');
    expect(corrections[0]?.entityName).toBe('My Epic');
  });
});

// ===========================================================================
// runAllRules (integration)
// ===========================================================================

describe('runAllRules', () => {
  it('should combine corrections from all 5 rules with deduplication', () => {
    // Construct a DAG that triggers multiple rules:
    // Rule 1: blocked task with all deps done (task-4)
    // Rule 2: pending task with incomplete deps (task-5)
    // Rule 3: orphaned in_progress story (story-1) -> derives 'done' (all tasks terminal)
    // Rule 4: story with all tasks done but not marked done (story-1) -> also derives 'done'
    // Rule 5: epic status mismatch
    //
    // story-1 is targeted by both Rule 3 and Rule 4. After dedup,
    // only Rule 4's correction survives (last-write-wins).

    const epic = makeEpic({ id: 'epic-1', workStatus: 'in_progress' });

    // Story 1: orphaned in_progress (Rule 3) + all tasks done, no worker (Rule 4)
    const story1 = makeStory({
      id: 'story-1',
      epicId: 'epic-1',
      workStatus: 'in_progress',
      assignedWorkerId: null,
    });

    // Story 2: for Rule 1 and Rule 2
    const story2 = makeStory({
      id: 'story-2',
      epicId: 'epic-1',
      workStatus: 'done',
      assignedWorkerId: null,
    });

    const tasks = [
      // Story 1 tasks: all done -> triggers Rule 3 ('done') and Rule 4 ('done')
      makeTask({ id: 'task-1', userStoryId: 'story-1', workStatus: 'done' }),
      makeTask({ id: 'task-2', userStoryId: 'story-1', workStatus: 'done' }),
      // Story 2 tasks: Rule 1 (blocked with done dep) and Rule 2 (pending with incomplete dep)
      makeTask({ id: 'task-3', userStoryId: 'story-2', workStatus: 'done' }),
      makeTask({ id: 'task-4', userStoryId: 'story-2', workStatus: 'blocked' }),
      makeTask({ id: 'task-5', userStoryId: 'story-2', workStatus: 'pending' }),
    ];

    const edges = [
      makeEdge('task-4', 'task-3'), // task-4 blocked on task-3 (done) -> Rule 1
      makeEdge('task-5', 'task-4'), // task-5 pending on task-4 (blocked) -> Rule 2
    ];

    const dag = makeDAG({
      epics: [epic],
      stories: [story1, story2],
      tasks,
      edges,
    });

    const corrections = runAllRules(dag);

    const rules = corrections.map((c) => c.rule);
    expect(rules).toContain('rule-1'); // task-4: blocked -> pending
    expect(rules).toContain('rule-2'); // task-5: pending -> blocked

    // story-1 should appear exactly once (deduped), with Rule 4 winning
    const storyCorrections = corrections.filter(
      (c) => c.entityType === 'story' && c.entityId === 'story-1',
    );
    expect(storyCorrections).toHaveLength(1);
    expect(storyCorrections[0]).toMatchObject({
      rule: 'rule-4',
      correctedStatus: 'done',
    });
  });

  it('should deduplicate corrections by entityType+entityId (last rule wins)', () => {
    // A story that triggers both Rule 3 and Rule 4 should only appear once.
    // Rule 3 derives 'pending' (no tasks, orphaned), Rule 4 skips (no tasks).
    // So only Rule 3's correction survives.
    // To test the actual dedup path, use a story with all-done tasks and no worker:
    // Rule 3 derives 'done', Rule 4 also derives 'done'. After dedup, one correction.
    const epic = makeEpic({ id: 'epic-dedup', workStatus: 'in_progress' });
    const story = makeStory({
      id: 'story-dedup',
      epicId: 'epic-dedup',
      workStatus: 'in_progress',
      assignedWorkerId: null,
    });
    const tasks = [
      makeTask({ id: 'task-d1', userStoryId: 'story-dedup', workStatus: 'done' }),
      makeTask({ id: 'task-d2', userStoryId: 'story-dedup', workStatus: 'done' }),
    ];

    const dag = makeDAG({
      epics: [epic],
      stories: [story],
      tasks,
    });

    const corrections = runAllRules(dag);

    // story-dedup should appear exactly once despite being matched by Rules 3 and 4
    const storyCorrections = corrections.filter(
      (c) => c.entityType === 'story' && c.entityId === 'story-dedup',
    );
    expect(storyCorrections).toHaveLength(1);
    expect(storyCorrections[0]?.correctedStatus).toBe('done');
  });

  it('should return empty array for consistent DAG', () => {
    const epic = makeEpic({ id: 'epic-1', workStatus: 'in_progress' });
    const story = makeStory({
      id: 'story-1',
      epicId: 'epic-1',
      workStatus: 'in_progress',
      assignedWorkerId: 'worker-1', // Has worker -> Rule 3 skips
    });

    const tasks = [
      makeTask({ id: 'task-1', userStoryId: 'story-1', workStatus: 'done' }),
      makeTask({ id: 'task-2', userStoryId: 'story-1', workStatus: 'in_progress' }),
    ];

    const dag = makeDAG({
      epics: [epic],
      stories: [story],
      tasks,
      edges: [],
    });

    const corrections = runAllRules(dag);
    expect(corrections).toHaveLength(0);
  });

  it('should handle empty DAG (no epics, stories, or tasks)', () => {
    const dag = makeDAG({
      epics: [],
      stories: [],
      tasks: [],
      edges: [],
    });

    const corrections = runAllRules(dag);
    expect(corrections).toHaveLength(0);
  });

  it('should handle DAG with only epics (no stories or tasks)', () => {
    const epic = makeEpic({ id: 'epic-1', workStatus: 'pending' });

    const dag = makeDAG({
      epics: [epic],
      stories: [],
      tasks: [],
      edges: [],
    });

    const corrections = runAllRules(dag);
    // Epic with no stories -> derived status is 'pending', which matches
    expect(corrections).toHaveLength(0);
  });
});

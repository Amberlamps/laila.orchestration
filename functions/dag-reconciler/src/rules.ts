/**
 * Consistency rules for the DAG reconciler.
 *
 * Each rule examines a specific invariant across the project DAG and
 * returns corrections when violations are detected. Rules operate on
 * the in-memory DAG loaded by db.ts -- no additional database queries.
 *
 * Status values follow the WorkStatus enum from @laila/shared:
 * pending, blocked, ready, in_progress, review, done, failed, skipped
 */

import type { ProjectDAG, CorrectionDetail, TaskNode, StoryNode } from './types';
import type { WorkStatus } from '@laila/shared';

// ---------------------------------------------------------------------------
// Helper: build prerequisite lookup maps
// ---------------------------------------------------------------------------

/** Map from task ID to its prerequisite task IDs. */
const buildPrerequisiteMap = (dag: ProjectDAG): Map<string, string[]> => {
  const map = new Map<string, string[]>();

  for (const edge of dag.edges) {
    const existing = map.get(edge.dependentTaskId) ?? [];
    existing.push(edge.prerequisiteTaskId);
    map.set(edge.dependentTaskId, existing);
  }

  return map;
};

/** Map from task ID to the task node for quick lookup. */
const buildTaskMap = (tasks: TaskNode[]): Map<string, TaskNode> => {
  const map = new Map<string, TaskNode>();
  for (const task of tasks) {
    map.set(task.id, task);
  }
  return map;
};

// ---------------------------------------------------------------------------
// Terminal status check
// ---------------------------------------------------------------------------

/** Terminal statuses that should not be corrected by the reconciler. */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['done', 'failed', 'skipped']);

/** Check if a status is terminal (done, failed, skipped). */
const isTerminal = (status: string): boolean => TERMINAL_STATUSES.has(status);

// ---------------------------------------------------------------------------
// Rule 1: Blocked tasks with all dependencies done -> 'pending'
// ---------------------------------------------------------------------------

/**
 * Detects tasks that are incorrectly blocked when all their prerequisite
 * tasks have completed. These tasks should transition to 'pending' so
 * they become eligible for assignment.
 */
export const checkBlockedTasksWithCompleteDeps = (dag: ProjectDAG): CorrectionDetail[] => {
  const corrections: CorrectionDetail[] = [];
  const prereqMap = buildPrerequisiteMap(dag);
  const taskMap = buildTaskMap(dag.tasks);

  const blockedTasks = dag.tasks.filter((t) => t.workStatus === 'blocked');

  for (const task of blockedTasks) {
    const prereqIds = prereqMap.get(task.id);

    // If no dependencies recorded, this task should not be blocked
    if (!prereqIds || prereqIds.length === 0) {
      corrections.push({
        projectId: dag.project.id,
        entityType: 'task',
        entityId: task.id,
        entityName: task.title,
        previousStatus: 'blocked' as WorkStatus,
        correctedStatus: 'pending' as WorkStatus,
        rule: 'rule-1',
        reason: 'Task is blocked but has no dependencies',
      });
      continue;
    }

    const allDone = prereqIds.every((prereqId) => {
      const prereqTask = taskMap.get(prereqId);
      return prereqTask?.workStatus === 'done';
    });

    if (allDone) {
      corrections.push({
        projectId: dag.project.id,
        entityType: 'task',
        entityId: task.id,
        entityName: task.title,
        previousStatus: 'blocked' as WorkStatus,
        correctedStatus: 'pending' as WorkStatus,
        rule: 'rule-1',
        reason: 'All prerequisite tasks are done',
      });
    }
  }

  return corrections;
};

// ---------------------------------------------------------------------------
// Rule 2: Pending tasks with incomplete dependencies -> 'blocked'
// ---------------------------------------------------------------------------

/**
 * Detects tasks that are incorrectly pending when they have dependencies
 * that have not yet completed. These tasks should transition to 'blocked'
 * to prevent premature assignment.
 */
export const checkPendingTasksWithIncompleteDeps = (dag: ProjectDAG): CorrectionDetail[] => {
  const corrections: CorrectionDetail[] = [];
  const prereqMap = buildPrerequisiteMap(dag);
  const taskMap = buildTaskMap(dag.tasks);

  const pendingTasks = dag.tasks.filter((t) => t.workStatus === 'pending');

  for (const task of pendingTasks) {
    const prereqIds = prereqMap.get(task.id);

    // No dependencies -- task is correctly pending
    if (!prereqIds || prereqIds.length === 0) {
      continue;
    }

    const anyIncomplete = prereqIds.some((prereqId) => {
      const prereqTask = taskMap.get(prereqId);
      return prereqTask?.workStatus !== 'done';
    });

    if (anyIncomplete) {
      corrections.push({
        projectId: dag.project.id,
        entityType: 'task',
        entityId: task.id,
        entityName: task.title,
        previousStatus: 'pending' as WorkStatus,
        correctedStatus: 'blocked' as WorkStatus,
        rule: 'rule-2',
        reason: 'Task has incomplete prerequisite dependencies',
      });
    }
  }

  return corrections;
};

// ---------------------------------------------------------------------------
// Rule 3: In-progress stories with no assigned worker -> reset
// ---------------------------------------------------------------------------

/**
 * Detects stories that are in-progress but have no assigned worker.
 * This is an orphaned state -- the story status should be determined
 * from its task statuses via the DAG:
 * - All tasks in terminal state (done/failed/skipped) -> 'done'
 * - Has incomplete external upstream dependencies    -> 'blocked'
 * - Otherwise                                        -> 'pending'
 *
 * A correction is only emitted when the derived status differs from
 * the current status.
 */
export const checkOrphanedInProgressStories = (dag: ProjectDAG): CorrectionDetail[] => {
  const corrections: CorrectionDetail[] = [];
  const prereqMap = buildPrerequisiteMap(dag);
  const taskMap = buildTaskMap(dag.tasks);

  const orphanedStories = dag.stories.filter(
    (s) => s.workStatus === 'in_progress' && s.assignedWorkerId === null,
  );

  for (const story of orphanedStories) {
    const storyTasks = dag.tasks.filter((t) => t.userStoryId === story.id);

    const derivedStatus = deriveStoryStatusFromDAG(story, storyTasks, prereqMap, taskMap);

    if (derivedStatus !== story.workStatus) {
      corrections.push({
        projectId: dag.project.id,
        entityType: 'story',
        entityId: story.id,
        entityName: story.title,
        previousStatus: story.workStatus as WorkStatus,
        correctedStatus: derivedStatus,
        rule: 'rule-3',
        reason: 'Story is in-progress with no assigned worker',
      });
    }
  }

  return corrections;
};

// ---------------------------------------------------------------------------
// Rule 4: Story status should reflect aggregated task statuses
// ---------------------------------------------------------------------------

/**
 * Verifies that story statuses are consistent with their child task
 * statuses. Only corrects stories that have no assigned worker (stories
 * with an assigned worker are in valid transitional states).
 *
 * Checks:
 * - All tasks done AND story NOT done AND no assigned worker -> 'done'
 * - No tasks started AND story is in_progress AND no assigned worker
 *   -> 'pending' or 'blocked'
 */
export const checkStoryTaskAggregation = (dag: ProjectDAG): CorrectionDetail[] => {
  const corrections: CorrectionDetail[] = [];
  const prereqMap = buildPrerequisiteMap(dag);
  const taskMap = buildTaskMap(dag.tasks);

  // Group tasks by story
  const tasksByStory = new Map<string, TaskNode[]>();
  for (const task of dag.tasks) {
    const existing = tasksByStory.get(task.userStoryId) ?? [];
    existing.push(task);
    tasksByStory.set(task.userStoryId, existing);
  }

  for (const story of dag.stories) {
    // Skip stories with an assigned worker -- valid transitional state
    if (story.assignedWorkerId !== null) {
      continue;
    }

    // Skip stories already in terminal status
    if (isTerminal(story.workStatus)) {
      const storyTasks = tasksByStory.get(story.id) ?? [];
      // Exception: story is 'done' but not all tasks are done
      if (story.workStatus === 'done' && storyTasks.length > 0) {
        const allTasksDone = storyTasks.every((t) => isTerminal(t.workStatus));
        if (!allTasksDone) {
          // Determine correct status
          const targetStatus = deriveStoryStatusFromDAG(story, storyTasks, prereqMap, taskMap);
          if (targetStatus !== story.workStatus) {
            corrections.push({
              projectId: dag.project.id,
              entityType: 'story',
              entityId: story.id,
              entityName: story.title,
              previousStatus: story.workStatus as WorkStatus,
              correctedStatus: targetStatus,
              rule: 'rule-4',
              reason: 'Story is done but has non-terminal tasks',
            });
          }
        }
      }
      continue;
    }

    const storyTasks = tasksByStory.get(story.id) ?? [];

    // No tasks -- cannot determine, skip
    if (storyTasks.length === 0) {
      continue;
    }

    // All tasks in terminal state (done/failed/skipped) -> story should be done
    const allTerminal = storyTasks.every((t) => isTerminal(t.workStatus));
    if (allTerminal && story.workStatus !== 'done') {
      corrections.push({
        projectId: dag.project.id,
        entityType: 'story',
        entityId: story.id,
        entityName: story.title,
        previousStatus: story.workStatus as WorkStatus,
        correctedStatus: 'done' as WorkStatus,
        rule: 'rule-4',
        reason: 'All tasks are in terminal state',
      });
      continue;
    }

    // No tasks started and story is in_progress -> reset
    const noTasksStarted = storyTasks.every(
      (t) => t.workStatus === 'pending' || t.workStatus === 'blocked',
    );
    if (noTasksStarted && story.workStatus === 'in_progress') {
      const targetStatus = deriveStoryStatusFromDAG(story, storyTasks, prereqMap, taskMap);
      corrections.push({
        projectId: dag.project.id,
        entityType: 'story',
        entityId: story.id,
        entityName: story.title,
        previousStatus: 'in_progress' as WorkStatus,
        correctedStatus: targetStatus,
        rule: 'rule-4',
        reason: 'Story is in-progress but no tasks have started',
      });
    }
  }

  return corrections;
};

/**
 * Derive the true DAG-determined status for a story based on its tasks
 * and their external dependencies:
 * - All tasks in terminal state (done/failed/skipped) -> 'done'
 * - Has incomplete external upstream dependencies     -> 'blocked'
 * - Otherwise                                         -> 'pending'
 */
const deriveStoryStatusFromDAG = (
  story: StoryNode,
  storyTasks: TaskNode[],
  prereqMap: Map<string, string[]>,
  taskMap: Map<string, TaskNode>,
): WorkStatus => {
  // If the story has tasks and all are terminal, derive 'done'
  if (storyTasks.length > 0 && storyTasks.every((t) => isTerminal(t.workStatus))) {
    return 'done';
  }

  const hasIncompleteExternalDeps = storyTasks.some((task) => {
    const prereqIds = prereqMap.get(task.id) ?? [];
    return prereqIds.some((prereqId) => {
      const prereqTask = taskMap.get(prereqId);
      if (!prereqTask) return false;
      if (prereqTask.userStoryId === story.id) return false;
      return prereqTask.workStatus !== 'done';
    });
  });

  return hasIncompleteExternalDeps ? 'blocked' : 'pending';
};

// ---------------------------------------------------------------------------
// Rule 5: Epic status should reflect aggregated story statuses
// ---------------------------------------------------------------------------

/**
 * Verifies that epic statuses are consistent with their child story
 * statuses, using the same derivation logic as `computeDerivedStatus`
 * in the epic repository.
 *
 * Derivation rules (evaluated in priority order):
 * 1. No stories at all          -> 'pending'
 * 2. All stories are 'pending'  -> 'pending'
 * 3. All stories are 'done'     -> 'done'
 * 4. All stories are 'blocked'  -> 'blocked'
 * 5. Any story is 'in_progress' -> 'in_progress'
 * 6. Mix of done/pending/ready  -> 'in_progress'
 */
export const checkEpicStoryAggregation = (dag: ProjectDAG): CorrectionDetail[] => {
  const corrections: CorrectionDetail[] = [];

  // Group stories by epic
  const storiesByEpic = new Map<string, StoryNode[]>();
  for (const story of dag.stories) {
    const existing = storiesByEpic.get(story.epicId) ?? [];
    existing.push(story);
    storiesByEpic.set(story.epicId, existing);
  }

  for (const epic of dag.epics) {
    const epicStories = storiesByEpic.get(epic.id) ?? [];
    const derivedStatus = deriveEpicStatus(epicStories);

    if (derivedStatus !== epic.workStatus) {
      corrections.push({
        projectId: dag.project.id,
        entityType: 'epic',
        entityId: epic.id,
        entityName: epic.name,
        previousStatus: epic.workStatus as WorkStatus,
        correctedStatus: derivedStatus,
        rule: 'rule-5',
        reason: `Epic status '${epic.workStatus}' does not match derived status '${derivedStatus}'`,
      });
    }
  }

  return corrections;
};

/**
 * Derive an epic's work status from its child story statuses.
 *
 * This mirrors the logic in the epic repository's `deriveEpicStatus`
 * function to keep reconciliation checks consistent with the source
 * of truth.
 */
const deriveEpicStatus = (stories: StoryNode[]): WorkStatus => {
  if (stories.length === 0) {
    return 'pending';
  }

  const statusCounts = new Map<string, number>();
  for (const story of stories) {
    const current = statusCounts.get(story.workStatus) ?? 0;
    statusCounts.set(story.workStatus, current + 1);
  }

  const total = stories.length;
  const pendingCount = statusCounts.get('pending') ?? 0;
  const doneCount = statusCounts.get('done') ?? 0;
  const blockedCount = statusCounts.get('blocked') ?? 0;
  const inProgressCount = statusCounts.get('in_progress') ?? 0;
  const readyCount = statusCounts.get('ready') ?? 0;

  // All stories share a single status
  if (pendingCount === total) return 'pending';
  if (readyCount === total) return 'ready';
  if (doneCount === total) return 'done';
  if (blockedCount === total) return 'blocked';

  // Any story explicitly in progress
  if (inProgressCount > 0) return 'in_progress';

  // Mix of statuses -> in_progress
  return 'in_progress';
};

// ---------------------------------------------------------------------------
// Aggregate: run all rules
// ---------------------------------------------------------------------------

/**
 * Runs all five consistency rules against a project DAG and returns
 * the combined list of corrections, deduplicated by entity.
 *
 * Rules are evaluated in order (1-5). When multiple rules produce
 * corrections for the same entity (entityType + entityId), only the
 * last correction is kept — later rules are more authoritative since
 * they consider broader context (e.g. Rule 4 aggregates task statuses
 * while Rule 3 only checks for orphaned workers). This prevents
 * duplicate/conflicting updates and duplicate audit events.
 */
export const runAllRules = (dag: ProjectDAG): CorrectionDetail[] => {
  const allCorrections: CorrectionDetail[] = [];

  allCorrections.push(...checkBlockedTasksWithCompleteDeps(dag));
  allCorrections.push(...checkPendingTasksWithIncompleteDeps(dag));
  allCorrections.push(...checkOrphanedInProgressStories(dag));
  allCorrections.push(...checkStoryTaskAggregation(dag));
  allCorrections.push(...checkEpicStoryAggregation(dag));

  // Deduplicate: keep at most one correction per entity.
  // Later rules overwrite earlier ones (last-write-wins).
  const deduped = new Map<string, CorrectionDetail>();
  for (const correction of allCorrections) {
    const key = `${correction.entityType}:${correction.entityId}`;
    deduped.set(key, correction);
  }

  return Array.from(deduped.values());
};

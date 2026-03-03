/**
 * @module response-builder
 *
 * Builds typed response payloads for the orchestration assignment endpoint.
 *
 * This module encapsulates the data loading and assembly logic for the three
 * response variants of `POST /api/v1/orchestration/assign`:
 *
 * - **assigned** — Full story detail with tasks, personas, dependencies,
 *   and recommended task execution order. This is the "work package" a
 *   worker receives when a story is successfully assigned.
 * - **blocked** — Blocking story information with retry hint.
 * - **all_complete** — Project summary when all stories are done.
 *
 * All database queries for the "assigned" response run within the caller's
 * transaction to ensure a consistent snapshot with the eligibility reads
 * and assignment writes. The module loads the story, parent epic, task
 * graph (tasks + dependency edges), personas, and computes the recommended
 * task execution order via the domain layer.
 */

import {
  createStoryRepository,
  createEpicRepository,
  createTaskRepository,
  createPersonaRepository,
  type Database,
  type PoolDatabase,
} from '@laila/database';
import { computeRecommendedTaskOrder } from '@laila/domain';
import { NotFoundError, DomainErrorCode } from '@laila/shared';

import type { TaskOrderInfo, AdjacencyList } from '@laila/domain';
import type {
  AssignResponse,
  AssignedStoryDetail,
  AssignedTaskDetail,
  BlockingStoryInfo,
} from '@laila/shared';

// ---------------------------------------------------------------------------
// Status mapping helpers
// ---------------------------------------------------------------------------

/**
 * Maps a database story workStatus to the domain's UserStoryStatus.
 *
 * DB uses: pending, blocked, ready, in_progress, review, done, failed, skipped
 * Domain uses: draft, not-started, in-progress, complete, failed, blocked
 */
export const mapStoryStatusToDomain = (
  dbStatus: string,
): 'draft' | 'not-started' | 'in-progress' | 'complete' | 'failed' | 'blocked' => {
  switch (dbStatus) {
    case 'pending':
      return 'draft';
    case 'ready':
      return 'not-started';
    case 'blocked':
      return 'blocked';
    case 'in_progress':
      return 'in-progress';
    case 'review':
      return 'in-progress'; // review is a sub-state of in-progress for eligibility
    case 'done':
      return 'complete';
    case 'skipped':
      return 'complete'; // skipped is a terminal state like complete
    case 'failed':
      return 'failed';
    default:
      return 'draft';
  }
};

/**
 * Maps a database epic workStatus to the domain's EpicStatus.
 *
 * DB uses: pending, blocked, ready, in_progress, review, done, failed, skipped
 * Domain uses: not-started, in-progress, complete, failed, blocked
 */
export const mapEpicStatusToDomain = (
  dbStatus: string,
): 'not-started' | 'in-progress' | 'complete' | 'failed' | 'blocked' => {
  switch (dbStatus) {
    case 'pending':
      return 'not-started';
    case 'ready':
      return 'not-started';
    case 'blocked':
      return 'blocked';
    case 'in_progress':
      return 'in-progress';
    case 'review':
      return 'in-progress';
    case 'done':
      return 'complete';
    case 'skipped':
      return 'complete';
    case 'failed':
      return 'failed';
    default:
      return 'not-started';
  }
};

/**
 * Maps a database task workStatus to the domain's TaskStatus.
 *
 * DB uses: pending, blocked, ready, in_progress, review, done, failed, skipped
 * Domain uses: not-started, in-progress, complete, blocked
 */
export const mapTaskStatusToDomain = (
  dbStatus: string,
): 'not-started' | 'in-progress' | 'complete' | 'blocked' => {
  switch (dbStatus) {
    case 'pending':
      return 'not-started';
    case 'ready':
      return 'not-started';
    case 'blocked':
      return 'blocked';
    case 'in_progress':
      return 'in-progress';
    case 'review':
      return 'in-progress';
    case 'done':
      return 'complete';
    case 'skipped':
      return 'complete';
    case 'failed':
      return 'blocked'; // failed tasks block downstream
    default:
      return 'not-started';
  }
};

// ---------------------------------------------------------------------------
// Typed DB record interfaces
// ---------------------------------------------------------------------------

/**
 * A simplified, typed view of a story record extracted from Drizzle DB results.
 * Used to provide typed access to story fields in the orchestration flow.
 *
 * The Drizzle base repository's generic typing can produce `unknown` for column
 * types when `tsc` resolves through the generic constraint chain. This interface
 * allows clean typed access after the initial DB query.
 */
export interface StoryRecord {
  id: string;
  epicId: string;
  workStatus: string;
  title: string;
  priority: string;
  assignedWorkerId: string | null;
  createdAt: Date;
  version: number;
  description: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default retry-after hint for blocked responses (seconds).
 * Workers should wait at least this long before requesting work again
 * when all eligible stories are blocked by dependencies.
 */
export const DEFAULT_RETRY_AFTER_SECONDS = 60;

// ---------------------------------------------------------------------------
// Response builders
// ---------------------------------------------------------------------------

/**
 * Builds the full "assigned" response with story detail, tasks, personas,
 * dependencies, and recommended task order.
 *
 * Loads all related data from the database using the same `db` client to
 * ensure a consistent snapshot:
 *
 * 1. Load the assigned story
 * 2. Load the parent epic
 * 3. Load the full task graph for the project (tasks + dependency edges)
 * 4. Filter to story tasks and build adjacency list
 * 5. Resolve external dependencies (tasks in other stories)
 * 6. Load persona details for all referenced personas
 * 7. Compute recommended task execution order via domain logic
 * 8. Assemble the `AssignedStoryDetail` payload
 *
 * @param db        - The database client (or transaction handle) to use for all queries
 * @param tenantId  - Tenant UUID for scoping all queries
 * @param storyId   - The assigned story's UUID
 * @param projectId - The project UUID (needed for task graph query)
 * @returns The fully populated AssignedStoryDetail work package
 * @throws {NotFoundError} If the story or its parent epic cannot be found
 */
export async function buildAssignedResponse(
  db: Database | PoolDatabase,
  tenantId: string,
  storyId: string,
  projectId: string,
): Promise<AssignedStoryDetail> {
  const storyRepo = createStoryRepository(db);
  const epicRepo = createEpicRepository(db);
  const taskRepo = createTaskRepository(db);
  const personaRepo = createPersonaRepository(db);

  // -----------------------------------------------------------------------
  // Step 1: Load the assigned story
  // -----------------------------------------------------------------------
  const storyRecord = await storyRepo.findById(tenantId, storyId);
  if (!storyRecord) {
    throw new NotFoundError(
      DomainErrorCode.STORY_NOT_FOUND,
      `Story ${storyId} not found`,
    );
  }

  // Type-narrow the DB record for clean access below
  const story = storyRecord as unknown as StoryRecord;

  // -----------------------------------------------------------------------
  // Step 2: Load the parent epic
  // -----------------------------------------------------------------------
  const epicRecord = await epicRepo.findById(tenantId, story.epicId);
  if (!epicRecord) {
    throw new NotFoundError(
      DomainErrorCode.EPIC_NOT_FOUND,
      `Epic ${story.epicId} not found`,
    );
  }

  // -----------------------------------------------------------------------
  // Step 3: Load the task graph for the project (tasks + dependency edges)
  // -----------------------------------------------------------------------
  const taskGraph = await taskRepo.getTaskGraph(tenantId, projectId);

  // -----------------------------------------------------------------------
  // Step 4: Filter tasks to this story and build adjacency list
  // -----------------------------------------------------------------------
  const storyTasks = taskGraph.tasks.filter((t) => t.userStoryId === storyId);
  const storyTaskIds = storyTasks.map((t) => t.id);

  // Build adjacency list from edges (task -> set of prerequisites)
  // This includes all edges in the project graph so the domain layer
  // can correctly identify cross-story dependencies.
  const adjacencyList: AdjacencyList = new Map();
  for (const edge of taskGraph.edges) {
    const deps = adjacencyList.get(edge.dependentTaskId) ?? new Set<string>();
    deps.add(edge.prerequisiteTaskId);
    adjacencyList.set(edge.dependentTaskId, deps);
  }

  // -----------------------------------------------------------------------
  // Step 5: Build task status map for recommended order computation
  // -----------------------------------------------------------------------
  const taskStatuses = new Map<string, TaskOrderInfo>();
  for (const task of storyTasks) {
    taskStatuses.set(task.id, {
      id: task.id,
      status: mapTaskStatusToDomain(task.workStatus),
    });
  }

  // -----------------------------------------------------------------------
  // Step 6: Compute recommended task execution order
  // -----------------------------------------------------------------------
  const recommendedOrder = computeRecommendedTaskOrder(
    storyTaskIds,
    taskStatuses,
    adjacencyList,
  );

  // -----------------------------------------------------------------------
  // Step 7: Load personas for all tasks that have a personaId
  // -----------------------------------------------------------------------
  const personaIds = [
    ...new Set(
      storyTasks
        .map((t) => t.personaId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const personaMap = new Map<string, { id: string; name: string; systemPrompt: string }>();

  for (const personaId of personaIds) {
    const persona = await personaRepo.findById(tenantId, personaId);
    if (persona) {
      personaMap.set(personaId, {
        id: persona.id,
        name: persona.name,
        systemPrompt: persona.systemPrompt,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Step 8: Build dependency details for each story task
  //
  // Dependencies include both intra-story tasks and cross-story (external)
  // tasks. External dependencies are resolved from the full project task
  // graph so workers can see the status of blocking tasks in other stories.
  // -----------------------------------------------------------------------
  const dependencyMap = new Map<
    string,
    Array<{ id: string; name: string; status: string }>
  >();
  for (const task of storyTasks) {
    const deps = adjacencyList.get(task.id) ?? new Set<string>();
    const depDetails: Array<{ id: string; name: string; status: string }> = [];
    for (const depId of deps) {
      // Resolve from the full project task graph (covers both intra- and cross-story deps)
      const depTask = taskGraph.tasks.find((t) => t.id === depId);
      if (depTask) {
        depDetails.push({
          id: depTask.id,
          name: depTask.title,
          status: depTask.workStatus,
        });
      }
    }
    dependencyMap.set(task.id, depDetails);
  }

  // -----------------------------------------------------------------------
  // Step 9: Assemble the task detail array
  // -----------------------------------------------------------------------
  const tasks: AssignedTaskDetail[] = storyTasks.map((task) => {
    const persona = task.personaId ? personaMap.get(task.personaId) ?? null : null;
    const deps = dependencyMap.get(task.id) ?? [];
    const refs = Array.isArray(task.references)
      ? (task.references as Array<{ type: string; url: string; title: string }>).map(
          (ref) => ref.url,
        )
      : [];

    return {
      id: task.id,
      name: task.title,
      description: task.description,
      persona: persona
        ? {
            id: persona.id,
            name: persona.name,
            system_prompt: persona.systemPrompt,
          }
        : null,
      acceptance_criteria: Array.isArray(task.acceptanceCriteria)
        ? task.acceptanceCriteria
        : [],
      technical_notes: task.technicalNotes,
      references: refs,
      dependencies: deps,
      status: task.workStatus,
    };
  });

  // -----------------------------------------------------------------------
  // Step 10: Return the assembled story detail payload
  // -----------------------------------------------------------------------
  return {
    id: story.id,
    name: story.title,
    description: story.description,
    priority: story.priority,
    epic: {
      id: epicRecord.id as string,
      name: epicRecord.name as string,
    },
    tasks,
    recommended_task_order: recommendedOrder.orderedTasks,
  };
}

/**
 * Builds the "blocked" response with information about blocking stories.
 *
 * For v1, we include basic blocking information and a default retry-after
 * hint. This can be enhanced later with more detailed blocking analysis.
 *
 * @param blockingInfos - Array of stories causing the block
 * @returns A typed `AssignResponse` with `type: 'blocked'`
 */
export function buildBlockedResponse(
  blockingInfos: BlockingStoryInfo[],
): AssignResponse {
  return {
    type: 'blocked',
    blocking_stories: blockingInfos,
    retry_after_seconds: DEFAULT_RETRY_AFTER_SECONDS,
  };
}

/**
 * Builds the "all_complete" response with project summary.
 *
 * @param project        - The project summary (id and name)
 * @param completedCount - Number of completed stories
 * @param totalCount     - Total number of stories in the project
 * @returns A typed `AssignResponse` with `type: 'all_complete'`
 */
export function buildAllCompleteResponse(
  project: { id: string; name: string },
  completedCount: number,
  totalCount: number,
): AssignResponse {
  return {
    type: 'all_complete',
    project: {
      id: project.id,
      name: project.name,
    },
    completed_stories: completedCount,
    total_stories: totalCount,
  };
}

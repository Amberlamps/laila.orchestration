// Derive user-story-level and epic-level dependency graphs
// from the task-level DAG. Dependencies roll up: if any task
// in Story A depends on a task in Story B, Story A depends on Story B.
import type { AdjacencyList, DagEdge } from './types';

/**
 * Mapping from a task ID to its parent container (story or epic).
 */
export interface TaskGrouping {
  taskId: string;
  userStoryId: string;
  epicId: string;
}

/**
 * Derived dependency graph at a higher level (story or epic).
 * Uses the same adjacency list structure as the task DAG.
 */
export interface DerivedDependencyGraph {
  adjacencyList: AdjacencyList;
  // The edges that caused each derived dependency.
  // Useful for explaining "why does Story A depend on Story B?"
  edgeProvenance: Map<string, DagEdge[]>;
}

/**
 * Derive user-story-level dependencies from the task-level DAG.
 *
 * Algorithm:
 * 1. For each task-level dependency edge (A depends on B):
 *    a. Look up Story(A) and Story(B)
 *    b. If Story(A) !== Story(B), add Story(A) depends on Story(B)
 * 2. Deduplicate: multiple task edges between the same two stories
 *    produce only one story-level dependency.
 *
 * The edgeProvenance map tracks which task-level edges caused each
 * derived dependency, enabling "why?" explanations in the UI.
 *
 * @param taskAdjacencyList - The task-level DAG
 * @param taskGroupings - Mapping from task IDs to their parent story/epic
 * @returns Derived story-level dependency graph
 */
export const deriveStoryDependencies = (
  taskAdjacencyList: AdjacencyList,
  taskGroupings: Map<string, TaskGrouping>,
): DerivedDependencyGraph => {
  const storyAdjacencyList: AdjacencyList = new Map();
  const edgeProvenance = new Map<string, DagEdge[]>();

  for (const [taskFrom, taskDeps] of taskAdjacencyList) {
    const fromGrouping = taskGroupings.get(taskFrom);
    if (!fromGrouping) continue;

    for (const taskTo of taskDeps) {
      const toGrouping = taskGroupings.get(taskTo);
      if (!toGrouping) continue;

      // Only create a story dependency for cross-story edges.
      // Intra-story edges don't create story-level dependencies.
      if (fromGrouping.userStoryId === toGrouping.userStoryId) continue;

      const storyFrom = fromGrouping.userStoryId;
      const storyTo = toGrouping.userStoryId;

      // Add the story-level edge (storyFrom depends on storyTo).
      const existingStoryDeps = storyAdjacencyList.get(storyFrom);
      if (existingStoryDeps) {
        existingStoryDeps.add(storyTo);
      } else {
        storyAdjacencyList.set(storyFrom, new Set([storyTo]));
      }

      // Track provenance: which task edge caused this story dependency.
      const provenanceKey = `${storyFrom}->${storyTo}`;
      const existingProvenance = edgeProvenance.get(provenanceKey);
      if (existingProvenance) {
        existingProvenance.push({ from: taskFrom, to: taskTo });
      } else {
        edgeProvenance.set(provenanceKey, [{ from: taskFrom, to: taskTo }]);
      }
    }
  }

  return { adjacencyList: storyAdjacencyList, edgeProvenance };
};

/**
 * Derive epic-level dependencies from the story-level dependency graph.
 *
 * Same roll-up logic: if any story in Epic X depends on a story
 * in Epic Y, then Epic X depends on Epic Y.
 *
 * @param storyAdjacencyList - The derived story-level dependency graph
 * @param storyToEpic - Mapping from story IDs to their parent epic IDs
 * @returns Derived epic-level dependency graph
 */
export const deriveEpicDependencies = (
  storyAdjacencyList: AdjacencyList,
  storyToEpic: Map<string, string>,
): DerivedDependencyGraph => {
  const epicAdjacencyList: AdjacencyList = new Map();
  const edgeProvenance = new Map<string, DagEdge[]>();

  for (const [storyFrom, storyDeps] of storyAdjacencyList) {
    const epicFrom = storyToEpic.get(storyFrom);
    if (!epicFrom) continue;

    for (const storyTo of storyDeps) {
      const epicTo = storyToEpic.get(storyTo);
      if (!epicTo) continue;

      // Only create an epic dependency for cross-epic edges.
      if (epicFrom === epicTo) continue;

      const existingEpicDeps = epicAdjacencyList.get(epicFrom);
      if (existingEpicDeps) {
        existingEpicDeps.add(epicTo);
      } else {
        epicAdjacencyList.set(epicFrom, new Set([epicTo]));
      }

      // Track provenance: which story edge caused this epic dependency.
      const provenanceKey = `${epicFrom}->${epicTo}`;
      const existingProvenance = edgeProvenance.get(provenanceKey);
      if (existingProvenance) {
        existingProvenance.push({ from: storyFrom, to: storyTo });
      } else {
        edgeProvenance.set(provenanceKey, [{ from: storyFrom, to: storyTo }]);
      }
    }
  }

  return { adjacencyList: epicAdjacencyList, edgeProvenance };
};

/**
 * Compute the full derived dependency chain: task -> story -> epic.
 * Convenience function that runs both derivations in sequence.
 *
 * @param taskAdjacencyList - The task-level DAG
 * @param taskGroupings - Mapping from task IDs to their parent story/epic
 * @returns Both story-level and epic-level derived dependency graphs
 */
export const deriveAllDependencies = (
  taskAdjacencyList: AdjacencyList,
  taskGroupings: Map<string, TaskGrouping>,
): {
  storyDependencies: DerivedDependencyGraph;
  epicDependencies: DerivedDependencyGraph;
} => {
  const storyDependencies = deriveStoryDependencies(taskAdjacencyList, taskGroupings);

  // Build story-to-epic mapping from the task groupings.
  const storyToEpic = new Map<string, string>();
  for (const grouping of taskGroupings.values()) {
    storyToEpic.set(grouping.userStoryId, grouping.epicId);
  }

  const epicDependencies = deriveEpicDependencies(storyDependencies.adjacencyList, storyToEpic);

  return { storyDependencies, epicDependencies };
};

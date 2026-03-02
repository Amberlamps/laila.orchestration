// Custom fast-check arbitraries for generating random DAG structures.
// Used across all property-based test files.
// Generates valid acyclic directed graphs by filtering proposed edges
// through cycle detection to guarantee acyclicity.

import * as fc from 'fast-check';

import { buildAdjacencyList, detectCycle } from '../../dag/cycle-detection';
import { deriveStoryDependencies } from '../../dag/derived-dependencies';

import type { TaskGrouping } from '../../dag/derived-dependencies';
import type { DagEdge } from '../../dag/types';

/**
 * Arbitrary that generates a single DAG edge between random nodes.
 * Node IDs are strings of the form "node-0" through "node-(maxNodes-1)".
 */
export const dagEdgeArbitrary = (maxNodes: number): fc.Arbitrary<DagEdge> =>
  fc.record({
    from: fc.integer({ min: 0, max: maxNodes - 1 }).map((n) => `node-${String(n)}`),
    to: fc.integer({ min: 0, max: maxNodes - 1 }).map((n) => `node-${String(n)}`),
  });

/**
 * Result of a random DAG generation.
 * Contains the accepted acyclic edges and the set of all node IDs.
 */
export interface RandomDagResult {
  edges: DagEdge[];
  allNodeIds: string[];
}

/**
 * Generate a random acyclic directed graph.
 *
 * Strategy: generates random edge proposals using dagEdgeArbitrary,
 * then filters each through cycle detection to guarantee acyclicity.
 * Self-loops and cycle-forming edges are rejected.
 *
 * Also generates isolated nodes (nodes not referenced by any edge)
 * to exercise disconnected graph scenarios.
 *
 * @param maxNodes - Maximum number of distinct node IDs
 * @param maxEdges - Maximum number of proposed edges (actual accepted edges may be fewer)
 * @returns Arbitrary producing a valid acyclic graph with all node IDs
 */
export const generateRandomDag = (
  maxNodes: number,
  maxEdges: number,
): fc.Arbitrary<RandomDagResult> =>
  fc
    .record({
      nodeCount: fc.integer({ min: 1, max: maxNodes }),
      proposedEdges: fc.array(dagEdgeArbitrary(maxNodes), {
        minLength: 0,
        maxLength: maxEdges,
      }),
    })
    .map(({ nodeCount, proposedEdges }) => {
      // Build the set of all node IDs (including isolated nodes).
      const allNodeIds: string[] = [];
      for (let i = 0; i < nodeCount; i++) {
        allNodeIds.push(`node-${String(i)}`);
      }

      // Filter proposed edges through cycle detection.
      const acceptedEdges: DagEdge[] = [];
      let adjacencyList = buildAdjacencyList([]);

      for (const edge of proposedEdges) {
        // Skip edges referencing nodes outside the node range.
        const fromIndex = parseInt(edge.from.replace('node-', ''), 10);
        const toIndex = parseInt(edge.to.replace('node-', ''), 10);
        if (fromIndex >= nodeCount || toIndex >= nodeCount) continue;

        const result = detectCycle(adjacencyList, edge);
        if (!result.hasCycle) {
          acceptedEdges.push(edge);
          adjacencyList = buildAdjacencyList(acceptedEdges);
        }
      }

      return { edges: acceptedEdges, allNodeIds };
    });

/**
 * Simple cycle check for derived (story/epic level) adjacency lists.
 * Uses DFS to detect back edges. Returns true if a cycle is found.
 * This is used during generation to filter out edges that would
 * create cycles at higher abstraction levels.
 */
const detectCycleInDerived = (adjacencyList: Map<string, Set<string>>): boolean => {
  const visited = new Set<string>();
  const inStack = new Set<string>();

  const allNodes = new Set<string>();
  for (const [node, deps] of adjacencyList) {
    allNodes.add(node);
    for (const dep of deps) {
      allNodes.add(dep);
    }
  }

  const dfs = (node: string): boolean => {
    if (inStack.has(node)) return true;
    if (visited.has(node)) return false;

    visited.add(node);
    inStack.add(node);

    const neighbors = adjacencyList.get(node);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (dfs(neighbor)) return true;
      }
    }

    inStack.delete(node);
    return false;
  };

  for (const node of allNodes) {
    if (!visited.has(node)) {
      if (dfs(node)) return true;
    }
  }

  return false;
};

/**
 * Result of a random task grouping generation.
 * Contains the task-level DAG, the groupings, and metadata about
 * stories and epics for derived dependency testing.
 */
export interface RandomTaskGroupingResult {
  edges: DagEdge[];
  allTaskIds: string[];
  taskGroupings: Map<string, TaskGrouping>;
  storyIds: string[];
  epicIds: string[];
}

/**
 * Generate a random acyclic task graph with story and epic groupings.
 *
 * Creates a set of tasks distributed across stories and epics,
 * then generates acyclic edges between them. This models the
 * real-world scenario where tasks belong to stories, stories
 * belong to epics, and tasks can have cross-story dependencies.
 *
 * @param maxTasks - Maximum number of tasks
 * @param maxStories - Maximum number of stories
 * @param maxEpics - Maximum number of epics
 * @param maxEdges - Maximum number of proposed edges
 * @returns Arbitrary producing a valid task graph with groupings
 */
export const generateRandomTaskGrouping = (
  maxTasks: number,
  maxStories: number,
  maxEpics: number,
  maxEdges: number,
): fc.Arbitrary<RandomTaskGroupingResult> =>
  fc
    .record({
      taskCount: fc.integer({ min: 1, max: maxTasks }),
      storyCount: fc.integer({ min: 1, max: maxStories }),
      epicCount: fc.integer({ min: 1, max: maxEpics }),
      // Assignment of tasks to stories (index into story array).
      taskStoryAssignments: fc.array(fc.integer({ min: 0, max: maxStories - 1 }), {
        minLength: maxTasks,
        maxLength: maxTasks,
      }),
      // Assignment of stories to epics (index into epic array).
      storyEpicAssignments: fc.array(fc.integer({ min: 0, max: maxEpics - 1 }), {
        minLength: maxStories,
        maxLength: maxStories,
      }),
      proposedEdges: fc.array(
        fc.record({
          from: fc.integer({ min: 0, max: maxTasks - 1 }),
          to: fc.integer({ min: 0, max: maxTasks - 1 }),
        }),
        { minLength: 0, maxLength: maxEdges },
      ),
    })
    .map(
      ({
        taskCount,
        storyCount,
        epicCount,
        taskStoryAssignments,
        storyEpicAssignments,
        proposedEdges,
      }) => {
        // Generate IDs.
        const allTaskIds: string[] = [];
        for (let i = 0; i < taskCount; i++) {
          allTaskIds.push(`task-${String(i)}`);
        }

        const storyIds: string[] = [];
        for (let i = 0; i < storyCount; i++) {
          storyIds.push(`story-${String(i)}`);
        }

        const epicIds: string[] = [];
        for (let i = 0; i < epicCount; i++) {
          epicIds.push(`epic-${String(i)}`);
        }

        // Assign tasks to stories (clamped to valid range).
        const taskGroupings = new Map<string, TaskGrouping>();
        for (let i = 0; i < taskCount; i++) {
          const taskStoryAssignment = taskStoryAssignments[i];
          if (taskStoryAssignment === undefined) continue;
          const storyIndex = taskStoryAssignment % storyCount;
          const storyId = storyIds[storyIndex];
          if (storyId === undefined) continue;
          const storyEpicAssignment = storyEpicAssignments[storyIndex];
          if (storyEpicAssignment === undefined) continue;
          const epicIndex = storyEpicAssignment % epicCount;
          const epicId = epicIds[epicIndex];
          if (epicId === undefined) continue;
          const taskId = allTaskIds[i];
          if (taskId === undefined) continue;

          taskGroupings.set(taskId, {
            taskId: taskId,
            userStoryId: storyId,
            epicId: epicId,
          });
        }

        // Generate acyclic task edges that also produce acyclic story
        // and epic graphs. Each proposed edge is checked at three levels:
        // 1. Task-level acyclicity (standard DAG check)
        // 2. Story-level acyclicity (derived dependency check)
        // 3. Epic-level acyclicity (derived dependency check)
        const edges: DagEdge[] = [];
        let adjacencyList = buildAdjacencyList([]);

        for (const proposed of proposedEdges) {
          const fromIndex = proposed.from % taskCount;
          const toIndex = proposed.to % taskCount;
          const edge: DagEdge = {
            from: `task-${String(fromIndex)}`,
            to: `task-${String(toIndex)}`,
          };

          // Check task-level acyclicity.
          const result = detectCycle(adjacencyList, edge);
          if (!result.hasCycle) {
            // Tentatively add the edge and check story-level acyclicity.
            const tentativeEdges = [...edges, edge];
            const tentativeAdj = buildAdjacencyList(tentativeEdges);
            const storyGraph = deriveStoryDependencies(tentativeAdj, taskGroupings);

            // Check story-level acyclicity.
            const storyCheck = detectCycleInDerived(storyGraph.adjacencyList);
            if (!storyCheck) {
              // Check epic-level acyclicity.
              const storyToEpicMap = new Map<string, string>();
              for (const grouping of taskGroupings.values()) {
                storyToEpicMap.set(grouping.userStoryId, grouping.epicId);
              }

              // Build epic adjacency list from story adjacency list.
              const epicAdj: Map<string, Set<string>> = new Map();
              for (const [sFrom, sDeps] of storyGraph.adjacencyList) {
                const eFrom = storyToEpicMap.get(sFrom);
                if (!eFrom) continue;
                for (const sTo of sDeps) {
                  const eTo = storyToEpicMap.get(sTo);
                  if (!eTo || eFrom === eTo) continue;
                  const existingEpicDeps = epicAdj.get(eFrom);
                  if (existingEpicDeps) {
                    existingEpicDeps.add(eTo);
                  } else {
                    epicAdj.set(eFrom, new Set([eTo]));
                  }
                }
              }

              const epicCheck = detectCycleInDerived(epicAdj);
              if (!epicCheck) {
                edges.push(edge);
                adjacencyList = tentativeAdj;
              }
            }
          }
        }

        return { edges, allTaskIds, taskGroupings, storyIds, epicIds };
      },
    );

/**
 * Generate a random set of edges where all tasks belong to the same story.
 * Used to test the property that intra-story edges never produce
 * story-level dependencies.
 *
 * @param maxTasks - Maximum number of tasks in the story
 * @param maxEdges - Maximum number of proposed edges
 * @returns Arbitrary producing intra-story task edges with groupings
 */
export const generateIntraStoryEdges = (
  maxTasks: number,
  maxEdges: number,
): fc.Arbitrary<{
  edges: DagEdge[];
  taskGroupings: Map<string, TaskGrouping>;
}> =>
  fc
    .record({
      taskCount: fc.integer({ min: 2, max: maxTasks }),
      proposedEdges: fc.array(
        fc.record({
          from: fc.integer({ min: 0, max: maxTasks - 1 }),
          to: fc.integer({ min: 0, max: maxTasks - 1 }),
        }),
        { minLength: 1, maxLength: maxEdges },
      ),
    })
    .map(({ taskCount, proposedEdges }) => {
      const singleStoryId = 'story-0';
      const singleEpicId = 'epic-0';

      const taskGroupings = new Map<string, TaskGrouping>();
      for (let i = 0; i < taskCount; i++) {
        const id = `task-${String(i)}`;
        taskGroupings.set(id, {
          taskId: id,
          userStoryId: singleStoryId,
          epicId: singleEpicId,
        });
      }

      // Generate acyclic edges.
      const edges: DagEdge[] = [];
      let adjacencyList = buildAdjacencyList([]);

      for (const proposed of proposedEdges) {
        const fromIndex = proposed.from % taskCount;
        const toIndex = proposed.to % taskCount;
        const edge: DagEdge = {
          from: `task-${String(fromIndex)}`,
          to: `task-${String(toIndex)}`,
        };

        const result = detectCycle(adjacencyList, edge);
        if (!result.hasCycle) {
          edges.push(edge);
          adjacencyList = buildAdjacencyList(edges);
        }
      }

      return { edges, taskGroupings };
    });

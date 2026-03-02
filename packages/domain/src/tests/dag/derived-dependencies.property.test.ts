// Property-based tests for derived dependency computation.
// Verifies that derived story and epic graphs maintain acyclicity,
// that provenance is tracked correctly, and that intra-story edges
// never produce story-level dependencies.

import * as fc from 'fast-check';
import { describe, it } from 'vitest';

import { buildAdjacencyList, validateAcyclicity } from '../../dag/cycle-detection';
import { deriveStoryDependencies, deriveEpicDependencies } from '../../dag/derived-dependencies';

import { generateRandomTaskGrouping, generateIntraStoryEdges } from './arbitraries';

describe('Derived Dependencies -- Property-Based Tests', () => {
  it('PROPERTY: derived story graph is acyclic if task graph is acyclic', () => {
    fc.assert(
      fc.property(generateRandomTaskGrouping(15, 5, 3, 30), ({ edges, taskGroupings }) => {
        const taskAdjacencyList = buildAdjacencyList(edges);
        const storyGraph = deriveStoryDependencies(taskAdjacencyList, taskGroupings);

        // The task graph is guaranteed acyclic by the generator.
        // The derived story graph must also be acyclic.
        const validation = validateAcyclicity(storyGraph.adjacencyList);
        return !validation.hasCycle;
      }),
      { numRuns: 1000 },
    );
  });

  it('PROPERTY: derived epic graph is acyclic if story graph is acyclic', () => {
    fc.assert(
      fc.property(generateRandomTaskGrouping(15, 5, 3, 30), ({ edges, taskGroupings }) => {
        const taskAdjacencyList = buildAdjacencyList(edges);
        const storyGraph = deriveStoryDependencies(taskAdjacencyList, taskGroupings);

        // Build story-to-epic mapping from groupings.
        const storyToEpic = new Map<string, string>();
        for (const grouping of taskGroupings.values()) {
          storyToEpic.set(grouping.userStoryId, grouping.epicId);
        }

        const epicGraph = deriveEpicDependencies(storyGraph.adjacencyList, storyToEpic);

        // The derived epic graph must also be acyclic.
        const validation = validateAcyclicity(epicGraph.adjacencyList);
        return !validation.hasCycle;
      }),
      { numRuns: 1000 },
    );
  });

  it('PROPERTY: every derived story edge has at least one provenance edge', () => {
    fc.assert(
      fc.property(generateRandomTaskGrouping(15, 5, 3, 30), ({ edges, taskGroupings }) => {
        const taskAdjacencyList = buildAdjacencyList(edges);
        const storyGraph = deriveStoryDependencies(taskAdjacencyList, taskGroupings);

        // For every edge in the derived story adjacency list,
        // there must be a corresponding provenance entry.
        for (const [storyFrom, storyDeps] of storyGraph.adjacencyList) {
          for (const storyTo of storyDeps) {
            const provenanceKey = `${storyFrom}->${storyTo}`;
            const provenance = storyGraph.edgeProvenance.get(provenanceKey);

            // Provenance must exist and have at least one task-level edge.
            if (!provenance || provenance.length === 0) return false;

            // Each provenance edge must be a valid task-level edge.
            for (const taskEdge of provenance) {
              if (!taskEdge.from || !taskEdge.to) return false;
            }
          }
        }

        return true;
      }),
      { numRuns: 1000 },
    );
  });

  it('PROPERTY: intra-story task edges never produce story-level dependencies', () => {
    fc.assert(
      fc.property(generateIntraStoryEdges(10, 20), ({ edges, taskGroupings }) => {
        const taskAdjacencyList = buildAdjacencyList(edges);
        const storyGraph = deriveStoryDependencies(taskAdjacencyList, taskGroupings);

        // All tasks belong to the same story, so no story-level
        // dependencies should be produced.
        return storyGraph.adjacencyList.size === 0;
      }),
    );
  });

  it('PROPERTY: provenance edges reference tasks from the correct stories', () => {
    fc.assert(
      fc.property(generateRandomTaskGrouping(12, 4, 2, 25), ({ edges, taskGroupings }) => {
        const taskAdjacencyList = buildAdjacencyList(edges);
        const storyGraph = deriveStoryDependencies(taskAdjacencyList, taskGroupings);

        for (const [storyFrom, storyDeps] of storyGraph.adjacencyList) {
          for (const storyTo of storyDeps) {
            const provenanceKey = `${storyFrom}->${storyTo}`;
            const provenance = storyGraph.edgeProvenance.get(provenanceKey);

            if (!provenance) return false;

            for (const taskEdge of provenance) {
              const fromGrouping = taskGroupings.get(taskEdge.from);
              const toGrouping = taskGroupings.get(taskEdge.to);

              if (!fromGrouping || !toGrouping) return false;

              // The task's story must match the story-level edge.
              if (fromGrouping.userStoryId !== storyFrom) return false;
              if (toGrouping.userStoryId !== storyTo) return false;
            }
          }
        }

        return true;
      }),
    );
  });

  it('PROPERTY: derived epic edges have provenance from different epics', () => {
    fc.assert(
      fc.property(generateRandomTaskGrouping(12, 4, 3, 25), ({ edges, taskGroupings }) => {
        const taskAdjacencyList = buildAdjacencyList(edges);
        const storyGraph = deriveStoryDependencies(taskAdjacencyList, taskGroupings);

        const storyToEpic = new Map<string, string>();
        for (const grouping of taskGroupings.values()) {
          storyToEpic.set(grouping.userStoryId, grouping.epicId);
        }

        const epicGraph = deriveEpicDependencies(storyGraph.adjacencyList, storyToEpic);

        // Every epic-level edge must connect different epics.
        for (const [epicFrom, epicDeps] of epicGraph.adjacencyList) {
          for (const epicTo of epicDeps) {
            if (epicFrom === epicTo) return false;
          }
        }

        return true;
      }),
    );
  });

  it('PROPERTY: no story-level self-loops in derived dependencies', () => {
    fc.assert(
      fc.property(generateRandomTaskGrouping(15, 5, 3, 30), ({ edges, taskGroupings }) => {
        const taskAdjacencyList = buildAdjacencyList(edges);
        const storyGraph = deriveStoryDependencies(taskAdjacencyList, taskGroupings);

        // No story should depend on itself.
        for (const [storyFrom, storyDeps] of storyGraph.adjacencyList) {
          if (storyDeps.has(storyFrom)) return false;
        }

        return true;
      }),
    );
  });
});

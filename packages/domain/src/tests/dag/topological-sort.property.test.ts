// Property-based tests for topological sort.
// Verifies ordering validity, completeness, and determinism
// across thousands of randomly generated acyclic graphs.

import * as fc from 'fast-check';
import { describe, it } from 'vitest';

import { buildAdjacencyList } from '../../dag/cycle-detection';
import { topologicalSort } from '../../dag/topological-sort';

import { generateRandomDag } from './arbitraries';

describe('Topological Sort -- Property-Based Tests', () => {
  it('PROPERTY: every dependency appears before its dependent in the sorted output', () => {
    fc.assert(
      fc.property(generateRandomDag(20, 50), ({ edges, allNodeIds }) => {
        const adjacencyList = buildAdjacencyList(edges);
        const result = topologicalSort(adjacencyList, allNodeIds);

        if (!result.success) return false;

        const positionMap = new Map<string, number>(result.sorted.map((id, index) => [id, index]));

        for (const edge of edges) {
          const fromPos = positionMap.get(edge.from);
          const toPos = positionMap.get(edge.to);
          // Both nodes must be present in the output.
          if (fromPos === undefined || toPos === undefined) return false;
          // `to` (dependency) must come before `from` (dependent).
          if (toPos >= fromPos) return false;
        }

        return true;
      }),
      { numRuns: 1000 },
    );
  });

  it('PROPERTY: all input nodes appear exactly once in the sorted output', () => {
    fc.assert(
      fc.property(generateRandomDag(20, 50), ({ edges, allNodeIds }) => {
        const adjacencyList = buildAdjacencyList(edges);
        const result = topologicalSort(adjacencyList, allNodeIds);

        if (!result.success) return false;

        return (
          result.sorted.length === allNodeIds.length &&
          new Set(result.sorted).size === allNodeIds.length
        );
      }),
    );
  });

  it('PROPERTY: topological sort is deterministic (same input produces same output)', () => {
    fc.assert(
      fc.property(generateRandomDag(15, 30), ({ edges, allNodeIds }) => {
        const adjacencyList = buildAdjacencyList(edges);
        const result1 = topologicalSort(adjacencyList, allNodeIds);
        const result2 = topologicalSort(adjacencyList, allNodeIds);

        if (!result1.success || !result2.success) return false;

        return JSON.stringify(result1.sorted) === JSON.stringify(result2.sorted);
      }),
    );
  });

  it('PROPERTY: topological sort succeeds for all acyclic graphs', () => {
    fc.assert(
      fc.property(generateRandomDag(20, 40), ({ edges, allNodeIds }) => {
        const adjacencyList = buildAdjacencyList(edges);
        const result = topologicalSort(adjacencyList, allNodeIds);
        // The generator guarantees acyclicity, so sort must succeed.
        return result.success;
      }),
      { numRuns: 1000 },
    );
  });

  it('PROPERTY: isolated nodes appear in the sorted output', () => {
    fc.assert(
      fc.property(generateRandomDag(10, 5), ({ edges, allNodeIds }) => {
        const adjacencyList = buildAdjacencyList(edges);
        const result = topologicalSort(adjacencyList, allNodeIds);

        if (!result.success) return false;

        // Every node in allNodeIds must appear in sorted output.
        const sortedSet = new Set(result.sorted);
        for (const nodeId of allNodeIds) {
          if (!sortedSet.has(nodeId)) return false;
        }

        return true;
      }),
    );
  });

  it('PROPERTY: single-node graph sorts to a single element', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 20 }), (nodeId: string) => {
        const adjacencyList = buildAdjacencyList([]);
        const result = topologicalSort(adjacencyList, [nodeId]);

        if (!result.success) return false;

        return result.sorted.length === 1 && result.sorted[0] === nodeId;
      }),
    );
  });
});

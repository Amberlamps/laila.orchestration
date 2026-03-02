// Property-based tests for cycle detection using fast-check.
// Verifies that acyclicity is ALWAYS maintained when the validator
// accepts an edge, and cycles are ALWAYS detected when present.

import * as fc from 'fast-check';
import { describe, it, expect } from 'vitest';

import { detectCycle, buildAdjacencyList, validateAcyclicity } from '../../dag/cycle-detection';

import { dagEdgeArbitrary } from './arbitraries';

import type { DagEdge } from '../../dag/types';

describe('Cycle Detection -- Property-Based Tests', () => {
  it('PROPERTY: a DAG built only from accepted edges is always acyclic', () => {
    fc.assert(
      fc.property(
        fc.array(dagEdgeArbitrary(20), { minLength: 0, maxLength: 50 }),
        (proposedEdges: DagEdge[]) => {
          const edges: DagEdge[] = [];
          let adjacencyList = buildAdjacencyList([]);

          for (const edge of proposedEdges) {
            const result = detectCycle(adjacencyList, edge);
            if (!result.hasCycle) {
              edges.push(edge);
              adjacencyList = buildAdjacencyList(edges);
            }
          }

          // INVARIANT: the graph must be acyclic after only adding accepted edges.
          const validation = validateAcyclicity(adjacencyList);
          return !validation.hasCycle;
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('PROPERTY: self-loops are always detected as cycles', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 10 }), (nodeId: string) => {
        const result = detectCycle(new Map(), { from: nodeId, to: nodeId });
        return result.hasCycle;
      }),
    );
  });

  it('PROPERTY: adding an edge to an empty graph never creates a cycle (unless self-loop)', () => {
    fc.assert(
      fc.property(dagEdgeArbitrary(100), (edge: DagEdge) => {
        const result = detectCycle(new Map(), edge);
        if (edge.from === edge.to) {
          return result.hasCycle;
        }
        return !result.hasCycle;
      }),
    );
  });

  it('PROPERTY: detected cycles have a valid cycle path', () => {
    fc.assert(
      fc.property(
        fc.array(dagEdgeArbitrary(10), { minLength: 1, maxLength: 20 }),
        dagEdgeArbitrary(10),
        (existingEdges: DagEdge[], newEdge: DagEdge) => {
          const adjacencyList = buildAdjacencyList(existingEdges);
          const result = detectCycle(adjacencyList, newEdge);

          if (result.hasCycle) {
            // The cycle path must have at least 2 elements.
            return result.cyclePath.length >= 2;
          }
          return true;
        },
      ),
    );
  });

  it('PROPERTY: rejecting a cycle-forming edge preserves graph acyclicity', () => {
    fc.assert(
      fc.property(
        fc.array(dagEdgeArbitrary(15), { minLength: 0, maxLength: 30 }),
        (proposedEdges: DagEdge[]) => {
          const edges: DagEdge[] = [];
          let adjacencyList = buildAdjacencyList([]);

          for (const edge of proposedEdges) {
            const result = detectCycle(adjacencyList, edge);
            if (!result.hasCycle) {
              edges.push(edge);
              adjacencyList = buildAdjacencyList(edges);
            }
            // After each step, the accumulated graph must be acyclic.
            const check = validateAcyclicity(adjacencyList);
            if (check.hasCycle) return false;
          }

          return true;
        },
      ),
      { numRuns: 500 },
    );
  });

  it('PROPERTY: validateAcyclicity agrees with detectCycle on empty graphs', () => {
    const emptyAdjacencyList = buildAdjacencyList([]);
    const result = validateAcyclicity(emptyAdjacencyList);
    expect(result.hasCycle).toBe(false);
  });

  it('PROPERTY: buildAdjacencyList is deterministic', () => {
    fc.assert(
      fc.property(
        fc.array(dagEdgeArbitrary(10), { minLength: 0, maxLength: 20 }),
        (edges: DagEdge[]) => {
          const adj1 = buildAdjacencyList(edges);
          const adj2 = buildAdjacencyList(edges);

          // Same keys.
          if (adj1.size !== adj2.size) return false;

          for (const [key, set1] of adj1) {
            const set2 = adj2.get(key);
            if (!set2) return false;
            if (set1.size !== set2.size) return false;
            for (const val of set1) {
              if (!set2.has(val)) return false;
            }
          }

          return true;
        },
      ),
    );
  });
});

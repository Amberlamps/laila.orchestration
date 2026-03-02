# Write DAG Property-Based Tests

## Task Details

- **Title:** Write DAG Property-Based Tests
- **Status:** Not Started
- **Assigned Agent:** qa-expert
- **Parent User Story:** [Implement DAG Operations](./tasks.md)
- **Parent Epic:** [Domain Logic Engine](../../user-stories.md)
- **Dependencies:** Implement Cycle Detection, Implement Topological Sort, Implement Dependency Validation, Implement Derived Dependency Computation

## Description

Write property-based tests using `fast-check` for all DAG operations. Property-based testing is **mandatory** for this safety-critical code because it generates thousands of random test cases that exercise edge cases a human tester would not think to write.

Unlike example-based tests that verify specific inputs produce specific outputs, property-based tests verify that certain invariants (properties) hold for ALL possible inputs. This is essential for graph algorithms where the input space is vast and edge cases are subtle.

### Properties to Test

#### 1. Cycle Detection Properties

```typescript
// packages/domain/src/tests/dag/cycle-detection.property.test.ts
// Property-based tests for cycle detection using fast-check.
// Verifies that acyclicity is ALWAYS maintained when the validator
// accepts an edge, and cycles are ALWAYS detected when present.
import { describe, it } from "vitest";
import * as fc from "fast-check";
import { detectCycle, buildAdjacencyList, validateAcyclicity } from "@/dag/cycle-detection";
import type { DagEdge } from "@/dag/types";

// Custom fast-check arbitrary that generates valid DAG edges.
// Generates node IDs as strings "node-0" through "node-N".
const dagEdgeArbitrary = (maxNodes: number): fc.Arbitrary<DagEdge> =>
  fc.record({
    from: fc.integer({ min: 0, max: maxNodes - 1 }).map((n) => `node-${n}`),
    to: fc.integer({ min: 0, max: maxNodes - 1 }).map((n) => `node-${n}`),
  });

describe("Cycle Detection — Property-Based Tests", () => {
  it("PROPERTY: a DAG built only from accepted edges is always acyclic", () => {
    // Generate a sequence of random edges.
    // For each edge, run detectCycle. If accepted, add to graph.
    // After all edges, validate the entire graph is acyclic.
    fc.assert(
      fc.property(
        fc.array(dagEdgeArbitrary(20), { minLength: 0, maxLength: 50 }),
        (proposedEdges) => {
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
        }
      ),
      { numRuns: 1000 }
    );
  });

  it("PROPERTY: self-loops are always detected as cycles", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }),
        (nodeId) => {
          const result = detectCycle(new Map(), { from: nodeId, to: nodeId });
          return result.hasCycle === true;
        }
      )
    );
  });

  it("PROPERTY: adding an edge to an empty graph never creates a cycle (unless self-loop)", () => {
    fc.assert(
      fc.property(
        dagEdgeArbitrary(100),
        (edge) => {
          const result = detectCycle(new Map(), edge);
          if (edge.from === edge.to) {
            return result.hasCycle === true;
          }
          return result.hasCycle === false;
        }
      )
    );
  });

  it("PROPERTY: detected cycles have a valid cycle path", () => {
    fc.assert(
      fc.property(
        fc.array(dagEdgeArbitrary(10), { minLength: 1, maxLength: 20 }),
        dagEdgeArbitrary(10),
        (existingEdges, newEdge) => {
          const adjacencyList = buildAdjacencyList(existingEdges);
          const result = detectCycle(adjacencyList, newEdge);

          if (result.hasCycle) {
            // The cycle path must have at least 2 elements.
            return result.cyclePath.length >= 2;
          }
          return true;
        }
      )
    );
  });
});
```

#### 2. Topological Sort Properties

```typescript
// packages/domain/src/tests/dag/topological-sort.property.test.ts
// Property-based tests for topological sort.
// Verifies ordering validity and determinism.

describe("Topological Sort — Property-Based Tests", () => {
  it("PROPERTY: every dependency appears before its dependent in the sorted output", () => {
    // Generate a random acyclic graph (by only accepting non-cyclic edges).
    // Run topological sort.
    // For every edge (A depends on B), verify B appears before A in the output.
    fc.assert(
      fc.property(
        generateRandomDag(20, 50),
        ({ edges, allNodeIds }) => {
          const adjacencyList = buildAdjacencyList(edges);
          const result = topologicalSort(adjacencyList, allNodeIds);

          if (!result.success) return false;

          const positionMap = new Map(
            result.sorted.map((id, index) => [id, index])
          );

          for (const edge of edges) {
            const fromPos = positionMap.get(edge.from)!;
            const toPos = positionMap.get(edge.to)!;
            // `to` (dependency) must come before `from` (dependent).
            if (toPos >= fromPos) return false;
          }

          return true;
        }
      ),
      { numRuns: 1000 }
    );
  });

  it("PROPERTY: all input nodes appear exactly once in the sorted output", () => {
    fc.assert(
      fc.property(
        generateRandomDag(20, 50),
        ({ edges, allNodeIds }) => {
          const adjacencyList = buildAdjacencyList(edges);
          const result = topologicalSort(adjacencyList, allNodeIds);

          if (!result.success) return false;

          return (
            result.sorted.length === allNodeIds.length &&
            new Set(result.sorted).size === allNodeIds.length
          );
        }
      )
    );
  });

  it("PROPERTY: topological sort is deterministic (same input produces same output)", () => {
    fc.assert(
      fc.property(
        generateRandomDag(15, 30),
        ({ edges, allNodeIds }) => {
          const adjacencyList = buildAdjacencyList(edges);
          const result1 = topologicalSort(adjacencyList, allNodeIds);
          const result2 = topologicalSort(adjacencyList, allNodeIds);

          if (!result1.success || !result2.success) return false;

          return JSON.stringify(result1.sorted) === JSON.stringify(result2.sorted);
        }
      )
    );
  });
});
```

#### 3. Derived Dependency Properties

```typescript
// packages/domain/src/tests/dag/derived-dependencies.property.test.ts
// Property-based tests for derived dependency computation.

describe("Derived Dependencies — Property-Based Tests", () => {
  it("PROPERTY: derived story graph is acyclic if task graph is acyclic", () => {
    // Generate a random acyclic task graph with story groupings.
    // Derive story dependencies.
    // Verify the derived story graph is also acyclic.
  });

  it("PROPERTY: derived epic graph is acyclic if story graph is acyclic", () => {
    // Generate a random acyclic story graph with epic groupings.
    // Derive epic dependencies.
    // Verify the derived epic graph is also acyclic.
  });

  it("PROPERTY: every derived story edge has at least one provenance edge", () => {
    // Verify that the edgeProvenance map has an entry for every
    // derived story dependency, and each entry has at least one
    // task-level edge.
  });

  it("PROPERTY: intra-story task edges never produce story-level dependencies", () => {
    // Generate task edges within the same story.
    // Verify no story-level dependencies are created.
  });
});
```

### Custom Arbitraries

Create reusable fast-check arbitraries for generating random DAGs, task groupings, and project structures:

```typescript
// packages/domain/src/tests/dag/arbitraries.ts
// Custom fast-check arbitraries for generating random DAG structures.
// Used across all property-based test files.

/**
 * Generate a random acyclic directed graph.
 * Strategy: generate random edges, keep only those that pass cycle detection.
 */
export function generateRandomDag(
  maxNodes: number,
  maxEdges: number
): fc.Arbitrary<{ edges: DagEdge[]; allNodeIds: string[] }> {
  // Implementation uses fc.array + fc.record to generate edge proposals,
  // then filters through cycle detection to guarantee acyclicity.
}
```

## Acceptance Criteria

- [ ] Property: "a DAG built only from accepted edges is always acyclic" — 1000+ random runs pass
- [ ] Property: "self-loops are always detected as cycles" — holds for all generated inputs
- [ ] Property: "every dependency appears before its dependent in topological sort output" — 1000+ random runs pass
- [ ] Property: "all input nodes appear exactly once in sorted output" — holds for all generated inputs
- [ ] Property: "topological sort is deterministic" — same input always produces same output
- [ ] Property: "derived story graph is acyclic if task graph is acyclic" — holds for all generated inputs
- [ ] Property: "derived epic graph is acyclic if story graph is acyclic" — holds for all generated inputs
- [ ] Property: "every derived edge has provenance" — holds for all generated inputs
- [ ] Property: "intra-story edges never produce story-level dependencies" — holds for all generated inputs
- [ ] Custom fast-check arbitraries generate valid random DAGs for testing
- [ ] All property tests run within reasonable time (< 30 seconds for 1000 runs each)
- [ ] `fast-check` is installed as a dev dependency in the domain package
- [ ] No `any` types used in test code — all arbitraries and assertions use specific types
- [ ] Tests are properly organized by module (cycle-detection, topological-sort, derived-dependencies)

## Technical Notes

- Install `fast-check` as a dev dependency: `pnpm add -D fast-check --filter @laila/domain`.
- Property-based tests with 1000 runs each provide high confidence but should complete in seconds. If tests are slow, reduce `maxNodes` or `maxEdges` in the arbitraries.
- The random DAG generator must guarantee acyclicity. The simplest approach is to generate edges with `from > to` (by index), which guarantees a DAG. A more thorough approach generates random edges and filters through cycle detection.
- Consider using `fc.assert` with `{ seed: ... }` for reproducible failures. When a property test fails, fast-check reports the seed so the failure can be reproduced.
- The `generateRandomDag` arbitrary should also produce disconnected graphs (not all nodes connected) to exercise that edge case.
- Consider adding a few example-based tests alongside property tests for specific known edge cases (empty graph, single node, long chain, wide fan-out, diamond pattern).

## References

- **Functional Requirements:** FR-DAG-009 (property-based testing), FR-TEST-002 (safety-critical test coverage)
- **Design Specification:** Section 5.1.8 (DAG Testing Strategy), Section 8.2 (Property-Based Testing)
- **Project Setup:** fast-check configuration, Vitest integration

## Estimated Complexity

Large — Property-based testing requires designing custom arbitraries for graph structures, formulating correct invariant properties, and ensuring the test generators produce diverse and meaningful inputs. The combination of multiple properties across three DAG modules makes this a substantial testing effort. However, it provides the strongest correctness guarantee for this safety-critical code.

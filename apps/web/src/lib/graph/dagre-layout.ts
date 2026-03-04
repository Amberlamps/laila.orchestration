/**
 * Computes node positions using @dagrejs/dagre for automatic DAG layout.
 *
 * Separates layout computation from rendering for testability and
 * potential Web Worker offloading for large graphs.
 *
 * @module dagre-layout
 */
import Dagre from '@dagrejs/dagre';

import type { Node, Edge } from '@xyflow/react';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Options for controlling the Dagre layout algorithm. */
export interface DagreLayoutOptions {
  /** Layout direction: "TB" (top-to-bottom) or "LR" (left-to-right). */
  direction?: 'TB' | 'LR';
  /** Width of each node in pixels. */
  nodeWidth?: number;
  /** Height of each node in pixels. */
  nodeHeight?: number;
  /** Vertical spacing between ranks (layers) in pixels. */
  rankSep?: number;
  /** Horizontal spacing between sibling nodes in pixels. */
  nodeSep?: number;
}

export const DEFAULT_OPTIONS: Required<DagreLayoutOptions> = {
  direction: 'TB',
  nodeWidth: 180,
  nodeHeight: 60,
  rankSep: 100,
  nodeSep: 50,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Computes Dagre layout for a set of ReactFlow nodes and edges.
 *
 * Algorithm:
 * 1. Creates a new Dagre directed graph.
 * 2. Configures graph direction and spacing options.
 * 3. Adds each node with the specified width and height.
 * 4. Adds each edge with source and target.
 * 5. Runs Dagre.layout() to compute positions.
 * 6. Returns nodes with updated positions and the original edges unchanged.
 *
 * @param nodes - ReactFlow nodes (positions will be overwritten).
 * @param edges - ReactFlow edges (returned unchanged).
 * @param options - Layout configuration overrides.
 * @returns Nodes with computed positions and original edges.
 */
export const computeDagreLayout = <T extends Record<string, unknown>>(
  nodes: Node<T>[],
  edges: Edge[],
  options?: DagreLayoutOptions,
): { nodes: Node<T>[]; edges: Edge[] } => {
  if (nodes.length === 0) {
    return { nodes: [], edges };
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };

  const graph = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

  graph.setGraph({
    rankdir: opts.direction,
    nodesep: opts.nodeSep,
    ranksep: opts.rankSep,
  });

  for (const node of nodes) {
    graph.setNode(node.id, {
      width: opts.nodeWidth,
      height: opts.nodeHeight,
    });
  }

  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }

  Dagre.layout(graph);

  const layoutedNodes = nodes.map((node) => {
    const dagreNode = graph.node(node.id) as { x: number; y: number };

    // Dagre positions are centered; ReactFlow positions are top-left.
    // Shift by half the node dimensions to align.
    return {
      ...node,
      position: {
        x: dagreNode.x - opts.nodeWidth / 2,
        y: dagreNode.y - opts.nodeHeight / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

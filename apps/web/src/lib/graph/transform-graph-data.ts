/**
 * Transforms API task dependency data into ReactFlow-compatible nodes and edges.
 *
 * This is a pure function with no side effects, making it easy to test
 * and potentially offload to a Web Worker for large graphs.
 *
 * @module transform-graph-data
 */
import {
  DEFAULT_EDGE_MARKER,
  DEFAULT_EDGE_STYLE,
  DEFAULT_EDGE_ZINDEX,
  IN_PROGRESS_EDGE_MARKER,
  IN_PROGRESS_EDGE_STYLE,
} from './edge-config';

import type { DependencyNodeData, GraphEntityType, ProjectGraphResponse } from './types';
import type { Node, Edge } from '@xyflow/react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maps entity types to custom ReactFlow node type identifiers. */
const NODE_TYPE_MAP: Record<GraphEntityType, string> = {
  epic: 'epicNode',
  story: 'storyNode',
  task: 'taskNode',
};

/** Statuses that indicate active in-progress work. */
const IN_PROGRESS_STATUSES = new Set(['in_progress', 'review']);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Converts the API graph response into ReactFlow node and edge arrays.
 *
 * - Each API node becomes a ReactFlow Node with custom data and an initial
 *   position of (0, 0) — positions are computed separately by Dagre.
 * - Each API edge becomes a ReactFlow Edge with smoothstep type, an arrow
 *   marker, and animation when the source node is in-progress.
 */
export const transformToGraphData = (
  apiData: ProjectGraphResponse,
): { nodes: Node[]; edges: Edge[] } => {
  // Build a lookup of node statuses for edge animation decisions
  const statusById = new Map<string, string>();
  for (const node of apiData.nodes) {
    statusById.set(node.id, node.status);
  }

  const nodes: Node[] = apiData.nodes.map((node) => {
    const data: DependencyNodeData = {
      label: node.label,
      status: node.status,
      entityType: node.entityType,
      entityId: node.id,
      parentName: node.parentName,
    };

    return {
      id: node.id,
      type: NODE_TYPE_MAP[node.entityType],
      position: { x: 0, y: 0 },
      data,
    };
  });

  const edges: Edge[] = apiData.edges.map((edge) => {
    const sourceStatus = statusById.get(edge.source) ?? '';
    const isInProgress = IN_PROGRESS_STATUSES.has(sourceStatus);

    return {
      id: `edge-${edge.source}-${edge.target}`,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      animated: isInProgress,
      style: isInProgress ? IN_PROGRESS_EDGE_STYLE : DEFAULT_EDGE_STYLE,
      markerEnd: isInProgress ? IN_PROGRESS_EDGE_MARKER : DEFAULT_EDGE_MARKER,
      zIndex: DEFAULT_EDGE_ZINDEX,
    };
  });

  return { nodes, edges };
};

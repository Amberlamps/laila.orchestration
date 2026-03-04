/**
 * Hook that highlights edges connected to a hovered or selected node.
 *
 * Returns a new edges array with updated styles based on node interaction
 * state. Uses useMemo to avoid recomputing on every render — only
 * recomputes when edges, hoveredNodeId, or selectedNodeId change.
 *
 * @module use-edge-highlight
 */
import { useMemo } from 'react';

import {
  DEFAULT_EDGE_MARKER,
  DEFAULT_EDGE_STYLE,
  DEFAULT_EDGE_ZINDEX,
  HIGHLIGHTED_EDGE_MARKER,
  HIGHLIGHTED_EDGE_STYLE,
  HIGHLIGHTED_EDGE_ZINDEX,
  HIGHLIGHTED_IN_PROGRESS_EDGE_STYLE,
  IN_PROGRESS_EDGE_MARKER,
  IN_PROGRESS_EDGE_STYLE,
} from '@/lib/graph/edge-config';

import type { Edge } from '@xyflow/react';

/**
 * Determines whether an edge is connected to the given node ID.
 */
const isEdgeConnected = (edge: Edge, nodeId: string): boolean =>
  edge.source === nodeId || edge.target === nodeId;

/**
 * Returns a new edges array with styles updated based on hover/selection state.
 *
 * - Edges connected to the hovered or selected node receive highlighted
 *   styling (indigo-500, 2px stroke, elevated z-index).
 * - In-progress edges (animated) connected to the active node get a wider
 *   stroke while keeping blue-500 color.
 * - All other edges receive default styling (zinc-300, 1.5px stroke).
 *
 * @param edges - The base edges array from the graph layout.
 * @param hoveredNodeId - ID of the currently hovered node, or null.
 * @param selectedNodeId - ID of the currently selected node, or null.
 * @returns A new edges array with updated style, markerEnd, and zIndex.
 */
export const useEdgeHighlight = (
  edges: Edge[],
  hoveredNodeId: string | null,
  selectedNodeId: string | null,
): Edge[] => {
  return useMemo(() => {
    const activeNodeId = hoveredNodeId ?? selectedNodeId;

    return edges.map((edge): Edge => {
      const isConnected = activeNodeId !== null && isEdgeConnected(edge, activeNodeId);
      const isAnimated = edge.animated === true;

      if (isConnected) {
        return {
          ...edge,
          style: isAnimated ? HIGHLIGHTED_IN_PROGRESS_EDGE_STYLE : HIGHLIGHTED_EDGE_STYLE,
          markerEnd: isAnimated ? IN_PROGRESS_EDGE_MARKER : HIGHLIGHTED_EDGE_MARKER,
          zIndex: HIGHLIGHTED_EDGE_ZINDEX,
        };
      }

      return {
        ...edge,
        style: isAnimated ? IN_PROGRESS_EDGE_STYLE : DEFAULT_EDGE_STYLE,
        markerEnd: isAnimated ? IN_PROGRESS_EDGE_MARKER : DEFAULT_EDGE_MARKER,
        zIndex: DEFAULT_EDGE_ZINDEX,
      };
    });
  }, [edges, hoveredNodeId, selectedNodeId]);
};

/**
 * Hook that manages graph view level state and computes the appropriate
 * node/edge set for the current view level.
 *
 * - "tasks": returns the original task nodes and edges.
 * - "stories": derives story-level nodes/edges from the task DAG.
 * - "epics": derives epic-level nodes/edges from the task DAG.
 *
 * Layout is NOT computed here — the caller is responsible for applying
 * Dagre layout after all filters have been applied.
 *
 * Uses useMemo to avoid recomputing derived views on every render.
 *
 * @module use-graph-view-level
 */
import { useMemo, useState } from 'react';

import { deriveEpicView, deriveStoryView } from '@/lib/graph/derive-view-levels';

import type { GraphViewLevel } from '@/lib/graph/derive-view-levels';
import type { DependencyNodeData } from '@/lib/graph/types';
import type { Edge, Node } from '@xyflow/react';

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

/** Return value of the useGraphViewLevel hook. */
interface UseGraphViewLevelResult {
  /** The current view level. */
  viewLevel: GraphViewLevel;
  /** Setter for the view level. */
  setViewLevel: (level: GraphViewLevel) => void;
  /** Nodes for the current view level (without Dagre positions). */
  displayNodes: Node<DependencyNodeData>[];
  /** Edges for the current view level. */
  displayEdges: Edge[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages view level state and computes display nodes/edges.
 *
 * When the view level is "tasks", the original nodes/edges are returned
 * directly. When "stories" or "epics", the corresponding derivation
 * function is called.
 *
 * Dagre layout is NOT applied here — the caller should apply layout
 * after all filters (status, epic) have been applied to avoid
 * recomputing layout multiple times.
 *
 * @param taskNodes - The task-level nodes (from transformToGraphData).
 * @param taskEdges - The task-level edges.
 * @returns View level state and computed display nodes/edges.
 */
export const useGraphViewLevel = (
  taskNodes: Node<DependencyNodeData>[],
  taskEdges: Edge[],
): UseGraphViewLevelResult => {
  const [viewLevel, setViewLevel] = useState<GraphViewLevel>('tasks');

  const { displayNodes, displayEdges } = useMemo(() => {
    if (viewLevel === 'tasks') {
      return { displayNodes: taskNodes, displayEdges: taskEdges };
    }

    const derived =
      viewLevel === 'stories'
        ? deriveStoryView(taskNodes, taskEdges)
        : deriveEpicView(taskNodes, taskEdges);

    return {
      displayNodes: derived.nodes as Node<DependencyNodeData>[],
      displayEdges: derived.edges,
    };
  }, [viewLevel, taskNodes, taskEdges]);

  return { viewLevel, setViewLevel, displayNodes, displayEdges };
};
